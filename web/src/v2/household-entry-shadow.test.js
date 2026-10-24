import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createStructureDepth} from './room-shadow.js';
import {ownedShadowSide} from './owned-shadow-policy.js';
import {householdEntryShadowMode,validateClosedEntryGeometry,installClosedEntryShadow} from './household-entry-shadow.js';

const cubeContract={triangles:12,components:1};
function fixture(){
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),depth=createStructureDepth(material);geometry.clearGroups();
 mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;
 const renderer={renderBufferDirect(){}},camera={},shadowCamera={};
 return {geometry,material,mesh,depth,renderer,args:[renderer,mesh,camera,shadowCamera,geometry,depth,null],validation:validateClosedEntryGeometry(geometry,cubeContract)};
}
function actualExportGeometry(){
 const bytes=readFileSync(new URL('../../public/assets/v2/household_entry_tea.glb',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'277e71e74629dbe081813b900900d6824e7ad769b865d13603ccae309ff1f5dd');
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),start=28+jsonLength;
 const readAttribute=i=>{
  const a=json.accessors[i],view=json.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3}[a.type],Ctor={5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
  assert.ok(size&&Ctor);assert.ok(!view.byteStride||view.byteStride===size*Ctor.BYTES_PER_ELEMENT);
  const offset=start+(view.byteOffset||0)+(a.byteOffset||0),array=new Ctor(bytes.buffer.slice(bytes.byteOffset+offset,bytes.byteOffset+offset+a.count*size*Ctor.BYTES_PER_ELEMENT));
  return new THREE.BufferAttribute(array,size,!!a.normalized);
 };
 const primitive=json.meshes[0].primitives[0],geometry=new THREE.BufferGeometry();geometry.setAttribute('position',readAttribute(primitive.attributes.POSITION));geometry.setIndex(readAttribute(primitive.indices));
 assert.equal(json.nodes.filter(n=>n.mesh!==undefined).length,1);assert.equal(json.nodes.find(n=>n.mesh!==undefined).extras.geometryRevision,'front-bevel-17p111mm');
 return geometry;
}

test('closed-entry shadow policy is separately opt-in and never changes v33 or unknown defaults',()=>{
 const previous=globalThis.location;
 try{
  for(const search of['','?householdEntryShadow=unknown','?householdEntryShadow=standard','?householdEntryShadow=Closed']){globalThis.location={search};assert.equal(householdEntryShadowMode('editable'),'standard');}
  globalThis.location={search:'?householdEntryShadow=closed'};assert.equal(householdEntryShadowMode('editable'),'closed');assert.equal(householdEntryShadowMode('v33'),'standard');
  delete globalThis.location;assert.equal(householdEntryShadowMode('editable'),'standard');
 }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});

test('actual corrected export has32 closed outward/centroid-facing stone shells after exact position welding',()=>{
 const geometry=actualExportGeometry(),position=geometry.attributes.position.array.slice(),index=geometry.index.array.slice(),record=validateClosedEntryGeometry(geometry);
 assert.deepEqual({...record.stats,minimumVolume:0,minimumOutwardDot:0},{triangles:2752,components:32,geometricVertices:1440,geometricEdges:4128,minimumVolume:0,minimumOutwardDot:0,closedOutward:true});
 assert.ok(record.stats.minimumVolume>0&&record.stats.minimumOutwardDot>0);record.assertUnchanged();assert.deepEqual(geometry.attributes.position.array,position);assert.deepEqual(geometry.index.array,index);geometry.dispose();
});

test('open, inconsistent, inward, partial and malformed geometry fails closed',()=>{
 const check=(change,contract=cubeContract,pattern=/Closed entry/)=>{const g=new THREE.BoxGeometry();g.clearGroups();change(g);assert.throws(()=>validateClosedEntryGeometry(g,contract),pattern);g.dispose();};
 check(g=>g.setIndex(Array.from(g.index.array).slice(3)),{triangles:11,components:1},/boundary/);
 check(g=>{const a=g.index.array;[a[0],a[1]]=[a[1],a[0]];},cubeContract,/oriented edge/);
 check(g=>{const a=g.index.array;for(let i=0;i<a.length;i+=3)[a[i],a[i+1]]=[a[i+1],a[i]];},cubeContract,/non-outward/);
 check(g=>g.index.setX(0,g.index.getX(1)),cubeContract,/degenerate/);
 check(g=>g.setDrawRange(0,g.index.count-3));check(g=>g.addGroup(0,g.index.count,0));
 check(g=>g.attributes.position.setX(0,NaN));check(g=>g.morphAttributes.position=[g.attributes.position.clone()]);
 check(()=>{},{triangles:12,components:2},/solid count/);
});

