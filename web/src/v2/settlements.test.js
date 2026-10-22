import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3, Color } from "three";
import { SettlementRuntime } from "./settlements.js";

function fixture(){
  const pose={x:100,y:2100,z:200,rot:.65,scale:{x:1.2,y:1,z:1.2}};
  const world={entities:[{id:"lanchuan",assetId:"gh_lanchuan"}],surface:{buildingPose:()=>pose,heightAt:()=>2099}};
  const runtime=new SettlementRuntime(world);
  // This original non-unit-scale fixture verifies the legacy lamp contract.
  // Default unit-scale lamp transport is exercised in room-fixture-transport.test.
  runtime.indirect.field.uniforms.uRoomFixtureBounce.value=0;
  return runtime;
}
test("occupied rooms share a bounded downward shadowed lamp pool; outdoor light is zero",()=>{
  const rooms=fixture(),camera=new PerspectiveCamera(),v=rooms.viewpoints[0];
  assert.ok(rooms.lights.every(l=>!l.castShadow),"unallocated lamp shadow maps must not enter outdoor shaders");
  camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();
  rooms.update(camera,0,65);
  assert.equal(rooms.lights.length,3);
  for(const light of rooms.lights){
    assert.ok(light.isSpotLight && light.castShadow);
    assert.ok(light.intensity>0 && light.intensity<25);
    assert.ok(light.target.position.y<light.position.y);
    assert.equal(light.shadow.autoUpdate,false);
    assert.equal(light.shadow.needsUpdate,true);
    light.shadow.needsUpdate=false;
  }
  rooms.update(camera,0,65);
  assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate),"fixed fixtures do not redraw their shadow every frame");
  const day=rooms.lights.map(l=>l.intensity);
  rooms.update(camera,0,-5);
  assert.ok(rooms.lights.every((l,i)=>l.intensity>day[i]));
  camera.position.set(800,2400,900);camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.ok(rooms.lights.every(l=>l.intensity===0&&!l.castShadow));
  rooms.dispose();assert.equal(rooms.group.children.length,0);
});
test("every authored room viewpoint remains above its rotated floor",()=>{
  const rooms=fixture();
  assert.equal(rooms.viewpoints.length,4);
  for(const v of rooms.viewpoints){
    const floor=rooms.floorHeightAt(v.x,v.z);
    assert.equal(typeof floor,"number");assert.ok(v.y-floor>1.4&&v.y-floor<1.7);
  }
  assert.equal(rooms.floorHeightAt(-100,-100),null);rooms.dispose();
});

test("walking across a room preserves each authored lamp shadow allocation",()=>{
  const rooms=fixture(),camera=new PerspectiveCamera(),v=rooms.viewpoints[0];
  camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();rooms.update(camera,0,65);
  const anchors=rooms.lights.map(l=>l.userData.anchor);
  rooms.lights.forEach(l=>l.shadow.needsUpdate=false);
  const pose=rooms.poses[0],c=Math.cos(pose.rot),s=Math.sin(pose.rot);
  camera.position.set(pose.x+c*(-.9)*pose.scale.x+s*(-1)*pose.scale.z,pose.y+1.6,
    pose.z-s*(-.9)*pose.scale.x+c*(-1)*pose.scale.z);
  camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.deepEqual(rooms.lights.map(l=>l.userData.anchor),anchors);
  assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate));
  rooms.dispose();
});
test("pastoral floors follow source placement, rotation and shape",()=>{
  const pose={x:50,y:2100,z:70,rot:.7,scale:{x:1.3,y:1.1,z:1.2}};
  for(const assetId of ["house_a","yurt"]){
    const world={entities:[{id:"test",assetId}],surface:{buildingPose:()=>pose,heightAt:()=>2099}};
    const rooms=new SettlementRuntime(world),f=assetId==="house_a"?.035:.025;
    assert.equal(rooms.floorHeightAt(50,70),2100+f*1.1);
    assert.equal(rooms.floorHeightAt(100,100),null);rooms.dispose();
  }
});

test("pastoral sky fill is bound to actual openings and never remains active outdoors",()=>{
  const pose={x:50,y:2100,z:70,rot:.7,scale:{x:1.3,y:1.1,z:1.2}};
  const rooms=new SettlementRuntime({entities:[{id:"house",assetId:"house_a"}],surface:{buildingPose:()=>pose,heightAt:()=>2099}});
  const camera=new PerspectiveCamera();camera.position.set(50,2101.6,70);camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.equal(rooms.portalLights.length,3);
  assert.ok(rooms.portalLights.every(l=>l.castShadow&&l.intensity>0&&l.shadow.needsUpdate));
  rooms.portalLights.forEach(l=>l.shadow.needsUpdate=false);
  camera.position.x+=.4;camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.ok(rooms.portalLights.every(l=>!l.shadow.needsUpdate));
  rooms.update(camera,0,-8);assert.ok(rooms.portalLights.every(l=>l.intensity===0&&!l.castShadow));
  camera.position.set(100,2101.6,100);camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.ok(rooms.portalLights.every(l=>l.intensity===0&&!l.castShadow));rooms.dispose();
});

