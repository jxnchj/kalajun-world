import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import * as T from "three";
import {CANOPY_FORMS,canopyDigest,loadSpruceCanopyCache} from "./spruce-canopy-cache.js";
import {createSpruceLoader} from "./spruce-loading.js";
import {canopyCacheMode,canopyLocalRecord,loadLocalSpruceCanopyCache,LocalCanopyCapture,CANOPY_LOCAL_DB,prepareLocalCanopyLookup} from "./spruce-canopy-local.js";

// Requests complete before transactions. Only a successful commit changes data.
function storage(initial,{fail,blocked=false,beforeCommit}={}){
 const state={record:initial,opens:0,writes:0,closed:0,names:[],aborts:0};
 const indexedDB={open(name){state.opens++;state.names.push(name);const request={};queueMicrotask(()=>{
  if(blocked){request.onblocked?.();return;}
  if(fail==="open"){request.error=new Error("open denied");request.onerror?.();return;}
  const db={objectStoreNames:{contains:()=>true},close(){state.closed++;},transaction(store){
   assert.equal(store,"canopy");let aborted=false,pending;
   const tx={abort(){if(!aborted){aborted=true;state.aborts++;queueMicrotask(()=>tx.onabort?.());}},objectStore(){
    const run=(value,key,write)=>{assert.equal(key,"current");if(write){state.writes++;pending=structuredClone(value);}const operation={};queueMicrotask(()=>{
     if(aborted)return;if(fail===(write?"write":"read")){operation.error=new Error((write?"write":"read")+" denied");operation.onerror?.();return;}
     operation.result=write?key:structuredClone(state.record);operation.onsuccess?.();queueMicrotask(()=>{
      if(write)beforeCommit?.();if(aborted)return;if(write&&fail==="commit"){tx.error=new Error("quota commit refused");tx.onabort?.();return;}
      if(write)state.record=pending;tx.oncomplete?.();
     });
    });return operation;};return{get:key=>run(null,key,false),put:(value,key)=>run(value,key,true)};
   }};return tx;
  }};request.result=db;request.onsuccess?.();
 });return request;}};return{indexedDB,state};
}
const build={inputKey:"local-fixture-v1"};
function source(offset=0){const scene=new T.Group();for(let i=0;i<5;i++){
 const g=new T.BoxGeometry(1,2,1);g.translate(i+offset,1,0);g.setAttribute("_plant_wind",new T.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(.25),3));g.setAttribute("_crown_occlusion",new T.Float32BufferAttribute(Array(g.attributes.position.count).fill(.7),1));const mesh=new T.Mesh(g);mesh.name=CANOPY_FORMS[i]+"_frond";scene.add(mesh);
 }return{scene};}
function prepare(options={}){
 const hi=source(),mid=source(10),near=source(20),recipe=new TextEncoder().encode("verified recipe"),contract={volume:true,crown:true,branches:true,branchDetail:{revision:12}},stats={};
 for(const mesh of near.scene.children)mesh.geometry.setAttribute("aSprayLod",new T.Float32BufferAttribute(Array(mesh.geometry.attributes.position.count*4).fill(.5),4));
 const capture=new LocalCanopyCapture({build,stats,...options});capture.captureSource("hi",hi);capture.captureSource("mid",mid);capture.captureRecipe(recipe,contract);for(const[lod,gltf]of[["hi",hi],["mid",mid],["near",near]])capture.captureParts(lod,gltf);
 return{capture,stats,hi,mid,near,recipe,contract};
}
async function silence(fn){const warnings=[],warn=console.warn;console.warn=message=>warnings.push(message);try{return await fn(warnings);}finally{console.warn=warn;}}

test("default local, explicit complete disable, and opt-in network experiment",()=>{
 assert.equal(canopyCacheMode(""),"local");assert.equal(canopyCacheMode("?canopyCache=0"),"off");assert.equal(canopyCacheMode("?canopyCache=1"),"network");
});

