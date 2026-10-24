import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerOwnedShadowSide,ownedShadowSide} from './owned-shadow-policy.js';

function fixture(){
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),depth=new THREE.MeshDepthMaterial(),object=new THREE.Mesh(geometry,material);object.customDepthMaterial=depth;
 return {object,material,depth,geometry,policy:{material,depth,geometry,side:THREE.BackSide,assertValid(){}},dispose(){geometry.dispose();material.dispose();depth.dispose();}};
}
test('only explicit object ownership changes the pure effective-side query',()=>{
 const f=fixture();assert.equal(ownedShadowSide(f.object,f.material,f.depth),undefined);
 const before=Object.getOwnPropertyDescriptors(f.depth),release=registerOwnedShadowSide(f.object,{...f.policy,side:THREE.FrontSide});
 assert.equal(ownedShadowSide(f.object,f.material,f.depth),THREE.FrontSide,'zero-valued FrontSide is not absence');
 assert.deepEqual(Object.getOwnPropertyDescriptors(f.depth),before);assert.equal(ownedShadowSide(Object.create(f.object),f.material,f.depth),undefined,'compile proxy does not inherit registration');
 release();assert.equal(ownedShadowSide(f.object,f.material,f.depth),undefined);f.dispose();
});
test('duplicate registration rejects and stale cleanup cannot remove a later policy',()=>{
 const f=fixture(),first=registerOwnedShadowSide(f.object,f.policy);assert.throws(()=>registerOwnedShadowSide(f.object,f.policy),/already has/);
 first();const second=registerOwnedShadowSide(f.object,{...f.policy,side:THREE.DoubleSide});first();assert.equal(ownedShadowSide(f.object,f.material,f.depth),THREE.DoubleSide);second();second();assert.equal(ownedShadowSide(f.object,f.material,f.depth),undefined);f.dispose();
});
test('foreign substitutions and invalid contracts reject without material mutations or fallback',()=>{
 for(const mode of['material','depth','geometry','queried-material','queried-depth','validator']){
  const f=fixture(),foreign=fixture();let valid=true;const release=registerOwnedShadowSide(f.object,{...f.policy,assertValid(){if(!valid)throw new Error('invalid current contract');}});
  if(mode==='material')f.object.material=foreign.material;if(mode==='depth')f.object.customDepthMaterial=foreign.depth;if(mode==='geometry')f.object.geometry=foreign.geometry;if(mode==='validator')valid=false;
  const state=[f.material.side,f.depth.side,foreign.material.side,foreign.depth.side];assert.throws(()=>ownedShadowSide(f.object,mode==='queried-material'?foreign.material:f.material,mode==='queried-depth'?foreign.depth:f.depth),/foreign|invalid current/);
  assert.deepEqual([f.material.side,f.depth.side,foreign.material.side,foreign.depth.side],state);release();f.dispose();foreign.dispose();
 }
});
test('invalid initial registration leaves no policy behind',()=>{
 const f=fixture();for(const policy of[{...f.policy,side:999},{...f.policy,geometry:null},{...f.policy,assertValid:null},{...f.policy,assertValid(){throw new Error('invalid contract');}}]){
  assert.throws(()=>registerOwnedShadowSide(f.object,policy),/requires explicit|invalid contract/);assert.equal(ownedShadowSide(f.object,f.material,f.depth),undefined);
 }f.dispose();
});
