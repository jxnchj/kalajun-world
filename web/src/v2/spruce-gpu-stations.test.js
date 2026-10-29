import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import * as THREE from 'three';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {buildBrushPacket,packetNeedleVertex} from './spruce-brush-packet.js';import {createGpuBrushTables,createGpuBrushTemplate,installGpuBrush} from './spruce-gpu-brush.js';import {createStationGeometry,installGpuNeedleStations,SpruceGpuStationBrushes,STATION_GLSL,stationBrushBounds,stationRunBounds} from './spruce-gpu-stations.js';import {attachEcologyWind} from './ecology.js';import {installCrownOcclusion} from './spruce-geometry.js';import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
const recipe=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url)))),packet=buildBrushPacket(recipe.forms.pencil.instances.slice(0,2));
function form(){const tables=createGpuBrushTables(packet,true),stationGeometry=createStationGeometry(packet);return{tables,stationGeometry,material:new THREE.MeshStandardMaterial(),depth:new THREE.MeshDepthMaterial(),twigMaterial:new THREE.MeshStandardMaterial(),twigDepth:new THREE.MeshDepthMaterial()};}
test('five-needle station preserves every per-station angle/length/colour with no main-needle texture fetch',()=>{
 const g=createStationGeometry(packet);assert.equal(g.attributes.position.count,15);assert.equal(g.userData.stationCount,576);assert.strictEqual(g.attributes.aNeedleFrame0.data.array,packet.frames);
 const v=g.attributes.aNeedleVariation0.data.array;for(let i=0;i<576;i++)for(let k=0;k<10;k++)assert.equal(v[i*12+k],packet.variations[i*10+k]);
 assert.ok(!/texelFetch|texture2D|sampler2D/.test(STATION_GLSL));
 for(const depth of [false,true]){
  const m=depth?new THREE.MeshDepthMaterial():new THREE.MeshStandardMaterial();attachEcologyWind(m,{},12,false,true);if(!depth)installCrownOcclusion(m);installGpuNeedleStations(m);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib[depth?'depth':'standard'].vertexShader,fragmentShader:THREE.ShaderLib[depth?'depth':'standard'].fragmentShader};m.onBeforeCompile(shader);
  assert.ok(!shader.vertexShader.includes('attribute vec3 aPlantWind;'));assert.ok(!shader.vertexShader.includes('attribute float aCrownOcclusion;'));
  assert.match(shader.vertexShader,/vec2 uv;readNeedleStation/);assert.match(shader.vertexShader,/ecoWeights=brushWind/);assert.match(shader.vertexShader,/vec3 transformed=brushPosition/);
  // Count all declarations conservatively, INCLUDING inactive Three defaults.
  // These are 7 station vec4s, root vec4+float, mat4 (4), position/normal/uv (3).
  assert.equal(7+2+4+3,16);m.dispose();
 }g.dispose();
});
test('station/tree nesting keeps shared immutable VBOs, stable root identity, copied wind and conservative bounds',()=>{
 const f=form(),forms=Array(5).fill(f),runtime=new SpruceGpuStationBrushes(forms,createGpuBrushTemplate(packet.topology));f.material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(8,20,8),wg=createTreeWindGeometry(source,4),mesh=new THREE.InstancedMesh(wg,f.material,4);mesh.count=2;mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-10,2000,10));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(20,2000,-5));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();wg.attributes.aTreeRootWind.data.array.set([.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);wg.attributes.aTreeRootWind.data.needsUpdate=true;
 const batches=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'left'},{id:'right'}]}]]);runtime.sync(batches);const left=runtime.batches.get('b:left').meshes,right=runtime.batches.get('b:right').meshes;
 assert.equal(runtime.stats.roots,2);assert.equal(runtime.stats.brushInstances,4);assert.equal(runtime.stats.triangles,6384);assert.equal(runtime.stats.batches,4);
 assert.strictEqual(left[0].geometry.attributes.aNeedleFrame0,right[0].geometry.attributes.aNeedleFrame0);assert.equal(left[0].count,576);assert.equal(left[0].instanceMatrix.meshPerAttribute,576);assert.equal(left[0].instanceMatrix.count,1);assert.equal(left[1].count,2);assert.equal(left[1].geometry.drawRange.start,4320);
 assert.deepEqual(Array.from(left[0].geometry.attributes.aTreeRootWind.data.array),Array.from(wg.attributes.aTreeRootWind.data.array.slice(0,5)));assert.ok(left[0].boundingSphere.radius<mesh.boundingSphere.radius/2);assert.ok(!left[0].boundingBox.intersectsBox(right[0].boundingBox));
 // Swap-compaction moves the root matrix AND its wind without changing root ID.
 mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(20,2000,-5));mesh.instanceMatrix.needsUpdate=true;mesh.count=1;batches.get('b').activeRecords=[{id:'right'}];wg.attributes.aTreeRootWind.data.array.copyWithin(0,5,10);wg.attributes.aTreeRootWind.data.needsUpdate=true;runtime.sync(batches);
 assert.strictEqual(runtime.batches.get('b:right').meshes[0],right[0]);assert.equal(right[0].instanceMatrix.array[12],20);assert.ok(Math.abs(right[0].geometry.attributes.aTreeRootWind.data.array[0]-.6)<1e-6);assert.equal(runtime.batches.size,1);
 runtime.dispose();disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
});
test('actual Three WebGLGeometries listener releases shared station VBOs after rendered owner retires',()=>{
 const f=form(),runtime=new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(packet.topology));f.material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(),wg=createTreeWindGeometry(source,2),mesh=new THREE.InstancedMesh(wg,f.material,2);mesh.count=2;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setMatrixAt(1,new THREE.Matrix4());mesh.computeBoundingBox();mesh.computeBoundingSphere();
 const batches=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'rendered'},{id:'not-yet-drawn'}]}]]);runtime.sync(batches);
 const buffers=new Set(),info={memory:{geometries:0}},attributeKey=a=>a.isInterleavedBufferAttribute?a.data:a,geometries=WebGLGeometries({ARRAY_BUFFER:34962},{update(a){buffers.add(attributeKey(a));},remove(a){buffers.delete(attributeKey(a));}},info,{releaseStatesOfGeometry(){}});
 const rendered=runtime.batches.get('b:rendered').meshes;
 for(const m of rendered){geometries.get(m,m.geometry);geometries.update(m.geometry);m.onBeforeShadow();}
 const immutable=f.stationGeometry.attributes.aNeedleFrame0.data;assert.ok(buffers.has(immutable));
 // Retire the rendered owner while an unrendered sibling still exists.
 mesh.count=1;batches.get('b').activeRecords=[{id:'not-yet-drawn'}];runtime.sync(batches);assert.ok(buffers.has(immutable));assert.equal(info.memory.geometries,2);
 // Source geometry was never registered; its dispose cannot perform cleanup.
 runtime.dispose();assert.equal(buffers.size,0);assert.equal(info.memory.geometries,0);
 disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
});

