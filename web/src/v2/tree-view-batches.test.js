import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {WebGLObjects} from "three/src/renderers/webgl/WebGLObjects.js";
import {WebGLGeometries} from "three/src/renderers/webgl/WebGLGeometries.js";
import {WebGLRenderLists} from "three/src/renderers/webgl/WebGLRenderLists.js";
import {WebGLProgram} from "three/src/renderers/webgl/WebGLProgram.js";
import {installTreeViewBatch} from "./tree-view-batches.js";
import {createTreeWindGeometry,disposeTreeWindGeometry} from "./spruce-wind.js";
import {attachEcologyWind} from "./ecology.js";
import {TREE_CULL_WIND,treeCullSphere} from "./tree-frustum-cull.js";
import {createWaterReflectionCamera} from "./water-reflection.js";
import {SunShadowReceiverCulling} from "./sun-shadow-receivers.js";
import {useProjectedShadowDepth} from "./room-shadow.js";

function fixture(options={}){
 const base=new T.BoxGeometry(4,12,4);base.translate(0,6,0);
 const weights=new Float32Array(base.attributes.position.count*3);for(let i=0;i<weights.length;i+=3)weights.set([.8,.5,.2],i);
 base.setAttribute("aPlantWind",new T.BufferAttribute(weights,3));
 const geometry=createTreeWindGeometry(base,8),material=attachEcologyWind(new T.MeshStandardMaterial(),{},5,false,true),depth=attachEcologyWind(new T.MeshDepthMaterial(),{},5,false,true);
 material.defines={ECO_ROOT_WIND:""};depth.defines={ECO_ROOT_WIND:""};
 geometry.setAttribute("aTreeFrustumSphere",new T.InstancedBufferAttribute(new Float32Array([0,6,0,10]),4,false,8));
 const source=new T.InstancedMesh(geometry,material,8);source.customDepthMaterial=depth;source.castShadow=true;source.receiveShadow=true;source.count=6;
 for(let i=0;i<6;i++){
  source.setMatrixAt(i,new T.Matrix4().makeTranslation(-60+i*30,0,-30));
  geometry.attributes.aTreeRootWind.data.array.set([.5+i*.01,.3,.1+i*.02,.4,.05],i*5);
 }
 source.instanceMatrix.needsUpdate=true;geometry.attributes.aTreeRootWind.data.needsUpdate=true;source.computeBoundingBox();source.boundingBox.expandByScalar(2);source.computeBoundingSphere();
 const view=installTreeViewBatch(source,options);
 return {source,view,base,cleanup(){view.dispose();disposeTreeWindGeometry(geometry);base.dispose();material.dispose();depth.dispose();}};
}
function frustum(x=0){
 const c=new T.PerspectiveCamera(55,1,.1,120);c.position.set(x,6,0);c.lookAt(x,6,-30);c.updateMatrixWorld();
 return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
}
const roots=g=>Array.from({length:g.instanceCount},(_,i)=>g.attributes.instanceMatrix.getComponent(i,12));

test("each actual view submits a compact stable-order prefix with exact source matrices/wind and shared shell vertices",()=>{
 const f=fixture(),{source,view}=f,before=source.instanceMatrix.array.slice(),force=source.geometry.attributes.aTreeRootWind.data.array.slice();
 try{
  source.boundingSphere=null;view.proxy.computeBoundingSphere();assert.ok(source.boundingSphere?.isSphere);
  assert.equal(view.proxy.isInstancedMesh,undefined);assert.equal(view.proxy.isMesh,true);assert.strictEqual(view.proxy.userData.treeViewSource,source);
  assert.equal(view.proxy.intersectsFrustum(frustum()),true);const g=view.proxy.geometry;
  assert.ok(g.instanceCount>0&&g.instanceCount<source.count);assert.strictEqual(g.attributes.position,source.geometry.attributes.position);assert.strictEqual(g.index,source.geometry.index);
  const positions=roots(g);assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
  for(let j=0;j<positions.length;j++){
   const i=(positions[j]+60)/30;
   for(let k=0;k<16;k++)assert.equal(g.attributes.instanceMatrix.getComponent(j,k),source.instanceMatrix.getComponent(i,k));
   for(let k=0;k<5;k++)assert.equal(g.attributes.aTreeRootWind.data.array[j*5+k],force[i*5+k]);
  }
  assert.deepEqual(source.instanceMatrix.array,before);assert.deepEqual(source.geometry.attributes.aTreeRootWind.data.array,force);assert.equal(source.count,6);
  assert.notStrictEqual(view.proxy.material,source.material);assert.equal(source.material.defines.USE_INSTANCING,undefined);assert.equal(view.proxy.material.defines.USE_INSTANCING,"");
 }finally{f.cleanup();}
});

