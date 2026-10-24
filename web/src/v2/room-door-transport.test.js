import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {doorApertureFraction,RoomDoorTransport} from './room-door-transport.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomBounceField,decodeRoomField} from './room-bounce-field.js';
import {SettlementRuntime} from './settlements.js';
const keys=['house_a','yurt'],lighting={sun:new THREE.Vector3(.3,.8,.4).normalize(),color:new THREE.Color(1,.7,.5),intensity:3,elevation:35};
test('door sky aperture follows projected leaf coverage with exact endpoints',()=>{
 assert.equal(doorApertureFraction(0),0);assert.equal(doorApertureFraction(1),1);assert.equal(doorApertureFraction(-1),0);assert.equal(doorApertureFraction(2),1);
 assert.ok(Math.abs(doorApertureFraction(.5)-(1-Math.SQRT1_2))<1e-12);
 let previous=0;for(let i=0;i<=100;i++){const value=doorApertureFraction(i/100);assert.ok(value>=previous&&value<=1);previous=value;}
});
test('closed endpoint sources retain original files, existing grid and open window/crown illumination',async()=>{
 const doors=new RoomDoorTransport();let js=0,gzip=0;
 try{for(const key of keys){
  await doors.prepare(key);const {data}=doors.fields.get(key),source=ROOM_BOUNCE_DATA[key],count=source.size.reduce((a,b)=>a*b,1),visibility=doors.fields.get(key).apertures;
  for(const [path,sha]of [['../../public/'+source.sourceGLB,source.sourceSHA256],['../../../'+source.sourceBlend,source.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),sha);
  assert.equal(data.doorPoses.length,key==='house_a'?1:2);for(const door of data.doorPoses){assert.ok(Math.abs(door.openEuler[2])>1.5);assert.deepEqual(door.closedEuler,[0,0,0]);}
  source.openings.forEach((o,i)=>{const v=visibility.slice(i*count,(i+1)*count);if(o.kind==='door')assert.ok(v.every(x=>x===0),'closed actual door is opaque');else assert.ok(v.some(x=>x>0),'window/crown remains open');});
  for(const name of['sky','secondSky']){const field=decodeRoomField(data[name]),original=decodeRoomField(source);assert.ok(field.some((x,i)=>i%4!==3&&x>0),'closed room retains reflected daylight');for(let i=3;i<field.length;i+=4)assert.equal(field[i],original[i]);}
  assert.equal(data.solar.directions.length,81);assert.equal(data.secondSolar.directions.length,81);
  const bytes=await readFile(new URL('./room-closed-door-data/'+key+'.js',import.meta.url));js+=bytes.length;gzip+=gzipSync(bytes).length;
 }console.log(JSON.stringify({closedDoorRooms:2,sourceBytes:js,gzipBytes:gzip,extraGPUTextures:0}));}finally{doors.dispose();}
});
test('open pose is byte-exact and reopening restores transport without accumulating energy',async()=>{
 const f=new RoomBounceField();try{for(const key of keys){
  f.set({sourceAsset:key},new THREE.Quaternion());await f.prepare();f.setDoorOpenness(1);f.setLighting(lighting,1);const texture=f.uniforms.uRoomBounceField.value,open=texture.image.data.slice();
  f.setDoorOpenness(0);f.setLighting(lighting,1);const closed=texture.image.data.slice();assert.notDeepEqual(closed,open);assert.equal(f.doors.stats.pending,false);assert.equal(f.doors.stats.apertureFraction,0);
  const version=texture.version;for(let i=0;i<30;i++)f.setLighting(lighting,1);assert.equal(texture.version,version);
  f.setDoorOpenness(.5);f.setLighting(lighting,1);const mid=texture.image.data;for(let i=0;i<mid.length;i++)if(i%4!==3){const a=THREE.DataUtils.fromHalfFloat(open[i]),b=THREE.DataUtils.fromHalfFloat(closed[i]),actual=THREE.DataUtils.fromHalfFloat(mid[i]),expected=THREE.MathUtils.lerp(b,a,doorApertureFraction(.5));assert.ok(Math.abs(actual-expected)<Math.max(.000001,Math.abs(expected)*.002));}
  f.setDoorOpenness(1);f.setLighting(lighting,1);assert.deepEqual(texture.image.data,open);assert.equal(f.doors.stats.active,false);
 }}finally{f.dispose();}
});
test('actual settlement provider shuts only door source and invalidates static portal shadows while moving',async()=>{
 const entities=keys.map((assetId,i)=>({id:'door-'+assetId,assetId,i})),pose=e=>({x:e.i*30,y:2100,z:0,rot:.7,scale:{x:1,y:1,z:1}}),runtime=new SettlementRuntime({entities,surface:{heightAt:()=>2100,buildingPose:pose}}),camera=new THREE.PerspectiveCamera(),states=new Map(entities.map(e=>[e.id,1]));runtime.setDoorOpenness(id=>states.get(id));
 try{for(const item of runtime.pastoralPoses){
  camera.position.set(item.pose.x,2101.4,0);camera.updateMatrixWorld();runtime.update(camera,0,lighting);await runtime.indirect.field.prepare();runtime.update(camera,0,lighting);
  const original=runtime.lights.map(l=>l.intensity),areas=runtime.indirect.uniforms.uRoomOpenings.value.map(v=>v.w);
  states.set(item.id,0);runtime.update(camera,0,lighting);
  item.asset.openings.forEach((opening,i)=>{const light=runtime.lights[i];if(opening.kind==='door'){assert.equal(light.intensity,0);assert.equal(light.visible,false);assert.equal(runtime.indirect.uniforms.uRoomOpenings.value[i].w,0);}else{assert.equal(light.intensity,original[i]);assert.equal(runtime.indirect.uniforms.uRoomOpenings.value[i].w,areas[i]);assert.equal(light.shadow.needsUpdate,true);}});
  runtime.lights.forEach(l=>l.shadow.needsUpdate=false);runtime.update(camera,0,lighting);assert.ok(runtime.lights.every(l=>!l.shadow.needsUpdate),'stationary door retains static shadow cache');
  states.set(item.id,.5);runtime.update(camera,0,lighting);item.asset.openings.forEach((opening,i)=>{if(opening.kind==='door')assert.equal(runtime.lights[i].intensity,original[i]*doorApertureFraction(.5));});
  states.set(item.id,1);runtime.update(camera,0,lighting);assert.deepEqual(runtime.lights.map(l=>l.intensity),original);assert.deepEqual(runtime.indirect.uniforms.uRoomOpenings.value.map(v=>v.w),areas);
 }}finally{runtime.dispose();}
});
test('first arrival in an already closed room never shows unprepared open-door indirect light',async()=>{
 const f=new RoomBounceField();f.setDoorOpenness(0);f.set({sourceAsset:'house_a'},new THREE.Quaternion());f.setLighting(lighting,1);assert.equal(f.doors.stats.pending,true);assert.ok(f.uniforms.uRoomBounceField.value.image.data.every((v,i)=>i%4===3||v===0));await f.prepare();f.setLighting(lighting,1);assert.equal(f.doors.stats.pending,false);assert.ok(f.uniforms.uRoomBounceField.value.image.data.some((v,i)=>i%4!==3&&v>0));f.dispose();
});
test('portal shadows refresh between 90 and 102 degrees even though legacy openness remains one',()=>{
 const entity={id:'angle-house',assetId:'house_a'},runtime=new SettlementRuntime({entities:[entity],surface:{heightAt:()=>0,buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}}),camera=new THREE.PerspectiveCamera();let angle=102*Math.PI/180;
 runtime.setDoorOpenness(()=>1,()=>[{angle,open:102*Math.PI/180}]);camera.position.set(0,1.5,0);camera.updateMatrixWorld();
 try{runtime.update(camera,0,lighting);runtime.lights.forEach(l=>l.shadow.needsUpdate=false);runtime.update(camera,0,lighting);assert.ok(runtime.lights.every(l=>!l.shadow.needsUpdate));angle=96*Math.PI/180;runtime.update(camera,0,lighting);assert.ok(runtime.lights.every(l=>l.shadow.needsUpdate));}finally{runtime.dispose();}
});
