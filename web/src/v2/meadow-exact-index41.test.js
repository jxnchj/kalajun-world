import test from'node:test';import assert from'node:assert/strict';import * as T from'three';import{meadowGeometry}from'./ecology.js';import{compactMeadowLeafIndex41}from'./meadow-exact-index41.js';
test('actual middle and near preserve every nondegenerate primitive and full source attributes',()=>{for(const near of[false,true]){const source=meadowGeometry(near),r=compactMeadowLeafIndex41(source),removed=new Set(r.removedTriangles);assert.equal(r.sourceTriangles,near?245:69);assert.equal(r.triangles,near?221:45);assert.equal(removed.size,24);for(const name of Object.keys(source.attributes)){assert.deepEqual(new Uint8Array(r.geometry.attributes[name].array.buffer),new Uint8Array(source.attributes[name].array.buffer),name);assert.equal(r.geometry.attributes[name].itemSize,source.attributes[name].itemSize);}const expected=[];for(let i=0;i<source.index.count;i+=3)if(!removed.has(i/3))expected.push(...source.index.array.slice(i,i+3));assert.deepEqual(Array.from(r.geometry.index.array),expected);source.dispose();r.geometry.dispose();}});
test('collapsed leaf tips stay identical under arbitrary root transform and non-linear position/wind deformation',()=>{const source=meadowGeometry(false),{geometry,removedTriangles}=compactMeadowLeafIndex41(source),p=source.attributes.position,w=source.attributes.aPlantWind;for(let phase=0;phase<12;phase++){const matrix=new T.Matrix4().compose(new T.Vector3(-7070+phase,2200,2670),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),phase*.31),new T.Vector3(.8+phase*.03,1.1,.8+phase*.03));const deform=i=>{const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dx=Math.sin(phase+w.getZ(i))*w.getX(i)**2,dz=Math.cos(phase+w.getZ(i))*w.getY(i);return new T.Vector3(x+dx,y-.55*(dx*dx+dz*dz),z+dz).applyMatrix4(matrix);};for(const index of removedTriangles){const pts=[0,1,2].map(j=>deform(source.index.getX(index*3+j)));assert.ok(pts[0].equals(pts[1])||pts[1].equals(pts[2])||pts[2].equals(pts[0]));}}source.dispose();geometry.dispose();});
test('does not delete merely small or initially collinear triangles with independent deformation inputs',()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1e-8,0,0,0,1e-8,0,0,0,0,1,0,0,2,0,0],3));g.setAttribute('aPlantWind',new T.Float32BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,0,0,1],3));g.setIndex([0,1,2,3,4,5]);const r=compactMeadowLeafIndex41(g);assert.deepEqual(Array.from(r.geometry.index.array),[0,1,2,3,4,5]);g.addGroup(0,3,0);assert.throws(()=>compactMeadowLeafIndex41(g),/complete unmorphed/);g.dispose();r.geometry.dispose();});

test('production opt-in changes only ordinary render indices, with wet/seating sources and root fields intact',async()=>{
 const {WorldEcology}=await import('./ecology.js');
 const world={entities:[],objects:{},landcoverAt:()=>({r:.05,g:.02,b:0,a:0}),surface:{heightAt:(x,z)=>100+Math.sin(x*.01),normalAt:()=>({x:0,y:1,z:0})}};
 const previous=globalThis.location,ecologies=[];
 try{
  for(const search of['','?meadowExact41=0','?meadowExact41=1']){
   globalThis.location={search};const e=new WorldEcology(world);ecologies.push(e);
   e.habitat=(x,z,c)=>c===0?.4:.3;
   const regular=[];for(let z=-8;z<8;z++)for(let x=-8;x<8;x++){const r=e.grassAt(x,z);if(r)regular.push(r);}
   assert.ok(regular.length>0);const tile={regular,meshes:[null,null]};e.addGrassMesh(tile,0);e.addGrassMesh(tile,1);e.testTile=tile;
  }
  const [baseline,off,on]=ecologies;assert.equal(baseline.grassRenderGeometries41,null);assert.equal(off.grassRenderGeometries41,null);
  assert.deepEqual(on.stats.meadowExactIndex41,{enabled:true,lods:[{sourceTriangles:245,triangles:221},{sourceTriangles:69,triangles:45}]});
  assert.deepEqual(on.testTile.regular,baseline.testTile.regular);
  for(let lod=0;lod<2;lod++){
   const a=baseline.testTile.meshes[lod],b=on.testTile.meshes[lod];
   assert.deepEqual(on.grassGeometries[lod].index.array,baseline.grassGeometries[lod].index.array);
   assert.notEqual(b.geometry.userData.grassFieldSource,on.grassGeometries[lod]);
   assert.equal(b.geometry.userData.grassFieldSource,on.grassRenderGeometries41[lod]);
   assert.equal(b.count,a.count);assert.deepEqual(b.instanceMatrix.array,a.instanceMatrix.array);
   for(const name of Object.keys(a.geometry.attributes))assert.deepEqual(b.geometry.attributes[name].array,a.geometry.attributes[name].array,name);
   assert.equal(b.material.side,a.material.side);assert.equal(b.material.flatShading,a.material.flatShading);
   assert.equal(b.castShadow,a.castShadow);assert.equal(b.receiveShadow,a.receiveShadow);
   assert.deepEqual(b.boundingSphere,a.boundingSphere);
  }
  assert.deepEqual(on.shoreGrassEnvelope,baseline.shoreGrassEnvelope);
  let disposed=0;on.grassRenderGeometries41.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  ecologies.forEach(e=>e.dispose());ecologies.length=0;assert.equal(disposed,2);
 }finally{ecologies.forEach(e=>e.dispose());if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
