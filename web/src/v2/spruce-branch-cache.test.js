import test from 'node:test';import assert from 'node:assert/strict';import {SpruceBranchCache} from './spruce-branch-cache.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('spatial cache reuses the same group, bounds stale results, and never releases wanted detail',async()=>{
 const freed=[],jobs=[];const cache=new SpruceBranchCache({maxBytes:10,build:(d,k)=>new Promise(resolve=>jobs.push({k,resolve})),disposeValue:(v,k)=>freed.push(k)});
 cache.begin();assert.equal(cache.request('a',{},2),null);cache.request('a',{},1);cache.end();await tick();assert.equal(jobs.length,1);
 cache.begin();cache.request('b',{},0);cache.end();jobs[0].resolve({bytes:8});await tick();assert.equal(cache.stats.staleCompletions,1);assert.equal(jobs.length,2);jobs[1].resolve({bytes:8});await tick();assert.deepEqual(freed,['a']);assert.equal(cache.stats.residentBytes,8);
 cache.begin();const e=cache.request('b',{},0);cache.end();assert.equal(e.value.bytes,8);assert.equal(jobs.length,2);cache.dispose();assert.deepEqual(freed,['a','b']);
});
test('one retry then explicit failure; disposed in-flight results never publish',async()=>{
 let attempts=0;const c=new SpruceBranchCache({build:async()=>{attempts++;throw new Error('decode bad');},disposeValue(){}});c.begin();c.request('bad',{});c.end();await tick();await tick();assert.equal(attempts,2);assert.throws(()=>c.begin(),/bad.*decode bad/);c.dispose();
 let resolve,disposed=0;const d=new SpruceBranchCache({build:()=>new Promise(r=>resolve=r),disposeValue(){disposed++;}});d.begin();d.request('late',{});d.end();await tick();d.dispose();resolve({bytes:10});await tick();assert.equal(disposed,1);assert.equal(d.stats.residentBytes,0);
});

test('two-slot dispatch preserves priorities, hard parameter budget and byte-identical results',async()=>{
 const jobs=[],freed=[],cache=new SpruceBranchCache({concurrency:2,maxInFlightBytes:10,estimateBytes:d=>d.size,build:(d,k)=>new Promise(resolve=>jobs.push({k,resolve,d})),disposeValue:(v,k)=>freed.push(k)});
 cache.begin();cache.request('c',{size:4},3);cache.request('a',{size:6},1);cache.request('b',{size:4},2);cache.end();await tick();
 assert.deepEqual(jobs.map(j=>j.k),['a','b']);assert.equal(cache.stats.peakActiveBuilds,2);assert.equal(cache.stats.peakInFlightParameterBytes,10);
 jobs[1].resolve({bytes:4,payload:new Uint8Array([2,7,4])});await tick();assert.equal(jobs[2].k,'c');assert.equal(cache.stats.inFlightParameterBytes,10);
 jobs[0].resolve({bytes:6,payload:new Uint8Array([9,8,5])});jobs[2].resolve({bytes:4,payload:new Uint8Array([3,1])});await tick();
 assert.deepEqual(cache.entries.get('b').value.payload,new Uint8Array([2,7,4]));assert.equal(cache.stats.residentBytes,14);assert.equal(cache.stats.pending,0);assert.equal(cache.stats.inFlightParameterBytes,0);
 cache.dispose();assert.deepEqual(freed.sort(),['a','b','c']);
});
test('oversized individual groups serialize without removing original detail and concurrent disposal frees both once',async()=>{
 const jobs=[],freed=[],cache=new SpruceBranchCache({concurrency:2,maxInFlightBytes:10,estimateBytes:d=>d.size,build:(d,k)=>new Promise(resolve=>jobs.push({k,resolve})),disposeValue:(v,k)=>freed.push(k)});
 cache.begin();cache.request('large',{size:15},0);cache.request('small',{size:2},1);cache.end();await tick();assert.equal(jobs.length,1);
 jobs[0].resolve({bytes:15});await tick();assert.equal(jobs.length,2);cache.dispose();jobs[1].resolve({bytes:2});await tick();assert.deepEqual(freed,['large','small']);assert.equal(cache.stats.residentBytes,0);assert.equal(cache.stats.activeBuilds,0);
});
test('two-slot retry stays bounded and obsolete queued groups are never dispatched',async()=>{
 let failures=0;const jobs=[],cache=new SpruceBranchCache({concurrency:2,build:(d,k)=>k==='fail'?Promise.reject(new Error('broken '+(++failures))):new Promise(resolve=>jobs.push({k,resolve})),disposeValue(){}});
 cache.begin();cache.request('fail',{},0);cache.request('wanted',{},1);cache.request('obsolete',{},2);cache.end();
 cache.begin();cache.request('fail',{},0);cache.request('wanted',{},1);cache.end();await tick();await tick();
 assert.equal(failures,2);assert.equal(jobs.length,1);assert.equal(jobs[0].k,'wanted');assert.ok(cache.stats.peakActiveBuilds<=2);assert.throws(()=>cache.begin(),/broken 2/);
 jobs[0].resolve({bytes:1});await tick();cache.dispose();
});

