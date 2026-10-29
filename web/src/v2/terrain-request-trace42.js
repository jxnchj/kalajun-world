// Explicit diagnostic only: observes the original enqueue result, never dispatches
// extra jobs. Repeated attempts share a bounded key/outcome/load-phase row.
export function installTerrainRequestTrace42(client,{phase=()=>'',now=()=>performance.now(),limit=4096,frameApp=null,spikeFactory=null,requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame,visibility=globalThis.document}={}){
 if(!Number.isInteger(limit)||limit<1||limit>8192)throw Error('Invalid trace capacity');
 const enqueue=client.enqueue,dispose=client.dispose,started=now(),index=new Map(),stats={scope:'Actual enqueue attempts, aggregated by key/outcome/load phase; no extra requests',limit,attempts:0,accepted:0,rejected:0,errors:0,dropped:0,rows:[]};
 function wrapped(job){const start=now();let result,error;try{result=enqueue.call(this,job);return result;}catch(e){error=e;throw e;}finally{
  stats.attempts++;if(error)stats.errors++;else if(result)stats.accepted++;else stats.rejected++;
  const n=job.node,key=n.depth+':'+n.x+','+n.z,stage=String(phase()),outcome=error?'threw':result?'accepted':'rejected',id=key+'|'+outcome+'|'+stage;let row=index.get(id);
  if(!row){if(stats.rows.length>=limit){stats.dropped++;}else{row={key,depth:n.depth,x:n.x,z:n.z,size:n.size,parentKey:n.parent?n.parent.depth+':'+n.parent.x+','+n.parent.z:null,phase:stage,outcome,count:0,firstMs:start-started,lastMs:start-started};stats.rows.push(row);index.set(id,row);}}
  if(row){row.count++;row.lastMs=start-started;}
 }}
 const stopFrames=frameApp?observeTerrainLoadFrames42(stats,{app:frameApp,now,requestFrame,cancelFrame,visibility,spikeFactory}):()=>{};
 function release(...args){stopFrames("disposed");if(client.enqueue===wrapped)client.enqueue=enqueue;if(client.dispose===release)client.dispose=dispose;return dispose.apply(this,args);}
 client.enqueue=wrapped;client.dispose=release;return stats;
}

export function observeTerrainLoadFrames42(stats,{app,now=()=>performance.now(),requestFrame=globalThis.requestAnimationFrame,cancelFrame=globalThis.cancelAnimationFrame,visibility=globalThis.document,limit=4096,maxMs=180000,spikeFactory=null}={}){
 const frames=stats.loadFrames={installedAt:now(),firstAt:null,doneAt:null,intervals:[],valid:true,hidden:false,reason:null,stableFrames:0,scope:'RAF from first observed kalajunV2.debug until terrain q0/m0 for five frames; not GPU duration'};let handle=null,previous=null,stopped=false,spike=null;
 const visible=()=>{if(visibility?.visibilityState==='hidden'){frames.hidden=true;frames.valid=false;}};
 const stop=reason=>{if(stopped)return;stopped=true;if(handle!==null)cancelFrame?.(handle);handle=null;frames.doneAt=now();frames.reason=reason;if(reason!=='settled')frames.valid=false;visibility?.removeEventListener?.('visibilitychange',visible);spike?.dispose();};
 const tick=timestamp=>{if(stopped)return;handle=null;visible();const current=now(),d=app()?.debug;
  if(d){if(frames.firstAt===null){frames.firstAt=current;if(spikeFactory){spike=spikeFactory(app());frames.spikes=spike.stats;}}if(previous!==null){frames.intervals.push(timestamp-previous);spike?.sample(timestamp-previous);}previous=timestamp;const s=d.terrain?.stats;frames.stableFrames=s&&s.queuedTiles===0&&s.morphingGroups===0?frames.stableFrames+1:0;
   if(frames.stableFrames>=5){stop('settled');return;}if(frames.intervals.length>=limit){stop('capacity');return;}}
  if(current-(frames.firstAt??frames.installedAt)>=maxMs){stop('timeout');return;}handle=requestFrame(tick);
 };
 visibility?.addEventListener?.('visibilitychange',visible);visible();handle=requestFrame(tick);return stop;
}
