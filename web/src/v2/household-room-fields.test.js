import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {prepareHouseholdRoom,validateHouseholdRoomBundle,householdRoomKey} from './household-room-fields.js';
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from './room-bounce-field.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-data.js';
import {ROOM_SECOND_BOUNCE_DATA} from './room-second-bounce-data.js';
import {ROOM_TRANSPORT_DATA} from './room-transport-data.js';
import {ROOM_CONTACT_DATA} from './room-contact-data.js';
import {decodeRoomContact} from './room-contact.js';
import {decodeSolarDirection} from './room-solar-transport.js';
import {SETTLEMENT_ASSETS} from './settlement-assets.js';
import {SettlementRuntime} from './settlements.js';
import {householdStyle} from './household-living.js';
const bundles=await Promise.all([0,1,2].map(i=>prepareHouseholdRoom(householdRoomKey(i))));
const lighting={sun:new T.Vector3(.3,.8,.4).normalize(),color:new T.Color(1,.7,.5),intensity:3,elevation:35};
const asset=i=>({...SETTLEMENT_ASSETS.house_a,bounceField:householdRoomKey(i)});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('all three source-complete household fields match current original and outdoor Blender/GLB bytes',async()=>{
 for(const b of bundles){
  const f=b.sky;assert.equal(f.sourceSHA256,sha(await readFile(new URL('../../public/'+f.sourceGLB,import.meta.url))));assert.equal(f.blendSHA256,sha(await readFile(new URL('../../../'+f.sourceBlend,import.meta.url))));
  for(const ext of b.externalSources){assert.equal(ext.sourceSHA256,sha(await readFile(new URL('../../public/'+ext.sourceGLB,import.meta.url))));assert.equal(ext.blendSHA256,sha(await readFile(new URL('../../../'+ext.sourceBlend,import.meta.url))));}
  assert.equal(validateHouseholdRoomBundle(b).key,b.key);assert.equal(f.validProbes,239);assert.deepEqual(f.size,[9,5,7]);
 }
});
test('all open/closed sky, sun and aperture fields retain original indoor grid and finite coefficients',()=>{
 const base=decodeRoomField(ROOM_BOUNCE_DATA.house_a);
 for(const b of bundles)for(const endpoint of[b,b.closed]){
  for(const kind of['sky','secondSky']){const data=decodeRoomField(endpoint[kind]);assert.equal(data.length,base.length);for(let i=0;i<data.length;i++){assert.ok(Number.isFinite(T.DataUtils.fromHalfFloat(data[i])));if(i%4===3)assert.equal(data[i],base[i]);}}
  for(const kind of['solar','secondSolar'])for(let i=0;i<endpoint[kind].directions.length;i++){const a=decodeSolarDirection(endpoint[kind],i);assert.equal(a.length,315*12);assert.ok(a.every(Number.isFinite));}
  assert.equal(atob(endpoint.apertures.data).length,315*3);
 }
});
test('only byte-identical payloads share the base; changed second-order transfers are retained',()=>{
 for(const b of bundles){assert.strictEqual(b.solar.directions,ROOM_TRANSPORT_DATA.house_a.directions);assert.strictEqual(b.contact.data,ROOM_CONTACT_DATA.house_a.data);assert.notEqual(b.secondSky.data,ROOM_SECOND_BOUNCE_DATA.house_a.data);}
 assert.strictEqual(bundles[0].sky.data,ROOM_BOUNCE_DATA.house_a.data);assert.strictEqual(bundles[1].sky.data,ROOM_BOUNCE_DATA.house_a.data);assert.notEqual(bundles[2].sky.data,ROOM_BOUNCE_DATA.house_a.data);
 assert.deepEqual(decodeRoomContact(bundles[0].contact),decodeRoomContact(ROOM_CONTACT_DATA.house_a));
});
test('runtime waits for correct complete variant and closed-door endpoint without changing samplers',async()=>{
 assert.equal((ROOM_FIELD_GLSL.match(/texture\(uRoomBounceField/g)||[]).length,4);
 const f=new RoomBounceField(),q=new T.Quaternion();try{
  for(let i=0;i<3;i++){
   f.setDoorOpenness(0);f.set(asset(i),q);assert.equal(f.stats.household.ready,false);f.setLighting(lighting,1);assert.equal(f.uniforms.uRoomFieldActive.value,0);
   await f.prepare();assert.equal(f.key,householdRoomKey(i));assert.equal(f.stats.household.ready,true);assert.equal(f.stats.household.closedReady,true);assert.equal(f.stats.household.pending,false);assert.ok(f.doors.fields.has(f.key));f.setLighting(lighting,1);
   const texture=f.uniforms.uRoomBounceField.value,closed=texture.image.data.slice();assert.equal(texture.image.depth,28);assert.equal(closed.length,5040);assert.equal(f.doors.stats.pending,false);
   f.setDoorOpenness(1);f.setLighting(lighting,1);const open=texture.image.data.slice();assert.ok(open.some((v,j)=>j%4!==3&&v!==closed[j]));f.setDoorOpenness(0);f.setLighting(lighting,1);assert.deepEqual(texture.image.data,closed);
  }
 }finally{f.dispose();}
});
test('switching households during preparation cannot install stale transforms or wrong closed data',async()=>{
 const f=new RoomBounceField(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.7);f.set(asset(0),new T.Quaternion());const first=f.prepare();f.set(asset(2),q);await f.prepare();await first;assert.equal(f.key,householdRoomKey(2));assert.equal(f.uniforms.uRoomBounceField.value.name,'room-indirect-field-'+f.key);assert.equal(f.stats.household.key,f.key);assert.equal(f.stats.household.closedReady,true);const expected=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)).transpose();assert.deepEqual(f.uniforms.uRoomFieldNormalToLocal.value.elements,expected.elements);f.dispose();
 const disposed=new RoomBounceField();disposed.set(asset(1),q);const pending=disposed.prepare();disposed.dispose();await pending;assert.equal(disposed.cache.size,0);assert.equal(disposed.key,null);
});
test('three actual usage identities select corresponding fields and contact maps through settlement path',async()=>{
 const ids=[];for(let n=0;ids.length<3;n++){const id='household-fixture-'+n,style=householdStyle(id);if(!ids[style])ids[style]=id;}for(let style=0;style<3;style++){if(!ids[style]){for(let n=0;;n++){const id='house-'+n;if(householdStyle(id)===style){ids[style]=id;break;}}}}
 const entities=ids.map((id,i)=>({id,assetId:'house_a',i})),r=new SettlementRuntime({entities,surface:{heightAt:()=>0,buildingPose:e=>({x:e.i*30,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}}),camera=new T.PerspectiveCamera();
 try{for(let i=0;i<3;i++){camera.position.set(i*30,1.5,0);camera.updateMatrixWorld();r.update(camera,0,lighting);await r.indirect.field.prepare();r.update(camera,0,lighting);assert.equal(r.indirect.field.key,householdRoomKey(i));assert.equal(r.indirect.contact.stats.field,householdRoomKey(i));assert.equal(r.lights.length,3);}}finally{r.dispose();}
});
test('stale external geometry metadata fails instead of silently reusing the old room field',()=>{
 const b=structuredClone(bundles[0]);b.externalSources[0].sourceSHA256='0'.repeat(64);assert.throws(()=>validateHouseholdRoomBundle(b),/geometry source differs/);
});
