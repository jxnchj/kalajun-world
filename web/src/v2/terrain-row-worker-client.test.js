import test from'node:test';import assert from'node:assert/strict';import{TerrainRowWorkerClient}from'./terrain-row-worker-client.js';import{terrainRowBuffers,terrainRowInput}from'./terrain-row-kernel.js';
class FakeWorker{messages=[];terminated=0;postMessage(data,transfers){this.messages.push(structuredClone(data));assert.equal(transfers,undefined,'main-owned inputs must not be detached');if(this.throwPost)throw Error('post failed');}terminate(){this.terminated++;}send(data){this.onmessage?.({data});}}
function fixture(options={}){const w=new FakeWorker(),inputs={coreHeights:new Float32Array([1,2])},c=new TerrainRowWorkerClient(inputs,{makeWorker:()=>w,timeoutMs:1000,...options});return{w,c,inputs};}
function job(){const node={x:0,z:0,size:128,depth:2,parent:null,dead:false,mesh:null},j={node,row:0,positions:new Float32Array(3),heights:new Float64Array(1),indices:new Uint16Array(3),min:Infinity,max:-Infinity};node.job=j;return j;}
const payload=j=>({row:33,positions:j.positions.slice(),heights:j.heights.slice(),indices:j.indices.slice(),min:1,max:2});
test('ready gate, capacity, cached/partial skip and out-of-order completion never reorder jobs',()=>{const{c,w,inputs}=fixture(),a=job(),b=job(),d=job();try{assert.equal(c.enqueue(a),false);w.send({type:'ready'});assert.equal(c.enqueue({...d,cached:{}}),false);d.row=1;assert.equal(c.enqueue(d),false);assert.ok(c.enqueue(a));assert.ok(c.enqueue(b));d.row=0;assert.equal(c.enqueue(d),false);assert.deepEqual([...c.pending.values()].map(p=>p.job),[a,b]);w.send({type:'result',id:2,payload:payload(b),ms:1});assert.equal(a.workerPayload,undefined);assert.equal(b.workerPayload.row,33);assert.equal(a.row,0);w.send({type:'result',id:1,payload:payload(a),ms:2});assert.equal(a.row,0,'client does not advance main-thread queue');assert.equal(c.stats.completed,2);assert.equal(inputs.coreHeights.byteLength,8);}finally{c.dispose();}});
test('dead node, replaced job, already-built tile and advanced local rows discard late results',()=>{for(const change of [j=>j.node.dead=true,j=>j.node.job=job(),j=>j.node.mesh={},j=>j.row=1]){const{c,w}=fixture(),j=job();w.send({type:'ready'});c.enqueue(j);change(j);w.send({type:'result',id:1,payload:payload(j),ms:1});assert.equal(j.workerPayload,undefined);assert.equal(j.workerPending,false);assert.equal(c.stats.discarded,1);assert.equal(c.pending.size,0);c.dispose();}});
test('worker error/post failure/clone failure release every pending job and detach callbacks',()=>{for(const type of ['error','post','clone','malformed']){const{c,w}=fixture(),j=job();w.send({type:'ready'});c.enqueue(j);if(type==='error')w.onerror({message:'bad'});if(type==='post'){w.throwPost=true;c.enqueue(job());}if(type==='clone')w.onmessageerror();if(type==='malformed')w.send({type:'result',id:1,payload:{...payload(j),node:{}},ms:1});assert.ok(c.closed);assert.equal(j.workerPending,false);assert.equal(w.terminated,1);assert.equal(w.onmessage,null);assert.equal(c.pending.size,0);c.dispose();assert.equal(w.terminated,1);}});
test('init and build watchdogs recover without leaving a blocked queue head',async()=>{for(const initialized of [false,true]){const{c,w}=fixture({timeoutMs:10}),j=job();if(initialized){w.send({type:'ready'});c.enqueue(j);}await new Promise(r=>setTimeout(r,25));assert.ok(c.closed);assert.match(c.stats.error,/timeout/);assert.equal(Boolean(j.workerPending),false);assert.equal(w.terminated,1);}});
test('dispose or duplicate result cannot publish late data',()=>{const{c,w}=fixture(),j=job();w.send({type:'ready'});c.enqueue(j);const saved=w.onmessage;c.dispose();saved({data:{type:'result',id:1,payload:payload(j),ms:1}});assert.equal(j.workerPayload,undefined);assert.equal(c.stats.completed,0);});
test('result transfer owns only job output, not authoritative world/parent buffers',()=>{const j=job(),p=payload(j);p.alias=p.positions.subarray(0,1);const list=terrainRowBuffers(p);assert.equal(list.length,3);const result=structuredClone(p,{transfer:list});assert.equal(p.positions.byteLength,0);assert.equal(result.positions.byteLength,12);assert.equal(j.positions.byteLength,12);assert.deepEqual(terrainRowInput(j.node),{x:0,z:0,size:128,depth:2,parent:null});});
import * as THREE from 'three';import {WorldTerrain}from'./terrain.js';
function scheduler(queue){const t=Object.create(WorldTerrain.prototype),finished=[];Object.assign(t,{queue,disposed:false,_activePreparation:0,_elapsed:0,_queueDirty:false,_lastPlan:new THREE.Vector3(),_camera:new THREE.Vector3(),_projection:new THREE.Matrix4(),_frustum:new THREE.Frustum(),stats:{},liveNodes:[],submissionBatches:{restore(){},update(){}},_advanceMorphs(){},_measure(){},_finish(j){finished.push(j);j.node.mesh={};},_buildRow(j){j.row=33;},roots:[]});const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();return{t,camera,finished};}
test('actual terrain update holds queue order on reversed replies and keeps exactly two uploads per frame',()=>{const a=job(),b=job(),d=job(),{c,w}=fixture(),{t,camera,finished}=scheduler([a,b,d]);t.rowWorker=c;w.send({type:'ready'});t.update(camera,0);assert.equal(c.pending.size,2);w.send({type:'result',id:2,payload:payload(b),ms:1});t.update(camera,0);assert.deepEqual(finished,[],'second job cannot upload ahead of pending first');w.send({type:'result',id:1,payload:payload(a),ms:1});t.update(camera,0);assert.deepEqual(finished,[a,b]);assert.equal(t.queue[0],d);assert.ok(d.workerPending);w.send({type:'result',id:3,payload:payload(d),ms:1});t.update(camera,0);assert.deepEqual(finished,[a,b,d]);c.dispose();});
test('actual terrain update preserves cached fast path and resumes local CPU after failed worker',()=>{const a=job(),b=job(),d=job(),{c,w}=fixture(),{t,camera,finished}=scheduler([a,b,d]);t.rowWorker=c;a.cached={};a.row=33;w.send({type:'ready'});t.update(camera,0);assert.equal(finished[0],a);assert.ok(b.workerPending);c.fail('test shutdown');assert.equal(b.workerPending,false);t.update(camera,0);assert.deepEqual(finished,[a,b,d]);});
test('construction failure and synchronous ready do not leak initialization timers',async()=>{const failed=new TerrainRowWorkerClient({}, {makeWorker(){throw Error('worker unavailable');},timeoutMs:10});assert.ok(failed.closed);assert.match(failed.stats.error,/unavailable/);const w=new FakeWorker();w.postMessage=function(data){if(data.type==='init')this.send({type:'ready'});};const c=new TerrainRowWorkerClient({}, {makeWorker:()=>w,timeoutMs:10});await new Promise(r=>setTimeout(r,25));assert.equal(c.ready,true);assert.equal(c.closed,false);c.dispose();});

