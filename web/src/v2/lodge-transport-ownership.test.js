import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import * as THREE from 'three';
import {RoomBounceField} from './room-bounce-field.js';import {LODGE_DINING_ASSET}from'./lodge-opening.js';import {LODGE_WHOLE_ASSET}from'./lodge-whole-definition.js';import {LODGE_DOOR}from'./lodge-door.js';
const lighting={sun:new THREE.Vector3(.7,.3,.3).normalize(),color:new THREE.Color(1,.8,.7),intensity:4,visibility:1};
const leaves=angle=>[{name:LODGE_DOOR.name,angle,open:LODGE_DOOR.open}];
const localFetch=async url=>new Response(await readFile(new URL('../../public/'+String(url).split('?')[0].replace(/^\.\//,''),import.meta.url)));
for(const whole of [false,true])test('real '+(whole?'whole lodge':'original dining')+' RGB survives closed/half/open door composition; loading and night remain correct',async()=>{
 const oldLocation=globalThis.location,oldFetch=globalThis.fetch;globalThis.location={search:whole?'?lodgeFurniture=0':'?lodgeFurniture=0&lodgeWholeGI=0'};globalThis.fetch=localFetch;
 const f=new RoomBounceField();let release;const gate=new Promise(r=>release=r),load=f.lodgeDoor.load;
 f.lodgeDoor.load=async stats=>{await gate;if(load)return load(stats);const local=(await import('./lodge-room-data.js')).default,cross=(await import('./lodge-cross-data.js')).default,modules=await Promise.all([0,1,2].map(i=>import('./lodge-door-data/'+i+'.js').then(m=>m.default)));return{local,cross,modules};};
 try{
  f.setDoorAngles(leaves(0));f.setDoorOpenness(0);f.set(whole?LODGE_WHOLE_ASSET:LODGE_DINING_ASSET,new THREE.Quaternion());await f.prepareLodge();f.setLighting(lighting,1);
  assert.equal(f.lodgeDoor.stats.pending,true);assert.equal(f.lodgeDoor.stats.active,false);assert.equal(f.doors.stats.bypassedBy,null);assert.equal(f.doors.stats.pending,true);
  const pendingRGB=f.composeBuffers.get(f.key),closedCrossOnly=new Uint16Array(pendingRGB.length),pu=f.uniforms;
  // Original dining retains its independently prepared closed-door east-room
  // return; whole lodge has no separate compatibility field. Neither may use
  // an unprepared open-door local transport as a fallback.
  f.lodgeCross.apply(f.key,closedCrossOnly,pu.uRoomFieldNormalToLocal.value,lighting,1,1,pu.uRoomSkySecondBounce.value,pu.uRoomSunTransport.value,pu.uRoomSunSecondBounce.value);
  for(let i=0;i<pendingRGB.length;i++)if(i%4!==3)assert.equal(pendingRGB[i],closedCrossOnly[i],'loading retains only valid independently prepared closed source');
  release();await f.prepare();
  for(const angle of [0,.875,1.75]){
   f.setDoorAngles(leaves(angle));f.setDoorOpenness(Math.min(angle/(Math.PI/2),1));f.setLighting(lighting,1);
   const actual=f.composeBuffers.get(f.key).slice(),u=f.uniforms,expected=new Uint16Array(actual.length);
   assert.ok(f.lodgeDoor.compose(f.key,expected,u.uRoomFieldNormalToLocal.value,lighting,f.lodgeCross.lighting,1,1,u.uRoomSkySecondBounce.value,u.uRoomSunTransport.value,u.uRoomSunSecondBounce.value,f.lodgeCross.enabled));
   let energy=0;for(let i=0;i<actual.length;i++)if(i%4!==3){assert.equal(actual[i],expected[i],'preserve actual baked transport component '+i+' at '+angle);energy+=Math.abs(THREE.DataUtils.fromHalfFloat(actual[i]));}
   assert.ok(energy>0,'closed/half/open all receive physical window and interior transport');assert.equal(f.doors.stats.pending,false);assert.equal(f.doors.stats.bypassedBy,'lodge-articulated');
   f.setLighting({...lighting,intensity:0},0);assert.ok(f.composeBuffers.get(f.key).every((v,i)=>i%4===3||Math.abs(THREE.DataUtils.fromHalfFloat(v))===0),'no residual daylight at night');
  }
  f.clear();assert.equal(f.doors.stats.bypassedBy,null);assert.equal(f.doors.stats.pending,false);
 }finally{release();f.dispose();globalThis.location=oldLocation;globalThis.fetch=oldFetch;}
});
