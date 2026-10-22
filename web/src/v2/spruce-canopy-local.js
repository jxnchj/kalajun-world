import { CANOPY_FORMS, CANOPY_CACHE_REVISION, canopyDigest, canopySourceDigests, encodeCanopyParts, SpruceCanopyCache } from "./spruce-canopy-cache.js";
import { SPRUCE_CANOPY_BUILD } from "./spruce-canopy-build.js";

// One application-owned database, one replaceable record. No site-wide eviction.
export const CANOPY_LOCAL_DB="kalajun-derived-canopy";
const STORE="canopy",CURRENT="current";
export function canopyCacheMode(search=globalThis.location?.search||""){
 const value=new URLSearchParams(search).get("canopyCache");
 return value==="0"?"off":value==="1"?"network":"local";
}
const abort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException("Canopy cache aborted","AbortError");};
function unavailable(stats,error,phase){
 const message=String(error?.message||error);
 stats.localStatus=phase+"-failed";stats.localReason=message;(stats.warnings??=[]).push(message);
 console.warn("[spruce-canopy-local] "+phase+": "+message+"; full runtime geometry remains available.");
}
// Bound optional storage by opportunities for its callbacks to run. A long
// synchronous terrain/asset task is not evidence that IndexedDB has stalled.
// Blocked opens still fail immediately; an idle, silent request still receives
// the same 1.5 s budget. The excluded event-loop delay is reported separately.
export function canopyLocalRecord(mode,record,{indexedDB=globalThis.indexedDB,signal,timeoutMs=1500,waitStats={},clock={now:()=>performance.now(),setTimeout:(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimeout:id=>globalThis.clearTimeout(id)}}={}){
 return new Promise((resolve,reject)=>{
  let db,transaction,finished=false,value,timer;
  const interval=Math.min(50,timeoutMs);let last=clock.now(),budget=0;Object.assign(waitStats,{eventLoopDelayMs:0,budgetWaitMs:0});
  const finish=(error,result)=>{if(finished)return;finished=true;clock.clearTimeout(timer);signal?.removeEventListener("abort",cancel);if(error)try{transaction?.abort();}catch{}db?.close();error?reject(error):resolve(result);};
  const cancel=()=>finish(signal.reason??new DOMException("Canopy cache aborted","AbortError"));
  if(signal?.aborted){cancel();return;}
  if(!indexedDB){finish(new Error("IndexedDB is unavailable"));return;}
  signal?.addEventListener("abort",cancel,{once:true});
  const watch=()=>{
   const current=clock.now(),elapsed=Math.max(0,current-last);last=current;
   // At most one scheduled interval elapsed while the callback was runnable.
   // Anything beyond it was unavailable scheduler time, not an I/O deadline.
   budget+=Math.min(elapsed,interval);waitStats.eventLoopDelayMs+=Math.max(0,elapsed-interval);waitStats.budgetWaitMs=budget;
   if(budget>=timeoutMs){finish(new Error("IndexedDB "+mode+" timed out without callback progress"));return;}
   timer=clock.setTimeout(watch,Math.min(interval,timeoutMs-budget));
  };
  timer=clock.setTimeout(watch,interval);
  try{
   const request=indexedDB.open(CANOPY_LOCAL_DB,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
   request.onblocked=()=>finish(new Error("IndexedDB open is blocked"));
   request.onerror=()=>finish(request.error||new Error("IndexedDB open failed"));
   request.onsuccess=()=>{
    db=request.result;if(finished){db.close();return;}
    db.onversionchange=()=>db.close();
    try{
     transaction=db.transaction(STORE,mode==="read"?"readonly":"readwrite");
     transaction.oncomplete=()=>finish(null,value);
     transaction.onerror=()=>finish(transaction.error||new Error("IndexedDB "+mode+" failed"));
     transaction.onabort=()=>finish(transaction.error||new Error("IndexedDB "+mode+" aborted"));
     const store=transaction.objectStore(STORE),operation=mode==="read"?store.get(CURRENT):store.put(record,CURRENT);
     operation.onsuccess=()=>{value=operation.result;};
     operation.onerror=()=>finish(operation.error||new Error("IndexedDB "+mode+" request failed"));
    }catch(error){finish(error);}
   };
  }catch(error){finish(error);}
 });
}
export async function loadLocalSpruceCanopyCache({stats={},build=SPRUCE_CANOPY_BUILD,signal,...storage}={}){
 const started=performance.now(),waitStats={};Object.assign(stats,{mode:"local",localStatus:"reading",networkBytes:0});
 try{
  abort(signal);if(!build?.inputKey)throw new Error("Missing canopy build key");
  const record=await canopyLocalRecord("read",null,{...storage,signal,waitStats});abort(signal);
  if(!record){stats.localStatus="miss";stats.status="runtime";return null;}
  if(record.inputKey!==build.inputKey){stats.localStatus="stale";stats.localReason="Stored canopy belongs to another build";stats.status="runtime";return null;}
  if(!(record.data instanceof Uint8Array)||record.manifest?.inputKey!==build.inputKey)throw new Error("Invalid local canopy record");
  const metadata=new TextEncoder().encode(JSON.stringify(record.manifest));
  const [dataDigest,metadataDigest]=await Promise.all([canopyDigest(record.data),canopyDigest(metadata)]);abort(signal);
  if(dataDigest!==record.dataDigest||metadataDigest!==record.metadataDigest)throw new Error("Local canopy checksum mismatch");
  const cache=new SpruceCanopyCache(record.manifest,record.data,{stats});
  stats.localStatus="hit";stats.localBytes=record.data.byteLength;return cache;
 }catch(error){if(signal?.aborted)throw error;unavailable(stats,error,"read");stats.status="runtime";return null;}
 finally{stats.localReadMs=performance.now()-started;stats.localSchedulerDelayMs=waitStats.eventLoopDelayMs??0;stats.localWaitBudgetMs=waitStats.budgetWaitMs??0;}
}

// World-data network I/O is an earlier idle window than ecology.load(), whose
// siblings start synchronous terrain/water preparation in the same task.
export function prepareLocalCanopyLookup({search=globalThis.location?.search||"",lifecycle=globalThis,...options}={}){
 const params=new URLSearchParams(search);
 if(canopyCacheMode(search)!=="local"||params.get("spruceVolume")==="0"||params.get("needleCrown")==="0"||params.get("needleBranches")==="0"||(params.get("needleGpu")||"stations")!=="stations")return null;
 const controller=new AbortController(),stats=options.stats??{enabled:true,status:"loading"};
 stats.prefetch=true;stats.prefetchStartedMs=performance.now();
 const cancel=reason=>controller.abort(reason),onPageHide=()=>cancel(new DOMException("Canopy page closed","AbortError"));
 lifecycle.addEventListener?.("pagehide",onPageHide,{once:true});
 const ready=loadLocalSpruceCanopyCache({...options,stats,signal:controller.signal}).finally(()=>lifecycle.removeEventListener?.("pagehide",onPageHide));
 ready.catch(()=>{}); // Consumer may not exist yet if world-data loading fails.
 return{ready,stats,cancel};
}

function geometryView(g){
 // Keep original BufferAttributes, not copies. Ecology may rename attributes in
 // another container and dispose the source geometry after its templates exist.
 if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingSphere)g.computeBoundingSphere();
 return{attributes:{...g.attributes},index:g.index,boundingBox:g.boundingBox.clone(),boundingSphere:g.boundingSphere.clone(),
  groups:g.groups.map(x=>({...x})),drawRange:{...g.drawRange},userData:structuredClone(g.userData)};
}
export class LocalCanopyCapture{
 constructor({stats={},build=SPRUCE_CANOPY_BUILD,signal,...storage}={}){
  this.stats=stats;this.build=build;this.controller=new AbortController();this.signal=this.controller.signal;this.parentSignal=signal;this.cancel=()=>this.controller.abort(signal.reason);
  if(signal?.aborted)this.cancel();else signal?.addEventListener("abort",this.cancel,{once:true});
  this.storage=storage;this.sources={};this.parts={};this.recipe=null;this.disposed=false;this.pending=null;
 }
 captureSource(lod,gltf){
  if(this.disposed)return;
  const meshes=new Map(CANOPY_FORMS.map(form=>{const name=form+"_frond",mesh=gltf.scene.getObjectByName(name);return[name,{isMesh:true,geometry:{attributes:{...mesh.geometry.attributes},index:mesh.geometry.index,getAttribute(name){return this.attributes[name];}}}];}));
  this.sources[lod]={scene:{getObjectByName:name=>meshes.get(name)}};
 }
 captureRecipe(bytes,contract){if(!this.disposed){this.recipe=bytes;this.contract=structuredClone(contract);}}
 captureParts(lod,gltf){if(!this.disposed)for(const form of CANOPY_FORMS){const name=form+"_frond";this.parts[lod+":"+name]=geometryView(gltf.scene.getObjectByName(name).geometry);}}
 release(){this.sources={};this.parts={};this.recipe=null;this.contract=null;this.parentSignal?.removeEventListener("abort",this.cancel);}
 dispose(){this.disposed=true;this.controller.abort();this.release();}
 persist(){
  if(this.pending)return this.pending;
  if(this.disposed||this.signal?.aborted)return Promise.resolve(false);
  this.pending=this.save();return this.pending;
 }
 async save(){
  const started=performance.now(),stats=this.stats;stats.persistStatus="preparing";
  try{
   abort(this.signal);if(!this.build?.inputKey||!this.sources.hi||!this.sources.mid||!this.recipe||Object.keys(this.parts).length!==15)throw new Error("Incomplete canopy capture; refusing to store partial geometry");
   const check=()=>{abort(this.signal);if(this.disposed)throw new Error("Canopy capture disposed");};
   const [hi,mid,recipeDigest]=await Promise.all([canopySourceDigests(this.sources.hi),canopySourceDigests(this.sources.mid),canopyDigest(this.recipe)]);check();
   const t=performance.now(),encoded=encodeCanopyParts(this.parts,{revision:CANOPY_CACHE_REVISION,inputKey:this.build.inputKey,sourceDigests:{hi,mid},recipeDigest,nearContract:this.contract});
   stats.persistPackMs=performance.now()-t;
   const [dataDigest,metadataDigest]=await Promise.all([canopyDigest(encoded.data),canopyDigest(new TextEncoder().encode(JSON.stringify(encoded.manifest)))]);check();
   // Validate all shapes/ranges before committing; the next reader separately
   // verifies original GLB attributes and recipe before any cached draw is used.
   new SpruceCanopyCache(encoded.manifest,encoded.data);
   await canopyLocalRecord("write",{inputKey:this.build.inputKey,manifest:encoded.manifest,data:encoded.data,dataDigest,metadataDigest},{...this.storage,signal:this.signal});check();
   Object.assign(stats,{persistStatus:"stored",persistBytes:encoded.data.byteLength,persistParts:15,persistArrays:Object.values(encoded.manifest.parts).reduce((n,p)=>n+Object.keys(p.attributes).length+1,0)});return true;
  }catch(error){
   stats.persistStatus=this.disposed||this.signal?.aborted?"cancelled":"failed";
   if(stats.persistStatus==="failed")unavailable(stats,error,"write");return false;
  }finally{stats.persistMs=performance.now()-started;this.release();}
 }
}