test('stage durations aggregate only successful publications and retain original buildMs definition',async()=>{
 let time=0,attempt=0;const jobs=[],timing={source:'worker',generateMs:3,packingMs:1,roundTripMs:12,nonComputeWaitMs:8,mainPrepareMs:5};
 const cache=new SpruceBranchCache({now:()=>time,build:()=>{attempt++;if(attempt===1){time=7;return Promise.reject(Error('retry'));}return new Promise(resolve=>jobs.push(resolve));},disposeValue(){}});
 cache.begin();cache.request('a',{});cache.end();await tick();assert.equal(cache.stats.retries,1);assert.equal(cache.stats.preparationSamples,0);
 time=30;jobs[0]({bytes:1,preparationTiming:timing});await tick();assert.equal(cache.stats.buildMs,23);assert.equal(cache.stats.packetRoundTripMs,12);assert.equal(cache.stats.packetGenerateMs,3);assert.equal(cache.stats.packetPackingMs,1);assert.equal(cache.stats.packetNonComputeWaitMs,8);assert.equal(cache.stats.packetMainPrepareMs,5);assert.equal(cache.stats.preparationSamples,1);assert.equal(cache.stats.workerPreparationSamples,1);
 cache.begin();cache.request('late',{});cache.end();await tick();cache.dispose();time=100;jobs[1]({bytes:1,preparationTiming:timing});await tick();assert.equal(cache.stats.preparationSamples,1);assert.equal(cache.stats.buildMs,23);
});

test('immediate candidate posts before caller work while default retains microtask dispatch',async()=>{
 for(const immediateDispatch of[undefined,false,true]){let time=0;const calls=[],jobs=[],cache=new SpruceBranchCache({immediateDispatch,now:()=>time,concurrency:2,maxInFlightBytes:8,estimateBytes:d=>d.bytes,build:(d,k)=>{calls.push(k);return new Promise(resolve=>jobs.push(resolve));},disposeValue(){}});
  cache.begin();cache.request('a',{bytes:4},0);cache.request('b',{bytes:4},1);cache.request('c',{bytes:4},2);cache.end();assert.equal(calls.length,immediateDispatch?2:0);assert.equal(cache.stats.activeBuilds,2);assert.equal(cache.stats.inFlightParameterBytes,8);
  time=100;await Promise.resolve();assert.deepEqual(calls,['a','b']);jobs[0]({bytes:4});jobs[1]({bytes:4});await tick();assert.deepEqual(calls,['a','b','c']);jobs[2]({bytes:4});await tick();assert.equal(cache.stats.builtGroups,3);assert.equal(cache.stats.buildDispatchWaitMs,immediateDispatch?0:200);assert.equal(cache.stats.dispatchMode,immediateDispatch?'immediate':'microtask');assert.ok(cache.stats.peakActiveBuilds<=2);cache.dispose();
 }
});
test('immediate candidate converts synchronous failure to bounded retry and explicit retry still works',async()=>{
 let attempts=0,fail=true;const cache=new SpruceBranchCache({immediateDispatch:true,build:()=>{attempts++;if(fail)throw Error('sync failed');return{bytes:7};},disposeValue(){}});
 cache.begin();cache.request('a',{});assert.doesNotThrow(()=>cache.end());await tick();await tick();assert.equal(attempts,2);assert.equal(cache.stats.builtGroups,0);assert.equal(cache.stats.retries,1);assert.equal(cache.stats.activeBuilds,0);assert.throws(()=>cache.begin(),/sync failed/);
 fail=false;cache.request('a',{});cache.retry();await tick();assert.equal(attempts,3);assert.equal(cache.stats.builtGroups,1);assert.equal(cache.stats.residentBytes,7);cache.dispose();
});
test('immediate candidate synchronous disposal stops second dispatch and disposes first result once',async()=>{
 let calls=0,freed=0,cache;cache=new SpruceBranchCache({immediateDispatch:true,concurrency:2,estimateBytes:()=>4,build:()=>{calls++;cache.dispose();return{bytes:4};},disposeValue:()=>freed++});
 cache.begin();cache.request('a',{},0);cache.request('b',{},1);cache.end();assert.equal(calls,1);await tick();assert.equal(freed,1);assert.equal(cache.stats.builtGroups,0);assert.equal(cache.stats.preparationSamples,0);assert.equal(cache.stats.activeBuilds,0);assert.equal(cache.stats.inFlightParameterBytes,0);cache.dispose();assert.equal(freed,1);
});
test('immediate candidate preserves oversized serialization and disposes asynchronous pending replies',async()=>{
 const jobs=[],freed=[],cache=new SpruceBranchCache({immediateDispatch:true,concurrency:2,maxInFlightBytes:8,estimateBytes:d=>d.bytes,build:(d,k)=>new Promise(resolve=>jobs.push({k,resolve})),disposeValue:(v,k)=>freed.push(k)});
 cache.begin();cache.request('large',{bytes:12},0);cache.request('small',{bytes:4},1);cache.end();assert.deepEqual(jobs.map(j=>j.k),['large']);jobs[0].resolve({bytes:12});await tick();assert.deepEqual(jobs.map(j=>j.k),['large','small']);cache.dispose();jobs[1].resolve({bytes:4});await tick();assert.deepEqual(freed,['large','small']);assert.equal(cache.stats.builtGroups,1);assert.equal(cache.stats.activeBuilds,0);
});
