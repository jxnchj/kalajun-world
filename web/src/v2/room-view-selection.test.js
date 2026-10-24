import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Color} from 'three';
import {SettlementRuntime} from './settlements.js';
const sun={elevation:35,sun:new Vector3(.1,.6,.8).normalize(),color:new Color(1,.8,.6),intensity:3};
function worldPoint(pose,x,y,z){const c=Math.cos(pose.rot),s=Math.sin(pose.rot);return new Vector3(pose.x+c*x*pose.scale.x+s*z*pose.scale.z,pose.y+y*pose.scale.y,pose.z-s*x*pose.scale.x+c*z*pose.scale.z);}
function move(camera,pose,from,to){camera.position.copy(worldPoint(pose,...from));camera.lookAt(worldPoint(pose,...to));camera.updateMatrixWorld();}
function fixture(entities,poses){return new SettlementRuntime({entities,surface:{heightAt:()=>2099,buildingPose:e=>poses[e.id]}});}
const pose={x:100,y:2100,z:200,rot:.65,scale:{x:1.2,y:1.1,z:1.3}};
test('real settlement field survives rotated/scaled cabin threshold with identical room matrix, texture and door state',async()=>{
 const rooms=fixture([{id:'A',assetId:'house_a'}],{A:pose}),camera=new PerspectiveCamera(60,1,.05,100);let openness=.6,angle=60*Math.PI/180;const calls=[];
 rooms.setDoorOpenness(id=>{calls.push(id);return openness;},id=>[{angle,open:102*Math.PI/180}]);
 try{
  move(camera,pose,[1,1.5,2.29],[1,1.4,-1]);rooms.update(camera,0,sun);await rooms.indirect.field.prepare();rooms.update(camera,0,sun);
  const texture=rooms.indirect.uniforms.uRoomBounceField.value,data=texture.image.data.slice(),matrix=rooms.indirect.uniforms.uRoomWorldToLocal.value.clone(),powers=rooms.lights.map(l=>l.intensity),anchors=rooms.lights.map(l=>l.userData.anchor),version=texture.version;
  for(const z of [2.31,2.49,2.51,3.6,4.5]){
   rooms.lights.forEach(l=>l.shadow.needsUpdate=false);move(camera,pose,[1,1.5,z],[1,1.4,-1]);rooms.update(camera,0,sun);
   assert.equal(rooms.lightingRoom.id,'A');assert.equal(rooms.roomViewSelection.stats.reason,'visible-opening');assert.equal(rooms.indirect.key,'A');assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,1);
   assert.strictEqual(rooms.indirect.uniforms.uRoomBounceField.value,texture);assert.equal(texture.version,version);assert.deepEqual(texture.image.data,data);assert.ok(rooms.indirect.uniforms.uRoomWorldToLocal.value.equals(matrix));
   assert.deepEqual(rooms.lights.map(l=>l.intensity),powers);assert.deepEqual(rooms.lights.map(l=>l.userData.anchor),anchors);assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate));
  }
  assert.ok(calls.every(id=>id==='A'));openness=0;angle=0;rooms.update(camera,0,sun);assert.equal(rooms.indirect.uniforms.uRoomOpenings.value[0].w,0);assert.equal(rooms.lights[0].intensity,0);assert.ok(rooms.lights.slice(1).every(l=>l.intensity>0&&l.shadow.needsUpdate));
  move(camera,pose,[1,1.5,7],[1,1.5,20]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom,null);assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,0);assert.ok(rooms.lights.every(l=>l.intensity===0&&!l.castShadow));
 }finally{rooms.dispose();}
});
test('occupied room wins over visible neighbour; external selection always binds its own entity transform and field',()=>{
 const pA={x:0,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}},pB={...pA,x:9},rooms=fixture([{id:'A',assetId:'house_a'},{id:'B',assetId:'house_a'}],{A:pA,B:pB}),camera=new PerspectiveCamera(80,1,.05,100),calls=[];
 rooms.setDoorOpenness(id=>{calls.push(id);return id==='A'?.4:.8;});
 try{
  move(camera,pA,[3.3,1.5,2.2],[10,1.4,2.5]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom.id,'A');assert.equal(rooms.roomViewSelection.stats.reason,'occupied');
  move(camera,pB,[1,1.5,4],[1,1.4,0]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom.id,'B');assert.equal(calls.at(-1),'B');assert.equal(rooms.indirect.key,'B');
  const localB=worldPoint(pB,0,1,0).applyMatrix4(rooms.indirect.uniforms.uRoomWorldToLocal.value),localA=worldPoint(pA,0,1,0).applyMatrix4(rooms.indirect.uniforms.uRoomWorldToLocal.value),bounds=rooms.indirect.uniforms.uRoomBounds.value;
  assert.ok(Math.abs(localB.x)<1e-9);assert.ok(localA.x<bounds.x);assert.ok(rooms.lights.every(l=>l.userData.anchor.startsWith('B:')));
  move(camera,pB,[1,1.5,30],[1,1.4,0]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom,null);
 }finally{rooms.dispose();}
});
test('guest threshold retains existing fixtures and GI while interaction occupancy stays separate; adjacent room keeps its own switch',async()=>{
 const p={x:0,y:2100,z:0,rot:.4,scale:{x:1,y:1,z:1}},rooms=fixture([{id:'guest',assetId:'gh_lanchuan'}],{guest:p}),camera=new PerspectiveCamera(55,1,.05,100);
 try{
  move(camera,p,[2.7,1.5,3.2],[2.7,1.4,-1]);rooms.update(camera,0,sun);await rooms.indirect.field.prepare();rooms.update(camera,0,sun);
  const first=rooms.activeGuestRoom,texture=rooms.indirect.uniforms.uRoomBounceField.value,anchors=rooms.lights.map(l=>l.userData.anchor);rooms.fixtureControls.setMode(first.id,'on');rooms.update(camera,0,sun);const powers=rooms.lights.map(l=>l.intensity),data=texture.image.data.slice(),version=texture.version;
  for(const z of [3.26,3.39,3.41,4.8]){
   rooms.lights.forEach(l=>l.shadow.needsUpdate=false);move(camera,p,[2.7,1.5,z],[2.7,1.4,-1]);rooms.update(camera,0,sun);
   assert.equal(rooms.activeGuestRoom,null);assert.equal(rooms.fixtureControls.active,null);assert.strictEqual(rooms.lightingRoom,first);assert.equal(rooms.indirect.key,first.id);assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,1);
   assert.deepEqual(rooms.lights.map(l=>l.userData.anchor),anchors);assert.deepEqual(rooms.lights.map(l=>l.intensity),powers);assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate));assert.equal(texture.version,version);assert.deepEqual(texture.image.data,data);
  }
  rooms.fixtureControls.setMode(rooms.guestRooms[1].id,'off');move(camera,p,[8,1.5,4.1],[8,1.4,-1]);rooms.update(camera,0,sun);
  assert.equal(rooms.lightingRoom.id,rooms.guestRooms[1].id);assert.equal(rooms.indirect.key,rooms.guestRooms[1].id);assert.ok(rooms.lights.every(l=>l.intensity===0));assert.equal(rooms.fixtureControls.mode(first.id),'on');
  move(camera,p,[8,1.5,3.1],[2.7,1.4,-1]);rooms.update(camera,0,sun);assert.strictEqual(rooms.lightingRoom,rooms.activeGuestRoom);assert.equal(rooms.roomViewSelection.stats.reason,'occupied');
 }finally{rooms.dispose();}
});
test('window-side selection works without walking into the room and releases a distant invisible room',()=>{
 const p={x:0,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}},rooms=fixture([{id:'A',assetId:'house_a'}],{A:p}),camera=new PerspectiveCamera(60,1,.05,100);
 try{
  move(camera,p,[0,1.5,-4],[0,1.4,0]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom.id,'A');assert.equal(rooms.roomViewSelection.stats.openingKind,'window');
  move(camera,p,[0,1.5,-15.4],[0,1.4,0]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom.id,'A','existing room survives the 12m acquire radius within 14m retention');
  move(camera,p,[0,1.5,-18],[0,1.4,0]);rooms.update(camera,0,sun);assert.equal(rooms.lightingRoom,null);
 }finally{rooms.dispose();}
});
