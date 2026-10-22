import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSprucePacketAndShell} from './spruce-gpu-loading.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('spruce shell work overlaps a pending worker, but never exposes a half-prepared form',async()=>{
 const job=deferred(),events=[],packet={frames:new Float32Array([1,2,3])},shell={vertices:new Float32Array([4,5,6])};let complete=false;
 const builder={build(records,packing){events.push('worker-start');assert.deepEqual(records,['source']);assert.equal(packing,false);return job.promise;},dispose(){throw Error('successful worker must remain reusable');}};
 const result=prepareSprucePacketAndShell(builder,['source'],false,()=>{events.push('shell');return shell;}).then(r=>{complete=true;return r;});
 assert.deepEqual(events,['worker-start','shell']);await Promise.resolve();assert.equal(complete,false);
 job.resolve(packet);const actual=await result;assert.strictEqual(actual.packet,packet);assert.strictEqual(actual.shell,shell);
});
test('serial comparison retains the same outputs without overlapping shell work',async()=>{
 const job=deferred(),events=[];const result=prepareSprucePacketAndShell({build(){events.push('worker');return job.promise;},dispose(){}},[],false,()=>{events.push('shell');return 2;},{overlap:false});
 assert.deepEqual(events,['worker']);job.resolve(1);assert.deepEqual(await result,{packet:1,shell:2});assert.deepEqual(events,['worker','shell']);
});
test('shell and worker failures retain the original cause and settle the outstanding worker',async()=>{
 for(const mode of ['shell','worker']){const job=deferred(),error=new Error(mode),cancelled=new Error('cancelled');let disposed=0;
  const result=prepareSprucePacketAndShell({build:()=>job.promise,dispose(){disposed++;job.reject(cancelled);}},[],false,()=>{if(mode==='shell')throw error;return {};});
  if(mode==='worker')job.reject(error);await assert.rejects(result,e=>e===error);assert.equal(disposed,1);
 }
});
