// Inject through the documented CDP Runtime.evaluate on the independent static
// build with profile=1. Set __treeWindAtlas44Options={name,mode:'native'|'atlas'}.
// This collector is IDENTICAL in A/B/B/A. It does not freeze wind or animate the
// camera, and reads the full application snapshot only after the last sample.
(() => {
 const app=window.kalajunV2,d=app?.debug,options=window.__treeWindAtlas44Options;
 if(!d||!options||!['native','atlas'].includes(options.mode))throw Error('Ready debug world and explicit native/atlas mode required');
 if(!/^[a-z0-9][a-z0-9-]{0,69}$/.test(options.name||''))throw Error('Invalid evidence name');
 if(window.__treeWindAtlas44Run?.running)throw Error('Collector already running');
 const params=new URLSearchParams(location.search),atlas=options.mode==='atlas';
 if(params.get('profile')!=='1'||params.get('time')!=='870')throw Error('Use identical profile=1 and time=870');
 if((params.get('treeWindAtlas44')==='1')!==atlas||params.get('treeViewPassShare42')==='1'||(!atlas&&params.get('treeViewCull')==='1'))throw Error('Entry flags do not match explicit native/atlas mode');
 const pose={position:[-3611.851169467755,2329.157270885741,4805.483400316967],yaw:-29.88794104541604,pitch:-10};
 const sumCounters=()=>{
  const out={proxies:0,sharing:0,atlasViews:0,atlasGPUUploads:0,atlasGPUUploadBytes:0,slotCopies:0,fullSlotCopies:0,forceCopies:0,passShareHits:0,passShareTests:0,viewGeometries:0,matrixCopies:0,fullForceCopies:0,viewAllocations:0,viewRetirements:0,indexCacheHits:0,indexCacheMisses:0,indexTests:0};
  for(const batch of d.ecology.nearTreeBatches.values())if(batch.view){
   out.proxies++;if(batch.view.stats.passShareEnabled)out.sharing++;if(batch.view.stats.windAtlas44)out.atlasViews++;
   for(const key of Object.keys(out))if(key!=='proxies'&&key!=='sharing')out[key]+=batch.view.stats[key]||0;
  }
  out.atlasGPUUploads=d.ecology.treeRootWind.atlas44?.stats.gpuUploads??0;out.atlasGPUUploadBytes=d.ecology.treeRootWind.atlas44?.stats.gpuUploadBytes??0;return out;
 };
 const state=window.__treeWindAtlas44Run={running:true,name:options.name,mode:options.mode,phase:'settling',started:performance.now(),url:location.href,
  protocol:{settleRAFs:60,sampleRAFs:180,viewport:[1280,800],pixelRatio:1,time:870,pose,collector:'terrain queued/morph counts, exact pose and actual renderer frame each RAF; full snapshot only at end'},
  stable:0,sampleCount:0,times:[],terrainResets:0,invalid:[],firstRendererFrame:null,lastRendererFrame:null};
 let previousTimestamp=null,previousRendererFrame=null;
 function checkPose(){
  const p=d.camera.position;
  return Math.max(Math.abs(p.x-pose.position[0]),Math.abs(p.y-pose.position[1]),Math.abs(p.z-pose.position[2]),Math.abs(d.controls.yaw-pose.yaw),Math.abs(d.controls.pitch-pose.pitch));
 }
 function finish(reason){
  if(!state.running)return;
  state.running=false;if(reason)state.invalid.push(reason);state.measurementEnded=performance.now();
  state.endCounters=sumCounters();state.counterDelta=Object.fromEntries(Object.keys(state.endCounters).map(key=>[key,state.endCounters[key]-(state.beginCounters?.[key]||0)]));
  const sorted=state.times.slice().sort((a,b)=>a-b);
  state.meanMs=state.times.reduce((sum,x)=>sum+x,0)/Math.max(1,state.times.length);
  state.p95Ms=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null;
  state.snapshot=app.getSnapshot();
  if(state.snapshot.errors.length)state.invalid.push('Application reported errors');
  if(!state.snapshot.gpu.available||state.snapshot.gpu.samples!==60)state.invalid.push('GPU rolling window incomplete');
  if(atlas?state.endCounters.proxies===0||state.endCounters.atlasViews!==state.endCounters.proxies||state.endCounters.sharing!==0:state.endCounters.proxies!==0)state.invalid.push('Native/atlas proxy identity mismatch');
  if(state.times.length!==state.protocol.sampleRAFs)state.invalid.push('Incomplete sample count');
  state.valid=state.invalid.length===0;state.phase='saving';
  fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:state.name,snapshot:state})})
   .then(async response=>{if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());state.saved=true;state.phase='done';})
   .catch(error=>{state.saved=false;state.saveError=error.message;state.phase='save-failed';});
 }
 function tick(now){
  if(!state.running)return;
  if(performance.now()-state.started>240000){finish('Collector timed out');return;}
  const canvas=d.renderer.domElement;
  if(document.visibilityState!=='visible'){finish('Page lost visibility');return;}
  if(canvas.width!==1280||canvas.height!==800||d.renderer.getPixelRatio()!==1){finish('Viewport or DPR changed');return;}
  if(checkPose()>1e-6||d.environment.minutes!==870){finish('Original forest pose or time changed');return;}
  const terrain=d.terrain.stats,q=terrain.queuedTiles,m=terrain.morphingGroups,frame=d.renderer.info.render.frame;
  state.terrain={queuedTiles:q,morphingGroups:m};state.lastRendererFrame=frame;
  if(previousRendererFrame!==null&&frame<=previousRendererFrame){finish('No actual rendered application frame between collector RAFs');return;}
  previousRendererFrame=frame;
  if(state.phase==='settling'){
   if(q===0&&m===0)state.stable++;else{state.stable=0;state.terrainResets++;}
   if(state.stable===state.protocol.settleRAFs){state.beginCounters=sumCounters();state.firstRendererFrame=frame;state.phase='sampling';previousTimestamp=now;}
  }else{
   if(q!==0||m!==0){finish('Terrain resumed during sampling');return;}
   state.times.push(now-previousTimestamp);previousTimestamp=now;state.sampleCount=state.times.length;
   if(state.sampleCount===state.protocol.sampleRAFs){finish();return;}
  }
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
 return {started:true,name:state.name,mode:state.mode,result:'window.__treeWindAtlas44Run'};
})()
