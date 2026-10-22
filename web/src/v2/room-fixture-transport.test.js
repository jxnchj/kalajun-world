import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {gzipSync} from "node:zlib";
import * as THREE from "three";
import {ROOM_BOUNCE_DATA} from "./room-bounce-data.js";
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
import {ROOM_FIXTURE_LOADERS} from "./room-fixture-data.js";
import {RoomFixtureTransport} from "./room-fixture-transport.js";
import {decodeSolarDirection} from "./room-solar-transport.js";
import {SettlementRuntime} from "./settlements.js";
const keys=Object.keys(ROOM_FIXTURE_LOADERS),unit={x:1,y:1,z:1};
const from=THREE.DataUtils.fromHalfFloat,to=THREE.DataUtils.toHalfFloat;
function fixture(pose={x:100,y:2100,z:200,rot:.65,scale:unit}){
 const runtime=new SettlementRuntime({entities:[{id:"guest",assetId:"gh_lanchuan"}],surface:{buildingPose:()=>pose,heightAt:()=>pose.y}});
 // Retain exact first-order regression evidence; order-two has dedicated tests.
 runtime.indirect.field.uniforms.uRoomFixtureSecondBounce.value=0;
 // Isolate exact transport bytes from direct-sky visibility packed into alpha.
 runtime.indirect.field.uniforms.uRoomApertureVisibility.value=0;
 const camera=new THREE.PerspectiveCamera();
 function enter(key=keys[0],elevation=-8){const v=runtime.viewpoints.find(v=>v.roomId===key);camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();runtime.update(camera,0,elevation);}
 return {runtime,camera,enter};
}
function context(runtime){return {lights:runtime.lights,worldToLocal:runtime.indirect.uniforms.uRoomWorldToLocal.value,scale:runtime.activeGuestRoom.pose.scale};}
function rgbSum(data){return data.reduce((n,v,i)=>n+(i%4===3?0:Math.abs(from(v))),0);}

test("three fixture fields match source geometry, live lamps, masks and positive directional energy",async()=>{
 const {runtime,enter}=fixture({x:0,y:0,z:0,rot:0,scale:unit});let encoded=0,js=0,gzip=0,decoded=0;
 try{for(const key of keys){
  enter(key);const field=await ROOM_FIXTURE_LOADERS[key](),base=ROOM_BOUNCE_DATA[key],valid=decodeRoomField(base),count=base.size.reduce((a,b)=>a*b,1);
  for(const prop of ["size","bounds","openings","sourceSHA256","blendSHA256"])assert.deepEqual(field[prop],base[prop]);
  for(const [path,sha]of [["../../public/"+field.sourceGLB,field.sourceSHA256],["../../../"+field.sourceBlend,field.blendSHA256]])
   assert.equal(createHash("sha256").update(await readFile(new URL(path,import.meta.url))).digest("hex"),sha);
  assert.equal(field.bounceOrder,1);assert.equal(field.fixtures.length,3);assert.deepEqual(field.unitScale,[1,1,1]);
  const authored=runtime.anchors.filter(a=>a.roomId===key);
  for(let light=0;light<3;light++){
   assert.deepEqual(field.fixtures[light].position,authored[light].position.toArray());assert.deepEqual(field.fixtures[light].target,authored[light].target.toArray());
   for(const prop of["distance","angle","penumbra","decay"])assert.equal(field.fixtures[light][prop],runtime.lights[light][prop]);
   const table=decodeSolarDirection(field,light);decoded+=table.byteLength;let spatialMin=Infinity,spatialMax=0;
   for(let probe=0;probe<count;probe++)for(let c=0;c<3;c++){
    const v0=table[probe*3+c],direction=Math.hypot(...[1,2,3].map(b=>table[(b*count+probe)*3+c]));
    assert.ok(v0>=0&&direction<=v0+1e-6,"positive SH bounds retain finite nonnegative irradiance");
    if(!valid[probe*4+3])for(let b=0;b<4;b++)assert.equal(table[(b*count+probe)*3+c],0,"excluded bathroom, roof and furniture remain empty");
    else if(c===0){spatialMin=Math.min(spatialMin,v0);spatialMax=Math.max(spatialMax,v0);}
   }
   assert.ok(spatialMax-spatialMin>.0001,"fixture bounce must have spatial falloff");encoded+=Buffer.from(field.directions[light],"base64").length;
  }
  const bytes=await readFile(new URL("./room-fixture-data/"+key+".js",import.meta.url));js+=bytes.length;gzip+=gzipSync(bytes).length;
 }
 assert.equal(encoded,47820);assert.equal(decoded,174960);console.log(JSON.stringify({fixtureDataRooms:3,encoded,js,gzip,decoded}));
 }finally{runtime.dispose();}
});

