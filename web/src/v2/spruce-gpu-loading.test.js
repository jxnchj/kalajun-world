import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {createGpuPacketBuilder,estimateGpuPacketBytes,prepareSpruceForms,loadGpuSpruceRecipe,loadGpuSpruceRecipeData} from './spruce-gpu-loading.js';
import {buildBrushPacket} from './spruce-brush-packet.js';
const recipe=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url))));
function mock(){return{messages:[],terminated:0,postMessage(message){this.messages.push(message);},terminate(){this.terminated++;}};}
test('single worker accepts exactly two dispatches before publication and retains per-ID packet bytes',async()=>{
 const worker=mock();let made=0;const builder=createGpuPacketBuilder({workerFactory:()=>{made++;return worker;},maxInFlight:2});
 const records=[recipe.forms.pencil.instances.slice(0,2),recipe.forms.old.instances.slice(0,3)],pending=records.map(r=>builder.build(r));
 assert.equal(made,1);assert.equal(worker.messages.length,2);await assert.rejects(builder.build([]),/bounded queue/);
 for(const i of[1,0]){const packet=buildBrushPacket(records[i]);assert.equal(packet.bytes,estimateGpuPacketBytes(records[i]));worker.onmessage({data:{id:worker.messages[i].id,packet}});}
 for(let i=0;i<2;i++)assert.deepEqual(await pending[i],buildBrushPacket(records[i]));builder.dispose();assert.equal(worker.terminated,1);
});
test('queue parameter estimates match exact retained, mixed and short-spray packet allocations',()=>{
 const original=recipe.forms.pencil.instances.slice(0,2),extra=original.map((r,i)=>({...r,variationKey:i}));
 for(const records of[original,extra,[...original,...extra]])assert.equal(estimateGpuPacketBytes(records),buildBrushPacket(records).bytes);
});
test('both outstanding jobs reject once on every terminal worker failure and late messages cannot publish',async()=>{
 for(const mode of['abort','dispose','error','messageerror','report','post']){
  const worker=mock(),controller=new AbortController(),builder=createGpuPacketBuilder({signal:controller.signal,workerFactory:()=>worker,maxInFlight:2});
  const a=builder.build([]),b=builder.build([]),results=Promise.allSettled([a,b]);
  if(mode==='abort')controller.abort();else if(mode==='dispose')builder.dispose();else if(mode==='report')worker.onmessage({data:{id:worker.messages[0].id,error:'bad packet'}});else if(mode==='post'){
   worker.onmessage({data:{id:worker.messages[0].id,packet:{ok:true}}});worker.postMessage=()=>{throw new Error('post failed');};const c=builder.build([]);await assert.rejects(c,/post failed/);
  }else worker['on'+mode]({message:mode});
  const settled=await results;assert.equal(settled[1].status,'rejected');assert.equal(settled[0].status,mode==='post'?'fulfilled':'rejected');
  assert.equal(worker.terminated,1);worker.onmessage({data:{id:worker.messages[1].id,packet:{late:true}}});builder.dispose();assert.equal(worker.terminated,1);await assert.rejects(builder.build([]));
 }
});
test('serial A/B rejects second concurrent job and pre-abort creates no worker',async()=>{
 const worker=mock(),builder=createGpuPacketBuilder({workerFactory:()=>worker});const a=builder.build([]);await assert.rejects(builder.build([]),/bounded queue/);worker.onmessage({data:{id:worker.messages[0].id,packet:{ok:true}}});assert.deepEqual(await a,{ok:true});builder.dispose();
 const controller=new AbortController();controller.abort();let made=0;const canceled=createGpuPacketBuilder({signal:controller.signal,workerFactory:()=>{made++;return mock();},maxInFlight:2});await assert.rejects(canceled.build([]),e=>e.name==='AbortError');assert.equal(made,0);canceled.dispose();
});