test("installed Three render items and object upload cache keep main/shadow and same-frame changes independent",()=>{
 let frame=10;const f=fixture({getFrame:()=>frame}),{source,view}=f,main=frustum(),shadow=frustum(60),scene=new T.Scene(),lists=WebGLRenderLists(),list=lists.get(scene,0);
 const uploaded=[],info={render:{frame},memory:{geometries:0}},attributes={update:a=>uploaded.push(a),remove:()=>{}},geometries=WebGLGeometries({ARRAY_BUFFER:1},attributes,info,{releaseStatesOfGeometry:()=>{}}),objects=WebGLObjects({ARRAY_BUFFER:1},geometries,attributes,{releaseStatesOfObject:()=>{}},info);
 try{
  view.proxy.intersectsFrustum(main);const colour=objects.update(view.proxy),original=colour.attributes.instanceMatrix.array.slice();list.push(view.proxy,colour,view.proxy.material,0,0,null,{reversedDepth:false});const count=colour.instanceCount;
  view.proxy.intersectsFrustum(shadow);const depth=objects.update(view.proxy);assert.notStrictEqual(depth,colour);assert.notDeepEqual(roots(depth),roots(colour));
  assert.strictEqual(list.opaque[0].geometry,colour);assert.equal(colour.instanceCount,count);assert.deepEqual(colour.attributes.instanceMatrix.array,original);
  assert.ok(uploaded.includes(colour.attributes.instanceMatrix)&&uploaded.includes(depth.attributes.instanceMatrix));
  const cached=view.stats.uploads;view.proxy.intersectsFrustum(main);assert.strictEqual(view.proxy.geometry,colour);assert.equal(view.stats.uploads,cached);
  source.geometry.attributes.aTreeRootWind.data.array[2]=.91;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;
  view.proxy.intersectsFrustum(main);const changed=objects.update(view.proxy);assert.notStrictEqual(changed,colour,"same-frame updated wind must not miss WebGLObjects' once-per-geometry upload");
  assert.ok(uploaded.includes(changed.attributes.instanceMatrix));assert.deepEqual(colour.attributes.instanceMatrix.array,original);
  frame++;info.render.frame=frame;view.proxy.intersectsFrustum(main);assert.strictEqual(view.proxy.geometry,changed,"unchanged identity/version reuses buffers across queries");
 }finally{f.cleanup();objects.dispose();lists.dispose();}
});

test("A/B retains the same whole-batch bounds and false/after hooks restore a drawable logical prefix",()=>{
 const control={value:0},f=fixture({enabled:control}),{source,view}=f;let boxes=0;
 try{
  const outside={intersectsBox(){boxes++;return false;}};
  assert.equal(view.proxy.intersectsFrustum(outside),false);assert.equal(boxes,1);assert.equal(view.proxy.geometry.instanceCount,source.count);
  const inside=frustum();assert.equal(view.proxy.intersectsFrustum(inside),true);assert.equal(view.proxy.geometry.instanceCount,source.count);
  control.value=1;assert.equal(view.proxy.intersectsFrustum(inside),true);const g=view.proxy.geometry;assert.ok(g.instanceCount<source.count);
  view.proxy.onAfterRender({},null,null,g,view.proxy.material,null);assert.equal(view.proxy.geometry.instanceCount,source.count);
  view.proxy.intersectsFrustum(inside);view.proxy.onAfterShadow({},view.proxy,null,null,g,view.proxy.customDepthMaterial,null);assert.equal(view.proxy.geometry.instanceCount,source.count);
  source.count=0;source.visible=false;assert.equal(view.proxy.visible,false);assert.equal(view.proxy.intersectsFrustum(inside),false);assert.equal(view.proxy.geometry.instanceCount,0);
  source.count=6;source.visible=true;assert.equal(view.proxy.visible,true);view.restore();assert.equal(view.proxy.geometry.instanceCount,6);
 }finally{f.cleanup();}
});

test("per-root culling retains every visible full-wind point under transformed main, mirror and shadow views",()=>{
 const f=fixture(),{source,view}=f,world=new T.Group();world.add(view.proxy);world.scale.set(1.2,.85,1.1);world.rotation.y=.2;world.updateMatrixWorld(true);
 const main=new T.PerspectiveCamera(55,1.6,.1,150);main.position.set(0,10,10);main.lookAt(0,6,-30);main.updateMatrixWorld();
 const shadow=new T.OrthographicCamera(-40,40,40,-40,1,200);shadow.position.set(40,60,20);shadow.lookAt(0,0,-40);shadow.updateMatrixWorld();
 let kept=0,rejected=0;
 try{
  for(const c of [main,createWaterReflectionCamera(main,new T.Plane(new T.Vector3(0,1,0),-2)),shadow]){
   assert.ok(c);const clip=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
   const visible=view.proxy.intersectsFrustum(clip),selected=visible?new Set(roots(view.proxy.geometry)):new Set();
   for(let i=0;i<source.count;i++){
    const matrix=new T.Matrix4().fromArray(source.instanceMatrix.array,i*16).premultiply(view.proxy.matrixWorld),x=source.instanceMatrix.getComponent(i,12);
    if(selected.has(x)){kept++;continue;}rejected++;
    for(let v=0;v<f.base.attributes.position.count;v++)for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){
     const p=new T.Vector3().fromBufferAttribute(f.base.attributes.position,v).add(new T.Vector3(sx*TREE_CULL_WIND[0],sy*TREE_CULL_WIND[1],sz*TREE_CULL_WIND[2])).applyMatrix4(matrix);
     assert.equal(clip.containsPoint(p),false,"a visible wind corner cannot be removed");
    }
   }
  }
  assert.ok(kept>0&&rejected>0);
 }finally{f.cleanup();}
});

test("actual receiver-box wrapper participates in each root decision",()=>{
 const f=fixture(),{view}=f,calls=[];
 try{
  const receiver={intersectsBox(box){calls.push(box.clone());return box.max.x>=45;}};
  assert.equal(view.proxy.intersectsFrustum(receiver),true);assert.equal(calls.length,7);
  assert.deepEqual(roots(view.proxy.geometry),[60,90]);
 }finally{f.cleanup();}
});

test("transient compile frustums stay bounded and old slots recover without losing any tree",()=>{
 let frame=0;const f=fixture({getFrame:()=>frame}),{view,source}=f;
 try{
  for(let i=0;i<100;i++)assert.equal(view.proxy.intersectsFrustum(frustum()),true);
  assert.ok(view.stats.viewGeometries<=24);assert.ok(view.stats.capacityFallbacks>0);assert.equal(view.proxy.geometry.instanceCount,source.count);
  frame=4;view.proxy.intersectsFrustum(frustum());assert.ok(view.proxy.geometry.instanceCount<source.count);assert.equal(view.stats.viewGeometries,1);
 }finally{f.cleanup();}
});

