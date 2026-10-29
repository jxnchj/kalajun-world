import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {SoftwareReview75} from './software-review75.js';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function destinationFixture(){
 const calls=[],element={classList:{add(){},remove(){}}};let closed=false;
 const context={initialReviewPending75:false,viewGeneration:1,preparing:false,$:()=>element,reviewDestinationTail75:Promise.resolve(),softwareReview75:{waitForIdle:async()=>{if(closed)throw Error('closed');},preparing(){calls.push('own');},drain:async()=>calls.push('drain'),destinationReady:()=>calls.push('ready'),abort:()=>{closed=true;calls.push('abort');}},terrain:{cancelPreparation(){}},performance:{now:()=>123},prepareScene:async()=>{calls.push('scene');return{ready:true};},compileDestination:async()=>{calls.push('compile');},localShadowWindow42:{enabled:false},yieldBeforeShadow75(){},lastPreparation:null,selectedView:'test',frames:[],last:0,setTimeout(){}};
 const a=main.indexOf('  prepareDestination=async()=>{'),b=main.indexOf('  document.addEventListener("visibilitychange"',a);
 const source=main.slice(a,b).trim().replace(/^prepareDestination=/,'').replace(/;$/,'');
 const prepare=vm.runInNewContext('('+source+')',context);return{prepare,context,calls};
}
test('actual destination preparation serializes entire old async compiler before latest destination owns GPU work',async()=>{
 const f=destinationFixture(),old=deferred();let count=0;
 f.context.compileDestination=async()=>{f.calls.push('compile'+(++count));if(count===1)await old.promise;};
 const a=f.prepare();await tick();assert.deepEqual(f.calls,['own','scene','compile1']);
 f.context.viewGeneration=2;const b=f.prepare();await tick();assert.deepEqual(f.calls,['own','scene','compile1']);
 old.resolve();await Promise.all([a,b]);assert.deepEqual(f.calls,['own','scene','compile1','drain','own','scene','compile2','drain','ready']);assert.equal(f.context.lastPreparation.generation,2);
});
test('actual queued stale destination exits before preparation and failure releases queue without reopening failed scheduler',async()=>{
 const f=destinationFixture(),old=deferred();f.context.compileDestination=async()=>{f.calls.push('compile');await old.promise;};
 const a=f.prepare();await tick();f.context.viewGeneration=2;const b=f.prepare();f.context.viewGeneration=3;const c=f.prepare();old.resolve();await Promise.all([a,b,c]);assert.equal(f.calls.filter(x=>x==='scene').length,2);assert.equal(f.context.lastPreparation.generation,3);
 const bad=destinationFixture(),failure=deferred();bad.context.compileDestination=()=>failure.promise;const x=bad.prepare();await tick();bad.context.viewGeneration=2;const y=bad.prepare();const rejected=Promise.all([assert.rejects(x,/compile failed/),assert.rejects(y,/closed/)]);failure.reject(Error('compile failed'));await rejected;assert.equal(bad.calls.filter(x=>x==='scene').length,1);
});
test('destination events during initial gated frame do not create a competing preparation owner',async()=>{
 const f=destinationFixture();f.context.initialReviewPending75=true;await f.prepare();assert.deepEqual(f.calls,[]);
});
test('actual first-frame QA loop re-prepares after generation changes at pre-draw and completed-draw awaits',async()=>{
 const firstDrain=deferred(),firstDraw=deferred(),calls=[];let drains=0,draws=0;
 const context={softwareReview75:{drain:async()=>{if(++drains===1)await firstDrain.promise;},preparing(){},destinationReady(){},completeInitial:async signature=>{calls.push(['complete',signature.generation]);if(++draws===1)await firstDraw.promise;}},initialReviewGeneration75:1,viewGeneration:1,initialReviewPending75:true,measureLoad:async(name,fn)=>fn(),prepareScene:async(budget,generation)=>{calls.push(['prepare',generation]);return{ready:true};},structures:{update(){}},camera:{},compileDestination:async()=>{},localShadowWindow42:{enabled:false},yieldBeforeShadow75(){},renderWorld(){calls.push(['draw',context.viewGeneration]);},scene:{},reviewSignature75:()=>({generation:context.viewGeneration}),performance:{now:()=>123},loadTimings:{},initialPreparation:null};
 const a=main.indexOf('  if(softwareReview75){\n    for(;;){'),b=main.indexOf('  loadTimings.firstFrameNewPrograms',a);
 const run=vm.runInNewContext('(async()=>{'+main.slice(a,b)+'})',context),p=run();await tick();context.viewGeneration=2;firstDrain.resolve();await tick();assert.equal(draws,1);assert.deepEqual(calls.slice(0,3),[['prepare',2],['draw',2],['complete',2]]);
 context.viewGeneration=3;firstDraw.resolve();await p;assert.deepEqual(calls.slice(3),[['prepare',3],['draw',3],['complete',3]]);assert.equal(context.initialReviewPending75,false);assert.equal(context.initialReviewGeneration75,3);
});
test('disabled first-frame branch retains exactly one original render and never calls QA preparation',async()=>{
 let renders=0;const context={softwareReview75:null,measureLoad:async(name,fn)=>{assert.equal(name,'firstFrame');return fn();},renderWorld:()=>{renders++;},scene:{},camera:{}};
 const a=main.indexOf('  if(softwareReview75){\n    for(;;){'),b=main.indexOf('  loadTimings.firstFrameNewPrograms',a);await vm.runInNewContext('(async()=>{'+main.slice(a,b)+'})()',context);assert.equal(renders,1);
});
test('actual compiler entry rejects aborted QA before any GPU owner is touched',()=>{
 let touches=0;const context={softwareReview75:{assertOpen(){throw Error('aborted QA');}},ecology:{get gpuBrushes(){touches++;throw Error('unexpected GPU work');}}};
 const a=main.indexOf('  const compileDestination=()=>{'),b=main.indexOf('  structures.lodgeStream.finalize=',a);const source=main.slice(a,b).trim().replace(/^const compileDestination=/,'').replace(/;$/,'');const compile=vm.runInNewContext('('+source+')',context);assert.throws(compile,/aborted QA/);assert.equal(touches,0);
});
test('main retains original rendering owners, explicit full QA preparation and guarded bypasses',()=>{
 // Immutable golden from commit 8ea4753, not the current file under test.
 // Embedded so installed/exported checkouts never depend on staging layout or git.
 const originalRenderWorld="  const renderWorld=(scene,renderCamera,colorViewsPrepared=false)=>opaqueDepthOrder.run(renderCamera,()=>{\n    if(meadowViews.enabled&&!colorViewsPrepared)syncColorVisibility41();\n    if(meadowRootWind.enabled)meadowRootWind.update(renderer);\n    if(meadowClusterWind.enabled)meadowClusterWind.update(renderer);\n    roomShadowAtlas42.prepare(scene,renderCamera);\n    grassShadowCoverage41.render();\n    water.prepareRefraction(renderer,renderCamera,worldFrame?.target);\n    return treePhotoPrepass.run(renderCamera,()=>worldFrame?worldFrame.render(scene,renderCamera):renderer.render(scene,renderCamera));\n  });\n";
 const start='  const renderWorld=',end='  const canopyLookup=';
 assert.equal(main.slice(main.indexOf(start),main.indexOf(end)).replace('    softwareReview75?.assertOpen();\n',''),originalRenderWorld);
 assert.match(main,/maxMs:softwareReview75\?210000:maxMs,waitFor:softwareReview75\?"all":"near"/);
 assert.match(main,/while\(localShadowWindow42.controller\?\.pending\)await localShadowWindow42.controller.pending/);
 assert.match(main,/terrain.cancelPreparation\(\);cancelLodgeRetry\?\.\(\);localShadowWindow42.dispose\(\)/);
 assert.match(main,/photo-save"\)\.addEventListener\("click",\(\)=>\{\s+renderWorld\(scene,camera\);/);
 assert.match(main,/if\(softwareReview75\)throw Error\("Use the visible Software QA single-step controls/);
 assert.equal(main.includes('houseTextiles62'),false,'no textile ownership rewiring relative to 8ea4753');
});


test('stale native prewarm must finish GPU drain before handing ownership to the next destination',async()=>{
 const f=destinationFixture(),releaseGPU=deferred();let warm=0,drains=0;
 f.context.localShadowWindow42={enabled:true,prepare:async()=>{f.calls.push('native-prewarm');if(++warm===1)f.context.viewGeneration=2;}};
 f.context.softwareReview75.drain=async()=>{f.calls.push('drain');if(++drains===1)await releaseGPU.promise;};
 const old=f.prepare();await tick();assert.equal(drains,1);const next=f.prepare();await tick();assert.equal(f.calls.filter(x=>x==='scene').length,1,'new CPU/GPU preparation cannot cross unsignaled stale prewarm');releaseGPU.resolve();await Promise.all([old,next]);assert.equal(f.calls.filter(x=>x==='scene').length,2);assert.equal(f.context.lastPreparation.generation,2);
});


test('QA explicitly rejects runtime resize without clearing the completed canvas; normal resize is unchanged',()=>{
 const start=main.indexOf('  addEventListener("resize",'),end=main.indexOf('  resize();',start),source=main.slice(start,end);let listener,normalResizes=0,errors=[];
 for(const enabled of[false,true]){const context={softwareReview75:enabled?{}:null,addEventListener:(name,fn)=>{listener=fn;},resize:()=>normalResizes++,fail:e=>errors.push(e.message)};vm.runInNewContext(source,context);listener();}
 assert.equal(normalResizes,1);assert.equal(errors.length,1);assert.match(errors[0],/fixed viewport/);assert.match(main,/viewport:\{width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio\(\)\}/);
});


test('actual scheduler and actual destination success release into ready/held, never a preparation-fence deadlock',async()=>{
 for(const paused of[false,true]){
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,fenceSync:()=>({}),clientWaitSync:()=>2,deleteSync(){},flush(){},isContextLost:()=>false};
  const review=new SoftwareReview75({gl,pollMs:1}),f=destinationFixture();f.context.softwareReview75=review;if(paused)review.pause();
  await f.prepare();assert.equal(f.context.preparing,false);assert.equal(review.phase,paused?'held':'ready');assert.equal(review.counts.completedPreparationFences,1);assert.equal(Boolean(review.beginFrame()),!paused);review.dispose();
 }
});
