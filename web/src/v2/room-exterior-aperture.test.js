import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3,Color,DataUtils} from 'three';
import data from './room-exterior-aperture-data.js';
import indirect from './room-exterior-terrain-data.js';
import {EXTERIOR_ROOM_KEY,EXTERIOR_ROOM_ENTITY,validateExteriorApertures}from './room-exterior-terrain.js';
import {prepareHouseholdRoom}from './household-room-fields.js';
import {ROOM_APERTURE_DATA}from './room-aperture-registry.js';
import {RoomBounceField}from './room-bounce-field.js';
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const light={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1};
test('external sky keeps original own-only quadrature, opening identity and true terrain blocking',async()=>{
 await prepareHouseholdRoom(EXTERIOR_ROOM_KEY);const fields=validateExteriorApertures(data,indirect);
 assert.deepEqual(bytes(data.states.open.ownOnly),bytes(ROOM_APERTURE_DATA[EXTERIOR_ROOM_KEY].data));
 assert.equal(data.apertureSamples,36);assert.equal(data.openings[2].center[2],-2.5);
 assert.throws(()=>validateExteriorApertures({...data,openings:[...data.openings].reverse()},indirect),/binding/);
 assert.throws(()=>validateExteriorApertures({...data,entityId:'other'},indirect),/identity/);
 const count=data.size.reduce((a,b)=>a*b,1);
 assert.ok(fields.open.slice(count,count*2).some(v=>v>0),'front-window upper sky path survives');
 assert.ok(fields.open.slice(count*2,count*3).every(v=>v===0),'actual rear window directions blocked by terrain');
 assert.ok(fields.closed.slice(0,count).every(v=>v===0),'closed door retains opaque endpoint');
 for(const state of ['open','closed'])assert.equal(data.summary.find(s=>s.state===state).ownOnlyMaxByteError,0);
});
test('runtime packs joint visibility only into matching aperture alpha; opt-out restores original and night stays empty',async()=>{
 const f=new RoomBounceField();try{
  f.exterior.enabled=true;f.exterior.setRoom({id:EXTERIOR_ROOM_ENTITY,pose:data.pose});
  f.set({sourceAsset:'house_a',bounceField:EXTERIOR_ROOM_KEY},new Quaternion());await f.prepare();
  const texture=f.uniforms.uRoomBounceField.value,count=data.size.reduce((a,b)=>a*b,1);
  for(const fraction of [0,.5,1]){
   f.setDoorOpenness(fraction);f.setLighting(light,1);
   const a=texture.image.data;
   for(let opening=0;opening<3;opening++)for(let i=0;i<count;i++){
    const offset=opening*count+i,expected=f.exterior.aperture(EXTERIOR_ROOM_KEY,offset,f.doorFraction)/255;
    assert.equal(a[(opening+1)*count*4+i*4+3],DataUtils.toHalfFloat(expected));
   }
  }
  assert.equal(f.exterior.stats.directApertureSkyCorrected,true);
  f.setLighting({...light,intensity:0},0);assert.ok(texture.image.data.every((v,i)=>i%4===3||Math.abs(DataUtils.fromHalfFloat(v))<1e-7));
  f.exterior.setRoom({id:'other'});f.setDoorOpenness(1);f.setLighting(light,1);
  const original=bytes(ROOM_APERTURE_DATA[EXTERIOR_ROOM_KEY].data);
  for(let opening=0;opening<3;opening++)for(let i=0;i<count;i++)assert.equal(texture.image.data[(opening+1)*count*4+i*4+3],DataUtils.toHalfFloat(original[opening*count+i]/255));
  assert.strictEqual(texture,f.uniforms.uRoomBounceField.value);
 }finally{f.dispose();}
});

test('zero daylight preserves independently composed existing fixture transport',async()=>{
 const f=new RoomBounceField();try{
  f.exterior.enabled=true;f.exterior.setRoom({id:EXTERIOR_ROOM_ENTITY,pose:data.pose});
  f.set({sourceAsset:'house_a',bounceField:EXTERIOR_ROOM_KEY},new Quaternion());await f.prepare();
  const output=new Uint16Array(16);output[0]=DataUtils.toHalfFloat(.2);output[1]=DataUtils.toHalfFloat(.1);output[3]=DataUtils.toHalfFloat(1);const before=output.slice();
  f.exterior.apply(EXTERIOR_ROOM_KEY,output,f.doors,0,.08,1,1);
  assert.deepEqual(output,before,'night fixture-normalized RGB is not terrain skylight');
 }finally{f.dispose();}
});
