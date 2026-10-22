import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {ROOM_BOUNCE_DATA} from "./room-bounce-data.js";
import {ROOM_SECOND_BOUNCE_DATA} from "./room-second-bounce-data.js";
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
const hash=b=>createHash("sha256").update(b).digest("hex");
const asFloat=data=>Float32Array.from(data,THREE.DataUtils.fromHalfFloat);
const asset=key=>({bounceField:key});
const rotation=new THREE.Quaternion();
const light={sun:new THREE.Vector3(.3,.7,.6).normalize(),color:new THREE.Color(1,.7,.45),intensity:3};

test("five second-bounce fields retain exact source geometry, apertures, grid and invalid probes",async()=>{
  assert.deepEqual(Object.keys(ROOM_SECOND_BOUNCE_DATA).sort(),Object.keys(ROOM_BOUNCE_DATA).sort());
  let bytes=0;
  for(const[key,field]of Object.entries(ROOM_SECOND_BOUNCE_DATA)){
    const original=ROOM_BOUNCE_DATA[key],base=decodeRoomField(original),second=decodeRoomField(field);
    assert.equal(field.sourceSHA256,hash(await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url))));
    assert.equal(field.blendSHA256,hash(await readFile(new URL("../../../"+field.sourceBlend,import.meta.url))));
    for(const prop of["sourceSHA256","blendSHA256","openings","bounds","size","validProbes"])assert.deepEqual(field[prop],original[prop]);
    assert.equal(field.bounceOrder,2);assert.equal(field.skyOnly,true);assert.equal(field.samples,96);assert.equal(field.surfaceSamples,32);
    bytes+=second.byteLength;
    for(let i=0;i<base.length;i++){
      if(i%4===3)assert.equal(second[i],base[i],key+" validity changed");
      else if(base[i-i%4+3]===0)assert.equal(second[i],0,key+" roof/furniture/bathroom leak");
      assert.ok(Number.isFinite(THREE.DataUtils.fromHalfFloat(second[i])));
    }
  }
  assert.equal(bytes,61920);
});

test("additional light preserves material hue and mean energy, with no negative directional ringing",()=>{
  for(const[key,field]of Object.entries(ROOM_SECOND_BOUNCE_DATA)){
    const data=asFloat(decodeRoomField(field)),count=field.size.reduce((a,b)=>a*b,1),stride=count*4;
    let directional=0,min=Infinity,max=0;
    for(let i=0;i<count;i++)for(let channel=0;channel<3;channel++){
      const constant=data[i*4+channel],direction=Math.hypot(...[1,2,3].map(b=>data[b*stride+i*4+channel]));
      assert.ok(constant>=0&&constant<=Math.PI*.9*.9*[.82,.87,.90][channel]+.001);
      assert.ok(direction<=constant+1e-12,"a second reflection must not subtract existing light "+key);
      if(data[i*4+3]){min=Math.min(min,constant);max=Math.max(max,constant);directional=Math.max(directional,direction);}
    }
    assert.ok(max-min>.001,key+" must vary with actual room position");
    assert.ok(directional>.001,key+" must preserve surface directions");
    assert.ok(field.meanSecondCoefficient[0]>.82/.90*field.meanSecondCoefficient[2],"authored warm materials retain colour transport");
  }
});

