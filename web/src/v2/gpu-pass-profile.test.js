import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GPUPassProfile} from './gpu-pass-profile.js';
function fixture({enabled=true,maxPending=48}={}){
 const ext={TIME_ELAPSED_EXT:10,GPU_DISJOINT_EXT:11},scene={},camera={},reflection={},output={};
 let active=null,next=0;const deleted=[],calls=[],events=[];
 const gl={CURRENT_QUERY:1,QUERY_RESULT_AVAILABLE:2,QUERY_RESULT:3,ready:true,disjoint:false,
 getExtension:()=>ext,getParameter:()=>gl.disjoint,getQuery:()=>active,
 createQuery:()=>({id:++next}),beginQuery(t,q){assert.equal(active,null,'queries MUST NOT nest');active=q;events.push(['begin',q.id]);},endQuery(){assert.ok(active);events.push(['end',active.id]);active=null;},
 getQueryParameter(q,p){return p===2?gl.ready:1e6;},deleteQuery:q=>deleted.push(q.id)};
 const renderer={getContext:()=>gl,shadowMap:{render(){calls.push('shadow');}},render(s,c){calls.push(s===scene?'world':'output');renderer.shadowMap.render([],s,c);renderer.effect?.(s,c);}};
 const originalRender=renderer.render,originalShadow=renderer.shadowMap.render;
 const profiler=new GPUPassProfile(renderer,{scene,camera,enabled,maxPending});
 return {scene,camera,reflection,output,gl,renderer,profiler,calls,events,deleted,originalRender,originalShadow,get active(){return active;},setForeign(){active={id:999};}};
}
test('actual render and shadow lifecycle produce GPU-only main/output/reflection segments without nesting',()=>{
 const f=fixture();f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.renderer.render(f.output,{});f.renderer.render(f.scene,f.reflection);f.profiler.endFrame();
 const s=f.profiler.snapshot();assert.equal(s.samples.length,1);assert.deepEqual(s.samples[0].passes,{'main.setup':1,'main.shadow':1,'main.color':1,output:1,'reflection.setup':1,'reflection.shadow':1,'reflection.color':1});assert.equal(s.samples[0].totalMs,7);
 assert.deepEqual(f.calls,['world','shadow','output','shadow','world','shadow']);assert.equal(f.events.filter(e=>e[0]==='begin').length,7);assert.equal(f.deleted.length,7);assert.equal(f.active,null);
 f.profiler.dispose();assert.equal(f.renderer.render,f.originalRender);assert.equal(f.renderer.shadowMap.render,f.originalShadow);
});
test('default off installs no wrappers or queries',()=>{
 const f=fixture({enabled:false});assert.equal(f.renderer.render,f.originalRender);assert.equal(f.renderer.shadowMap.render,f.originalShadow);assert.equal(f.profiler.beginFrame(),false);f.renderer.render(f.scene,f.camera);f.profiler.endFrame();assert.equal(f.events.length,0);f.profiler.dispose();
});
test('nested render suspends and resumes parent query without nesting or altering draw calls',()=>{
 const f=fixture();let nested=false;f.renderer.effect=()=>{if(!nested){nested=true;f.renderer.render(f.scene,f.reflection);}};
 f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.profiler.endFrame();const s=f.profiler.snapshot();assert.equal(s.samples.length,1);assert.equal(s.samples[0].passes['main.color'],2);assert.equal(s.samples[0].passes['reflection.color'],1);assert.equal(f.active,null);f.profiler.dispose();
});
test('capacity bounds pending queries and frame records; disjoint invalidates whole pending frames',()=>{
 const f=fixture({maxPending:3});f.gl.ready=false;
 for(let i=0;i<100;i++){f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.profiler.endFrame();}
 assert.equal(f.profiler.pending.length,3);assert.equal(f.profiler.waiting.length,1);assert.equal(f.profiler.samples.length,0);
 f.gl.disjoint=true;f.profiler.collect();assert.equal(f.deleted.length,3);assert.equal(f.profiler.waiting.length,0);assert.equal(f.profiler.samples.length,0);assert.equal(f.profiler.counters.disjoint,1);
 f.gl.disjoint=false;f.gl.ready=true;f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.profiler.endFrame();assert.equal(f.profiler.snapshot().samples.length,1);f.profiler.dispose();
});
test('render exceptions and foreign query never leak active GPU state or publish incomplete samples',()=>{
 const f=fixture();f.renderer.effect=()=>{throw Error('draw failure');};f.profiler.beginFrame();assert.throws(()=>f.renderer.render(f.scene,f.camera),/draw failure/);f.profiler.endFrame({failed:true});assert.equal(f.active,null);assert.equal(f.profiler.snapshot().samples.length,0);
 f.renderer.effect=null;f.setForeign();f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.profiler.endFrame();assert.equal(f.active.id,999);assert.equal(f.profiler.counters.foreignQuery,1);assert.equal(f.profiler.snapshot().samples.length,0);f.profiler.dispose();assert.equal(f.active.id,999);
});
test('dispose deletes outstanding queries and does not overwrite a newer render wrapper',()=>{
 const f=fixture();f.gl.ready=false;f.profiler.beginFrame();f.renderer.render(f.scene,f.camera);f.profiler.endFrame();const newer=()=>{};f.renderer.render=newer;f.profiler.dispose();assert.equal(f.deleted.length,3);assert.equal(f.renderer.render,newer);assert.equal(f.renderer.shadowMap.render,f.originalShadow);f.profiler.dispose();assert.equal(f.deleted.length,3);
});
test('main diagnostics replace outer query and close on errors/pagehide',()=>{
 const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 assert.match(main,/gpuExtension=params.get\("profile"\)===\"1\"&&!gpuPassProfileEnabled\?/);
 assert.match(main,/gpuPassProfileEnabled\?new GPUPassProfile/);
 assert.match(main,/finally \{gpuPassProfile\?\.endFrame\(\{failed:gpuFrameFailed\}\)/);
 assert.match(main,/pagehide.*gpuPassProfile\?\.dispose\(\)/);
});
