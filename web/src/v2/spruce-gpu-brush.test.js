import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import * as THREE from 'three';
import {buildBrushPacket,packetNeedleVertex} from './spruce-brush-packet.js';import {generateBrush} from './spruce-brush.js';import {createSpruceLoader,spruceGeometryContainer} from './spruce-loading.js';import {loadGpuSpruceRecipe,createGpuPacketBuilder,createNearShell} from './spruce-gpu-loading.js';
import {createGpuBrushTemplate,createGpuBrushTables,installGpuBrush,SpruceGpuBrushes} from './spruce-gpu-brush.js';import {attachEcologyWind,treeLodMayContribute} from './ecology.js';import {installCrownOcclusion} from './spruce-geometry.js';import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
const payload=await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url)),recipe=JSON.parse(gunzipSync(payload));
const fakeFetch=async()=>({ok:true,arrayBuffer:async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength)});
let hiPromise;function hi(){return hiPromise??=(async()=>{const bytes=await readFile(new URL('../../public/assets/v2/schrenk-spruce-hi.glb',import.meta.url)),loader=createSpruceLoader();loader.register(()=>({name:'NODE_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');})();}
test('shared GPU station tables preserve all needles, normal directions, wind and AO',t=>{
 let maxPosition=0,maxAngle=0,compared=0;
 for(const form of Object.values(recipe.forms))for(const index of [0,Math.floor(form.instances.length/2),form.instances.length-1]){
  const record=form.instances[index],packet=buildBrushPacket([record]);let needle=0;
  const emitted=[];generateBrush(record,(p,n,uv,w,ao)=>emitted.push({p,n,uv,w,ao}));
  // Original emits woody quads between needle stations. Its wood UV is distinct.
  for(let i=0;i<emitted.length;i+=3){if(emitted[i].uv[0]>558/2048&&emitted[i].uv[0]<559/2048)continue;
   for(let corner=0;corner<3;corner++){
    const expected=emitted[i+corner],actual=packetNeedleVertex(packet,0,needle,corner);compared++;
    maxPosition=Math.max(maxPosition,...actual.position.map((x,k)=>Math.abs(x-expected.p[k])));
    const dot=actual.normal.reduce((n,x,k)=>n+x*expected.n[k],0)/Math.hypot(...expected.n);maxAngle=Math.max(maxAngle,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);
    assert.deepEqual(actual.wind,expected.w);assert.ok(Math.abs(actual.ao-expected.ao)<6e-8);
   }needle++;
  }assert.equal(needle,1440);
 }
 assert.ok(maxPosition<.00001,`${maxPosition}`);assert.ok(maxAngle<.1,`${maxAngle}`);t.diagnostic(JSON.stringify({compared,maxPosition,maxAngle}));
});
test('actual recipe uses one topology and bounded tables without expanded needle arrays',async t=>{
 const source=await hi(),old=source.scene.getObjectByName('pencil_frond').geometry,loaded=await loadGpuSpruceRecipe(source,'recipe',{fetchImpl:fakeFetch,workerFactory:null,crown:false});
 assert.equal(loaded.userData.brushes,1143);assert.equal(loaded.userData.needles,1645920);assert.equal(loaded.userData.generatedFrondBytes,0);assert.equal(loaded.userData.parameterBytes,40654224);
 const template=createGpuBrushTemplate(loaded.gpuPackets[0].topology);assert.equal(template.attributes.position.count,1596*3);
 for(const packet of loaded.gpuPackets)assert.deepEqual(packet.topology,loaded.gpuPackets[0].topology);
 const scene=loaded.scene;let triangles=0;scene.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});assert.equal(triangles+1143*1596,1895756);
 assert.strictEqual(source.scene.getObjectByName('pencil_frond').geometry,old);
 for(const f of ['column','edge','old','pencil','young']){const g=scene.getObjectByName(f+'_frond').geometry;assert.ok(g.userData.gpuBrushShell);assert.ok(spruceGeometryContainer(g,new THREE.Matrix4()).userData.gpuBrushShell);assert.ok(g.boundingBox.containsBox(source.scene.getObjectByName(f+'_frond').geometry.boundingBox));}
 for(const k of ['fetchMs','decodeMs','validateMs','templateBuildMs','geometrySetupMs'])assert.ok(loaded.userData.timings[k]>=0);
 t.diagnostic(JSON.stringify(loaded.userData));template.dispose();
});
test('GPU colour/depth hooks retain shared early LOD, root wind, normal and AO contracts',()=>{
 const packet=buildBrushPacket([recipe.forms.pencil.instances[0]]),tables=createGpuBrushTables(packet);
 for(const depth of [false,true]){
  const m=depth?new THREE.MeshDepthMaterial():new THREE.MeshStandardMaterial();attachEcologyWind(m,{},12,false,true);if(!depth)installCrownOcclusion(m);installGpuBrush(m,tables);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib[depth?'depth':'standard'].vertexShader,fragmentShader:THREE.ShaderLib[depth?'depth':'standard'].fragmentShader};m.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.indexOf('if (vPlantDistance>=15.')<shader.vertexShader.indexOf('readBrush(brushPosition'));
  assert.match(shader.vertexShader,/ecoWeights=brushWind/);assert.match(shader.vertexShader,/ecoBend\(brushPosition.y/);assert.match(shader.vertexShader,/vec3 transformed=brushPosition/);assert.ok(!shader.vertexShader.includes('position.y'));
  if(!depth){assert.match(shader.vertexShader,/vec3 objectNormal=brushNormal/);assert.match(shader.vertexShader,/vCrownOcclusion=brushAO/);}
  assert.strictEqual(shader.uniforms.uBrushFrames.value,tables.frames);m.dispose();
 }tables.dispose();
});
test('nested instance divisor preserves root count, conservative bounds and last-owner GPU release',()=>{
 const packet=buildBrushPacket(recipe.forms.pencil.instances.slice(0,2)),tables=createGpuBrushTables(packet),template=createGpuBrushTemplate(packet.topology),material=new THREE.MeshStandardMaterial(),depth=new THREE.MeshDepthMaterial();material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(6,18,6),windGeometry=createTreeWindGeometry(source,4),mesh=new THREE.InstancedMesh(windGeometry,material,4);mesh.count=2;mesh.visible=true;mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-10,0,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(8,0,0));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
 const forms=Array.from({length:5},()=>({tables,material,depth})),runtime=new SpruceGpuBrushes(forms,template),batches=new Map([['one',{mode:12,variant:3,mesh,activeRecords:[{id:'a'},{id:'b'}]}]]);
 runtime.sync(batches);const result=runtime.batches.get('one').mesh,bounds=result.boundingSphere;
 assert.equal(result.count,4);assert.equal(result.instanceMatrix.meshPerAttribute,2);assert.strictEqual(result.instanceMatrix.array,mesh.instanceMatrix.array);assert.equal(result.geometry.attributes.aTreeRootWind.data.meshPerAttribute,2);assert.equal(runtime.stats.roots,2);assert.equal(runtime.stats.brushInstances,4);
 runtime.sync(batches);assert.strictEqual(result.boundingSphere,bounds);assert.ok(result.boundingBox.equals(mesh.boundingBox));assert.strictEqual(result.geometry.attributes.position,template.attributes.position);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().makePerspective(-1,1,1,-1,1,100));assert.equal(frustum.intersectsObject(result),frustum.intersectsObject(mesh));
 let disposed=0;result.geometry.addEventListener('dispose',()=>{disposed++;assert.equal(result.geometry.attributes.position,undefined);assert.ok(result.geometry.attributes.aTreeRootWind);});runtime.sync(new Map());assert.equal(disposed,1);assert.equal(runtime.batches.size,0);
 mesh.boundingSphere=null;assert.throws(()=>runtime.sync(batches),/complete root crown bounds/);runtime.dispose();disposeTreeWindGeometry(windGeometry);source.dispose();material.dispose();
 for(const d of [8.9,9,12,14.99,15.01])assert.equal(treeLodMayContribute(12,{x:d,z:0},{x:0,z:0}),d<15.0001);
});
test('GPU worker errors, cancellation and pre-abort never silently expand on the main thread',async()=>{
 for(const failure of ['abort','messageerror','error','report','dispose']){
  const worker={terminated:0,postMessage(m){this.message=m;},terminate(){this.terminated++;}},signal=new AbortController(),builder=createGpuPacketBuilder({signal:signal.signal,workerFactory:()=>worker}),pending=builder.build([]);
  if(failure==='abort')signal.abort();else if(failure==='dispose')builder.dispose();else if(failure==='report')worker.onmessage({data:{id:worker.message.id,error:'invalid'}});else worker['on'+failure]({message:failure});
  await assert.rejects(pending);assert.equal(worker.terminated,1);builder.dispose();assert.equal(worker.terminated,1);
 }
 const signal=new AbortController();signal.abort();let made=0;const builder=createGpuPacketBuilder({signal:signal.signal,workerFactory:()=>{made++;}});await assert.rejects(builder.build([]),e=>e.name==='AbortError');assert.equal(made,0);builder.dispose();
});

