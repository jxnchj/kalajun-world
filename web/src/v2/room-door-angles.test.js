import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Quaternion,Vector3,Color,DataUtils} from 'three';
import {RoomBounceField} from './room-bounce-field.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {ANGLE_ROOM,doorAngleBracket,validateDoorAngle} from './room-door-angles.js';
import {prepareHouseholdRoom} from './household-room-fields.js';
const light={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1};
const leaves=d=>[{name:'house_a_door0',angle:d*Math.PI/180,open:102*Math.PI/180}];
test('fixed-angle fields bind actual source and external assets, preserve probe validity and two bounce orders',async()=>{
 await prepareHouseholdRoom(ANGLE_ROOM);const base=ROOM_BOUNCE_DATA[ANGLE_ROOM];
 for(const degree of [30,60,90]){
  const data=(await import('./room-door-angle-data/tea-'+degree+'.js')).default;validateDoorAngle(data,degree);
  for(const field of [data.sky,data.secondSky]){const a=Buffer.from(field.data,'base64'),b=Buffer.from(base.data,'base64');assert.equal(a.length,b.length);for(let i=6;i<a.length;i+=8)assert.equal(a.readUInt16LE(i),b.readUInt16LE(i));}
  assert.equal(data.solar.directions.length,81);assert.equal(data.secondSolar.directions.length,81);assert.equal(data.secondSolar.bounceOrder,2);
  for(const source of [base,...base.externalSources])for(const [path,hash]of [['../../public/'+source.sourceGLB,source.sourceSHA256],['../../../'+source.sourceBlend,source.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),hash);
  assert.throws(()=>validateDoorAngle({...data,degrees:degree+1},degree),/identity/);assert.throws(()=>validateDoorAngle({...data,entityId:'wrong-house'},degree),/identity/);
  assert.throws(()=>validateDoorAngle({...data,sky:{...data.sky,sourceSHA256:'invalid'}},degree),/source/);
 }
});
test('adjacent angle selection has exact endpoints and continuous weights at all interior knots',()=>{
 assert.deepEqual(doorAngleBracket(0),{lo:0,hi:30,weight:0});assert.deepEqual(doorAngleBracket(102),{lo:90,hi:102,weight:1});
 const sample=d=>{const b=doorAngleBracket(d);return b.lo*(1-b.weight)+b.hi*b.weight;};
 for(const angle of [30,60,90])assert.ok(Math.abs(sample(angle+.00001)-sample(angle-.00001))<.000021);
});
test('actual field preserves open/closed endpoints and changes intermediate transport without extra GPU textures',async()=>{
 const f=new RoomBounceField();try{
  f.set({sourceAsset:'house_a',bounceField:ANGLE_ROOM},new Quaternion());await f.prepare();
  const texture=f.uniforms.uRoomBounceField.value;
  const sample=(degree,angles)=>{f.setDoorAngles(angles?leaves(degree):null);f.setDoorOpenness(Math.min(1,degree/90));f.setLighting(light,1);return texture.image.data.slice();};
  const oldOpen=sample(102,false),oldClosed=sample(0,false),oldMid=sample(60,false);
  assert.deepEqual(sample(102,true),oldOpen);assert.deepEqual(sample(0,true),oldClosed);assert.notDeepEqual(sample(60,true),oldMid);
  assert.equal(f.angleDoors.stats.active,true);assert.equal(f.doorAreaFraction,1);
  for(const angle of [30,60,90]){const a=sample(angle-.001,true),b=sample(angle+.001,true);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(DataUtils.fromHalfFloat(a[i])-DataUtils.fromHalfFloat(b[i])));assert.ok(max<.001,'adjacent angle boundary must not jump: '+max);}
  assert.strictEqual(f.uniforms.uRoomBounceField.value,texture);
  f.setDoorAngles([{angle:.5,open:1.78},{angle:-.3,open:-1.78}]);assert.equal(f.angleDoors.supports(ANGLE_ROOM),false,'unequal dual leaves retain original path');
 }finally{f.dispose();}
});
test('external terrain removes only direct-source solar bounce; sky field remains identical to solar-disabled control',async()=>{
 const f=new RoomBounceField();try{f.set({sourceAsset:'house_a',bounceField:ANGLE_ROOM},new Quaternion());await f.prepare();f.setDoorAngles(leaves(60));f.setDoorOpenness(2/3);
 f.setLighting({...light,visibility:0},1);const blocked=f.uniforms.uRoomBounceField.value.image.data.slice();assert.ok(blocked.some((v,i)=>i%4!==3&&v!==0),'sky reflections must remain');
 f.uniforms.uRoomSunTransport.value=0;f.setLighting(light,1);assert.deepEqual(f.uniforms.uRoomBounceField.value.image.data,blocked);
 }finally{f.dispose();}
});