test("material variants retain root wind, late source/CSM hooks and later projected-depth wrapping",()=>{
 const f=fixture(),{source,view}=f;
 try{
  const d=view.proxy.customDepthMaterial;useProjectedShadowDepth(d);const projected=d.onBeforeCompile;
  const old=source.customDepthMaterial.onBeforeCompile;
  source.customDepthMaterial.onBeforeCompile=(shader,r)=>{old(shader,r);shader.uniforms.lateSource={value:7};};source.customDepthMaterial.defines.LATE_CSM=1;source.customDepthMaterial.needsUpdate=true;
  view.sync();assert.strictEqual(d.onBeforeCompile,projected);assert.equal(d.defines.LATE_CSM,1);assert.equal(d.defines.USE_INSTANCING,"");
  const shader={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader};d.onBeforeCompile(shader,{});
  assert.equal(shader.uniforms.lateSource.value,7);assert.match(shader.vertexShader,/aTreeRootWind/);assert.doesNotMatch(shader.vertexShader,/#include <logdepthbuf_(?:pars_)?vertex>/);
  assert.match(d.customProgramCacheKey(),/projected-shadow/);
 }finally{f.cleanup();}
});

test("installed WebGLProgram emits manual instancing define before its matrix attribute declaration",()=>{
 const f=fixture(),captured=[];
 try{
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,createProgram:()=>({}),createShader:type=>({type}),shaderSource:(s,text)=>{s.text=text;captured.push(s);},compileShader:()=>{},attachShader:()=>{},linkProgram:()=>{},deleteProgram:()=>{}};
  const renderer={getContext:()=>gl,debug:{checkShaderErrors:false}},parameters={shaderType:"MeshStandardMaterial",shaderName:"tree-view-test",defines:f.view.proxy.material.defines,precision:"highp",instancing:false,outputColorSpace:T.LinearSRGBColorSpace,rendererExtensionParallelShaderCompile:false,toneMapping:T.NoToneMapping,
   vertexShader:"void main(){gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}",fragmentShader:"void main(){gl_FragColor=vec4(1.);}",numClippingPlanes:0,numClipIntersection:0};
  const program=new WebGLProgram(renderer,"test",parameters,{releaseStatesOfProgram:()=>{}}),vertex=captured.find(s=>s.type===1).text;
  assert.ok(vertex.indexOf("#define USE_INSTANCING")<vertex.indexOf("attribute mat4 instanceMatrix"));
  assert.match(vertex,/#ifdef USE_INSTANCING\s+attribute mat4 instanceMatrix/);program.destroy();
 }finally{f.cleanup();}
});

test("source disposal releases only private draw buffers/material views once, never shared tree geometry",()=>{
 const f=fixture(),{view,source}=f,removed=[],info={memory:{geometries:0}},geometries=WebGLGeometries({}, {remove:a=>removed.push(a)},info,{releaseStatesOfGeometry:()=>{}});let sourceDisposals=0;
 source.addEventListener("dispose",()=>sourceDisposals++);
 const full=view.proxy.geometry;geometries.get(view.proxy,full);view.proxy.intersectsFrustum(frustum());const privateGeometry=view.proxy.geometry;geometries.get(view.proxy,privateGeometry);
 source.dispose();view.dispose();
 assert.equal(sourceDisposals,1);assert.equal(view.stats.bytes,0);assert.equal(info.memory.geometries,0);
 assert.ok(removed.includes(privateGeometry.attributes.instanceMatrix));assert.ok(removed.includes(full.attributes.instanceMatrix));assert.ok(removed.includes(full.attributes.aTreeRootWind));assert.ok(!removed.includes(source.instanceMatrix));assert.ok(removed.includes(full.attributes.aTreeFrustumSphere));assert.ok(removed.includes(privateGeometry.attributes.aTreeFrustumSphere));assert.ok(!removed.includes(source.geometry.attributes.aTreeFrustumSphere));
 assert.ok(!removed.includes(f.base.attributes.position));assert.ok(!removed.includes(f.base.index));assert.ok(!removed.includes(source.geometry.attributes.aTreeRootWind));
 f.cleanup();
});


test("per-root world bounds cache ignores wind revisions but follows exact matrices, active count and parent transforms",()=>{
 const f=fixture(),{view,source}=f,parent=new T.Group(),clip=frustum();parent.add(view.proxy);parent.updateMatrixWorld(true);
 try{
  view.proxy.intersectsFrustum(clip);assert.equal(view.stats.boundsBuilds,1);
  source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;view.proxy.intersectsFrustum(frustum(60));assert.equal(view.stats.boundsBuilds,1);
  source.setMatrixAt(0,new T.Matrix4().makeTranslation(-50,0,-30));source.instanceMatrix.needsUpdate=true;view.proxy.intersectsFrustum(clip);assert.equal(view.stats.boundsBuilds,2);
  source.count=5;view.proxy.intersectsFrustum(clip);assert.equal(view.stats.boundsBuilds,3);
  parent.position.x=.001;parent.updateMatrixWorld(true);view.proxy.intersectsFrustum(clip);assert.equal(view.stats.boundsBuilds,4);
  view.proxy.intersectsFrustum(clip);assert.equal(view.stats.boundsBuilds,4);
 }finally{f.cleanup();}
});


test("caster-set query uses only the original batch envelope without touching a captured draw or buffers",()=>{
 const f=fixture(),{view,source}=f,parent=new T.Group();parent.add(view.proxy);parent.updateMatrixWorld(true);
 try{
  view.proxy.intersectsFrustum(frustum());const captured=view.proxy.geometry,matrices=captured.attributes.instanceMatrix.array.slice(),forces=captured.attributes.aTreeRootWind.data.array.slice();
  const before={...view.stats},matrixVersion=captured.attributes.instanceMatrix.version,forceVersion=captured.attributes.aTreeRootWind.data.version;
  source.geometry.attributes.aTreeRootWind.data.array[0]+=.01;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;
  let calls=0;const boxes=[];const receiver={intersectsBox(box){calls++;boxes.push(box.clone());return true;}};
  for(let i=0;i<3;i++)assert.equal(view.proxy.intersectsShadowCasterFrustum(receiver),true);
  assert.equal(calls,3);assert.deepEqual(boxes[0],source.boundingBox.clone().applyMatrix4(view.proxy.matrixWorld));
  assert.strictEqual(view.proxy.geometry,captured);assert.deepEqual(captured.attributes.instanceMatrix.array,matrices);assert.deepEqual(captured.attributes.aTreeRootWind.data.array,forces);
  assert.equal(captured.attributes.instanceMatrix.version,matrixVersion);assert.equal(captured.attributes.aTreeRootWind.data.version,forceVersion);
  for(const key of["queries","tested","selected","rejected","uploads","bytes","viewGeometries","boundsBuilds","transformUpdates","batchBoundsBuilds"])assert.equal(view.stats[key],before[key],key+" must not change during a stationary caster query");
  assert.equal(view.stats.shadowCasterQueries,before.shadowCasterQueries+3);
  assert.equal(view.proxy.intersectsShadowCasterFrustum({intersectsBox:()=>false}),false);assert.strictEqual(view.proxy.geometry,captured,"false query also preserves the pending renderItem");
  parent.position.set(13,2,-5);parent.updateMatrixWorld(true);view.proxy.intersectsShadowCasterFrustum(receiver);
  assert.deepEqual(boxes.at(-1),source.boundingBox.clone().applyMatrix4(parent.matrixWorld));assert.equal(view.stats.transformUpdates,before.transformUpdates+1);
  source.position.x=7;view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.proxy.matrixWorld.elements[12],20);
  source.matrixAutoUpdate=false;source.matrix.makeTranslation(-4,3,2);view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.proxy.matrixWorld.elements[12],9);
  source.boundingBox=null;assert.equal(view.proxy.intersectsShadowCasterFrustum({intersectsBox:()=>false}),true,"unknown batch bounds stay conservative");
  source.count=0;assert.equal(view.proxy.intersectsShadowCasterFrustum(receiver),false);assert.strictEqual(view.proxy.geometry,captured);
 }finally{f.cleanup();}
});