test('owned depth keeps BackSide across cascades without changing canonical material, renderer or shader hooks',()=>{
 const f=fixture(),events=[],colorCompile=f.material.onBeforeCompile,colorKey=f.material.customProgramCacheKey,depthCompile=f.depth.onBeforeCompile,depthKey=f.depth.customProgramCacheKey,draw=f.renderer.renderBufferDirect,version=f.depth.version;
 f.mesh.onBeforeShadow=function(...args){assert.strictEqual(this,f.mesh);assert.deepEqual(args,f.args);events.push('before');};
 f.mesh.onAfterShadow=function(){events.push('after');};
 const before=f.mesh.onBeforeShadow,after=f.mesh.onAfterShadow,handle=installClosedEntryShadow(f.mesh,f.validation);
 const other=new THREE.Mesh(f.geometry,f.material);other.customDepthMaterial=createStructureDepth(f.material);
 for(let cascade=0;cascade<3;cascade++){
  // Match Three's pinned getDepthMaterial assignment before invoking the hook.
  f.depth.side=f.material.side;f.mesh.onBeforeShadow(...f.args);assert.equal(f.depth.side,THREE.BackSide);f.renderer.renderBufferDirect();f.mesh.onAfterShadow(...f.args);assert.equal(f.depth.side,THREE.BackSide);
  assert.equal(other.customDepthMaterial.side,THREE.DoubleSide);assert.equal(f.material.side,THREE.DoubleSide);assert.equal(f.material.shadowSide,null);
 }
 assert.deepEqual(events,['before','after','before','after','before','after']);assert.equal(handle.stats.beforeDraws,3);assert.equal(handle.stats.completedDraws,3);
 assert.strictEqual(f.mesh.material,f.material);assert.equal(f.mesh.castShadow,true);assert.equal(f.mesh.receiveShadow,true);assert.strictEqual(f.renderer.renderBufferDirect,draw);
 assert.strictEqual(f.material.onBeforeCompile,colorCompile);assert.strictEqual(f.material.customProgramCacheKey,colorKey);assert.strictEqual(f.depth.onBeforeCompile,depthCompile);assert.strictEqual(f.depth.customProgramCacheKey,depthKey);assert.equal(f.depth.version,version,'no needsUpdate churn');
 handle.dispose();assert.strictEqual(f.mesh.onBeforeShadow,before);assert.strictEqual(f.mesh.onAfterShadow,after);assert.equal(f.depth.side,THREE.BackSide,'intended owned state persists until its disposal');
 f.geometry.dispose();f.depth.dispose();other.customDepthMaterial.dispose();f.material.dispose();
});

test('draw and composed callback failures leave only the intended owned state, with no shared rollback needed',()=>{
 for(const failure of['before','draw','after']){
  const f=fixture(),before=()=>{if(failure==='before')throw new Error('before failed');},after=()=>{if(failure==='after')throw new Error('after failed');};f.mesh.onBeforeShadow=before;f.mesh.onAfterShadow=after;
  f.renderer.renderBufferDirect=()=>{if(failure==='draw')throw new Error('draw failed');};const draw=f.renderer.renderBufferDirect,handle=installClosedEntryShadow(f.mesh,f.validation);
  assert.throws(()=>{f.depth.side=f.material.side;f.mesh.onBeforeShadow(...f.args);f.renderer.renderBufferDirect();f.mesh.onAfterShadow(...f.args);},new RegExp(failure+' failed'));
  assert.equal(f.depth.side,THREE.BackSide);assert.equal(f.material.side,THREE.DoubleSide);assert.equal(f.material.shadowSide,null);assert.strictEqual(f.renderer.renderBufferDirect,draw);
  assert.equal(handle.stats.completedDraws,failure==='after'?1:0);handle.dispose();assert.strictEqual(f.mesh.onBeforeShadow,before);assert.strictEqual(f.mesh.onAfterShadow,after);f.depth.dispose();f.geometry.dispose();f.material.dispose();
 }
});

test('foreign depth or changed shells are rejected without mutating other materials',()=>{
 const f=fixture(),handle=installClosedEntryShadow(f.mesh,f.validation),foreign=createStructureDepth(f.material),args=[...f.args];args[5]=foreign;
 assert.throws(()=>f.mesh.onBeforeShadow(...args),/non-owned/);assert.equal(foreign.side,THREE.DoubleSide);assert.equal(f.depth.side,THREE.BackSide);assert.equal(handle.stats.lastFailure,'foreign-depth-or-geometry');assert.equal(handle.stats.rejectedDraws,1);assert.equal(handle.stats.callbackFailures,0);
 f.geometry.attributes.position.needsUpdate=true;assert.throws(()=>f.mesh.onBeforeShadow(...f.args),/geometry changed/);assert.equal(f.material.side,THREE.DoubleSide);assert.equal(handle.stats.beforeDraws,0);assert.equal(handle.stats.lastFailure,'changed-geometry');assert.equal(handle.stats.status,'rejected');
 handle.dispose();foreign.dispose();f.depth.dispose();f.geometry.dispose();f.material.dispose();
 for(const change of[m=>m.alphaTest=.5,m=>m.transparent=true,m=>m.alphaToCoverage=true,m=>m.displacementMap={},m=>m.clippingPlanes=[new THREE.Plane()]]){
  const g=fixture(),h=installClosedEntryShadow(g.mesh,g.validation);change(g.material);assert.throws(()=>g.mesh.onBeforeShadow(...g.args),/opaque undeformed/);assert.equal(g.depth.side,THREE.BackSide);assert.equal(h.stats.lastFailure,'unsupported-source-material');assert.equal(h.stats.callbackFailures,0);h.dispose();g.depth.dispose();g.geometry.dispose();g.material.dispose();
 }
});