test("occupied-room indirect fill registers only structure materials and clears with daylight or exit",()=>{
 const pose={x:50,y:2100,z:70,rot:.7,scale:{x:1.3,y:1.1,z:1.2}};
 const rooms=new SettlementRuntime({entities:[{id:"house",assetId:"house_a"}],surface:{buildingPose:()=>pose,heightAt:()=>2099}});
 const camera=new PerspectiveCamera();camera.position.set(50,2101.6,70);camera.updateMatrixWorld();
 rooms.update(camera,0,65);assert.equal(rooms.indirect.uniforms.uRoomBounceActive.value,1);
 assert.equal(rooms.lights.length,3);assert.ok(rooms.lights.every(l=>l.shadow.mapSize.x===512&&l.angle<Math.PI*.36));
 rooms.update(camera,0,-8);assert.equal(rooms.indirect.uniforms.uRoomBounceActive.value,0);
 camera.position.set(100,2101.6,100);camera.updateMatrixWorld();rooms.update(camera,0,65);
 assert.equal(rooms.indirect.uniforms.uRoomBounceActive.value,0);rooms.dispose();
});

test("guest-room daylight comes from existing apertures, excludes the bathroom and keeps actual lamp specular",()=>{
  const rooms=fixture(),camera=new PerspectiveCamera(),v=rooms.viewpoints[0];
  camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();rooms.update(camera,0,65);
  const u=rooms.indirect.uniforms,definition=rooms.activeGuestRoom.asset;
  assert.equal(u.uRoomAmbientActive.value,1);
  assert.equal(u.uRoomBounceActive.value,0,"real sconces must not inherit the pastoral diffuse-only switch");
  assert.equal(rooms.lights.length,3);assert.ok(rooms.lights.every(l=>l.intensity>0&&l.intensity<3));
  assert.equal(u.uRoomExcludeActive.value,1);assert.deepEqual(u.uRoomExcludedBounds.value.toArray(),definition.excludedBounds);
  assert.deepEqual(definition.openings.map(o=>o.center),[[.6,1.24,3.4],[1.5,1.475,-4],[2.7,1.15,3.4]]);
  assert.ok(u.uRoomOpenings.value.every(o=>o.w>0));
  const anchors=rooms.lights.map(l=>l.userData.anchor);rooms.lights.forEach(l=>l.shadow.needsUpdate=false);
  rooms.update(camera,0,-8);
  assert.equal(u.uRoomAmbientActive.value,0);assert.equal(u.uRoomBounceActive.value,0);
  assert.deepEqual(rooms.lights.map(l=>l.userData.anchor),anchors);
  assert.ok(rooms.lights.every(l=>l.intensity>40&&!l.shadow.needsUpdate));
  camera.position.set(1000,2500,1000);camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.equal(u.uRoomAmbientActive.value,0);rooms.dispose();
});

test("portal softness and gable occupancy reset when returning to actual guest-room lamps",()=>{
 const pose={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}};
 const world={entities:[{id:"house",assetId:"house_a"}],surface:{buildingPose:()=>pose,heightAt:()=>1999}};
 const rooms=new SettlementRuntime(world),camera=new PerspectiveCamera();
 camera.position.set(0,2003.0,0);camera.updateMatrixWorld();rooms.update(camera,0,65);
 assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,1,"standing below the real ridge remains inside");
 assert.ok(rooms.lights.every(l=>l.shadow.radius===2.25));
 camera.position.y=2003.7;camera.updateMatrixWorld();rooms.update(camera,0,65);
 assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,0,"the exterior roof receives no room return");
 rooms.dispose();
 const guest=fixture(),v=guest.viewpoints[0];camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();
 guest.update(camera,0,65);assert.ok(guest.lights.every(l=>l.shadow.radius===1));
 guest.update(camera,0,-8);
 assert.deepEqual(guest.lights.map(l=>Math.round(l.intensity*100)/100),[49.92,49.92,61.44],"night fixture maximum remains unchanged");
 guest.dispose();
});


