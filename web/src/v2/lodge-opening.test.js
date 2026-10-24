// Retained original-source comparison fixture; new default source is covered by lodge-furniture-loader.test.js.
import test,{beforeEach,afterEach} from 'node:test';
// These cases exercise the retained original dining receiver explicitly.
// Default whole-building adoption is verified in lodge-whole-gi.test.js.
let savedDiningLocation;
beforeEach(()=>{savedDiningLocation=globalThis.location;globalThis.location={search:'?lodgeFurniture=0&lodgeWholeGI=0'};});
afterEach(()=>{if(savedDiningLocation===undefined)delete globalThis.location;else globalThis.location=savedDiningLocation;});
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldStructures} from './structures.js';
import {SettlementRuntime} from './settlements.js';
import {LODGE_DINING_ASSET,prepareLodgeGlass} from './lodge-opening.js';
import {RoomIndirectLight} from './room-lighting.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const pose={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}};
const entity={id:'test-lodge',assetId:'gh_lanchuan_lodge'};
const world={entities:[entity],surface:{buildingPose:()=>pose,heightAt:()=>2000}};
test('actual lodge source is opaque but runtime derivative preserves complete geometry with clear panes and no opaque pane shadows',async()=>{
 const bytes=await readFile(new URL('../../public/assets/gh_lanchuan_lodge.glb',import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let originalTriangles=0;const geometries=[];gltf.scene.traverse(n=>{if(n.isMesh){originalTriangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;geometries.push(n.geometry);if(n.material.name==='glass'){assert.equal(n.material.transparent,false);assert.equal(n.material.opacity,1);}}});
 assert.equal(prepareLodgeGlass('another-asset',gltf.scene),0);
 const owner=new WorldStructures(world,{lodgeFurniture:false,lodgeChairs:false,preparedAssets:false,cooperativePreparation:false});owner.loadAsset=async()=>gltf;await owner.load();
 assert.equal(owner.stats.triangles,originalTriangles);assert.ok(geometries.every(g=>!g.userData.modified));
 const camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.set(-8,2001.6,0);camera.lookAt(-8,2001.6,4);camera.updateMatrixWorld();owner.update(camera,.016);
 const panes=owner.group.children.filter(n=>n.material.userData.lodgeThinGlass);assert.ok(panes.length>0);
 for(const pane of panes){assert.equal(pane.material.transparent,true);assert.equal(pane.material.depthWrite,false);assert.equal(pane.material.side,THREE.FrontSide);assert.equal(pane.castShadow,false);assert.equal(pane.material.roughness,.08);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};pane.material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/diffuseColor.a = 0.04/);assert.match(shader.fragmentShader,/vAssetOcclusion/);}
 assert.ok(owner.group.children.some(n=>!n.material.transparent&&n.castShadow));owner.dispose();
});
test('dining room registers all six actual external apertures with bounded transport and no borrowed GI field or global lamps',()=>{
 const runtime=new SettlementRuntime(world),camera=new THREE.PerspectiveCamera();runtime.indirect.field.lodgeEnabled=false;runtime.indirect.field.lodgeCross.enabled=false;camera.position.set(-8,2001.6,0);camera.lookAt(-8,2001.6,4);camera.updateMatrixWorld();runtime.update(camera,.016,45);
 assert.equal(runtime.lightingRoom.asset,LODGE_DINING_ASSET);assert.equal(runtime.indirect.uniforms.uRoomAmbientActive.value,1);assert.equal(runtime.indirect.uniforms.uRoomFieldActive.value,0);
 assert.equal(runtime.indirect.uniforms.uRoomOpenings.value.length,6);assert.ok(runtime.indirect.uniforms.uRoomOpenings.value.every(v=>v.w>0));assert.ok(runtime.lights.every(l=>!l.visible&&l.intensity===0));
 assert.deepEqual(LODGE_DINING_ASSET.openings.map(o=>o.center),[[-10.8,1.265,3.5],[-8.2,1.265,3.5],[-5.6,1.265,3.5],[-10.2,1.5,-3.5],[-4.6,1.05,-3.5],[-12.7,1.475,0]]);
 const material=new THREE.MeshStandardMaterial();runtime.indirect.register([material]);const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/uRoomOpenings\[6\]/);assert.match(shader.fragmentShader,/i<6;i\+\+/);assert.match(shader.fragmentShader,/apertureVisibility\[min\(i,2\)\]/);
 camera.position.set(-8,2001.6,3.65);camera.lookAt(-8,2001.6,0);camera.updateMatrixWorld();runtime.update(camera,.016,45);assert.equal(runtime.lightingRoom.asset,LODGE_DINING_ASSET,'outside glass retains visible room lighting');
 camera.position.set(100,2001.6,100);camera.updateMatrixWorld();runtime.update(camera,.016,45);assert.equal(runtime.indirect.uniforms.uRoomAmbientActive.value,0);runtime.dispose();material.dispose();
});
test('default existing room shader keeps its three-aperture contract',()=>{const light=new RoomIndirectLight();assert.equal(light.uniforms.uRoomOpenings.value.length,3);light.dispose();});
