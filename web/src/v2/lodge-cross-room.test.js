import test,{beforeEach,afterEach} from 'node:test';
// These cases exercise the retained original dining receiver explicitly.
// Default whole-building adoption is verified in lodge-whole-gi.test.js.
let savedDiningLocation;
beforeEach(()=>{savedDiningLocation=globalThis.location;globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0'};});
afterEach(()=>{if(savedDiningLocation===undefined)delete globalThis.location;else globalThis.location=savedDiningLocation;});
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import local from './lodge-room-data.js';
import cross from './lodge-cross-data.js';
import {LODGE_EAST_OPENINGS} from './lodge-cross-openings.js';
import {validateLodgeCross} from './lodge-cross-room.js';
import {LODGE_DINING_ASSET} from './lodge-opening.js';
import {RoomBounceField,decodeRoomField} from './room-bounce-field.js';
import {RoomIndirectLight} from './room-lighting.js';
const key=local.key,q=new THREE.Quaternion(),lighting={sun:new THREE.Vector3(.7,.3,.3).normalize(),color:new THREE.Color(1,.8,.7),intensity:4,visibility:1};
const create=async(enabled)=>{const f=new RoomBounceField();f.lodgeEnabled=true;f.lodgeCross.enabled=enabled;f.set(LODGE_DINING_ASSET,q);await f.prepare();return f;};
test('source is original eleven exterior openings; internal passage is not a sky source and blocked service windows give no direct transport',async()=>{
 assert.equal(validateLodgeCross(cross,local.sky),cross);assert.equal(LODGE_EAST_OPENINGS.length,11);
 assert.ok(LODGE_EAST_OPENINGS.every(o=>o.center[0]!==-3.7));assert.equal(LODGE_EAST_OPENINGS[0].source,'closed-glazed-main-door');
 assert.deepEqual(cross.directSky.visibleSamplesByOpening.slice(4,6),[0,0]);assert.deepEqual(cross.directSky.visibleSamplesByOpening.slice(9),[0,0]);assert.ok(cross.directSky.visibleSamplesByOpening.slice(0,4).every(n=>n>0));
 for(const[path,hash]of [['../../public/'+local.sky.sourceGLB,local.sky.sourceSHA256],['../../../'+local.sky.sourceBlend,local.sky.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),hash);
 const bytes=await readFile(new URL('./lodge-cross-data.js',import.meta.url));console.log(JSON.stringify({crossBytes:bytes.length,gzipBytes:gzipSync(bytes).length}));
 const bad=structuredClone(cross);bad.sourceOpenings[0].center=[-3.7,1,0];assert.throws(()=>validateLodgeCross(bad,local.sky),/source apertures/);
});
test('cross-room addition preserves all six local aperture channels and probe validity; off restores exact original buffer',async()=>{
 const f=await create(true),g=await create(false);f.setLighting(lighting,1);g.setLighting(lighting,1);const on=f.uniforms.uRoomBounceField.value.image.data,off=g.uniforms.uRoomBounceField.value.image.data.slice(),n=1105;
 assert.notDeepEqual(on,off);assert.equal(f.uniforms.uRoomFieldSlabs.value,5);assert.equal(on.length,off.length);
 for(let i=0;i<on.length;i++)if(i%4===3||i>=n*16)assert.equal(on[i],off[i],'all alpha and extra three aperture channels unchanged');
 f.lodgeCross.enabled=false;f.setLighting(lighting,1);assert.deepEqual(f.uniforms.uRoomBounceField.value.image.data,off);
 f.dispose();g.dispose();
});
test('east terrain solar visibility is independent of local six apertures; no duplicated direct sun or night sky',async()=>{
 const f=await create(true);f.lodgeCross.lighting={...lighting,visibility:0};f.setLighting({...lighting,visibility:0},1);const noSun=f.uniforms.uRoomBounceField.value.image.data.slice();
 f.lodgeCross.lighting=lighting;f.setLighting({...lighting,visibility:0},1);assert.notDeepEqual(f.uniforms.uRoomBounceField.value.image.data,noSun,'east sun can remain visible when dining sources blocked');
 f.uniforms.uRoomSunTransport.value=0;f.solar.clear();f.setLighting({...lighting,visibility:0},1);assert.deepEqual(f.uniforms.uRoomBounceField.value.image.data,noSun,'sun disabled removes only east reflected sunlight');
 const localOnly=await create(false);localOnly.setLighting({...lighting,intensity:0},1);assert.notDeepEqual(noSun,localOnly.uniforms.uRoomBounceField.value.image.data,'east skylight remains independent of sun');
 const original=decodeRoomField(local.sky);for(const field of [cross.sky,cross.secondSky,cross.directSky]){const values=decodeRoomField(field);for(let i=3;i<values.length;i+=4)assert.equal(values[i],original[i]);}
 const r=new RoomIndirectLight({openingCapacity:6});r.field.lodgeEnabled=true;r.field.lodgeCross.enabled=true;const item={id:'lodge',asset:LODGE_DINING_ASSET,pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}};r.setRoom(item,1,lighting);await r.field.prepare();r.setRoom(item,1,lighting);r.setRoom(item,0,{...lighting,intensity:0});assert.equal(r.uniforms.uRoomAmbientActive.value,0);assert.equal(r.uniforms.uRoomFieldActive.value,0);r.dispose();f.dispose();localOnly.dispose();
});

test('adopted defaults defer lodge imports until lodge access; explicit rollback disables old dining paths',()=>{
 const original=globalThis.location;
 try{
  globalThis.location={search:''};const defaults=new RoomBounceField();
  assert.equal(defaults.lodgeEnabled,true);assert.equal(defaults.lodgeCross.enabled,true);assert.equal(defaults.lodgePending,null);assert.equal(defaults.lodgeCross.pending,null);
  defaults.set({sourceAsset:'house_a'},q);assert.equal(defaults.lodgePending,null);assert.equal(defaults.lodgeCross.pending,null);defaults.dispose();
  globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0&lodgeRoomGI=0&lodgeCrossRoom=0'};const off=new RoomBounceField();assert.equal(off.lodgeEnabled,false);assert.equal(off.lodgeCross.enabled,false);off.set(LODGE_DINING_ASSET,q);assert.equal(off.uniforms.uRoomFieldActive.value,0);assert.equal(off.lodgePending,null);off.dispose();
 }finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