test('shared needle root wind follows the actual CSM cadence; root/membership edits still invalidate',async()=>{
 const {SunShadowCasters}=await import('./sun-shadow-casters.js');const {SpruceGpuBrushes}=await import('./spruce-gpu-brush.js');
 for(const mode of ['stations','brush']){
  const f=form();if(mode==='brush'){f.tables.dispose();f.tables=createGpuBrushTables(packet);}
  const runtime=mode==='stations'?new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(packet.topology)):new SpruceGpuBrushes(Array(5).fill(f),createGpuBrushTemplate(packet.topology));f.material.userData.gpuBrushSource=true;
  const source=new THREE.BoxGeometry(8,20,8),wg=createTreeWindGeometry(source,2),mesh=new THREE.InstancedMesh(wg,f.material,2);mesh.count=1;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
  const batches=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'root'}]}]]);runtime.sync(batches);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),lights=[30,60,120].map(span=>{const light=new THREE.DirectionalLight();light.position.set(0,20,0);Object.assign(light.shadow.camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2,near:1,far:60});light.shadow.camera.updateProjectionMatrix();scene.add(light,light.target);return light;});scene.add(runtime.group);const tracker=new SunShadowCasters(scene,lights),update=()=>[...tracker.update(camera).changed];
  assert.deepEqual(update(),[true,true,true]);assert.deepEqual(update(),[false,false,false]);assert.ok(tracker.result.counts.every(n=>n>0));
  for(let i=0;i<8;i++){wg.attributes.aTreeRootWind.data.array[0]+=.001;wg.attributes.aTreeRootWind.data.needsUpdate=true;runtime.sync(batches);assert.deepEqual(update(),[false,false,false],mode+' wind must not redraw all CSM cascades every frame');}
  mesh.instanceMatrix.needsUpdate=true;runtime.sync(batches);assert.deepEqual(update(),[true,true,true]);assert.deepEqual(update(),[false,false,false]);runtime.sync(new Map());assert.deepEqual(update(),[true,true,true]);
  tracker.dispose();runtime.dispose();disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
 }
});

