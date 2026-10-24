import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import {createHash}from'node:crypto';import {gunzipSync}from'node:zlib';import * as THREE from 'three';
import {LODGE_CHAIRS_SOURCE as SOURCE,LODGE_CHAIRS_DOOR as DOOR,LODGE_CHAIRS_KEY as KEY,LODGE_CHAIRS_ASSET as ASSET,lodgeChairsEnabled}from'./lodge-chairs-definition.js';
import {LODGE_WHOLE_KEY,LODGE_WHOLE_GRID}from'./lodge-whole-definition.js';
import {validateLodgeChairsBase,loadLodgeChairsBase}from'./lodge-chairs-field.js';
import {RoomBounceField,decodeRoomField}from'./room-bounce-field.js';import {validateLodgeDoorGI}from'./lodge-door-gi.js';import {decodeSolarDirection}from'./room-solar-transport.js';import {decodeRoomContact}from'./room-contact.js';
import {decodeLodgeDoorPackage}from'./lodge-door-codec.js';import {SettlementRuntime}from'./settlements.js';import delivery from './lodge-chairs-package.json' with{type:'json'};import old from './lodge-furniture-data/0.js';
const states=await Promise.all([0,1,2].map(i=>import('./lodge-chairs-data/'+i+'.js').then(m=>m.default))),base=states[0];
const leaves=angle=>[{name:DOOR.name,angle,open:DOOR.open}],localFetch=async url=>new Response(await readFile(new URL('../../public/'+String(url).split('?')[0].replace(/^\.\//,''),import.meta.url)));
const lighting={sun:new THREE.Vector3(.7,.3,.3).normalize(),color:new THREE.Color(1,.8,.7),intensity:4,visibility:1};
test('new complete geometry binds three actual door bakes and contact; old field or mixed source is rejected',async()=>{
 validateLodgeChairsBase(base);assert.deepEqual(base.local.sky.size,LODGE_WHOLE_GRID.size);assert.equal(SOURCE.totalTriangles,114088);
 for(const[path,sha]of [['../../public/'+SOURCE.sourceGLB,SOURCE.sourceSHA256],['../../../'+SOURCE.sourceBlend,SOURCE.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),sha);
 assert.notEqual(SOURCE.sourceSHA256,old.local.sky.sourceSHA256);assert.throws(()=>validateLodgeChairsBase(old),/source differs/);
 for(let i=0;i<3;i++){
  const b=validateLodgeDoorGI(states[i],i,base.local,base.cross,KEY,DOOR),r=JSON.parse(await readFile(new URL('../../../tools/reports/lodge-chairs-gi-'+i+'-v38.json',import.meta.url)));
  assert.equal(r.opaqueFaces,SOURCE.totalTriangles-192,'all source triangles except unchanged original thin glazing participate');assert.equal(r.glassTriangles,12);assert.equal(r.sourceSHA256,SOURCE.sourceSHA256);assert.equal(r.blendSHA256,SOURCE.blendSHA256);assert.deepEqual(r.materialReflectance,SOURCE.materialReflectance);assert.equal(r.samples,96);assert.equal(r.surfaceSamples,32);assert.equal(r.sunDirections,81);assert.equal(r.centreRayTransmission,i===0?.9:1);assert.ok(Math.abs(r.worldLeafAxis[0]-Math.cos(i*.875))<1e-6);
  for(const group of ['local','cross'])for(const[name,f]of Object.entries(b[group])){
   assert.equal(f.sourceSHA256,SOURCE.sourceSHA256);assert.equal(f.blendSHA256,SOURCE.blendSHA256);
   if(name==='solar'||name==='secondSolar'){assert.equal(f.directions.length,81);for(let d=0;d<81;d++)assert.ok(decodeSolarDirection(f,d).every(Number.isFinite));}
   else if(name!=='apertures')assert.ok(decodeRoomField(f).every(v=>Number.isFinite(THREE.DataUtils.fromHalfFloat(v))));
  }
 }
 assert.equal(base.contact.spacing,.025);assert.equal(base.contact.samples,64);assert.deepEqual(base.contact.size,old.contact.size);assert.notDeepEqual(decodeRoomContact(base.contact),decodeRoomContact(old.contact),'new feet/appliances must use new contact field');
 const bad=structuredClone(base);bad.contact.sourceSHA256=old.local.sky.sourceSHA256;assert.throws(()=>validateLodgeChairsBase(bad),/contact source/);
});
test('new source delivery is lossless and corrupt packet fallback only uses same new full fields',async()=>{
 const packed=await readFile(new URL('../../public/'+delivery.delta.url,import.meta.url));assert.deepEqual(await decodeLodgeDoorPackage(gunzipSync(packed),{local:base.local,cross:base.cross}),states);
 const gzip=await readFile(new URL('../../public/'+delivery.base.url,import.meta.url));for(const body of[gzip,gunzipSync(gzip)]){const stats={};assert.deepEqual(await loadLodgeChairsBase({fetchImpl:async()=>new Response(body),stats}),base);assert.equal(stats.status,'gzip-base');}
 const bad=gzip.slice();bad[bad.length-4]^=1;let fallback=0;assert.deepEqual(await loadLodgeChairsBase({fetchImpl:async()=>new Response(bad),fallback:async()=>{fallback++;return{default:base};}}),base);assert.equal(fallback,1);await assert.rejects(loadLodgeChairsBase({fetchImpl:async()=>new Response(bad),fallback:async()=>({default:old})}),/source differs/);
});
test('new complete building route uses matching contact/GI, preserves all three final RGB states and clears at night/outside',async()=>{
 const savedLocation=globalThis.location,savedFetch=globalThis.fetch;globalThis.location={search:'?lodgeTables38=0'};let fetches=0;globalThis.fetch=async(...args)=>{fetches++;return localFetch(...args)};
 try{
  const pose={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}},r=new SettlementRuntime({entities:[{id:DOOR.entityId,assetId:DOOR.assetId}],surface:{heightAt:()=>2000,buildingPose:()=>pose}}),camera=new THREE.PerspectiveCamera();let angle=0;r.setDoorOpenness(()=>Math.min(angle/(Math.PI/2),1),()=>leaves(angle));
  const move=(x,z,elevation=45)=>{camera.position.set(x,2001.6,z);camera.lookAt(x+1,2001.6,z-.3);camera.updateMatrixWorld();r.update(camera,.016,elevation);};
  move(-2.1,2.3);await r.indirect.field.prepare();move(-2.1,2.3);const f=r.indirect.field;assert.equal(fetches,2);assert.equal(r.lodgeAsset,ASSET);
  for(const[x,z]of[[-8,0],[-2.1,2.3],[4.5,.1],[10.3,-.8]]){move(x,z);assert.equal(f.key,KEY);assert.equal(r.indirect.contact.key,KEY);assert.equal(f.lodgeDoor.stats.active,true);}
  for(angle of[0,.875,1.75]){move(-2.1,2.3);f.setLighting(lighting,1);const actual=f.composeBuffers.get(KEY).slice(),expected=new Uint16Array(actual.length),u=f.uniforms;assert.ok(f.lodgeDoor.compose(KEY,expected,u.uRoomFieldNormalToLocal.value,lighting,f.lodgeCross.lighting,1,1,u.uRoomSkySecondBounce.value,u.uRoomSunTransport.value,u.uRoomSunSecondBounce.value,true));let energy=0;for(let i=0;i<actual.length;i++)if(i%4!==3){assert.equal(actual[i],expected[i]);energy+=Math.abs(THREE.DataUtils.fromHalfFloat(actual[i]));}assert.ok(energy>0);assert.equal(f.doors.stats.pending,false);}
  f.setLighting({...lighting,intensity:0},0);assert.ok(f.composeBuffers.get(KEY).every((v,i)=>i%4===3||Math.abs(THREE.DataUtils.fromHalfFloat(v))===0));move(4.5,.1,-17);assert.equal(f.uniforms.uRoomFieldActive.value,0);assert.equal(f.lodgeDoor.stats.active,false);move(100,100);assert.equal(f.key,null);assert.equal(f.doors.stats.bypassedBy,null);move(4.5,.1);assert.equal(f.key,KEY);assert.equal(f.lodgeDoor.angle,1.75);assert.equal(fetches,2);r.dispose();
 }finally{globalThis.location=savedLocation;globalThis.fetch=savedFetch;}
});

test('adopted chair GI is lazy outside lodge and preserves explicit legacy comparison',()=>{const saved=globalThis.location;try{globalThis.location={search:'?lodgeTables38=0'};const baseline=new RoomBounceField();assert.equal(baseline.lodgeKey,KEY);baseline.dispose();globalThis.location={search:'?lodgeTables38=0'};const f=new RoomBounceField();assert.equal(f.lodgeKey,KEY);assert.equal(f.lodgeDoor.door,DOOR);f.set({sourceAsset:'house_a'},new THREE.Quaternion());assert.equal(f.lodgePending,null);assert.equal(f.lodgeDoor.pending,null);f.dispose();globalThis.location={search:'?lodgeChairs38=0'};const prior=new RoomBounceField();assert.notEqual(prior.lodgeKey,KEY);prior.dispose();}finally{globalThis.location=saved;}});