test('form prequeue starts the second immutable packet before first shell, publishes original order and matches byte budget',async()=>{
 const events=[],worker=mock(),originalPost=worker.postMessage;
 worker.postMessage=function(message){originalPost.call(this,message);events.push('post'+message.id);};
 const builder=createGpuPacketBuilder({workerFactory:()=>worker,maxInFlight:2}),records=recipe.forms.pencil.instances.slice(0,1),bytes=estimateGpuPacketBytes(records),outputs=[];
 const result=prepareSpruceForms(builder,5,i=>({records,prepareShell(){events.push('shell'+i);return i;}}),{concurrency:2,maxInFlightBytes:bytes*2,onResult:(p,item,shell)=>outputs.push([p.bytes,shell])});
 assert.deepEqual(events,['post0','post1','shell0']);
 // Replies may arrive out of order, but must not expose a partial later form.
 worker.onmessage({data:{id:1,packet:buildBrushPacket(records)}});await Promise.resolve();assert.equal(outputs.length,0);
 worker.onmessage({data:{id:0,packet:buildBrushPacket(records)}});
 for(let id=2;id<5;id++){
  while(!worker.messages.some(m=>m.id===id))await Promise.resolve();
  worker.onmessage({data:{id,packet:buildBrushPacket(records)}});
 }
 const stats=await result;assert.deepEqual(outputs,Array.from({length:5},(_,i)=>[bytes,i]));assert.equal(stats.peakQueuedForms,2);assert.equal(stats.peakInFlightParameterBytes,bytes*2);builder.dispose();assert.equal(worker.terminated,1);
});
test('form byte bound keeps oversized forms serial without dropping one, and queue=1 remains serial',async()=>{
 for(const [concurrency,cap]of[[2,1],[1,1e8]]){
  const worker=mock(),builder=createGpuPacketBuilder({workerFactory:()=>worker,maxInFlight:2}),records=recipe.forms.pencil.instances.slice(0,1);let outputs=0;
  const result=prepareSpruceForms(builder,3,()=>({records,prepareShell(){}}),{concurrency,maxInFlightBytes:cap,onResult:()=>outputs++});
  assert.equal(worker.messages.length,1);
  for(let id=0;id<3;id++){
   while(!worker.messages.some(m=>m.id===id))await Promise.resolve();assert.equal(worker.messages.length,id+1);
   worker.onmessage({data:{id,packet:buildBrushPacket(records)}});
  }
  const stats=await result;assert.equal(outputs,3);assert.equal(stats.peakQueuedForms,1);assert.equal(stats.peakInFlightParameterBytes,estimateGpuPacketBytes(records));builder.dispose();
 }
});
test('form setup, derivation, publication, worker failure and cancellation drain both jobs without partial publication',async()=>{
 for(const mode of['shell','derive','publish','worker','abort']){
  const worker=mock(),controller=new AbortController(),builder=createGpuPacketBuilder({workerFactory:()=>worker,maxInFlight:2,signal:controller.signal});
  const error=new Error(mode),outputs=[],records=recipe.forms.pencil.instances.slice(0,1);
  const result=prepareSpruceForms(builder,5,i=>{
   if(mode==='derive'&&i===1)throw error;
   return{records,prepareShell(){if(mode==='shell')throw error;}};
  },{concurrency:2,signal:controller.signal,onResult:p=>{if(mode==='publish')throw error;outputs.push(p);}});
  if(mode==='worker')worker.onerror({message:mode});
  if(mode==='abort')controller.abort();
  if(mode==='publish')worker.onmessage({data:{id:0,packet:buildBrushPacket(records)}});
  await assert.rejects(result,e=>mode==='abort'?e.name==='AbortError':e.message===mode);
  assert.equal(worker.terminated,1);assert.equal(outputs.length,0);worker.onmessage({data:{id:1,packet:{late:true}}});assert.equal(outputs.length,0);
 }
});
test('five actual forms remain byte-identical in serial and bounded prequeue, including every shell attribute',async()=>{
 const THREE=await import('three'),{createSpruceLoader}=await import('./spruce-loading.js');
 const payload=await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url));
 const bytes=await readFile(new URL('../../public/assets/v2/schrenk-spruce-hi.glb',import.meta.url)),loader=createSpruceLoader();
 loader.register(()=>({name:'QUEUE_TEST_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const source=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const fetchImpl=async()=>({ok:true,arrayBuffer:async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength)});
 const options={fetchImpl,workerFactory:null,branches:true,crown:true,volume:true};
 const prepared=loadGpuSpruceRecipeData('fixture',{fetchImpl});
 const old=await loadGpuSpruceRecipe(source,'fixture',{...options,formQueue:1}),next=await loadGpuSpruceRecipe(source,'fixture',{...options,fetchImpl:()=>{throw Error('duplicate fetch');},recipeData:prepared,formQueue:2});
 assert.equal(next.userData.timings.recipePrefetched,true);
 assert.deepEqual(next.gpuPackets,old.gpuPackets);assert.equal(next.userData.parameterBytes,old.userData.parameterBytes);assert.equal(next.userData.brushes,old.userData.brushes);assert.equal(next.userData.needles,old.userData.needles);
 old.scene.traverse(o=>{if(!o.isMesh)return;const a=o.geometry,b=next.scene.getObjectByName(o.name).geometry;assert.deepEqual(b.index?.array,a.index?.array);for(const k of Object.keys(a.attributes))assert.deepEqual(b.attributes[k].array,a.attributes[k].array);});
 assert.equal(old.userData.timings.peakQueuedForms,1);assert.equal(next.userData.timings.peakQueuedForms,2);assert.ok(next.userData.timings.peakInFlightParameterBytes<=24*1024*1024);
 for(const gltf of[old,next])gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});

test('independent recipe preparation validates data and honors transport failure and cancellation',async()=>{
 const payload=await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url));
 const fetchImpl=async()=>({ok:true,arrayBuffer:async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength)});
 const prepared=await loadGpuSpruceRecipeData('fixture',{fetchImpl});assert.deepEqual(prepared.recipe,recipe);
 await assert.rejects(loadGpuSpruceRecipeData('fixture',{fetchImpl:async()=>({ok:false,status:404})}),/404/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadGpuSpruceRecipeData('fixture',{signal:controller.signal,fetchImpl:()=>{throw Error('must not fetch');}}),e=>e.name==='AbortError');
 await assert.rejects(loadGpuSpruceRecipeData('fixture',{fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer})}),/Unsupported/);
});

