import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {WorldStructures} from './structures.js';import {WorldDoors} from './doors.js';import {collisionTriangles} from './collision.js';import {HOUSE_TIMBER48_ENTITY} from './house-timber48.js';
const raw=fs.readFileSync(new URL('../../public/assets/v2/house_a_lived.glb',import.meta.url)),data48=JSON.parse(fs.readFileSync(new URL('../../public/assets/v2/house-timber48/fields.json',import.meta.url))),data58=JSON.parse(fs.readFileSync(new URL('../../public/assets/v2/house-furniture58/fields.json',import.meta.url)));globalThis.self=globalThis;
async function source(){const loader=new GLTFLoader();loader.register(()=>({name:'test-textures',loadTexture:()=>Promise.resolve(new T.Texture())}));return loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');}
const world={entities:[{assetId:'house_a',id:HOUSE_TIMBER48_ENTITY,x:100},{assetId:'house_a',id:'other-house',x:120}],surface:{buildingPose:e=>({x:e.x,y:2100,z:200,rot:.3,scale:{x:1,y:1,z:1}})}};
async function build(enabled,local=world){
 let loads58=0,textures=0,preparedCalls=0;const doors=new WorldDoors({document:null,eventTarget:null});
 const owner=new WorldStructures(local,{doors,houseFurniture58:enabled,houseFurniture58Options:{load:async()=>{loads58++;return data58;}},houseTimber48:true,houseTimber48Options:{load:async()=>data48,combineTextures:()=>{const color=new T.DataArrayTexture();color.userData.linearMean48=[.15,.12,.10];return{color,numeric:new T.DataTexture()};},textureLoader:async()=>{textures++;return new T.Texture();}},preparedAssets:true,loadAsset:source,cooperativePreparation:false});
 owner.preparedAssets.load=async()=>{preparedCalls++;return null;};await owner.load();
 return{owner,doors,get loads58(){return loads58;},get textures(){return textures;},get preparedCalls(){return preparedCalls;},dispose(){owner.dispose();doors.dispose();}};
}
function equal(a,b){assert.deepEqual(a.index.array,b.index.array);for(const[k,v]of Object.entries(a.attributes))assert.deepEqual(v.array,b.attributes[k].array,k);assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);}
test('explicit timber0 furniture1 fails clearly before resource owners allocate',()=>{
 assert.throws(()=>new WorldStructures(world,{houseTimber48:false,houseFurniture58:true}),/Furniture58 requires houseTimber48/);
});
test('adopted default furniture integrates near/far, complete doors/collision and single borrowed disposal without new textures',async()=>{
 const a=await build(false),b=await build(undefined);
 try{
  assert.equal(b.loads58,1);assert.equal(a.loads58,0);assert.equal(b.textures,a.textures);assert.equal(b.preparedCalls,0);
  assert.equal(b.owner.stats.houseFurniture58.nodes,6);assert.equal(b.owner.stats.houseFurniture58.vertices,10800);assert.equal(b.owner.stats.triangles,a.owner.stats.triangles);
  const aa=a.owner._templates.get('house_a:'),bb=b.owner._templates.get('house_a:');assert.equal(bb.length,aa.length);
  let active=0;
  for(let i=0;i<aa.length;i++){equal(aa[i].geometry,bb[i].geometry);assert.deepEqual(aa[i].names,bb[i].names);assert.ok(bb[i].geometry.attributes.aHouseFurniture58);if(bb[i].material.userData.houseFurniture58)active++;assert.equal(Boolean(bb[i].low),Boolean(aa[i].low));if(aa[i].low){equal(aa[i].low.geometry,bb[i].low.geometry);assert.ok(bb[i].low.geometry.attributes.aHouseFurniture58);}}
  assert.ok(active>0);for(const e of world.entities)assert.deepEqual(collisionTriangles(a.owner.collisionPartsFor(e)),collisionTriangles(b.owner.collisionPartsFor(e)));
  const ad=a.doors.templates.get('house_a'),bd=b.doors.templates.get('house_a');assert.equal(ad.length,bd.length);for(let i=0;i<ad.length;i++){assert.deepEqual(ad[i].base,bd[i].base);for(let j=0;j<ad[i].parts.length;j++)equal(ad[i].parts[j].geometry,bd[i].parts[j].geometry);}
  for(const mat of b.owner.materials.filter(m=>m.userData.houseFurniture58)){const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};mat.onBeforeCompile(s,{});assert.ok(s.fragmentShader.includes('vAssetOcclusion'));assert.ok(s.fragmentShader.includes('vFurnitureTarget58>.5'));assert.equal((s.fragmentShader.match(/uniform sampler2D uHouseNumeric48;/g)||[]).length,1);}
  const borrowed=Object.values(b.owner._houseFurniture58.textures),counts=new Map(borrowed.map(t=>[t,0]));for(const t of borrowed)t.addEventListener('dispose',()=>counts.set(t,counts.get(t)+1));
  b.owner.dispose();assert.equal(b.owner._houseFurniture58,null);assert.equal(b.owner.stats.houseFurniture58,undefined);for(const count of counts.values())assert.equal(count,1);
 }finally{a.dispose();b.doors.dispose();if(b.owner.stats.status!=='disposed')b.owner.dispose();}
});
test('neighbor-only world keeps original prepared path and adds no furniture or timber texture load',async()=>{
 const a=await build(true,{...world,entities:[world.entities[1]]});
 try{assert.equal(a.preparedCalls,1);assert.equal(a.loads58,0);assert.equal(a.textures,0);assert.equal(a.owner._houseFurniture58,undefined);assert.ok(a.owner.stats.triangles>0);}finally{a.dispose();}
});
