import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WorldEcology,meadowGeometry,refreshPlantBounds} from './ecology.js';
import {GrassRootField,createGrassFieldGeometry,markGrassFieldRendered,disposeGrassFieldGeometry} from './grass-root-field.js';
const roots=Array.from({length:137},(_,i)=>({id:'grass:'+i,x:-34+i*.51,y:2100+Math.sin(i*.3)*3,z:Math.cos(i*.4)*36,s:.8+(i%11)*.05,sy:.6+(i%7)*.13,rot:i*2.399963,shoreMove:i%5===0?.2:0}));
function context(viewer){return{grassGeometries:[meadowGeometry(true),meadowGeometry(false)],grassMaterials:[new T.MeshStandardMaterial(),new T.MeshStandardMaterial()],grassDepth:new T.MeshDepthMaterial(),grassRootField:new GrassRootField(),grassGroup:new T.Group(),transform:new T.Object3D(),uniforms:{uWorldViewer:{value:new T.Vector3(...viewer)}},matrix:WorldEcology.prototype.matrix};}
function legacy(c,t,lod){const m=new T.InstancedMesh(createGrassFieldGeometry(c.grassGeometries[lod],t.regular.length),c.grassMaterials[lod],t.regular.length);m.onBeforeRender=m.onBeforeShadow=markGrassFieldRendered;t.regular.forEach((r,i)=>{m.setMatrixAt(i,c.matrix(r));c.grassRootField.write(m.geometry.attributes.aMeadowRootField,i,r,m.geometry.attributes.aMeadowLandform,m.geometry.attributes.aMeadowCommunity);});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();m.boundingSphere.radius+=1;m.receiveShadow=true;m.castShadow=lod===0;if(lod===0){m.customDepthMaterial=c.grassDepth;refreshPlantBounds(m,t.regular,c.uniforms.uWorldViewer.value,33);}return m;}
function release(c,m){disposeGrassFieldGeometry(m.geometry);m.dispose();for(const g of c.grassGeometries)g.dispose();for(const mat of c.grassMaterials)mat.dispose();c.grassDepth.dispose();c.grassRootField.dispose();}
test('actual near instances retain exact wind envelope, fields, geometry metadata and all view frusta',()=>{
 for(const viewer of [[0,2102,0],[39,2102,0],[1000,2102,1000],[-34,2101,36]])for(const lod of [0,1]){
  const c=context(viewer),tile={regular:roots,meshes:[]},old=legacy(c,tile,lod);WorldEcology.prototype.addGrassMesh.call(c,tile,lod);const next=tile.meshes[lod];
  assert.deepEqual(next.boundingBox,old.boundingBox);assert.deepEqual(next.boundingSphere,old.boundingSphere);assert.deepEqual(next.geometry.boundingSphere,old.geometry.boundingSphere);assert.deepEqual(next.geometry.boundingBox,old.geometry.boundingBox);
  assert.deepEqual(next.instanceMatrix.array,old.instanceMatrix.array);assert.deepEqual(next.geometry.index.array,old.geometry.index.array);
  for(const name of Object.keys(old.geometry.attributes))assert.deepEqual(next.geometry.attributes[name].array,old.geometry.attributes[name].array);
  assert.equal(next.castShadow,old.castShadow);assert.equal(next.receiveShadow,old.receiveShadow);assert.equal(next.customDepthMaterial,old.customDepthMaterial);assert.equal(next.onBeforeShadow,old.onBeforeShadow);
  for(const p of [[0,2105,70],[0,2098,-70],[70,2120,0]]){const cam=new T.PerspectiveCamera(52,1.6,.25,220);cam.position.set(...p);cam.lookAt(0,2100,0);cam.updateMatrixWorld();const f=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));assert.equal(lod===0?next.intersectsFrustum(f):f.intersectsObject(next),lod===0?old.intersectsFrustum(f):f.intersectsObject(old));}
  disposeGrassFieldGeometry(old.geometry);old.dispose();release(c,next);
 }
});
test('near build skips only discarded per-instance sphere loop; middle still performs original loop',()=>{
 const original=T.InstancedMesh.prototype.computeBoundingSphere;let calls=0;T.InstancedMesh.prototype.computeBoundingSphere=function(){calls++;return original.call(this);};
 try{for(const lod of [0,1]){const c=context([0,2102,0]),tile={regular:roots,meshes:[]};WorldEcology.prototype.addGrassMesh.call(c,tile,lod);assert.equal(calls,lod);assert.ok(tile.meshes[lod].geometry.boundingSphere);release(c,tile.meshes[lod]);}}finally{T.InstancedMesh.prototype.computeBoundingSphere=original;}
});
