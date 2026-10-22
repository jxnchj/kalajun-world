import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {createSpruceLoader,spruceGeometryContainer} from "./spruce-loading.js";
import {createBrushBuilder,loadSpruceRecipe,validateSpruceRecipe,validateSpruceRecipeSource} from "./spruce-recipe.js";
const file=path=>readFile(new URL(path,import.meta.url));
const FORMS=["column","edge","old","pencil","young"];
let fixture;
async function assets(){return fixture??=Promise.all([file("../../public/assets/v2/schrenk-spruce-hi.glb"),file("../../../assets/src/v2/spruce/inner-v7/exports/schrenk-spruce-needle.glb.gz"),file("../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz")]).then(async([hi,full,payload])=>{
 async function load(buffer){const loader=createSpruceLoader();loader.register(()=>({name:"NODE_TEXTURE_STUB",loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),"");}
 return{hi:await load(hi),full:await load(gunzipSync(full)),payload,recipe:JSON.parse(gunzipSync(payload))};
});}
const fakeFetch=payload=>async()=>({ok:true,arrayBuffer:async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength)});
test("compact controls rebuild every near needle/wood triangle within measured float tolerance",async t=>{
 const {hi,full,payload}=await assets(),derived=await loadSpruceRecipe(hi,"./recipe",{fetchImpl:fakeFetch(payload),workerFactory:null});
 const errors={position:0,normalAngleDegrees:0,uv:0,wind:0,ao:0},counts={};let bytes=0;
 for(const form of FORMS){
  const expected=full.scene.getObjectByName(form+"_frond").geometry,actual=derived.scene.getObjectByName(form+"_frond").geometry,index=expected.index.array;
  assert.equal(actual.index,null);assert.equal(actual.attributes.position.count,index.length);counts[form]=index.length/3;
  for(const [key,width,label]of [["position",3,"position"],["uv",2,"uv"],["_plant_wind",3,"wind"],["_crown_occlusion",1,"ao"]]){
   const a=actual.attributes[key].array,b=expected.attributes[key].array;bytes+=a.byteLength;
   for(let i=0;i<index.length;i++)for(let c=0;c<width;c++){const d=Math.abs(a[i*width+c]-b[index[i]*width+c]);assert.ok(Number.isFinite(d));errors[label]=Math.max(errors[label],d);}
  }
  const a=actual.attributes.normal.array,b=expected.attributes.normal.array;bytes+=a.byteLength;
  for(let i=0;i<index.length;i++){
   const j=index[i]*3,k=i*3,la=Math.hypot(a[k],a[k+1],a[k+2]),lb=Math.hypot(b[j],b[j+1],b[j+2]);assert.ok(Math.abs(la-1)<1e-5);
   const dot=(a[k]*b[j]+a[k+1]*b[j+1]+a[k+2]*b[j+2])/(la*lb),angle=Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI;errors.normalAngleDegrees=Math.max(errors.normalAngleDegrees,angle);
  }
  for(const part of ["bark","core"])assert.strictEqual(derived.scene.getObjectByName(form+"_"+part).geometry,hi.scene.getObjectByName(form+"_"+part).geometry);
 }
 assert.deepEqual(counts,{column:485522,edge:495566,old:241820,pencil:268498,young:382614});
 // 25 micrometres are below 1/90 of the needle root width; no quantization is
 // applied. The small normal deviation includes Blender custom-normal encoding.
 assert.ok(errors.position<.000025,JSON.stringify(errors));assert.ok(errors.normalAngleDegrees<.2,JSON.stringify(errors));assert.equal(errors.uv,0);assert.ok(errors.wind<=3e-7);assert.ok(errors.ao<=6e-8);
 assert.ok(payload.length<600000);assert.equal(derived.userData.brushes,1143);assert.equal(derived.userData.generatedFrondBytes,bytes);
 t.diagnostic(JSON.stringify({payloadBytes:payload.length,generatedBytes:bytes,errors,load:derived.userData}));
 for(const form of FORMS)derived.scene.getObjectByName(form+"_frond").geometry.dispose();
 for(const m of new Set(derived.scene.children.filter(o=>o.isMesh).map(o=>o.material)))m.dispose();
});
test("old recipes fail when hi coordinates or wind change even with identical topology",async()=>{
 const {hi,recipe}=await assets();await validateSpruceRecipeSource(hi,recipe);
 for(const key of ["position","_plant_wind"]){const a=hi.scene.getObjectByName("pencil_frond").geometry.attributes[key].array,old=a[0];a[0]+=0.001;try{await assert.rejects(validateSpruceRecipeSource(hi,recipe),/Stale spruce recipe/);}finally{a[0]=old;}}
 const invalid=structuredClone(recipe);invalid.forms.pencil.instances[0].controls[0][0][0]=NaN;assert.throws(()=>validateSpruceRecipe(invalid),/controls/);
 const response=async()=>({ok:false,status:503});await assert.rejects(loadSpruceRecipe(hi,"bad",{fetchImpl:response}),/503/);
});
function workerMock(){return{terminated:0,postMessage(message,transfers){this.message=message;this.transfers=transfers;},terminate(){this.terminated++;}};}
test("worker cancellation, message failures and pre-aborted construction reject without fallback",async()=>{
 for(const failure of ["abort","messageerror","error","worker-report","dispose"]){
  const worker=workerMock(),abort=new AbortController(),builder=createBrushBuilder({signal:abort.signal,workerFactory:()=>worker});
  const pending=builder.build({position:new Float32Array(3)},{instances:[]});
  assert.equal(worker.transfers.length,1);
  if(failure==="abort")abort.abort();else if(failure==="messageerror")worker.onmessageerror({});else if(failure==="error")worker.onerror({message:"test error"});else if(failure==="worker-report")worker.onmessage({data:{id:worker.message.id,error:"invalid source"}});else builder.dispose();
  await assert.rejects(pending);assert.equal(worker.terminated,1);builder.dispose();assert.equal(worker.terminated,1);
 }
 let made=0;const abort=new AbortController();abort.abort();const builder=createBrushBuilder({signal:abort.signal,workerFactory:()=>{made++;return workerMock();}});await assert.rejects(builder.build({},{}),e=>e.name==="AbortError");assert.equal(made,0);builder.dispose();
});
test("failed second form disposes generated first-form geometry and never changes hi source",async()=>{
 const {hi,payload}=await assets(),source=hi.scene.getObjectByName("column_frond").geometry,worker=workerMock();let calls=0,disposed=0;
 const original=THREE.BufferGeometry.prototype.dispose;
 THREE.BufferGeometry.prototype.dispose=function(){if(this!==source)disposed++;return original.call(this);};
 worker.postMessage=function(message){calls++;queueMicrotask(()=>{if(calls===1){const count=message.form.trianglesByCluster.reduce((a,b)=>a+b,0)*3,attributes={};for(const [k,w]of Object.entries({position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1}))attributes[k]=new Float32Array(count*w);this.onmessage({data:{id:message.id,attributes}});}else this.onmessageerror({message:"second form decode failed"});});};
 try{await assert.rejects(loadSpruceRecipe(hi,"./recipe",{fetchImpl:fakeFetch(payload),workerFactory:()=>worker}),/second form/);assert.equal(worker.terminated,1);assert.ok(disposed>=1);assert.strictEqual(hi.scene.getObjectByName("column_frond").geometry,source);}finally{THREE.BufferGeometry.prototype.dispose=original;}
});
test("identity node containers reuse source arrays without renaming or mutating the source",()=>{
 const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute([1,2,3],3));g.setIndex([0]);
 const shared=spruceGeometryContainer(g,new THREE.Matrix4());assert.strictEqual(shared.attributes.position,g.attributes.position);shared.setAttribute("renamed",shared.attributes.position);shared.deleteAttribute("position");assert.ok(g.attributes.position);
 const moved=spruceGeometryContainer(g,new THREE.Matrix4().makeTranslation(1,0,0));assert.notStrictEqual(moved.attributes.position,g.attributes.position);assert.equal(g.attributes.position.getX(0),1);assert.equal(moved.attributes.position.getX(0),2);
 g.dispose();shared.dispose();moved.dispose();
});
