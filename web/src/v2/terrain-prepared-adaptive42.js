// One bounded demand-only probe. Never submits extra work or changes capacity.
export class TerrainPreparedAdaptive42{
 constructor(fallback){this.fallback=fallback;this.samples=new Map();this.pending=new Map();this.finished=new Set();this.closed=false;this.stats={state:'sampling',reason:'await-same-depth-worker-samples',samples:{},probes:0,probeBytes:0,probeMs:0,decisions:0,prepared:0,fallback:0,cacheUses:0,rows:[]};
  const worker=fallback?.worker,original=worker?.onmessage;if(worker&&typeof original==='function'){const owner=this;function observed(event){const p=fallback.pending.get(event.data?.id),before=fallback.stats.completed;const result=original.call(this,event);if(p&&event.data?.type==='result'&&fallback.stats.completed>before)owner.record(p.job.node.depth,event.data.ms);return result;}worker.onmessage=observed;this.restore=()=>{if(worker.onmessage===observed)worker.onmessage=original;};}
 }
 record(depth,ms){if(this.closed||!Number.isInteger(depth)||!Number.isFinite(ms)||ms<=0)return;let a=this.samples.get(depth);if(!a){a=[];this.samples.set(depth,a);}a.push(ms);if(a.length>16)a.shift();this.stats.samples[depth]={count:a.length,meanMs:a.reduce((s,v)=>s+v,0)/a.length};}
 reference(depth){const a=this.samples.get(depth);if(!a||a.length<8)return null;return a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)]*4;}
 lock(reason){if(this.closed)return;this.stats.state='worker';this.stats.reason=reason;}
 allow(shard,depth,cached=false){this.stats.decisions++;if(this.closed){this.stats.fallback++;return false;}if(cached){this.stats.cacheUses++;return true;}if(this.closed||this.stats.state==='worker'){this.stats.fallback++;return false;}
  if(this.pending.has(shard.id))return true;const referenceMs=this.reference(depth);if(referenceMs===null){this.stats.fallback++;this.stats.reason='insufficient-same-depth-samples';return false;}
  if(this.stats.state!=='prepared'&&this.stats.probes>=4){this.stats.fallback++;return false;}
  if(this.stats.state!=='prepared'){this.stats.state='probing';this.stats.probes++;}
  this.pending.set(shard.id,{depth,referenceMs,probe:this.stats.state==='probing'});this.stats.prepared++;return true;
 }
 deadline(id){const p=this.pending.get(id);return p?Math.max(250,Math.min(1500,p.referenceMs*2)):1000;}
 complete(shard,result){const p=this.pending.get(shard.id);if(!p)return;this.pending.delete(shard.id);const ms=result.timings?.fetchMs+result.timings?.codecMs;if(!Number.isFinite(ms)){this.lock('missing-worker-fetch-timing');return;}
  const ratio=ms/p.referenceMs;if(p.probe){this.stats.probeBytes+=result.downloadedBytes;this.stats.probeMs+=ms;this.finished.add(shard.id);this.stats.rows.push({shard:shard.id,depth:p.depth,referenceMs:p.referenceMs,fetchMs:result.timings.fetchMs,codecMs:result.timings.codecMs,bytes:result.downloadedBytes,ratio});}
  if(ratio>.8){this.lock('fetch-codec-not-clearly-faster-than-same-depth-worker');return;}
  if(this.stats.state!=='worker'&&this.stats.probes===4&&this.pending.size===0){this.stats.state='prepared';this.stats.reason='four-demand-shards-below-80-percent-worker-cost';}
 }
 fail(id,error,downloadedBytes=0){const p=this.pending.get(id);if(p?.probe)this.stats.probeBytes+=downloadedBytes;this.pending.delete(id);this.lock('shard-failed-or-timeout: '+String(error));}
 dispose(){this.closed=true;this.restore?.();this.pending.clear();}
}