test('installation rejects ineligible materials and a different geometry validation before mutating any hooks or side',()=>{
 for(const change of[m=>m.alphaTest=.5,m=>m.transparent=true,m=>m.alphaToCoverage=true,m=>m.displacementMap={},m=>m.clippingPlanes=[new THREE.Plane()]]){
  const f=fixture(),before=f.mesh.onBeforeShadow,after=f.mesh.onAfterShadow;change(f.material);assert.throws(()=>installClosedEntryShadow(f.mesh,f.validation),/opaque undeformed/);assert.strictEqual(f.mesh.onBeforeShadow,before);assert.strictEqual(f.mesh.onAfterShadow,after);assert.equal(f.depth.side,THREE.DoubleSide);f.geometry.dispose();f.depth.dispose();f.material.dispose();
 }
 const f=fixture(),g=fixture();assert.throws(()=>installClosedEntryShadow(f.mesh,g.validation),/own validated/);assert.equal(f.depth.side,THREE.DoubleSide);f.geometry.dispose();f.depth.dispose();f.material.dispose();g.geometry.dispose();g.depth.dispose();g.material.dispose();
});

test('a prior callback cannot replace the validated mesh geometry silently',()=>{
 const f=fixture(),foreign=new THREE.BoxGeometry();foreign.clearGroups();f.mesh.onBeforeShadow=()=>{f.mesh.geometry=foreign;};const handle=installClosedEntryShadow(f.mesh,f.validation);
 assert.throws(()=>f.mesh.onBeforeShadow(...f.args),/non-owned/);assert.equal(handle.stats.lastFailure,'foreign-depth-or-geometry');assert.equal(handle.stats.rejectedDraws,1);assert.equal(handle.stats.beforeDraws,0);assert.equal(f.depth.side,THREE.BackSide);assert.equal(f.material.side,THREE.DoubleSide);handle.dispose();foreign.dispose();f.geometry.dispose();f.depth.dispose();f.material.dispose();
});

test('geometry/depth disposal cleans up owned callbacks and preserves later composed callbacks',()=>{
 for(const target of['geometry','depth']){
  const f=fixture(),before=f.mesh.onBeforeShadow,after=f.mesh.onAfterShadow,handle=installClosedEntryShadow(f.mesh,f.validation);f[target].dispose();assert.equal(handle.stats.disposed,true);assert.strictEqual(f.mesh.onBeforeShadow,before);assert.strictEqual(f.mesh.onAfterShadow,after);handle.dispose();f.geometry.dispose();f.depth.dispose();f.material.dispose();
 }
 const f=fixture();let calls=0;f.mesh.onBeforeShadow=()=>calls++;const handle=installClosedEntryShadow(f.mesh,f.validation),installed=f.mesh.onBeforeShadow,later=function(...args){return installed.apply(this,args);};f.mesh.onBeforeShadow=later;handle.dispose();f.depth.side=THREE.DoubleSide;f.mesh.onBeforeShadow(...f.args);assert.strictEqual(f.mesh.onBeforeShadow,later);assert.equal(calls,1);assert.equal(f.depth.side,THREE.DoubleSide,'disposed inner callback does not reapply policy');f.geometry.dispose();f.depth.dispose();f.material.dispose();
});

test('pinned Three shadow path assigns canonical side before callback and draws before after-callback',()=>{
 const source=readFileSync(new URL('../../node_modules/three/src/renderers/webgl/WebGLShadowMap.js',import.meta.url),'utf8'),assign=source.indexOf('result.side ='),before=source.indexOf('object.onBeforeShadow'),draw=source.indexOf('renderer.renderBufferDirect( shadowCamera',before),after=source.indexOf('object.onAfterShadow',draw);
 assert.ok(assign>=0&&assign<before&&before<draw&&draw<after);
});


test('effective policy is pure and lifecycle cleanup removes it without replaying hooks',()=>{
 for(const target of['handle','geometry','depth']){
  const f=fixture();let calls=0;f.mesh.onBeforeShadow=()=>calls++;const handle=installClosedEntryShadow(f.mesh,f.validation),stats={...handle.stats};
  assert.equal(ownedShadowSide(f.mesh,f.material,f.depth),THREE.BackSide);assert.equal(calls,0);assert.deepEqual(handle.stats,stats);
  f.material.alphaTest=.5;assert.throws(()=>ownedShadowSide(f.mesh,f.material,f.depth),/opaque undeformed/);assert.deepEqual(handle.stats,stats);f.material.alphaTest=0;
  if(target==='handle')handle.dispose();else f[target].dispose();assert.equal(ownedShadowSide(f.mesh,f.material,f.depth),undefined);assert.equal(calls,0);handle.dispose();f.geometry.dispose();f.depth.dispose();f.material.dispose();
 }
});
