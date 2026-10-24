import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldStructures} from './structures.js';import {BOARDWALK_CABIN} from './boardwalk-endpoints.js';import {CABIN_WINDOW_SOURCE_SHA} from './cabin-window-glass.js';import {cabinTimberEnabled,prepareCabinTimber} from './cabin-timber.js';import {collisionTriangles} from './collision.js';
const digest=a=>createHash('sha256').update(ArrayBuffer.isView(a)?new Uint8Array(a.buffer,a.byteOffset,a.byteLength):JSON.stringify(a)).digest('hex');
const raw=readFileSync(new URL('../../public/assets/cabin_small.glb',import.meta.url));
async function source(){const l=new GLTFLoader();l.register(()=>({name:'test-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));return l.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');}
const textureLoader=async()=>new T.Texture(),entities=Array.from({length:9},(_,i)=>({assetId:'cabin_small',id:i?'other-'+i:BOARDWALK_CABIN.entityId,x:i*10})),world={entities,manifest:{assetMetadata:{cabin_small:{sha256:CABIN_WINDOW_SOURCE_SHA}}},surface:{buildingPose:e=>({x:e.x,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
const owner=async enabled=>{const s=new WorldStructures(world,{cabinTimber:enabled,cabinTimberTextureLoader:textureLoader,loadAsset:source,cooperativePreparation:false});await s.load();return s;};
test('timber is explicit only and rejects changed original source/geometry',async()=>{
 assert.equal(cabinTimberEnabled(''),true);assert.equal(cabinTimberEnabled('?cabinTimber=0'),false);assert.equal(cabinTimberEnabled('?cabinTimber=1'),true);
 const g=await source();await assert.rejects(prepareCabinTimber('cabin_small',g.scene,{enabled:true,sourceSHA256:'wrong',textureLoader}),/source SHA/);
 g.scene.getObjectByName('cabin_small_log').geometry.attributes.position.setX(0,90);await assert.rejects(prepareCabinTimber('cabin_small',g.scene,{enabled:true,sourceSHA256:CABIN_WINDOW_SOURCE_SHA,textureLoader}),/geometry\/AO/);
});
test('full actual source retains all geometry/AO/UV/collision and radial ends, only target gets timber material',async()=>{
 const off=await owner(false),on=await owner(true);try{
 assert.equal(on.stats.triangles,off.stats.triangles);assert.equal(on._cabinTimber.stats.components,5);
 for(const e of entities)assert.equal(digest(collisionTriangles(on.collisionPartsFor(e))),digest(collisionTriangles(off.collisionPartsFor(e))),e.id);
 for(const [key,parts]of off._templates){const next=on._templates.get(key);assert.equal(next.length,parts.length);for(let i=0;i<parts.length;i++){
  const a=parts[i].geometry,b=next[i].geometry;assert.equal(digest(a.index.array),digest(b.index.array),parts[i].names.join()+" index");for(const [name,attr]of Object.entries(a.attributes))assert.equal(digest(attr.array),digest(b.attributes[name].array),parts[i].names.join()+'/'+name);
 }}
 const changed=on.group.children.filter(m=>m.material.userData.cabinTimber);assert.ok(changed.length>=2);for(const m of changed){assert.deepEqual(m.userData.entityIds,[BOARDWALK_CABIN.entityId]);assert.ok(m.geometry.hasAttribute('aCabinTimber'));assert.equal(m.material.transparent,false);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <aomap_fragment>'};m.material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/vAssetOcclusion/);assert.match(shader.fragmentShader,/getTangentFrame/);assert.doesNotMatch(shader.fragmentShader,/lodgeBoardSeam/);
 }
 const ends=on.group.children.filter(m=>m.userData.sourceMeshes.includes('cabin_small_logend'));assert.ok(ends.length);assert.ok(ends.every(m=>!m.material.userData.cabinTimber));
 for(const m of on.group.children.filter(m=>m.userData.entityIds.some(id=>id!==BOARDWALK_CABIN.entityId)))assert.equal(m.material.userData.cabinTimber,undefined);
 const camera=new T.PerspectiveCamera();on.update(camera,.016);assert.equal(on.stats.distanceTests,entities.length);
 }finally{on.dispose();off.dispose();}
});
