import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldBoundsCache,worldBoundsCacheControl} from './world-bounds-cache.js';
import {refreshPlantBounds} from './ecology.js';
import {createFarTreeBatch,disposeFarTreeBatch} from './far-tree-batches.js';
const control=()=>({enabled:true,stats:{queries:0,recomputes:0,reuses:0}});
let seed=48291;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},signed=(scale=1)=>(random()-.5)*2*scale;
const expected=(box,matrix)=>new THREE.Box3().copy(box).applyMatrix4(matrix);
const frustum=camera=>{camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);};
const perspectives=Array.from({length:5},(_,i)=>{
 const camera=i<3?new THREE.PerspectiveCamera(30+i*20,1.4,.1,700):new THREE.OrthographicCamera(-100,100,90,-90,.1,700);
 camera.position.set(signed(130),signed(130),signed(130));camera.lookAt(signed(25),signed(25),signed(25));return frustum(camera);
});
test('random world transforms preserve exact boxes and every main/reflected/shadow-style frustum decision',t=>{
 const mode=control(),cache=new WorldBoundsCache(mode);let hits=0,misses=0;
 for(let i=0;i<1200;i++){
  const center=new THREE.Vector3(signed(150),signed(150),signed(150)),size=new THREE.Vector3(random()*30,random()*30,random()*30),box=new THREE.Box3().setFromCenterAndSize(center,size),matrix=new THREE.Matrix4().compose(new THREE.Vector3(signed(100),signed(100),signed(100)),new THREE.Quaternion().setFromEuler(new THREE.Euler(signed(3),signed(3),signed(3))),new THREE.Vector3(signed(3),signed(3),signed(3)));
  // Also exercise shear/non-affine matrix entries: never substitute a reduced
  // transform equation for Three's existing eight-corner Box3 transformation.
  if(i%7===0){matrix.elements[4]+=.27;matrix.elements[3]=.0001;}
  const exact=expected(box,matrix);
  for(const f of perspectives){const actual=cache.get(box,matrix);assert.deepEqual(actual,exact);const visible=f.intersectsBox(exact);assert.equal(f.intersectsBox(actual),visible);if(visible)hits++;else misses++;}
 }
 assert.equal(cache.stats.recomputes,1200);assert.equal(cache.stats.reuses,4800);assert.deepEqual(cache.stats,mode.stats);assert.ok(hits>100&&misses>100);
 t.diagnostic(JSON.stringify({...cache.stats,hits,misses}));
});
test('every in-place matrix and six bound components invalidates, replacements and live A/B stay fresh',()=>{
 const mode=control(),cache=new WorldBoundsCache(mode);let box=new THREE.Box3(new THREE.Vector3(-1,-2,-3),new THREE.Vector3(2,3,4)),matrix=new THREE.Matrix4();
 const check=()=>assert.deepEqual(cache.get(box,matrix),expected(box,matrix));check();
 for(let i=0;i<16;i++){matrix.elements[i]+=.003;check();assert.equal(cache.stats.recomputes,i+2);}
 for(const endpoint of ['min','max'])for(const axis of ['x','y','z']){const before=cache.stats.recomputes;box[endpoint][axis]+=.17;check();assert.equal(cache.stats.recomputes,before+1);}
 box=box.clone();matrix=matrix.clone();const unchanged=cache.stats.recomputes;check();assert.equal(cache.stats.recomputes,unchanged,'equal replacement can safely reuse by values');
 box=new THREE.Box3(new THREE.Vector3(3,4,5),new THREE.Vector3(8,9,10));check();matrix=new THREE.Matrix4().makeTranslation(60,70,80);check();
 mode.enabled=false;const disabled=cache.stats.recomputes;for(let i=0;i<5;i++)check();assert.equal(cache.stats.recomputes,disabled+5);
 mode.enabled=true;check();const resumed=cache.stats.recomputes;check();assert.equal(cache.stats.recomputes,resumed);
 box.makeEmpty();check();check();assert.ok(cache.box.isEmpty());box.min.set(-3,-4,-5);box.max.set(2,3,4);check();assert.equal(cache.box.isEmpty(),false);
});
test('near grass/tree hook preserves count-zero, empty, fallback and source updates without changing bounds',()=>{
 const previous=worldBoundsCacheControl.enabled;worldBoundsCacheControl.enabled=true;
 const geometry=new THREE.BoxGeometry(2,3,2),material=new THREE.MeshBasicMaterial(),mesh=new THREE.InstancedMesh(geometry,material,2),records=[{x:10,y:5,z:-20,s:1}];
 try{
  refreshPlantBounds(mesh,records,new THREE.Vector3(),100);mesh.count=1;
  assert.strictEqual(mesh.userData.worldBoundsCacheControl,worldBoundsCacheControl);
  const local=mesh.boundingBox.clone(),probe={intersectsBox:b=>b.equals(expected(mesh.boundingBox,mesh.matrixWorld))};
  assert.equal(mesh.intersectsFrustum(probe),true);assert.equal(mesh.intersectsFrustum(probe),true);assert.equal(mesh.userData.worldBoundsCache.stats.reuses,1);assert.deepEqual(mesh.boundingBox,local);
  mesh.matrixWorld.makeTranslation(0,0,200);assert.equal(mesh.intersectsFrustum(probe),true);assert.equal(mesh.userData.worldBoundsCache.stats.recomputes,2);
  records[0].x+=50;refreshPlantBounds(mesh,records,new THREE.Vector3(),100);assert.equal(mesh.intersectsFrustum(probe),true);assert.equal(mesh.userData.worldBoundsCache.stats.recomputes,3);
  const queries=mesh.userData.worldBoundsCache.stats.queries;mesh.count=0;assert.equal(mesh.intersectsFrustum(probe),false);assert.equal(mesh.userData.worldBoundsCache.stats.queries,queries);
  mesh.count=1;mesh.boundingBox.makeEmpty();assert.equal(mesh.intersectsFrustum(probe),false);assert.equal(mesh.userData.worldBoundsCache.stats.queries,queries);
  refreshPlantBounds(mesh,records,new THREE.Vector3(),100);assert.equal(mesh.intersectsFrustum({intersectsObject:o=>o===mesh}),true);
 }finally{worldBoundsCacheControl.enabled=previous;geometry.dispose();material.dispose();mesh.dispose();}
});
test('far forest hook uses same cache control and retains sphere bypass and zero-count semantics',()=>{
 const previous=worldBoundsCacheControl.enabled;worldBoundsCacheControl.enabled=true;
 const source=new THREE.BoxGeometry(2,3,2);source.computeBoundingBox();source.computeBoundingSphere();
 const material=new THREE.MeshBasicMaterial(),policy={enabled:true},mesh=createFarTreeBatch(source,material,[{}],()=>new THREE.Matrix4(),{control:policy,setAttributes:()=>{}});
 try{
  assert.strictEqual(mesh.userData.worldBoundsCacheControl,worldBoundsCacheControl);
  for(const f of perspectives){const exact=expected(mesh.boundingBox,mesh.matrixWorld);assert.equal(mesh.intersectsFrustum(f),f.intersectsBox(exact));}
  assert.equal(mesh.userData.worldBoundsCache.stats.recomputes,1);assert.equal(mesh.userData.worldBoundsCache.stats.reuses,4);
  mesh.boundingBox=mesh.boundingBox.clone().expandByScalar(3);mesh.matrixWorld=new THREE.Matrix4().makeTranslation(18,19,20);for(const f of perspectives)assert.equal(mesh.intersectsFrustum(f),f.intersectsBox(expected(mesh.boundingBox,mesh.matrixWorld)));
  const queries=mesh.userData.worldBoundsCache.stats.queries;policy.enabled=false;for(const f of perspectives)assert.equal(mesh.intersectsFrustum(f),THREE.Mesh.prototype.intersectsFrustum.call(mesh,f));assert.equal(mesh.userData.worldBoundsCache.stats.queries,queries);
  mesh.count=0;assert.equal(mesh.intersectsFrustum(perspectives[0]),false);assert.equal(mesh.userData.worldBoundsCache.stats.queries,queries);
 }finally{worldBoundsCacheControl.enabled=previous;disposeFarTreeBatch(mesh);source.dispose();material.dispose();}
});