import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
test('default worker preserves explicit off and rejects all unknown surface variants',()=>{
 assert.deepEqual(terrainRowWorkerPolicy(''),{requested:true,compatible:true,enabled:true});
 assert.equal(terrainRowWorkerPolicy('?view=river-forest&time=870&debug=1&profile=1').enabled,true);
 assert.equal(terrainRowWorkerPolicy('?shadowDepthProfile39=1').enabled,true);
 assert.equal(terrainRowWorkerPolicy('?forestReach39=1&shadowDepthProfile39=1').enabled,false);
 for(const key of ['boardwalkEndGrain39','boardwalkPlantContact39','route3Courtyard38','meadowSourceRange39','farRectGate39','vanityUpperContact39'])assert.equal(terrainRowWorkerPolicy('?'+key+'=1').enabled,true,'non-terrain '+key);
 assert.deepEqual(terrainRowWorkerPolicy('?terrainWorker38=0'),{requested:false,compatible:true,enabled:false});
 for(const key of ['forestReach39','riverMeanders','valleySection','meadowRelief','shoreSampling','futureSurfaceVariant'])assert.deepEqual(terrainRowWorkerPolicy('?terrainWorker38=1&'+key+'=1'),{requested:true,compatible:false,enabled:false});
});

test('explicit preparation yields message turns while worker queue head is pending',async()=>{
 const previous=globalThis.scheduler;globalThis.scheduler={yield:()=>Promise.resolve()};
 try{for(const failure of [false,true]){
  const a=job(),{c,w}=fixture(),{t,camera,finished}=scheduler([a]);t.rowWorker=c;t._prepareToken=0;t.morphs=new Set();t._sortQueue=()=>{t._queueDirty=false;};
  t._measure=()=>{t.stats.queuedTiles=t.queue.length;t.stats.nearQueuedTiles=t.queue.length;};
  const originalPost=w.postMessage.bind(w);w.postMessage=data=>{originalPost(data);if(data.type==='build')setTimeout(()=>failure?c.fail('async worker error'):w.send({type:'result',id:data.id,payload:payload(a),ms:1}),2);};
  w.send({type:'ready'});const result=await t.prepareView(camera,{maxMs:250});
  assert.equal(result.ready,true);assert.deepEqual(finished,[a]);assert.ok(result.iterations<100,'must wait rather than boosted continuation spin');assert.equal(t._activePreparation,0);c.dispose();
 }}finally{if(previous===undefined)delete globalThis.scheduler;else globalThis.scheduler=previous;}
});

