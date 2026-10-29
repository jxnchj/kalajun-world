import {ShadowStaticCache42} from './shadow-static-cache42.js';
// Complete valid images in both arms. A has no candidate owner, hooks or source
// scan. B timing surrounds the entire owner, including scan, warm and depth copy.
export async function measureShadowStaticCacheABBA42(app,{warm=10,samples=30,gpu=true,pause=()=>new Promise(r=>setTimeout(r,0)),Cache=ShadowStaticCache42}={}){
 const d=app.debug??app,r=d.renderer,lights=d.environment?.csm?.lights,profile=d.gpuPassProfile;
 if(lights?.length!==3||typeof d.setReviewHold!=='function')throw Error('Requires original three-CSM debug world');
 if(profile?.frame||profile?.active)throw Error('Main GPU profile active');
 if(!Number.isInteger(warm)||warm<0||!Number.isInteger(samples)||samples<1)throw Error('Invalid sample count');
 const gl=r.getContext(),ext=gpu?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 if(ext&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign timer query active');
 const originalShadow=r.shadowMap.render,originalDraw=r.renderBufferDirect,originalClear=r.clear;
 const oldHold=d.setReviewHold(true),oldNeeds=r.shadowMap.needsUpdate,lightNeeds=lights.map(l=>l.shadow.needsUpdate),textures=r.info.memory.textures;
 const pending=[],groups=[],result={method:'Held same-phase valid full-shadow ABBA; A no candidate; B includes exact source scan and native depth-copy CPU/GPU; no omitted shadows',warm,samples,groups,errors:[],textureCountBefore:textures};
 let owner=null,current=null,active=null,inside=false;
 const force=()=>{r.shadowMap.needsUpdate=true;lights.forEach(l=>l.shadow.needsUpdate=true);};
 const collect=()=>{if(!ext)return;const bad=gl.getParameter(ext.GPU_DISJOINT_EXT);for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(bad||gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE)){if(bad)p.frame.gpuInvalid=true;else p.frame.gpuMs=(p.frame.gpuMs??0)+gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.q);pending.splice(i,1);}}};
 const removeOwner=()=>{r.shadowMap.render=originalShadow;owner?.dispose();owner=null;if(r.renderBufferDirect!==originalDraw||r.clear!==originalClear)throw Error('Candidate draw/clear hook restoration failed');};
 try{
  for(const mode of ['A','B','B','A']){
   removeOwner();
   if(mode==='B')owner=new Cache(app,{enabled:true});
   const measured=r.shadowMap.render,group={mode,frames:[],warmFrames:[],textureCountBefore:r.info.memory.textures};groups.push(group);
   r.shadowMap.render=function(...args){
    if(!current)return measured.apply(this,args);
    if(inside)throw Error('Unexpected nested whole-shadow timing');
    let q=null;if(ext&&pending.length<8){if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign query appeared');q=gl.createQuery();if(q){try{gl.beginQuery(ext.TIME_ELAPSED_EXT,q);active=q;}catch(e){gl.deleteQuery(q);throw e;}}}else if(ext)current.gpuSkipped=true;
    inside=true;current.shadowCalls++;const start=performance.now();
    try{return measured.apply(this,args);}finally{current.shadowCPUms+=performance.now()-start;inside=false;if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);active=null;pending.push({q,frame:current});}}
   };
   for(let i=0;i<warm+samples;i++){
    if(profile?.frame||profile?.active)throw Error('Main profile became active');
    collect();current={shadowCPUms:0,fullCPUms:0,shadowCalls:0,sourceScanMs:0};const priorScan=owner?.stats.sourceScanMs??0;
    force();const start=performance.now();d.renderFrozenWorld();current.fullCPUms=performance.now()-start;current.sourceScanMs=(owner?.stats.sourceScanMs??0)-priorScan;
    if(owner?.stats.error)throw Error('Candidate fell back: '+owner.stats.error);
    (i<warm?group.warmFrames:group.frames).push(current);current=null;await pause();
   }
   group.cache=owner?structuredClone(owner.stats):null;group.textureCountWarm=r.info.memory.textures;removeOwner();group.textureCountReleased=r.info.memory.textures;
  }
  const until=performance.now()+2000;while(pending.length&&performance.now()<until){collect();if(pending.length)await new Promise(resolve=>setTimeout(resolve,10));}
  const median=a=>{a.sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;},mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  for(const g of groups)g.summary={shadowCPUmedian:median(g.frames.map(f=>f.shadowCPUms)),fullCPUmedian:median(g.frames.map(f=>f.fullCPUms)),sourceScanMean:mean(g.frames.map(f=>f.sourceScanMs)),gpuMedian:median(g.frames.filter(f=>!f.gpuSkipped&&!f.gpuInvalid&&f.gpuMs!==undefined).map(f=>f.gpuMs)),warmShadowCPUmax:Math.max(0,...g.warmFrames.map(f=>f.shadowCPUms)),warmFullCPUmax:Math.max(0,...g.warmFrames.map(f=>f.fullCPUms))};
  return result;
 }finally{
  current=null;removeOwner();r.renderBufferDirect=originalDraw;r.clear=originalClear;
  if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);}for(const p of pending){p.frame.gpuInvalid=true;gl.deleteQuery(p.q);}pending.length=0;
  try{force();d.renderFrozenWorld();}finally{r.shadowMap.needsUpdate=oldNeeds;lights.forEach((l,i)=>l.shadow.needsUpdate=lightNeeds[i]);d.setReviewHold(oldHold);result.textureCountAfter=r.info.memory.textures;result.resourcesReleased=result.textureCountAfter===textures;}
 }
}
