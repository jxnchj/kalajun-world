import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "three";
import { WebGLGeometries } from "three/src/renderers/webgl/WebGLGeometries.js";
import { attachEcologyWind } from "./ecology.js";
import { configureSpruceMaterial } from "./spruce-material.js";
import { createTreeWindGeometry, disposeTreeWindGeometry, treeRootWind } from "./spruce-wind.js";
import { MeadowWindField } from "./wind-field.js";
import { createSpruceLoader, spruceGeometryContainer, SpruceGeometryPool } from "./spruce-loading.js";
import { createVolumeSpruceFoliage } from "./spruce-volume.js";
import { installSpruceBranchPhotos } from "./spruce-branch-detail.js";
import { installTreeFrustumMaterial } from "./tree-frustum-cull.js";
import { prepareTreeWindCoefficients, installTreeWindCoefficients, updateTreeWindCoefficientPhase } from "./tree-wind-coefficients.js";

const F=Math.fround, add=(a,b)=>F(F(a)+F(b)), mul=(a,b)=>F(F(a)*F(b)), sub=(a,b)=>F(F(a)-F(b));
function geometry() {
 const g=new T.BoxGeometry(2,18,2);g.translate(0,9,0);
 const values=new Float32Array(g.attributes.position.count*3);
 for(let i=0;i<values.length;i+=3){values[i]=.1+(i%9)*.1;values[i+1]=.55;values[i+2]=i*.37;}
 g.setAttribute("aPlantWind",new T.BufferAttribute(values,3));return g;
}
const controls=()=>({phase:{value:new T.Vector2(0,1)},enabled:{value:0}});

// Each arithmetic operator is rounded independently, reproducing the GLSL
// expression order. Math.sin models ideal correctly rounded shader sin; the
// actual driver's transcendental approximation remains a browser check.
function original(y,w,r,time){
 const a=mul(w[0],.48),current=add(mul(r[2],sub(1,a)),mul(r[3],a)),returning=mul(sub(current,r[3]),.32),h=F(Math.min(20,Math.max(0,y)));
 const branch=mul(w[1],add(mul(F(Math.sin(add(mul(time,.85),w[2]))),.018),mul(sub(r[3],current),.12)));
 return [0,1].map(k=>{
  const direction=r[k],perp=k===0?-r[1]:r[0];
  const trunk=mul(mul(mul(mul(direction,add(current,returning)),h),h),.0014);
  return add(trunk,add(mul(direction,branch),mul(mul(mul(perp,r[4]),w[1]),.018)));
 });
}
function optimized(coefficients,i,r,phase){
 const values=coefficients.attributes[0].data.array,k=i*5;
 const along=add(add(mul(r[2],values[k]),mul(r[3],values[k+1])),add(mul(phase.value.x,values[k+2]),mul(phase.value.y,values[k+3])));
 return [0,1].map(n=>add(mul(r[n],along),mul(mul(n===0?-r[1]:r[0],r[4]),values[k+4])));
}

test("five floats are shared by static attribute identity without changing authored data, index or root buffers",()=>{
 const g=geometry(),prior={...g.attributes},index=g.index,bytes=Object.fromEntries(Object.entries(prior).map(([n,a])=>[n,a.array.slice()]));
 const entry=prepareTreeWindCoefficients(g);assert.equal(entry.bytes,g.attributes.position.count*20);assert.equal(entry.allocatedBytes,entry.bytes);
 assert.equal(entry.attributes[0].data.stride,5);assert.strictEqual(entry.attributes[0].data,entry.attributes[1].data);
 assert.equal(prepareTreeWindCoefficients(g).allocatedBytes,0);
 const alias=new T.BufferGeometry();for(const[n,a]of Object.entries(prior))alias.setAttribute(n,a);
 const same=prepareTreeWindCoefficients(alias);assert.equal(same.allocatedBytes,0);assert.strictEqual(same.attributes[0],entry.attributes[0]);
 for(const[n,a]of Object.entries(prior)){assert.strictEqual(g.attributes[n],a);assert.deepEqual(a.array,bytes[n]);}assert.strictEqual(g.index,index);
 const a=createTreeWindGeometry(g,64),b=createTreeWindGeometry(g,64);
 assert.strictEqual(a.attributes.aTreeWindCoefficients,entry.attributes[0]);assert.strictEqual(b.attributes.aTreeWindEddy,entry.attributes[1]);
 assert.notStrictEqual(a.attributes.aTreeRootWind.data,b.attributes.aTreeRootWind.data);
 assert.ok(Object.keys(a.attributes).length+3<=16,"includes four instance-matrix locations");
 const removed=[],owner=WebGLGeometries({}, {remove:x=>removed.push(x)}, {memory:{geometries:0}}, {releaseStatesOfGeometry:()=>{}});
 owner.get({},a);owner.get({},g);disposeTreeWindGeometry(a);
 assert.ok(!removed.includes(entry.attributes[0]));assert.ok(!removed.includes(entry.attributes[1]));
 disposeTreeWindGeometry(b);g.dispose();assert.ok(removed.includes(entry.attributes[0]));assert.ok(removed.includes(entry.attributes[1]));
 alias.dispose();
});

