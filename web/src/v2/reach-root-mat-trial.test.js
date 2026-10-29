import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ReachRootMatTrial,reachRootMatTrialEnabled,createRootMatBankMapper,projectRootMatSource} from './reach-root-mat-trial.js';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const on='?reachBankDesign50=root-pool&reachRootMat=1';
const raw=readFileSync(new URL('../../public/assets/v2/shore/root-mat-trial/root-mat-section.glb',import.meta.url));
const sourceRoot=new URL('../../../assets/src/v2/shore/root-mat-section-candidate/',import.meta.url);
const sourceBuffer=()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const decode=()=>new GLTFLoader().parseAsync(sourceBuffer(),'');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const response=()=>Promise.resolve(new Response(raw));
let world;
function actual(){
 if(!world){const previous=globalThis.location;try{globalThis.location={search:'?reachBankDesign50=root-pool'};world=actualForestWorld(undefined,'rgba');}finally{globalThis.location=previous;}}
 return world;
}
function track(scene){const counts={geometry:0,material:0};scene.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>counts.geometry++);o.material.addEventListener('dispose',()=>counts.material++);}});return counts;}

test('trial is OFF unless both exact authored design and explicit opt-in are present; OFF allocates no meshes/fetch',async()=>{
 for(const search of ['', '?reachRootMat=1','?reachBankDesign50=root-pool','?reachBankDesign50=root-pool&reachRootMat=0','?reachBankDesign50=other&reachRootMat=1']){
  assert.equal(reachRootMatTrialEnabled(search),false);let requests=0;
  const trial=new ReachRootMatTrial({}, {search,fetchImpl:()=>{requests++;throw Error('must not fetch');}});
  await trial.load();assert.equal(requests,0);assert.equal(trial.group.children.length,0);assert.deepEqual(trial.materials,[]);assert.equal(trial.stats.status,'off');trial.dispose();trial.dispose();
 }
 assert.equal(reachRootMatTrialEnabled(on),true);
});

test('enabled trial fails visibly for a mismatched actual world, before asset I/O',async()=>{
 let requests=0;const trial=new ReachRootMatTrial({}, {search:on,fetchImpl:()=>{requests++;}});
 await assert.rejects(trial.load(),/actual root-pool/);assert.equal(requests,0);assert.equal(trial.stats.status,'error');trial.dispose();
});

test('original source GLB is copied exactly, and original solid source signed projection is consistent',async()=>{
 assert.deepEqual(raw,readFileSync(new URL('exports/root-mat-section.glb',sourceRoot)));
 const {scene}=await decode();scene.updateMatrixWorld(true);let count=0,maxTangential=0;
 scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld),q=projectRootMatSource(v);
  maxTangential=Math.max(maxTangential,v.distanceTo(q.base.clone().addScaledVector(q.normal,q.distance)));count++;
 }o.geometry.dispose();o.material.dispose();});
 assert.equal(count,10374);assert.ok(maxTangential<1e-10);
});

