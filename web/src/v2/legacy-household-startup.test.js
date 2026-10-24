import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
globalThis.location={search:'?view=pastoral-house_a-entry&time=870&legacyRoomLazy=1'};
const {SettlementRuntime}=await import('./settlements.js');
const {SETTLEMENT_ASSETS}=await import('./settlement-assets.js');
const {legacyRooms,legacyRoomRegistry}=await import('./legacy-room-loader.js');
const {householdRoomKey}=await import('./household-room-fields.js');
const {householdStyle}=await import('./household-living.js');
const lighting={elevation:35,sun:new T.Vector3(.3,.8,.4).normalize(),color:new T.Color(1,.8,.6),intensity:3,visibility:1};
test('cold actual pastoral-house_a-entry first update then prepare waits for reused base and full household GI',async()=>{
 assert.equal(legacyRooms.stats.requests,0);assert.equal(legacyRoomRegistry.ROOM_BOUNCE_DATA.house_a,undefined);
 const id=SETTLEMENT_ASSETS.house_a.representativeId,world={entities:[{id,assetId:'house_a'}],surface:{heightAt:()=>0,buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}},r=new SettlementRuntime(world),camera=new T.PerspectiveCamera(60,1.6,.1,2000);
 try{const view=r.viewpoints.find(v=>v.id==='pastoral-house_a-entry');assert.ok(view);camera.position.set(view.x,view.y,view.z);const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180;camera.lookAt(camera.position.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));camera.updateMatrixWorld();
 r.update(camera,0,lighting);const key=householdRoomKey(householdStyle(id),id);assert.equal(r.indirect.field.key,key);assert.equal(r.indirect.field.uniforms.uRoomFieldActive.value,0);
 await r.indirect.field.prepare();r.update(camera,0,lighting);
 assert.equal(r.indirect.field.key,key);assert.equal(r.indirect.field.uniforms.uRoomFieldActive.value,1);assert.equal(r.indirect.contact.stats.field,key);assert.equal(r.indirect.contact.stats.active,true);assert.equal(r.indirect.field.stats.household.ready,true);assert.equal(r.indirect.field.stats.household.closedReady,true);
 assert.deepEqual([...legacyRooms.ready],['house_a'],'only household base needed, no other four old rooms');assert.equal(legacyRooms.stats.requests,1);assert.ok(r.indirect.field.solar.secondData[key]);
 camera.position.set(5000,1.6,5000);camera.updateMatrixWorld();r.update(camera,0,lighting);assert.equal(r.indirect.field.key,null);assert.equal(r.indirect.contact.stats.active,false);
 }finally{r.dispose();}
});