test('near crown keeps UV coverage while giving remaining low sprays volume and opening the artificial core',async t=>{
 const source=await hi(),loaded=await loadGpuSpruceRecipe(source,'recipe',{fetchImpl:fakeFetch,workerFactory:null,crown:true,volume:false}),counts={};
 for(const [name,f] of Object.entries(recipe.forms)){
  const original=source.scene.getObjectByName(name+'_frond').geometry,flat=createNearShell(original,f,{shape:false}),curved=loaded.scene.getObjectByName(name+'_frond').geometry,core=loaded.scene.getObjectByName(name+'_core').geometry;
  const uvArea=g=>{const a=g.attributes.uv.array;let area=0;for(let i=0;i<a.length;i+=6)area+=Math.abs((a[i+2]-a[i])*(a[i+5]-a[i+1])-(a[i+4]-a[i])*(a[i+3]-a[i+1]))*.5;return area;};
  assert.ok(curved.userData.curvedSprays>100);assert.ok(curved.userData.maxShift>.01&&curved.userData.maxShift<.066);assert.ok(Math.abs(uvArea(curved)-uvArea(flat))<.00002);
  assert.equal(core.userData.innerShoots,60);assert.equal(core.attributes.position.count/3,600);assert.ok(core.userData.opaqueFillerRemoved);
  for(const attribute of Object.values(curved.attributes))assert.ok(attribute.array.every(Number.isFinite));
  counts[name]={...curved.userData,coreTriangles:600};flat.dispose();
 }
 assert.equal(loaded.userData.brushes,1143);t.diagnostic(JSON.stringify({counts,timings:loaded.userData.timings}));
});

