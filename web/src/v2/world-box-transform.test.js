import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Matrix4,Euler,Quaternion,Group,InstancedMesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {transformWorldBox} from './world-box-transform.js';
let seed=192731;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
test('translated finite geographic boxes match all eight transformed corners exactly',()=>{
 for(let i=0;i<6000;i++){
  const a=new Vector3((rand()-.5)*1e5,(rand()-.5)*1e4,(rand()-.5)*1e5),b=a.clone().add(new Vector3(rand()*500,rand()*500,rand()*500));
  const box=new Box3(a,b),matrix=new Matrix4().makeTranslation((rand()-.5)*1e5,(rand()-.5)*1e5,(rand()-.5)*1e5);
  assert.deepEqual(transformWorldBox(new Box3(),box,matrix),box.clone().applyMatrix4(matrix));
  assert.deepEqual(transformWorldBox(box.clone(),box.clone(),matrix,false),box.clone().applyMatrix4(matrix));
 }
});
test('in-place edits, rotation, scale, shear, projection, empty and signed zero use exact bounds',()=>{
 const box=new Box3(new Vector3(-0,-2,-3),new Vector3(0,4,8)),m=new Matrix4();
 for(let i=0;i<16;i++){
  m.identity();m.elements[i]+=.019;
  assert.deepEqual(transformWorldBox(new Box3(),box,m),box.clone().applyMatrix4(m));
 }
 for(const candidate of [box,new Box3(),new Box3(new Vector3(-Infinity,-2,-3),new Vector3(Infinity,4,8))]){
  for(const m of [new Matrix4(),new Matrix4().makeTranslation(-0,32,-8),new Matrix4().makeRotationY(.3)])assert.deepEqual(transformWorldBox(new Box3(),candidate,m),candidate.clone().applyMatrix4(m));
 }
});
test('fixed structure local matrix keeps following parent while entity matrices change',()=>{
 const g=new BoxGeometry(),mat=new MeshBasicMaterial(),root=new Group(),fast=new InstancedMesh(g,mat,1),reference=new InstancedMesh(g,mat,1);
 fast.position.set(320,0,-640);reference.position.copy(fast.position);fast.updateMatrix();fast.matrixAutoUpdate=false;root.add(fast,reference);
 for(let i=0;i<40;i++){
  root.position.set(i,-i*2,i*.2);root.rotation.set(i*.013,i*.031,i*.02);root.scale.set(1+i*.01,1,1-i*.004);root.updateMatrixWorld();
  const pose=new Matrix4().compose(new Vector3(i,2,3),new Quaternion().setFromEuler(new Euler(0,i*.1,0)),new Vector3(1,1,1));
  fast.setMatrixAt(0,pose);reference.setMatrixAt(0,pose);fast.computeBoundingBox();reference.computeBoundingBox();
  assert.deepEqual(fast.matrixWorld,reference.matrixWorld);assert.deepEqual(transformWorldBox(new Box3(),fast.boundingBox,fast.matrixWorld),reference.boundingBox.clone().applyMatrix4(reference.matrixWorld));
 }
 fast.dispose();reference.dispose();g.dispose();mat.dispose();
});
