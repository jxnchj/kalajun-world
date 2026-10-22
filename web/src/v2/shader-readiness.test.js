import test from 'node:test';import assert from 'node:assert/strict';import {Group, DataTexture} from 'three';import {compilePreparedWorld} from './shader-readiness.js';
function scheduler(){let time=0,next=0;const jobs=new Map();return{now:()=>time,set(fn,ms){const id=++next;jobs.set(id,{fn,at:time+ms});return id;},clear:id=>jobs.delete(id),get pending(){return jobs.size;},block(ms){time+=ms;},advance(ms){const target=time+ms;for(;;){const first=[...jobs.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>target)break;time=Math.max(time,first[1].at);jobs.delete(first[0]);first[1].fn();}time=Math.max(time,target);}};}
function fixture({ready=()=>true,linked=true,probeMs=0}={}){const timer=scheduler(),input=new Group(),camera={},scene={},material={},states=new Map(),events=[];const program={id:7,name:'tested-program',program:{id:7},vertexShader:{kind:'vertex'},fragmentShader:{kind:'fragment'},isReady:()=>ready(timer.now())};
 const gl={LINK_STATUS:35714,isContextLost:()=>false,getProgramParameter(p,key){assert.equal(key,this.LINK_STATUS);events.push({id:p.id,at:timer.now()});timer.block(probeMs);return typeof linked==='function'?linked(p):linked;},getProgramInfoLog:()=> 'link-log',getShaderInfoLog:s=>s.kind+'-log'};
 const renderer={info:{programs:[]},properties:{get:m=>states.get(m)},getContext:()=>gl,compile(i,c,s){assert.equal(i,input);assert.equal(c,camera);assert.equal(s,scene);renderer.info.programs.push(program);states.set(material,{currentProgram:program,programs:new Map([['key',program]])});return new Set([material]);}};
 return{timer,input,camera,scene,material,program,states,events,gl,renderer,run(options={}){return compilePreparedWorld(renderer,input,camera,scene,{scheduler:timer,...options});}};
}
test('ready fast path still confirms real LINK_STATUS, preserves result input and has no timer',async()=>{
 const f=fixture({probeMs:.5}),promise=f.run();assert.equal(f.input.userData.compileReadiness.status,'complete');assert.strictEqual(await promise,f.input);assert.equal(f.events.length,1);assert.equal(f.timer.pending,0);assert.deepEqual(f.input.userData.compileReadiness,{elapsedMs:.5,probes:1,maxProbeMs:.5,probeTotalMs:.5,programCount:1,verifiedPrograms:1,stalledProbes:0,status:'complete'});
});
test('normal asynchronous readiness never probes an unfinished link before the five-second no-progress threshold',async()=>{
 const f=fixture({ready:time=>time>=75}),promise=f.run();assert.equal(f.events.length,0);assert.equal(f.timer.pending,1);f.timer.advance(50);assert.equal(f.events.length,0);assert.equal(f.input.userData.compileReadiness.status,'waiting');f.timer.advance(25);assert.strictEqual(await promise,f.input);assert.equal(f.events.length,1);assert.equal(f.input.userData.compileReadiness.stalledProbes,0);assert.equal(f.timer.pending,0);
});
test('stalled extension status confirms one program per task and includes both material sides plus newly created programs',async()=>{
 const f=fixture({ready:()=>false,probeMs:180}),back=f.program,front={...back,id:8,program:{id:8}},other={...back,id:9,program:{id:9}};f.renderer.compile=()=>{f.renderer.info.programs.push(other);f.states.set(f.material,{currentProgram:front,programs:new Map([['back',back],['front',front]])});return new Set([f.material]);};
 const promise=f.run();f.timer.advance(4975);assert.equal(f.events.length,0);f.timer.advance(25);assert.equal(f.events.length,1);assert.equal(f.input.userData.compileReadiness.status,'waiting');assert.equal(f.timer.pending,1);f.timer.advance(25);assert.equal(f.events.length,2);f.timer.advance(25);assert.equal(f.events.length,3);assert.strictEqual(await promise,f.input);assert.equal(f.timer.pending,0);assert.deepEqual(new Set(f.events.map(v=>v.id)),new Set([7,8,9]));const stats=f.input.userData.compileReadiness;assert.equal(stats.programCount,3);assert.equal(stats.verifiedPrograms,3);assert.equal(stats.stalledProbes,3);assert.equal(stats.maxProbeMs,180);assert.equal(stats.probeTotalMs,540);assert.equal(stats.elapsedMs,5590);
});
test('real progress resets the stall deadline before recovery starts',async()=>{
 const f=fixture({ready:t=>t>=4000}),second={...f.program,id:8,program:{id:8},isReady:()=>false};const original=f.renderer.compile;f.renderer.compile=(...args)=>{const m=original(...args);f.states.get(f.material).programs.set('second',second);return m;};const promise=f.run();f.timer.advance(4000);assert.equal(f.events.length,1);f.timer.advance(4975);assert.equal(f.events.length,1);f.timer.advance(25);assert.strictEqual(await promise,f.input);assert.equal(f.events.length,2);assert.equal(f.input.userData.compileReadiness.elapsedMs,9000);
});
test('failed LINK_STATUS rejects with program and shader logs, including when KHR reports complete',async()=>{
 for(const ready of[()=>true,()=>false]){const f=fixture({ready,linked:false}),promise=f.run(),rejected=assert.rejects(promise,e=>e.name==='ShaderLinkError'&&e.programId===7&&/link-log/.test(e.message)&&/vertex-log/.test(e.message)&&/fragment-log/.test(e.message));f.timer.advance(5000);await rejected;assert.equal(f.input.userData.compileReadiness.status,'failed');assert.equal(f.input.userData.compileReadiness.verifiedPrograms,0);assert.equal(f.timer.pending,0);}
});
test('compiler throws synchronously; readiness/query throws and context loss reject without orphan timers',async()=>{
 {const f=fixture();f.renderer.compile=()=>{throw new Error('compile-kickoff');};assert.throws(()=>f.run(),/compile-kickoff/);assert.equal(f.input.userData.compileReadiness.status,'failed');assert.equal(f.timer.pending,0);}
 for(const kind of['ready','query','context','disposed']){const f=fixture({ready:()=>false}),promise=f.run();if(kind==='ready')f.program.isReady=()=>{throw new Error('ready-query');};if(kind==='query')f.gl.getProgramParameter=()=>{throw new Error('link-query');};if(kind==='context')f.gl.isContextLost=()=>true;if(kind==='disposed')f.program.program=undefined;const rejected=assert.rejects(promise);f.timer.advance(5000);await rejected;assert.equal(f.input.userData.compileReadiness.status,'failed');assert.equal(f.timer.pending,0);}
});


