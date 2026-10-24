import test,{beforeEach,afterEach} from 'node:test';
// These cases exercise the retained original dining receiver explicitly.
// Default whole-building adoption is verified in lodge-whole-gi.test.js.
let savedDiningLocation;
beforeEach(()=>{savedDiningLocation=globalThis.location;globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0'};});
afterEach(()=>{if(savedDiningLocation===undefined)delete globalThis.location;else globalThis.location=savedDiningLocation;});
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {LODGE_DOOR} from './lodge-door.js';
import {LODGE_DINING_ASSET} from './lodge-opening.js';
import {LodgeDoorGI,lodgeDoorBracket,validateLodgeDoorGI} from './lodge-door-gi.js';
import local from './lodge-room-data.js';
import cross from './lodge-cross-data.js';
import {RoomBounceField,decodeRoomField} from './room-bounce-field.js';
import {decodeSolarDirection} from './room-solar-transport.js';
const modules=await Promise.all([import('./lodge-door-data/0.js'),import('./lodge-door-data/1.js'),import('./lodge-door-data/2.js')]);
const states=modules.map((m,i)=>validateLodgeDoorGI(m.default,i,local,cross));
const lighting={sun:new THREE.Vector3(.7,.3,.3).normalize(),color:new THREE.Color(1,.8,.7),intensity:4,visibility:1};
const leaves=angle=>[{name:LODGE_DOOR.name,angle,open:LODGE_DOOR.open}];
const create=async(enabled=true)=>{const f=new RoomBounceField();f.lodgeDoor.enabled=enabled;f.setDoorAngles(leaves(0));f.set(LODGE_DINING_ASSET,new THREE.Quaternion());await f.prepare();return f;};
const rgb=f=>f.uniforms.uRoomBounceField.value.image.data.slice();
test('three physical poses bind unchanged original source and all 96/32/81 paths, valid probes and six apertures',async()=>{
 for(const[path,expected]of [['../../public/'+local.sky.sourceGLB,local.sky.sourceSHA256],['../../../'+local.sky.sourceBlend,local.sky.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),expected);
 const valid=decodeRoomField(local.sky);
 for(const [index,state]of states.entries()){
  assert.equal(state.angle,1.75*index/2);
  for(const group of ['local','cross']){
   for(const name of ['sky','secondSky',...(group==='cross'?['directSky']:[])]){const a=decodeRoomField(state[group][name]);for(let i=3;i<a.length;i+=4)assert.equal(a[i],valid[i]);}
   assert.equal(state[group].sky.samples,96);assert.equal(state[group].secondSky.surfaceSamples,32);
   for(const name of ['solar','secondSolar'])for(let d=0;d<81;d++)assert.ok(decodeSolarDirection(state[group][name],d).every(Number.isFinite));
  }
  assert.equal(atob(state.local.apertures.data).length,1105*6);
 }
 const reports=await Promise.all([0,1,2].map(i=>readFile(new URL('../../../tools/reports/lodge-door-gi-'+i+'-v38.json',import.meta.url),'utf8').then(JSON.parse)));
 for(const r of reports){assert.equal(r.rotationMode,'QUATERNION');assert.ok(Math.abs(r.worldLeafAxis[0]-Math.cos(r.angle))<1e-6);assert.ok(Math.abs(r.worldLeafAxis[1]-Math.sin(r.angle))<1e-6);}
 assert.equal(reports[0].centreRayTransmission,.9);assert.equal(reports[2].centreRayTransmission,1);assert.ok(reports.every(r=>r.glassTriangles>0&&r.opaqueFaces===reports[0].opaqueFaces));
});
test('wrong source, leaf, angle, payload and receiving/source aperture identities cannot silently load',()=>{
 for(const change of [b=>b.door={...b.door,name:'wrong'},b=>b.angle=102,b=>b.local.sky.sourceSHA256='wrong',b=>b.cross.sky.sourceOpenings[0].skyWeight=.9,b=>b.local.sky.reusePayload='cross/sky']){
  const b=structuredClone(modules[1].default);change(b);assert.throws(()=>validateLodgeDoorGI(b,1,local,cross));
 }
 const d=new LodgeDoorGI({enabled:true});d.setState(leaves(.4));assert.equal(d.supports(local.key),true);assert.equal(d.supports('house_a'),false);d.setState([{name:'house_a_door0',angle:.4,open:1.75}]);assert.equal(d.supports(local.key),false);d.dispose();
});
test('actual room composition changes with door angle, retains single texture and off restores exact closed-source comparison',async()=>{
 const f=await create(),g=await create(false);f.setLighting(lighting,1);g.setLighting(lighting,1);const zero=rgb(f),old=rgb(g);
 f.setDoorAngles(leaves(1.75));f.setLighting(lighting,1);const open=rgb(f);assert.notDeepEqual(open,zero);assert.equal(f.lodgeDoor.stats.active,true);assert.equal(f.lodgeDoor.stats.extraSamplers,0);assert.equal(f.uniforms.uRoomFieldSlabs.value,5);
 for(let i=3;i<1105*4;i+=4)assert.equal(open[i],zero[i],'constant validity unchanged');
 f.lodgeDoor.enabled=false;f.setLighting(lighting,1);assert.deepEqual(rgb(f),old,'disable returns original closed-door GI, not altered source');
 f.dispose();g.dispose();
});
test('adjacent poses interpolate continuously at mid knot without accumulated drift; local/cross sun remain separate and night has no sky',async()=>{
 const f=await create(),sample=angle=>{f.setDoorAngles(leaves(angle));f.setLighting(lighting,1);return rgb(f);};
 assert.deepEqual(lodgeDoorBracket(0),{lo:0,hi:1,weight:0});assert.deepEqual(lodgeDoorBracket(1.75),{lo:1,hi:2,weight:1});
 const center=sample(.875),left=sample(.875-1e-6),right=sample(.875+1e-6);let error=0;
 for(let i=0;i<center.length;i++)error=Math.max(error,Math.abs(THREE.DataUtils.fromHalfFloat(left[i])-THREE.DataUtils.fromHalfFloat(right[i])));assert.ok(error<.002,'no pose discontinuity '+error);
 sample(1.7);assert.deepEqual(sample(.875),center,'no accumulated field blending');
 f.lodgeCross.lighting={...lighting,visibility:0};f.setLighting({...lighting,visibility:0},1);const sky=rgb(f);f.lodgeCross.lighting=lighting;f.setLighting({...lighting,visibility:0},1);assert.notDeepEqual(rgb(f),sky);
 f.setLighting({...lighting,intensity:0},0);const night=rgb(f);for(let i=0;i<1105*16;i++)if(i%4!==3)assert.equal(Math.abs(THREE.DataUtils.fromHalfFloat(night[i])),0);f.dispose();
});
test('original dining articulated lodge GI retains explicit rollback and loads no data on forest/other rooms',()=>{
 const saved=globalThis.location;
 try{globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0'};const d=new RoomBounceField();assert.equal(d.lodgeDoor.enabled,true);assert.equal(d.lodgeDoor.pending,null);d.dispose();globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0&lodgeDoor=0'};const rollback=new RoomBounceField();assert.equal(rollback.lodgeDoor.enabled,false);assert.equal(rollback.lodgeDoor.pending,null);rollback.dispose();globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0&lodgeDoor=1&lodgeDoorGI=0'};const off=new RoomBounceField();assert.equal(off.lodgeDoor.enabled,false);off.dispose();globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0&lodgeDoor=1'};const on=new RoomBounceField();assert.equal(on.lodgeDoor.enabled,true);on.set({sourceAsset:'house_a'},new THREE.Quaternion());assert.equal(on.lodgeDoor.pending,null);on.dispose();}finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved;}
});

