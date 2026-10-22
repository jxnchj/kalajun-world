import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {ROOM_TRANSPORT_DATA} from "./room-transport-data.js";
import {ROOM_BOUNCE_DATA} from "./room-bounce-data.js";
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
import {RoomSolarTransport,decodeSolarDirection,roomSolarWeights} from "./room-solar-transport.js";
import {RoomIndirectLight} from "./room-lighting.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const hash=b=>createHash("sha256").update(b).digest("hex");
const sun=(az,elevation)=>new THREE.Vector3(Math.sin(az)*Math.cos(elevation),Math.sin(elevation),Math.cos(az)*Math.cos(elevation));
function fixture(){
 const encoded=Buffer.from(Uint16Array.from([32768|12,...Array.from({length:12},(_,i)=>THREE.DataUtils.toHalfFloat(i<3?.125:.03125))]).buffer).toString("base64");
 return{size:[1,1,1],azimuths:16,elevations:[0,15,35,60,85],zenithIndex:80,directions:Array(81).fill(encoded)};
}

test("half-float zero runs preserve exact values and reject invalid/truncated data",()=>{
 const f=fixture(),decoded=decodeSolarDirection(f,0);assert.equal(decoded.length,12);assert.deepEqual([...decoded.slice(0,3)],[.125,.125,.125]);
 for(const words of [[0],[32769],[13],[11]]){
  const bad={...f,directions:[Buffer.from(new Uint16Array(words).buffer).toString("base64")]};assert.throws(()=>decodeSolarDirection(bad,0),/Invalid|Truncated/);
 }
});
test("solar interpolation is convex, continuous across azimuth seam/pole, and absent below horizon",()=>{
 const f=fixture();
 for(let elevation=0;elevation<=90;elevation+=.5)for(let az=0;az<360;az+=7){
  const w=roomSolarWeights(f,sun(az*Math.PI/180,elevation*Math.PI/180));if(!elevation){assert.deepEqual(w,[]);continue;}
  close(w.reduce((n,x)=>n+x.weight,0),1);assert.ok(w.length<=4);w.forEach(x=>assert.ok(x.weight>0&&x.index>=0&&x.index<=80));
 }
 const sample=direction=>roomSolarWeights(f,direction).reduce((s,x)=>s+x.weight*Math.sin((x.index%16)*Math.PI/8),0);
 close(sample(sun(-1e-7,.6)),sample(sun(1e-7,.6)),1e-6);
 for(const a of [0,1,4])assert.deepEqual(roomSolarWeights(f,sun(a,Math.PI/2)),[{index:80,weight:1}]);
 assert.deepEqual(roomSolarWeights(f,new THREE.Vector3(0,-1,0)),[]);
});
test("CPU synthesis retains alpha/old sky, uses real light units and changes/upload only when inputs change",()=>{
 const field=fixture(),transport=new RoomSolarTransport({data:{test:field}}),base=new Uint16Array(16),output=new Uint16Array(16),m=new THREE.Matrix3();
 for(let i=0;i<16;i++)base[i]=THREE.DataUtils.toHalfFloat(i%4===3?1:.0625);
 const lighting={sun:sun(.2,.6),color:new THREE.Color(.8,.5,.25),intensity:3},day=.5;
 assert.equal(transport.compose("test",base,output,m,lighting,day),true);
 for(let i=0;i<16;i++){
  if(i%4===3)assert.equal(output[i],base[i]);
  else{const transfer=i<4?.125:.03125;close(THREE.DataUtils.fromHalfFloat(output[i]),.0625+transfer*3*[.8,.5,.25][i%4]/(2.4*day),.0003);}
 }
 const updates=transport.stats.updates;
 for(let i=0;i<120;i++)assert.equal(transport.compose("test",base,output,m,lighting,day),false);
 assert.equal(transport.stats.updates,updates);
 assert.equal(transport.compose("test",base,output,m,lighting,day,0),true);assert.deepEqual(output,base);
 transport.compose("test",base,output,m,{...lighting,sun:new THREE.Vector3(0,-1,0)},day);assert.deepEqual(output,base);
 transport.compose("test",base,output,m,{...lighting,visibility:0},day);assert.deepEqual(output,base);
 const invalid=base.slice();invalid[3]=0;invalid.fill(0,0,3);transport.compose("test",invalid,output,m,lighting,day);assert.deepEqual([...output.slice(0,4)],[0,0,0,0]);
 transport.dispose();assert.equal(transport.stats.cacheBytes,0);
});
test("rotated buildings query the same local solar direction; cache stays bounded through full-day traversal",()=>{
 const f=fixture(),t=new RoomSolarTransport({data:{test:f},maxCachedDirections:12}),base=new Uint16Array(16),a=new Uint16Array(16),b=new Uint16Array(16);
 for(let i=3;i<16;i+=4)base[i]=THREE.DataUtils.toHalfFloat(1);
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.73),inv=new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)).transpose(),light={sun:sun(.4,.5),color:new THREE.Color(1,1,1),intensity:3};
 t.compose("test",base,a,new THREE.Matrix3(),light,1);t.compose("test",base,b,inv,{...light,sun:light.sun.clone().applyQuaternion(q)},1);assert.deepEqual(a,b);
 for(let i=0;i<100;i++)t.compose("test",base,b,inv,{...light,sun:sun(i*.08,.3+i*.007)},1);
 assert.ok(t.cache.size<=12);assert.ok(t.stats.cacheBytes<=12*12*4);t.dispose();
});
test("five solar fields preserve current source/aperture/grid provenance and all excluded probes",async()=>{
 assert.deepEqual(Object.keys(ROOM_TRANSPORT_DATA).sort(),Object.keys(ROOM_BOUNCE_DATA).sort());let bytes=0;
 for(const[key,field]of Object.entries(ROOM_TRANSPORT_DATA)){
  const sky=ROOM_BOUNCE_DATA[key],base=decodeRoomField(sky);assert.deepEqual(field.size,sky.size);assert.deepEqual(field.bounds,sky.bounds);assert.deepEqual(field.openings,sky.openings);
  assert.equal(field.sourceSHA256,hash(await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url))));
  assert.equal(field.blendSHA256,hash(await readFile(new URL("../../../"+field.sourceBlend,import.meta.url))));
  assert.equal(field.directions.length,81);assert.equal(field.samples,96);let nonzero=0;
  for(let j=0;j<81;j++){
   bytes+=Buffer.from(field.directions[j],"base64").length;const values=decodeSolarDirection(field,j);
   for(let i=0;i<values.length;i++){
    assert.ok(Number.isFinite(values[i]));if(values[i])nonzero++;
    if(base[Math.floor(i/3)*4+3]===0)assert.equal(values[i],0,key+" roof/bathroom probe leaked");
   }
   assert.ok(field.directionMax[j]<=.91);
  }
  assert.ok(nonzero>100,key+" has no directional solar energy");
  assert.ok(Math.max(...field.directionMax)-Math.min(...field.directionMax)>.005,key+" behaves like a uniform fill");
 }
 console.log(JSON.stringify({solarRooms:5,directionsPerRoom:81,encodedBytes:bytes,extraFragmentSamplers:0}));
});
test("solar-only comparison restores v11 byte-for-byte when the second sky bounce is explicitly disabled",()=>{
 const light=new RoomIndirectLight(),item={id:"house",asset:SETTLEMENT_ASSETS.house_a,pose:{x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}}},lighting={sun:sun(0,.5),color:new THREE.Color(1,.7,.45),intensity:3};
 light.uniforms.uRoomApertureVisibility.value=0;light.uniforms.uRoomSkySecondBounce.value=0;light.setRoom(item,1,lighting);const texture=light.uniforms.uRoomBounceField.value,version=texture.version,source=decodeRoomField(ROOM_BOUNCE_DATA.house_a);
 assert.notDeepEqual(texture.image.data,source);const start=performance.now();for(let i=0;i<120;i++)light.setRoom(item,1,lighting);
 console.log(JSON.stringify({unchanged120MeanMs:(performance.now()-start)/120,solarCPU:light.field.solar.stats}));assert.equal(texture.version,version);
 light.uniforms.uRoomSunTransport.value=0;light.setRoom(item,1,lighting);assert.equal(light.uniforms.uRoomBounceField.value,texture);assert.deepEqual(texture.image.data,source);
 light.uniforms.uRoomSunTransport.value=1;light.setRoom(item,.2,{...lighting,sun:new THREE.Vector3(0,-1,0)});assert.deepEqual(texture.image.data,source);
 light.setRoom(item,0,lighting);assert.equal(light.uniforms.uRoomFieldActive.value,0);assert.equal(light.uniforms.uRoomAmbientActive.value,0);
 light.setRoom(null,1,lighting);assert.equal(light.uniforms.uRoomAmbientActive.value,0);
 assert.equal((ROOM_FIELD_GLSL.match(/texture\(uRoomBounceField/g)||[]).length,4);light.dispose();
});