test("render-only shadow and needle experiments keep the identical terrain worker source",()=>{
 for(const key of ["nearShadowDetail","closeShadowOverlap","closeShadowFootprint","closeSolarShadow","closeSolarReuse","needleShape40","nearShadowAtlas40","needleBranchDispatch40","roomPastoralDoorAngles41","guestDoors41","pastureLife41","ecologyCollision41","needlePacketWrites41","meadowExact41","meadowVisible41","meadowRootWind41","meadowCluster42","meadowClusterPool42","grassShadowCoverage41","shadowCasterPhases","structureMatrixArithmetic41"]){
  assert.equal(terrainRowWorkerPolicy("?"+key+"=1").enabled,true);
  assert.equal(terrainRowWorkerPolicy("?"+key+"=1&forestReach39=1").enabled,false);
 }
});

test('window4 consumes only completed ordered worker payloads, never a fifth tile',()=>{
 const jobs=Array.from({length:5},job),{t,camera,finished}=scheduler(jobs.slice());t.workerReadyWindow42=true;
 for(const j of jobs)j.workerPayload=payload(j);
 t.update(camera,0);assert.deepEqual(finished,jobs.slice(0,4));assert.equal(t.queue[0],jobs[4]);
 assert.equal(t.stats.workerReadyWindow42.readyPrefix,4);assert.equal(t.stats.workerReadyWindow42.finished,4);assert.equal(t.stats.workerReadyWindow42.extraFinished,2);
 t.update(camera,0);assert.deepEqual(finished,jobs);assert.equal(t.stats.workerReadyWindow42.finished,1);
});
test('window4 preserves CPU/cache two-finish ceiling and never bypasses an unready head',()=>{
 for(const mode of ['cpu','cached','pending','partial']){
  const jobs=Array.from({length:4},job),{t,camera,finished}=scheduler(jobs.slice());t.workerReadyWindow42=true;
  jobs[0].workerPayload=payload(jobs[0]);jobs[1].workerPayload=payload(jobs[1]);jobs[3].workerPayload=payload(jobs[3]);
  if(mode==='cached'){jobs[2].cached={};jobs[2].row=33;}if(mode==='pending')jobs[2].workerPending=true;if(mode==='partial')jobs[2].workerPayload={...payload(jobs[2]),row:32};
  t.update(camera,0);assert.deepEqual(finished,jobs.slice(0,2),mode);assert.equal(t.queue[0],jobs[2]);assert.equal(t.stats.workerReadyWindow42.readyPrefix,2);
 }
});
test('window4 uses real client capacity4 and holds reversed replies until original queue head',()=>{
 const jobs=Array.from({length:5},job),{c,w}=fixture({limit:4}),{t,camera,finished}=scheduler(jobs.slice());t.rowWorker=c;t.workerReadyWindow42=true;
 try{w.send({type:'ready'});t.update(camera,0);assert.equal(c.pending.size,4);
 for(let i=4;i>=2;i--)w.send({type:'result',id:i,payload:payload(jobs[i-1]),ms:1});t.update(camera,0);assert.equal(finished.length,0);
 w.send({type:'result',id:1,payload:payload(jobs[0]),ms:1});t.update(camera,0);assert.deepEqual(finished,jobs.slice(0,4));assert.equal(t.queue[0],jobs[4]);
 }finally{c.dispose();}
});
test('window4 keeps native four-sibling activation and original three-millisecond budget',()=>{
 const jobs=Array.from({length:4},job),{t,camera}=scheduler(jobs.slice()),parent={mesh:{visible:true},wantsSplit:true,children:jobs.map(j=>j.node)};
 t.workerReadyWindow42=true;t._canMorph=()=>false;t._plan=()=>{};
 const visibility=[];t._finish=j=>{j.node.mesh={visible:false};t._activate(parent);visibility.push(parent.mesh.visible);};
 for(const j of jobs)j.workerPayload=payload(j);t.update(camera,0);
 assert.deepEqual(visibility,[true,true,true,false]);assert.ok(parent.children.every(c=>c.mesh.visible));
 const slow=scheduler(Array.from({length:4},()=>{const j=job();j.workerPayload=payload(j);return j;}));slow.t.workerReadyWindow42=true;
 slow.t._finish=j=>{slow.finished.push(j);const until=performance.now()+5;while(performance.now()<until){};};
 slow.t.update(slow.camera,0);assert.equal(slow.finished.length,1,'3ms budget still stops work even with four completed payloads');
});

