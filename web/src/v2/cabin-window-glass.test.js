import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldStructures} from './structures.js';import {WorldDoors} from './doors.js';import {BOARDWALK_CABIN} from './boardwalk-endpoints.js';import {collisionTriangles} from './collision.js';
import {CABIN_WINDOW_SOURCE_SHA,cabinWindowGlassEnabled,verifyCabinWindowSource} from './cabin-window-glass.js';
const raw=readFileSync(new URL('../../public/assets/cabin_small.glb',import.meta.url));
async function loadSource(){const l=new GLTFLoader();l.register(()=>({name:'test-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));return l.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');}
const entities=Array.from({length:9},(_,i)=>({assetId:'cabin_small',id:i?'same-asset-'+i:BOARDWALK_CABIN.entityId,x:i*12})),world={entities,surface:{buildingPose:e=>({x:e.x,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
async function owner(enabled){const doors=new WorldDoors(),s=new WorldStructures(world,{doors,cabinTimber:false,cabinWindowGlass:enabled,loadAsset:loadSource,cooperativePreparation:false});await s.load();return{s,doors,dispose(){s.dispose();doors.dispose();}};}
test('real cabin source has six separate opaque authored glass panes; wrong source cannot silently activate',async()=>{
 assert.equal(cabinWindowGlassEnabled(''),true);assert.equal(cabinWindowGlassEnabled('?cabinWindowGlass=0'),false);assert.equal(cabinWindowGlassEnabled('?cabinWindowGlass=1'),true);assert.equal(createHash('sha256').update(raw).digest('hex'),CABIN_WINDOW_SOURCE_SHA);
 const g=await loadSource(),node=g.scene.getObjectByName('cabin_small_glass'),before=node.geometry.attributes.position.array.slice();assert.equal(node.material.transparent,false);assert.equal(node.material.opacity,1);assert.equal(node.material.side,T.DoubleSide);assert.ok(node.material.roughness>.89);assert.equal(verifyCabinWindowSource(g.scene).triangles,72);assert.deepEqual(node.geometry.attributes.position.array,before);
 node.geometry.attributes.position.setX(0,100);assert.throws(()=>verifyCabinWindowSource(g.scene),/pane coordinates/);
});
test('only exact route0 entity receives transparent panes; all nine geometry/collision budgets and other materials remain',async()=>{
 const off=await owner(false),on=await owner();try{
 assert.equal(on.s.group.children.length,off.s.group.children.length+1,'Only one pane draw batch may split; other building batches remain shared');
 assert.equal(off.s.stats.triangles,on.s.stats.triangles);assert.equal(off.doors.stats.triangles,on.doors.stats.triangles);
 const thin=on.s.group.children.filter(m=>m.material.userData.cabinWindowThinGlass);assert.equal(thin.length,1);const pane=thin[0];assert.deepEqual(pane.userData.entityIds,[BOARDWALK_CABIN.entityId]);assert.equal(pane.geometry.index.count/3,72);assert.equal(pane.material.transparent,true);assert.equal(pane.material.depthWrite,false);assert.equal(pane.material.side,T.FrontSide);
 const other=on.s.group.children.filter(m=>m.userData.sourceMeshes.includes('cabin_small_glass')&&!m.material.userData.cabinWindowThinGlass);assert.equal(other.reduce((n,m)=>n+m.userData.entityIds.length,0),8);assert.ok(other.every(m=>!m.material.transparent&&m.material.opacity===1));
 for(const entity of entities){assert.deepEqual(collisionTriangles(on.s.collisionPartsFor(entity)),collisionTriangles(off.s.collisionPartsFor(entity)));}
 for(const m of on.s.group.children.filter(m=>!m.userData.sourceMeshes.includes('cabin_small_glass'))){assert.ok(!m.material.userData.cabinWindowThinGlass);const equivalent=off.s.group.children.find(p=>p.material.name===m.material.name);assert.ok(equivalent);assert.equal(m.material.transparent,equivalent.material.transparent);assert.equal(m.material.opacity,equivalent.material.opacity);assert.deepEqual(m.material.color.toArray(),equivalent.material.color.toArray());}
 const camera=new T.PerspectiveCamera(60,1,.1,1000);camera.position.set(0,2001.5,0);camera.lookAt(0,2001.5,-3.1);camera.updateMatrixWorld();on.s.update(camera,.016);assert.equal(pane.castShadow,false);assert.ok(on.s.group.children.some(m=>m.castShadow&&!m.material.transparent));
 const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <aomap_fragment>\n#include <opaque_fragment>'};pane.material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/vAssetOcclusion/);assert.match(shader.fragmentShader,/geometryViewDir/);assert.match(pane.material.customProgramCacheKey(),/cabin-route0-thin-glass/);
 }finally{off.dispose();on.dispose();}
});
