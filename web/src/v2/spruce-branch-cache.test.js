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
