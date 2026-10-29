// Standalone diagnostic only; never imported by production. B intentionally
// omits standard-depth draws and is not a valid final image/cache implementation.
export async function measureShadowStaticCPU42(app,{warm=10,samples=30,gpu=true,pause=()=>new Promise(r=>setTimeout(r,0))}={}){
 const d=app.debug??app,r=d.renderer,lights=d.environment?.csm?.lights,profile=d.gpuPassProfile;
 if(!r||!Array.isArray(lights)||lights.length!==3||typeof d.shadowStaticProfile39?.classify!=='function'||typeof d.setReviewHold!=='function')throw Error('Requires existing three-CSM debug owner and classifier');
 if(!Number.isInteger(warm)||warm<0||!Number.isInteger(samples)||samples<1)throw Error('Invalid sample count');
 if(profile?.frame||profile?.active)throw Error('Main GPU profile is active; wait for a held idle frame');
 const gl=r.getContext(),ext=gpu?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 if(ext&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign timer query is active');
 const oldHold=d.setReviewHold(true),oldShadow=r.shadowMap.render,oldDraw=r.renderBufferDirect,oldNeeds=r.shadowMap.needsUpdate,oldLightNeeds=lights.map(l=>l.shadow.needsUpdate);
 const pending=[],results=[],errors=[];let depth=0,mode='A',current=null,active=null;
 const force=()=>{r.shadowMap.needsUpdate=true;for(const l of lights)l.shadow.needsUpdate=true;};
 const collect=()=>{
  if(!ext)return;
  const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
  for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(disjoint||gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE)){
   if(disjoint)p.sample.gpuInvalid=true;else p.sample.gpuMs=(p.sample.gpuMs??0)+gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6;
   gl.deleteQuery(p.q);pending.splice(i,1);
  }}
 };
 r.renderBufferDirect=function(...args){
  if(depth&&current){const standard=d.shadowStaticProfile39.classify(args[4]);current[standard?'standardDraws':'dynamicDraws']++;if(mode==='B'&&standard){current.skipped++;return;}}
  return oldDraw.apply(this,args);
 };
 r.shadowMap.render=function(...args){
  if(!current)return oldShadow.apply(this,args);
  if(depth)throw Error('Unexpected nested shadow call');
  let q=null;if(ext&&pending.length<8){if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign timer query appeared');q=gl.createQuery();if(q){try{gl.beginQuery(ext.TIME_ELAPSED_EXT,q);active=q;}catch(error){gl.deleteQuery(q);throw error;}}}
  else if(ext)current.gpuSkipped++;
  const start=performance.now();depth++;current.shadowCalls++;
  try{return oldShadow.apply(this,args);}finally{
   current.shadowCPUms+=performance.now()-start;depth--;
   if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);active=null;pending.push({q,sample:current});}
  }
 };
 try{
  for(const selected of ['A','B','B','A']){
   mode=selected;const group={mode,frames:[]};results.push(group);
   for(let i=0;i<warm+samples;i++){
    if(profile?.frame||profile?.active)throw Error('Main profiler became active during held diagnostic');
    collect();current={shadowCPUms:0,fullCPUms:0,shadowCalls:0,standardDraws:0,dynamicDraws:0,skipped:0,gpuSkipped:0};
    force();const start=performance.now();d.renderFrozenWorld();current.fullCPUms=performance.now()-start;
    if(i>=warm)group.frames.push(current);current=null;await pause();
   }
  }
  const until=performance.now()+2000;while(pending.length&&performance.now()<until){collect();if(pending.length)await new Promise(resolve=>setTimeout(resolve,10));}
  const median=a=>{a.sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null;};
  for(const group of results)group.summary={shadowCPUmedian:median(group.frames.map(f=>f.shadowCPUms)),fullCPUmedian:median(group.frames.map(f=>f.fullCPUms)),gpuMedian:median(group.frames.filter(f=>!f.gpuInvalid&&f.gpuMs!==undefined&&!f.gpuSkipped).map(f=>f.gpuMs)),samples:group.frames.length};
  return{method:'Held frozen normal-render ABBA; three original CSM forced due; B skips standard renderBufferDirect only; no per-draw clocks; CPU wall time includes driver submission',warm,samples,results,errors};
 }finally{
  current=null;r.renderBufferDirect=oldDraw;r.shadowMap.render=oldShadow;
  if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null;}
  for(const p of pending){p.sample.gpuInvalid=true;gl.deleteQuery(p.q);}pending.length=0;
  try{force();d.renderFrozenWorld();}finally{r.shadowMap.needsUpdate=oldNeeds;lights.forEach((l,i)=>l.shadow.needsUpdate=oldLightNeeds[i]);d.setReviewHold(oldHold);}
 }
}
