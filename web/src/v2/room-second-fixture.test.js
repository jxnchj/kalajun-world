// This regression exercises the retained original guest-room source tables.
globalThis.location={search:'?guestVanity38=0'};
import {assertRoomFieldSamplingContract} from './room-field-contract.assert.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {ROOM_SECOND_FIXTURE_LOADERS} from './room-second-fixture-data.js';
import {ROOM_FIXTURE_LOADERS} from './room-fixture-data.js';
import {ROOM_BOUNCE_DATA} from './room-bounce-registry.js';
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from './room-bounce-field.js';
import {RoomFixtureTransport} from './room-fixture-transport.js';
import {decodeSolarDirection} from './room-solar-transport.js';
import {SettlementRuntime} from './settlements.js';
const keys=Object.keys(ROOM_SECOND_FIXTURE_LOADERS),from=THREE.DataUtils.fromHalfFloat,to=THREE.DataUtils.toHalfFloat;

test('second fixture paths preserve source identities, masks and positive bounded SH across all rooms',async()=>{
 let bytes=0,changed=0;
 for(const key of keys){
  const field=await ROOM_SECOND_FIXTURE_LOADERS[key](),first=await ROOM_FIXTURE_LOADERS[key](),base=ROOM_BOUNCE_DATA[key];
  assert.equal(field.bounceOrder,2);assert.equal(field.surfaceSamples,48);
  for(const prop of ['size','bounds','sourceSHA256','blendSHA256','openings','fixtures','unitScale'])assert.deepEqual(field[prop],first[prop]);
  for(const [path,sha]of [['../../public/'+field.sourceGLB,field.sourceSHA256],['../../../'+field.sourceBlend,field.blendSHA256]])
   assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),sha);
  const validity=decodeRoomField(base),count=base.size.reduce((a,b)=>a*b,1);
  for(let j=0;j<3;j++){
   const table=decodeSolarDirection(field,j),previous=decodeSolarDirection(first,j);bytes+=table.byteLength;
   let sum=0;
   for(let p=0;p<count;p++)for(let c=0;c<3;c++){
    const constant=table[p*3+c],length=Math.hypot(...[1,2,3].map(b=>table[(b*count+p)*3+c]));
    assert.ok(constant>=0&&length<=constant+1e-7);
    if(!validity[p*4+3])for(let b=0;b<4;b++)assert.equal(table[(b*count+p)*3+c],0);
    sum+=constant;
    if(constant>0&&previous[p*3+c]===0)changed++;
   }
   // Probe averages are not integrated surface flux: a second path can
   // illuminate previously dark probes even when total emitted energy drops.
   assert.ok(sum>0&&Number.isFinite(sum));
   assert.ok(field.summary[j].maxCoefficient<first.summary[j].maxCoefficient,'baked second-order peak stays below the original reflected spotlight peak');
  }
 }
 assert.equal(bytes,174960);assert.ok(changed>0,'second paths reach directions/locations absent in first order');
 console.log(JSON.stringify({secondFixtureRooms:keys.length,decodedBytes:bytes,newlyReachedProbeChannels:changed}));
});

