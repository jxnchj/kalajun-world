import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBoardwalkMaterials} from './boardwalk-material.js';
import {timberGeometry} from './boardwalk-timber.js';

test('wood maps have physical colour spaces and per-board offsets shared across all PBR channels',async()=>{
 const urls=[],textures=[];const surfaces=createBoardwalkMaterials({loadTexture:async url=>{urls.push(url);const t=new THREE.Texture();textures.push(t);return t;}});
 const first=surfaces.load();assert.equal(surfaces.load(),first);await first;assert.equal(urls.length,4);assert.equal(surfaces.ready,true);
 const [wood,end]=surfaces.materials;assert.equal(wood.map.colorSpace,THREE.SRGBColorSpace);assert.equal(end.map.colorSpace,THREE.SRGBColorSpace);assert.equal(wood.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(wood.roughnessMap.colorSpace,THREE.NoColorSpace);
 for(const texture of textures){assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);}
 const shader={vertexShader:'#include <uv_vertex>'};wood.onBeforeCompile(shader);for(const channel of ['vMapUv','vNormalMapUv','vRoughnessMapUv'])assert.ok(shader.vertexShader.includes(channel+'+=aTimberOffset;'));
 let disposed=0;textures.forEach(t=>t.addEventListener('dispose',()=>disposed++));surfaces.dispose();assert.equal(disposed,4);
});
test('missing wood image is a real failure, not a silently accepted untextured boardwalk',async()=>{
 const surfaces=createBoardwalkMaterials({loadTexture:async()=>null});await assert.rejects(surfaces.load(),/Missing boardwalk texture/);assert.equal(surfaces.ready,false);surfaces.dispose();
});
test('Blender grain runs along timber length and sawn end faces keep two-dimensional UVs',()=>{
 for(const [kind,grainAxis]of [['plank',0],['bearer',2],['post',1]]){
  const g=timberGeometry(kind),p=g.attributes.position,uv=g.attributes.uv,normal=g.attributes.normal;
  assert.equal(g.groups.length,2);assert.equal(new Set(g.index.array).size,p.count,'every original vertex remains exactly once');
  for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>g.index.getX(i+j)),cross=(uv.getX(ids[1])-uv.getX(ids[0]))*(uv.getY(ids[2])-uv.getY(ids[0]))-(uv.getY(ids[1])-uv.getY(ids[0]))*(uv.getX(ids[2])-uv.getX(ids[0]));assert.ok(Math.abs(cross)>1e-10,kind+' UV triangle must have area');
   if(group.materialIndex===0&&Math.abs(normal.getComponent(ids[0],grainAxis))<.01){const grain=ids.map(id=>p.getComponent(id,grainAxis)),v=ids.map(id=>uv.getY(id));for(let j=1;j<3;j++)assert.ok(Math.abs(Math.abs(v[j]-v[0])-Math.abs(grain[j]-grain[0])/2.1)<1e-6,kind+' long grain metric scale');}
  }g.dispose();
 }
});
