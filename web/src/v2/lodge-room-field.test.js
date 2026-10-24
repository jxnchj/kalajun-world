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
import bundle from './lodge-room-data.js';
import {LODGE_ROOM_KEY,validateLodgeRoom} from './lodge-room-field.js';
import {LODGE_DINING_ASSET} from './lodge-opening.js';
import {RoomBounceField,decodeRoomField} from './room-bounce-field.js';
import {RoomIndirectLight} from './room-lighting.js';
import {decodeSolarDirection} from './room-solar-transport.js';
const light={sun:new THREE.Vector3(.25,.8,.4).normalize(),color:new THREE.Color(1,.8,.65),intensity:3,visibility:1};
const pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}};
const create=()=>{const f=new RoomBounceField();f.lodgeCross.enabled=false;f.lodgeEnabled=true;f.stats.lodge.enabled=true;return f;};
test('complete original lodge geometry, original PBR albedo and all six aperture identities bind to actual data',async()=>{
 assert.equal(validateLodgeRoom(bundle),bundle);
 for(const [path,hash]of [['../../public/'+bundle.sky.sourceGLB,bundle.sky.sourceSHA256],['../../../'+bundle.sky.sourceBlend,bundle.sky.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),hash);
 const report=JSON.parse(await readFile(new URL('../../../tools/reports/lodge-dining-gi-v38.json',import.meta.url)));
 assert.equal(report.geometryCheckedTriangles,40552);assert.ok(report.maximumCoordinateError<2e-5);assert.equal(report.sourceGLBUnchanged,true);
 assert.ok(report.materialReflectance.plank.every(v=>v>0&&v<.8));assert.ok(Math.abs(report.materialReflectance.rattan[0]-.48)<1e-6);
 assert.deepEqual(bundle.sky.size,[17,5,13]);assert.equal(bundle.sky.validProbes,1077);
 assert.equal(bundle.apertures.summary.length,6);for(const o of bundle.apertures.summary){assert.ok(o.fullyBlockedProbes>0);assert.ok(o.maxVisibility>.95);}
 assert.equal(bundle.contact.spacing,.025);assert.ok(bundle.contact.contactTexels>0);
 const raw=await readFile(new URL('./lodge-room-data.js',import.meta.url));console.log(JSON.stringify({moduleBytes:raw.length,gzipBytes:gzipSync(raw).length}));
 const bad=structuredClone(bundle);bad.apertures.data=bad.apertures.data.slice(0,100);assert.throws(()=>validateLodgeRoom(bad),/six-aperture/);
 const wrong=structuredClone(bundle);wrong.secondSolar.blendSHA256='bad';assert.throws(()=>validateLodgeRoom(wrong),/source\/grid/);
});
test('same SH sampler carries independent six-aperture visibility without changing reflection values or original rooms',async()=>{
 const f=create();f.set(LODGE_DINING_ASSET,new THREE.Quaternion());await f.prepare();f.setLighting(light,1);
 assert.equal(f.lodgeReady,true);assert.equal(f.key,LODGE_ROOM_KEY);const t=f.uniforms.uRoomBounceField.value,n=1105;
 assert.deepEqual([t.image.width,t.image.height,t.image.depth],[17,5,65]);assert.equal(f.uniforms.uRoomFieldSlabs.value,5);
 const a=Uint8Array.from(atob(bundle.apertures.data),c=>c.charCodeAt(0)),composed=f.composeBuffers.get(LODGE_ROOM_KEY);
 for(let o=0;o<6;o++)for(let i=0;i<n;i++){
  const at=o<3?(o+1)*n*4+i*4+3:n*16+i*4+o-3;
  assert.equal(t.image.data[at],THREE.DataUtils.toHalfFloat(a[o*n+i]/255));
 }
 for(let i=0;i<n*16;i++)assert.equal(t.image.data[i],composed[i]);
 const before=t.image.data.slice();f.uniforms.uRoomApertureVisibility.value=0;f.setLighting(light,1);
 for(let i=0;i<n*16;i++)if(i%4!==3)assert.equal(t.image.data[i],before[i]);
 const off=new RoomBounceField({lodgeRoomGI:0});off.set(LODGE_DINING_ASSET,new THREE.Quaternion());assert.equal(off.uniforms.uRoomFieldActive.value,0,'explicit off stays off after shared bundle loaded');
 f.set({sourceAsset:'house_a'},new THREE.Quaternion());assert.equal(f.uniforms.uRoomFieldSlabs.value,4);assert.equal(f.uniforms.uRoomBounceField.value.image.depth,28);f.dispose();off.dispose();
});
test('two genuine passive transport orders retain all 81 solar directions and respond to live sun; no night skylight',async()=>{
 const count=1105,sky=decodeRoomField(bundle.sky),second=decodeRoomField(bundle.secondSky);let secondEnergy=0;
 for(let i=0;i<sky.length;i++){if(i%4===3)assert.equal(second[i],sky[i]);else secondEnergy+=Math.abs(THREE.DataUtils.fromHalfFloat(second[i]));}assert.ok(secondEnergy>0);
 for(const field of [bundle.solar,bundle.secondSolar])for(let d=0;d<81;d++){const values=decodeSolarDirection(field,d);assert.equal(values.length,count*12);assert.ok(values.every(Number.isFinite));for(let i=0;i<count*3;i++)assert.ok(values[i]>=0&&values[i]<=.9+(field.bounceOrder===2?0:0)+1e-3);}
 const f=create();f.set(LODGE_DINING_ASSET,new THREE.Quaternion());await f.prepare();f.setLighting(light,1);const first=f.uniforms.uRoomBounceField.value.image.data.slice();
 f.setLighting({...light,sun:new THREE.Vector3(-.6,.3,-.7).normalize()},1);assert.notDeepEqual(f.uniforms.uRoomBounceField.value.image.data,first);
 const indirect=new RoomIndirectLight({openingCapacity:6});indirect.field.lodgeEnabled=true;const item={id:'dining',asset:LODGE_DINING_ASSET,pose};indirect.setRoom(item,1,light);await indirect.field.prepare();indirect.setRoom(item,1,light);assert.equal(indirect.uniforms.uRoomFieldActive.value,1);assert.equal(indirect.contact.stats.active,true);
 indirect.setRoom(item,0,{...light,intensity:0});assert.equal(indirect.uniforms.uRoomAmbientActive.value,0);assert.equal(indirect.uniforms.uRoomFieldActive.value,0);assert.equal(indirect.contact.stats.active,true);
 indirect.dispose();f.dispose();
});