// Both caches validate source/world bindings and only replace vegetation root
// generation. They never alter height, normal, water or terrain vertex inputs.
test('exact vegetation root caches do not disable the unchanged terrain worker',()=>{
 for(const key of ['meadowRootCache','forestRootCache'])for(const value of ['0','1']){
  const search='?'+key+'='+value;
  assert.equal(terrainRowWorkerPolicy(search).enabled,true);
  assert.equal(terrainRowWorkerPolicy(search+'&terrainWorker38=0').enabled,false);
  assert.equal(terrainRowWorkerPolicy(search+'&forestReach39=1').compatible,false);
  assert.equal(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1').compatible,false);
 }
});

test('bounded guest room lighting does not change worker terrain inputs',()=>{
 for(const value of ['0','1']){const search='?guestRoomGroup42='+value;assert.equal(terrainRowWorkerPolicy(search).enabled,true);assert.equal(terrainRowWorkerPolicy(search+'&terrainWorker38=0').enabled,false);assert.equal(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1').compatible,false);}
});

test('exact wind-only flag preserves worker compatibility but never permits unknown surface variants',()=>{assert.equal(terrainRowWorkerPolicy('?windFieldExact42=1').enabled,true);assert.equal(terrainRowWorkerPolicy('?windFieldExact42=0').enabled,true);assert.equal(terrainRowWorkerPolicy('?windFieldExact42=1&unknownSurface42=1').compatible,false);});
test('aerial visibility policy changes no terrain source and still rejects unknown spatial variants',()=>{assert.equal(terrainRowWorkerPolicy('?meadowAerialContinuity42=1').enabled,true);assert.equal(terrainRowWorkerPolicy('?meadowAerialContinuity42=0').enabled,true);assert.equal(terrainRowWorkerPolicy('?meadowAerialContinuity42=1&unknownSurface42=1').compatible,false);});
test('single shore asset review preserves terrain worker and rejects unrelated terrain parameters',()=>{for(const value of ['0','1']){assert.equal(terrainRowWorkerPolicy('?shoreAsset42='+value).enabled,true);assert.equal(terrainRowWorkerPolicy('?shoreAsset42='+value+'&unknownTerrain=1').compatible,false);}});
test('exact twig indexing preserves terrain Worker for both AB modes without permitting surface variants',()=>{for(const value of ['0','1']){const search='?view=river-forest&time=870&debug=1&profile=1&twigIndexed='+value;assert.deepEqual(terrainRowWorkerPolicy(search),{requested:true,compatible:true,enabled:true});assert.deepEqual(terrainRowWorkerPolicy(search+'&terrainWorker38=0'),{requested:false,compatible:true,enabled:false});assert.deepEqual(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1'),{requested:true,compatible:false,enabled:false});}});

test('local shadow and tree-view render-only switches preserve terrain Worker without accepting unknown variants',()=>{for(const key of ['reachEnvelopeLazy46','localShadowWindow42','treeViewCull','treeViewPassShare42'])for(const value of ['0','1']){const search='?view=river-forest&'+key+'='+value;assert.deepEqual(terrainRowWorkerPolicy(search),{requested:true,compatible:true,enabled:true});assert.deepEqual(terrainRowWorkerPolicy(search+'&terrainWorker38=0'),{requested:false,compatible:true,enabled:false});assert.deepEqual(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1'),{requested:true,compatible:false,enabled:false});}});

test('high-photo native partition is a strict binary render-only Worker parameter',()=>{
 for(const value of ['0','1']){const search='?view=river-forest&treeHighPhoto48='+value;assert.deepEqual(terrainRowWorkerPolicy(search),{requested:true,compatible:true,enabled:true});assert.deepEqual(terrainRowWorkerPolicy(search+'&terrainWorker38=0'),{requested:false,compatible:true,enabled:false});assert.deepEqual(terrainRowWorkerPolicy(search+'&unknownSurface=1'),{requested:true,compatible:false,enabled:false});}
 for(const value of ['', 'true', '2', '01'])assert.equal(terrainRowWorkerPolicy('?treeHighPhoto48='+value).compatible,false);
 assert.equal(terrainRowWorkerPolicy('?treeHighPhoto48=1&treeHighPhoto48=invalid').compatible,false);
});

test('legacy room lazy accepts only explicit binary values without changing terrain policy',()=>{
 for(const value of ['0','1']){const search='?view=river-forest&legacyRoomLazy='+value;assert.deepEqual(terrainRowWorkerPolicy(search),{requested:true,compatible:true,enabled:true});assert.deepEqual(terrainRowWorkerPolicy(search+'&terrainWorker38=0'),{requested:false,compatible:true,enabled:false});assert.deepEqual(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1'),{requested:true,compatible:false,enabled:false});}
 for(const value of ['', 'true', '2', '01'])assert.deepEqual(terrainRowWorkerPolicy('?legacyRoomLazy='+value),{requested:true,compatible:false,enabled:false});
 assert.deepEqual(terrainRowWorkerPolicy('?legacyRoomLazy=1&legacyRoomLazy=invalid'),{requested:true,compatible:false,enabled:false});
});


test('furniture material review keeps the terrain Worker while real or malformed variants remain rejected',()=>{
 for(const value of ['0','1']){
  const search='?view=pastoral-house_a-entry&time=870&debug=1&houseFurniture58='+value;
  assert.deepEqual(terrainRowWorkerPolicy(search),{requested:true,compatible:true,enabled:true});
  assert.equal(terrainRowWorkerPolicy(search+'&terrainWorker38=0').enabled,false);
  assert.equal(terrainRowWorkerPolicy(search+'&forestReach39=1').compatible,false);
  assert.equal(terrainRowWorkerPolicy(search+'&futureSurfaceVariant=1').compatible,false);
 }
 for(const value of ['', 'true', '2', '01'])assert.equal(terrainRowWorkerPolicy('?houseFurniture58='+value).compatible,false);
 assert.equal(terrainRowWorkerPolicy('?houseFurniture58=1&houseFurniture58=invalid').compatible,false);
});




test('interior textile review leaves terrain input unchanged and still rejects unknown authored surfaces',()=>{
 for(const value of ['0','1']){
  assert.equal(terrainRowWorkerPolicy('?houseTextiles62='+value).enabled,true);
  assert.equal(terrainRowWorkerPolicy('?houseTextiles62='+value+'&reachBankDesign50=root-pool').compatible,false);
 }
 for(const value of ['bad','','true','2'])assert.equal(terrainRowWorkerPolicy('?houseTextiles62='+value).compatible,false);
});
