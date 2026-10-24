import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Quaternion,Vector3,Color,DataUtils} from 'three';
import data from './room-exterior-terrain-data.js';
import {EXTERIOR_ROOM_ENTITY,EXTERIOR_ROOM_KEY,RoomExteriorTerrain,validateExteriorRoom} from './room-exterior-terrain.js';
import {prepareHouseholdRoom} from './household-room-fields.js';
import {RoomBounceField,decodeRoomField} from './room-bounce-field.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
const light={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1};
test('exterior candidate is opt-in and entity/pose/source bound with unchanged original probe validity',async()=>{
 const absent=new RoomExteriorTerrain();assert.equal(absent.enabled,false);absent.dispose();await prepareHouseholdRoom(EXTERIOR_ROOM_KEY);validateExteriorRoom(data,data.pose);
 assert.throws(()=>validateExteriorRoom({...data,entityId:'other'},data.pose),/identity/);assert.throws(()=>validateExteriorRoom(data,{...data.pose,x:data.pose.x+1}),/pose/);
 const base=ROOM_BOUNCE_DATA[EXTERIOR_ROOM_KEY],valid=decodeRoomField(base);
 for(const state of Object.values(data.states))for(const channel of Object.values(state))for(const field of Object.values(channel)){
  const a=decodeRoomField(field);assert.equal(a.length,valid.length);for(let i=3;i<a.length;i+=4)assert.equal(a[i],valid[i]);assert.ok(a.some((v,i)=>i%4!==3&&v!==0),'both separated physical paths contribute');
 }
 for(const source of data.terrainSources){const bytes=await readFile(new URL('../../../'+source.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);}
 for(const source of [base,...data.externalSources])for(const [path,hash]of [['../../public/'+source.sourceGLB,source.sourceSHA256],['../../../'+source.sourceBlend,source.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),hash);
});
test('entity-only candidate preserves sunlight response and adds ground sky without extra GPU textures',async()=>{
 const f=new RoomBounceField();try{
  f.exterior.enabled=true;f.exterior.ground.solarEnabled=false; // Isolate the unchanged direct-aperture solar path; new terrain solar has its own unit/occlusion tests.
  f.exterior.setRoom({id:EXTERIOR_ROOM_ENTITY,pose:data.pose});f.set({sourceAsset:'house_a',bounceField:EXTERIOR_ROOM_KEY},new Quaternion());await f.prepare();
  const texture=f.uniforms.uRoomBounceField.value,at=(intensity,target=true,day=1)=>{f.exterior.setRoom(target?{id:EXTERIOR_ROOM_ENTITY,pose:data.pose}:{id:'other'});f.setLighting({...light,intensity},day);return texture.image.data.slice();};
  const a=at(0),b=at(3);assert.ok(f.exterior.stats.groundSkyMeanBandSum>0);assert.ok(f.exterior.stats.skyMeanBandSum>0);
  const oldA=at(0,false),oldB=at(3,false);assert.notDeepEqual(a,oldA);
  let maxError=0;for(let i=0;i<a.length;i++)if(i%4!==3){const delta=DataUtils.fromHalfFloat(b[i])-DataUtils.fromHalfFloat(a[i]),oldDelta=DataUtils.fromHalfFloat(oldB[i])-DataUtils.fromHalfFloat(oldA[i]);maxError=Math.max(maxError,Math.abs(delta-oldDelta));}
  assert.ok(maxError<.0001,'sunlight response must survive sky replacement within Float16 rounding: '+maxError);
  const night=at(0,true,0);assert.ok(night.every((v,i)=>i%4===3||Math.abs(DataUtils.fromHalfFloat(v))<1e-7));
  assert.strictEqual(f.uniforms.uRoomBounceField.value,texture);assert.equal(f.exterior.stats.groundSolarIncluded,false);
 }finally{f.dispose();}
});