test("miss/stale perform no network request or storage mutation",async()=>{
 const empty=storage(),stats={};assert.equal(await loadLocalSpruceCanopyCache({...empty,build,stats}),null);assert.equal(stats.localStatus,"miss");assert.equal(stats.networkBytes,0);assert.equal(empty.state.writes,0);
 const stale=storage({inputKey:"previous-build"}),oldStats={};assert.equal(await loadLocalSpruceCanopyCache({...stale,build,stats:oldStats}),null);assert.equal(oldStats.localStatus,"stale");assert.equal(stale.state.record.inputKey,"previous-build");assert.deepEqual(empty.state.names,[CANOPY_LOCAL_DB]);assert.equal(empty.state.closed,1);
});

test("post-frame capture retains 95 arrays through source rename/dispose and revalidates on hit",async()=>{
 const db=storage(),f=prepare(db),reference=Object.fromEntries(Object.entries(f.capture.parts).map(([key,g])=>[key,{attributes:{...g.attributes},index:g.index}]));assert.equal(db.state.opens,0);
 for(const gltf of[f.hi,f.mid,f.near])for(const mesh of gltf.scene.children){mesh.geometry.setAttribute("aPlantWind",mesh.geometry.attributes._plant_wind);mesh.geometry.deleteAttribute("_plant_wind");mesh.geometry.dispose();}
 assert.equal(await f.capture.persist(),true);assert.equal(f.stats.persistArrays,95);assert.equal(f.stats.persistParts,15);assert.equal(f.stats.persistStatus,"stored");assert.deepEqual(f.capture.parts,{});assert.deepEqual(f.capture.sources,{});assert.equal(f.capture.recipe,null);
 const stats={},cache=await loadLocalSpruceCanopyCache({...db,build,stats});assert.equal(stats.localStatus,"hit");assert.equal(stats.networkBytes,0);assert.throws(()=>cache.createGeometry("near","column_frond"),/verified/);
 await Promise.all([cache.verifySource("hi",source()),cache.verifySource("mid",source(10))]);await cache.verifyRecipe(f.recipe,f.contract);
 for(const[key,original]of Object.entries(reference)){const g=cache.createGeometry(...key.split(":"));for(const name of[...Object.keys(original.attributes),"index"]){const a=name==="index"?original.index:original.attributes[name],b=name==="index"?g.index:g.attributes[name];assert.equal(a.array.constructor,b.array.constructor);assert.equal(a.itemSize,b.itemSize);assert.equal(a.normalized,b.normalized);assert.deepEqual(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),new Uint8Array(b.array.buffer,b.array.byteOffset,b.array.byteLength));}}
 assert.equal(stats.usedParts.length,15);assert.equal(db.state.writes,1);assert.equal(await f.capture.persist(),true);assert.equal(db.state.writes,1);
});

test("corrupt payload and corrupt shape recover visibly before exposing geometry",async()=>silence(async warnings=>{
 const db=storage(),f=prepare(db);await f.capture.persist();db.state.record.data[0]^=1;let stats={};assert.equal(await loadLocalSpruceCanopyCache({...db,build,stats}),null);assert.equal(stats.localStatus,"read-failed");assert.match(stats.localReason,/checksum/);
 const good=storage(),g=prepare(good);await g.capture.persist();delete good.state.record.manifest.parts["near:young_frond"];good.state.record.metadataDigest=await canopyDigest(new TextEncoder().encode(JSON.stringify(good.state.record.manifest)));stats={};assert.equal(await loadLocalSpruceCanopyCache({...good,build,stats}),null);assert.match(stats.localReason,/15/);assert.equal(warnings.length,2);
}));

test("unavailable/denied/blocked/stalled IndexedDB cannot hang startup",async()=>silence(async warnings=>{
 for(const options of[{indexedDB:null},{...storage(undefined,{fail:"open"})},{...storage(undefined,{fail:"read"})},{...storage(undefined,{blocked:true})},{indexedDB:{open(){return{};}},timeoutMs:5}]){const stats={};assert.equal(await loadLocalSpruceCanopyCache({...options,build,stats}),null);assert.equal(stats.localStatus,"read-failed");assert.equal(stats.status,"runtime");}assert.equal(warnings.length,5);
}));

