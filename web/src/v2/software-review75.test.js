import test from 'node:test';
import assert from 'node:assert/strict';
import {SoftwareReview75,createSoftwareReview75} from './software-review75.js';
import {softwareReviewPolicy75} from './software-review-policy75.js';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';

function fixture(options={}){
 let clock=0,id=0;const tasks=new Map(),events=[],listeners=new Map();
 const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,result:4,lost:false,
  fenceSync(){events.push('fence');return{};},clientWaitSync(sync,flags,timeout){assert.equal(flags,0);assert.equal(timeout,0);events.push('poll');return this.result;},deleteSync(){events.push('delete');},flush(){events.push('flush');},isContextLost(){return this.lost;}};
 const canvas={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:(k,v)=>{if(listeners.get(k)===v)listeners.delete(k);}};
 const review=new SoftwareReview75({gl,canvas,now:()=>clock,setTimer:(fn,ms)=>{tasks.set(++id,{fn,at:clock+ms});return id;},clearTimer:id=>tasks.delete(id),timeoutMs:210000,pollMs:100,...options});
 const microtasks=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
 const advance=async(ms=0)=>{clock+=ms;for(const [key,t]of[...tasks])if(t.at<=clock){tasks.delete(key);t.fn();}await microtasks();};
 const finish=async promise=>{await microtasks();gl.result=gl.CONDITION_SATISFIED;await advance(100);await promise;gl.result=gl.TIMEOUT_EXPIRED;};
 return {gl,review,events,tasks,listeners,advance,finish,microtasks};
}