test('actual bank fit preserves all geometry and burial signs; independently checks every vertex and every editable root end',async()=>{
 const w=actual(),entitiesBefore=JSON.stringify(w.entities),treeBefore=JSON.stringify(FOREST_REACH39_SOURCE.trees);
 const preservedPath=new URL('./generated/forest-reach-cover41-source.json',import.meta.url),preservedBefore=readFileSync(preservedPath);
 assert.equal(JSON.parse(preservedBefore).records.length,521);
 const decoded=await decode(),sourceScene=decoded.scene;sourceScene.updateMatrixWorld(true);
 const originalMeshes=[];sourceScene.traverse(o=>{if(o.isMesh)originalMeshes.push(o);});
 const originals=originalMeshes.map(o=>({positions:o.geometry.attributes.position.array.slice(),index:o.geometry.index.array.slice(),matrix:o.matrixWorld.clone(),material:o.material}));
 const originalsDisposed=track(sourceScene);
 const trial=new ReachRootMatTrial(w,{search:on,fetchImpl:response,loader:{parseAsync:async()=>decoded}});
 await trial.load();assert.deepEqual(originalsDisposed,{geometry:2,material:2});
 assert.equal(trial.group.children.length,2);assert.equal(trial.materials.length,2);assert.equal(trial.stats.triangles,15204);assert.equal(trial.stats.vertices,10374);
 assert.equal(trial.stats.sourceBuriedVertices,5663);assert.equal(trial.stats.fittedBuriedVertices,5663);
 const mapper=createRootMatBankMapper(w);let maxClosestDistanceError=0,minArea=Infinity,maxNormalError=0,checked=0;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3();
 for(let m=0;m<2;m++){
  const mesh=trial.group.children[m],g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,source=originals[m];
  assert.notEqual(g,originalMeshes[m].geometry);assert.deepEqual(originalMeshes[m].geometry.attributes.position.array,source.positions);
  assert.deepEqual(g.index.array,source.index);assert.notEqual(mesh.material,source.material);assert.deepEqual(mesh.material.color,source.material.color);
  assert.equal(mesh.material.roughness,source.material.roughness);assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);
  for(let i=0;i<p.count;i++){
   a.fromArray(source.positions,i*3).applyMatrix4(source.matrix);const before=projectRootMatSource(a);
   b.fromBufferAttribute(p,i).add(trial.group.position);const after=mapper.projectTarget(b);
   const delta=Math.abs(after.distance-before.distance);maxClosestDistanceError=Math.max(maxClosestDistanceError,delta);
   assert.equal(after.distance<0,before.distance<0,'buried/exposed sign changed at vertex '+i);
   maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));checked++;
  }
  for(let i=0;i<g.index.count;i+=3){a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c.fromBufferAttribute(p,g.index.getX(i+2));minArea=Math.min(minArea,b.sub(a).cross(edge.subVectors(c,a)).length());}
 }
 assert.ok(maxClosestDistanceError<.000005,'closest-surface error '+maxClosestDistanceError);
 assert.ok(maxNormalError<1e-6);assert.ok(minArea>1e-14);
 const endpoints=JSON.parse(readFileSync(new URL('./fixtures/root-mat-trial-endpoints.json',import.meta.url)));
 assert.equal(endpoints.sourceSHA256,sha(readFileSync(new URL('root-mat-section.blend',sourceRoot))));
 let checkedTips=0,maxTipSurfaceDistance=-Infinity,minTipWaterClearance=Infinity,minNeckCrestClearance=Infinity;
 for(const row of endpoints.rows){
  const result=mapper.mapSource(new THREE.Vector3().fromArray(row.position));
  if(row.role==='crown')minNeckCrestClearance=Math.min(minNeckCrestClearance,result.crestHeight-result.position.y);
  else if(row.end==='end'){
   const d=mapper.projectTarget(result.position).distance;maxTipSurfaceDistance=Math.max(maxTipSurfaceDistance,d+row.radius);
   minTipWaterClearance=Math.min(minTipWaterClearance,result.position.y-result.waterLevel-row.radius);checkedTips++;
   assert.ok(d+row.radius<0,'terminal root must finish in substrate: '+row.name);
  }
 }
 assert.equal(checkedTips,101);assert.ok(minTipWaterClearance>.02);assert.ok(minNeckCrestClearance>.035);
 assert.equal(JSON.stringify(w.entities),entitiesBefore);assert.equal(JSON.stringify(FOREST_REACH39_SOURCE.trees),treeBefore);
 assert.deepEqual(readFileSync(preservedPath),preservedBefore);
 assert.ok(trial.stats.minTreeDistance>2);assert.ok(trial.stats.minWaterClearance>.02);assert.ok(trial.stats.minCrownClearance>.035);
 trial.group.updateMatrixWorld(true);const fittedBounds=new THREE.Box3().setFromObject(trial.group);
 const report={fittedWorldBounds:{min:fittedBounds.min.toArray(),max:fittedBounds.max.toArray(),size:fittedBounds.getSize(new THREE.Vector3()).toArray()},preservedCoverRecords:521,status:'OFF opt-in trial; actual runtime surface fit verified, browser appearance not yet accepted',assetSHA256:sha(raw),assetBytes:raw.length,checkedVertices:checked,maxClosestDistanceErrorMeters:maxClosestDistanceError,maxRecomputedNormalUnitError:maxNormalError,minTriangleDoubleArea:minArea,
  sourceBuriedRatio:trial.stats.sourceBuriedVertices/checked,fittedBuriedRatio:trial.stats.fittedBuriedVertices/checked,checkedTerminalTips:checkedTips,maxTipSurfaceDistanceIncludingRadius:maxTipSurfaceDistance,minTipWaterClearance,minNeckCrestClearance,
  fit:trial.stats,preservedCoverSourceUnchanged:true,preservedCoverSourceSHA256:sha(preservedBefore),sourceTreesAndEntitiesUnchanged:true,
  limitations:['Morphology is designed, not a measured local root system.','Source substrate is deformed into the actual bank: along-bank positions and signed normal offsets survive, source vertical scale follows the real bank.','15,204 triangles in 2 additional draws when opt-in; all source geometry remains, including buried segments.','No browser visibility, long-distance aliasing, or visual-adoption claim.']};
 if(process.env.ROOT_MAT_TRIAL_REPORT)writeFileSync(process.env.ROOT_MAT_TRIAL_REPORT,JSON.stringify(report,null,2)+'\n');
 const fittedDisposed=track(trial.group);trial.dispose();trial.dispose();assert.deepEqual(fittedDisposed,{geometry:2,material:2});assert.deepEqual(trial.materials,[]);assert.equal(trial.group.children.length,0);
});

