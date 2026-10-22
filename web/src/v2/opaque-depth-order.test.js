import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {WebGLRenderList} from "three/src/renderers/webgl/WebGLRenderLists.js";
import {OpaqueDepthOrder,supportsOpaqueDepthOrder,viewDepthFromRenderZ} from "./opaque-depth-order.js";
import {applyWaterObliqueClip} from "./water-reflection.js";
function camera(reversed=true){
 const c=new THREE.PerspectiveCamera(52,2179/1218,.25,150000);c._reversedDepth=reversed;c.updateProjectionMatrix();
 c.position.set(-3610.73,1748.3,4806.4);c.lookAt(-3580,1745,4700);c.updateMatrixWorld(true);return c;
}
function renderer(){
 return{capabilities:{reversedDepthBuffer:true,logarithmicDepthBuffer:false},opaque:null,calls:[],
  setOpaqueSort(fn){this.opaque=fn;this.calls.push(fn);},
  setTransparentSort(){throw new Error("opaque feature must not touch transparent ordering");}};
}
function item(c,d,id=0,material=0,extra={}){
 const p=c.projectionMatrix.elements,clipZ=-p[10]*d+p[14];
 return{id,z:c.reversedDepth?-clipZ:clipZ,groupOrder:0,renderOrder:0,material:{id:material},materialVariant:0,...extra};
}
test("actual Three projections/render lists decode the same metre depth in normal and reversed paths",()=>{
 for(const reversed of[false,true])for(const near of[.1,.25,1]){
  const c=camera(reversed);c.near=near;c.zoom=1.4;c.setViewOffset(2000,1200,30,20,1600,900);c.updateProjectionMatrix();
  const list=new WebGLRenderList(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  const pv=new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);
  for(const d of[near,1.3,4.1,16.1,60,180,500,2200,150000]){
   const world=new THREE.Vector4(3,-2,-d,1).applyMatrix4(c.matrixWorld),clip=world.clone().applyMatrix4(pv);
   list.push(mesh,mesh.geometry,mesh.material,0,clip.z,null,c);
   const renderItem=list.opaque.at(-1),decoded=viewDepthFromRenderZ(renderItem.z,c.projectionMatrix.elements,reversed);
   assert.ok(Math.abs(decoded-d)<Math.max(1e-7,d*1e-10),`${reversed}: ${decoded} != ${d}`);
   assert.equal(Math.floor(Math.log2(Math.max(near,decoded))*.5),Math.floor(Math.log2(Math.max(near,d))*.5));
  }
  mesh.geometry.dispose();mesh.material.dispose();
 }
});
test("explicit group/render order wins; coarse buckets retain material and instancing grouping",()=>{
 const c=camera(),r=renderer(),sort=new OpaqueDepthOrder(r,c),list=[
  item(c,80,1,0),item(c,20,2,9),item(c,35,3,2),item(c,22,4,2,{materialVariant:2}),
  item(c,30,5,2,{materialVariant:0}),item(c,1000,6,99,{groupOrder:-1}),
  item(c,500,7,99,{renderOrder:-1}),item(c,1,8,0,{renderOrder:1})];
 const expected=[6,7,5,3,4,2,1,8];
 sort.run(c,()=>{assert.strictEqual(r.opaque,sort.compare);assert.deepEqual(list.sort(r.opaque).map(x=>x.id),expected);});
 assert.equal(r.opaque,null);assert.equal(sort.stats.bucketsPerOctave,.5);
 // Within one bucket the entire Three material/variant/depth/id policy remains.
 sort.run(c,()=>{
  const values=[item(c,20,10,3),item(c,40,11,1,{materialVariant:2}),item(c,30,12,1),item(c,25,13,1),item(c,25,14,1)];
  assert.deepEqual(values.sort(r.opaque).map(x=>x.id),[13,14,12,11,10]);
 });
});
test("comparator is antisymmetric, transitive and deterministic across buckets and ties",()=>{
 const c=camera(),r=renderer(),sort=new OpaqueDepthOrder(r,c);
 const values=Array.from({length:50},(_,i)=>item(c,.3*Math.pow(1.31,i),i,(i*7)%6,{groupOrder:i%9===0?-1:0,renderOrder:i%13===0?1:0,materialVariant:i%3}));
 values.push(item(c,-2,51,0),item(c,1,52,0,{z:NaN}));
 sort.run(c,()=>{
  const cmp=r.opaque,sign=n=>n===0?0:n<0?-1:1;
  for(const a of values)for(const b of values){assert.equal(sign(cmp(a,b)),-sign(cmp(b,a))||0);assert.ok(Number.isFinite(cmp(a,b)));}
  for(const a of values)for(const b of values)if(cmp(a,b)<=0)for(const d of values)if(cmp(b,d)<=0)assert.ok(cmp(a,d)<=0);
  const ordered=values.slice().sort(cmp).map(x=>x.id);assert.deepEqual(values.slice().reverse().sort(cmp).map(x=>x.id),ordered);
 });
});
test("WeakMap reuses entries within a render and invalidates reused items/matrix coefficients next epoch",()=>{
 const c=camera(),r=renderer(),sort=new OpaqueDepthOrder(r,c),a=item(c,10,1,5),b=item(c,80,2,0);let entry;
 sort.run(c,()=>{
  assert.ok(r.opaque(a,b)<0);assert.equal(sort.stats.cacheMisses,2);entry=sort.cache.get(a);
  for(let i=0;i<100;i++)r.opaque(a,b);
  assert.equal(sort.stats.cacheMisses,2);assert.strictEqual(sort.cache.get(a),entry);
 });
 c.near=.6;c.far=90000;c.updateProjectionMatrix();a.z=item(c,800).z;b.z=item(c,10).z;
 sort.run(c,()=>{
  assert.ok(r.opaque(a,b)>0,"reused item must not retain its old bucket");
  assert.equal(sort.stats.cacheMisses,2);assert.strictEqual(sort.cache.get(a),entry);assert.equal(entry.epoch,2);
 });
 assert.equal(r.opaque,null);
});
test("log fallback, non-main, orthographic and oblique cameras keep default ordering",()=>{
 const main=camera(),r=renderer(),sort=new OpaqueDepthOrder(r,main);
 assert.equal(supportsOpaqueDepthOrder(r,main,main),true);
 const cases=[camera(),new THREE.OrthographicCamera(-1,1,1,-1,.1,100),camera(false)];
 const oblique=camera();assert.equal(applyWaterObliqueClip(oblique,new THREE.Plane(new THREE.Vector3(0,1,0),-1700)),true);
 cases.push(oblique);
 for(const c of cases){
  // Also make each unsupported camera the configured main to test its shape,
  // not just the identity guard.
  assert.equal(supportsOpaqueDepthOrder(r,c,main),false);
  if(c!==cases[0])assert.equal(supportsOpaqueDepthOrder(r,c,c),false);
  sort.run(c,()=>assert.equal(r.opaque,null));
 }
 r.capabilities.logarithmicDepthBuffer=true;sort.run(main,()=>assert.equal(r.opaque,null));
 r.capabilities.logarithmicDepthBuffer=false;r.capabilities.reversedDepthBuffer=false;sort.run(main,()=>assert.equal(r.opaque,null));
 r.capabilities.reversedDepthBuffer=true;
 for(const [index,value]of[[10,0],[10,NaN],[14,Infinity],[15,1]]){
  const saved=main.projectionMatrix.elements[index];main.projectionMatrix.elements[index]=value;
  sort.run(main,()=>assert.equal(r.opaque,null));main.projectionMatrix.elements[index]=saved;
 }
});
test("sync callback return and exceptions always restore null before later reflection renders",()=>{
 const c=camera(),r=renderer(),sort=new OpaqueDepthOrder(r,c);
 assert.equal(sort.run(c,()=>42),42);assert.equal(r.opaque,null);
 assert.throws(()=>sort.run(c,()=>{assert.strictEqual(r.opaque,sort.compare);throw new Error("render failed");}),/render failed/);
 assert.equal(r.opaque,null);
 const reflection=camera();sort.run(reflection,()=>assert.equal(r.opaque,null));assert.equal(r.opaque,null);
 for(const rate of[0,-1,NaN,Infinity])assert.throws(()=>new OpaqueDepthOrder(r,c,{bucketsPerOctave:rate}),RangeError);
});
test("integration scopes only renderWorld and leaves reflection outside the sort",()=>{
 const source=readFileSync(new URL("./main.js",import.meta.url),"utf8");
 assert.match(source,/const renderWorld=\(scene,renderCamera\)=>opaqueDepthOrder.run\(renderCamera,\(\)=>\{\s+water.prepareRefraction\(renderer,renderCamera,worldFrame\?\.target\);\s+return worldFrame\?worldFrame.render\(scene,renderCamera\):renderer.render\(scene,renderCamera\);\s+\}\);/);
 assert.match(source,/withPreparedWorldMatrices\(scene,\(\)=>renderWorld\(scene,camera\),preparedMatrices\);\s+water.renderReflection\(renderer,scene,camera/);
 assert.equal(source.includes("setTransparentSort"),false);
});
