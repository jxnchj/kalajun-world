import {TerrainRowWorkerClient} from './terrain-row-worker-client.js';

export function terrainWorkerRefillPolicy42(search=''){
 const p=new URLSearchParams(search),requested=p.get('terrainRefill42')==='1';
 const conflict=['terrainWindow42','terrainPrepared42'].find(k=>p.get(k)==='1');
 return {requested,enabled:requested&&!conflict,reason:requested&&conflict?'Incompatible with '+conflict:null};
}

// Candidate only. Four ordered jobs may be in flight/complete, but the original
// single worker still computes at most two pending requests. Publication remains
// exclusively owned by WorldTerrain.update (two finishes / 3 ms).
export class TerrainWorkerRefill42 extends TerrainRowWorkerClient {
 constructor(inputs,{queueProvider,...options}={}) {
  if(options.limit!==undefined&&options.limit!==2)throw new TypeError('Refill preserves the original two pending jobs');
  super(inputs,{...options,limit:2});
  if(typeof queueProvider!=='function'){this.dispose();throw new TypeError('queueProvider is required');}
  this.queueProvider=this.closed?null:queueProvider;
  this.refillStats=this.stats.refill42={enabled:true,events:0,dispatched:0,maxBuffered:0,headWaits:0,fullPrefixes:0};
  const original=this.worker?.onmessage;
  if(original)this.worker.onmessage=event=>{
   original(event);
   if(!this.closed&&(event.data?.type==='ready'||event.data?.type==='result')){
    this.refillStats.events++;this.refill();
   }
  };
 }
 prefix(){
  const prefix=[];
  for(const job of this.queueProvider?.()??[]){
   if(job.node.dead||job.node.mesh||job.node.job!==job)continue;
   prefix.push(job);if(prefix.length===4)break;
  }
  return prefix;
 }
 enqueue(job){
  // The normal update loop must obey the same buffer bound as message refill.
  if(!this.prefix().includes(job))return false;
  return super.enqueue(job);
 }
 refill(){
  if(this.closed||!this.ready)return;
  const prefix=this.prefix();
  for(const job of prefix){
   if(this.pending.size>=this.limit)break;
   if(super.enqueue(job))this.refillStats.dispatched++;
  }
  const buffered=prefix.filter(j=>j.workerPending||j.workerPayload).length;
  this.refillStats.maxBuffered=Math.max(this.refillStats.maxBuffered,buffered);
  if(prefix[0]?.workerPending)this.refillStats.headWaits++;
  if(prefix.length===4&&prefix.every(j=>j.workerPayload))this.refillStats.fullPrefixes++;
 }
 dispose(){super.dispose();this.queueProvider=null;}
}
