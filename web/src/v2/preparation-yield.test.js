import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationYield,yieldWorldPreparation} from './preparation-yield.js';
test('all loading assets share one bounded task deadline and one pending yield',async()=>{
 let time=0,calls=0,resolve;
 const scheduler=createPreparationYield({now:()=>time,budgetMs:8,yieldTask:()=>{calls++;return new Promise(r=>resolve=r);}});
 assert.equal(scheduler.checkpoint(),null);time=7;assert.equal(scheduler.checkpoint(),null);
 time=9;const a=scheduler.checkpoint(),b=scheduler.checkpoint();assert.equal(a,b);
 await Promise.resolve();assert.equal(calls,1);time=100;resolve();await a;
 assert.equal(scheduler.checkpoint(),null);time=107;assert.equal(scheduler.checkpoint(),null);
 time=109;const c=scheduler.checkpoint();await Promise.resolve();resolve();await c;
 assert.equal(scheduler.stats.yields,2);assert.equal(scheduler.stats.maxOverrunMs,1);
});
test('blocking reference makes no scheduling changes and a task failure is surfaced',async()=>{
 const blocked=createPreparationYield({enabled:false,now:()=>100,yieldTask:()=>{throw Error('unexpected');}});
 assert.equal(blocked.checkpoint(),null);assert.equal(blocked.stats.yields,0);
 let time=0;const failing=createPreparationYield({now:()=>time,yieldTask:()=>Promise.reject(Error('scheduler failed'))});
 time=10;await assert.rejects(failing.checkpoint(),/scheduler failed/);
 assert.equal(failing.checkpoint(),null);
});


test('terrain continuation waits for a fresh unboosted task without changing readiness or losing receiver',async()=>{
 for(const mode of ['balanced','background']){
  let callback,resolve,done=false;
  const scheduler={yield(){throw Error('boosted continuation not requested');},postTask(task,options){assert.equal(this,scheduler);assert.equal(options.priority,mode==='background'?'background':'user-visible');callback=task;return new Promise(r=>resolve=r);}};
  const pending=yieldWorldPreparation({scheduler,mode}).then(()=>{done=true;});
  await Promise.resolve();assert.equal(done,false);assert.equal(callback(),undefined);
  resolve();await pending;assert.equal(done,true);
 }
});
test('legacy A/B and missing scheduler retain asynchronous, correctly bound fallback',async()=>{
 for(const options of [{},{mode:'legacy'},{mode:'balanced',legacy:true}]){
  let calls=0;const promise=Promise.resolve('legacy');
  const scheduler={yield(){assert.equal(this,scheduler);calls++;return promise;},postTask(){throw Error('default must remain original yield');}};
  assert.equal(yieldWorldPreparation({scheduler,...options}),promise);assert.equal(calls,1);
 }
 let resolve,done=false;const pending=yieldWorldPreparation({scheduler:null,timer:r=>{resolve=r;}}).then(()=>{done=true;});
 await Promise.resolve();assert.equal(done,false);resolve();await pending;assert.equal(done,true);
 const receiver={postTask(_callback,options){assert.equal(this,receiver);assert.equal(options.priority,'user-visible');return Promise.resolve('post');}};
 assert.equal(await yieldWorldPreparation({scheduler:receiver}),'post');
});