test("real rotated guest rooms retain only existing-fixture reflection after sunset; 0 is exact A/B",async()=>{
 const {runtime,enter,camera}=fixture();
 try{for(const key of keys){
  enter(key,-8);const field=runtime.indirect.field;await field.prepare();runtime.update(camera,0,-8);
  const u=runtime.indirect.uniforms,texture=u.uRoomBounceField.value,source=ROOM_BOUNCE_DATA[key],alpha=decodeRoomField(source);
  assert.equal(u.uRoomBounceDay.value,0);assert.equal(u.uRoomFieldDayScale.value,.08);assert.equal(u.uRoomAmbientActive.value,1);
  assert.equal(field.fixtures.stats.active,true);assert.equal(field.fixtures.stats.lights,3);assert.equal(field.solar.stats.active,false);
  assert.equal(rgbSum(field.dayData.get(key).data),0,"numerical lamp scale must not leave any old sky radiance");
  const state=field.fixtures.state(key,context(runtime)),tables=field.fixtures.decoded.get(key),data=texture.image.data;
  for(let i=0;i<data.length;i++){
   const c=i%4;if(c===3){assert.equal(data[i],alpha[i]);continue;}
   const independent=alpha[i-c+3]?state.weights.reduce((n,w)=>n+tables[w.index][Math.floor(i/4)*3+c]*w.rgb[c],0)/(.08*2.4):0;
   assert.equal(data[i],to(independent),"night output contains one fixture transfer, not sky or direct light");
  }
  const live=runtime.lights.map(l=>({intensity:l.intensity,position:l.position.toArray(),target:l.target.position.toArray(),shadow:l.castShadow}));
  field.uniforms.uRoomFixtureBounce.value=0;runtime.update(camera,0,-8);
  assert.equal(u.uRoomAmbientActive.value,0);assert.equal(u.uRoomFieldActive.value,0);
  assert.deepEqual(runtime.lights.map(l=>({intensity:l.intensity,position:l.position.toArray(),target:l.target.position.toArray(),shadow:l.castShadow})),live,"A/B leaves the actual direct lamps and shadows unchanged");
  field.uniforms.uRoomFixtureBounce.value=1;runtime.update(camera,0,-8);assert.deepEqual(u.uRoomBounceField.value.image.data,data);
 }
 camera.position.set(1000,2500,1000);camera.updateMatrixWorld();runtime.update(camera,0,-8);
 assert.equal(runtime.indirect.uniforms.uRoomFieldActive.value,0);assert.equal(runtime.indirect.field.fixtures.stats.active,false);
 }finally{runtime.dispose();}
});

test("unchanged frames do not upload or accumulate; dawn sky and changing fixture power recompose once",async()=>{
 const {runtime,enter,camera}=fixture();
 try{enter();const f=runtime.indirect.field;await f.prepare();runtime.update(camera,0,-8);const texture=f.uniforms.uRoomBounceField.value,baseline=texture.image.data.slice(),version=texture.version,updates=f.solar.stats.updates;
  const begin=performance.now();for(let i=0;i<120;i++)runtime.update(camera,1/60,-8);const elapsed=performance.now()-begin;
  assert.equal(texture.version,version);assert.equal(f.solar.stats.updates,updates);assert.deepEqual(texture.image.data,baseline);
  const ctx=context(runtime);
  f.setLighting(null,.01,ctx);const dawnA=texture.image.data.slice(),dawnVersion=texture.version;
  f.setLighting(null,.02,ctx);assert.equal(texture.version,dawnVersion+1);assert.notDeepEqual(texture.image.data,dawnA,"sky changes even when fixture normalization remains .08");
  f.setLighting(null,.01,ctx);assert.deepEqual(texture.image.data,dawnA,"returning to an earlier sky state never accumulates fixture energy");
  f.setLighting(null,0,ctx);assert.deepEqual(texture.image.data,baseline);
  runtime.lights[0].intensity*=.5;f.setLighting(null,0,ctx);assert.notDeepEqual(texture.image.data,baseline);
  runtime.lights[0].intensity*=2;f.setLighting(null,0,ctx);assert.deepEqual(texture.image.data,baseline);
  console.log(JSON.stringify({unchangedFrames:120,totalMs:elapsed,textureUploads:0,lastFixtureComposeMs:f.fixtures.stats.lastComposeMs}));
 }finally{runtime.dispose();}
});

