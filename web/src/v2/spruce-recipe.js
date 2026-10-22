import * as THREE from "three";
import {decodeGzipBytes} from "./world-data.js";
import {buildRecipeFrond} from "./spruce-brush.js";
const FORMS=["column","edge","old","pencil","young"],WIDTHS={position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1};
const aborted=signal=>{if(signal?.aborted)throw new DOMException("Spruce recipe loading aborted","AbortError");};
export function validateSpruceRecipe(recipe){
 if(recipe?.revision!=="spruce-brush-recipe-v1"||recipe.geometryRevision!=="inner-brushes-v7"||JSON.stringify(Object.keys(recipe.forms||{}).sort())!==JSON.stringify(FORMS))throw new Error("Unsupported spruce brush recipe");
 for(const name of FORMS){
  const f=recipe.forms[name];if(!Array.isArray(f.instances)||!Array.isArray(f.sourceTriangles)||!Array.isArray(f.trianglesByCluster)||f.sourceTriangles.length!==f.trianglesByCluster.length||f.sourceTriangles.length>2000)throw new Error("Invalid spruce source topology: "+name);
  const seen=new Set();
  for(const r of f.instances){
   if(!Number.isInteger(r.cluster)||r.cluster<0||r.cluster>=f.sourceTriangles.length||seen.has(r.cluster)||![1,2].includes(r.segments)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||!(r.width>0&&r.width<2)||r.controls?.length!==r.segments*2||r.controls.some(p=>p.length!==4||p.some(v=>v.length!==7||v.some(x=>!Number.isFinite(x)))))throw new Error("Invalid spruce brush controls: "+name);
   seen.add(r.cluster);
  }
  for(let i=0;i<f.sourceTriangles.length;i++)if(![6,10].includes(f.sourceTriangles[i])||f.trianglesByCluster[i]!== (seen.has(i)?1596:f.sourceTriangles[i]))throw new Error("Invalid spruce triangle contract: "+name);
 }
 return recipe;
}
const digest=async array=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",array)),x=>x.toString(16).padStart(2,"0")).join("");
export async function validateSpruceRecipeSource(hi,recipe){
 for(const form of FORMS){
  const name=form+"_frond",mesh=hi.scene.getObjectByName(name),expected=recipe.sourceDigests?.[name];
  if(!mesh?.isMesh||!expected)throw new Error("Missing spruce recipe source signature: "+name);
  for(const [key,attribute]of Object.entries({POSITION:"position",NORMAL:"normal",TEXCOORD_0:"uv",_PLANT_WIND:"_plant_wind",_CROWN_OCCLUSION:"_crown_occlusion",indices:null})){
   const a=attribute?mesh.geometry.attributes[attribute]:mesh.geometry.index;
   if(!a||a.isInterleavedBufferAttribute||await digest(a.array)!==expected[key])throw new Error("Stale spruce recipe; source attribute changed: "+name+"/"+key);
  }
 }
}
function rawSource(g){
 if(!g.index)throw new Error("Editable hi spruce must retain its indexed topology");
 const data={index:g.index.array.slice()};
 for(const name of Object.keys(WIDTHS)){const a=g.attributes[name];if(!a||a.isInterleavedBufferAttribute)throw new Error("Missing spruce source attribute: "+name);data[name]=a.array.slice();}
 return data;
}
export function createBrushBuilder({signal,workerFactory}={}){
 const factory=workerFactory===undefined?(typeof Worker!=="undefined"?()=>new Worker(new URL("./spruce-brush-worker.js",import.meta.url),{type:"module"}):null):workerFactory;
 let worker=null,active=null,next=0,closed=false;
 const close=()=>{if(closed)return;closed=true;worker?.terminate();worker=null;signal?.removeEventListener("abort",cancel);};
 const cancel=()=>{const reject=active?.reject;active=null;close();reject?.(new DOMException("Spruce recipe loading aborted","AbortError"));};
 if(signal?.aborted)closed=true;else signal?.addEventListener("abort",cancel,{once:true});
 return{
  async build(source,form){
   aborted(signal);if(closed)throw new Error("Spruce builder is closed");if(active)throw new Error("Only one spruce form can be built at a time");
   if(!factory){const attributes=buildRecipeFrond(source,form);aborted(signal);return attributes;}
   if(!worker){
    worker=factory();worker.onmessage=({data})=>{if(!active||data.id!==active.id)return;const {resolve,reject}=active;active=null;if(data.error){close();reject(new Error(data.error));}else resolve(data.attributes);};
    const failed=event=>{const reject=active?.reject;active=null;close();reject?.(new Error(event.message||"Spruce worker message could not be decoded"));};
    worker.onerror=failed;worker.onmessageerror=failed;
   }
   return new Promise((resolve,reject)=>{const id=next++;active={id,resolve,reject};try{worker.postMessage({id,source,form},Object.values(source).map(a=>a.buffer));}catch(error){active=null;close();reject(error);}});
  },
  dispose(){if(active)cancel();else close();}
 };
}
export async function loadSpruceRecipe(hi,url="./assets/v2/schrenk-spruce-needle.recipe.json.gz",{fetchImpl=fetch,signal,workerFactory}={}){
 const started=performance.now();aborted(signal);
 const response=await fetchImpl(url,{signal});if(!response.ok)throw new Error("Spruce recipe request failed: "+response.status+" "+url);
 const transport=new Uint8Array(await response.arrayBuffer()),json=await decodeGzipBytes(transport);aborted(signal);
 const recipe=validateSpruceRecipe(JSON.parse(new TextDecoder().decode(json)));await validateSpruceRecipeSource(hi,recipe);aborted(signal);
 const scene=hi.scene.clone(true),builder=createBrushBuilder({signal,workerFactory}),owned=new Set(),materials=new Map();let generatedBytes=0;
 try{
  for(const form of FORMS){
   const mesh=scene.getObjectByName(form+"_frond");if(!mesh?.isMesh)throw new Error("Missing source spruce form: "+form);
   const data=await builder.build(rawSource(mesh.geometry),recipe.forms[form]);aborted(signal);
   const geometry=new THREE.BufferGeometry();owned.add(geometry);
   for(const [name,width]of Object.entries(WIDTHS)){geometry.setAttribute(name,new THREE.BufferAttribute(data[name],width));generatedBytes+=data[name].byteLength;}
   geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
   mesh.userData={...mesh.userData,lod:"needle",needleVolume:recipe.geometryRevision};
  }
  scene.traverse(o=>{if(o.isMesh){if(!materials.has(o.material)){const m=o.material.clone();materials.set(o.material,m);const association=hi.parser?.associations.get(o.material);if(association)hi.parser.associations.set(m,association);}o.material=materials.get(o.material);}});
  return{...hi,scene,scenes:[scene],userData:{representation:"shared brush recipe; CPU-expanded geometry",recipeRevision:recipe.revision,responseBodyBytes:transport.length,recipeJSONBytes:json.length,generatedFrondBytes:generatedBytes,brushes:FORMS.reduce((n,f)=>n+recipe.forms[f].instances.length,0),buildMs:performance.now()-started}};
 }catch(error){for(const g of owned)g.dispose();for(const m of materials.values())m.dispose();throw error;}
 finally{builder.dispose();}
}
