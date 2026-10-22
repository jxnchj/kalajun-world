import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import * as THREE from 'three';
import {generateBrush} from './spruce-brush.js';
import {SunShadowCasters} from './sun-shadow-casters.js';
import {packetNeedleVertex} from './spruce-brush-packet.js';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {deriveBranchDetail,installSpruceBranchPhotos,BRANCH_DETAIL} from './spruce-branch-detail.js';
import {createSpruceLoader} from './spruce-loading.js';import {buildBrushPacket} from './spruce-brush-packet.js';import {createNearShell} from './spruce-near-shell.js';import {createStationGeometry,installGpuNeedleStations,SpruceGpuStationBrushes,branchDrawRuns,coalesceBranchRuns,stationRunBounds} from './spruce-gpu-stations.js';import {createGpuBrushTables,createGpuBrushTemplate,installGpuBrush} from './spruce-gpu-brush.js';import {attachEcologyWind} from './ecology.js';import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
const recipe=JSON.parse(gunzipSync(await fs.readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url))));
const bytes=await fs.readFile(new URL('../../public/assets/v2/schrenk-spruce-hi.glb',import.meta.url)),loader=createSpruceLoader();loader.register(()=>({name:'NODE_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const hi=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const details=new Map();for(const [name,form]of Object.entries(recipe.forms))details.set(name,deriveBranchDetail(hi.scene.getObjectByName(name+'_frond').geometry,form));
test('v12 preserves every v11 needle recipe and replaces every lower remaining photo spray by its actual controls',t=>{
 const counts={};for(const [name,detail]of details){const original=recipe.forms[name];for(let i=0;i<original.instances.length;i++)assert.strictEqual(detail.instances[i],original.instances[i]);assert.ok(detail.extras.length>100);assert.equal(detail.extras.length,detail.byCluster.size*3);for(const r of detail.extras){assert.equal(r.segments,1);assert.equal(r.controls.length,2);}assert.equal(new Set(detail.instances.map(r=>r.id)).size,detail.instances.length);
 let next=0;for(const g of detail.groups){assert.equal(g.start,next);next+=g.count;if(g.extra){assert.ok(g.count<=36);assert.equal(g.count%3,0);assert.ok(g.bounds.min.every(Number.isFinite));assert.ok(g.bounds.max.every(Number.isFinite));}}assert.equal(next,detail.instances.length);
 const g=createNearShell(hi.scene.getObjectByName(name+'_frond').geometry,original,{branchDetail:detail});assert.ok(g.attributes.aSprayLod);assert.equal(g.attributes.aSprayLod.count,g.attributes.position.count);let marked=0;for(let i=0;i<g.attributes.aSprayLod.count;i++)marked+=g.attributes.aSprayLod.getW(i);assert.ok(marked>1000);g.dispose();
 counts[name]={retained:original.instances.length,new:detail.extras.length,spatialGroups:detail.groups.length};}t.diagnostic(JSON.stringify(counts));
});
function makeForm(detail){const packet=buildBrushPacket(detail.instances);packet.branchLod=detail.lod;packet.drawGroups=detail.groups;const tables=createGpuBrushTables(packet,true),stationGeometry=createStationGeometry(packet),material=new THREE.MeshStandardMaterial(),depth=new THREE.MeshDepthMaterial(),twigMaterial=material.clone(),twigDepth=depth.clone();return{packet,tables,stationGeometry,material,depth,twigMaterial,twigDepth};}
test('colour and depth use identical branch-space thresholds and complementary photo/needle coverage',()=>{
 const detail=details.get('pencil'),f=makeForm({...detail,instances:detail.instances.slice(0,1),lod:detail.lod.slice(0,4),groups:[{start:0,count:1,extra:false}]});
 for(const depth of [false,true])for(const kind of ['photo','needle','twig']){
  const m=depth?new THREE.MeshDepthMaterial():new THREE.MeshStandardMaterial();attachEcologyWind(m,{},12,false,true);
  if(kind==='photo'){installSpruceBranchPhotos(m);const before=m.onBeforeCompile;installSpruceBranchPhotos(m);assert.strictEqual(m.onBeforeCompile,before);}else if(kind==='needle')installGpuNeedleStations(m,{branches:true});else installGpuBrush(m,f.tables,{twigOnly:true});
  const shader={uniforms:{},vertexShader:THREE.ShaderLib[depth?'depth':'standard'].vertexShader,fragmentShader:THREE.ShaderLib[depth?'depth':'standard'].fragmentShader};m.onBeforeCompile(shader);
  assert.equal(shader.vertexShader.match(/uniform vec3 uWorldViewer;/g).length,1);assert.ok(shader.vertexShader.indexOf('uniform vec3 uWorldViewer;')<shader.vertexShader.indexOf('float spruceBranchFade'));
  if(kind==='needle'){assert.ok(!/attribute vec4 aNeedleVariation/.test(shader.vertexShader));assert.ok(!/aNeedleVariation[012]/.test(shader.vertexShader));assert.equal(4+1+2+4+3,14);}
  assert.match(shader.vertexShader,/smoothstep\(4\.5,7\.0,distance\(world.xyz,uWorldViewer\)\)/);assert.match(shader.fragmentShader,kind==='photo'?/branchDither < vSpruceBranchFade/:/branchDither >= vSpruceBranchFade/);assert.ok(shader.vertexShader.indexOf('vSpruceBranchFade=')<shader.vertexShader.indexOf('vec3 ecoWeights='));m.dispose();
 }f.tables.dispose();f.stationGeometry.dispose();
});
test('spatial instance views share original VBOs, keep root statistics and retire distant new branches',()=>{
 const detail=details.get('pencil'),f=makeForm(detail),runtime=new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(f.packet.topology),{joinGaps:0});f.material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(6,18,6),wg=createTreeWindGeometry(source,1),mesh=new THREE.InstancedMesh(wg,f.material,1);mesh.count=1;mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(100,2000,-40));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();const batches=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'root'}]}]]);
 runtime.sync(batches);assert.equal(runtime.stats.roots,1);assert.equal(runtime.stats.brushInstances,detail.instances.length);assert.equal(runtime.stats.detailBrushInstances,detail.extras.length);
 const sourceFrame=f.stationGeometry.attributes.aNeedleFrame0;for(let j=1;j<detail.groups.length;j++){
  const [needles,wood]=runtime.batches.get('b:root:branch:'+j).meshes,g=detail.groups[j],a=needles.geometry.attributes.aNeedleFrame0;assert.strictEqual(a.data,sourceFrame.data);assert.equal(a.offset,g.start*288*f.packet.frameStride);assert.equal(a.getX(0),sourceFrame.getX(g.start*288));const lod=needles.geometry.attributes.aSprayLod;assert.equal(lod.data.meshPerAttribute,288);assert.equal(lod.offset,g.start*4);assert.equal(lod.getX(0),f.packet.branchLod[g.start*4]);assert.equal(needles.count,g.count*288);assert.equal(wood.count,g.count);assert.equal(wood.geometry.attributes.aTreeRootBrushStart.getX(0),g.start);assert.ok(needles.boundingBox.min.y>1998);
 }
 runtime.sync(batches,new THREE.Vector3(500,2000,500));assert.equal(runtime.stats.roots,1);assert.equal(runtime.stats.detailBrushInstances,0);assert.equal(runtime.batches.size,1);assert.equal(runtime.stats.brushInstances,detail.originalBrushes);assert.equal(runtime.batches.get('b:root').meshes[0].count,detail.originalBrushes*288);
 runtime.sync(batches,new THREE.Vector3(101,2004,-40));assert.ok(runtime.stats.detailBrushInstances>0);assert.ok(runtime.stats.detailBrushInstances<=detail.extras.length);assert.equal(BRANCH_DETAIL.far,7);
 const viewer=new THREE.Vector3(101,2004,-40),transform=new THREE.Matrix4().fromArray(mesh.instanceMatrix.array),centre=new THREE.Vector3();
 for(const [id,item]of runtime.batches)if(id.includes(':branch:')){const m=item.meshes[0],a=m.geometry.attributes.aSprayLod;for(let i=0;i<m.count/288;i++)assert.ok(centre.set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(transform).distanceTo(viewer)<=7.0021);}
 // Reproduce the actual tracker, which deliberately exempts ONLY the two wind
 // attribute names. An immutable start sharing their buffer breaks cadence.
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),lights=Array.from({length:3},()=>{const l=new THREE.DirectionalLight();l.position.set(100,2020,-40);l.target.position.set(100,2000,-40);Object.assign(l.shadow.camera,{left:-100,right:100,top:100,bottom:-100,near:.1,far:100});l.shadow.camera.updateProjectionMatrix();scene.add(l,l.target);return l;});scene.add(runtime.group);
 const tracker=new SunShadowCasters(scene,lights);tracker.update(camera);assert.deepEqual([...tracker.update(camera).changed],[false,false,false]);assert.ok(tracker.result.counts.some(n=>n>0));
 for(let i=0;i<8;i++){wg.attributes.aTreeRootWind.data.array[0]=i*.01;wg.attributes.aTreeRootWind.data.needsUpdate=true;runtime.sync(batches,viewer);assert.deepEqual([...tracker.update(camera).changed],[false,false,false]);}
 const twig=[...runtime.batches.values()][0].meshes[1],start=twig.geometry.attributes.aTreeRootBrushStart;assert.ok(!start.isInterleavedBufferAttribute);start.needsUpdate=true;assert.ok(tracker.update(camera).changed.some(Boolean));tracker.dispose();
 runtime.dispose();disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
});