test('texture preparation overlaps unresolved links, yields, deduplicates and waits for both workloads',async()=>{
 const f=fixture({ready:time=>time>=75}),a=new DataTexture(new Uint8Array(4),1,1),b=new DataTexture(new Uint8Array(4),1,1);
 a.needsUpdate=b.needsUpdate=true;f.material.map=a;f.material.uniforms={one:{value:a},nested:{value:[{map:b},a]}};
 f.states.set(a,{});f.states.set(b,{});const uploads=[];
 f.renderer.initTexture=t=>{uploads.push(t);f.timer.block(6);f.states.get(t).__version=t.version;};
 const promise=f.run({prepareTextures:true});assert.equal(uploads.length,0,'all compile kickoffs may run before uploads');
 f.timer.advance(0);assert.equal(uploads.length,1,'one expensive upload yields before the next');assert.equal(f.events.length,0);
 assert.equal(f.input.userData.compileReadiness.status,'waiting');f.timer.advance(6);assert.equal(uploads.length,2);assert.equal(f.events.length,0);
 f.timer.advance(100);assert.equal(await promise,f.input);assert.equal(f.timer.pending,0);
 assert.deepEqual(f.input.userData.compileReadiness.textures,{selected:2,initialized:2,alreadyInitialized:0,skipped:0,uploadTotalMs:12,maxUploadMs:6,elapsedMs:12,status:'complete'});
});
test('ready links still wait for texture upload; upload failure rejects and cleans the single timer',async()=>{
 for(const fail of[false,true]){const f=fixture(),texture=new DataTexture(new Uint8Array(4),1,1);texture.needsUpdate=true;f.material.map=texture;f.states.set(texture,{});
  f.renderer.initTexture=t=>{if(fail)throw Error('texture upload failed');f.states.get(t).__version=t.version;};
  const promise=f.run({prepareTextures:true});assert.equal(f.input.userData.compileReadiness.status,'waiting');assert.equal(f.timer.pending,1);
  const result=fail?assert.rejects(promise,/texture upload failed/):promise;f.timer.advance(0);await result;
  assert.equal(f.input.userData.compileReadiness.status,fail?'failed':'complete');assert.equal(f.timer.pending,0);
  assert.equal(f.input.userData.compileReadiness.textures.status,fail?'failed':'complete');
 }
});
