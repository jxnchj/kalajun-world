// Reuses a cryptographic proof only after comparing every CURRENT parent byte.
// Identity/version alone never grants reuse; callers still recheck before publish.
export class TerrainParentProof42{
 constructor(codec,{snapshot,matches,maxBytes=8*1024*1024}={}){this.codec=codec;this.snapshot=snapshot;this.matches=matches;this.maxBytes=maxBytes;this.entries=new Map();this.closed=false;this.stats={bytes:0,peakBytes:0,hits:0,inflightHits:0,misses:0,evictions:0,released:0,compareCPUms:0};}
 remove(parent,reason){const e=this.entries.get(parent);if(!e)return;this.entries.delete(parent);this.stats.bytes-=e.bytes.byteLength;if(reason)this.stats[reason]++;}
 async get(node,hash){
  if(this.closed)throw Error('Parent proof cache disposed');const parent=node.parent;if(!parent)throw Error('Parent proof requires parent');
  for(const p of this.entries.keys())if(p.dead||!p.mesh)this.remove(p,'released');
  if(parent.dead||!parent.mesh)throw Error('Parent released');
  let e=this.entries.get(parent);const start=performance.now(),same=e?.hash===hash&&this.matches(node,e.bytes);this.stats.compareCPUms+=performance.now()-start;
  if(same){this.entries.delete(parent);this.entries.set(parent,e);this.stats.hits++;if(!e.verified)this.stats.inflightHits++;return e.promise;}
  if(e)this.remove(parent);this.stats.misses++;const bytes=this.snapshot(node);e={bytes,hash,verified:false,promise:null};
  while(this.stats.bytes+bytes.byteLength>this.maxBytes&&this.entries.size)this.remove(this.entries.keys().next().value,'evictions');
  if(bytes.byteLength<=this.maxBytes){this.entries.set(parent,e);this.stats.bytes+=bytes.byteLength;this.stats.peakBytes=Math.max(this.stats.peakBytes,this.stats.bytes);}
  e.promise=this.codec.run({type:'parent',bytes,hash}).then(()=>{if(this.closed)throw Error('Parent proof cache disposed');if(parent.dead||!parent.mesh)throw Error('Parent released during proof');e.verified=true;return bytes;}).catch(error=>{if(this.entries.get(parent)===e)this.remove(parent);throw error;});
  return e.promise;
 }
 dispose(){this.closed=true;this.entries.clear();this.stats.bytes=0;}
}
