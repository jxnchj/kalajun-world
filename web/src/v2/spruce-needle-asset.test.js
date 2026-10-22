import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {inflateSync,gunzipSync} from "node:zlib";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {createSpruceLoader,SpruceGeometryPool} from "./spruce-loading.js";
await MeshoptDecoder.ready;
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {reuseNeedleTextures} from "./spruce-textures.js";

const ROOT=new URL("../../../",import.meta.url);
const file=path=>readFile(new URL(path,ROOT));
const FORMS=["column","edge","old","pencil","young"],PARTS=["bark","core","frond"];
const CENTRES=[[557.5,376.5],[381.5,607.5],[563.5,679.5],[563.5,442.5],[558.5,393.5]];
const SHAPED={column:115,edge:119,old:65,pencil:72,young:92};
const INNER={column:182,edge:184,old:81,pencil:91,young:142};
const EXPECTED={column:490466,edge:500750,old:245500,pencil:272370,young:386670};
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");

function glb(bytes){
 if(bytes[0]===0x1f&&bytes[1]===0x8b)bytes=gunzipSync(bytes);
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 let json,binary;const cache=new Map();
 for(let at=12;at<bytes.length;){
  const size=bytes.readUInt32LE(at),kind=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+size);
  assert.equal(chunk.length,size);
  if(kind===0x4e4f534a)json=JSON.parse(chunk.toString("utf8"));
  if(kind===0x004e4942)binary=chunk;
  at+=size+8;
 }
 assert.ok(json&&binary);assert.equal(json.asset.version,"2.0");
 const decodedViews=new Map();
 function bufferView(index){
  if(decodedViews.has(index))return decodedViews.get(index);
  const v=json.bufferViews[index],ext=v.extensions?.EXT_meshopt_compression;let bytes;
  if(ext){
   assert.equal(ext.filter,"NONE");assert.ok(ext.mode==="ATTRIBUTES"||ext.mode==="INDICES");
   bytes=Buffer.alloc(ext.count*ext.byteStride);
   MeshoptDecoder.decodeGltfBuffer(bytes,ext.count,ext.byteStride,binary.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);
  }else{assert.equal(v.buffer,0);bytes=binary.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);}
  assert.equal(bytes.length,v.byteLength);decodedViews.set(index,bytes);return bytes;
 }
 function accessor(index){
  if(cache.has(index))return cache.get(index);
  const a=json.accessors[index],v=json.bufferViews[a.bufferView];
  assert.equal(a.sparse,undefined);const buffer=bufferView(a.bufferView);
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType];
  assert.ok(components&&Type);const size=Type.BYTES_PER_ELEMENT,width=components*size,stride=v.byteStride||width;
  const start=a.byteOffset||0;
  assert.ok(start+(a.count-1)*stride+width<=v.byteLength);
  let values;
  if(stride===width&&(buffer.byteOffset+start)%size===0)values=new Type(buffer.buffer,buffer.byteOffset+start,a.count*components);
  else{
   values=new Type(a.count*components);
   const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
   for(let i=0;i<a.count;i++)for(let c=0;c<components;c++){
    const offset=start+i*stride+c*size;
    values[i*components+c]=a.componentType===5126?view.getFloat32(offset,true):a.componentType===5125?view.getUint32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint8(offset);
   }
  }
  const out={...a,components,values,bytes:Buffer.from(values.buffer,values.byteOffset,values.byteLength)};
  cache.set(index,out);return out;
 }
 const primitive=name=>{
  const mesh=json.meshes.find(m=>m.name===name);assert.ok(mesh,name);assert.equal(mesh.primitives.length,1);
  return mesh.primitives[0];
 };
 const embedded=index=>{
  const image=json.images[index];assert.equal(image.mimeType,"image/png");assert.equal(image.uri,undefined);
  return bufferView(image.bufferView);
 };
 return{json,binary,bytes,accessor,primitive,embedded,bufferView};
}
function png(bytes){
 assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 let width,height,channels;const chunks=[];
 for(let at=8;at<bytes.length;){
  const size=bytes.readUInt32BE(at),tag=bytes.toString("ascii",at+4,at+8),data=bytes.subarray(at+8,at+8+size);
  if(tag==="IHDR"){
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);
   assert.equal(data[8],8);assert.equal(data[12],0);
   channels=data[9]===6?4:data[9]===2?3:0;assert.ok(channels,"RGB/RGBA PNG required");
  }
  if(tag==="IDAT")chunks.push(data);at+=size+12;
 }
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 assert.equal(raw.length,height*(stride+1));
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){
  const f=raw[y*(stride+1)];assert.ok(f<=4);
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
   pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][f])&255;
  }
 }
 return{width,height,channels,pixels};
}
function alphaLevels(image,quantize){
 let {width,height}=image;
 let alpha=Float64Array.from({length:width*height},(_,i)=>image.channels===4?image.pixels[i*4+3]/255:1);
 const levels=[];
 for(let level=0;level<=4;level++){
  levels.push({width,height,alpha});
  if(level===4||width===1&&height===1)break;
  const w=Math.max(1,width>>1),h=Math.max(1,height>>1),next=new Float64Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let sum=0,count=0;
   for(let dy=0;dy<(height>1?2:1);dy++)for(let dx=0;dx<(width>1?2:1);dx++){sum+=alpha[(y*2+dy)*width+x*2+dx];count++;}
   next[y*w+x]=quantize?Math.round(sum/count*255)/255:sum/count;
  }
  width=w;height=h;alpha=next;
 }
 return levels;
}
function alphaSupportMinimum(level,bounds){
 const {width,height,alpha}=level,wrap=(x,n)=>(x%n+n)%n;let min=1;
 // GLB UVs already use the image's top-down coordinates. Bilinear and
 // trilinear interpolation cannot be below this conservative support minimum.
 for(let y=Math.floor(bounds[1]*height-.5);y<=Math.floor(bounds[3]*height-.5)+1;y++)
  for(let x=Math.floor(bounds[0]*width-.5);x<=Math.floor(bounds[2]*width-.5)+1;x++)
   min=Math.min(min,alpha[wrap(y,height)*width+wrap(x,width)]);
 return min;
}
function compactPatch(uv,a,b,c){
 const xs=[uv[a*2]*2048,uv[b*2]*2048,uv[c*2]*2048],ys=[uv[a*2+1]*1024,uv[b*2+1]*1024,uv[c*2+1]*1024];
 const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 if(bounds[2]-bounds[0]>.61||bounds[3]-bounds[1]>.61)return null;
 const x=(bounds[0]+bounds[2])/2,y=(bounds[1]+bounds[3])/2;
 const patch=CENTRES.findIndex(p=>Math.abs(p[0]-x)<.01&&Math.abs(p[1]-y)<.01);
 assert.ok(patch>=0,"compact triangle outside the verified opaque colour patches");
 const determinant=(uv[b*2]-uv[a*2])*(uv[c*2+1]-uv[a*2+1])-(uv[c*2]-uv[a*2])*(uv[b*2+1]-uv[a*2+1]);
 assert.ok(Math.abs(determinant)>1e-12,"zero/unstable UV area breaks tangent-space normals");
 return{patch,bounds:bounds.map((v,i)=>v/(i%2?1024:2048))};
}
let pending;
function resources(){
 return pending??=Promise.all([
  file("assets/src/v2/spruce/inner-v7/exports/schrenk-spruce-needle.glb.gz"),
  file("web/public/assets/v2/schrenk-spruce-hi.glb"),
  file("assets/src/v2/spruce/needle-volume-report.json"),
  file("assets/src/v2/spruce/needle-export-report.json"),
  file("assets/src/v2/spruce/shared-skeleton.json")
 ]).then(([needle,hi,report,counts,skeleton])=>({near:glb(needle),hi:glb(hi),report:JSON.parse(report),counts:JSON.parse(counts),skeleton:JSON.parse(skeleton)}));
}
const triangles=(asset,p)=>asset.accessor(p.indices).count/3;
test("needle verification catches constant UVs and transparent bilinear neighbours",()=>{
 const uv=new Float32Array([557.5/2048,376.5/1024,557.5/2048,376.5/1024,557.5/2048,376.5/1024]);
 assert.throws(()=>compactPatch(uv,0,1,2),/UV area/);
 const level={width:4,height:4,alpha:Float64Array.from({length:16},()=>1)};
 level.alpha[6]=0;assert.equal(alphaSupportMinimum(level,[.375,.375,.4,.4]),0);
 level.alpha[6]=1;level.alpha[14]=0;assert.equal(alphaSupportMinimum(level,[.375,.375,.4,.4]),1,"do not invert glTF V a second time");
});
test("accepted hi has no tiny-patch needle triangles; classifier cannot reinterpret old fans",async()=>{
 const asset=glb(await file("web/public/assets/v2/schrenk-spruce-hi.glb"));
 for(const form of FORMS){
  const p=asset.primitive(form+"_frond"),uv=asset.accessor(p.attributes.TEXCOORD_0).values,index=asset.accessor(p.indices).values;
  for(let i=0;i<index.length;i+=3)assert.equal(compactPatch(uv,index[i],index[i+1],index[i+2]),null);
 }
});
test("formal needle GLB retains five forms, three parts, finite wind/AO and valid indexed geometry",async()=>{
 const {near}=await resources();assert.equal(near.json.meshes.length,15);assert.equal(near.json.materials.length,3);
 assert.deepEqual(near.json.meshes.map(m=>m.name).sort(),FORMS.flatMap(f=>PARTS.map(p=>f+"_"+p)).sort());
 for(const mesh of near.json.meshes){
  const p=near.primitive(mesh.name);assert.equal(p.mode??4,4);
  const count=near.accessor(p.attributes.POSITION).count;
  for(const [name,type]of Object.entries({POSITION:"VEC3",NORMAL:"VEC3",TEXCOORD_0:"VEC2",_PLANT_WIND:"VEC3",_CROWN_OCCLUSION:"SCALAR"})){
   assert.ok(p.attributes[name]!==undefined,mesh.name+"/"+name);
   const attribute=near.accessor(p.attributes[name]);assert.equal(attribute.count,count);assert.equal(attribute.type,type);assert.equal(attribute.componentType,5126);
   for(const value of attribute.values)assert.ok(Number.isFinite(value),mesh.name+"/"+name);
  }
  const wind=near.accessor(p.attributes._PLANT_WIND).values,ao=near.accessor(p.attributes._CROWN_OCCLUSION).values,normal=near.accessor(p.attributes.NORMAL).values;
  for(let i=0;i<count;i++){
   assert.ok(wind[i*3]>=0&&wind[i*3]<=1.1&&wind[i*3+1]>=0&&wind[i*3+1]<=.56,mesh.name+" wind range");
   assert.ok(ao[i]>=0&&ao[i]<=1,mesh.name+" AO range");
   assert.ok(Math.abs(Math.hypot(normal[i*3],normal[i*3+1],normal[i*3+2])-1)<1e-5,mesh.name+" unit normal");
  }
  const indices=near.accessor(p.indices);assert.equal(indices.count%3,0);
  for(const index of indices.values)assert.ok(index<count);
 }
});
test("formal needle asset preserves original bark/core accessors, transforms, textures and alpha cutoff",async()=>{
 const {near,hi}=await resources();
 assert.deepEqual(near.json.materials,hi.json.materials);assert.deepEqual(near.json.samplers,hi.json.samplers);assert.deepEqual(near.json.textures,hi.json.textures);
 assert.equal(near.json.images.length,hi.json.images.length);
 for(let i=0;i<hi.json.images.length;i++)assert.equal(digest(near.embedded(i)),digest(hi.embedded(i)),"embedded texture "+i);
 const leaf=near.json.materials.find(m=>m.name==="frond");
 assert.equal(leaf.alphaMode,"MASK");assert.ok(Math.abs(leaf.alphaCutoff-.45)<1e-6);assert.equal(leaf.doubleSided,true);assert.ok(leaf.normalTexture);
 for(const form of FORMS)for(const part of PARTS){
  const name=form+"_"+part;
  const beforeNode=hi.json.nodes.find(n=>hi.json.meshes[n.mesh]?.name===name),afterNode=near.json.nodes.find(n=>near.json.meshes[n.mesh]?.name===name);
  for(const key of ["matrix","translation","rotation","scale"])assert.deepEqual(afterNode[key],beforeNode[key],name+"/"+key);
  if(part==="frond")continue;
  const a=hi.primitive(name),b=near.primitive(name);assert.deepEqual(Object.keys(b.attributes).sort(),Object.keys(a.attributes).sort());
  for(const name of ["indices",...Object.keys(a.attributes)]){
   const old=hi.accessor(name==="indices"?a.indices:a.attributes[name]),now=near.accessor(name==="indices"?b.indices:b.attributes[name]);
   assert.deepEqual([now.count,now.componentType,now.type,now.normalized],[old.count,old.componentType,old.type,old.normalized]);
   assert.equal(digest(now.bytes),digest(old.bytes),form+"/"+part+"/"+name+" changed");
  }
 }
});
test("formal needle counts retain all old clusters and explain the actual four-root near cost",async t=>{
 const {near,hi,report,counts,skeleton}=await resources(),actual={};
 assert.equal(report.revision,"inner-brushes-v7");
 for(const form of FORMS){
  const r=report.variants[form],clusters=skeleton.clusters[form],shaped=clusters.filter(c=>c.id.endsWith(":tip")&&c.origin[2]<10).length;
  assert.equal(shaped,SHAPED[form]);assert.equal(r.shapedClusters,shaped);assert.equal(r.totalClusters,clusters.length);
  const inner=clusters.filter(c=>c.role==="inner"&&c.origin[2]<8).length;assert.equal(inner,INNER[form]);assert.equal(r.innerShapedClusters,inner);assert.equal(r.brushInstances.length,shaped+inner);
  assert.equal(r.needleFaces,1);assert.equal(r.sideShootPairs,6);assert.equal(r.sideNeedleStations,22);assert.equal(r.centralNeedleStations,24);assert.equal(r.needlesPerStation,5);
  assert.equal(r.solidNeedles,(shaped+inner)*(12*22*5+24*5));
  assert.deepEqual(r.trianglesByCluster,clusters.map(c=>(c.id.endsWith(":tip")&&c.origin[2]<10)||(c.role==="inner"&&c.origin[2]<8)?1596:c.role==="inner"?6:10));
  assert.equal(r.beforeTriangles,triangles(hi,hi.primitive(form+"_frond")));
  assert.equal(r.afterTriangles,r.trianglesByCluster.reduce((a,b)=>a+b,0));
  assert.equal(r.afterTriangles,triangles(near,near.primitive(form+"_frond")));
  actual[form]=PARTS.reduce((sum,part)=>sum+triangles(near,near.primitive(form+"_"+part)),0);
  const before=PARTS.reduce((sum,part)=>sum+triangles(hi,hi.primitive(form+"_"+part)),0);
  assert.equal(actual[form],before+shaped*(1596-10)+inner*(1596-6));
 }
 assert.deepEqual(actual,EXPECTED);assert.deepEqual(counts,EXPECTED);
 // Actual active roots at river-forest: 2 pencil (inside 9 m), 1 edge + 1 old
 // (9–15 m blend). Count before frustum/shadow passes, not a GPU prediction.
 const active=2*actual.pencil+actual.edge+actual.old,removedHi=2*PARTS.reduce((sum,p)=>sum+triangles(hi,hi.primitive("pencil_"+p)),0);
 assert.equal(active,1290990);assert.equal(active-removedHi,1264014);
 t.diagnostic(JSON.stringify({triangles:actual,totalSourceTriangles:Object.values(actual).reduce((a,b)=>a+b,0),fourActiveRootsTriangles:active,additionalMainPassSourceTriangles:active-removedHi,glbBytes:near.bytes.length}));
});
test("all new needle/wood triangles have real UV area and alpha-safe bilinear/trilinear support through mip 4",async t=>{
 const {near}=await resources(),material=near.json.materials.find(m=>m.name==="frond");
 const image=png(near.embedded(near.json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source));
 assert.equal(image.width,2048);assert.equal(image.height,1024);assert.equal(image.channels,4);
 const boxes=CENTRES.map(()=>[Infinity,Infinity,-Infinity,-Infinity]);let checked=0;
 for(const form of FORMS){
  const p=near.primitive(form+"_frond"),uv=near.accessor(p.attributes.TEXCOORD_0).values,index=near.accessor(p.indices).values,pos=near.accessor(p.attributes.POSITION).values;
  let needles=0,wood=0;
  for(let i=0;i<index.length;i+=3){
   const a=index[i],b=index[i+1],c=index[i+2],patch=compactPatch(uv,a,b,c);if(!patch)continue;
   const bounds=boxes[patch.patch];for(let k=0;k<4;k++)bounds[k]=k<2?Math.min(bounds[k],patch.bounds[k]):Math.max(bounds[k],patch.bounds[k]);
   const ab=[0,1,2].map(k=>pos[b*3+k]-pos[a*3+k]),ac=[0,1,2].map(k=>pos[c*3+k]-pos[a*3+k]);
   const twiceArea=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
   assert.ok(twiceArea>1e-12,"degenerate physical needle/wood triangle");
   if(patch.patch===4)wood++;else needles++;checked++;
  }
  assert.equal(needles,(SHAPED[form]+INNER[form])*1440,form+" actual needle triangles");assert.equal(wood,(SHAPED[form]+INNER[form])*156,form+" actual wood triangles");
 }
 let minimum=1;
 for(const quantize of [false,true])for(const [mip,level]of alphaLevels(image,quantize).entries())for(const [patch,bounds]of boxes.entries()){
  const value=alphaSupportMinimum(level,bounds);minimum=Math.min(minimum,value);
  assert.ok(value>material.alphaCutoff,"opaque needle patch "+patch+" alpha fails mip "+mip+": "+value);
 }
 t.diagnostic(checked+" new triangles; minimum conservative alpha "+minimum.toFixed(6)+" > 0.45 through mip 4; extreme anisotropic footprints still require browser inspection");
});
test("Three GLTFLoader imports the custom attributes and shares only proven duplicate hi/needle textures",async t=>{
 const {near,hi}=await resources(),allTextures=new Set();
 async function load(asset){
  const loader=createSpruceLoader(),textures=new Map();
  // Node lacks a DOM decoder. Decode actual embedded PNGs, while keeping
  // Three's real buffers/accessors/meshes/materials and parser associations.
  loader.register(parser=>({name:"NODE_NEEDLE_PNG",loadTexture(index){
   if(!textures.has(index)){
    const def=asset.json.textures[index],image=png(asset.embedded(def.source)),texture=new THREE.DataTexture(image.pixels,image.width,image.height,image.channels===4?THREE.RGBAFormat:THREE.RGBFormat);
    texture.flipY=false;texture.generateMipmaps=true;textures.set(index,texture);allTextures.add(texture);parser.associations.set(texture,{textures:index});
   }
   return Promise.resolve(textures.get(index));
  }}));
  return loader.parseAsync(asset.bytes.buffer.slice(asset.bytes.byteOffset,asset.bytes.byteOffset+asset.bytes.byteLength),"");
 }
 const [nearGLTF,hiGLTF]=await Promise.all([load(near),load(hi)]);
 const meshes=[];nearGLTF.scene.traverse(object=>{if(object.isMesh)meshes.push(object);});assert.equal(meshes.length,15);
 const materials=new Set(),oldTextures=new Set(),geometryPool=new SpruceGeometryPool();
 for(const mesh of meshes){
  assert.ok(mesh.geometry.attributes._plant_wind);assert.ok(mesh.geometry.attributes._crown_occlusion);
  assert.equal(mesh.geometry.attributes._plant_wind.count,mesh.geometry.attributes.position.count);
  assert.equal(mesh.geometry.attributes._crown_occlusion.count,mesh.geometry.attributes.position.count);
  if(mesh.name.endsWith("_frond")){assert.equal(mesh.material.side,THREE.DoubleSide);assert.ok(Math.abs(mesh.material.alphaTest-.45)<1e-6);assert.ok(mesh.material.normalMap);}
  else assert.equal(mesh.material.alphaTest,0);
  materials.add(mesh.material);for(const v of Object.values(mesh.material))if(v?.isTexture)oldTextures.add(v);
 }
 assert.equal(materials.size,3);assert.equal(oldTextures.size,3);
 let disposed=0;for(const texture of oldTextures)texture.addEventListener("dispose",()=>disposed++);
 const reuse=await reuseNeedleTextures(hiGLTF,nearGLTF);assert.equal(reuse.releasedTextures,3);assert.equal(disposed,3);
 for(const mesh of meshes){
  const source=hiGLTF.scene.getObjectByName(mesh.name);assert.ok(source);
  for(const slot of ["map","normalMap"])if(mesh.material[slot])assert.strictEqual(mesh.material[slot],source.material[slot]);
 }
 t.diagnostic("actual identical-image reuse: "+JSON.stringify(reuse));
 for(const form of FORMS)for(const part of ["bark","core"]){
  const old=hiGLTF.scene.getObjectByName(form+"_"+part).geometry,now=nearGLTF.scene.getObjectByName(form+"_"+part).geometry;
  geometryPool.adopt(form,part,old);assert.strictEqual(geometryPool.adopt(form,part,now),old);
 }
 assert.equal(geometryPool.stats.reusedGeometries,10);t.diagnostic("actual hi/needle shared VBO bytes: "+JSON.stringify(geometryPool.stats));
 for(const scene of [nearGLTF.scene,hiGLTF.scene])scene.traverse(o=>{if(o.isMesh){materials.add(o.material);o.geometry.dispose();}});
 for(const material of materials)material.dispose();for(const texture of allTextures)if(!oldTextures.has(texture))texture.dispose();
});