test('shared variations and orthonormal frame packing retain original and new short-spray geometry',t=>{
 const detail=details.get('pencil'),records=[...detail.instances.slice(0,2),...detail.extras.slice(0,6)],packet=buildBrushPacket(records);assert.equal(packet.frameStride,13);assert.equal(packet.variations.length,2*1440*2);assert.equal(packet.sharedVariations.length,16*1440*2);let maxPosition=0,maxAngle=0,count=0;
 for(let b=0;b<records.length;b++){const emitted=[];generateBrush(records[b],(p,n,uv,w,ao)=>emitted.push({p,n,uv,w,ao}));let needle=0;
  for(let i=0;i<emitted.length;i+=3){if(emitted[i].uv[0]>558/2048&&emitted[i].uv[0]<559/2048)continue;
   for(let c=0;c<3;c++){const e=emitted[i+c],a=packetNeedleVertex(packet,b,needle,c);count++;maxPosition=Math.max(maxPosition,...a.position.map((v,k)=>Math.abs(v-e.p[k])));maxAngle=Math.max(maxAngle,Math.acos(Math.min(1,a.normal.reduce((n,v,k)=>n+v*e.n[k],0)/Math.hypot(...e.n)))*180/Math.PI);assert.deepEqual(a.wind,e.w);assert.ok(Math.abs(a.ao-e.ao)<6e-8);}needle++;
  }assert.equal(needle,1440);
 }assert.ok(maxPosition<.000002);assert.ok(maxAngle<.1);t.diagnostic(JSON.stringify({count,maxPosition,maxAngle}));
});