test('actual settlement receiver resolves the entity door, not the synthetic dining-room id',async()=>{
 const {SettlementRuntime}=await import('./settlements.js');const pose={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}};
 const room=new SettlementRuntime({entities:[{id:LODGE_DOOR.entityId,assetId:LODGE_DOOR.assetId}],surface:{heightAt:()=>2000,buildingPose:()=>pose}}),camera=new THREE.PerspectiveCamera(),calls=[];let angle=.875;
 room.indirect.field.lodgeDoor.enabled=true;room.setDoorOpenness(id=>id===LODGE_DOOR.entityId ? .5 : 1,id=>{calls.push(id);return id===LODGE_DOOR.entityId?leaves(angle):[];});camera.position.set(-8,2001.6,0);camera.lookAt(-8,2001.6,4);camera.updateMatrixWorld();
 room.update(camera,.016,45);await room.indirect.field.prepare();room.update(camera,.016,45);
 assert.equal(room.indirect.field.lodgeDoor.stats.active,true);assert.equal(room.indirect.field.lodgeDoor.angle,.875);assert.ok(calls.length>0&&calls.every(id=>id===LODGE_DOOR.entityId));
 angle=1.75;room.update(camera,.016,45);assert.equal(room.indirect.field.lodgeDoor.angle,1.75);
 const retained=room.indirect.field.lodgeDoor.states;camera.position.set(100,2001.6,100);camera.lookAt(200,2001.6,100);camera.updateMatrixWorld();room.update(camera,.016,45);
 assert.equal(room.indirect.field.stats.active,false);assert.equal(room.indirect.field.lodgeDoor.stats.active,false);assert.equal(room.indirect.field.lodgeDoor.stats.bracket,null);assert.equal(room.indirect.field.lodgeDoor.angle,null);assert.equal(room.indirect.field.lodgeDoor.states,retained);
 camera.position.set(-8,2001.6,0);camera.lookAt(-8,2001.6,4);camera.updateMatrixWorld();room.update(camera,.016,45);assert.equal(room.indirect.field.lodgeDoor.stats.active,true);assert.equal(room.indirect.field.lodgeDoor.angle,1.75);room.dispose();
});

test('leaving the actual receiver clears active/bracket diagnostics while retained data reactivates correctly on return',async()=>{
 const f=await create();f.setDoorAngles(leaves(.875));f.setLighting(lighting,1);assert.equal(f.lodgeDoor.stats.active,true);assert.ok(f.lodgeDoor.stats.bracket);const states=f.lodgeDoor.states;
 f.setDoorAngles(null);assert.equal(f.lodgeDoor.stats.active,false);assert.equal(f.lodgeDoor.stats.bracket,null);assert.equal(f.lodgeDoor.angle,null);assert.equal(f.lodgeDoor.bracket,null);
 f.clear();assert.equal(f.lodgeDoor.ready,true);assert.equal(f.lodgeDoor.states,states);assert.equal(f.lodgeDoor.stats.active,false);
 f.setDoorAngles(leaves(1.75));f.set(LODGE_DINING_ASSET,new THREE.Quaternion());f.setLighting(lighting,1);assert.equal(f.lodgeDoor.stats.active,true);assert.deepEqual(f.lodgeDoor.stats.bracket,{lo:1,hi:2,weight:1});
 f.set({sourceAsset:'house_a'},new THREE.Quaternion());assert.equal(f.lodgeDoor.stats.active,false);assert.equal(f.lodgeDoor.stats.bracket,null);assert.equal(f.lodgeDoor.states,states);f.dispose();
});