test("unsupported geometry, non-finite inputs and mutations cannot leave stale coefficients in use",()=>{
 const g=geometry();prepareTreeWindCoefficients(g);g.attributes.position.needsUpdate=true;
 assert.throws(()=>prepareTreeWindCoefficients(g),/changed/);
 const missing=new T.BoxGeometry();assert.throws(()=>prepareTreeWindCoefficients(missing),/matching/);
 const gpu=geometry();gpu.userData.gpuBrushShell=true;assert.throws(()=>prepareTreeWindCoefficients(gpu),/static/);
 const morph=geometry();morph.morphAttributes.position=[morph.attributes.position];assert.throws(()=>prepareTreeWindCoefficients(morph),/static/);
 const invalid=geometry();invalid.attributes.aPlantWind.setZ(0,NaN);assert.throws(()=>prepareTreeWindCoefficients(invalid),/finite/);
 assert.equal(invalid.hasAttribute("aTreeWindCoefficients"),false);
 for(const x of[g,missing,gpu,morph,invalid])x.dispose();
});

test("colour/depth hooks keep LOD and photo/frustum early exits, normals and the exact original fallback",()=>{
 for(const mode of[1,5])for(const depth of[false,true])for(const before of[false,true]){
  const m=configureSpruceMaterial(depth?new T.MeshDepthMaterial({alphaTest:.45}):new T.MeshStandardMaterial({alphaTest:.45}));
  attachEcologyWind(m,{},mode,false,true);const c=controls();
  if(before){installSpruceBranchPhotos(m);installTreeFrustumMaterial(m,{value:1});}
  installTreeWindCoefficients(m,c);installTreeWindCoefficients(m,c);
  if(!before){installSpruceBranchPhotos(m);installTreeFrustumMaterial(m,{value:1});}
  const lib=T.ShaderLib[depth?"depth":"standard"],shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(shader);
  const body=shader.vertexShader.slice(shader.vertexShader.indexOf("void main()")),offset=body.indexOf("float treeWindAlong");
  assert.ok(offset>body.indexOf("// TREE_FRUSTUM_EARLY_END"));assert.ok(offset>body.indexOf("vSpruceBranchFade=aSprayLod"));
  assert.match(body,/else\s*{\s*ecoOffset=ecoBend\(position.y,ecoWeights,ecoRoot\(\)\);/);
  assert.match(body,/transformed.xz \+= ecoOffset/);assert.match(body,/ecoSlope=ecoOffset\*2\./);
  assert.strictEqual(shader.uniforms.uTreeWindCoefficientPhase,c.phase);assert.strictEqual(shader.uniforms.uTreeWindCoefficients,c.enabled);
  assert.equal(c.enabled.value,0);assert.equal(m.alphaTest,.45);
  assert.throws(()=>installTreeWindCoefficients(m,controls()),/Conflicting/);
  m.dispose();
 }
 for(const mode of[0,7,12]){
  const m=configureSpruceMaterial(new T.MeshStandardMaterial());attachEcologyWind(m,{},mode,false,true);installTreeWindCoefficients(m,controls());
  const lib=T.ShaderLib.standard;assert.throws(()=>m.onBeforeCompile({uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader}),/mode 1\/5/);m.dispose();
 }
});

test("clamped trunk endpoints and extreme root gusts retain the original tree equation",()=>{
 const g=new T.BufferGeometry(),positions=[],weights=[];
 for(const y of[-4,0,.001,20,25])for(const wx of[0,.48,1])for(const wy of[0,.55])for(const wz of[0,Math.PI,2*Math.PI]){
  positions.push(0,y,0);weights.push(wx,wy,wz);
 }
 g.setAttribute("position",new T.Float32BufferAttribute(positions,3));g.setAttribute("aPlantWind",new T.Float32BufferAttribute(weights,3));
 const entry=prepareTreeWindCoefficients(g),{phase}=controls();let maximum=0;
 for(const time of[0,1.234,400.3]){updateTreeWindCoefficientPhase(phase,time);
  for(let i=0;i<g.attributes.position.count;i++)for(const r of[[1,0,0,1,-.5],[0,-1,1,0,.5],[F(Math.SQRT1_2),F(Math.SQRT1_2),1,1,0]]){
   const w=Array.from(g.attributes.aPlantWind.array.subarray(i*3,i*3+3)),old=original(g.attributes.position.getY(i),w,r,time),next=optimized(entry,i,r,phase);
   maximum=Math.max(maximum,Math.hypot(next[0]-old[0],next[1]-old[1])*1.48);
  }
 }
 assert.ok(maximum<1.5e-6);g.dispose();
});

test("phase matches the GPU time multiplication and rejects invalid integration inputs",()=>{
 const {phase}=controls();
 for(const time of[0,.016,300.123456,3600.55,21600.75,86400]){
  const identity=phase.value;updateTreeWindCoefficientPhase(phase,time);
  const angle=mul(time,.85);assert.equal(F(phase.value.x),F(Math.sin(angle)));assert.equal(F(phase.value.y),F(Math.cos(angle)));assert.strictEqual(phase.value,identity);
 }
 assert.throws(()=>updateTreeWindCoefficientPhase(phase,NaN),/finite/);
 assert.throws(()=>installTreeWindCoefficients(new T.MeshStandardMaterial(),{phase,enabled:{value:NaN}}),/uniforms/);
});

test("actual high/mid static assets and root wind retain displacement within explicit float32 error bounds",async t=>{
 const loader=createSpruceLoader();loader.register(()=>({name:"TEXTURE_STUB",loadTexture:()=>Promise.resolve(new T.Texture())}));
 const pool=new SpruceGeometryPool(),geometries=[];let parts=0;
 for(const lod of["hi","mid"]){
  const bytes=await readFile(new URL("../../public/assets/v2/schrenk-spruce-"+lod+".glb",import.meta.url)),gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{
   if(!o.isMesh)return;
   const source=o.name.endsWith("_frond")?createVolumeSpruceFoliage(o.geometry,{mid:lod==="mid"}):o.geometry;
   let g=spruceGeometryContainer(source,o.matrixWorld);g.deleteAttribute("color");
   for(const[a,b]of[["_plant_wind","aPlantWind"],["_crown_occlusion","aCrownOcclusion"]]){g.setAttribute(b,g.getAttribute(a));g.deleteAttribute(a);}
   const split=o.name.lastIndexOf("_");g=pool.adopt(o.name.slice(0,split),o.name.slice(split+1),g);geometries.push(g);parts++;
  });
 }
 // Wait until all pool.adopt calls are complete: derived interleaved attributes
 // must not interfere with its existing byte-exact source sharing comparison.
 const field=new MeadowWindField({resolution:16});field.update(3.2,{x:-3600,z:4800});field.uniforms.uWindFieldBlend.value=.37;
 const forces=[[-1,0,0,1,-.5],[0,1,1,0,.5],[F(Math.SQRT1_2),F(-Math.SQRT1_2),1,1,.5]];
 for(const root of[{x:-3600,z:4800,rot:.3,s:.72},{x:-3620,z:4790,rot:2.6,s:1.48},{x:12000,z:3000,rot:-.8,s:1}])forces.push(Array.from(treeRootWind(field,root,3.23)));
 const times=[0,.016,3.23,120.75,600.3,3600.55,21600.75,86400],{phase}=controls();let allocatedBytes=0,checks=0,shortMaximum=0,sixHourMaximum=0,dayMaximum=0,allVertices=0,allCorners=0,allVertexMaximum=0;
 for(const g of geometries){
  const originalAttributes={...g.attributes},originalIndex=g.index;
  const originalBytes=Object.fromEntries(Object.entries(originalAttributes).map(([name,a])=>[name,Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString("base64")]));
  const coeff=prepareTreeWindCoefficients(g);allocatedBytes+=coeff.allocatedBytes;const p=g.attributes.position,w=g.attributes.aPlantWind;
  // Every indexed corner is covered through its referenced row, not a sparse
  // branch sample. This also guards source/cache arrays against in-place edits.
  const checked=new Uint8Array(p.count);updateTreeWindCoefficientPhase(phase,600.3);
  for(const row of g.index.array){
   assert.ok(row<p.count);allCorners++;if(checked[row])continue;checked[row]=1;allVertices++;
   const old=original(p.getY(row),[w.getX(row),w.getY(row),w.getZ(row)],forces[2],600.3);
   const next=optimized(coeff,row,forces[2],phase);
   allVertexMaximum=Math.max(allVertexMaximum,Math.hypot(next[0]-old[0],next[1]-old[1])*1.48);
  }
  assert.strictEqual(g.index,originalIndex);
  for(const [name,a] of Object.entries(originalAttributes)){
   assert.strictEqual(g.attributes[name],a);
   assert.equal(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString("base64"),originalBytes[name],"source bytes: "+name);
  }
  for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/64))){
   const weights=[w.getX(i),w.getY(i),w.getZ(i)];
   for(const time of times){updateTreeWindCoefficientPhase(phase,time);for(const force of forces){
    const old=original(p.getY(i),weights,force,time),next=optimized(coeff,i,force,phase),error=Math.hypot(next[0]-old[0],next[1]-old[1])*1.48;
    if(time<=600.3)shortMaximum=Math.max(shortMaximum,error);
    if(time<=21600.75)sixHourMaximum=Math.max(sixHourMaximum,error);
    dayMaximum=Math.max(dayMaximum,error);checks++;
   }}
  }
 }
 assert.equal(parts,30);assert.ok(checks>80000);assert.ok(allVertices>213000);assert.ok(allCorners>515000);assert.ok(allVertexMaximum<1.5e-6);
 assert.ok(shortMaximum<1.5e-6,"first ten minutes: less than 0.0015 mm");
 assert.ok(sixHourMaximum<3e-5,"six hours: less than 0.03 mm");
 assert.ok(dayMaximum<1.5e-4,"24 hours: less than 0.15 mm");
 t.diagnostic(JSON.stringify({checks,parts,allocatedBytes,allVertices,allCorners,allVertexMaximum,maximumWorldMetres:{firstTenMinutes:shortMaximum,sixHours:sixHourMaximum,twentyFourHours:dayMaximum},maximumRootScale:1.48,note:"float32 CPU expression replay, not a GPU timing or driver-sin measurement"}));
 field.dispose();pool.dispose();
});