test('v12 rendered old/new VBO owners and private constant attributes are all released',()=>{
 const detail=details.get('pencil'),f=makeForm(detail),runtime=new SpruceGpuStationBrushes(Array(5).fill(f),createGpuBrushTemplate(f.packet.topology));f.material.userData.gpuBrushSource=true;
 const source=new THREE.BoxGeometry(6,18,6),wg=createTreeWindGeometry(source,1),mesh=new THREE.InstancedMesh(wg,f.material,1);mesh.count=1;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.computeBoundingBox();mesh.computeBoundingSphere();runtime.sync(new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'r'}]}]]));
 const buffers=new Set(),key=a=>a.isInterleavedBufferAttribute?a.data:a,info={memory:{geometries:0}},geometries=WebGLGeometries({ARRAY_BUFFER:34962},{update(a){buffers.add(key(a));},remove(a){buffers.delete(key(a));}},info,{releaseStatesOfGeometry(){}});
 for(const item of runtime.batches.values())for(const m of item.meshes){geometries.get(m,m.geometry);geometries.update(m.geometry);m.onBeforeShadow();}
 assert.ok(buffers.has(f.stationGeometry.attributes.aNeedleFrame0.data));runtime.sync(new Map());runtime.dispose();assert.equal(buffers.size,0);assert.equal(info.memory.geometries,0);disposeTreeWindGeometry(wg);source.dispose();f.material.dispose();f.twigMaterial.dispose();
});

