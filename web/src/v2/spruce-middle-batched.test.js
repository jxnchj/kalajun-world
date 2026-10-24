import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SpruceMiddleBatched} from './spruce-middle-batched.js';
import {attachEcologyWind} from './ecology.js';
import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
import {SunShadowCasters} from './sun-shadow-casters.js';
import {installTreeFrustumMaterial} from './tree-frustum-cull.js';
function fixture(capacity=8){
 const scene=new T.Scene(),group=new T.Group();scene.add(group);
 const geometry=new T.BoxGeometry(2,12,2);geometry.translate(0,6,0);geometry.setAttribute('aPlantWind',new T.Float32BufferAttribute(Array.from({length:geometry.attributes.position.count},()=>[.8,.5,.2]).flat(),3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=new T.MeshStandardMaterial({alphaTest:.45}),depth=new T.MeshDepthMaterial();material.defines={ECO_ROOT_WIND:''};depth.defines={ECO_ROOT_WIND:''};attachEcologyWind(material,{},1,false,true);attachEcologyWind(depth,{},1,false,true);
 const template=new T.InstancedMesh(geometry,material,capacity);template.customDepthMaterial=depth;
 const parts=[{mode:1,variant:0,mesh:template}],batches=new Map();let changes=0;const owner=new SpruceMiddleBatched(parts,group,{onChange:()=>changes++});
 function source(key,roots){
  const g=createTreeWindGeometry(geometry,capacity),mesh=new T.InstancedMesh(g,material,capacity);mesh.customDepthMaterial=depth;mesh.castShadow=true;group.add(mesh);const b={partIndex:0,mode:1,mesh,activeRecords:[],records:[]};batches.set(key,b);set(b,roots);return b;
 }
 function set(batch,roots){batch.activeRecords=roots.map(([id,x,z])=>({id,x,z}));batch.mesh.count=roots.length;roots.forEach(([id,x,z],i)=>{batch.mesh.setMatrixAt(i,new T.Matrix4().makeTranslation(x,0,z));batch.mesh.geometry.attributes.aTreeRootWind.data.array.set([.8,.6,.25+i*.1,.45,-.13+i*.02],i*5);});batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.geometry.attributes.aTreeRootWind.data.needsUpdate=true;}
 function close(){owner.dispose();for(const b of batches.values()){disposeTreeWindGeometry(b.mesh.geometry);b.mesh.dispose();}template.dispose();geometry.dispose();material.dispose();depth.dispose();}
 return {scene,group,geometry,material,depth,template,parts,batches,owner,source,set,close,get changes(){return changes;}};
}
test('native batched geometry preserves all static attribute/index bytes and exact original root matrices/wind values',()=>{
 const f=fixture();try{
  f.source('a',[['a',0,0],['b',80,20]]);f.source('b',[['c',-40,30]]);f.owner.sync(f.batches,1);const e=f.owner.entries.get(0);
  assert.equal(e.mesh.isBatchedMesh,true);assert.equal(e.mesh.sortObjects,false);assert.equal(e.roots.size,3);assert.equal(e.mesh.count,3);assert.ok([...f.batches.values()].every(b=>b.mesh.parent===null));
  for(const [name,a]of Object.entries(f.geometry.attributes))assert.deepEqual(e.mesh.geometry.attributes[name].array,a.array);assert.deepEqual(e.mesh.geometry.index.array,f.geometry.index.array);
  for(const b of f.batches.values())b.activeRecords.forEach((root,i)=>{const r=e.roots.get(root.id),m=new T.Matrix4();e.mesh.getMatrixAt(r.id,m);assert.deepEqual(m.elements,[...b.mesh.instanceMatrix.array.subarray(i*16,i*16+16)]);assert.deepEqual([...e.data.subarray(r.id*8,r.id*8+5)],[...b.mesh.geometry.attributes.aTreeRootWind.data.array.subarray(i*5,i*5+5)]);});
  const version=e.wind.version,writes=f.owner.stats.matrixWrites;f.owner.sync(f.batches,1);assert.equal(e.wind.version,version);assert.equal(f.owner.stats.matrixWrites,writes);
 }finally{f.close();}
});
test('full-capacity root replacement releases old native ids first and runtime off/on restores complete source path',()=>{
 const f=fixture(2);try{
  const b=f.source('a',[['a',0,0],['b',80,0]]);f.owner.sync(f.batches,1);const e=f.owner.entries.get(0),geometry=e.mesh.geometry;
  f.set(b,[['b',80,0],['c',-40,0]]);f.owner.sync(f.batches,2);assert.deepEqual([...e.roots.keys()].sort(),['b','c']);assert.equal(e.mesh.instanceCount,2);
  f.owner.enabled.value=false;assert.strictEqual(b.mesh.parent,f.group);assert.equal(b.mesh.count,2);assert.equal(e.mesh.visible,false);assert.strictEqual(b.mesh.geometry.attributes.position,f.geometry.attributes.position);
  f.set(b,[['c',-40,0],['d',20,0]]);f.owner.sync(f.batches,3);f.owner.enabled.value=true;assert.equal(b.mesh.parent,null);assert.equal(e.mesh.visible,true);assert.strictEqual(e.mesh.geometry,geometry);assert.deepEqual([...e.roots.keys()].sort(),['c','d']);assert.equal(f.changes,2);
 }finally{f.close();}
});
test('native main, reflection and shadow callbacks select the actual full-wind spheres with no root omission',()=>{
 const f=fixture(),renderer={extensions:{has:()=>true}};try{
  f.source('a',[['a',0,0],['b',100,0],['c',-100,0]]);f.owner.sync(f.batches,1);f.scene.updateMatrixWorld(true);const e=f.owner.entries.get(0),mesh=e.mesh;
  for(const [x,shadow]of [[0,false],[100,false],[-100,true]]){
   const camera=shadow?new T.OrthographicCamera(-15,15,18,-18,.1,200):new T.PerspectiveCamera(40,1,.1,200);camera.position.set(x,6,35);camera.lookAt(x,6,0);camera.updateMatrixWorld();
   if(shadow)mesh.onBeforeShadow(renderer,null,null,camera,mesh.geometry,mesh.customDepthMaterial);else mesh.onBeforeRender(renderer,f.scene,camera,mesh.geometry,mesh.material);
   const ids=[...mesh._indirectTexture.image.data.subarray(0,mesh._multiDrawCount)],frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   for(const r of e.roots.values()){const sphere=mesh.getBoundingSphereAt(e.geometryId,new T.Sphere()).applyMatrix4(mesh.getMatrixAt(r.id,new T.Matrix4()));if(frustum.intersectsSphere(sphere))assert.ok(ids.includes(r.id));}
   assert.equal(ids.length,1);assert.equal(ids[0],e.roots.get(x===0?'a':x===100?'b':'c').id);
  }
 }finally{f.close();}
});
test('root matrices and membership invalidate real shadow caster tracking while wind-only updates keep scheduled cadence',()=>{
 const f=fixture();try{
  const b=f.source('a',[['a',0,0]]);f.owner.sync(f.batches,1);const light=new T.DirectionalLight();light.position.set(0,30,10);Object.assign(light.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:.1,far:80});light.shadow.camera.updateProjectionMatrix();f.scene.add(light,light.target);const tracker=new SunShadowCasters(f.scene,[light]),camera=new T.PerspectiveCamera();
  assert.deepEqual([...tracker.update(camera).changed],[true]);assert.deepEqual([...tracker.update(camera).changed],[false]);
  b.mesh.geometry.attributes.aTreeRootWind.data.array[2]+=.1;b.mesh.geometry.attributes.aTreeRootWind.data.needsUpdate=true;f.owner.sync(f.batches,1);assert.deepEqual([...tracker.update(camera).changed],[false]);
  f.set(b,[['a',2,0]]);f.owner.sync(f.batches,2);assert.deepEqual([...tracker.update(camera).changed],[true]);assert.deepEqual([...tracker.update(camera).changed],[false]);
  f.set(b,[]);f.owner.sync(f.batches,3);assert.deepEqual([...tracker.update(camera).changed],[true]);assert.equal(tracker.result.counts[0],0);tracker.dispose();
 }finally{f.close();}
});
test('shader fetches native draw id/matrix only once before ecological LOD; colour/depth use same five root-wind floats',()=>{
 const f=fixture();try{
  installTreeFrustumMaterial(f.material,{value:1});installTreeFrustumMaterial(f.depth,{value:1});
  const e=f.owner.entries.get(0);for(const [view,lib]of [[e.colour,T.ShaderLib.standard],[e.depth,T.ShaderLib.depth]]){
   view.sync();const s={vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader,uniforms:{}};view.material.onBeforeCompile(s,{});const v=s.vertexShader;
   assert.strictEqual(s.uniforms.uMiddleTreeWind.value,e.wind);assert.equal((v.match(/getIndirectIndex\(gl_DrawID\)/g)||[]).length,1);assert.equal((v.match(/getBatchingMatrix\(middleInstance\)/g)||[]).length,1);assert.equal((v.match(/texelFetch\(uMiddleTreeWind/g)||[]).length,2);
   assert.ok(v.indexOf('ecoBatchMatrix=getBatchingMatrix')<v.indexOf('vPlantDistance=distance'));assert.match(v,/vec3 ecoRoot\(\) \{ return ecoBatchMatrix\[3\].xyz; \}/);assert.match(v,/mat4 batchingMatrix=ecoBatchMatrix/);assert.doesNotMatch(v,/attribute vec4 aTreeRootWind|\binstanceMatrix\b/);assert.match(v,/#include <project_vertex>/);assert.match(v,/ECO_LOD_EARLY_END/);
  }
 }finally{f.close();}
});
test('disposal releases private native geometry/textures/materials once while preserving original assets and fallback sources',()=>{
 const f=fixture();const b=f.source('a',[['a',0,0]]);f.owner.sync(f.batches,1);const e=f.owner.entries.get(0),counts={source:0,geometry:0,wind:0,matrix:0,ids:0,material:0};
 f.geometry.addEventListener('dispose',()=>counts.source++);e.mesh.geometry.addEventListener('dispose',()=>counts.geometry++);e.wind.addEventListener('dispose',()=>counts.wind++);e.mesh._matricesTexture.addEventListener('dispose',()=>counts.matrix++);e.mesh._indirectTexture.addEventListener('dispose',()=>counts.ids++);e.colour.material.addEventListener('dispose',()=>counts.material++);
 f.owner.dispose();f.owner.dispose();assert.deepEqual(counts,{source:0,geometry:1,wind:1,matrix:1,ids:1,material:1});assert.strictEqual(b.mesh.parent,f.group);f.close();
});

test('missing multi-draw extension restores original instancing without dropping the already queued native draw',()=>{
 const f=fixture();try{
  const b=f.source('a',[['a',0,0]]);f.owner.sync(f.batches,1);f.scene.updateMatrixWorld(true);const mesh=f.owner.entries.get(0).mesh,camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(0,5,30);camera.lookAt(0,5,0);camera.updateMatrixWorld();
  mesh.onBeforeRender({extensions:{has:()=>false}},f.scene,camera,mesh.geometry,mesh.material);
  assert.equal(f.owner.enabled.value,false);assert.strictEqual(b.mesh.parent,f.group);assert.equal(mesh._multiDrawCount,1);assert.equal(f.owner.stats.fallback,'WEBGL_multi_draw unavailable');
 }finally{f.close();}
});
test('all five actual cached middle crowns retain original indexed geometry and all static field bytes',async()=>{
 const {readFileSync}=await import('node:fs'),{gunzipSync}=await import('node:zlib'),base=new URL('../../public/assets/v2/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('spruce-canopy-v1.json',base))),raw=gunzipSync(readFileSync(new URL(manifest.payload.file,base)));
 const read=d=>{const Type={Float32Array:Float32Array,Uint16Array:Uint16Array,Uint32Array:Uint32Array}[d.type];return new Type(raw.buffer,raw.byteOffset+d.byteOffset,d.length).slice();};
 const parts=[];for(const [name,p]of Object.entries(manifest.parts))if(name.startsWith('mid:')){
  const geometry=new T.BufferGeometry();for(const [name,a]of Object.entries(p.attributes))geometry.setAttribute(({_plant_wind:'aPlantWind',_crown_occlusion:'aCrownOcclusion'})[name]??name,new T.BufferAttribute(read(a),a.itemSize,a.normalized));geometry.setIndex(new T.BufferAttribute(read(p.index),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new T.MeshStandardMaterial({alphaTest:.45}),depth=new T.MeshDepthMaterial();material.defines={ECO_ROOT_WIND:''};depth.defines={ECO_ROOT_WIND:''};attachEcologyWind(material,{},1,false,true);attachEcologyWind(depth,{},1,false,true);const mesh=new T.InstancedMesh(geometry,material,1600);mesh.customDepthMaterial=depth;parts.push({mode:1,variant:parts.length,mesh});
 }
 const owner=new SpruceMiddleBatched(parts,new T.Group());try{
  assert.equal(owner.entries.size,5);for(const [index,e]of owner.entries){const source=parts[index].mesh.geometry;for(const [name,a]of Object.entries(source.attributes))assert.deepEqual(e.mesh.geometry.attributes[name].array,a.array);assert.deepEqual([...e.mesh.geometry.index.array],[...source.index.array]);assert.equal(e.mesh.getBoundingSphereAt(e.geometryId,new T.Sphere()).radius>source.boundingSphere.radius,true);}
 }finally{owner.dispose();for(const {mesh}of parts){mesh.geometry.dispose();mesh.material.dispose();mesh.customDepthMaterial.dispose();mesh.dispose();}}
});
