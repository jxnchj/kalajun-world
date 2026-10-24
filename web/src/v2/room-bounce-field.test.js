// This regression exercises the retained original guest-room source tables.
globalThis.location={search:'?guestVanity38=0'};
import {assertRoomFieldSamplingContract} from './room-field-contract.assert.js';
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {ROOM_BOUNCE_DATA} from "./room-bounce-registry.js";
import {RoomBounceField,decodeRoomField,ROOM_FIELD_GLSL} from "./room-bounce-field.js";
import {RoomIndirectLight,roomCeilingHeight,ROOM_BOUNCE_GLSL} from "./room-lighting.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
import {SettlementRuntime} from "./settlements.js";
const pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}};
const runtime=new SettlementRuntime({entities:[{id:"guest",assetId:"gh_lanchuan"}],surface:{heightAt:()=>0,buildingPose:()=>pose}});
const definitions={...SETTLEMENT_ASSETS,...Object.fromEntries(runtime.guestRooms.map(room=>[room.roomId,room.asset]))};
runtime.dispose();
const values=new Map();
function unpack(field){
 if(!values.has(field))values.set(field,Float32Array.from(decodeRoomField(field),THREE.DataUtils.fromHalfFloat));
 return values.get(field);
}
function coefficient(field,band,x,y,z){
 const[nx,ny,nz]=field.size,data=unpack(field),offset=(((band*nz+z)*ny+y)*nx+x)*4;
 return [...data.slice(offset,offset+4)];
}
// Independent CPU trilinear reference over probe coordinates, used to check the
// packed texture's axis/slab layout, validity weighting and spatial continuity.
function sample(field,p,n){
 const q=p.map((v,i)=>THREE.MathUtils.clamp((v-field.bounds[0][i])/(field.bounds[1][i]-field.bounds[0][i]),0,1)*(field.size[i]-1));
 const c=Array.from({length:4},()=>[0,0,0,0]);
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
  const sides=[x,y,z],index=q.map((v,i)=>Math.min(field.size[i]-1,Math.floor(v)+sides[i]));
  const weight=q.reduce((w,v,i)=>w*(sides[i]?v-Math.floor(v):1-v+Math.floor(v)),1);
  for(let band=0;band<4;band++){
   const v=coefficient(field,band,...index);v.forEach((a,i)=>c[band][i]+=weight*a);
  }
 }
 return c[0].slice(0,3).map((v,i)=>Math.max(0,(v+n.reduce((s,a,k)=>s+a*c[k+1][i],0))/Math.max(c[0][3],.001)));
}
const hash=b=>createHash("sha256").update(b).digest("hex");

test("five room fields match current source assets and authoritative aperture definitions",async()=>{
 assert.deepEqual(Object.keys(ROOM_BOUNCE_DATA).sort(),["house_a","yurt","lanchuan-freedom-1","lanchuan-freedom-2","lanchuan-freedom-3"].sort());
 let bytes=0,probes=0;
 for(const[key,field]of Object.entries(ROOM_BOUNCE_DATA)){
  assert.equal(hash(await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url))),field.sourceSHA256,key+" GLB changed: rebake its room field");
  assert.equal(hash(await readFile(new URL("../../../"+field.sourceBlend,import.meta.url))),field.blendSHA256,key+" source changed: rebake its room field");
  assert.deepEqual(field.openings,definitions[key].openings);
  assert.equal(field.samples,96);
  const data=decodeRoomField(field),floats=unpack(field);bytes+=data.byteLength;
  assert.ok([...floats].every(Number.isFinite));
  let valid=0;
  const[nx,ny,nz]=field.size;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const c=coefficient(field,0,x,y,z),alpha=c[3];
   assert.ok(alpha===0||alpha===1);valid+=alpha;
   assert.ok(c.slice(0,3).every(v=>v>=0),"constant irradiance cannot be negative");
   for(let band=1;band<4;band++)assert.equal(coefficient(field,band,x,y,z)[3],alpha);
   if(!alpha)for(let band=0;band<4;band++)assert.deepEqual(coefficient(field,band,x,y,z),[0,0,0,0]);
  }
  assert.equal(valid,field.validProbes);assert.ok(valid>nx*ny*nz*.35);probes+=valid;
 }
 assert.equal(bytes,61920);console.log(JSON.stringify({roomFields:5,rawHalfFloatBytes:bytes,validProbes:probes}));
});

test("baked samples respect pitched/circular roofs and each separate bathroom volume",()=>{
 let rejectedBathroom=0,rejectedRoof=0;
 for(const[key,field]of Object.entries(ROOM_BOUNCE_DATA)){
  const definition=definitions[key],bounds=definition.excludedBounds,[nx,ny,nz]=field.size;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const p=[x,y,z].map((v,i)=>field.bounds[0][i]+(field.bounds[1][i]-field.bounds[0][i])*v/(field.size[i]-1));
   const alpha=coefficient(field,0,x,y,z)[3];
   if(bounds&&p[0]>bounds[0]-.06&&p[0]<bounds[1]+.06&&p[2]>bounds[2]-.06&&p[2]<bounds[3]+.06){assert.equal(alpha,0);rejectedBathroom++;}
   if(p[1]>roomCeilingHeight(definition,p[0],p[2])-.055){assert.equal(alpha,0);rejectedRoof++;}
   if(definition.floor.shape==="circle"&&Math.hypot(p[0],p[2])>definition.floor.radius-.09)assert.equal(alpha,0);
  }
 }
 assert.ok(rejectedBathroom>100);assert.ok(rejectedRoof>50);
});