test('lazy v12 initial load retains all originals, then shares one completed group only after colour and shadow preparation',async t=>{
 const {loadGpuSpruceRecipe}=await import('./spruce-gpu-loading.js');const body=await fs.readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url));
 const loaded=await loadGpuSpruceRecipe(hi,'recipe',{fetchImpl:async()=>({ok:true,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)}),workerFactory:null,branches:true});
 assert.equal(loaded.userData.brushes,1143);assert.equal(loaded.userData.potentialShortSprays,8457);assert.equal(loaded.userData.branchDetail,'lazy-spatial-brushes-v12');assert.ok(loaded.userData.parameterBytes<40000000);
 const forms=loaded.gpuPackets.map(packet=>{const tables=createGpuBrushTables(packet,true),stationGeometry=createStationGeometry(packet),material=new THREE.MeshStandardMaterial(),depth=new THREE.MeshDepthMaterial();material.userData.gpuBrushSource=true;return{tables,stationGeometry,material,depth,twigMaterial:material.clone(),twigDepth:depth.clone()};});
 const f=forms[3],descriptors=f.stationGeometry.userData.drawGroups,chosen=descriptors[1];f.stationGeometry.userData.drawGroups=[descriptors[0],chosen];
 const runtime=new SpruceGpuStationBrushes(forms,createGpuBrushTemplate(loaded.gpuPackets[0].topology)),viewer=chosen.boundsBox.getCenter(new THREE.Vector3()),source=new THREE.BoxGeometry(6,18,6),wg=createTreeWindGeometry(source,2),mesh=new THREE.InstancedMesh(wg,f.material,2);mesh.count=2;mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setMatrixAt(1,new THREE.Matrix4());mesh.computeBoundingBox();mesh.computeBoundingSphere();const roots=new Map([['b',{mode:12,variant:3,mesh,activeRecords:[{id:'a'},{id:'b'}]}]]);
 runtime.sync(roots,viewer);assert.equal(runtime.stats.detailBrushInstances,0);assert.equal(runtime.branchField.texture.image.data[chosen.readyIndex*4],0);
 while(runtime.branchCache.stats.pending)await new Promise(r=>setTimeout(r,5));runtime.sync(roots,viewer);assert.equal(runtime.stats.detailBrushInstances,chosen.count*2);assert.equal(runtime.stats.roots,2);assert.equal(runtime.branchCache.stats.builtGroups,1);assert.equal(runtime.branchField.texture.image.data[chosen.readyIndex*4],0);
 const a=runtime.batches.get('b:a:branch:1').meshes,b=runtime.batches.get('b:b:branch:1').meshes;assert.strictEqual(a[0].geometry.attributes.aNeedleFrame0.data,b[0].geometry.attributes.aNeedleFrame0.data);
 // Before the existing colour+shadow preparation finishes, retain the OLD
 // sphere even when the new run box would cull. This preserves shadow/photo
 // replacement timing for needles outside the main view but casting into it.
 const prepared=runtime.branchCache.entries.values().next().value.value;
 assert.notEqual(prepared.flags,15);const sphereOnly={intersectsObject:()=>true,intersectsBox:()=>false};
 for(const m of a)assert.equal(m.intersectsFrustum(sphereOnly),true);
 for(const m of a){m.onBeforeRender(null,null,{position:viewer});m.onBeforeShadow();}runtime.sync(roots,viewer);
 assert.equal(prepared.flags,15);for(const m of a)assert.equal(m.intersectsFrustum(sphereOnly),false);