test("write request/commit rejection keeps old record and releases captures",async()=>silence(async warnings=>{
 for(const fail of["write","commit"]){const old={inputKey:"old"},db=storage(old,{fail}),f=prepare(db);assert.equal(await f.capture.persist(),false);assert.equal(f.stats.persistStatus,"failed");assert.deepEqual(f.capture.parts,{});assert.deepEqual(f.capture.sources,{});assert.equal(f.capture.recipe,null);assert.strictEqual(db.state.record,old);}assert.equal(warnings.length,2);
}));

test("dispose before/during persistence aborts and never commits expired geometry",async()=>{
 const db=storage(),f=prepare(db);f.capture.dispose();assert.equal(await f.capture.persist(),false);assert.equal(db.state.opens,0);assert.deepEqual(f.capture.parts,{});
 let capture;const writing=storage(undefined,{beforeCommit:()=>capture.dispose()}),g=prepare(writing);capture=g.capture;assert.equal(await capture.persist(),false);assert.equal(writing.state.record,undefined);assert.equal(g.stats.persistStatus,"cancelled");assert.equal(writing.state.aborts,1);assert.deepEqual(capture.parts,{});
 const controller=new AbortController();controller.abort();await assert.rejects(canopyLocalRecord("read",null,{...db,signal:controller.signal}),/abort/i);
});

test("successful generation replaces only current key; source/recipe verification remains mandatory",async()=>{
 const db=storage({inputKey:"old"}),f=prepare(db);assert.equal(await f.capture.persist(),true);assert.equal(db.state.record.inputKey,build.inputKey);assert.equal(db.state.writes,1);assert.equal(db.state.closed,1);const hit=await loadLocalSpruceCanopyCache({...db,build});await assert.rejects(hit.verifySource("hi",source(1)),/fingerprint/);await assert.rejects(hit.verifyRecipe(new TextEncoder().encode("changed"),f.contract),/recipe/);
});

