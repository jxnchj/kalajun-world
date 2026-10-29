import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 const fn=source.match(/const measureLoad=async\(name,work\)=>\{[\s\S]*?\n\};/)[0];
 let now=100;const timings={phases:{}};
 const run=vm.runInNewContext(fn+';measureLoad',{performance:{now:()=>now},bootStarted:50,loadTimings:timings});
 return {run,timings,advance(ms){now+=ms;}};
}
test('actual firstFrame measure retains one await and separates synchronous work from microtask tail',async()=>{
 const f=fixture();let returned=false;const promise=f.run('firstFrame',()=>{f.advance(7);queueMicrotask(()=>{f.advance(13);returned=true;});return 42;});
 assert.equal(returned,false);assert.equal(f.timings.phases.firstFrame.status,'running');assert.equal(await promise,42);
 assert.deepEqual({...f.timings.phases.firstFrame},{startMs:50,elapsedMs:20,status:'complete',syncMs:7,awaitTailMs:13});
});
test('actual firstFrame records sync throws and async rejects without swallowing errors',async()=>{
 for(const async of [false,true]){
  const f=fixture(),error=Error('failed');const p=f.run('firstFrame',()=>{f.advance(5);if(!async)throw error;return Promise.resolve().then(()=>{f.advance(11);throw error;});});
  await assert.rejects(p,e=>e===error);const phase=f.timings.phases.firstFrame;
  assert.equal(phase.syncMs,5);assert.equal(phase.awaitTailMs,async?11:0);assert.equal(phase.elapsedMs,async?16:5);assert.equal(phase.status,'failed');
 }
});
test('other loading phases retain their original diagnostic shape',async()=>{
 const f=fixture();assert.equal(await f.run('initialShaders',()=>{f.advance(9);return 3;}),3);
 assert.deepEqual({...f.timings.phases.initialShaders},{startMs:50,elapsedMs:9,status:'complete'});
});
