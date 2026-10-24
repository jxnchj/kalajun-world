// Optional I/O-window work only. No far readiness barrier, altered LOD, or
// replacement terrain scheduler; each idle slice uses the existing builder.
export function startTerrainIdlePrefetch({terrain,camera,near,assets,isCurrent=()=>true,enabled=false,maxMs=6000,
 requestIdle=globalThis.requestIdleCallback?.bind(globalThis),cancelIdle=globalThis.cancelIdleCallback?.bind(globalThis),
 setTimer=globalThis.setTimeout.bind(globalThis),clearTimer=globalThis.clearTimeout.bind(globalThis),now=()=>performance.now()}={}){
 const stats={enabled,slices:0,workMs:0,reason:enabled?'waiting-near':'disabled',error:null,last:null};
 let stopped=false,idleId=null,idleResolve=null,timer=null,active=false,resolveCancel;
 const canceled=new Promise(resolve=>{resolveCancel=resolve;});
 const stop=reason=>{
  if(!stopped){stopped=true;if(enabled)stats.reason=reason;resolveCancel(null);
   if(idleId!==null){cancelIdle?.(idleId);idleId=null;}idleResolve?.(null);idleResolve=null;
   if(timer!==null){clearTimer(timer);timer=null;}if(active)terrain.cancelPreparation();
  }
  return done;
 };
 const idle=()=>new Promise(resolve=>{idleResolve=resolve;idleId=requestIdle(deadline=>{idleId=null;idleResolve=null;resolve(deadline);});});
 const done=(async()=>{
  if(!enabled)return stats;
  if(typeof requestIdle!=='function'||typeof cancelIdle!=='function'){stats.reason='idle-unavailable';return stats;}
  try{
   const ready=await Promise.race([Promise.resolve(near),canceled]);
   if(stopped)return stats;
   if(!isCurrent()){stop('destination');return stats;}
   if(!ready?.nearReady){stop('near-not-ready');return stats;}
   stats.reason='idle';timer=setTimer(()=>stop('budget'),Math.max(0,maxMs));
   while(!stopped){
    const deadline=await idle();if(stopped||!deadline)break;
    if(!isCurrent()){stop('destination');break;}
    const budget=Math.min(4,deadline.timeRemaining());if(deadline.didTimeout||budget<1)continue;
    const at=now();active=true;
    try{stats.last=await terrain.prepareView(camera,{maxMs:budget,waitFor:'all',nearRadius:160});stats.slices++;}
    finally{active=false;stats.workMs+=now()-at;}
    if(!stopped&&stats.last.ready){stop('ready');break;}
   }
  }catch(error){stats.error=error;stop('error');}
  finally{if(timer!==null){clearTimer(timer);timer=null;}if(idleId!==null){cancelIdle?.(idleId);idleId=null;}}
  return stats;
 })();
 // Observe both outcomes immediately. Rejections remain owned by main's asset
 // join; this observer never creates a rejected, unhandled background promise.
 if(enabled)Promise.resolve(assets).then(()=>{stop('assets-settled');},()=>{stop('asset-error');});
 return {stats,done,stop};
}
