import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {prepareTimberContinuity,applyTimberContinuity,validateTimberContinuity,timberContinuityEnabled}from './timber-continuity.js';
import {preserveAssetOcclusion}from './asset-occlusion.js';
import data from './timber-continuity-data.js';
const bytes=fs.readFileSync(new URL('../../public/assets/v2/house_a_lived.glb',import.meta.url));
const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),binary=bytes.subarray(28+length);
function attribute(index){
 const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],C={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType],size={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type],offset=(v.byteOffset||0)+(a.byteOffset||0),out=new C(a.count*size),read={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];
 for(let i=0;i<a.count;i++)for(let j=0;j<size;j++)out[i*size+j]=binary[read](offset+i*(v.byteStride||size*C.BYTES_PER_ELEMENT)+j*C.BYTES_PER_ELEMENT);
 return new THREE.BufferAttribute(out,size,Boolean(a.normalized));
}
function mesh(name){
 const node=doc.nodes.find(n=>n.name===name),p=doc.meshes[node.mesh].primitives[0],g=new THREE.BufferGeometry();
 for(const [key,semantic]of Object.entries({position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0',color:'COLOR_0'}))g.setAttribute(key,attribute(p.attributes[semantic]));
 g.setIndex(attribute(p.indices));const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial());m.name=name;m.material.name=doc.materials[p.material].name;return m;
}
test('accepted default repair binds untouched inputs and verified editable derived source',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),data.sourceSHA256);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../../'+data.sourceBlend,import.meta.url))).digest('hex'),data.blendSHA256);
 assert.equal(timberContinuityEnabled('?timberContinuity=1'),true);assert.equal(timberContinuityEnabled(''),true);assert.equal(timberContinuityEnabled('?timberContinuity=0'),false);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../../'+data.editableDerivedSource.path,import.meta.url))).digest('hex'),data.editableDerivedSource.sha256);
 assert.ok(data.editableDerivedSource.persistedNormalMaxError<.001);
 assert.equal(data.editableDerivedSource.sourceAndOriginalGLBUnchanged,true);
});
test('disabled path does not load data; other asset stays original',async()=>{
 const load=()=>{throw new Error('unexpected candidate load');};
 assert.equal(await prepareTimberContinuity('house_a',new THREE.Group(),{enabled:false,load}),null);
 assert.equal(await prepareTimberContinuity('yurt',new THREE.Group(),{enabled:true,load}),null);
});
test('candidate changes only side shading and retains full topology, UVs, caps and original source',async()=>{
 const scene=new THREE.Group(),side=mesh('house_a_log'),cap=mesh('house_a_logend');scene.add(side,cap);
 const sourceNormal=side.geometry.getAttribute('normal').array.slice(),sourceColor=side.geometry.getAttribute('color').array.slice(),capNormal=cap.geometry.getAttribute('normal').array.slice();
 const candidate=await prepareTimberContinuity('house_a',scene,{enabled:true});
 const derived=side.geometry.clone();preserveAssetOcclusion(derived,true);
 const before={position:derived.attributes.position.array.slice(),uv:derived.attributes.uv.array.slice(),index:derived.index.array.slice()};
 assert.equal(applyTimberContinuity(derived,side,candidate),true);
 assert.deepEqual(derived.attributes.position.array,before.position);assert.deepEqual(derived.attributes.uv.array,before.uv);assert.deepEqual(derived.index.array,before.index);
 assert.deepEqual(side.geometry.attributes.normal.array,sourceNormal);assert.deepEqual(side.geometry.attributes.color.array,sourceColor);
 assert.equal(applyTimberContinuity(cap.geometry,cap,candidate),false);assert.deepEqual(cap.geometry.attributes.normal.array,capNormal);
 assert.ok(derived.attributes.normal.array.some((v,i)=>Math.abs(v-sourceNormal[i])>.05));
 const ao=derived.attributes.assetOcclusion;assert.ok(Array.from(ao.array).some(v=>v<.5));assert.ok(Array.from(ao.array).some(v=>v>.9));
 // The defect was duplicate positions carrying different shading. Validate the actual payload.
 const groups=new Map(),p=derived.attributes.position,n=derived.attributes.normal;
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');if(groups.has(key)){const j=groups.get(key);assert.deepEqual([n.getX(i),n.getY(i),n.getZ(i),ao.getX(i),ao.getY(i)],[n.getX(j),n.getY(j),n.getZ(j),ao.getX(j),ao.getY(j)]);}else groups.set(key,i);}
 assert.equal(groups.size,data.uniquePositionCount);
 // Applying one prepared part must not mutate the reusable payload for another.
 derived.rotateY(.5);assert.notDeepEqual(derived.attributes.normal.array,candidate.normals);
 const second=side.geometry.clone();preserveAssetOcclusion(second,true);applyTimberContinuity(second,side,candidate);assert.deepEqual(second.attributes.normal.array,candidate.normals);
});
test('same counts with stale positions, UVs, indices or corrupt payload fail explicitly',async()=>{
 for(const name of ['position','uv','index']){
  const g=mesh('house_a_log').geometry;if(name==='index')g.index.setX(0,g.index.getX(0)+1);else g.getAttribute(name).setX(0,g.getAttribute(name).getX(0)+.01);
  await assert.rejects(validateTimberContinuity(g,data),/source binding mismatch/);
 }
 await assert.rejects(validateTimberContinuity(mesh('house_a_log').geometry,{...data,normals:''}),/length mismatch/);
});
