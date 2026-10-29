import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WebGLObjects} from 'three/src/renderers/webgl/WebGLObjects.js';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {TreeWindAtlas44} from './tree-wind-atlas44.js';
import {SpruceRootWind,disposeTreeWindGeometry} from './spruce-wind.js';
import {MeadowWindField} from './wind-field.js';
import {installTreeViewBatch} from './tree-view-batches.js';
import {attachEcologyWind,WorldEcology} from './ecology.js';
import {installTreeFrustumMaterial} from './tree-frustum-cull.js';
import {useProjectedShadowDepth} from './room-shadow.js';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';

const bits=a=>Array.from(new Uint32Array(a.buffer,a.byteOffset,a.length));
const roots=()=>Array.from({length:6},(_,i)=>({id:'spruce:'+i+':0',x:-60+i*30,y:0,z:-30,rot:i*.2,s:1,variant:0}));
function clip(x=0){const camera=new T.PerspectiveCamera(55,1,.1,140);camera.position.set(x,6,0);camera.lookAt(x,6,-30);camera.updateMatrixWorld();return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));}
function fixture({parts=1,capacity=8}={}){
 const owner=new SpruceRootWind({atlas44:true,atlasOptions:{capacity,width:4}}),field=new MeadowWindField(),base=new T.BoxGeometry(4,12,4),batches=new Map(),views=[];let frame=10,revision=1;
 base.translate(0,6,0);base.setAttribute('aPlantWind',new T.BufferAttribute(new Float32Array(base.attributes.position.count*3).fill(.3),3));field.update(1,{x:0,z:0});
 const records=roots(),uniforms={uWindTime:{value:1},uWorldViewer:{value:new T.Vector3()}};
 const material=attachEcologyWind(new T.MeshStandardMaterial({alphaTest:.4}),uniforms,5,false,true),depth=attachEcologyWind(new T.MeshDepthMaterial({alphaTest:.4}),uniforms,5,false,true);
 material.defines={ECO_ROOT_WIND:''};depth.defines={ECO_ROOT_WIND:''};const control={value:1};installTreeFrustumMaterial(material,control);installTreeFrustumMaterial(depth,control);
 for(let part=0;part<parts;part++){
  const geometry=owner.createGeometry(base,8,'5:0:0'),mesh=new T.InstancedMesh(geometry,material,8);mesh.count=0;mesh.customDepthMaterial=depth;mesh.castShadow=true;
  geometry.setAttribute('aTreeFrustumSphere',new T.InstancedBufferAttribute(new Float32Array([0,6,0,10]),4,false,8));
  const binding=owner.atlas44.bind(mesh),view=installTreeViewBatch(mesh,{atlasBinding:binding,getFrame:()=>frame});views.push(view);batches.set(part,{mesh,activeRecords:records.slice(),binding});
 }
 function matrices(){for(const {mesh,activeRecords}of batches.values()){mesh.count=activeRecords.length;for(let i=0;i<mesh.count;i++){const r=activeRecords[i];mesh.setMatrixAt(i,new T.Matrix4().makeTranslation(r.x,r.y,r.z));}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.boundingBox.expandByScalar(2);mesh.computeBoundingSphere();}}
 function update(time=1,layout=false){if(layout){revision++;matrices();}uniforms.uWindTime.value=time;return owner.update(batches,field,time,revision);}
 matrices();update();
 return {owner,atlas:owner.atlas44,field,base,batches,views,material,depth,records,update,frame(value){frame=value;},cleanup(){for(const view of views)view.dispose();for(const b of batches.values()){disposeTreeWindGeometry(b.mesh.geometry);b.mesh.dispose();}owner.dispose();field.dispose();base.dispose();material.dispose();depth.dispose();}};
}