test("real 18 MB/95-array local record is bit-exact without regenerating geometry",async()=>{
 const assetFetch=async url=>new Response(await readFile(new URL("../../public/"+url.replace(/^\.\//,""),import.meta.url)));const packaged=await loadSpruceCanopyCache({fetchImpl:assetFetch});
 const loader=createSpruceLoader();loader.register(()=>({name:"TEXTURE_STUB",loadTexture:()=>Promise.resolve(new T.Texture())}));const sources={};
 for(const lod of["hi","mid"]){const bytes=await readFile(new URL("../../public/assets/v2/schrenk-spruce-"+lod+".glb",import.meta.url));sources[lod]=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");await packaged.verifySource(lod,sources[lod]);}
 const recipe=new Uint8Array(gunzipSync(await readFile(new URL("../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz",import.meta.url))));await packaged.verifyRecipe(recipe,packaged.manifest.nearContract);
 const db=storage(),stats={},capture=new LocalCanopyCapture({...db,stats});for(const lod of["hi","mid"])capture.captureSource(lod,sources[lod]);capture.captureRecipe(recipe,packaged.manifest.nearContract);
 for(const lod of["hi","mid","near"]){const scene=new T.Group();for(const form of CANOPY_FORMS){const mesh=new T.Mesh(packaged.createGeometry(lod,form+"_frond"));mesh.name=form+"_frond";scene.add(mesh);}capture.captureParts(lod,{scene});}
 assert.equal(await capture.persist(),true);assert.equal(stats.persistArrays,95);assert.equal(stats.persistBytes,18244324);assert.deepEqual(db.state.record.data,packaged.data);const restored=await loadLocalSpruceCanopyCache({...db});assert.deepEqual(restored.data,packaged.data);assert.equal(restored.stats.localStatus,"hit");assert.equal(restored.stats.networkBytes,0);
});

function manualClock(){
 let time=0,next=0;const timers=new Map();
 return{now:()=>time,setTimeout(fn,delay){const id=++next;timers.set(id,{fn,due:time+delay});return id;},clearTimeout(id){timers.delete(id);},
  advance(to){time=to;const due=[...timers].filter(([,task])=>task.due<=time);for(const[id,task]of due){if(timers.delete(id))task.fn();}},pending:()=>timers.size};
}

test("a queued IDB completion survives a 2 s main-thread stall without extending idle timeout budget",async()=>{
 const clock=manualClock(),db=storage(),stats={};
 const pending=loadLocalSpruceCanopyCache({...db,build,stats,clock});
 // Simulate a synchronous terrain/water task preventing both IDB callbacks and
 // the watchdog from executing. Run the overdue watchdog first, then IDB.
 clock.advance(2000);
 assert.equal(await pending,null);assert.equal(stats.localStatus,"miss");assert.equal(stats.localSchedulerDelayMs,1950);assert.equal(stats.localWaitBudgetMs,50);assert.equal(clock.pending(),0);assert.equal(db.state.closed,1);
 const quiet=manualClock(),failed=canopyLocalRecord("read",null,{indexedDB:{open(){return{};}},clock:quiet});
 const rejection=assert.rejects(failed,/timed out/);
 for(let t=50;t<=1500;t+=50)quiet.advance(t);
 await rejection;assert.equal(quiet.pending(),0,"stalled storage still exhausts the original 1.5 s of runnable wait");
});

test("early lookup starts before world dependencies and is absent for off/network/incompatible experiments",async()=>{
 for(const search of["?canopyCache=0","?canopyCache=1","?spruceVolume=0","?needleGpu=0","?needleGpu=tex","?needleCrown=0","?needleBranches=0"]){const db=storage();assert.equal(prepareLocalCanopyLookup({...db,build,search}),null);assert.equal(db.state.opens,0);}
 const db=storage(),listeners=new Set(),lifecycle={addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
 const lookup=prepareLocalCanopyLookup({...db,build,search:"",lifecycle});assert.equal(db.state.opens,1);assert.equal(listeners.size,1);assert.equal(await lookup.ready,null);assert.equal(lookup.stats.localStatus,"miss");assert.equal(lookup.stats.prefetch,true);assert.equal(listeners.size,0);
});

test("pagehide/consumer abort cancel early storage lookup and remove the watchdog/listener",async()=>{
 for(const pageHide of[true,false]){
  const clock=manualClock(),listeners=new Set(),lifecycle={addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
  const lookup=prepareLocalCanopyLookup({indexedDB:{open(){return{};}},clock,build,search:"",lifecycle});
  const rejected=assert.rejects(lookup.ready,/abort|closed/i);
  if(pageHide)[...listeners][0]();else lookup.cancel(new DOMException("Consumer aborted","AbortError"));
  await rejected;assert.equal(clock.pending(),0);assert.equal(listeners.size,0);
 }
});


test("default native timers retain the browser global receiver during read/write and cancellation",async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let scheduled=0,cleared=0;
 globalThis.setTimeout=function(fn,ms){assert.strictEqual(this,globalThis,"browser setTimeout requires Window/global receiver");scheduled++;return originalSet.call(globalThis,fn,ms);};
 globalThis.clearTimeout=function(id){assert.strictEqual(this,globalThis,"browser clearTimeout requires Window/global receiver");cleared++;return originalClear.call(globalThis,id);};
 try{
  const db=storage();assert.equal(await canopyLocalRecord("read",null,db),undefined);
  await canopyLocalRecord("write",{complete:true},db);assert.deepEqual(db.state.record,{complete:true});
  const controller=new AbortController(),pending=canopyLocalRecord("read",null,{indexedDB:{open(){return{};}},signal:controller.signal});
  controller.abort();await assert.rejects(pending,/abort/i);assert.equal(scheduled,3);assert.equal(cleared,3);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