test('failed HTTP load exposes the error and can retry without duplicate resources',async()=>{
 let requests=0;const trial=new ReachRootMatTrial(actual(),{search:on,fetchImpl:async()=>++requests===1?new Response('',{status:503}):new Response(raw)});
 await assert.rejects(trial.load(),/HTTP 503/);assert.equal(trial.stats.status,'error');assert.equal(trial.group.children.length,0);
 const a=trial.load(),b=trial.load();assert.equal(a,b);await a;assert.equal(requests,2);assert.equal(trial.stats.status,'ready');trial.dispose();
});

test('bad source contract disposes parsed resources and rejects rather than falling back',async()=>{
 const parsed=await decode();parsed.scene.children[0].userData.detailRole='unexpected';const counts=track(parsed.scene);
 const trial=new ReachRootMatTrial(actual(),{search:on,fetchImpl:response,loader:{parseAsync:async()=>parsed}});
 await assert.rejects(trial.load(),/contract changed/);assert.deepEqual(counts,{geometry:2,material:2});assert.equal(trial.group.children.length,0);assert.equal(trial.stats.status,'error');trial.dispose();
});

test('dispose before load or during fetch aborts; late parser results are also released',async()=>{
 const prior=new ReachRootMatTrial(actual(),{search:on});prior.dispose();await assert.rejects(prior.load(),{name:'AbortError'});
 let signal;const waiting=new ReachRootMatTrial(actual(),{search:on,fetchImpl:(_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});})});
 const pending=waiting.load();waiting.dispose();assert.equal(signal.aborted,true);await assert.rejects(pending,{name:'AbortError'});assert.equal(waiting.stats.status,'disposed');
 const parsed=await decode(),counts=track(parsed.scene);let resolveParse,entered;const entering=new Promise(r=>{entered=r;});
 const late=new ReachRootMatTrial(actual(),{search:on,fetchImpl:response,loader:{parseAsync:()=>{entered();return new Promise(r=>{resolveParse=r;});}}});
 const loading=late.load();await entering;late.dispose();resolveParse(parsed);await assert.rejects(loading,{name:'AbortError'});
 assert.deepEqual(counts,{geometry:2,material:2});assert.equal(late.group.children.length,0);assert.equal(late.stats.status,'disposed');
});

// Browser extensions may wrap fetch and retain its Window receiver contract.
test('default browser fetch keeps its global receiver instead of calling it as a trial method',async()=>{
 const before=globalThis.fetch;let receiver;
 globalThis.fetch=function(){receiver=this;return Promise.resolve(new Response(null,{status:503}));};
 const trial=new ReachRootMatTrial(actual(),{search:on});
 try{await assert.rejects(trial.load(),/HTTP 503/);assert.equal(receiver,globalThis);assert.equal(trial.stats.status,'error');}
 finally{trial.dispose();globalThis.fetch=before;}
});
