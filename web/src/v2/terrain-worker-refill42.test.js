import test from 'node:test';import assert from 'node:assert/strict';
import {TerrainWorkerRefill42} from './terrain-worker-refill42.js';
import {WorldTerrain} from './terrain.js';import * as THREE from 'three';
function job(){const node={x:0,z:0,size:128,depth:2,parent:null,dead:false,mesh:null};const j={node,row:0,positions:new Float32Array([1,2,3]),heights:new Float64Array([1]),indices:new Uint16Array([0,1,2]),min:Infinity,max:-Infinity};node.job=j;return j;}
const payload=j=>({row:33,positions:j.positions.slice(),heights:j.heights.slice(),indices:j.indices.slice(),min:1,max:2});
function fixture(){let queue=Array.from({length:8},job);const w={messages:[],postMessage(m){this.messages.push(structuredClone(m));},terminate(){},send(m){this.onmessage?.({data:m});}};const c=new TerrainWorkerRefill42({}, {queueProvider:()=>queue,makeWorker:()=>w,timeoutMs:1000});const result=(id,j)=>w.send({type:'result',id,payload:payload(j),ms:1});return{c,w,get queue(){return queue;},replace(q){queue=q;},result};}
test('result arrival fills bounded ordered prefix without any frame or queue publication',()=>{const f=fixture(),{c,w,queue:q}=f;try{w.send({type:'ready'});assert.equal(c.pending.size,2);f.result(1,q[0]);assert.equal(c.pending.size,2);assert.equal(w.messages.at(-1).id,3);f.result(2,q[1]);f.result(3,q[2]);f.result(4,q[3]);assert.equal(c.pending.size,0);assert.equal(w.messages.filter(m=>m.type==='build').length,4);assert.equal(c.enqueue(q[4]),false);assert.ok(q.every(j=>!j.node.mesh&&j.row===0));assert.equal(c.refillStats.maxBuffered,4);assert.deepEqual(q[0].workerPayload.positions,new Float32Array([1,2,3]));}finally{c.dispose();}});
test('reversed replies retain queue head, cut-over ignores old jobs and late dead results',()=>{const f=fixture(),{c,w,queue:q}=f;try{w.send({type:'ready'});f.result(2,q[1]);assert.equal(q[0].workerPayload,undefined);const next=[job(),job(),job()];q.forEach(j=>j.node.dead=true);f.replace(next);f.result(1,q[0]);assert.equal(q[0].workerPayload,undefined);assert.ok(next[0].workerPending);assert.equal(c.stats.discarded,1);f.result(3,q[2]);assert.ok(next[1].workerPending);assert.equal(c.stats.discarded,2);assert.ok(c.pending.size<=2);}finally{c.dispose();}});
test('failure, cancellation and stale jobs retain CPU fallback and stop message refill',()=>{for(const mode of ['failure','dispose']){const f=fixture(),{c,w,queue:q}=f;w.send({type:'ready'});const saved=w.onmessage;if(mode==='failure')w.send({type:'error',message:'bad'});else c.dispose();saved({data:{type:'result',id:1,payload:payload(q[0]),ms:1}});assert.equal(c.pending.size,0);assert.ok(q.every(j=>!j.workerPending&&!j.workerPayload));assert.equal(c.queueProvider,null);assert.equal(w.messages.filter(m=>m.type==='build').length,2);}});
test('real terrain update keeps original two publishes and 3ms budget with four ready results',()=>{for(const slow of [false,true]){const f=fixture(),{c,w,queue:q}=f;try{w.send({type:'ready'});for(let i=0;i<4;i++)f.result(i+1,q[i]);const expected=q.slice(0,slow?1:2),t=Object.create(WorldTerrain.prototype),finished=[];Object.assign(t,{queue:q,disposed:false,_activePreparation:0,_elapsed:0,_queueDirty:false,_lastPlan:new THREE.Vector3(),_camera:new THREE.Vector3(),_projection:new THREE.Matrix4(),_frustum:new THREE.Frustum(),stats:{},liveNodes:[],submissionBatches:{restore(){},update(){}},_advanceMorphs(){},_measure(){},_finish(j){finished.push(j);j.node.mesh={};if(slow){const until=performance.now()+5;while(performance.now()<until){}}},_buildRow(){throw Error('must consume original payload');},roots:[],rowWorker:c});const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();t.update(camera,0);assert.deepEqual(finished,expected);assert.equal(finished.length,slow?1:2);assert.equal(t.stats.workerReadyWindow42.extraFinished,0);}finally{c.dispose();}}});

test('candidate cannot silently increase worker parallel queue capacity',()=>{assert.throws(()=>new TerrainWorkerRefill42({}, {queueProvider:()=>[],limit:4}),/two pending/);});

import {terrainWorkerRefillPolicy42} from './terrain-worker-refill42.js';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
test('explicit isolated flag keeps default source and reports incompatible experiments',()=>{
 assert.equal(terrainWorkerRefillPolicy42('').enabled,false);
 assert.equal(terrainWorkerRefillPolicy42('?terrainRefill42=1').enabled,true);
 for(const conflict of ['terrainWindow42','terrainPrepared42']){const p=terrainWorkerRefillPolicy42('?terrainRefill42=1&'+conflict+'=1');assert.equal(p.enabled,false);assert.match(p.reason,new RegExp(conflict));}
 assert.equal(terrainRowWorkerPolicy('?terrainRefill42=1').enabled,true);
 assert.equal(terrainRowWorkerPolicy('?terrainRefill42=1&terrainWorker38=0').enabled,false);
 assert.equal(terrainRowWorkerPolicy('?terrainRefill42=1&unknownSurface=1').compatible,false);
});
test('real prepareView cancellation releases preparation owner without abandoning queued work',async()=>{
 const f=fixture(),{c,w,queue:q}=f;try{const t=Object.create(WorldTerrain.prototype);
 Object.assign(t,{queue:q,disposed:false,_prepareToken:0,_activePreparation:0,stats:{queuedTiles:8,nearQueuedTiles:8},morphs:new Set(),rowWorker:c,update(){}});
 w.send({type:'ready'});setTimeout(()=>t.cancelPreparation(),2);
 const result=await t.prepareView(new THREE.PerspectiveCamera(),{maxMs:100});assert.equal(result.reason,'superseded');assert.equal(t._activePreparation,0);
 f.result(1,q[0]);assert.equal(q[0].workerPayload.row,33);assert.ok(c.pending.size<=2);
 }finally{c.dispose();}});