const BACKUP="assets/src/v2/spruce/backup-20261019-222020-before-inner-crown/";
test("gzip and meshopt retain every original export buffer byte without filters or reorder",async t=>{
 const {near}=await resources(),report=JSON.parse(await file("assets/src/v2/spruce/needle-compression-report.json")),transport=await file("assets/src/v2/spruce/inner-v7/exports/schrenk-spruce-needle.glb.gz");
 assert.equal(report.quantized,false);assert.equal(report.reordered,false);
 assert.equal(digest(near.bytes),report.compressedSha256);assert.equal(transport.length,report.transportBytes);
 for(const v of report.views){assert.equal(near.bufferView(v.view).length,v.decodedBytes);assert.equal(digest(near.bufferView(v.view)),v.sha256);}
 assert.ok(transport.length<120202908*.67,"real delivered bytes should fall by at least one third despite the added inner geometry");
 t.diagnostic(JSON.stringify({transport:transport.length,meshopt:near.bytes.length,expanded:report.sourceBytes,views:report.views.length}));
});
test("inner refinement preserves all existing terminal needles, phase and other unchanged cluster samples exactly",async()=>{
 const {near,report}=await resources(),old=glb(await file(BACKUP+"web/public/assets/v2/schrenk-spruce-needle.glb")),prior=JSON.parse(await file(BACKUP+"assets/src/v2/spruce/needle-volume-report.json"));
 for(const form of FORMS){
  const a=old.primitive(form+"_frond"),b=near.primitive(form+"_frond"),ia=old.accessor(a.indices).values,ib=near.accessor(b.indices).values;
  const attributes=Object.keys(a.attributes).map(key=>[key,old.accessor(a.attributes[key]),near.accessor(b.attributes[key])]);
  let at=0,bt=0;
  for(let cluster=0;cluster<prior.variants[form].trianglesByCluster.length;cluster++){
   const na=prior.variants[form].trianglesByCluster[cluster]*3,nb=report.variants[form].trianglesByCluster[cluster]*3;
   if(na===nb)for(const [key,x,y]of attributes)for(let i=0;i<na;i++)for(let c=0;c<x.components;c++)
    assert.equal(y.values[ib[bt+i]*x.components+c],x.values[ia[at+i]*x.components+c],form+" "+key+" unchanged cluster "+cluster);
   at+=na;bt+=nb;
  }
  assert.equal(at,ia.length);assert.equal(bt,ib.length);
 }
});
