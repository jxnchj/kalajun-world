import * as THREE from "three";
import { decodeGzipBytes } from "./world-data.js";
import { SPRUCE_CANOPY_BUILD } from "./spruce-canopy-build.js";

export const CANOPY_CACHE_REVISION="indexed-spruce-canopy-v1";
export const CANOPY_FORMS=["column","edge","old","pencil","young"];
export const CANOPY_ATTRIBUTES={POSITION:"position",NORMAL:"normal",TEXCOORD_0:"uv",_PLANT_WIND:"_plant_wind",_CROWN_OCCLUSION:"_crown_occlusion",indices:null};
const TYPES={Float32Array,Uint16Array,Uint32Array};
const abort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException("Canopy loading aborted","AbortError");};
export const canopyCacheEnabled=()=>new URLSearchParams(globalThis.location?.search||"").get("canopyCache")==="1";
export async function canopyDigest(bytes){
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("");
}
export async function canopySourceDigests(gltf){
 const entries=await Promise.all(CANOPY_FORMS.map(async form=>{
  const name=form+"_frond",mesh=gltf.scene.getObjectByName(name);
  if(!mesh?.isMesh)throw new Error("Missing canopy source: "+name);
  const hashes=await Promise.all(Object.entries(CANOPY_ATTRIBUTES).map(async([key,attribute])=>{
   const a=attribute?mesh.geometry.getAttribute(attribute):mesh.geometry.index;
   if(!a||a.isInterleavedBufferAttribute)throw new Error("Unsupported canopy source attribute: "+name+"/"+key);
   return[key,await canopyDigest(a.array)];
  }));
  return[name,Object.fromEntries(hashes)];
 }));
 return Object.fromEntries(entries);
}
const equalDigests=(actual,expected)=>CANOPY_FORMS.every(form=>Object.keys(CANOPY_ATTRIBUTES).every(key=>actual?.[form+"_frond"]?.[key]===expected?.[form+"_frond"]?.[key]));
export function canopyFallback(stats,error){
 const message=String(error?.message||error);
 stats.status="fallback";stats.reason=message;(stats.warnings??=[]).push(message);
 console.warn("[spruce-canopy] "+message+"; using the original complete geometry algorithm.");
}

// Lossless packed typed arrays. Alignment padding is zero; no quantisation,
// mesh simplification, normal recomputation, or index reordering occurs here.
export function encodeCanopyParts(parts,metadata){
 const descriptors={},blocks=[];let offset=0;
 const add=a=>{
  if(a.isInterleavedBufferAttribute||!TYPES[a.array.constructor.name])throw new Error("Unsupported canopy attribute encoding");
  offset=Math.ceil(offset/4)*4;
  const descriptor={type:a.array.constructor.name,byteOffset:offset,length:a.array.length,itemSize:a.itemSize,normalized:a.normalized};
  const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength);blocks.push({offset,bytes});offset+=bytes.byteLength;return descriptor;
 };
 for(const[key,g]of Object.entries(parts)){
  if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingSphere)g.computeBoundingSphere();
  descriptors[key]={attributes:Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,add(a)])),index:g.index?add(g.index):null,
   bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray(),center:g.boundingSphere.center.toArray(),radius:g.boundingSphere.radius},
   userData:structuredClone(g.userData),groups:g.groups.map(x=>({...x})),drawRange:{start:g.drawRange.start,count:Number.isFinite(g.drawRange.count)?g.drawRange.count:null}};
 }
 const data=new Uint8Array(offset);for(const b of blocks)data.set(b.bytes,b.offset);
 return{data,manifest:{...metadata,revision:CANOPY_CACHE_REVISION,decodedBytes:offset,parts:descriptors}};
}