test("static compile path removes original active wind inputs in both colour and depth without changing legacy runtime mode",()=>{
 for(const mode of [1,5])for(const depth of [false,true]){
  const controlsValue=controls(),m=configureSpruceMaterial(depth?new T.MeshDepthMaterial({alphaTest:.45}):new T.MeshStandardMaterial({alphaTest:.45}));
  attachEcologyWind(m,{},mode,false,true);
  const sourceKey=m.customProgramCacheKey();
  installTreeWindCoefficients(m,{...controlsValue,compileTimeOnly:true});
  const lib=T.ShaderLib[depth?"depth":"standard"],shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(shader);
  assert.doesNotMatch(shader.vertexShader,/\baPlantWind\b|\becoWeights\b|uTreeWindCoefficients/);
  assert.match(shader.vertexShader,/attribute vec4 aTreeWindCoefficients/);
  assert.match(shader.vertexShader,/attribute float aTreeWindEddy/);
  assert.equal(shader.uniforms.uTreeWindCoefficients,undefined);
  assert.strictEqual(shader.uniforms.uTreeWindCoefficientPhase,controlsValue.phase);
  const main=shader.vertexShader.slice(shader.vertexShader.indexOf("void main()"));
  assert.doesNotMatch(main,/ecoBend\(/);
  assert.ok(main.indexOf("treeWindAlong")>main.indexOf("// ECO_LOD_EARLY_END"));
  assert.match(main,/transformed.xz \+= ecoOffset/);
  assert.match(shader.fragmentShader,/float nearTree=1.-smoothstep\(42.,62.,vPlantDistance\)/);
  assert.equal(m.customProgramCacheKey(),sourceKey+"-tree-wind-coefficients-v1-static");
  assert.throws(()=>installTreeWindCoefficients(m,controlsValue),/Conflicting/);
  m.dispose();
 }
});

test("static URL is independent, opt-in, applied only to all photo crown hi/mid colour and depth, and advances phase when runtime toggle is off",async()=>{
 const source=await readFile(new URL("./ecology.js",import.meta.url),"utf8");
 assert.match(source,/get\("treeWindCoefficientsStatic"\)==="1"/);
 assert.match(source,/get\("treeWindCoefficients"\)==="1"\?1:0/);
 assert.match(source,/if\(this.treeWindCoefficients.value\|\|this.treeWindCoefficientsStatic\)\{/);
 assert.match(source,/for\(const part of this.nearParts\)if\(\(part.mode===1\|\|part.mode===5\)&&part.mesh.material.alphaTest>0\)/);
 assert.match(source,/for\(const material of \[part.mesh.material,part.mesh.customDepthMaterial\]\)installTreeWindCoefficients\(material,\{phase:this.treeWindPhase,enabled:this.treeWindCoefficients,compileTimeOnly:this.treeWindCoefficientsStatic\}\)/);
 assert.match(source,/if\(this.treeWindCoefficients.value\|\|this.treeWindCoefficientsStatic\)updateTreeWindCoefficientPhase/);
});