test('atlas is absent by default and only the exact render flag preserves terrain Worker',()=>{
 const owner=new SpruceRootWind();assert.equal(owner.atlas44,null);owner.dispose();
 for(const value of ['0','1']){assert.equal(terrainRowWorkerPolicy('?treeWindAtlas44='+value).enabled,true);assert.equal(terrainRowWorkerPolicy('?treeWindAtlas44='+value+'&unknownSurface=1').enabled,false);}
 const world={entities:[],objects:{},landcoverAt:()=>({r:1,g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}};
 const native=new WorldEcology(world),candidate=new WorldEcology(world,{treeWindAtlas44:true});
 assert.equal(native.stats.treeWindAtlas44.enabled,false);assert.equal(native.treeViewCull.value,0);assert.equal(candidate.treeViewCull.value,1);assert.equal(candidate.treeRootWind.atlas44.capacity,2048);assert.equal(candidate.treeRootWind.atlas44.data.byteLength,65536);native.dispose();candidate.dispose();
});

test('all parts use stable root IDs and exact original five Float32 bits, with independent upload accounting',()=>{
 const f=fixture({parts:3});try{
  const {atlas,owner}=f;assert.equal(atlas.slots.size,6);assert.equal(atlas.bindings.size,3);assert.equal(owner.stats.bytes,120);assert.equal(owner.stats.batches,1);
  for(const b of f.batches.values())for(let i=0;i<b.mesh.count;i++){const slot=b.binding.slots[i],force=b.mesh.geometry.attributes.aTreeRootWind.data.array.subarray(i*5,i*5+5);assert.equal(slot,atlas.slots.get(b.activeRecords[i].id));assert.deepEqual(bits(atlas.data.subarray(slot*8,slot*8+5)),bits(force));}
  assert.equal(atlas.stats.gpuUploads,0);assert.equal(atlas.stats.requestedUploadBytes,atlas.data.byteLength);atlas.texture.onUpdate();assert.equal(atlas.stats.gpuUploads,1);assert.equal(atlas.stats.gpuUploadBytes,atlas.data.byteLength);
  const slots=[...atlas.slots],version=atlas.texture.version;assert.equal(f.update(),false);assert.equal(atlas.texture.version,version);
  f.update(1.25);assert.deepEqual([...atlas.slots],slots);assert.equal(atlas.texture.version,version+1);
  for(const [id,slot]of atlas.slots)assert.deepEqual(bits(atlas.data.subarray(slot*8,slot*8+5)),bits(owner.cache.get(id)));
 }finally{f.cleanup();}
});

test('Float32 packing retains negative zero and neighbouring values without RGB conversion or filtering',()=>{
 const atlas=new TreeWindAtlas44({capacity:1,width:2}),force=new Float32Array([-0,1+2**-23,2**-126,-(2**-126),.123456789]);
 atlas.syncLayout(new Map(),[{records:[{id:'spruce:0:0'}]}]);atlas.publish(new Map([['spruce:0:0',force]]));assert.deepEqual(bits(atlas.data.subarray(0,5)),bits(force));assert.equal(atlas.texture.type,T.FloatType);assert.equal(atlas.texture.format,T.RGBAFormat);assert.equal(atlas.texture.colorSpace,T.NoColorSpace);assert.equal(atlas.texture.minFilter,T.NearestFilter);assert.equal(atlas.texture.generateMipmaps,false);atlas.dispose();
});

test('wind-only frames keep the same view geometry, matrices and slots through Three object uploads without force buffers',()=>{
 const f=fixture(),view=f.views[0],frustum=clip(),uploaded=[],info={render:{frame:10},memory:{geometries:0}},attributes={update:a=>uploaded.push(a),remove:()=>{}},geometries=WebGLGeometries({ARRAY_BUFFER:1},attributes,info,{releaseStatesOfGeometry:()=>{}}),objects=WebGLObjects({ARRAY_BUFFER:1},geometries,attributes,{releaseStatesOfObject:()=>{}},info);
 try{
  view.proxy.intersectsFrustum(frustum);const g=objects.update(view.proxy),matrix=g.attributes.instanceMatrix.array.slice(),slots=g.attributes.aTreeRootSlot44.array.slice(),slotCopies=view.stats.slotCopies,matrixCopies=view.stats.matrixCopies;
  assert.equal(g.attributes.aTreeRootWind,undefined);assert.equal(g.attributes.aTreeRootEddy,undefined);assert.strictEqual(g.attributes.position,f.base.attributes.position);
  for(let i=0;i<20;i++){f.frame(11+i);info.render.frame=11+i;f.update(1.1+i*.016);view.proxy.intersectsFrustum(frustum);assert.strictEqual(objects.update(view.proxy),g);assert.deepEqual(g.attributes.instanceMatrix.array,matrix);assert.deepEqual(g.attributes.aTreeRootSlot44.array,slots);}
  assert.equal(view.stats.slotCopies,slotCopies);assert.equal(view.stats.matrixCopies,matrixCopies);assert.equal(view.stats.forceCopies,0);assert.equal(view.stats.fullForceCopies,0);assert.equal(view.stats.viewAllocations,1);
  assert.ok(!uploaded.some(a=>a===view.source.geometry.attributes.aTreeRootWind));
 }finally{f.cleanup();objects.dispose();}
});

test('main, shadow and mirror retain exact root selections and captured independent prefixes',()=>{
 const f=fixture(),view=f.views[0];try{
  view.proxy.intersectsFrustum(clip());const main=view.proxy.geometry,matrices=main.attributes.instanceMatrix.array.slice(),slots=main.attributes.aTreeRootSlot44.array.slice();
  for(const frustum of [clip(60),clip(-60)]){view.proxy.intersectsFrustum(frustum);const g=view.proxy.geometry;assert.notStrictEqual(g,main);assert.deepEqual(main.attributes.instanceMatrix.array,matrices);assert.deepEqual(main.attributes.aTreeRootSlot44.array,slots);for(let j=0;j<g.instanceCount;j++){const x=g.attributes.instanceMatrix.getComponent(j,12),root=f.records.find(r=>r.x===x);assert.equal(g.attributes.aTreeRootSlot44.getX(j),f.atlas.slots.get(root.id));}view.proxy.onBeforeShadow({info:{render:{frame:10}}},view.proxy,null,null,g,view.proxy.customDepthMaterial,null);}
  view.proxy.onBeforeRender({info:{render:{frame:10}}},null,null,main,view.proxy.material,null);assert.equal(view.stats.forceCopies,0);
 }finally{f.cleanup();}
});

test('slot recycle invalidates old render items and only publishes a finalized layout; same-frame capture cannot be overwritten',()=>{
 const f=fixture(),view=f.views[0],b=f.batches.get(0),frustum=clip();try{
  view.proxy.intersectsFrustum(frustum);const old=view.proxy.geometry,oldSlots=old.attributes.aTreeRootSlot44.array.slice(),oldMatrices=old.attributes.instanceMatrix.array.slice(),retiredID=b.activeRecords[2].id,slot=f.atlas.slots.get(retiredID),stable=f.atlas.slots.get(b.activeRecords[0].id);
  b.activeRecords[2]={...b.activeRecords[2],id:'spruce:100:0',x:1};f.update(2,true);
  assert.equal(f.atlas.slots.get('spruce:100:0'),slot);assert.equal(f.atlas.slots.get(b.activeRecords[0].id),stable);assert.equal(f.atlas.slots.has(retiredID),false);
  assert.throws(()=>view.proxy.onBeforeRender({},null,null,old,view.proxy.material,null),/layout changed/);
  view.proxy.intersectsFrustum(frustum);assert.notStrictEqual(view.proxy.geometry,old);assert.deepEqual(old.attributes.aTreeRootSlot44.array,oldSlots);assert.deepEqual(old.attributes.instanceMatrix.array,oldMatrices);
  const next=view.proxy.geometry;view.proxy.onBeforeShadow({},view.proxy,null,null,next,view.proxy.customDepthMaterial,null);
  f.atlas.syncLayout(f.batches,f.owner.groups);assert.throws(()=>view.proxy.intersectsFrustum(frustum),/published before/);f.atlas.publish(f.owner.cache);assert.equal(view.proxy.intersectsFrustum(frustum),true);
 }finally{f.cleanup();}
});

test('source prefix swap removal updates slot order even when root objects are recreated',()=>{
 const f=fixture({parts:2}),before=[...f.atlas.slots];try{
  for(const b of f.batches.values()){const last=b.activeRecords.pop();b.activeRecords[1]=last;b.activeRecords=b.activeRecords.map(r=>({...r}));}f.update(2,true);
  for(const b of f.batches.values())for(let i=0;i<b.mesh.count;i++)assert.equal(b.binding.slots[i],f.atlas.slots.get(b.activeRecords[i].id));
  for(const [id,slot]of before)if(f.atlas.slots.has(id))assert.equal(f.atlas.slots.get(id),slot);
  f.views[0].proxy.intersectsFrustum(clip());assert.equal(f.views[0].stats.forceCopies,0);
 }finally{f.cleanup();}
});

test('over-capacity rejects atomically without dropping roots or expanding the atlas',()=>{
 const atlas=new TreeWindAtlas44({capacity:2,width:2}),a=[{id:'a'},{id:'b'}];atlas.syncLayout(new Map(),[{records:a}]);const before=[...atlas.slots],rev=atlas.layoutRevision,bytes=atlas.data.byteLength;
 assert.throws(()=>atlas.syncLayout(new Map(),[{records:[{id:'c'},{id:'d'},{id:'e'}]}]),/capacity exceeded/);assert.deepEqual([...atlas.slots],before);assert.equal(atlas.layoutRevision,rev);assert.equal(atlas.data.byteLength,bytes);atlas.dispose();
});

test('standard and depth preserve late source and projected hooks, and sample the same atlas after both early rejects',()=>{
 const f=fixture({parts:2});try{
  const view=f.views[0],d=view.proxy.customDepthMaterial;useProjectedShadowDepth(d);const projected=d.onBeforeCompile;
  const previous=f.depth.onBeforeCompile;f.depth.onBeforeCompile=(shader,renderer)=>{previous(shader,renderer);shader.uniforms.lateHook={value:9};};f.depth.needsUpdate=true;view.sync();assert.strictEqual(d.onBeforeCompile,projected);
  const shaders=[];for(const material of [view.proxy.material,d]){const lib=material.isMeshDepthMaterial?T.ShaderLib.depth:T.ShaderLib.standard,shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(shader,{});shaders.push(shader);assert.strictEqual(shader.uniforms.uTreeRootWindAtlas44,f.atlas.uniform);assert.equal((shader.vertexShader.match(/texelFetch\(uTreeRootWindAtlas44/g)||[]).length,2);assert.ok(shader.vertexShader.indexOf('int treeWindWidth44')>shader.vertexShader.indexOf('// TREE_FRUSTUM_EARLY_END'));assert.doesNotMatch(shader.vertexShader,/attribute vec4 aTreeRootWind/);assert.match(shader.vertexShader,/vec2 ecoOffset=ecoBend/);assert.match(shader.vertexShader,/objectNormal=normalize/);assert.match(material.customProgramCacheKey(),/wind-atlas44/);}
  assert.equal(shaders[1].uniforms.lateHook.value,9);assert.doesNotMatch(shaders[1].vertexShader,/#include <logdepthbuf_(?:pars_)?vertex>/);assert.strictEqual(f.views[1].proxy.material,view.proxy.material);assert.strictEqual(f.views[1].proxy.customDepthMaterial,d);
 }finally{f.cleanup();}
});

test('owner disposal is single and follows all views; source VBO and material resources remain separate',()=>{
 const f=fixture({parts:2});let disposals=0;f.atlas.texture.addEventListener('dispose',()=>disposals++);try{
  assert.throws(()=>f.owner.dispose(),/Release tree wind atlas views/);f.views[0].proxy.intersectsFrustum(clip());f.views[0].dispose();assert.equal(disposals,0);assert.equal(f.atlas.bindings.size,1);assert.ok(f.batches.get(1).mesh.geometry.attributes.aTreeRootWind.data.array.length);
  f.views[1].dispose();f.owner.dispose();f.owner.dispose();assert.equal(disposals,1);assert.equal(f.atlas.bindings.size,0);
 }finally{f.cleanup();}
});

test('full-prefix path remains drawable with only slot uploads and rejects unpublished source changes',()=>{
 const f=fixture(),view=f.views[0];try{
  view.restore();let g=view.proxy.geometry;assert.equal(g.instanceCount,6);assert.equal(g.attributes.aTreeRootWind,undefined);for(let i=0;i<6;i++)assert.equal(g.attributes.aTreeRootSlot44.getX(i),f.atlas.slots.get(f.records[i].id));
  const writes=view.stats.fullSlotCopies;f.update(2);view.restore();assert.equal(view.stats.fullSlotCopies,writes);assert.equal(view.stats.fullForceCopies,0);
  view.source.instanceMatrix.needsUpdate=true;assert.throws(()=>view.proxy.intersectsFrustum(clip()),/published before/);
  f.update(3,true);view.restore();g=view.proxy.geometry;view.proxy.onBeforeRender({},null,null,g,view.proxy.material,null);
 }finally{f.cleanup();}
});

test('actual preparation finalization publishes a newly changed prefix before first colour or depth draw, while branches-only sync cannot bypass it',()=>{
 const f=fixture(),view=f.views[0],b=f.batches.get(0),camera=new T.PerspectiveCamera(),eco={nearTreeBatches:f.batches,treeBatchRevision:2,treeRootWind:f.owner,windField:f.field,uniforms:{uWindTime:{value:2}},stats:{preparation:{finalSyncs:0}},publishMeadowPools(){this.poolsPublished=true;},syncTreeDynamics:WorldEcology.prototype.syncTreeDynamics};
 try{
  b.activeRecords.push({id:'spruce:999:0',x:5,y:0,z:-50,rot:0,s:1,variant:0});b.mesh.count++;b.mesh.setMatrixAt(6,new T.Matrix4().makeTranslation(5,0,-50));b.mesh.instanceMatrix.needsUpdate=true;b.mesh.computeBoundingBox();b.mesh.computeBoundingSphere();
  eco.syncTreeDynamics(camera,{roots:false});assert.throws(()=>view.proxy.intersectsFrustum(clip()),/published before/);
  WorldEcology.prototype.finishPreparation.call(eco,camera);assert.equal(eco.poolsPublished,true);assert.equal(eco.stats.preparation.finalSyncs,1);assert.equal(f.atlas.slots.size,7);assert.equal(f.atlas.ready,true);
  view.proxy.intersectsFrustum(clip());const g=view.proxy.geometry;
  for(const material of [view.proxy.material,view.proxy.customDepthMaterial]){const lib=material.isMeshDepthMaterial?T.ShaderLib.depth:T.ShaderLib.standard,shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(shader,{});assert.strictEqual(shader.uniforms.uTreeRootWindAtlas44.value,f.atlas.texture);}
  view.proxy.onBeforeRender({},null,null,g,view.proxy.material,null);view.proxy.onBeforeShadow({},view.proxy,null,null,g,view.proxy.customDepthMaterial,null);
 }finally{f.cleanup();}
});

test('atlas material views do not replace a simultaneous original VBO view or a second world atlas',()=>{
 const f=fixture(),second=new TreeWindAtlas44({capacity:8,width:4});let native,other;
 try{
  native=installTreeViewBatch(f.views[0].source);const binding=second.bind(f.views[0].source);second.syncLayout(f.batches,f.owner.groups);second.publish(f.owner.cache);other=installTreeViewBatch(f.views[0].source,{atlasBinding:binding});
  assert.notStrictEqual(native.proxy.material,f.views[0].proxy.material);assert.notStrictEqual(other.proxy.material,f.views[0].proxy.material);
  for(const [view,atlas]of [[native,null],[f.views[0],f.atlas],[other,second]]){const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};view.proxy.material.onBeforeCompile(shader,{});if(atlas)assert.strictEqual(shader.uniforms.uTreeRootWindAtlas44,atlas.uniform);else{assert.equal(shader.uniforms.uTreeRootWindAtlas44,undefined);assert.match(shader.vertexShader,/attribute vec4 aTreeRootWind/);}}
  other.dispose();second.dispose();assert.equal(f.atlas.disposed,false);f.views[0].proxy.intersectsFrustum(clip());
 }finally{native?.dispose();other?.dispose();second.dispose();f.cleanup();}
});