test('precomputed shared needle payload removes vertex trig/normalization without changing geometry or phase',async t=>{
 const {precomputeBrushPacket,packedNeedleVertex}=await import('./spruce-brush-packet.js');let position=0,normal=0,bytes=0;
 for(const form of Object.values(recipe.forms)){
  const packet=buildBrushPacket(form.instances),packed=precomputeBrushPacket(packet);bytes+=packed.bytes;
  for(const brush of [0,Math.floor(packet.brushes/2),packet.brushes-1])for(let needle=0;needle<1440;needle++)for(let corner=0;corner<3;corner++){
   const a=packetNeedleVertex(packet,brush,needle,corner),b=packedNeedleVertex(packed,brush,needle,corner);position=Math.max(position,...a.position.map((v,k)=>Math.abs(v-b.position[k])));normal=Math.max(normal,...a.normal.map((v,k)=>Math.abs(v-b.normal[k])));assert.deepEqual(b.wind,a.wind);assert.equal(b.ao,a.ao);
  }
  const tables=createGpuBrushTables(packed),material=new THREE.MeshStandardMaterial();attachEcologyWind(material,{},12,false,true);installCrownOcclusion(material);installGpuBrush(material,tables,{packed:true});const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
  const body=shader.vertexShader.slice(shader.vertexShader.indexOf('void readBrush'),shader.vertexShader.indexOf('attribute float aCrownOcclusion'));
  assert.ok(!/sin\(|cos\(|normalize\(/.test(body));assert.match(body,/cross\(side.xyz,delta.xyz\)\*delta.w/);tables.dispose();material.dispose();
 }
 assert.ok(position<2e-9);assert.ok(normal<2e-7);assert.ok(bytes<71000000);t.diagnostic(JSON.stringify({bytes,maxPosition:position,maxNormalComponent:normal}));
});