export class SpruceCanopyCache{
 constructor(manifest,data,{stats={}}={}){
  if(manifest?.revision!==CANOPY_CACHE_REVISION)throw new Error("Canopy cache version mismatch");
  if(!(data instanceof Uint8Array)||data.byteLength!==manifest.decodedBytes||data.byteOffset%4)throw new Error("Canopy cache byte size/alignment mismatch");
  const keys=["hi","mid","near"].flatMap(lod=>CANOPY_FORMS.map(form=>lod+":"+form+"_frond"));
  if(JSON.stringify(Object.keys(manifest.parts||{}).sort())!==JSON.stringify(keys.sort()))throw new Error("Canopy cache must preserve all 15 foliage parts");
  this.manifest=manifest;this.data=data;this.stats=stats;this.disabled=false;this.verified=new Map();this.recipeVerified=false;
  Object.assign(stats,{status:"loaded",decodedBytes:data.byteLength,usedParts:[],boundBytes:0,bindMs:0,sourceVerifyMs:0});
  for(const part of Object.values(manifest.parts)){
   for(const[n,width]of Object.entries({position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1})){
    if(part.attributes?.[n]?.itemSize!==width||part.attributes[n].type!=="Float32Array")throw new Error("Invalid canopy attribute: "+n);
   }
   const count=part.attributes.position.length/3;
   for(const descriptor of Object.values(part.attributes))if(descriptor.length/descriptor.itemSize!==count)throw new Error("Canopy attribute vertex counts differ");
   for(const descriptor of[...Object.values(part.attributes),part.index].filter(Boolean))this.array(descriptor);
   if(!part.index||part.index.itemSize!==1||!["Uint16Array","Uint32Array"].includes(part.index.type))throw new Error("Canopy cache must retain its original index");
   const indices=this.array(part.index);for(const index of indices)if(index>=count)throw new Error("Canopy index outside vertex buffer");
   if(![...part.bounds.min,...part.bounds.max,...part.bounds.center,part.bounds.radius].every(Number.isFinite)||part.bounds.radius<0)throw new Error("Invalid canopy bounds");
  }
 }
 array(d){
  const Type=TYPES[d?.type],bytes=Type?.BYTES_PER_ELEMENT;
  if(!Type||!Number.isInteger(d.byteOffset)||!Number.isInteger(d.length)||d.length<0||d.byteOffset<0||d.byteOffset%bytes||d.byteOffset+d.length*bytes>this.data.byteLength)throw new Error("Canopy buffer range/type mismatch");
  return new Type(this.data.buffer,this.data.byteOffset+d.byteOffset,d.length);
 }
 async verifySource(lod,gltf){
  if(!["hi","mid"].includes(lod))throw new Error("Unknown canopy source LOD");
  const previous=this.verified.get(lod);
  if(previous){if(previous.gltf!==gltf)throw new Error("Canopy source identity changed");return previous.promise;}
  const started=performance.now();
  const promise=canopySourceDigests(gltf).then(actual=>{
   if(!equalDigests(actual,this.manifest.sourceDigests?.[lod]))throw new Error("Canopy "+lod+" input fingerprint mismatch");
   previousEntry.ready=true;
  }).finally(()=>{this.stats.sourceVerifyMs+=performance.now()-started;});
  const previousEntry={gltf,promise,ready:false};this.verified.set(lod,previousEntry);return promise;
 }
 async verifyRecipe(bytes,contract){
  if(JSON.stringify(contract)!==JSON.stringify(this.manifest.nearContract)||await canopyDigest(bytes)!==this.manifest.recipeDigest)throw new Error("Canopy needle recipe/branch contract mismatch");
  this.recipeVerified=true;
 }
 disable(error){this.disabled=true;canopyFallback(this.stats,error);}
 createGeometry(lod,name){
  const started=performance.now();
  if(this.disabled||!this.verified.get(lod==="near"?"hi":lod)?.ready||(lod==="near"&&!this.recipeVerified))throw new Error("Canopy source must be verified before binding geometry");
  const key=lod+":"+name,d=this.manifest.parts[key];if(!d)throw new Error("Missing cached canopy: "+key);
  const g=new THREE.BufferGeometry();let bytes=0;
  for(const[n,a]of Object.entries(d.attributes)){const data=this.array(a);g.setAttribute(n,new THREE.BufferAttribute(data,a.itemSize,a.normalized));bytes+=data.byteLength;}
  const index=this.array(d.index);g.setIndex(new THREE.BufferAttribute(index,1));bytes+=index.byteLength;
  g.boundingBox=new THREE.Box3(new THREE.Vector3(...d.bounds.min),new THREE.Vector3(...d.bounds.max));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(...d.bounds.center),d.bounds.radius);
  g.groups=d.groups.map(x=>({...x}));g.drawRange={start:d.drawRange.start,count:d.drawRange.count??Infinity};g.userData=structuredClone(d.userData);
  this.stats.usedParts.push(key);this.stats.boundBytes+=bytes;this.stats.bindMs+=performance.now()-started;this.stats.status="active";
  return g;
 }
 applyVolume(hi,mid){
  const report={enabled:true,forms:{},addedTriangles:0,geometryBytes:0};
  for(const[gltf,lod]of[[hi,"hi"],[mid,"mid"]])for(const form of CANOPY_FORMS){
   const mesh=gltf.scene.getObjectByName(form+"_frond"),g=this.createGeometry(lod,form+"_frond");mesh.geometry=g;
   const record={...g.userData};report.forms[lod+":"+mesh.name]=record;report.addedTriangles+=record.triangles-record.sourceTriangles;
   report.geometryBytes+=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+g.index.array.byteLength;
  }
  return report;
 }
}

export async function loadSpruceCanopyCache({url="./assets/v2/spruce-canopy-v1.json",fetchImpl=fetch,signal,stats={},build=SPRUCE_CANOPY_BUILD}={}){
 const started=performance.now();abort(signal);
 if(!build?.inputKey||!build.manifestDigest)throw new Error("Precomputed canopy package has not been generated for this build");
 let t=performance.now();const response=await fetchImpl(url,{signal});if(!response.ok)throw new Error("Canopy manifest HTTP "+response.status);
 const manifestBytes=new Uint8Array(await response.arrayBuffer());abort(signal);
 if(await canopyDigest(manifestBytes)!==build.manifestDigest)throw new Error("Canopy manifest differs from this build");
 const manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
 if(manifest.inputKey!==build.inputKey)throw new Error("Canopy build inputs differ");
 if(!/^[a-zA-Z0-9_.-]+\.bin\.gz$/.test(manifest.payload?.file||""))throw new Error("Invalid canopy payload name");
 stats.manifestMs=performance.now()-t;t=performance.now();
 const binaryURL=url.slice(0,url.lastIndexOf("/")+1)+manifest.payload.file,binary=await fetchImpl(binaryURL,{signal});
 if(!binary.ok)throw new Error("Canopy payload HTTP "+binary.status);
 const transport=new Uint8Array(await binary.arrayBuffer());abort(signal);stats.fetchMs=performance.now()-t;stats.responseBodyBytes=transport.byteLength;stats.compressedAssetBytes=manifest.payload.compressedBytes;stats.manifestBytes=manifestBytes.byteLength;
 t=performance.now();const data=await decodeGzipBytes(transport);abort(signal);stats.decodeMs=performance.now()-t;
 t=performance.now();if(await canopyDigest(data)!==manifest.payload.digest)throw new Error("Canopy payload fingerprint mismatch");abort(signal);
 const cache=new SpruceCanopyCache(manifest,data,{stats});stats.validateMs=performance.now()-t;stats.loadMs=performance.now()-started;return cache;
}
