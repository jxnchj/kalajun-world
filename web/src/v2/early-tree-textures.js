import {CompileTextureQueue} from './compile-textures.js';
const clock={now:()=>performance.now(),set:fn=>setTimeout(fn,0),clear:id=>clearTimeout(id)};

// Borrow only finalized source textures. No scene/camera, asset requests,
// replacement samplers, draws, or independently owned GPU resources.
export class EarlyTreeTextures {
 constructor(renderer,{signal,onFailure=()=>{},scheduler=clock}={}){
  this.renderer=renderer;this.signal=signal;this.onFailure=onFailure;this.clock=scheduler;
  this.jobs=[];this.seen=new WeakMap();this.listeners=new Map();this.timer=null;this.sealed=false;this.settled=false;
  this.stats={enabled:true,status:'waiting',startedAtMs:scheduler.now(),firstUploadAtMs:null,completedAtMs:null,
   selected:0,duplicates:0,initialized:0,alreadyInitialized:0,skipped:0,uploadTotalMs:0,maxUploadMs:0,sources:[]};
  this.ready=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});this.ready.catch(()=>{});
  this.onAbort=()=>this.stop(signal.reason??new DOMException('Early tree texture preparation aborted','AbortError'),'cancelled');
  signal?.addEventListener('abort',this.onAbort,{once:true});if(signal?.aborted)this.onAbort();
 }
 enqueue(name,value){
  if(!['hi','mid','far'].includes(name)||!value)return;
  if(this.settled){if(this.stats.status==='complete')throw new Error('Tree texture source arrived after publication');return;}
  if(this.sealed)throw new Error('Tree texture source arrived after seal');
  const materials=new Set();
  if(name==='far')materials.add(value); // real albedo/normal DataArrayTexture objects
  else value.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  const queue=new CompileTextureQueue(this.renderer,materials,this.clock.now),originalCount=queue.textures.length;
  queue.textures=queue.textures.filter(texture=>{
   if(this.seen.get(texture)===texture.version)return false;
   this.seen.set(texture,texture.version);
   if(!this.listeners.has(texture)){
    const disposed=()=>this.stop(new Error('Pending tree texture disposed: '+(texture.name||texture.uuid)),'failed');
    texture.addEventListener('dispose',disposed);this.listeners.set(texture,disposed);
   }
   return true;
  });
  queue.stats.selected=queue.textures.length;queue.stats.status=queue.pending?'waiting':'complete';
  const record={name,readyAtMs:this.clock.now(),firstStepAtMs:null,completedAtMs:null,duplicates:originalCount-queue.textures.length,queue:queue.stats};
  this.stats.sources.push(record);this.stats.selected+=queue.textures.length;this.stats.duplicates+=record.duplicates;
  if(queue.pending)this.jobs.push({queue,record});else record.completedAtMs=this.clock.now();
  this.schedule();
 }
 schedule(){if(!this.settled&&this.timer===null&&this.jobs.length)this.timer=this.clock.set(()=>this.step());}
 step(){
  this.timer=null;if(this.settled)return;
  const job=this.jobs[0];if(!job){this.checkComplete();return;}
  const {queue,record}=job;
  try{
   if(this.signal?.aborted){this.onAbort();return;}
   record.firstStepAtMs??=this.clock.now();
   this.stats.status='uploading';
   const previous={...queue.stats},stepAtMs=this.clock.now();
   try{queue.step();}finally{
    for(const key of ['initialized','alreadyInitialized','skipped','uploadTotalMs'])this.stats[key]+=queue.stats[key]-previous[key];
    this.stats.maxUploadMs=Math.max(this.stats.maxUploadMs,queue.stats.maxUploadMs);
    if(queue.stats.initialized>previous.initialized)this.stats.firstUploadAtMs??=stepAtMs;
   }
   if(!queue.pending){record.completedAtMs=this.clock.now();this.jobs.shift();}
   this.checkComplete();this.schedule();
  }catch(error){queue.fail();this.stop(error,'failed');}
 }
 finish(){this.sealed=true;this.checkComplete();this.schedule();return this.ready;}
 checkComplete(){
  if(this.settled||this.jobs.length)return;
  if(!this.sealed){this.stats.status="waiting";return;}
  this.settled=true;this.stats.status='complete';this.stats.completedAtMs=this.clock.now();this.cleanup();this.resolve(this.stats);
 }
 cleanup(){
  if(this.timer!==null){this.clock.clear(this.timer);this.timer=null;}
  this.signal?.removeEventListener('abort',this.onAbort);
  for(const [texture,listener]of this.listeners)texture.removeEventListener('dispose',listener);
  this.listeners.clear();this.jobs.length=0;
 }
 stop(error,status){
  if(this.settled)return;this.settled=true;this.stats.status=status;this.stats.error=String(error?.message||error);this.stats.completedAtMs=this.clock.now();
  this.cleanup();this.reject(error);if(status==='failed')this.onFailure(error);
 }
 dispose(){this.stop(new DOMException('Early tree texture preparation disposed','AbortError'),'cancelled');this.cleanup();}
}