test("zero restores the old sky exactly; default adds only baked second order using the same texture",()=>{
  const field=new RoomBounceField({apertureVisibility:0});field.uniforms.uRoomSunTransport.value=0;
  for(const[key,source]of Object.entries(ROOM_BOUNCE_DATA)){
    field.set(asset(key),rotation);const texture=field.uniforms.uRoomBounceField.value;
    field.uniforms.uRoomSkySecondBounce.value=0;field.setLighting(light,1);
    const base=decodeRoomField(source),extra=decodeRoomField(ROOM_SECOND_BOUNCE_DATA[key]);
    assert.deepEqual(texture.image.data,base);assert.equal(field.stats.skyBounceOrder,1);
    field.uniforms.uRoomSkySecondBounce.value=1;field.setLighting(light,1);
    assert.strictEqual(field.uniforms.uRoomBounceField.value,texture);assert.equal(field.stats.skyBounceOrder,2);
    for(let i=0;i<base.length;i++)assert.equal(texture.image.data[i],i%4===3?base[i]:THREE.DataUtils.toHalfFloat(THREE.DataUtils.fromHalfFloat(base[i])+THREE.DataUtils.fromHalfFloat(extra[i])));
    field.uniforms.uRoomSkySecondBounce.value=0;field.setLighting(light,1);assert.deepEqual(texture.image.data,base);
  }
  assert.equal(field.cache.size,5);assert.equal(field.stats.secondBounceBytes,61920);assert.equal(field.stats.compositeBytes,61920);
  assert.equal([...field.cache.values()].reduce((n,t)=>n+t.image.data.byteLength,0),61920,"no additional GPU volume");
  assert.equal((ROOM_FIELD_GLSL.match(/texture\(uRoomBounceField/g)||[]).length,4);
  assert.equal((ROOM_FIELD_GLSL.match(/uniform highp sampler3D/g)||[]).length,1);
  field.dispose();assert.equal(field.stats.secondBounceBytes,0);assert.equal(field.stats.compositeBytes,0);
});

test("unchanged frames do not merge/upload; A/B updates invalidate synthesis even with unchanged sun",()=>{
  const field=new RoomBounceField({apertureVisibility:0});field.set(asset("house_a"),rotation);field.setLighting(light,1);
  const texture=field.uniforms.uRoomBounceField.value,version=texture.version,merges=field.stats.merges,start=performance.now();
  for(let i=0;i<120;i++)field.setLighting(light,1);
  assert.equal(field.stats.merges,merges);assert.equal(texture.version,version);
  console.log(JSON.stringify({secondBounceMergeMs:field.stats.lastMergeMs,unchanged120MeanMs:(performance.now()-start)/120,...field.stats}));
  const first=texture.image.data.slice();field.uniforms.uRoomSkySecondBounce.value=.5;field.setLighting(light,1);
  assert.notDeepEqual(texture.image.data,first);assert.equal(texture.version,version+1);
  field.uniforms.uRoomSkySecondBounce.value=1;field.setLighting(light,1);assert.deepEqual(texture.image.data,first);
  field.clear();assert.equal(field.stats.active,false);assert.equal(field.uniforms.uRoomFieldActive.value,0);field.dispose();
});

test("solar remains independently controlled and second sky bounce cannot contaminate a night or another room",()=>{
  const field=new RoomBounceField({apertureVisibility:0});field.set(asset("yurt"),rotation);field.setLighting(light,1);
  const sky=field.skyBase().slice();assert.notDeepEqual(field.uniforms.uRoomBounceField.value.image.data,sky);
  field.uniforms.uRoomSunTransport.value=0;field.setLighting(light,1);assert.deepEqual(field.uniforms.uRoomBounceField.value.image.data,sky);
  field.uniforms.uRoomSunTransport.value=1;field.setLighting({...light,sun:new THREE.Vector3(0,-1,0)},.2);
  assert.deepEqual(field.uniforms.uRoomBounceField.value.image.data,sky);
  field.set(asset("lanchuan-freedom-1"),rotation);field.setLighting(light,1);
  assert.equal(field.uniforms.uRoomBounceField.value.image.width,9);assert.notDeepEqual(field.skyBase(),sky);
  field.clear();assert.equal(field.uniforms.uRoomFieldActive.value,0);assert.equal(field.stats.active,false);field.dispose();
});


test("roomSkyBounces accepts the explicit one-bounce comparison and defaults all other values to two",()=>{
  for(const value of [undefined,null,"",0,"0",2,"2",3,"3","01","false",1,"1"]){
    const field=new RoomBounceField({skyBounces:value});
    assert.equal(field.uniforms.uRoomSkySecondBounce.value,value===1||value==="1"?0:1);
    field.dispose();
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,"location");
  try{
    Object.defineProperty(globalThis,"location",{configurable:true,value:{search:"?view=interior&roomSkyBounces=1"}});
    const old=new RoomBounceField({apertureVisibility:0});assert.equal(old.uniforms.uRoomSkySecondBounce.value,0);old.dispose();
    Object.defineProperty(globalThis,"location",{configurable:true,value:{search:"?view=interior"}});
    const current=new RoomBounceField({apertureVisibility:0});assert.equal(current.uniforms.uRoomSkySecondBounce.value,1);current.dispose();
  }finally{if(previous)Object.defineProperty(globalThis,"location",previous);else delete globalThis.location;}
});