test("a tall narrow tree outside the side plane is rejected without using height as an artificial horizontal radius",()=>{
 const base=new T.BoxGeometry(1,40,1);base.translate(0,20,0);const weights=new Float32Array(base.attributes.position.count*3);
 for(let i=0;i<weights.length;i+=3)weights.set([.8,.5,.2],i);base.setAttribute("aPlantWind",new T.BufferAttribute(weights,3));
 const geometry=createTreeWindGeometry(base,4),material=new T.MeshStandardMaterial(),depth=new T.MeshDepthMaterial(),source=new T.InstancedMesh(geometry,material,4);
 source.customDepthMaterial=depth;source.castShadow=true;source.count=2;
 source.setMatrixAt(0,new T.Matrix4().makeTranslation(0,0,-30));source.setMatrixAt(1,new T.Matrix4().makeTranslation(20,0,-30));source.instanceMatrix.needsUpdate=true;
 source.computeBoundingBox();source.boundingBox.expandByVector(new T.Vector3(...TREE_CULL_WIND));
 const old=treeCullSphere(geometry),clip=frustum(),oldBox=new T.Box3().setFromCenterAndSize(new T.Vector3(old[0]+20,old[1],old[2]-30),new T.Vector3(2*old[3],2*old[3],2*old[3]));
 assert.equal(clip.intersectsBox(oldBox),true,"old sphere retains the off-screen tall tree");
 const view=installTreeViewBatch(source);
 try{
  assert.equal(view.proxy.intersectsFrustum(clip),true);assert.deepEqual(roots(view.proxy.geometry),[0]);
  for(let i=0;i<base.attributes.position.count;i++)for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){
   const p=new T.Vector3().fromBufferAttribute(base.attributes.position,i).add(new T.Vector3(20+x*TREE_CULL_WIND[0],y*TREE_CULL_WIND[1],-30+z*TREE_CULL_WIND[2]));
   assert.equal(clip.containsPoint(p),false,"full wind displacement of the rejected root remains outside");
  }
 }finally{view.dispose();disposeTreeWindGeometry(geometry);base.dispose();material.dispose();depth.dispose();}
});


test("batch world box is reused but follows in-place bounds, replacement and exact parent transforms",()=>{
 const f=fixture(),{view,source}=f,parent=new T.Group(),received=[];parent.add(view.proxy);parent.updateMatrixWorld(true);
 const receiver={intersectsBox(box){received.push(box.clone());return true;}};
 try{
  view.proxy.intersectsFrustum(frustum());const captured=view.proxy.geometry,matrixVersion=source.instanceMatrix.version;
  assert.equal(view.stats.batchBoundsBuilds,1);
  for(let i=0;i<3;i++)view.proxy.intersectsShadowCasterFrustum(receiver);
  view.proxy.intersectsFrustum(frustum());assert.equal(view.stats.batchBoundsBuilds,1,"draw and caster queries reuse the coarse box despite per-root scratch changes");
  const axes=["x","y","z"];
  for(const end of["min","max"])for(const axis of axes){
   const before=view.stats.batchBoundsBuilds;source.boundingBox[end][axis]+=.001;
   view.proxy.intersectsShadowCasterFrustum(receiver);
   assert.equal(view.stats.batchBoundsBuilds,before+1,end+"."+axis+" invalidates independently");
   assert.deepEqual(received.at(-1),source.boundingBox.clone().applyMatrix4(view.proxy.matrixWorld));
  }
  assert.equal(source.instanceMatrix.version,matrixVersion,"bounds changes need no matrix version");
  source.boundingBox=source.boundingBox.clone();view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.stats.batchBoundsBuilds,8,"replacement reference invalidates even equal values");
  parent.position.x=.001;parent.updateMatrixWorld(true);view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.stats.batchBoundsBuilds,9);
  assert.deepEqual(received.at(-1),source.boundingBox.clone().applyMatrix4(parent.matrixWorld));
  view.stats.transformUpdates=0;view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.stats.batchBoundsBuilds,9,"diagnostic counter resets do not change cache identity");
  source.position.z=.002;view.proxy.intersectsShadowCasterFrustum(receiver);assert.equal(view.stats.batchBoundsBuilds,10);
  assert.deepEqual(received.at(-1),source.boundingBox.clone().applyMatrix4(view.proxy.matrixWorld));
  assert.equal(captured.attributes.instanceMatrix.version,1,"coarse cache queries do not upload captured root buffers");
 }finally{f.cleanup();}
});


