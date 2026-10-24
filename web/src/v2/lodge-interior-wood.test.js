import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{createHash}from'node:crypto';import * as T from 'three';
import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';import {prepareLodgeInteriorWood,lodgeInteriorWoodEnabled,loadLodgeInteriorRoughness}from'./lodge-interior-wood.js';import{installLodgeWood}from'./lodge-wood.js';
import {LODGE_CHAIRS_SOURCE as SOURCE}from'./lodge-chairs-definition.js';import layout from './generated/lodge-interior-wood-38.json' with{type:'json'};import surfaces from './generated/lodge-wood-surfaces-38.json' with{type:'json'};
import {WorldStructures}from'./structures.js';import{WorldDoors}from'./doors.js';import{LODGE_DOOR}from'./lodge-door.js';
const root=new URL('../../public/',import.meta.url),raw=fs.readFileSync(new URL(SOURCE.sourceGLB,root));
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
const asset=()=>new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length),'');
const attrs=g=>Object.fromEntries([...Object.entries(g.attributes),['index',g.index]].map(([k,a])=>[k,Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).slice()]));
const state=t=>JSON.stringify({repeat:t.repeat.toArray(),offset:t.offset.toArray(),wrapS:t.wrapS,wrapT:t.wrapT,flipY:t.flipY,colorSpace:t.colorSpace,anisotropy:t.anisotropy,minFilter:t.minFilter,magFilter:t.magFilter,rotation:t.rotation});
const mat=(s,name)=>{let out;s.traverse(n=>{if(n.isMesh&&n.material.name===name)out=n.material;});return out;};
const texture=()=>new T.Texture();
test('interior wood is isolated, on by default and only binds exact chairs source and calibrated diffuse input',async()=>{
 assert.equal(lodgeInteriorWoodEnabled(''),true);assert.equal(lodgeInteriorWoodEnabled('?lodgeInteriorWood38=0'),false);for(const q of ['?lodgeChairs38=0','?lodgeWood=1','?lodgeFurniture=0'])assert.equal(lodgeInteriorWoodEnabled(q),false);assert.equal(lodgeInteriorWoodEnabled('?lodgeChairs38=1'),true);assert.equal(lodgeInteriorWoodEnabled('?lodgeChairs38=1&lodgeInteriorWood38=1'),true);assert.equal(lodgeInteriorWoodEnabled('?lodgeInteriorWood38=1'),true);assert.throws(()=>lodgeInteriorWoodEnabled('?lodgeInteriorWood38=1&lodgeChairs38=0'),/matching/);
 assert.deepEqual(await prepareLodgeInteriorWood('house_a',null,{enabled:true}),{active:false});assert.deepEqual(await prepareLodgeInteriorWood('gh_lanchuan_lodge',null,{enabled:false}),{active:false});
 await assert.rejects(prepareLodgeInteriorWood('gh_lanchuan_lodge',null,{enabled:true,sourceSHA256:'wrong'}),/source differs/);assert.equal(createHash('sha256').update(raw).digest('hex'),SOURCE.sourceSHA256);assert.equal(layout.sourceSHA256,SOURCE.sourceSHA256);
 for(const name of ['pine','plank'])assert.deepEqual(surfaces.giTargetLinear,SOURCE.materialReflectance[name]);
});
test('all 668 selected triangles have two-dimensional physical charts, correct table end faces and upright lining grain',async()=>{
 const {scene}=await asset();let n=0;
 for(const rec of layout.nodes){const node=scene.getObjectByName(rec.name),g=node.geometry,b=Buffer.from(rec.field,'base64'),f=new Float32Array(b.buffer,b.byteOffset,b.length/4),ids=g.index.array;
 for(let t=0;t<ids.length;t+=3){const[a,b,c]=ids.slice(t,t+3);if(f[a*4+2]<0)continue;n++;const area=Math.abs((f[b*4]-f[a*4])*(f[c*4+1]-f[a*4+1])-(f[c*4]-f[a*4])*(f[b*4+1]-f[a*4+1]));assert.ok(area>1e-9);assert.equal(f[a*4+2],f[b*4+2]);assert.equal(f[a*4+2],f[c*4+2]);}
 if(rec.name.endsWith('_pine'))for(let i=0;i<f.length/4;i++){const x=g.attributes.position.getX(i),y=g.attributes.position.getY(i),normalY=g.attributes.normal.getY(i);if(x< -3.8&&Math.abs(normalY)<.01){assert.equal(f[i*4+2],1);assert.ok(Math.abs(f[i*4+1]-y)<1e-6,'lining longitudinal grain follows real vertical axis');}}
 }
 const extras=layout.nodes.flatMap(r=>r.components).filter(c=>c.indoorTop);assert.deepEqual(extras.map(c=>[c.name,c.triangles]),[['reception-top',12],['lounge-tea-top',56]]);
 assert.equal(n,668);assert.equal(layout.nodes.flatMap(r=>r.components).filter(c=>c.table).length,4);assert.equal(layout.nodes.flatMap(r=>r.components).length,32);
});
test('surface layer preserves every original attribute/material outside targets and borrows exact chair Texture objects without state mutations',async()=>{
 const {scene}=await asset(),before=new Map();scene.traverse(n=>{if(n.isMesh)before.set(n,{attributes:attrs(n.geometry),material:n.material});});
 const oak=mat(scene,'chair38 calibrated oak'),end=mat(scene,'chair38 real endgrain'),borrowed=[oak.map,oak.normalMap,end.map],states=borrowed.map(state);let requests=0;
 const result=await prepareLodgeInteriorWood('gh_lanchuan_lodge',scene,{enabled:true,sourceSHA256:SOURCE.sourceSHA256,textureLoader:async(rec,channel)=>{requests++;assert.equal(channel,'roughness');assert.equal(rec.sha256,surfaces.maps.roughness.sha256);return texture();}});
 assert.equal(requests,1);assert.equal(result.sharedTextureCount,3);assert.equal(result.additionalTextureBytes,3968436);assert.equal(result.tables,4);assert.equal(result.components,32);assert.deepEqual(borrowed.map(state),states);
 for(const[n,b]of before){const a=attrs(n.geometry);delete a.aLodgeWood;assert.deepEqual(a,b.attributes,n.name);if(!layout.nodes.some(r=>r.name===n.name))assert.equal(n.material,b.material);else{assert.equal(n.material.map,oak.map);assert.equal(n.material.normalMap,oak.normalMap);const target=n.material.clone();installLodgeWood(target,n.material);const shader={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};target.onBeforeCompile(shader);assert.equal(shader.uniforms.uLodgeEndMap.value,end.map);assert.equal(shader.uniforms.uLodgeLegacyMap.value,b.material.map);assert.ok(shader.fragmentShader.includes('getTangentFrame(-vViewPosition,normal,vLodgeWood.xy)'));assert.ok(shader.fragmentShader.includes('vLodgeWood.z>2.5'));target.dispose();}}
});
test('failure cannot dispose or alter borrowed textures and changed AO cannot receive mismatched projection',async()=>{
 const {scene}=await asset(),oak=mat(scene,'chair38 calibrated oak'),end=mat(scene,'chair38 real endgrain');let disposed=0;for(const t of[oak.map,oak.normalMap,end.map])t.addEventListener('dispose',()=>disposed++);
 await assert.rejects(prepareLodgeInteriorWood('gh_lanchuan_lodge',scene,{enabled:true,sourceSHA256:SOURCE.sourceSHA256,textureLoader:async()=>{throw Error('missing roughness');}}),/missing roughness/);assert.equal(disposed,0);
 scene.getObjectByName(layout.nodes[0].name).geometry.attributes.color.setX(0,.123);let ownedDisposed=0;await assert.rejects(prepareLodgeInteriorWood('gh_lanchuan_lodge',scene,{enabled:true,sourceSHA256:SOURCE.sourceSHA256,textureLoader:async()=>{const t=texture();t.addEventListener('dispose',()=>ownedDisposed++);return t;}}),/original geometry/);assert.equal(disposed,0);assert.equal(ownedDisposed,1);
});
test('actual structure pipeline retains complete chairs, original door and original collision under the grouped material candidate',async()=>{
 const world={entities:[{id:LODGE_DOOR.entityId,assetId:LODGE_DOOR.assetId}],surface:{buildingPose:()=>({x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}})}},doors=new WorldDoors(),owner=new WorldStructures(world,{doors,lodgeTables:false,lodgeInteriorWoodTextureLoader:async()=>texture(),lodgeChairsFetch:async url=>new Response(fs.readFileSync(new URL(String(url).split('?')[0].replace(/^\.\//,''),root))),preparedAssets:false,cooperativePreparation:false});
 try{await owner.load();assert.equal(owner.stats.status,'ready');assert.equal(owner.stats.triangles,113992);assert.equal(doors.stats.triangles,96);assert.equal(owner.collisionPartsFor(world.entities[0]).reduce((n,p)=>n+p.triangles,0),63592);assert.equal(owner.stats.assetPreparation.assets.gh_lanchuan_lodge.lodgeWood.sharedTextureCount,3);assert.equal(owner.stats.errors.length,0);const mats=owner.materials,plank=mats.find(m=>m.userData.sourceMaterialNames.includes('plank')),pine=mats.find(m=>m.userData.sourceMaterialNames.includes('pine'));assert.ok(plank&&pine);const legacy=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};m.onBeforeCompile(s);return s.uniforms.uLodgeLegacyMap.value;};assert.ok(legacy(plank)?.isTexture&&legacy(pine)?.isTexture);}finally{owner.dispose();doors.dispose();}
});

test('additional roughness decodes in GLTF orientation and retains non-colour sampling',async()=>{
 const savedFetch=globalThis.fetch,savedBitmap=globalThis.createImageBitmap;let options;
 try{globalThis.fetch=async()=>new Response(fs.readFileSync(new URL('assets/v2/lodge-wood/'+surfaces.maps.roughness.file,root)));globalThis.createImageBitmap=async(_blob,o)=>{options=o;return {width:2048,height:2048,close(){}};};const t=await loadLodgeInteriorRoughness(surfaces.maps.roughness,'roughness');assert.deepEqual(options,{imageOrientation:'none',colorSpaceConversion:'none'});assert.equal(t.flipY,false);assert.equal(t.colorSpace,T.NoColorSpace);t.dispose();}finally{globalThis.fetch=savedFetch;globalThis.createImageBitmap=savedBitmap;}
});

test('material cache may share equal fallback maps but separates different fallback bindings',async()=>{
 const {scene}=await asset(),pine=scene.getObjectByName('gh_lanchuan_lodge_pine');pine.material=pine.material.clone();pine.material.map=new T.Texture();
 await prepareLodgeInteriorWood('gh_lanchuan_lodge',scene,{enabled:true,sourceSHA256:SOURCE.sourceSHA256,textureLoader:async()=>texture()});
 const owner=new WorldStructures({entities:[],surface:{}});try{const a=owner._material(scene.getObjectByName('gh_lanchuan_lodge_plank').material),b=owner._material(pine.material);assert.notEqual(a,b,'same scanned maps do not make different original fallbacks equivalent');}finally{owner.dispose();}
});
