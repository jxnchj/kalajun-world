import {countColumnMesh42} from '../../../web/src/v2/shadow-column-audit42.js';
import * as T from '../../../web/node_modules/three/build/three.module.js';
import {createCoverageSourceDepth42,setCoverageCamera42} from '../../../web/src/v2/shadow-window-coverage42.js';
import {createCoverageTarget41} from '../../../web/src/v2/grass-shadow-coverage41.js';
import {captureWindowTarget42} from '../../../web/src/v2/shadow-window-target42.js';
import {selectWholeRoots42} from '../../../web/src/v2/shadow-window-geometry42.js';
import {compareFullCoverage42} from '../../../web/src/v2/shadow-window-reference42.js';
function cloneDraw(source,material){
 const clone=source.clone(false);clone.material=material;clone.matrixAutoUpdate=false;clone.matrixWorldAutoUpdate=false;clone.matrix.copy(source.matrixWorld);clone.matrixWorld.copy(source.matrixWorld);clone.frustumCulled=false;clone.castShadow=clone.receiveShadow=false;clone.morphTargetInfluences=source.morphTargetInfluences;
 if(source.isInstancedMesh){clone.instanceMatrix=source.instanceMatrix;clone.instanceColor=source.instanceColor;clone.morphTexture=source.morphTexture;clone.count=source.count;}
 if(source.isSkinnedMesh){clone.skeleton=source.skeleton;clone.bindMatrix.copy(source.bindMatrix);clone.bindMatrixInverse.copy(source.bindMatrixInverse);}
 return clone;
}
function difference(a,b){let pixels=0,max=0,sum=0,fullCovered=0,selectedCovered=0;for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i]);if(delta)pixels++;max=Math.max(max,delta);sum+=delta;fullCovered+=255-a[i];selectedCovered+=255-b[i];}return{pixels,max,sum,fullCovered,selectedCovered};}
export function sourceBatch58(app,sources,{withReceivers=false,rootIdentityTest=false,stableDepthOrder=false}={}){
 const d=app.debug,c=d.localShadowWindow42.controller,r=d.renderer,hold=d.setReviewHold(true),restoreTarget=captureWindowTarget42(r),saved={clear:r.getClearColor(new T.Color()),alpha:r.getClearAlpha(),auto:r.autoClear,shadow:r.shadowMap.enabled,shadowRender:r.shadowMap.render,reset:r.info.autoReset};let target=null;const materials=[],scenes=[],ownedViews=[];
 try{
  if(c.pending||!c.owner?.stats.ready||c.owner.valid())throw Error('Source oracle requires a ready current owner');
  d.renderFrozenWorld();const owner=c.owner;if(c.pending||owner.valid()||!owner.stats.ready)throw Error('Source changed at native refresh');
  const revision=owner.sourceRevision,wind=d.ecology.uniforms.uWindTime.value,global=compareFullCoverage42(owner),terrain=new Set(d.terrain.materials||[d.terrain.material]);
  target=createCoverageTarget41(owner.size,4);const a=new Uint8Array(owner.size*owner.size*4),b=new Uint8Array(a.length),mismatches=[],skipped=[],rootIdentity=[];
  r.shadowMap.enabled=false;r.shadowMap.render=()=>{};r.autoClear=true;r.info.autoReset=false;r.setClearColor(0xffffff,1);
  const draw=(scene,bytes)=>{if(stableDepthOrder)scene.traverse(m=>{if(m.isMesh)m.renderOrder=receiverMaterials.some(v=>v.material===m.material)?-1:1;});const before={...r.info.render};r.setRenderTarget(target);r.render(scene,owner.camera);r.readRenderTargetPixels(target,0,0,owner.size,owner.size,bytes);return{calls:r.info.render.calls-before.calls,triangles:r.info.render.triangles-before.triangles};};
  const receiverMaterials=withReceivers?owner.registry.filter(s=>terrain.has(s.material)).map(source=>{const material=createCoverageSourceDepth42(source,'receiver',null,owner.budget.drawStates?.get(source));setCoverageCamera42(material,owner.camera);materials.push(material);return{source,material};}):[];
  for(const source of sources){
   if(!owner.registry.includes(source)){skipped.push({id:source.id,name:source.name,reason:'not-current-native-source'});continue;}
   if(terrain.has(source.material)){skipped.push({id:source.id,name:source.name,reason:'white-receiver-not-isolated-caster'});continue;}
   const material=createCoverageSourceDepth42(source,'caster',null,owner.budget.drawStates?.get(source));setCoverageCamera42(material,owner.camera);materials.push(material);
   const full=new T.Scene(),selected=new T.Scene();scenes.push(full,selected);full.add(cloneDraw(source,material));
   for(const receiver of receiverMaterials){full.add(cloneDraw(receiver.source,receiver.material));selected.add(cloneDraw(receiver.source,receiver.material));}
   const views=owner.views.filter(v=>v.source===source&&v._plan?.kind==='caster');
   const parents=views.map(v=>v.mesh.parent);for(const v of views)selected.add(cloneDraw(v.mesh,v.mesh.material));
   const fullDraw=draw(full,a),selectedDraw=draw(selected,b),diff=difference(a,b);
   if(rootIdentityTest&&source.isInstancedMesh){
    const roots=Array.from({length:source.count},(_,i)=>i),identity={id:source.id,name:source.name,roots:source.count,selectedAgainstNative:diff};
    for(const address of [null,'root']){
     const m=createCoverageSourceDepth42(source,'caster',address,owner.budget.drawStates?.get(source));setCoverageCamera42(m,owner.camera);materials.push(m);
     const view=selectWholeRoots42(source,roots,m);ownedViews.push(view);const identityScene=new T.Scene();scenes.push(identityScene);identityScene.add(view.mesh);
     for(const receiver of receiverMaterials)identityScene.add(cloneDraw(receiver.source,receiver.material));
     const bytes=new Uint8Array(a.length),counts=draw(identityScene,bytes);identity[address?'allRootsAddressShader':'allRootsOriginalShader']={...counts,againstNative:difference(a,bytes),againstSelected:difference(b,bytes)};identityScene.clear();
    }
    rootIdentity.push(identity);
   }
   if(views.some((v,i)=>v.mesh.parent!==parents[i]))throw Error('Original selected view parent changed');
   if(diff.pixels)mismatches.push({id:source.id,name:source.name,type:source.type,geometryId:source.geometry.id,instances:source.count??1,drawRange:{...source.geometry.drawRange},selectedViews:views.length,selectedPlans:views.map(v=>({tag:v._plan.tag,address:v._plan.address,shape:v._plan.shape?.slice(0,24),shapeCount:v._plan.shape?.length})),fullDraw,selectedDraw,...diff});
   full.clear();selected.clear();
  }
  return{revision,wind,global,withReceivers,stableDepthOrder,checked:sources.length,skipped,mismatches,rootIdentity};
 }finally{
  for(const scene of scenes)scene.clear();for(const view of ownedViews)view.dispose();for(const material of materials)material.dispose();target?.dispose();restoreTarget();r.setClearColor(saved.clear,saved.alpha);r.autoClear=saved.auto;r.shadowMap.enabled=saved.shadow;r.shadowMap.render=saved.shadowRender;r.info.autoReset=saved.reset;d.setReviewHold(hold);
 }
}
export async function diagnoseShadowSources58(app,{name='shadow58-source-oracle',batchSize=8,withReceivers=false,onProgress=()=>{}}={}){
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>8)throw Error('Batch size must be 1–8');
 const c=app.debug.localShadowWindow42.controller;if(!c?.owner)throw Error('No owner');
 const sources=c.owner.registry.slice(),result={scope:withReceivers?'Each caster plus all original receiver geometry, same-wind depth occlusion; global oracle retained per batch.':'Per-source silhouette difference is diagnostic, not by itself proof of global visible omission; each batch also records actual full-global oracle at the same wind.',batches:[],mismatches:[],sourceCount:sources.length};
 for(let i=0;i<sources.length;i+=batchSize){
  await new Promise(requestAnimationFrame);if(app.debug.localShadowWindow42.controller!==c)throw Error('Destination changed; abort source oracle');
  const batch=sourceBatch58(app,sources.slice(i,i+batchSize),{withReceivers});result.batches.push({start:i,...batch,mismatches:undefined});result.mismatches.push(...batch.mismatches);onProgress({done:Math.min(i+batchSize,sources.length),total:sources.length,mismatches:result.mismatches.length});
 }
 const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});if(!response.ok)throw Error('Evidence save HTTP '+response.status);return result;
}
// Three combinations isolate receiver selection from caster depth semantics.
// Comparisons share one native refresh, one camera and one synchronous wind time.
export function classifyShadowSources58(app,{stableDepthOrder=false}={}){
 const d=app.debug,c=d.localShadowWindow42.controller,r=d.renderer,hold=d.setReviewHold(true),restoreTarget=captureWindowTarget42(r),saved={clear:r.getClearColor(new T.Color()),alpha:r.getClearAlpha(),auto:r.autoClear,shadow:r.shadowMap.enabled,shadowRender:r.shadowMap.render,reset:r.info.autoReset};let target=null;const materials=[],scene=new T.Scene();
 try{
  if(c.pending||!c.owner?.stats.ready||c.owner.valid())throw Error('Current owner not ready');d.renderFrozenWorld();const owner=c.owner;
  if(c.pending||owner.valid()||!owner.stats.ready)throw Error('Source changed at native refresh');
  const terrain=new Set(d.terrain.materials||[d.terrain.material]),fullCasters=[],fullReceivers=[],selectedCasters=[],selectedReceivers=[];
  for(const source of owner.registry){const receiver=terrain.has(source.material),m=createCoverageSourceDepth42(source,receiver?'receiver':'caster',null,owner.budget.drawStates?.get(source));setCoverageCamera42(m,owner.camera);materials.push(m);(receiver?fullReceivers:fullCasters).push(cloneDraw(source,m));}
  for(const v of owner.views){if(v._plan?.kind==='reference')continue;(v._plan?.kind==='receiver'?selectedReceivers:selectedCasters).push(cloneDraw(v.mesh,v.mesh.material));}
  const originalParents=owner.views.map(v=>v.mesh.parent),current=new Uint8Array(owner.size*owner.size*4);r.readRenderTargetPixels(owner.mask,0,0,owner.size,owner.size,current);target=createCoverageTarget41(owner.size,4);
  r.shadowMap.enabled=false;r.shadowMap.render=()=>{};r.autoClear=true;r.info.autoReset=false;r.setClearColor(0xffffff,1);
  const capture=(casters,receivers)=>{scene.clear();if(stableDepthOrder){for(const m of casters)m.renderOrder=1;for(const m of receivers)m.renderOrder=-1;}scene.add(...casters,...receivers);const bytes=new Uint8Array(current.length),before={...r.info.render};r.setRenderTarget(target);r.render(scene,owner.camera);r.readRenderTargetPixels(target,0,0,owner.size,owner.size,bytes);return{bytes,draws:r.info.render.calls-before.calls,triangles:r.info.render.triangles-before.triangles};};
  const full=capture(fullCasters,fullReceivers),receiverSelected=capture(fullCasters,selectedReceivers),casterSelected=capture(selectedCasters,fullReceivers);
  if(owner.views.some((v,i)=>v.mesh.parent!==originalParents[i]))throw Error('Original view parent changed');
  const against=row=>({draws:row.draws,triangles:row.triangles,againstCurrent:difference(row.bytes,current),againstFull:difference(row.bytes,full.bytes)});
  return{stableDepthOrder,at:performance.now(),wind:d.ecology.uniforms.uWindTime.value,revision:owner.sourceRevision,counts:{fullCasters:fullCasters.length,fullReceivers:fullReceivers.length,selectedCasters:selectedCasters.length,selectedReceivers:selectedReceivers.length},full:against(full),fullCastersSelectedReceivers:against(receiverSelected),selectedCastersFullReceivers:against(casterSelected)};
 }finally{scene.clear();for(const m of materials)m.dispose();target?.dispose();restoreTarget();r.setClearColor(saved.clear,saved.alpha);r.autoClear=saved.auto;r.shadowMap.enabled=saved.shadow;r.shadowMap.render=saved.shadowRender;r.info.autoReset=saved.reset;d.setReviewHold(hold);}
}