test("exact root-index cache survives wind uploads and restores main/mirror selections on one reused frustum",()=>{
 const f=fixture(),{view,source}=f,main=frustum(),mirror=frustum(60),shared=main.clone();
 try{
  view.proxy.intersectsFrustum(shared);const mainRoots=roots(view.proxy.geometry),tests=view.stats.indexTests;
  view.proxy.intersectsFrustum(shared);assert.equal(view.stats.indexCacheHits,1);assert.equal(view.stats.indexTests,tests);
  const uploads=view.stats.uploads;source.geometry.attributes.aTreeRootWind.data.array[2]+=.123;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;
  view.proxy.intersectsFrustum(shared);assert.equal(view.stats.indexCacheHits,2);assert.equal(view.stats.indexTests,tests);assert.equal(view.stats.uploads,uploads+1);assert.deepEqual(roots(view.proxy.geometry),mainRoots);
  shared.copy(mirror);view.proxy.intersectsFrustum(shared);const mirrorRoots=roots(view.proxy.geometry);assert.notDeepEqual(mirrorRoots,mainRoots);assert.equal(view.stats.indexCacheMisses,2);
  shared.copy(main);view.proxy.intersectsFrustum(shared);assert.deepEqual(roots(view.proxy.geometry),mainRoots);assert.equal(view.stats.indexCacheHits,3);
  shared.copy(mirror);view.proxy.intersectsFrustum(shared);assert.deepEqual(roots(view.proxy.geometry),mirrorRoots);assert.equal(view.stats.indexCacheHits,4);
  shared.planes[0].constant+=1e-9;view.proxy.intersectsFrustum(shared);assert.equal(view.stats.indexCacheMisses,3,"exact same-frame plane mutation cannot hit");
  view.indexCache.value=false;const before=view.stats.indexTests;view.proxy.intersectsFrustum(shared);assert.equal(view.stats.indexTests,before+source.count);assert.deepEqual(roots(view.proxy.geometry),mirrorRoots);
 }finally{f.cleanup();}
});

test("root-index cache follows matrices, active count, exact pose and every source-envelope change",()=>{
 let frame=0;const f=fixture({getFrame:()=>++frame}),{view,source}=f,parent=new T.Group(),clip=frustum();parent.add(view.proxy);parent.updateMatrixWorld(true);
 const query=()=>{assert.equal(view.proxy.intersectsFrustum(clip),true);};
 const changed=mutation=>{const misses=view.stats.indexCacheMisses;mutation();query();assert.equal(view.stats.indexCacheMisses,misses+1);query();assert.equal(view.stats.indexCacheMisses,misses+1);};
 try{
  query();query();assert.equal(view.stats.indexCacheMisses,1);
  changed(()=>{source.setMatrixAt(0,new T.Matrix4().makeTranslation(-50,0,-30));source.instanceMatrix.needsUpdate=true;});
  changed(()=>{source.count--;});
  changed(()=>{parent.position.x+=.001;parent.updateMatrixWorld(true);});
  changed(()=>{source.position.z+=.001;});
  for(const edge of["min","max"])for(const axis of["x","y","z"])changed(()=>{source.boundingBox[edge][axis]+=.0001;});
  changed(()=>{source.boundingBox=source.boundingBox.clone();});
  const original=source.boundingBox;changed(()=>{source.boundingBox=null;});changed(()=>{source.boundingBox=original;});
 }finally{f.cleanup();}
});

test("unknown custom box predicates bypass indices cache even when their frustum and visible planes stay equal",()=>{
 const f=fixture(),{view}=f,clip=new T.Frustum();let minimum=45;
 for(const p of clip.planes)p.constant=1000;
 clip.intersectsBox=function(box){return T.Frustum.prototype.intersectsBox.call(this,box)&&box.max.x>=minimum;};
 try{
  view.proxy.intersectsFrustum(clip);assert.deepEqual(roots(view.proxy.geometry),[60,90]);
  minimum=75;view.proxy.intersectsFrustum(clip);assert.deepEqual(roots(view.proxy.geometry),[90]);
  assert.equal(view.stats.indexCacheHits,0);assert.equal(view.stats.indexCacheBypasses,2);
 }finally{f.cleanup();}
});