await new Promise(r=>setTimeout(r,5));runtime.sync(roots,viewer);assert.ok(runtime.branchField.texture.image.data[chosen.readyIndex*4]>0);assert.ok(runtime.branchCache.stats.firstDrawPreparationMs>=0);assert.equal(runtime.branchCache.stats.maxVisibleWaitMs,undefined);
 t.diagnostic(JSON.stringify({startup:loaded.userData.timings,initialParameterBytes:loaded.userData.parameterBytes,baseGpuBytes:runtime.stats.tableBytes,firstGroup:runtime.stats.branchCache}));runtime.dispose();disposeTreeWindGeometry(wg);source.dispose();for(const f of forms){f.material.dispose();f.twigMaterial.dispose();}
});


test('exact branch runs omit only shader-zero centres, including world scale and boundary guard',()=>{
 const lod=new Float32Array([1,0,0,1,1,0,0,1,1,0,0,1,10,0,0,1,10,0,0,1,10,0,0,1,6,0,0,1,6,0,0,1,6,0,0,1]);
 const group={extra:true,count:9,lod},matrix=new THREE.Matrix4();assert.deepEqual(branchDrawRuns(group,matrix,new THREE.Vector3()).runs,[{start:0,count:3},{start:6,count:3}]);
 matrix.compose(new THREE.Vector3(-3600,2331,4808),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7),new THREE.Vector3(1.2,1.1,1.2));
 const viewer=new THREE.Vector3(-3600,2331,4808),result=branchDrawRuns(group,matrix,viewer),included=new Set(result.runs.flatMap(r=>Array.from({length:r.count},(_,i)=>r.start+i)));
 for(let i=0;i<group.count;i++){const d=new THREE.Vector3(...lod.subarray(i*4,i*4+3)).applyMatrix4(matrix).distanceTo(viewer);if(d<7)assert.ok(included.has(i));if(d>7.002)assert.ok(!included.has(i));}
 assert.deepEqual(branchDrawRuns({...group,lod:new Float32Array([7.001,0,0,1]),count:1},new THREE.Matrix4(),new THREE.Vector3()).runs,[{start:0,count:1}]);
});


test('bounded run coalescing preserves all contributing instances and caps each zero-fade gap',()=>{
 const exact=[{start:0,count:3},{start:6,count:3},{start:15,count:3},{start:27,count:6}],merged=coalesceBranchRuns(exact,6);
 assert.deepEqual(merged,[{start:0,count:18},{start:27,count:6}]);assert.deepEqual(coalesceBranchRuns(exact,0),exact);
 assert.deepEqual(exact,[{start:0,count:3},{start:6,count:3},{start:15,count:3},{start:27,count:6}]);
 for(const run of exact)for(let i=run.start;i<run.start+run.count;i++)assert.ok(merged.some(r=>i>=r.start&&i<r.start+r.count));
});


test('shared-variation branch run bounds contain all real vertices and only the selected contiguous range',()=>{
 const detail=details.get('pencil'),records=[...detail.instances.slice(0,2),...detail.extras.slice(0,6)],p=buildBrushPacket(records),g=createStationGeometry(p);
 assert.equal(p.frameStride,13);assert.equal(g.userData.brushBounds.length,records.length*6);
 for(let brush=0;brush<records.length;brush++){
  const bound=stationRunBounds(g,brush,1);
  for(let needle=0;needle<1440;needle++)for(let corner=0;corner<3;corner++)assert.ok(bound.containsPoint(new THREE.Vector3(...packetNeedleVertex(p,brush,needle,corner).position)));
  for(let vertex=0;vertex<117;vertex++){const o=(brush*117+vertex)*12;assert.ok(bound.containsPoint(new THREE.Vector3(...p.wood.subarray(o,o+3))));}
 }
 const merged=stationRunBounds(g,2,4),expected=new THREE.Box3();for(let i=2;i<6;i++)expected.union(stationRunBounds(g,i,1));assert.ok(merged.equals(expected));g.dispose();
});
