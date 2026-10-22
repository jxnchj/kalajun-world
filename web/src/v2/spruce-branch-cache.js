// Bounded shared spatial-group cache. In-flight obsolete work may be reused;
// disposed worlds never publish it. Failure is retried once, then propagated.
export class SpruceBranchCache{
 constructor({build,disposeValue,maxBytes=64*1024*1024,now=()=>performance.now(),concurrency=1,maxInFlightBytes=8*1024*1024,estimateBytes=()=>0}){
  this.build=build;this.disposeValue=disposeValue;this.maxBytes=maxBytes;this.now=now;this.concurrency=concurrency===2?2:1;this.maxInFlightBytes=maxInFlightBytes;this.estimateBytes=estimateBytes;
  this.entries=new Map();this.wanted=new Set();this.closed=false;this.running=new Set();this.inFlightBytes=0;
  this.stats={pending:0,residentBytes:0,residentGroups:0,builtGroups:0,evictedGroups:0,retries:0,staleCompletions:0,buildMs:0,maxBuildMs:0,error:null,concurrency:this.concurrency,activeBuilds:0,peakActiveBuilds:0,inFlightParameterBytes:0,peakInFlightParameterBytes:0,maxInFlightParameterBytes:maxInFlightBytes};
 }
 begin(){this.frame=(this.frame||0)+1;this.wanted.clear();if(this.stats.error)throw new Error(this.stats.error);}
 request(key,descriptor,priority=0){this.wanted.add(key);let e=this.entries.get(key);if(!e){e={key,descriptor,priority,state:'queued',attempts:0,requestedAt:this.now(),lastUsed:this.now(),value:null};this.entries.set(key,e);}e.priority=e.lastRequestedFrame===this.frame?Math.min(e.priority,priority):priority;e.lastRequestedFrame=this.frame;e.lastUsed=this.now();return e.state==='ready'?e:null;}
 end(){if(this.closed)return;for(const [key,e]of this.entries)if(e.state==='queued'&&!this.wanted.has(key))this.entries.delete(key);this.trim();this.pump();this.refresh();}
 refresh(){this.stats.pending=[...this.entries.values()].filter(e=>e.state==='queued'||e.state==='building').length;this.stats.residentGroups=[...this.entries.values()].filter(e=>e.state==='ready').length;}
 pump(){
  if(this.closed)return;
  while(this.running.size<this.concurrency){
   const e=[...this.entries.values()].filter(e=>e.state==='queued'&&this.wanted.has(e.key)).sort((a,b)=>a.priority-b.priority)[0];if(!e)return;
   const bytes=Math.max(0,this.estimateBytes(e.descriptor)||0);
   // An individually large original group may still build, just as in serial
   // mode. A second group cannot push their parameter payload above this cap.
   if(this.running.size&&this.inFlightBytes+bytes>this.maxInFlightBytes)return;
   e.state='building';e.attempts++;this.running.add(e);this.inFlightBytes+=bytes;
   Object.assign(this.stats,{activeBuilds:this.running.size,peakActiveBuilds:Math.max(this.stats.peakActiveBuilds,this.running.size),inFlightParameterBytes:this.inFlightBytes,peakInFlightParameterBytes:Math.max(this.stats.peakInFlightParameterBytes,this.inFlightBytes)});
   const started=this.now();
   Promise.resolve().then(()=>this.build(e.descriptor,e.key)).then(value=>{
    if(this.closed){this.disposeValue(value,e.key);return;}
    e.value=value;e.bytes=value.bytes;e.state='ready';e.builtAt=this.now();e.queueBuildWaitMs=e.builtAt-e.requestedAt;this.stats.firstGroupBuildWaitMs??=e.queueBuildWaitMs;this.stats.maxQueueBuildWaitMs=Math.max(this.stats.maxQueueBuildWaitMs||0,e.queueBuildWaitMs);this.stats.residentBytes+=e.bytes;this.stats.builtGroups++;
    const ms=this.now()-started;this.stats.buildMs+=ms;this.stats.maxBuildMs=Math.max(this.stats.maxBuildMs,ms);if(!this.wanted.has(e.key))this.stats.staleCompletions++;
   },error=>{
    if(this.closed)return;e.error=String(error?.message||error);if(e.attempts<2){e.state='queued';this.stats.retries++;}else{e.state='failed';this.stats.error='Spruce branch group '+e.key+' failed: '+e.error;}
   }).finally(()=>{
    this.running.delete(e);this.inFlightBytes-=bytes;this.stats.activeBuilds=this.closed?0:this.running.size;this.stats.inFlightParameterBytes=this.closed?0:this.inFlightBytes;
    if(!this.closed){this.trim();this.refresh();this.pump();}
   });
  }
 }
 trim(){for(const e of [...this.entries.values()].filter(e=>e.state==='ready'&&!this.wanted.has(e.key)).sort((a,b)=>a.lastUsed-b.lastUsed)){if(this.stats.residentBytes<=this.maxBytes)break;this.disposeValue(e.value,e.key);this.stats.residentBytes-=e.bytes;this.stats.evictedGroups++;this.entries.delete(e.key);}}
 retry(){this.stats.error=null;for(const e of this.entries.values())if(e.state==='failed'){e.state='queued';e.attempts=0;}this.pump();}
 dispose(){if(this.closed)return;this.closed=true;for(const e of this.entries.values())if(e.value)this.disposeValue(e.value,e.key);this.entries.clear();this.wanted.clear();this.stats.residentBytes=0;this.stats.residentGroups=0;this.stats.pending=0;this.stats.activeBuilds=0;this.stats.inFlightParameterBytes=0;}
}