test('two fixture reflections compose once, follow room controls, and A/B returns exact first-order bytes',async()=>{
 const runtime=new SettlementRuntime({entities:[{id:'guest',assetId:'gh_lanchuan'}],surface:{heightAt:()=>2100,buildingPose:()=>({x:100,y:2100,z:200,rot:.7,scale:{x:1,y:1,z:1}})}}),camera=new THREE.PerspectiveCamera();
 try{
  for(const key of keys){
   const v=runtime.viewpoints.find(v=>v.roomId===key);camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();runtime.update(camera,0,-8);
   const f=runtime.indirect.field,u=f.uniforms;await f.prepare();runtime.update(camera,0,-8);
   const tex=u.uRoomBounceField.value,two=tex.image.data.slice(),version=tex.version;
   assert.equal(f.secondFixtures.stats.active,true);assert.equal(runtime.lights.length,3);
   for(let i=0;i<30;i++)runtime.update(camera,1/60,-8);
   assert.equal(tex.version,version,'stationary light state does not upload or accumulate');
   u.uRoomFixtureSecondBounce.value=0;runtime.update(camera,0,-8);const one=tex.image.data.slice();assert.notDeepEqual(two,one);
   const ctx={lights:runtime.lights,worldToLocal:runtime.indirect.uniforms.uRoomWorldToLocal.value,scale:runtime.activeGuestRoom.pose.scale};
   const state=f.secondFixtures.state(key,ctx),tables=f.secondFixtures.decoded.get(key);
   for(let i=0;i<two.length;i++){
    const c=i%4;if(c===3){assert.equal(two[i],one[i]);continue;}
    const expected=one[(Math.floor(i/4)%(one.length/16))*4+3]?to(from(one[i])+state.weights.reduce((n,w)=>n+tables[w.index][Math.floor(i/4)*3+c]*w.rgb[c],0)/(.08*2.4)):one[i];
    assert.equal(two[i],expected,'only the independently baked second-order term is added');
   }
   u.uRoomFixtureSecondBounce.value=1;runtime.update(camera,0,-8);assert.deepEqual(tex.image.data,two);
   u.uRoomFixtureBounce.value=0;runtime.update(camera,0,-8);assert.equal(u.uRoomFieldActive.value,0);
   u.uRoomFixtureBounce.value=1;runtime.update(camera,0,-8);assert.deepEqual(tex.image.data,two);
   runtime.fixtureControls.setMode(runtime.activeGuestRoom.id,'off');runtime.update(camera,0,-8);assert.equal(u.uRoomFieldActive.value,0);
   runtime.fixtureControls.setMode(runtime.activeGuestRoom.id,'auto');runtime.update(camera,0,-8);assert.deepEqual(tex.image.data,two);
  }
  assertRoomFieldSamplingContract();
  assert.equal((ROOM_FIELD_GLSL.match(/sampler3D/g)||[]).length,1);
 }finally{runtime.dispose();}
});

test('second fixture table is lazy, disposed safely and rejects a first-order table',async()=>{
 const key=keys[0],payload=await ROOM_SECOND_FIXTURE_LOADERS[key]();let calls=0;
 const t=new RoomFixtureTransport({bounceOrder:2,loaders:{[key]:async()=>{calls++;return payload;}}});
 assert.equal(calls,0);assert.equal(t.stats.cacheBytes,0);const a=t.prepare(key),b=t.prepare(key);assert.equal(a,b);await a;assert.equal(calls,1);assert.equal(t.stats.cacheBytes,58320);t.dispose();assert.equal(t.stats.cacheBytes,0);
 const bad=new RoomFixtureTransport({bounceOrder:2,loaders:{[key]:ROOM_FIXTURE_LOADERS[key]}});await assert.rejects(bad.prepare(key),/Invalid fixture reflection table/);bad.dispose();
 let finish;const late=new RoomFixtureTransport({bounceOrder:2,loaders:{[key]:()=>new Promise(r=>finish=r)}}),pending=late.prepare(key);await Promise.resolve();late.dispose();finish(payload);await pending;assert.equal(late.data.size,0);
});

test('fixture second bounce can opt out independently without disabling original fixture return',()=>{
 for(const [input,value]of [[undefined,1],['1',0],[1,0],['2',1],[2,1]]){const f=new RoomBounceField({fixtureBounces:input});assert.equal(f.uniforms.uRoomFixtureSecondBounce.value,value);assert.equal(f.uniforms.uRoomFixtureBounce.value,1);f.dispose();}
});


test('one-bounce A/B does not request any second-fixture payload',async()=>{
 const f=new RoomBounceField({fixtureBounces:1});let requests=0;
 f.secondFixtures.loaders=Object.fromEntries(keys.map(k=>[k,()=>{requests++;throw new Error('unexpected second payload');}]));
 try{f.set({bounceField:keys[0]},new THREE.Quaternion());await f.prepare();assert.equal(requests,0);assert.equal(f.secondFixtures.stats.loadedRooms,0);assert.equal(f.secondFixtures.stats.cacheBytes,0);}finally{f.dispose();}
});