test("receiver revision invalidates cached roots for camera/mirror domains, filter margin, disabling and predicate restoration",()=>{
 const f=fixture(),{view,source}=f,light=new T.DirectionalLight();light.position.set(0,300,0);
 Object.assign(light.shadow.camera,{left:-200,right:200,top:200,bottom:-200,near:1,far:1000});light.shadow.camera.updateProjectionMatrix();light.updateMatrixWorld();light.target.updateMatrixWorld();light.shadow.updateMatrices(light);
 const clip=light.shadow.getFrustum(),c=new T.PerspectiveCamera(52,1.78,.25,500),sun=new T.Vector3(1,1,0).normalize();
 c.position.set(0,6,0);c.lookAt(0,6,-30);c.updateMatrixWorld();const originalCamera=c.clone();
 const filter=new SunShadowReceiverCulling([light]);
 const query=()=>{assert.equal(view.proxy.intersectsFrustum(clip),true);return roots(view.proxy.geometry);};
 try{
  filter.update(c,sun);const initial=query();assert.ok(initial.length<source.count);const key=clip.intersectsBox.treeViewCullState,revision=key.revision;
  filter.update(c,sun);query();assert.equal(key.revision,revision);assert.equal(view.stats.indexCacheHits,1);
  c.position.x=60;c.lookAt(60,6,-30);c.updateMatrixWorld();filter.update(c,sun);const moved=query();assert.notDeepEqual(moved,initial);assert.equal(view.stats.indexCacheMisses,2);
  light.shadow.radius+=2;filter.update(c,sun);query();assert.equal(view.stats.indexCacheMisses,3);
  filter.update(c,sun,{additionalCameras:[originalCamera]});const union=query();assert.ok(union.length>moved.length);assert.equal(view.stats.indexCacheMisses,4);
  filter.update(c,sun,{additionalCameras:[originalCamera.clone()]});query();assert.equal(view.stats.indexCacheHits,2);
  filter.stats.cascades[0].margin+=.001;query();assert.equal(view.stats.indexCacheMisses,5,"the live margin also guards a diagnostic in-place edit");
  filter.enabled=false;filter.update(c,sun);assert.equal(query().length,source.count);assert.equal(view.stats.indexCacheMisses,6);
  filter.dispose();assert.equal(query().length,source.count);assert.equal(view.stats.indexCacheMisses,7);
 }finally{filter.dispose();f.cleanup();}
});

test("wind-only view reuse preserves queued same-frame draws and uploads new forces through real Three object caches after recycling",()=>{
 let frame=10;const f=fixture({getFrame:()=>frame}),{source,view}=f,clip=frustum(),scene=new T.Scene(),lists=WebGLRenderLists(),list=lists.get(scene,0);
 const uploaded=[],info={render:{frame},memory:{geometries:0}},attributes={update:a=>uploaded.push(a),remove:()=>{}},geometries=WebGLGeometries({ARRAY_BUFFER:1},attributes,info,{releaseStatesOfGeometry:()=>{}}),objects=WebGLObjects({ARRAY_BUFFER:1},geometries,attributes,{releaseStatesOfObject:()=>{}},info);
 const changeWind=()=>{source.geometry.attributes.aTreeRootWind.data.array[12]+=.08;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;};
 try{
  view.proxy.intersectsFrustum(clip);const first=objects.update(view.proxy),matrix=first.attributes.instanceMatrix.array.slice(),force=first.attributes.aTreeRootWind.data.array.slice(),matrixVersion=first.attributes.instanceMatrix.version;
  list.push(view.proxy,first,view.proxy.material,0,0,null,{reversedDepth:false});
  changeWind();view.proxy.intersectsFrustum(clip);const sameFrame=objects.update(view.proxy);assert.notStrictEqual(sameFrame,first);
  assert.strictEqual(list.opaque[0].geometry,first);assert.deepEqual(first.attributes.instanceMatrix.array,matrix);assert.deepEqual(first.attributes.aTreeRootWind.data.array,force);
  frame=11;info.render.frame=frame;changeWind();view.proxy.intersectsFrustum(clip);const next=objects.update(view.proxy);assert.notStrictEqual(next,first);assert.notStrictEqual(next,sameFrame,'previous frame cannot be overwritten');
  const before=view.stats.matrixCopies,forces=view.stats.forceCopies;
  frame=12;info.render.frame=frame;changeWind();view.proxy.intersectsFrustum(clip);const recycled=objects.update(view.proxy);
  assert.strictEqual(recycled,first,'an unreferenced older exact layout is recycled');assert.equal(view.stats.matrixCopies,before);assert.equal(view.stats.forceCopies,forces+1);assert.equal(view.stats.layoutReuses,1);
  assert.equal(recycled.attributes.instanceMatrix.version,matrixVersion);assert.deepEqual(recycled.attributes.instanceMatrix.array,matrix);assert.notDeepEqual(recycled.attributes.aTreeRootWind.data.array,force);
  assert.ok(uploaded.includes(recycled.attributes.aTreeRootWind),'installed Three updates recycled geometry in the new frame');
  for(let j=0;j<recycled.instanceCount;j++){const i=(roots(recycled)[j]+60)/30;for(let k=0;k<5;k++)assert.equal(recycled.attributes.aTreeRootWind.data.array[j*5+k],source.geometry.attributes.aTreeRootWind.data.array[i*5+k]);}
 }finally{f.cleanup();objects.dispose();lists.dispose();}
});

