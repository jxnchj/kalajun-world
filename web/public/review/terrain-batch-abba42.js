// Normal RAF only. No diagnostic scanning or shadow forcing during samples.
export async function measureTerrainBatchABBA42(app,{warm=30,samples=120,stableFrames=10,maxPrepareFrames=900,nextFrame=()=>new Promise(r=>requestAnimationFrame(r))}={}){
 const d=app.debug??app,t=d.terrain,b=t?.submissionBatches;
 if(!b||b.enabled||b.records.size||!('boundedBuild42'in b))throw Error('Requires updated, clean OFF batcher');
 for(const v of [warm,samples,stableFrames,maxPrepareFrames])if(!Number.isInteger(v)||v<1)throw Error('Invalid frame count');
 const oldHold=d.setReviewHold(true),oldBounded=b.boundedBuild42,oldStats=structuredClone(b.stats),original=t.update,groups=[];let cpu=0,calls=0;
 const clear=()=>{b.enabled=false;if(b.dispose)b.dispose();else{b.restore();for(const p of [...b.records.keys()])b.release(p);}};
 function hook(...args){const start=performance.now();try{return original.apply(this,args);}finally{cpu+=performance.now()-start;calls++;}}
 const stats=()=>({groups:b.stats.groups,fastGroups:b.stats.fastGroups,fullChecks:b.stats.fullChecks,rebuilds:b.stats.rebuilds,budgetDeferred:b.stats.budgetDeferred,buildMs:b.stats.buildMs,constructionMs:b.stats.constructionMs});
 try{
  t.update=hook;
  for(const mode of ['A','B','B','A']){
   d.setReviewHold(true);clear();b.boundedBuild42=mode==='B';b.enabled=mode==='B';
   const group={mode,frames:[]};groups.push(group);const start=performance.now();let prepared=0,stable=0;d.setReviewHold(false);
   if(mode==='B')while(stable<stableFrames){await nextFrame();prepared++;const s=b.stats;stable=s.groups>0&&s.fullChecks===0&&s.rebuilds===0&&s.budgetDeferred===0?stable+1:0;if(prepared>=maxPrepareFrames&&stable<stableFrames)throw Error('Batch preparation did not stabilize');}
   group.preparation={ms:performance.now()-start,frames:prepared,stats:stats()};let previous=null;cpu=0;calls=0;
   for(let i=0;i<warm+samples;i++){
    const timestamp=await nextFrame();const row={frameMs:previous===null?null:timestamp-previous,terrainCPUms:cpu,terrainCalls:calls,batch:stats()};previous=timestamp;cpu=0;calls=0;if(i>=warm)group.frames.push(row);
   }
   d.setReviewHold(true);const snapshot=app.getSnapshot?.();group.rollingGPU=snapshot?.gpu??null;group.rollingCPU=snapshot?.cpu??null;group.render=snapshot?.render??null;group.errors=snapshot?.errors??null;
   const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,quantile=(a,q)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))];
   group.summary={frameMeanMs:mean(group.frames.map(r=>r.frameMs)),frameMedianMs:quantile(group.frames.map(r=>r.frameMs),.5),frameP95Ms:quantile(group.frames.map(r=>r.frameMs),.95),terrainMeanMs:mean(group.frames.map(r=>r.terrainCPUms)),terrainMedianMs:quantile(group.frames.map(r=>r.terrainCPUms),.5)};
  }
  return{method:'Normal RAF ABBA; A has no records; B construction-only bounded budget; actual stable gate then warm/sample; GPU is existing trailing render-world/reflection window, not individual frame timing',warm,samples,stableFrames,groups};
 }finally{
  d.setReviewHold(true);clear();b.boundedBuild42=oldBounded;Object.assign(b.stats,oldStats);if(t.update===hook)t.update=original;
  try{for(const l of d.environment?.csm?.lights??[])l.shadow.needsUpdate=true;d.renderFrozenWorld?.();}finally{d.setReviewHold(oldHold);}
 }
}
