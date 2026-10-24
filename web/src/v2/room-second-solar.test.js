import {assertRoomFieldSamplingContract} from './room-field-contract.assert.js';
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {ROOM_TRANSPORT_DATA} from "./room-transport-registry.js";
import {ROOM_BOUNCE_DATA} from "./room-bounce-registry.js";
import {ROOM_SECOND_SOLAR_LOADERS} from "./room-second-solar-data.js";
import {RoomSolarTransport,decodeSolarDirection} from "./room-solar-transport.js";
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
const secondData=Object.fromEntries(await Promise.all(Object.entries(ROOM_SECOND_SOLAR_LOADERS).map(async([key,load])=>[key,await load()])));
const hash=b=>createHash("sha256").update(b).digest("hex");
const sun=(az,el)=>new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
const light={sun:sun(.28,.57),color:new THREE.Color(1,.68,.42),intensity:3,visibility:.8};
const identity=new THREE.Matrix3();

test("five solar second-reflection fields preserve sources, openings, grids and exclusions",async()=>{
  assert.deepEqual(Object.keys(secondData).sort(),Object.keys(ROOM_TRANSPORT_DATA).sort());let encodedBytes=0;
  for(const[key,field]of Object.entries(secondData)){
    const first=ROOM_TRANSPORT_DATA[key],base=decodeRoomField(ROOM_BOUNCE_DATA[key]),count=field.size.reduce((a,b)=>a*b,1);
    for(const prop of ["sourceSHA256","blendSHA256","bounds","size","validProbes","openings","azimuths","elevations","zenithIndex"])assert.deepEqual(field[prop],first[prop]);
    assert.equal(field.sourceSHA256,hash(await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url))));
    assert.equal(field.blendSHA256,hash(await readFile(new URL("../../../"+field.sourceBlend,import.meta.url))));
    assert.equal(field.bounceOrder,2);assert.equal(field.samples,96);assert.equal(field.surfaceSamples,32);assert.equal(field.directions.length,81);
    let energy=0,spatialRange=0;
    for(let direction=0;direction<81;direction++){
      encodedBytes+=Buffer.from(field.directions[direction],"base64").length;
      const data=decodeSolarDirection(field,direction);let lo=Infinity,hi=0;
      for(let i=0;i<count;i++)for(let c=0;c<3;c++){
        const constant=data[i*3+c],length=Math.hypot(...[1,2,3].map(b=>data[b*count*3+i*3+c]));
        assert.ok(constant>=0&&constant<=.9*.9,"passive two-material paths conserve energy");
        assert.ok(length<=constant+1e-12,"additional directional light cannot subtract the first reflection");
        if(base[i*4+3]===0)for(let band=0;band<4;band++)assert.equal(data[band*count*3+i*3+c],0,key+" invalid probe leaked");
        else{lo=Math.min(lo,constant);hi=Math.max(hi,constant);energy+=constant;}
      }
      spatialRange=Math.max(spatialRange,hi-lo);
    }
    assert.ok(energy>0);assert.ok(spatialRange>.0001,key+" must not act as a uniform room gain");
  }
  console.log(JSON.stringify({secondSolarRooms:5,encodedBytes,extraGpuSamplers:0,extraFragmentFetches:0}));
});

test("zero is byte-exact first-solar A/B; one adds only second transfer with real sun units",()=>{
  for(const key of Object.keys(secondData)){
    const current=new RoomSolarTransport({secondData}),old=new RoomSolarTransport({secondData:{},secondLoaders:{}});
    const base=decodeRoomField(ROOM_BOUNCE_DATA[key]),output=base.slice(),expected=base.slice();
    old.compose(key,base,expected,identity,light,.8);current.compose(key,base,output,identity,light,.8,1,0);assert.deepEqual(output,expected);
    current.compose(key,base,output,identity,light,.8,1,1);assert.notDeepEqual(output,expected);
    for(let i=3;i<base.length;i+=4)assert.equal(output[i],base[i]);
    const full=output.slice();current.compose(key,base,output,identity,light,.8,1,.5);
    for(let i=0;i<base.length;i++)if(i%4!==3){
      const a=THREE.DataUtils.fromHalfFloat(expected[i]),b=THREE.DataUtils.fromHalfFloat(full[i]),v=THREE.DataUtils.fromHalfFloat(output[i]);
      assert.ok(Math.abs(v-(a+b)/2)<Math.max(.0002,Math.abs(v)*.002));
    }
    current.compose(key,base,output,identity,light,.8,0,1);assert.deepEqual(output,base);
    current.compose(key,base,output,identity,{...light,visibility:0},.8);assert.deepEqual(output,base);
    current.compose(key,base,output,identity,{...light,sun:new THREE.Vector3(0,-1,0)},.2);assert.deepEqual(output,base);
    current.compose(key,base,output,identity,light,.8,1,0);assert.deepEqual(output,expected);current.dispose();old.dispose();
  }
});