test('packet timing separates worker duration from realm-independent roundtrip without changing packet',async()=>{
 let time=10;const worker=mock(),builder=createGpuPacketBuilder({workerFactory:()=>worker,maxInFlight:2,now:()=>time});
 const a=builder.build([]);time=20;const b=builder.build([]),pa={id:'A'},pb={id:'B'};
 time=100;worker.onmessage({data:{id:1,packet:pb,timing:{generateMs:12,packingMs:3}}});
 time=120;worker.onmessage({data:{id:0,packet:pa,timing:{generateMs:20,packingMs:0}}});
 assert.strictEqual(await a,pa);assert.strictEqual(await b,pb);assert.deepEqual(pa,{id:'A'});assert.deepEqual(pb,{id:'B'});
 assert.deepEqual(builder.getTiming(pa),{source:'worker',generateMs:20,packingMs:0,roundTripMs:110,nonComputeWaitMs:90});
 assert.deepEqual(builder.getTiming(pb),{source:'worker',generateMs:12,packingMs:3,roundTripMs:80,nonComputeWaitMs:65});
 time=200;worker.onmessage({data:{id:0,packet:pa,timing:{generateMs:999,packingMs:0}}});assert.equal(builder.getTiming(pa).generateMs,20,'duplicate old ID does not alter the accepted timing');builder.dispose();
});
test('failed worker and late old reply cannot contaminate replacement builder timing',async()=>{
 let time=0;const old=mock(),a=createGpuPacketBuilder({workerFactory:()=>old,now:()=>time}),pending=a.build([]);old.onerror({message:'failed'});await assert.rejects(pending,/failed/);
 const fresh=mock(),b=createGpuPacketBuilder({workerFactory:()=>fresh,now:()=>time}),next=b.build([]),late={late:true},ok={ok:true};
 time=50;old.onmessage({data:{id:0,packet:late,timing:{generateMs:40,packingMs:0}}});assert.equal(a.getTiming(late),null);assert.equal(b.getTiming(late),null);
 fresh.onmessage({data:{id:0,packet:ok,timing:{generateMs:5,packingMs:1}}});assert.strictEqual(await next,ok);assert.equal(b.getTiming(ok).nonComputeWaitMs,44);b.dispose();
});
test('missing or corrupt timing leaves data publishable but does not fabricate a measured sample',async()=>{
 for(const timing of[undefined,{generateMs:-1,packingMs:0},{generateMs:NaN,packingMs:0}]){
  const worker=mock(),b=createGpuPacketBuilder({workerFactory:()=>worker}),p={},pending=b.build([]);worker.onmessage({data:{id:0,packet:p,timing}});assert.strictEqual(await pending,p);assert.equal(b.getTiming(p),null);b.dispose();
 }
});