test("after hooks lazily restore logical full identity while disabled and capacity fallback synchronize every force",()=>{
 let frame=20;const enabled={value:true},f=fixture({enabled,getFrame:()=>frame}),{source,view}=f,clip=frustum(),full=view.proxy.geometry,initial=full.attributes.aTreeRootWind.data.array.slice(),initialVersion=full.attributes.aTreeRootWind.data.version;
 const change=()=>{source.geometry.attributes.aTreeRootWind.data.array[0]+=.17;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;};
 try{
  change();view.proxy.intersectsFrustum(clip);const selected=view.proxy.geometry;view.proxy.onAfterRender({},null,null,selected,view.proxy.material,null);
  assert.strictEqual(view.proxy.geometry,full);assert.equal(full.instanceCount,source.count);assert.deepEqual(full.attributes.aTreeRootWind.data.array,initial);assert.equal(full.attributes.aTreeRootWind.data.version,initialVersion,'no unused full wind upload after compact draw');
  assert.equal(view.proxy.intersectsFrustum({intersectsBox:()=>false}),false);assert.equal(full.attributes.aTreeRootWind.data.version,initialVersion,'rejected non-draw also needs no full wind copy');
  enabled.value=false;view.proxy.intersectsFrustum(clip);assert.strictEqual(view.proxy.geometry,full);
  assert.deepEqual(full.attributes.aTreeRootWind.data.array.subarray(0,source.count*5),source.geometry.attributes.aTreeRootWind.data.array.subarray(0,source.count*5));assert.ok(full.attributes.aTreeRootWind.data.version>initialVersion);
  enabled.value=true;change();for(let i=0;i<30;i++)view.proxy.intersectsFrustum(frustum());
  assert.ok(view.stats.capacityFallbacks>0);assert.strictEqual(view.proxy.geometry,full);assert.deepEqual(full.attributes.aTreeRootWind.data.array.subarray(0,source.count*5),source.geometry.attributes.aTreeRootWind.data.array.subarray(0,source.count*5));
 }finally{f.cleanup();}
});

test("reuse AB changes only copies: animated stable layouts retain identical root matrices and all wind components",()=>{
 let frame=0;const old=fixture({getFrame:()=>frame,reuseBuffers:false}),current=fixture({getFrame:()=>frame,reuseBuffers:true}),a=frustum(),b=frustum();
 try{
  for(frame=0;frame<14;frame++){
   for(const f of [old,current]){const forces=f.source.geometry.attributes.aTreeRootWind.data;for(let i=0;i<forces.array.length;i++)forces.array[i]=Math.sin(frame*.3+i*.7);forces.needsUpdate=true;}
   old.view.proxy.intersectsFrustum(a);current.view.proxy.intersectsFrustum(b);
   const x=old.view.proxy.geometry,y=current.view.proxy.geometry;assert.equal(x.instanceCount,y.instanceCount);assert.deepEqual(x.attributes.instanceMatrix.array,y.attributes.instanceMatrix.array);assert.deepEqual(x.attributes.aTreeRootWind.data.array,y.attributes.aTreeRootWind.data.array);
   old.view.proxy.onAfterRender({},null,null,x,old.view.proxy.material,null);current.view.proxy.onAfterRender({},null,null,y,current.view.proxy.material,null);
  }
  assert.equal(old.view.stats.matrixCopies,14);assert.equal(current.view.stats.matrixCopies,2);assert.equal(current.view.stats.forceCopies,14);assert.equal(current.view.stats.fullForceCopies,1);assert.equal(old.view.stats.fullForceCopies,15);
 }finally{old.cleanup();current.cleanup();}
});

test('installed renderer counts render calls, and dormant shadow view survives a new reflection allocation below capacity',async()=>{
 const {readFileSync}=await import('node:fs');
 const rendererSource=readFileSync(new URL('../../node_modules/three/src/renderers/WebGLRenderer.js',import.meta.url),'utf8'),shadowSource=readFileSync(new URL('../../node_modules/three/src/renderers/webgl/WebGLShadowMap.js',import.meta.url),'utf8');
 const project=rendererSource.indexOf('projectObject( scene, camera, 0, _this.sortObjects );'),increment=rendererSource.indexOf('this.info.render.frame ++;'),shadowDraw=rendererSource.indexOf('shadowMap.render( shadowsArray, scene, camera );');
 assert.ok(project<increment&&increment<shadowDraw);assert.doesNotMatch(shadowSource,/render\.frame\s*\+\+/);
 let frame=1;const f=fixture({getFrame:()=>frame}),{source,view}=f,shadow=frustum(60),main=frustum();
 try{
  view.proxy.intersectsFrustum(shadow);const originalShadow=view.proxy.geometry,originalMatrices=originalShadow.attributes.instanceMatrix.array.slice(),matrixVersion=originalShadow.attributes.instanceMatrix.version;
  // A dormant cascade may skip several native renders (main, HDR output,
  // reflection), while a newly needed main/mirror view requests a slot.
  frame=9;view.proxy.intersectsFrustum(main);
  frame=10;source.geometry.attributes.aTreeRootWind.data.array[0]+=.1;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;
  const copies=view.stats.matrixCopies;view.proxy.intersectsFrustum(shadow);
  assert.strictEqual(view.proxy.geometry,originalShadow,'new unrelated view must not retire a reusable dormant cascade');
  assert.equal(view.stats.matrixCopies,copies,'dormant exact matrix layout remains reusable');
  assert.equal(view.stats.viewAllocations,2);assert.equal(view.stats.viewRetirements,0);
  assert.equal(originalShadow.attributes.instanceMatrix.version,matrixVersion);assert.deepEqual(originalShadow.attributes.instanceMatrix.array,originalMatrices);
 }finally{f.cleanup();}
});

test('cross-pass record sharing is off by default and reuses only exact immutable data when enabled',()=>{
 for(const sharing of [false,true]){
  const f=fixture(sharing?{sharePassRecords:true}:{}),a=frustum(),b=frustum(.05);
  try{
   f.view.proxy.intersectsFrustum(a);const first=f.view.proxy.geometry;
   f.view.proxy.intersectsFrustum(b);const second=f.view.proxy.geometry;
   assert.deepEqual(roots(first),roots(second),'slightly different planes select the same ordered root set');
   assert.equal(first===second,sharing);assert.equal(f.view.stats.passShareEnabled,sharing);
   assert.equal(f.view.stats.forceCopies,sharing?1:2);assert.equal(f.view.stats.passShareHits,sharing?1:0);
   assert.strictEqual(first.attributes.position,f.source.geometry.attributes.position);
   assert.strictEqual(second.index,f.source.geometry.index);
  }finally{f.cleanup();}
 }
});