test("second direction cache is bounded; unchanged frames do not synthesize or upload",async()=>{
  const field=new RoomBounceField();field.set({sourceAsset:"house_a"},new THREE.Quaternion());await field.prepare();field.setLighting(light,1);
  assert.equal(field.solar.stats.solarBounceOrder,2);const texture=field.uniforms.uRoomBounceField.value,version=texture.version,updates=field.solar.stats.updates,start=performance.now();
  for(let i=0;i<120;i++)field.setLighting(light,1);
  assert.equal(field.solar.stats.updates,updates);assert.equal(texture.version,version);
  const unchangedMeanMs=(performance.now()-start)/120;
  for(let i=0;i<100;i++)field.setLighting({...light,sun:sun(i*.08,.3+i*.007)},1);
  assert.ok(field.solar.cache.size<=12);assert.ok(field.solar.stats.cacheBytes<=12*19440);
  assertRoomFieldSamplingContract();
  assert.equal(field.cache.size,1);assert.equal(texture.image.data.byteLength,10080);
  console.log(JSON.stringify({unchangedMeanMs,solar:field.solar.stats}));field.dispose();
});

test("room tables load only on demand, deduplicate, propagate errors, and cannot revive disposed fields",async()=>{
  let calls=0,finish;const key="house_a",loader=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const transport=new RoomSolarTransport({secondLoaders:{[key]:loader}});
  assert.equal(calls,0);await transport.prepare(null);assert.equal(calls,0);
  const a=transport.prepare(key),b=transport.prepare(key);assert.strictEqual(a,b);await Promise.resolve();assert.equal(calls,1);
  finish(secondData[key]);await a;assert.equal(transport.stats.loadedSecondRooms,1);await transport.prepare(key);assert.equal(calls,1);
  const bad=new RoomSolarTransport({secondLoaders:{[key]:async()=>({...secondData[key],sourceSHA256:"changed"})}});
  await assert.rejects(bad.prepare(key),/source\/grid differs/);
  assert.throws(()=>bad.compose(key,new Uint16Array(16),new Uint16Array(16),identity,light,1),/source\/grid differs/);
  let late;const disposed=new RoomSolarTransport({secondLoaders:{[key]:()=>new Promise(resolve=>{late=resolve;})}}),pending=disposed.prepare(key);
  await Promise.resolve();disposed.dispose();late(secondData[key]);await pending;assert.equal(disposed.stats.loadedSecondRooms,0);assert.deepEqual(disposed.secondData,{});
  transport.dispose();bad.dispose();
});

test("query and constructor keep one-solar A/B explicit, with no load when disabled",async()=>{
  for(const value of [undefined,null,"",0,"0",2,"2",3,"3","01","false",1,"1"]){
    const field=new RoomBounceField({sunBounces:value});assert.equal(field.uniforms.uRoomSunSecondBounce.value,value===1||value==="1"?0:1);field.dispose();
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,"location");
  try{
    Object.defineProperty(globalThis,"location",{configurable:true,value:{search:"?roomSunBounces=1"}});
    const first=new RoomBounceField();first.set({sourceAsset:"house_a"},new THREE.Quaternion());await first.prepare();first.setLighting(light,1);
    assert.equal(first.solar.preparations.size,0);assert.equal(first.solar.stats.solarBounceOrder,1);first.dispose();
    Object.defineProperty(globalThis,"location",{configurable:true,value:{search:"?roomSunBounces=2"}});
    const second=new RoomBounceField();second.set({sourceAsset:"yurt"},new THREE.Quaternion());await second.prepare();second.setLighting(light,1);
    assert.equal(second.solar.stats.solarBounceOrder,2);second.dispose();
  }finally{if(previous)Object.defineProperty(globalThis,"location",previous);else delete globalThis.location;}
});


test("the second surface transfer receives sun colour and power exactly once",()=>{
  const encode=values=>Buffer.from(new Uint16Array([32768|12,...values.map(THREE.DataUtils.toHalfFloat)]).buffer).toString("base64");
  const firstValues=Array.from({length:12},(_,i)=>i<3?.125:.015625),secondValues=Array.from({length:12},(_,i)=>i<3?[.0625,.03125,.015625][i]:0);
  const first={size:[1,1,1],azimuths:16,elevations:[0,15,35,60,85],zenithIndex:80,directions:Array(81).fill(encode(firstValues))};
  const second={...first,bounceOrder:2,directions:Array(81).fill(encode(secondValues))};
  const transport=new RoomSolarTransport({data:{fixture:first},secondData:{fixture:second},secondLoaders:{}}),base=new Uint16Array(16),output=base.slice();
  for(let i=0;i<16;i++)base[i]=THREE.DataUtils.toHalfFloat(i%4===3?1:.0625);
  const lighting={sun:sun(.2,.6),color:new THREE.Color(.8,.5,.25),intensity:3,visibility:.7},day=.5;
  transport.compose("fixture",base,output,identity,lighting,day,1,1);
  for(let i=0;i<16;i++){
    if(i%4===3){assert.equal(output[i],base[i]);continue;}
    const offset=Math.floor(i/4)*3+i%4,expected=.0625+(firstValues[offset]+secondValues[offset])*3*.7*[.8,.5,.25][i%4]/(2.4*day);
    assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(output[i])-expected)<.0005);
  }
  transport.dispose();
});