test('default and explicit0 are genuinely inert; valid QA flags preserve terrain Worker',()=>{
 for(const search of['','?softwareReview75=0']){assert.equal(createSoftwareReview75({search,gl:{}}),null);assert.equal(terrainRowWorkerPolicy(search).enabled,true);}
 for(const search of['?softwareReview75=1','?softwareReview75=1&softwareReviewInputGap75=0','?softwareReview75=1&softwareReviewInputGap75=250']){assert.equal(softwareReviewPolicy75(search).enabled,true);assert.equal(terrainRowWorkerPolicy(search).enabled,true);}
});
test('invalid/mixed/duplicate switches reject QA and Worker rather than silently falling back',()=>{
 for(const search of['?softwareReview75=yes','?softwareReview75=0&softwareReview75=1','?softwareReview75=1&softwareReview75=1','?softwareReviewInputGap75=250','?softwareReview75=0&softwareReviewInputGap75=0','?softwareReview75=1&softwareReviewInputGap75=-1','?softwareReview75=1&softwareReviewInputGap75=0&softwareReviewInputGap75=250']){
  assert.equal(softwareReviewPolicy75(search).valid,false,search);assert.equal(terrainRowWorkerPolicy(search).compatible,false,search);assert.throws(()=>createSoftwareReview75({search}),/Invalid/);
 }
});
test('preparation fences are separate from three completed original world draws, then hold',async()=>{
 const f=fixture(),r=f.review;await f.finish(r.drain('prewarm'));assert.equal(r.snapshot().completedWorldFrames,0);assert.equal(r.snapshot().completedPreparationFences,1);
 await f.finish(r.completeInitial({generation:1,view:'house',scope:'first-main'}));
 for(let i=0;i<2;i++){const token=r.beginFrame();assert.equal(token.delta,0);await f.finish(r.endFrame(token,{submitted:true,signature:{generation:1}}));}
 assert.equal(r.beginFrame(),null);assert.equal(r.snapshot().phase,'held');assert.equal(r.snapshot().completedWorldFrames,3);assert.equal(r.snapshot().completedFrameSimulationSeconds,0);assert.equal(f.events.filter(x=>x==='delete').length,4);assert.equal(f.tasks.size,0);r.dispose();assert.equal(f.listeners.size,0);
});
test('one in-flight group, asynchronous zero-time polling, optional250ms gap',async()=>{
 const f=fixture({inputGapMs:250}),r=f.review,p=r.completeInitial({});await f.microtasks();
 assert.equal(r.beginFrame(),null);assert.equal(r.request(),false);assert.throws(()=>r.fence({kind:'preparation'}),/overlapping/);
 await f.advance(100);assert.ok(r.pending);assert.equal(r.snapshot().completedWorldFrames,0);await f.finish(p);
 assert.equal(r.beginFrame(),null);await f.advance(249);assert.equal(r.beginFrame(),null);await f.advance(1);assert.ok(r.beginFrame());r.dispose();
});
test('async afterShadow owner is retained inside same gate before the fence',async()=>{
 let settle;const owner=new Promise(r=>{settle=r;}),f=fixture({beforeFence:()=>owner}),r=f.review,p=r.completeInitial({});
 await f.microtasks();assert.equal(f.events.includes('fence'),false);assert.equal(r.snapshot().phase,'owner-settle');assert.equal(r.beginFrame(),null);
 const idle=r.waitForIdle();assert.equal(idle,p);settle();await f.finish(p);assert.equal(r.snapshot().completedWorldFrames,1);r.dispose();
});
test('GPU timeout stops forever, deletes fence, cancels poll and preserves failure diagnostics',async()=>{
 const f=fixture(),r=f.review,p=r.completeInitial({});const rejected=assert.rejects(p,/timeout/);await f.microtasks();await f.advance(210000);await rejected;
 assert.equal(r.snapshot().phase,'failed');assert.equal(r.snapshot().completedWorldFrames,0);assert.equal(f.tasks.size,0);assert.equal(f.listeners.size,0);assert.equal(f.events.filter(x=>x==='delete').length,1);assert.equal(r.beginFrame(),null);assert.throws(()=>r.request(),/timeout/);
});
test('async owner timeout/context loss cannot later submit a stale fence',async()=>{
 for(const cause of['timeout','loss']){
  let resolve;const f=fixture({beforeFence:()=>new Promise(r=>{resolve=r;})}),p=f.review.completeInitial({});const rejected=assert.rejects(p,/timeout|context lost/);await f.microtasks();
  if(cause==='timeout')await f.advance(210000);else f.listeners.get('webglcontextlost')();await rejected;resolve();await f.microtasks();
  assert.equal(f.events.includes('fence'),false);assert.equal(f.tasks.size,0);assert.equal(f.listeners.size,0);
 }
});
test('WAIT_FAILED, null fence, flush exceptions and owner rejection fail with no orphan resources',async()=>{
 for(const kind of['wait','null','flush','owner']){
  const f=fixture(kind==='owner'?{beforeFence:()=>Promise.reject(Error('owner failed'))}:{});
  if(kind==='wait')f.gl.result=f.gl.WAIT_FAILED;if(kind==='null')f.gl.fenceSync=()=>null;if(kind==='flush')f.gl.flush=()=>{throw Error('flush failed');};
  const p=f.review.completeInitial({}),rejected=assert.rejects(p,/failed|fence/);await f.microtasks();await f.advance(100);await rejected;
  assert.equal(f.tasks.size,0,kind);assert.equal(f.listeners.size,0,kind);assert.equal(f.review.snapshot().completedWorldFrames,0,kind);
 }
});
test('dispose or lost context while polling settles the same promise and deletes sync once',async()=>{
 for(const dispose of[false,true]){const f=fixture(),p=f.review.completeInitial({}),rejected=assert.rejects(p,/disposed|context lost/);await f.microtasks();dispose?f.review.dispose():f.listeners.get('webglcontextlost')();await rejected;f.review.dispose();assert.equal(f.tasks.size,0);assert.equal(f.listeners.size,0);assert.equal(f.events.filter(x=>x==='delete').length,1);}
});
test('pause survives pending completion and destination preparation without allowing premature steps',async()=>{
 const f=fixture(),r=f.review;r.pause();assert.equal(r.request(),false);assert.equal(r.phase,'preparing');await f.finish(r.completeInitial({}));assert.equal(r.phase,'held');r.preparing();r.pause();r.destinationReady();assert.equal(r.phase,'held');assert.equal(r.beginFrame(),null);
 assert.equal(r.request({frames:60}),true);const token=r.beginFrame(),p=r.endFrame(token,{submitted:true,signature:{}});r.pause();await f.finish(p);assert.equal(r.remaining,0);assert.equal(r.phase,'held');r.dispose();
});
test('finite motion uses1/60 per completed draw, without accumulating software wall-time',async()=>{
 const f=fixture(),r=f.review;await f.finish(r.completeInitial({}));r.pause();r.request({frames:60});
 for(let i=0;i<60;i++){await f.advance(60000);const token=r.beginFrame();assert.equal(token.delta,1/60);await f.finish(r.endFrame(token,{submitted:true,signature:{generation:4,view:'walk'}}));}
 assert.equal(r.phase,'held');assert.ok(Math.abs(r.completedFrameSimulationSeconds-1)<1e-12);assert.equal(r.lastCompleted.generation,4);assert.equal(r.lastCompleted.view,'walk');assert.match(r.snapshot().mode,/NOT-realtime/);assert.throws(()=>r.request({frames:Infinity}),/finite/);r.dispose();
});
test('early return releases reservation without counting a draw; failure stops the scheduler',async()=>{
 const f=fixture(),r=f.review;await f.finish(r.completeInitial({}));const a=r.beginFrame();await r.endFrame(a);assert.equal(r.counts.submittedWorldFrames,1);const b=r.beginFrame();await assert.rejects(r.endFrame(b,{error:Error('render failed')}),/render failed/);assert.equal(r.beginFrame(),null);assert.equal(f.tasks.size,0);assert.equal(f.listeners.size,0);
});
