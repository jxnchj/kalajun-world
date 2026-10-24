// This regression exercises the retained original guest-room source tables.
globalThis.location={search:'?guestVanity38=0'};
import {assertRoomFieldSamplingContract} from './room-field-contract.assert.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {ROOM_APERTURE_DATA} from './room-aperture-registry.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from './room-bounce-field.js';
import {ROOM_BOUNCE_GLSL} from './room-lighting.js';
import {SettlementRuntime} from './settlements.js';
const unpack=f=>Uint8Array.from(atob(f.data),c=>c.charCodeAt(0));
const lighting={sun:new THREE.Vector3(.3,.8,.4).normalize(),color:new THREE.Color(1,.7,.5),intensity:3};
function assertTransport(a,b){
 const count=a.length/16;
 for(let i=0;i<a.length;i++)if(i%4!==3||i<count*4)assert.equal(a[i],b[i],'RGB and constant-slab validity must remain byte-identical '+i);
}
function sample(field,p){
 const data=unpack(field),n=field.size.reduce((a,b)=>a*b,1);
 const q=p.map((v,i)=>THREE.MathUtils.clamp((v-field.bounds[0][i])/(field.bounds[1][i]-field.bounds[0][i]),0,1)*(field.size[i]-1));
 const out=[0,0,0];
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
   const side=[x,y,z],index=q.map((v,i)=>Math.min(field.size[i]-1,Math.floor(v)+side[i])),w=q.reduce((s,v,i)=>s*(side[i]?v-Math.floor(v):1-v+Math.floor(v)),1);
   const i=(index[2]*field.size[1]+index[1])*field.size[0]+index[0];
   for(let k=0;k<3;k++)out[k]+=w*data[k*n+i]/255;
 }
 return out;
}
test('five aperture fields match source geometry with an independent bounded visibility channel',async()=>{
 assert.deepEqual(Object.keys(ROOM_APERTURE_DATA).sort(),Object.keys(ROOM_BOUNCE_DATA).sort());let bytes=0;
 for(const[key,f]of Object.entries(ROOM_APERTURE_DATA)){
  const base=ROOM_BOUNCE_DATA[key],data=unpack(f),n=base.size.reduce((a,b)=>a*b,1);bytes+=data.byteLength;
  for(const prop of['bounds','size','validProbes','sourceSHA256','blendSHA256','openings'])assert.deepEqual(f[prop],base[prop]);
  for(const [path,sha]of [['../../public/'+f.sourceGLB,f.sourceSHA256],['../../../'+f.sourceBlend,f.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),sha);
  assert.equal(data.length,n*3);assert.equal(f.apertureSamples,36);assert.equal(f.crownSamples,32);
  for(const value of data)assert.ok(value>=0&&value<=255);
  for(let o=f.openings.length;o<3;o++)for(let i=0;i<n;i++)assert.equal(data[o*n+i],0);
  assert.ok(f.summary.some(s=>s.fullyBlockedProbes>0));assert.ok(f.summary.some(s=>s.maxVisibility>.9));
 }
 const source=await readFile(new URL('./room-aperture-data.js',import.meta.url));
 assert.equal(bytes,5805);console.log(JSON.stringify({rooms:5,rawBytes:bytes,sourceBytes:source.length,gzipBytes:gzipSync(source).length,extraGPUBytes:0,extraSamples:0}));
});
test('packing preserves every reflection RGB and validity bit, does not grow textures, and A/B restores full old buffer',async()=>{
 const field=new RoomBounceField();
 for(const[key,source]of Object.entries(ROOM_APERTURE_DATA)){
  field.set({bounceField:key},new THREE.Quaternion());await field.prepare();
  field.uniforms.uRoomApertureVisibility.value=0;field.setLighting(lighting,1);const texture=field.uniforms.uRoomBounceField.value,old=texture.image.data.slice();
  field.uniforms.uRoomApertureVisibility.value=1;field.setLighting(lighting,1);const packed=texture.image.data,sourceData=unpack(source),count=old.length/16;
  assert.strictEqual(field.uniforms.uRoomBounceField.value,texture);assertTransport(packed,old);assert.notDeepEqual(packed,old);
  for(let o=0;o<3;o++)for(let i=0;i<count;i++)assert.equal(packed[(o+1)*count*4+i*4+3],THREE.DataUtils.toHalfFloat(sourceData[o*count+i]/255));
  const version=texture.version;for(let i=0;i<60;i++)field.setLighting(lighting,1);assert.equal(texture.version,version,'stationary state does not reupload');
  field.uniforms.uRoomApertureVisibility.value=0;field.setLighting(lighting,1);assert.deepEqual(texture.image.data,old);
 }
 assert.equal([...field.cache.values()].reduce((n,t)=>n+t.image.data.byteLength,0),61920);assert.equal(field.stats.aperture.cacheBytes,5805);
 field.dispose();assert.equal(field.stats.aperture.cacheBytes,0);assert.equal(field.stats.aperture.active,false);
});
test('visibility is bounded and continuous across probe cell borders without nearest-neighbour bands',()=>{
 for(const f of Object.values(ROOM_APERTURE_DATA))for(let z=1;z<f.size[2]-1;z++)for(let y=1;y<f.size[1]-1;y++)for(let x=1;x<f.size[0]-1;x++){
  const p=[x,y,z].map((v,i)=>THREE.MathUtils.lerp(f.bounds[0][i],f.bounds[1][i],v/(f.size[i]-1))),a=sample(f,p),b=sample(f,[p[0]+.00001,p[1],p[2]]);
  for(let i=0;i<3;i++){assert.ok(a[i]>=0&&a[i]<=1.00001);assert.ok(Math.abs(a[i]-b[i])<.002);}
 }
});
test('default full lamp transport remains byte-identical in all three rooms during day and night',async()=>{
 const pose={x:0,y:2000,z:0,rot:.64,scale:{x:1,y:1,z:1}},runtime=new SettlementRuntime({entities:[{id:'guest',assetId:'gh_lanchuan'}],surface:{heightAt:()=>pose.y,buildingPose:()=>pose}}),camera=new THREE.PerspectiveCamera();
 try{for(const view of runtime.viewpoints.filter(v=>v.roomId)){
  camera.position.set(view.x,view.y,view.z);camera.updateMatrixWorld();runtime.update(camera,0,-8);await runtime.indirect.field.prepare();
  for(const elevation of[-8,65]){
   const f=runtime.indirect.field;f.uniforms.uRoomApertureVisibility.value=0;runtime.update(camera,0,elevation);const old=f.uniforms.uRoomBounceField.value.image.data.slice();
   f.uniforms.uRoomApertureVisibility.value=1;runtime.update(camera,0,elevation);assertTransport(f.uniforms.uRoomBounceField.value.image.data,old);
  }
 }}finally{runtime.dispose();}
});
test('shader reuses four field taps and visibility affects direct diffuse sky only',()=>{
 assertRoomFieldSamplingContract();assert.equal((ROOM_FIELD_GLSL.match(/sampler3D/g)||[]).length,1);
 assert.equal((ROOM_BOUNCE_GLSL.match(/apertureVisibility\[i\]/g)||[]).length,1);assert.match(ROOM_BOUNCE_GLSL,/diffuseEnergy\+=diffuseAperture\*apertureVisibility\[i\]/);
 assert.match(ROOM_BOUNCE_GLSL,/fieldIrradiance\*2.4\*uRoomFieldDayScale/);assert.match(ROOM_BOUNCE_GLSL,/windowReturn\+=visible\*aperture\*spread\*transmission/);
 for(const [input,expected]of[[undefined,1],[0,0],['0',0],[1,1],['invalid',1]]){const f=new RoomBounceField({apertureVisibility:input});assert.equal(f.uniforms.uRoomApertureVisibility.value,expected);f.dispose();}
});