test('cross-pass sharing preserves queued main data through different sets and same-frame wind or matrix revisions',()=>{
 let frame=10;const f=fixture({sharePassRecords:true,getFrame:()=>frame}),{source,view}=f;
 const scene=new T.Scene(),lists=WebGLRenderLists(),list=lists.get(scene,0),uploaded=[];
 const info={render:{frame},memory:{geometries:0}},attributes={update:a=>uploaded.push(a),remove:()=>{}};
 const geometries=WebGLGeometries({ARRAY_BUFFER:1},attributes,info,{releaseStatesOfGeometry:()=>{}});
 const objects=WebGLObjects({ARRAY_BUFFER:1},geometries,attributes,{releaseStatesOfObject:()=>{}},info);
 try{
  view.proxy.intersectsFrustum(frustum());const main=objects.update(view.proxy),matrices=main.attributes.instanceMatrix.array.slice(),forces=main.attributes.aTreeRootWind.data.array.slice();
  list.push(view.proxy,main,view.proxy.material,0,0,null,{reversedDepth:false});
  const uploads=uploaded.length;view.proxy.intersectsFrustum(frustum(.05));
  assert.strictEqual(objects.update(view.proxy),main);assert.equal(uploaded.length,uploads,'Three uploads a shared geometry only once in this render frame');
  view.proxy.intersectsFrustum(frustum(60));const shadow=objects.update(view.proxy);
  assert.notStrictEqual(shadow,main);assert.notDeepEqual(roots(shadow),roots(main));
  source.geometry.attributes.aTreeRootWind.data.array[12]+=.17;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;
  view.proxy.intersectsFrustum(frustum());const newWind=objects.update(view.proxy);assert.notStrictEqual(newWind,main);
  source.instanceMatrix.needsUpdate=true;view.proxy.intersectsFrustum(frustum());const newMatrix=objects.update(view.proxy);
  assert.notStrictEqual(newMatrix,newWind,'even an equal-valued new matrix revision is not an immutable cache hit');
  assert.strictEqual(list.opaque[0].geometry,main);assert.deepEqual(main.attributes.instanceMatrix.array,matrices);assert.deepEqual(main.attributes.aTreeRootWind.data.array,forces);
  frame++;info.render.frame=frame;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;view.proxy.intersectsFrustum(frustum());
  assert.notStrictEqual(view.proxy.geometry,main);assert.notStrictEqual(view.proxy.geometry,newWind);assert.notStrictEqual(view.proxy.geometry,newMatrix,'previous render frame remains protected');
 }finally{f.cleanup();objects.dispose();lists.dispose();}
});

test('shared records recycle after the original guard and copy identical forces once per wind version',()=>{
 let frame=0;const baseline=fixture({getFrame:()=>frame}),candidate=fixture({sharePassRecords:true,getFrame:()=>frame});
 const clips=[frustum(),frustum(.05),frustum(-.05)],first=[];
 try{
  for(frame=0;frame<8;frame++){
   for(const f of [baseline,candidate]){const data=f.source.geometry.attributes.aTreeRootWind.data;for(let i=0;i<data.array.length;i++)data.array[i]=Math.sin(frame*.3+i*.7);data.needsUpdate=true;}
   const copies=candidate.view.stats.forceCopies;let selected;
   for(const clip of clips){
    baseline.view.proxy.intersectsFrustum(clip);candidate.view.proxy.intersectsFrustum(clip);
    const a=baseline.view.proxy.geometry,b=candidate.view.proxy.geometry;
    assert.equal(a.instanceCount,b.instanceCount);assert.deepEqual(a.attributes.instanceMatrix.array,b.attributes.instanceMatrix.array);assert.deepEqual(a.attributes.aTreeRootWind.data.array,b.attributes.aTreeRootWind.data.array);
    if(selected)assert.strictEqual(b,selected);selected=b;
   }
   assert.equal(candidate.view.stats.forceCopies,copies+1);
   if(frame<2)first.push(selected);else assert.strictEqual(selected,first[frame%2]);
  }
  assert.equal(candidate.view.stats.viewAllocations,2);assert.equal(candidate.view.stats.matrixCopies,2);
  assert.equal(candidate.view.stats.forceCopies,8);assert.equal(baseline.view.stats.forceCopies,24);
 }finally{baseline.cleanup();candidate.cleanup();}
});

test('record referenced by several view lists retires and disposes exactly once',()=>{
 let frame=10;const f=fixture({sharePassRecords:true,getFrame:()=>frame}),{source,view}=f;
 const retired=new Map();
 try{
  view.proxy.intersectsFrustum(frustum());const shared=view.proxy.geometry;
  shared.addEventListener('dispose',()=>retired.set(shared,(retired.get(shared)||0)+1));
  view.proxy.intersectsFrustum(frustum(.05));assert.strictEqual(view.proxy.geometry,shared);
  for(let i=0;i<23;i++){
   source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;view.proxy.intersectsFrustum(frustum());
   const g=view.proxy.geometry;g.addEventListener('dispose',()=>retired.set(g,(retired.get(g)||0)+1));
  }
  assert.equal(view.stats.viewAllocations,24);
  frame=14;source.geometry.attributes.aTreeRootWind.data.needsUpdate=true;view.proxy.intersectsFrustum(frustum());
  assert.equal(view.stats.viewRetirements,24);assert.equal(retired.size,24);assert.ok([...retired.values()].every(n=>n===1));
  view.dispose();view.dispose();assert.ok([...retired.values()].every(n=>n===1),'shared aliases never become additional disposal owners');
  assert.ok(source.geometry.attributes.position.array.length);assert.ok(source.geometry.attributes.aTreeRootWind.data.array.length);
 }finally{f.cleanup();}
});