// Independent mirror of only the existing tree displacement, with extreme
// possible texture channels and phases. Neither main nor depth changes it.
function bend(p,w,r,g,eddy,sine,angle){
 const current=r+(g-r)*w[0]*.48,h=Math.min(Math.max(p[1],0),20),along=(current+(current-g)*.32)*h*h*.0014+w[1]*(sine*.018+(g-current)*.12),across=eddy*w[1]*.018;
 return new THREE.Vector3(p[0]+Math.cos(angle)*along-Math.sin(angle)*across,p[1],p[2]+Math.sin(angle)*along+Math.cos(angle)*across);
}
function frustum(camera){camera.updateMatrixWorld(true);return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);}
test('packet bounds retain every actual needle/twig vertex, wind extremes and Float32 scaled roots',t=>{
 let vertices=0,windCases=0,totalMs=0;const variants=Object.values(recipe.forms);
 for(const [formIndex,source]of variants.entries()){
  const records=[source.instances[0],source.instances.at(-1)],p=buildBrushPacket(records),before=p.frames.slice(),started=performance.now(),bounds=stationBrushBounds(p);totalMs+=performance.now()-started;
  assert.deepEqual(p.frames,before);assert.equal(bounds.byteLength,records.length*48);
  const geometry=new THREE.BufferGeometry();geometry.userData.brushBounds=bounds;
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(-3610.73,2331.812,4806.407),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),formIndex*.73),new THREE.Vector3(formIndex===1?-1.48:1.48,.91,1.27));matrix.fromArray(new Float32Array(matrix.elements));
  for(let brush=0;brush<records.length;brush++){
   const local=stationRunBounds(geometry,brush,1),world=local.clone().applyMatrix4(matrix).expandByScalar(.003);
   const check=(position,weights,probe)=>{
    assert.ok(local.containsPoint(new THREE.Vector3(...position)));vertices++;
    if(!probe)return;
    for(const r of [0,1])for(const g of [0,1])for(const eddy of [-.5,.5])for(const sine of [-1,1]){
     const point=bend(position,weights,r,g,eddy,sine,formIndex*.91);assert.ok(local.containsPoint(point));
     point.applyMatrix4(matrix);point.set(Math.fround(point.x),Math.fround(point.y),Math.fround(point.z));assert.ok(world.containsPoint(point));windCases++;
    }
   };
   for(let needle=0;needle<1440;needle++)for(let corner=0;corner<3;corner++){const v=packetNeedleVertex(p,brush,needle,corner);check(v.position,v.wind,needle%47===0);}
   for(let vertex=0;vertex<117;vertex++){const o=(brush*117+vertex)*12;check(Array.from(p.wood.subarray(o,o+3)),Array.from(p.wood.subarray(o+7,o+10)),true);}
  }
  assert.throws(()=>stationRunBounds(geometry,2,1),RangeError);geometry.dispose();
 }
 t.diagnostic(JSON.stringify({actualVerticesChecked:vertices,extremeWindChecks:windCases,sampleBoundsBuildMs:totalMs}));
});

