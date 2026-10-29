import {spruceVolumeEnabled} from './spruce-volume.js';
import {deriveBranchDetail,BRANCH_DETAIL} from './spruce-branch-detail.js';
import * as THREE from 'three';
import {decodeGzipBytes} from './world-data.js';
import {validateSpruceRecipe,validateSpruceRecipeSource} from './spruce-recipe.js';
import {createNearShell,createOpenCrownCore} from './spruce-near-shell.js';
export {createNearShell} from './spruce-near-shell.js';
import {buildBrushPacket,precomputeBrushPacket} from './spruce-brush-packet.js';
const FORMS=['column','edge','old','pencil','young'],WIDTHS={position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1};
const abort=signal=>{if(signal?.aborted)throw new DOMException('GPU spruce loading aborted','AbortError');};
// One worker can receive two immutable groups ahead of main-thread publication.
// This removes idle message round trips without doubling worker CPU contention.
export function estimateGpuPacketBytes(records){
 const firstExtra=records.findIndex(r=>r.variationKey!==undefined),retained=firstExtra<0?records.length:firstExtra,shared=retained!==records.length;
 return records.length*(288*(shared?13:16)*4+117*12*4)+retained*1440*2*4+(shared?16*1440*2*4+records.length*2:0);
}
export function createGpuPacketBuilder({signal,workerFactory,maxInFlight=1,now=()=>performance.now(),compactWrites=new URLSearchParams(globalThis.location?.search||'').get('needlePacketWrites41')==='1'}={}){
 const factory=workerFactory===undefined?(typeof Worker!=='undefined'?()=>new Worker(new URL('./spruce-gpu-worker.js',import.meta.url),{type:'module'}):null):workerFactory;
 let worker,closed=false,id=0;const active=new Map(),packetTimings=new WeakMap(),limit=maxInFlight===2?2:1;
 const stop=()=>{if(closed)return;closed=true;worker?.terminate();signal?.removeEventListener('abort',cancel);};
 const fail=error=>{const pending=[...active.values()];active.clear();stop();for(const task of pending)task.reject(error);};
 const cancel=()=>fail(new DOMException('GPU spruce loading aborted','AbortError'));
 if(signal?.aborted)closed=true;else signal?.addEventListener('abort',cancel,{once:true});
 return{compactWrites,getTiming:packet=>packetTimings.get(packet)||null,async build(records,packing=false){
  abort(signal);if(closed)throw new Error('GPU spruce builder closed');if(active.size>=limit)throw new Error('Concurrent GPU spruce build exceeds bounded queue');
  if(!factory){const start=now(),p=buildBrushPacket(records,{compactWrites}),generated=now(),result=packing?precomputeBrushPacket(p):p,end=now();packetTimings.set(result,Object.freeze({source:'main',generateMs:generated-start,packingMs:end-generated,roundTripMs:end-start,nonComputeWaitMs:0}));return result;}
  if(!worker){
   try{worker=factory();}catch(error){fail(error);throw error;}
   worker.onmessage=({data})=>{const task=active.get(data.id);if(!task)return;if(data.error){fail(new Error(data.error));return;}active.delete(data.id);
    const roundTripMs=Math.max(0,now()-task.started),t=data.timing;
    // Durations use each realm's own monotonic clock. Do not subtract worker
    // timestamps from window timestamps or relabel queue/message wait as CPU.
    if(t&&Number.isFinite(t.generateMs)&&t.generateMs>=0&&Number.isFinite(t.packingMs)&&t.packingMs>=0)packetTimings.set(data.packet,Object.freeze({source:'worker',generateMs:t.generateMs,packingMs:t.packingMs,roundTripMs,nonComputeWaitMs:Math.max(0,roundTripMs-t.generateMs-t.packingMs)}));
    task.resolve(data.packet);};
   worker.onerror=e=>fail(new Error(e.message||'GPU spruce worker message failed'));worker.onmessageerror=worker.onerror;
  }
  return new Promise((resolve,reject)=>{const task={id:id++,resolve,reject,started:now()};active.set(task.id,task);try{worker.postMessage({id:task.id,records,packing,compactWrites});}catch(error){fail(error);}});
 },dispose(){if(active.size)cancel();else stop();}};
}
// The worker starts before independent shell tessellation. Keep both results
// private until successful completion; a shell failure cancels the worker too.
export async function prepareSprucePacketAndShell(builder,records,packing,prepareShell,{overlap=true}={}){
 const pending=builder.build(records,packing);
 pending.catch(()=>{}); // A synchronous shell failure must not leave a rejection unhandled.
 try{
  if(!overlap){const packet=await pending;return{packet,shell:prepareShell()};}
  const shell=prepareShell();return{packet:await pending,shell};
 }catch(error){builder.dispose();await pending.catch(()=>{});throw error;}
}
// Queue immutable form recipes on one worker before synchronous shell setup.
// Completed forms are consumed in original order; the complete scene stays
// private until all five succeed. The byte budget bounds unconsumed packets,
// including replies that arrived early, not just currently executing messages.
export async function prepareSpruceForms(builder,count,getForm,{concurrency=1,maxInFlightBytes=24*1024*1024,overlap=true,packing=false,signal,onResult=()=>{}}={}){
 const limit=concurrency===2?2:1,queue=[],pending=new Set(),stats={formQueue:limit,maxInFlightParameterBytes:maxInFlightBytes,peakQueuedForms:0,peakInFlightParameterBytes:0};
 let next=0,candidate=null,bytes=0;
 try{
  while(next<count||queue.length){
   abort(signal);
   while(next<count&&queue.length<limit){
    candidate??=getForm(next);const estimate=estimateGpuPacketBytes(candidate.records);
    // Keep oversized original forms legal, but never put another behind one.
    if(queue.length&&bytes+estimate>maxInFlightBytes)break;
    const work=builder.build(candidate.records,packing);work.catch(()=>{});pending.add(work);
    queue.push({item:candidate,work,estimate});bytes+=estimate;next++;candidate=null;
    stats.peakQueuedForms=Math.max(stats.peakQueuedForms,queue.length);stats.peakInFlightParameterBytes=Math.max(stats.peakInFlightParameterBytes,bytes);
   }
   const entry=queue[0];let shell,packet;
   if(overlap){shell=entry.item.prepareShell();packet=await entry.work;}
   else{packet=await entry.work;shell=entry.item.prepareShell();}
   abort(signal);onResult(packet,entry.item,shell);
   queue.shift();bytes-=entry.estimate;pending.delete(entry.work);
  }
  return stats;
 }catch(error){builder.dispose();await Promise.allSettled(pending);throw error;}
}
// Transport/JSON validation has no dependency on a loaded hi GLB or canopy.
// Start it with the other ecology assets, but retain source digest validation
// and publication in the original needle transaction.
export async function loadGpuSpruceRecipeData(url='./assets/v2/schrenk-spruce-needle.recipe.json.gz',{fetchImpl=fetch,signal}={}){
 const timings={},start=performance.now();abort(signal);
 const response=await fetchImpl(url,{signal});if(!response.ok)throw new Error('GPU spruce recipe request failed: '+response.status);
 const transport=new Uint8Array(await response.arrayBuffer());timings.fetchMs=performance.now()-start;abort(signal);
 let t=performance.now();const json=await decodeGzipBytes(transport),recipe=JSON.parse(new TextDecoder().decode(json));timings.decodeMs=performance.now()-t;abort(signal);
 t=performance.now();validateSpruceRecipe(recipe);timings.recipeValidateMs=performance.now()-t;abort(signal);
 return {transportBytes:transport.length,json,recipe,timings};
}
export async function loadGpuSpruceRecipe(hi,url='./assets/v2/schrenk-spruce-needle.recipe.json.gz',{fetchImpl=fetch,signal,workerFactory,onPhase,recipeData=null,canopyCache=null,onCanopyRecipe,crown=true,packing=false,branches=false,lazyBranches=branches,volume=spruceVolumeEnabled(),overlap=typeof location==='undefined'||new URLSearchParams(location.search).get('sprucePreparation')!=='serial',formQueue=typeof location==='undefined'?2:Number(new URLSearchParams(location.search).get('needleFormQueue')??2),formQueueBytes=24*1024*1024}={}){
 const started=performance.now(),timings={},mark=(key,t)=>{timings[key]=performance.now()-t;onPhase?.(key,timings[key]);};let t=started;abort(signal);
 const prepared=await (recipeData??loadGpuSpruceRecipeData(url,{fetchImpl,signal}));abort(signal);
 const {json,recipe}=prepared;Object.assign(timings,prepared.timings);timings.recipePrefetched=!!recipeData;
 timings.recipeWaitMs=performance.now()-started;for(const key of ['fetchMs','decodeMs'])onPhase?.(key,timings[key]);
 t=performance.now();await validateSpruceRecipeSource(hi,recipe);mark('validateMs',t);abort(signal);
 if(crown&&branches&&volume)onCanopyRecipe?.(json,{volume:true,crown:true,branches:true,branchDetail:BRANCH_DETAIL});
 let cachedCanopy=canopyCache&&!canopyCache.disabled&&crown&&branches&&volume?canopyCache:null;
 if(cachedCanopy){
  const verifyStart=performance.now();
  try{await Promise.all([cachedCanopy.verifySource('hi',hi),cachedCanopy.verifyRecipe(json,{volume:true,crown:true,branches:true,branchDetail:BRANCH_DETAIL})]);abort(signal);}
  catch(error){if(signal?.aborted)throw error;cachedCanopy.disable(error);cachedCanopy=null;}
  timings.canopyVerifyMs=performance.now()-verifyStart;
 }
 timings.canopyMode=cachedCanopy?'precomputed-indexed':'runtime';
 const scene=hi.scene.clone(true),builder=createGpuPacketBuilder({signal,workerFactory,maxInFlight:formQueue}),owned=new Set(),materials=new Map(),packets=[];let templateMs=0,setupMs=0;
 try{
  const preparationStarted=performance.now();
  const queueStats=await prepareSpruceForms(builder,FORMS.length,index=>{
   const form=FORMS[index],source=scene.getObjectByName(form+'_frond').geometry,detail=branches?deriveBranchDetail(source,recipe.forms[form],index):null;
   let records=detail?.instances||recipe.forms[form].instances;
   if(detail&&lazyBranches){const variants=new Map();for(const r of detail.extras)if(!variants.has(r.variationKey))variants.set(r.variationKey,r);if(variants.size!==16)throw new Error('Spruce short-spray variation set is incomplete');records=[...records.slice(0,detail.originalBrushes),...variants.values()];}
   return{form,detail,records,prepareShell:()=>{
    const setupStart=performance.now(),mesh=scene.getObjectByName(form+'_frond'),g=cachedCanopy?cachedCanopy.createGeometry('near',form+'_frond'):createNearShell(mesh.geometry,recipe.forms[form],{shape:crown,branchDetail:detail,volume});owned.add(g);mesh.geometry=g;mesh.userData={...mesh.userData,lod:'needle',gpuBrushShell:true};
    if(crown){const core=scene.getObjectByName(form+'_core'),coreGeometry=createOpenCrownCore(core.geometry);owned.add(coreGeometry);core.geometry=coreGeometry;}
    setupMs+=performance.now()-setupStart;
   }};
  },{concurrency:formQueue,maxInFlightBytes:formQueueBytes,overlap,packing,signal,onResult:(packet,{detail})=>{
   if(detail){packet.originalBrushes=detail.originalBrushes;if(lazyBranches){packet.brushes=detail.originalBrushes;packet.frames=packet.frames.slice(0,packet.brushes*288*13);packet.wood=packet.wood.slice(0,packet.brushes*117*12);packet.variationKeys=packet.variationKeys.slice(0,packet.brushes);packet.branchLod=detail.lod.slice(0,packet.brushes*4);packet.drawGroups=detail.groups.map(g=>g.extra?{...g,lazy:true,records:detail.instances.slice(g.start,g.start+g.count),lod:detail.lod.slice(g.start*4,(g.start+g.count)*4)}:g);packet.lazyBranches=true;packet.bytes=packet.frames.byteLength+packet.variations.byteLength+packet.wood.byteLength+packet.sharedVariations.byteLength+packet.variationKeys.byteLength;}else{packet.branchLod=detail.lod;packet.drawGroups=detail.groups;}}packets.push(packet);
  }});
  templateMs=performance.now()-preparationStarted;Object.assign(timings,queueStats);
  scene.traverse(o=>{if(o.isMesh){if(!materials.has(o.material)){const m=o.material.clone();m.userData.spruceBranchDetails=branches;materials.set(o.material,m);const association=hi.parser?.associations.get(o.material);if(association)hi.parser.associations.set(m,association);}o.material=materials.get(o.material);}});
  Object.assign(timings,{packetWritesMode:builder.compactWrites?'direct':'legacy',preparationMode:overlap?'overlap-worker-shell':'serial-worker-shell',formPreparationMs:templateMs,templateBuildMs:Math.max(0,templateMs-setupMs),geometrySetupMs:setupMs,parameterPackingMs:packets.reduce((n,p)=>n+(p.packingMs||0),0)});onPhase?.('templateBuildMs',timings.templateBuildMs);onPhase?.('geometrySetupMs',setupMs);
  return{...hi,scene,scenes:[scene],gpuPackets:packets,userData:{representation:'GPU shared 1596-triangle brush; station/needle/twig parameter tables',recipeRevision:recipe.revision,responseBodyBytes:prepared.transportBytes,recipeJSONBytes:json.length,generatedFrondBytes:0,crown:crown?(volume?'twisted-branch-volume-v13':'curved-open-crown-v1'):'source',branchDetail:branches?(lazyBranches?'lazy-spatial-brushes-v12':'spatial-brushes-v12'):'none',potentialShortSprays:packets.reduce((n,p)=>n+(p.drawGroups||[]).filter(g=>g.extra).reduce((a,g)=>a+g.count,0),0),parameterBytes:packets.reduce((n,p)=>n+p.bytes,0),brushes:packets.reduce((n,p)=>n+p.brushes,0),needles:packets.reduce((n,p)=>n+p.brushes*1440,0),timings,buildMs:performance.now()-started}};
 }catch(e){for(const g of owned)g.dispose();for(const m of materials.values())m.dispose();throw e;}finally{builder.dispose();}
}