test("structured solar input preserves fixture/daylight controls and adds no lamps or shadow invalidation",()=>{
  const rooms=fixture(),camera=new PerspectiveCamera(),v=rooms.viewpoints[0];camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();
  rooms.update(camera,0,35);const fixturePower=rooms.lights.map(l=>l.intensity);rooms.lights.forEach(l=>l.shadow.needsUpdate=false);
  const solar={elevation:35,sun:new Vector3(0,.5736,.8192).normalize(),color:new Color(1,.7,.4),intensity:3};
  rooms.update(camera,0,solar);assert.deepEqual(rooms.lights.map(l=>l.intensity),fixturePower);assert.equal(rooms.lights.length,3);
  assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate));assert.equal(rooms.indirect.uniforms.uRoomBounceActive.value,0,"guest fixture specular must remain standard PBR");
  assert.equal(rooms.indirect.field.solar.stats.active,true);const version=rooms.indirect.uniforms.uRoomBounceField.value.version;
  rooms.update(camera,0,solar);assert.equal(rooms.indirect.uniforms.uRoomBounceField.value.version,version);
  rooms.update(camera,0,{...solar,elevation:-8,sun:new Vector3(0,-.1,1).normalize()});assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,0);
  assert.equal(rooms.indirect.field.solar.stats.active,false);rooms.dispose();
});

test("manual fixture state changes both direct and baked reflection without changing daylight or shadow allocation",async()=>{
  const pose={x:100,y:2100,z:200,rot:.65,scale:{x:1,y:1,z:1}};
  const rooms=new SettlementRuntime({entities:[{id:"lanchuan",assetId:"gh_lanchuan"}],surface:{buildingPose:()=>pose,heightAt:()=>2099}});
  const camera=new PerspectiveCamera(),v=rooms.viewpoints[0];camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();
  const solar={elevation:35,sun:new Vector3(0,.5736,.8192).normalize(),color:new Color(1,.7,.4),intensity:3};
  rooms.update(camera,0,solar);await rooms.indirect.field.prepare();rooms.update(camera,0,solar);
  const daylight=rooms.daylight,key=rooms.activeGuestRoom.id;rooms.lights.forEach(l=>l.shadow.needsUpdate=false);
  rooms.fixtureControls.setMode(key,"on");rooms.update(camera,0,solar);
  assert.deepEqual(rooms.lights.map(l=>Math.round(l.intensity*100)/100),[49.92,49.92,61.44]);
  assert.equal(rooms.indirect.field.fixtures.stats.active,true);const on=rooms.indirect.uniforms.uRoomBounceField.value.image.data.slice();
  rooms.fixtureControls.setMode(key,"off");rooms.update(camera,0,solar);
  assert.ok(rooms.lights.every(l=>l.intensity===0&&!l.shadow.needsUpdate));assert.equal(rooms.daylight,daylight);
  assert.equal(rooms.indirect.field.fixtures.stats.active,false);
  assert.notDeepEqual(rooms.indirect.uniforms.uRoomBounceField.value.image.data,on);
  assert.equal(rooms.indirect.uniforms.uRoomAmbientActive.value,1,"daylight return survives a lamp switch");
  rooms.dispose();
});

test("two buildings with the same room family select their own fixtures and retain independent switches",()=>{
  const poses={A:{x:0,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}},B:{x:100,y:2100,z:100,rot:.3,scale:{x:1,y:1,z:1}}};
  const rooms=new SettlementRuntime({entities:[{id:"A",assetId:"gh_lanchuan"},{id:"B",assetId:"gh_lanchuan"}],surface:{buildingPose:e=>poses[e.id],heightAt:()=>2099}});
  rooms.indirect.field.uniforms.uRoomFixtureBounce.value=0;
  const camera=new PerspectiveCamera(),a=rooms.viewpoints[0],b=rooms.viewpoints[4];
  for(const [view,entity] of [[a,"A"],[b,"B"]]){
    camera.position.set(view.x,view.y,view.z);camera.updateMatrixWorld();rooms.update(camera,0,65);
    assert.ok(rooms.lights.every(l=>l.userData.anchor.startsWith(entity+":")));
    assert.ok(rooms.lights.every(l=>l.intensity>0));rooms.fixtureControls.setMode(rooms.activeGuestRoom.id,"off");rooms.update(camera,0,65);
    assert.ok(rooms.lights.every(l=>l.intensity===0));
  }
  camera.position.set(a.x,a.y,a.z);camera.updateMatrixWorld();rooms.update(camera,0,65);assert.ok(rooms.lights.every(l=>l.intensity===0));rooms.dispose();
});

test("lamp power does not follow the visitor across a large authored room instance",()=>{
  const pose={x:0,y:2100,z:0,rot:0,scale:{x:2,y:1,z:2}},rooms=new SettlementRuntime({entities:[{id:"A",assetId:"gh_lanchuan"}],surface:{buildingPose:()=>pose,heightAt:()=>2099}});
  rooms.indirect.field.uniforms.uRoomFixtureBounce.value=0;
  const camera=new PerspectiveCamera();camera.position.set(0,2101.6,-6);camera.updateMatrixWorld();rooms.update(camera,0,65);
  const near=rooms.lights.map(l=>l.intensity);camera.position.set(6,2101.6,6);camera.updateMatrixWorld();rooms.update(camera,0,65);
  assert.deepEqual(rooms.lights.map(l=>l.intensity),near);rooms.dispose();
});
