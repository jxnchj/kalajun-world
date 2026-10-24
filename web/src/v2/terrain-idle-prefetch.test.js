import test from 'node:test';import assert from 'node:assert/strict';
import {startTerrainIdlePrefetch} from './terrain-idle-prefetch.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(extra={}){
 const near=deferred(),assets=deferred(),callbacks=new Map(),timers=new Map(),calls=[],camera={pose:'same source camera'};let id=0,cancels=0;
 const terrain={cancelPreparation(){cancels++;},async prepareView(c,options){calls.push({c,options});return {ready:true,queuedTiles:0};}};
 const pump=startTerrainIdlePrefetch({enabled:true,terrain,camera,near:near.promise,assets:assets.promise,requestIdle:cb=>{callbacks.set(++id,cb);return id;},cancelIdle:i=>callbacks.delete(i),setTimer:cb=>{timers.set(++id,cb);return id;},clearTimer:i=>timers.delete(i),...extra});
 return {pump,near,assets,callbacks,timers,calls,camera,terrain,get cancels(){return cancels;},fire(remaining=10){const [i,cb]=callbacks.entries().next().value;callbacks.delete(i);cb({timeRemaining:()=>remaining,didTimeout:false});}};
}
test('only a matching near-ready view runs the exact existing all scheduler inside real idle budget',async()=>{
 const f=fixture();await flush();assert.equal(f.callbacks.size,0);f.near.resolve({nearReady:true});await flush();assert.equal(f.calls.length,0);f.fire(.5);await flush();assert.equal(f.calls.length,0);f.fire(10);await f.pump.done;
 assert.deepEqual(f.calls,[{c:f.camera,options:{maxMs:4,waitFor:'all',nearRadius:160}}]);assert.equal(f.pump.stats.reason,'ready');assert.equal(f.cancels,0);assert.equal(f.timers.size,0);
});
test('asset completion before near-ready exits without canceling the near preparation or waiting for it',async()=>{
 const f=fixture();f.assets.resolve();await f.pump.done;assert.equal(f.pump.stats.reason,'assets-settled');assert.equal(f.cancels,0);f.near.resolve({nearReady:true});await flush();assert.equal(f.callbacks.size,0);assert.equal(f.calls.length,0);
});
test('destination cancellation drains an owned in-flight slice before a new formal preparation can begin',async()=>{
 const f=fixture(),slice=deferred();f.terrain.prepareView=()=>slice.promise;f.near.resolve({nearReady:true});await flush();f.fire();await flush();let done=false;const stopped=f.pump.stop('destination').then(()=>done=true);await flush();assert.equal(done,false);assert.equal(f.cancels,1);slice.resolve({ready:false});await stopped;assert.equal(f.callbacks.size,0);assert.equal(f.cancels,1);f.assets.resolve();await flush();assert.equal(f.cancels,1,'late asset completion must not cancel formal preparation');
});
test('time budget and stale generations cancel queued idle callbacks without touching another preparation',async()=>{
 for(const stale of [false,true]){let current=true;const f=fixture({isCurrent:()=>current});f.near.resolve({nearReady:true});await flush();if(stale){current=false;f.fire();}else [...f.timers.values()][0]();await f.pump.done;assert.equal(f.pump.stats.reason,stale?'destination':'budget');assert.equal(f.calls.length,0);assert.equal(f.callbacks.size,0);assert.equal(f.cancels,0);}
});
test('near failure, asset rejection and slice failure are observed without rejected background promises',async()=>{
 const error=new Error('source failure');for(const phase of ['near','assets','slice']){const f=fixture();if(phase==='near')f.near.reject(error);else if(phase==='assets')f.assets.reject(error);else{f.terrain.prepareView=async()=>{throw error;};f.near.resolve({nearReady:true});await flush();f.fire();}const result=await f.pump.done;assert.equal(result.reason,phase==='assets'?'asset-error':'error');assert.equal(result.error,phase==='assets'?null:error);assert.equal(f.callbacks.size,0);assert.equal(f.timers.size,0);}
});
test('disabled or unavailable idle API does not substitute a competing foreground scheduler',async()=>{
 for(const options of [{enabled:false},{requestIdle:null},{cancelIdle:null}]){const f=fixture(options);await f.pump.done;if(options.enabled===false){await f.pump.stop("assets-settled");assert.equal(f.pump.stats.reason,"disabled");}assert.equal(f.calls.length,0);assert.equal(f.callbacks.size,0);assert.equal(f.cancels,0);}
});
test('near timeout never authorizes far preparation',async()=>{const f=fixture();f.near.resolve({nearReady:false,reason:'budget'});await f.pump.done;assert.equal(f.pump.stats.reason,'near-not-ready');assert.equal(f.calls.length,0);});