test("daytime A/B returns byte-exact sky and preserves sampler and light count",async()=>{
 const {runtime,enter,camera}=fixture();
 try{enter(keys[0],65);const f=runtime.indirect.field;await f.prepare();runtime.update(camera,0,65);
  const texture=f.uniforms.uRoomBounceField.value;assert.notDeepEqual(texture.image.data,f.skyBase());
  f.uniforms.uRoomFixtureBounce.value=0;runtime.update(camera,0,65);assert.deepEqual(texture.image.data,f.skyBase());
  assert.equal(f.uniforms.uRoomFieldDayScale.value,1);assert.equal(runtime.lights.length,3);
  assert.equal((ROOM_FIELD_GLSL.match(/texture\(uRoomBounceField/g)||[]).length,4);assert.equal((ROOM_FIELD_GLSL.match(/sampler3D/g)||[]).length,1);
 }finally{runtime.dispose();}
});

test("fixture payload is lazy, deduplicated, source-checked and not adopted after disposal",async()=>{
 const payload=await ROOM_FIXTURE_LOADERS[keys[0]]();let calls=0;
 const f=new RoomFixtureTransport({loaders:{[keys[0]]:async()=>{calls++;return payload;}}});
 assert.equal(calls,0);assert.equal(f.stats.cacheBytes,0);const a=f.prepare(keys[0]),b=f.prepare(keys[0]);assert.equal(a,b);await a;
 assert.equal(calls,1);assert.equal(f.stats.cacheBytes,58320);await f.prepare("house_a");assert.equal(calls,1);f.dispose();assert.equal(f.stats.cacheBytes,0);
 const bad=new RoomFixtureTransport({loaders:{[keys[0]]:async()=>({...payload,sourceSHA256:"mismatched-source"})}});
 await assert.rejects(bad.prepare(keys[0]),/source\/grid differs/);assert.throws(()=>bad.state(keys[0],null),/source\/grid differs/);bad.dispose();
 let finish;const delayed=new RoomFixtureTransport({loaders:{[keys[0]]:()=>new Promise(r=>finish=r)}}),pending=delayed.prepare(keys[0]);await Promise.resolve();delayed.dispose();finish(payload);await pending;assert.equal(delayed.data.size,0);
});

test("unbaked fixture profile changes cannot silently use stale transport",async()=>{
 const {runtime,enter}=fixture();
 try{enter();const f=runtime.indirect.field;await f.prepare();const ctx=context(runtime);assert.equal(f.fixtures.state(keys[0],ctx).weights.length,3);
  runtime.lights[0].angle+=.01;assert.throws(()=>f.fixtures.state(keys[0],ctx),/profile changed/);runtime.lights[0].angle-=.01;
  runtime.lights[0].position.x+=.1;assert.throws(()=>f.fixtures.state(keys[0],ctx),/position no longer matches/);runtime.lights[0].position.x-=.1;
  assert.throws(()=>f.fixtures.state(keys[0],{...ctx,scale:{x:1.2,y:1,z:1}}),/matching the room scale/);
 }finally{runtime.dispose();}
});

test("fixture A/B defaults on and accepts explicit numeric or URL off",()=>{
 for(const [input,expected]of [[undefined,1],[0,0],["0",0],[1,1],["1",1],["invalid",1]]){const f=new RoomBounceField({fixtureBounce:input});assert.equal(f.uniforms.uRoomFixtureBounce.value,expected);f.dispose();}
});
