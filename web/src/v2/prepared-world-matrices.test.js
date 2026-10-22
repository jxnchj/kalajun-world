import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as THREE from "three";
import {withPreparedWorldMatrices} from "./prepared-world-matrices.js";

// This is the installed renderer's matrix/hook ordering, with drawing omitted.
function renderScene(scene,camera,draw=()=>{}){
 if(scene.matrixWorldAutoUpdate===true)scene.updateMatrixWorld();
 if(camera.parent===null&&camera.matrixWorldAutoUpdate===true)camera.updateMatrixWorld();
 scene.onBeforeRender(null,scene,camera,null);return draw();
}
function countUpdates(scene){
 let calls=0;const update=scene.updateMatrixWorld;
 scene.updateMatrixWorld=function(...args){calls++;return update.apply(this,args);};
 return()=>calls;
}

test("main draw reuses the propagated parent, dynamic door and sky matrices without freezing their next update",()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),parent=new THREE.Group(),door=new THREE.Object3D(),sky=new THREE.Object3D();
 parent.add(door);scene.add(parent,sky);door.position.set(3,1,0);const calls=countUpdates(scene);
 let hooks=0;scene.onBeforeRender=()=>{hooks++;};
 for(let frame=0;frame<4;frame++){
  parent.position.set(100+frame,2,50);parent.rotation.y=frame*.2;door.rotation.y=frame*.4;
  camera.position.set(frame*2,7,12);sky.position.copy(camera.position);
  scene.updateMatrixWorld(); // Existing caster-tracker propagation after world changes.
  const expectedDoor=new THREE.Matrix4().multiplyMatrices(parent.matrixWorld,door.matrix),expectedSky=sky.matrixWorld.clone(),before=calls();
  const doorAuto=door.matrixAutoUpdate,parentAuto=parent.matrixAutoUpdate;
  const result=withPreparedWorldMatrices(scene,()=>renderScene(scene,camera,()=>{
   assert.deepEqual(door.matrixWorld,expectedDoor);assert.deepEqual(sky.matrixWorld,expectedSky);
   assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld),camera.position);
   return frame;
  }));
  assert.equal(result,frame);assert.equal(calls(),before,"renderer does not repeat the whole-scene propagation");
  assert.equal(scene.matrixWorldAutoUpdate,true);assert.equal(door.matrixAutoUpdate,doorAuto);assert.equal(parent.matrixAutoUpdate,parentAuto);
 }
 assert.equal(hooks,4);assert.equal(calls(),4);
 // A standalone photo render is NOT inside the prepared scope. New transforms
 // must update normally, without waiting for another animation/environment tick.
 parent.position.x+=20;door.rotation.y+=.1;sky.position.y+=5;
 renderScene(scene,camera);assert.equal(calls(),5);
 assert.deepEqual(door.matrixWorld,new THREE.Matrix4().multiplyMatrices(parent.matrixWorld,door.matrix));
 assert.equal(sky.matrixWorld.elements[13],sky.position.y);
});

test("A/B disabled retains the original propagation and instance/wind data are never modified",()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),mesh=new THREE.InstancedMesh(geometry,material,2);
 const wind=new THREE.InstancedBufferAttribute(new Float32Array([.1,.2,.3,.4]),2);geometry.setAttribute("rootWind",wind);
 mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,2,3));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,5,6));scene.add(mesh);
 const matrices=mesh.instanceMatrix.array.slice(),forces=wind.array.slice(),calls=countUpdates(scene);
 try{
  scene.updateMatrixWorld();withPreparedWorldMatrices(scene,()=>renderScene(scene,camera),false);assert.equal(calls(),2);
  withPreparedWorldMatrices(scene,()=>renderScene(scene,camera));assert.equal(calls(),2);
  assert.deepEqual(mesh.instanceMatrix.array,matrices);assert.deepEqual(wind.array,forces);assert.equal(mesh.count,2);
 }finally{geometry.dispose();material.dispose();mesh.dispose();}
});

test("exceptions, nested synchronous draws and an originally false flag restore exact ownership",()=>{
 const scene=new THREE.Scene();
 for(const original of[true,false]){
  scene.matrixWorldAutoUpdate=original;
  assert.throws(()=>withPreparedWorldMatrices(scene,()=>{
   assert.equal(scene.matrixWorldAutoUpdate,false);
   withPreparedWorldMatrices(scene,()=>assert.equal(scene.matrixWorldAutoUpdate,false));
   assert.equal(scene.matrixWorldAutoUpdate,false);throw new Error("draw failed");
  }),/draw failed/);
  assert.equal(scene.matrixWorldAutoUpdate,original);
  assert.equal(withPreparedWorldMatrices(scene,()=>42),42);assert.equal(scene.matrixWorldAutoUpdate,original);
 }
});

test("main integration opts out with zero and scopes only the post-environment draw inside unchanged GPU boundaries",()=>{
 const source=readFileSync(new URL("./main.js",import.meta.url),"utf8"),renderer=readFileSync(new URL("../../node_modules/three/src/renderers/WebGLRenderer.js",import.meta.url),"utf8");
 assert.match(renderer,/if \( scene.matrixWorldAutoUpdate === true \) scene.updateMatrixWorld\(\);/);
 assert.match(source,/preparedMatrices=params.get\("preparedMatrices"\)!=="0"/);
 const frame=source.slice(source.indexOf("function frame(now)"),source.indexOf("await measureLoad(\"firstFrame\""));
 const worldUpdate=frame.indexOf("environment.update(dt)"),begin=frame.indexOf("gpuContext.beginQuery"),prepared=frame.indexOf("withPreparedWorldMatrices(scene,()=>renderWorld(scene,camera),preparedMatrices)"),reflection=frame.indexOf("water.renderReflection"),end=frame.indexOf("gpuContext.endQuery");
 assert.ok(worldUpdate>=0&&worldUpdate<begin&&begin<prepared&&prepared<reflection&&reflection<end);
 assert.equal(source.match(/withPreparedWorldMatrices\(scene,/g)?.length,1,"photo/first draw/compilation cannot silently share this precondition");
 assert.match(source,/photo-save"\)\.addEventListener\("click",\(\)=>\{\s+renderWorld\(scene,camera\);/);
 assert.match(source,/await measureLoad\("firstFrame",\(\)=>renderWorld\(scene,camera\)\)/);
 const compile=source.slice(source.indexOf("const compileDestination=()=>{"),source.indexOf("const started=performance.now(),pending=[];"));
 assert.match(compile,/scene.updateMatrixWorld\(true\);camera.updateMatrixWorld\(true\);/);
});
