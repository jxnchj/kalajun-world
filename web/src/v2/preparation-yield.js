// Restored from the preserved round-27 bundle (v2-DzIM3uVd.js, function Xa).
// Keep the default scheduler.yield and the opt-in unboosted task experiment.
export function yieldWorldPreparation({scheduler=globalThis.scheduler,timer=resolve=>globalThis.setTimeout(resolve,0),mode=new URLSearchParams(globalThis.location?.search||"").get("preparationYield"),legacy=mode!=="balanced"&&mode!=="background"}={}){
  return legacy&&typeof scheduler?.yield==="function"?scheduler.yield():typeof scheduler?.postTask==="function"?scheduler.postTask(()=>{},{priority:mode==="background"?"background":"user-visible"}):new Promise(resolve=>timer(resolve));
}

// One deadline is shared by every in-flight asset. Yield only between complete
// source meshes/buckets: no half-built geometry becomes visible or changes order.
export function createPreparationYield({enabled=true,budgetMs=8,now=()=>performance.now(),yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  let deadline=now()+budgetMs,pending=null;
  const stats={enabled,budgetMs,yields:0,maxOverrunMs:0};
  return {stats,checkpoint(){
    if(!enabled)return null;
    if(pending)return pending;
    const t=now();if(t<deadline)return null;
    stats.maxOverrunMs=Math.max(stats.maxOverrunMs,t-deadline);stats.yields++;
    pending=Promise.resolve().then(yieldTask).finally(()=>{deadline=now()+budgetMs;pending=null;});
    return pending;
  }};
}