// Read-only exact inputs for offline root-envelope proof; no rendering or hold.
export function exportRootEnvelope58(app,sourceIds){
 const c=app.debug.localShadowWindow42.controller,o=c.owner;if(!o||o.valid())throw Error('Current owner required');
 return{revision:o.sourceRevision,budget:{anchor:o.budget.anchor,basis:o.budget.basis,sizes:o.budget.sizes},anchor:o.anchor,camera:{matrixWorld:o.camera.matrixWorld.toArray(),projection:o.camera.projectionMatrix.toArray()},sun:app.debug.environment.sun.toArray(),sources:sourceIds.map(id=>{
  const s=o.registry.find(s=>s.id===id);if(!s)throw Error('Missing source '+id);const options={basis:o.budget.basis,anchor:o.budget.anchor,sizes:o.budget.sizes,wholeRoots:true,collect:true};
  const fresh=countColumnMesh42(s,{...options,boundsCache:new WeakMap()}),selected=o.views.filter(v=>v.source===s).flatMap(v=>v._plan.shape);
  const attributes=Object.fromEntries(Object.entries(s.geometry.attributes).map(([name,a])=>[name,{itemSize:a.itemSize,normalized:a.normalized,divisor:a.meshPerAttribute??a.data?.meshPerAttribute??0,array:Array.from(a.isInterleavedBufferAttribute?a.data.array:a.array),offset:a.offset??0,stride:a.data?.stride??a.itemSize}]));
  return{id:s.id,name:s.name,count:s.count,matrixWorld:s.matrixWorld.toArray(),instanceMatrix:Array.from(s.instanceMatrix.array),instanceVersion:s.instanceMatrix.version,instanceDivisor:s.instanceMatrix.meshPerAttribute,attributes,index:s.geometry.index?Array.from(s.geometry.index.array):null,drawRange:s.geometry.drawRange,depthKey:s.customDepthMaterial.customProgramCacheKey(),selected,freshSelected:fresh.records.map(r=>r.root),freshCounts:fresh.kept};
 })};
}
