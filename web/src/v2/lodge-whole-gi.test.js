import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import {createHash}from'node:crypto';import {gunzipSync}from'node:zlib';import * as THREE from 'three';
import {LODGE_WHOLE_ASSET as ASSET,LODGE_WHOLE_KEY as KEY,LODGE_WHOLE_GRID as GRID,lodgeWholeEnabled}from'./lodge-whole-definition.js';
import {LODGE_DINING_ASSET}from'./lodge-opening.js';import {LODGE_DOOR}from'./lodge-door.js';import {LODGE_EAST_OPENINGS}from'./lodge-cross-openings.js';
import {validateLodgeWholeBase,loadLodgeWholeBase}from'./lodge-whole-field.js';import {validateLodgeDoorGI}from'./lodge-door-gi.js';import {decodeRoomField,RoomBounceField}from'./room-bounce-field.js';import {decodeSolarDirection}from'./room-solar-transport.js';
import {occupiedPastoralRoom}from'./room-view-selection.js';import {SettlementRuntime}from'./settlements.js';import {decodeLodgeDoorPackage}from'./lodge-door-codec.js';import delivery from './lodge-whole-package.json' with {type:'json'};
import old from './lodge-door-data/0.js';
const original=await Promise.all([0,1,2].map(i=>import('./lodge-whole-data/'+i+'.js').then(m=>m.default))),base=original[0];
const leaves=angle=>[{name:LODGE_DOOR.name,angle,open:LODGE_DOOR.open}];
const localFetch=async url=>new Response(await readFile(new URL('../../public/'+String(url).split('?')[0].replace(/^\.\//,''),import.meta.url)));
const lighting={sun:new THREE.Vector3(.7,.3,.3).normalize(),color:new THREE.Color(1,.8,.7),intensity:4,visibility:1};
test('whole source is original complete lodge and keeps old probe density, all apertures, 96/32/81 and three true leaf poses',async()=>{
 validateLodgeWholeBase(base);assert.deepEqual(GRID.size,[47,5,13]);assert.equal(ASSET.selectionOpenings.length,17);assert.equal(ASSET.openings.length,6);
 for(let axis=0;axis<3;axis++){const oldN=old.local.sky.size[axis];for(let i=0;i<oldN;i++){const oldP=THREE.MathUtils.lerp(old.local.sky.bounds[0][axis],old.local.sky.bounds[1][axis],i/(oldN-1)),newP=THREE.MathUtils.lerp(GRID.bounds[0][axis],GRID.bounds[1][axis],i/(GRID.size[axis]-1));assert.ok(Math.abs(oldP-newP)<1e-12,'old receiving coordinates preserved to numerical roundoff');}}
 for(const[path,sha]of [['../../public/'+base.local.sky.sourceGLB,base.local.sky.sourceSHA256],['../../../'+base.local.sky.sourceBlend,base.local.sky.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),sha);
 const valid=decodeRoomField(base.local.sky);assert.equal(base.local.sky.validProbes,2979);
 for(let index=0;index<3;index++){
  const b=validateLodgeDoorGI(original[index],index,base.local,base.cross,KEY);assert.equal(b.angle,1.75*index/2);
  const report=JSON.parse(await readFile(new URL('../../../tools/reports/lodge-whole-gi-'+index+'-v38.json',import.meta.url)));
  assert.equal(report.opaqueFaces,40360);assert.equal(report.glassTriangles,12);assert.ok(Math.abs(report.worldLeafAxis[0]-Math.cos(b.angle))<1e-6);assert.equal(report.centreRayTransmission,index===0?.9:1);
  for(const group of ['local','cross']){
   const f=b[group];assert.equal(f.sky.samples,96);assert.equal(f.secondSky.surfaceSamples,32);assert.equal(f.secondSolar.bounceOrder,2);
   for(const name of ['sky','secondSky',...(group==='cross'?['directSky']:[])]){const v=decodeRoomField(f[name]);for(let i=3;i<v.length;i+=4)assert.equal(v[i],valid[i]);}
   for(const name of ['solar','secondSolar'])for(let d=0;d<81;d++)assert.ok(decodeSolarDirection(f[name],d).every(Number.isFinite));
  }
 }
 assert.equal(base.contact.spacing,.025);assert.equal(base.contact.samples,64);assert.deepEqual(base.contact.size,[1001,265]);assert.ok(base.contact.contactTexels>5000);
});
test('all new walkable rooms have real zero/one/two transport, no duplicated local sources or passage-as-sky',()=>{
 const sourceNames=base.cross.directSky.sourceOpenings;assert.equal(sourceNames.length,11);assert.deepEqual(sourceNames,LODGE_EAST_OPENINGS.map((o,i)=>({...o,skyWeight:i===0?1:o.skyWeight})));
 const rgb=['directSky','sky','secondSky'].map(name=>decodeRoomField(base.cross[name]));
 for(const[x,z]of [[-2.1,2.3],[4.5,.1],[10.3,-.8],[10.3,1.5]]){const ix=Math.round((x-GRID.bounds[0][0])/GRID.spacing[0]),iz=Math.round((z-GRID.bounds[0][2])/GRID.spacing[2]),i=((iz*5+2)*47+ix)*4;assert.equal(THREE.DataUtils.fromHalfFloat(rgb[0][i+3]),1);for(const[name,a]of ['directSky','sky','secondSky'].map((n,i)=>[n,rgb[i]]))assert.ok(THREE.DataUtils.fromHalfFloat(a[i])>0,name+' has positive physical transport at '+[x,z]);}
});
test('lossless whole package preserves exact baked objects and fallback explicitly retains identical complete base',async()=>{
 const packed=await readFile(new URL('../../public/'+delivery.delta.url,import.meta.url));const states=await decodeLodgeDoorPackage(gunzipSync(packed),{local:base.local,cross:base.cross});assert.deepEqual(states,original);
 const gzip=await readFile(new URL('../../public/'+delivery.base.url,import.meta.url));for(const body of [gzip,gunzipSync(gzip)]){let fallback=0;const stats={};assert.deepEqual(await loadLodgeWholeBase({fetchImpl:async()=>new Response(body),fallback:async()=>{fallback++;return{default:base}},stats}),base);assert.equal(fallback,0);assert.equal(stats.status,'gzip-base');}
 const bad=gzip.slice();bad[bad.length-4]^=1;let count=0;const stats={};assert.deepEqual(await loadLodgeWholeBase({fetchImpl:async()=>new Response(bad),fallback:async()=>{count++;return{default:base}},stats}),base);assert.equal(count,1);assert.equal(stats.status,'fallback');assert.match(stats.reason,/checksum/);
});
test('original-geometry rollback retains whole receiver; explicit whole off keeps original dining and forest requests no whole data',()=>{
 assert.equal(lodgeWholeEnabled(''),true);assert.equal(lodgeWholeEnabled('?lodgeFurniture=0&lodgeWholeGI=0'),false);assert.equal(lodgeWholeEnabled('?lodgeWholeGI=1'),true);const saved=globalThis.location;
 try{globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0'};const f=new RoomBounceField();assert.equal(f.lodgeKey,LODGE_DINING_ASSET.sourceAsset);assert.equal(f.lodgePending,null);f.dispose();globalThis.location={search:'?lodgeFurniture=0'};const g=new RoomBounceField();g.set({sourceAsset:'house_a'},new THREE.Quaternion());assert.equal(g.lodgePending,null);assert.equal(g.lodgeDoor.pending,null);g.dispose();}finally{globalThis.location=saved;}
});
test('actual entry/reception/lounge/service/dining path owns one prepared field with real door updates and no night/outside residual',async()=>{
 const savedLocation=globalThis.location,savedFetch=globalThis.fetch;globalThis.location={search:'?lodgeFurniture=0'};let fetches=0;globalThis.fetch=async(...args)=>{fetches++;return localFetch(...args)};
 try{
  const pose={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}},r=new SettlementRuntime({entities:[{id:LODGE_DOOR.entityId,assetId:LODGE_DOOR.assetId}],surface:{heightAt:()=>2000,buildingPose:()=>pose}}),camera=new THREE.PerspectiveCamera();let angle=.875;r.setDoorOpenness(()=>.5,()=>leaves(angle));r.setSunLighting?.(lighting);
  const move=(x,z,elevation=45)=>{camera.position.set(x,2001.6,z);camera.lookAt(x+1,2001.6,z-.3);camera.updateMatrixWorld();r.update(camera,.016,elevation);};
  move(-2.1,2.3);await r.indirect.field.prepare();move(-2.1,2.3);assert.equal(fetches,2,'only whole base+delta, no old dining packet');const texture=r.indirect.field.uniforms.uRoomBounceField.value;
  for(const[x,z]of [[-2.1,2.3],[4.5,.1],[10.3,-.8],[10.3,1.5],[-3.7,0],[-8,0]]){move(x,z);assert.equal(r.indirect.field.key,KEY);assert.equal(r.indirect.field.uniforms.uRoomBounceField.value,texture);assert.equal(r.indirect.field.lodgeDoor.stats.active,true);assert.equal(r.indirect.field.lodgeDoor.angle,.875);assert.equal(r.indirect.contact.key,KEY);}
  const f=r.indirect.field;f.setLighting(lighting,1);const half=texture.image.data.slice();assert.ok(f.composeBuffers.get(KEY).some((v,i)=>i%4!==3&&v!==0),'ready articulated lodge must retain RGB transport, not just aperture alpha');assert.equal(f.doors.stats.pending,false);assert.equal(f.doors.stats.bypassedBy,'lodge-articulated');angle=1.75;move(-2.1,2.3);f.setLighting(lighting,1);assert.notDeepEqual(texture.image.data,half);assert.equal(f.uniforms.uRoomFieldSlabs.value,5);
  assert.equal(occupiedPastoralRoom(r.pastoralPoses,new THREE.Vector3(0,2001.6,4)),null,'porch remains exterior');assert.equal(occupiedPastoralRoom(r.pastoralPoses,new THREE.Vector3(0,2003.1,0)),null,'no field above real ceiling');
  move(4.5,.1,-17);assert.equal(f.uniforms.uRoomFieldActive.value,0);assert.equal(r.indirect.uniforms.uRoomAmbientActive.value,0);assert.equal(f.lodgeDoor.stats.active,false);
  move(100,100);assert.equal(f.key,null);assert.equal(f.lodgeDoor.stats.active,false);assert.equal(f.lodgeDoor.stats.bracket,null);move(4.5,.1);assert.equal(f.key,KEY);assert.equal(f.lodgeDoor.angle,1.75);assert.equal(fetches,2);r.dispose();
 }finally{globalThis.location=savedLocation;globalThis.fetch=savedFetch;}
});