test("SH data is spatially continuous and responds to direction rather than a room-wide pedestal",()=>{
 for(const[key,field]of Object.entries(ROOM_BOUNCE_DATA)){
  const[nx,ny,nz]=field.size;let anisotropy=0,checked=0,spatialMin=Infinity,spatialMax=-Infinity;
  for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
   if(coefficient(field,0,x,y,z)[3]!==1)continue;
   const p=[x,y,z].map((v,i)=>field.bounds[0][i]+(field.bounds[1][i]-field.bounds[0][i])*v/(field.size[i]-1));
   const up=sample(field,p,[0,1,0]),down=sample(field,p,[0,-1,0]);
   anisotropy=Math.max(anisotropy,Math.abs(up[0]-down[0]));
   spatialMin=Math.min(spatialMin,up[0]);spatialMax=Math.max(spatialMax,up[0]);
   const shifted=sample(field,[p[0]+.0001,p[1],p[2]],[0,1,0]);
   assert.ok(up.every((v,i)=>Math.abs(v-shifted[i])<.001),"probe grid has a discontinuity "+key);
   const c0=coefficient(field,0,x,y,z),cy=coefficient(field,2,x,y,z);
   up.forEach((v,i)=>assert.ok(Math.abs(v-Math.max(0,c0[i]+cy[i]))<1e-6,"slab index or y direction mismatch"));
   checked++;
  }
  assert.ok(checked>10);assert.ok(anisotropy>.003,key+" loses directional response");
  assert.ok(spatialMax-spatialMin>.005,key+" loses spatial response");
 }
});

test("one filterable half-float texture is cached per visited room and disposed explicitly",()=>{
 const field=new RoomBounceField(),q=new THREE.Quaternion(),u=field.uniforms;
 assert.equal(u.uRoomFieldActive.value,0);
 const disposed=[];field.empty.addEventListener("dispose",()=>disposed.push("empty"));
 field.set(definitions.house_a,q);const house=u.uRoomBounceField.value;
 assert.equal(house.type,THREE.HalfFloatType);assert.equal(house.format,THREE.RGBAFormat);
 assert.equal(house.minFilter,THREE.LinearFilter);assert.equal(house.magFilter,THREE.LinearFilter);
 assert.equal(house.colorSpace,THREE.NoColorSpace);assert.equal(house.generateMipmaps,false);
 assert.deepEqual([house.image.width,house.image.height,house.image.depth],[9,5,28]);
 house.addEventListener("dispose",()=>disposed.push("house"));
 field.set(definitions.yurt,q);const yurt=u.uRoomBounceField.value;yurt.addEventListener("dispose",()=>disposed.push("yurt"));
 field.set(definitions.house_a,q);assert.equal(u.uRoomBounceField.value,house);assert.equal(field.cache.size,2);
 field.set({sourceAsset:"not-authored"},q);assert.equal(u.uRoomFieldActive.value,0);assert.equal(u.uRoomBounceField.value,field.empty);
 field.dispose();assert.equal(field.cache.size,0);assert.deepEqual(disposed.sort(),["empty","house","yurt"]);
 assertRoomFieldSamplingContract();
 assert.equal((ROOM_FIELD_GLSL.match(/uniform highp sampler3D/g)||[]).length,1);
});

test("room selection preserves local coordinates and independent normal rotation, then fully clears at night",()=>{
 const light=new RoomIndirectLight(),p={x:135,y:2010,z:-744,rot:.72,scale:{x:1.2,y:.8,z:1.3}};
 for(const[key,asset]of Object.entries(definitions)){
  if(!ROOM_BOUNCE_DATA[key])continue;
  const item={id:key,pose:p,asset};light.setRoom(item,1);
  const u=light.uniforms;assert.equal(u.uRoomFieldActive.value,1);
  const local=new THREE.Vector3(.2,1.4,.3),world=local.clone().applyMatrix4(light.matrix);
  assert.ok(world.applyMatrix4(u.uRoomWorldToLocal.value).distanceTo(local)<1e-9);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot),n=new THREE.Vector3(.1,.7,-.4).normalize();
  assert.ok(n.clone().applyQuaternion(q).applyMatrix3(u.uRoomFieldNormalToLocal.value).distanceTo(n)<1e-12);
  const texture=u.uRoomBounceField.value;light.setRoom(item,.2);assert.equal(u.uRoomBounceField.value,texture);assert.equal(u.uRoomBounceDay.value,.2);
  light.setRoom(item,0);assert.equal(u.uRoomFieldActive.value,0);assert.equal(u.uRoomAmbientActive.value,0);assert.equal(u.uRoomBounceActive.value,0);
 }
 light.dispose();
 assert.match(ROOM_BOUNCE_GLSL,/roomIrradiance\*=mask;roomRadiance\*=mask/);
 assert.match(ROOM_BOUNCE_GLSL,/fieldIrradiance\*2.4\*uRoomFieldDayScale/);
 assert.match(ROOM_BOUNCE_GLSL,/min\(diffuseEnergy,uRoomFiniteAperture>\.5\?3\.14159265:1\.4\)\*2\.0\*uRoomBounceDay/);
 assert.match(ROOM_BOUNCE_GLSL,/float mask=roomVolumeMask\(local\);if\(mask<=0.0\)return/);
});