test('actual Three main, mirrored and CSM frustums use independent run bounds without changing any draw content',()=>{
 const f=form(),runtime=new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(packet.topology));f.material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(8,20,8),wg=createTreeWindGeometry(source,2),mesh=new THREE.InstancedMesh(wg,f.material,2);mesh.count=2;
 mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-20,2000,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(20,2000,0));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
 const roots=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'left'},{id:'right'}]}]]);runtime.sync(roots);runtime.group.position.set(3,-100,7);runtime.group.updateMatrixWorld(true);
 const left=runtime.batches.get('b:left').meshes,right=runtime.batches.get('b:right').meshes,centre=left[0].boundingBox.getCenter(new THREE.Vector3()).add(runtime.group.position);
 const camera=new THREE.PerspectiveCamera(22,1,.1,100);camera.position.copy(centre).add(new THREE.Vector3(0,0,18));camera.lookAt(centre);
 const reflection=camera.clone();reflection.position.y=2*(centre.y-2)-camera.position.y;reflection.lookAt(centre);
 const cameras=[camera,reflection,...[5,7,10].map(size=>{const c=new THREE.OrthographicCamera(-size,size,size,-size,.1,80);c.position.copy(centre).add(new THREE.Vector3(2,24,5));c.lookAt(centre);return c;})];
 const count=runtime.stats.triangles,identities=runtime.group.children.map(m=>[m,m.geometry,m.geometry.attributes.aNeedleFrame0,m.instanceMatrix,m.count]);
 for(const c of cameras)for(const reverse of [false,true]){
  c._reversedDepth=reverse;c.updateProjectionMatrix();const view=frustum(c);
  runtime.spatialBounds=false;runtime.sync(roots);assert.ok(left.every(m=>m.intersectsFrustum(view)));assert.ok(right.every(m=>m.intersectsFrustum(view)),'old multi-root sphere submits the invisible right root');
  runtime.spatialBounds=true;runtime.sync(roots);assert.ok(left.every(m=>m.intersectsFrustum(view)));assert.ok(right.every(m=>!m.intersectsFrustum(view)));
 }
 assert.equal(runtime.stats.triangles,count);for(const [i,m]of runtime.group.children.entries())assert.deepEqual([m,m.geometry,m.geometry.attributes.aNeedleFrame0,m.instanceMatrix,m.count],identities[i]);
 // Wind-only updates neither rebuild the bounds nor rewrite the root matrix.
 const item=runtime.batches.get('b:left'),bounds=item.worldBounds.clone(),version=left[0].instanceMatrix.version;
 wg.attributes.aTreeRootWind.data.array[0]=.8;wg.attributes.aTreeRootWind.data.needsUpdate=true;runtime.sync(roots);assert.ok(item.worldBounds.equals(bounds));assert.equal(left[0].instanceMatrix.version,version);
 left[0].count=0;assert.equal(left[0].intersectsFrustum(frustum(camera)),false);left[0].count=576;
 runtime.dispose();disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
});


test('adopted needle dispatcher defaults immediate; explicit URL zero and constructor override retain old path',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{for(const [search,options,expected]of[['',{},'immediate'],['?needleBranchDispatch40=1',{},'immediate'],['?needleBranchDispatch40=0',{},'microtask'],['',{branchImmediateDispatch:false},'microtask'],['?needleBranchDispatch40=0',{branchImmediateDispatch:true},'immediate']]){
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search}});
  const f=form();f.stationGeometry.userData.drawGroups=[{lazy:true,extra:true,start:0,count:2}];
  const runtime=new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(packet.topology),options);
  try{assert.equal(runtime.branchCache.stats.dispatchMode,expected);assert.equal(runtime.branchCache.concurrency,2);assert.equal(runtime.branchCache.maxInFlightBytes,8*1024*1024);assert.strictEqual(f.stationGeometry.attributes.aNeedleFrame0.data.array,packet.frames);}
  finally{runtime.dispose();for(const key of ['material','depth','twigMaterial','twigDepth'])f[key].dispose();}
 }}finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
});
