// Explicit local review helper; never imported by the app. Single existing page,
// debug=1 without profile. Set __treeHighPhoto50Options={name} before injection.
(async()=>{
 const options=window.__treeHighPhoto50Options;
 if(!/^[a-z0-9][a-z0-9-]{0,69}$/.test(options?.name??''))throw Error('Valid evidence name required');
 const next=()=>new Promise(requestAnimationFrame),started=performance.now();
 let app,d,stamp,stable=0;
 while(stable<60){
  stamp=await next();app=window.kalajunV2;d=app?.debug;
  if(performance.now()-started>240000)throw Error('World did not reach 60 settled RAFs');
  const s=d?.terrain.stats;
  stable=d&&s.queuedTiles===0&&s.morphingGroups===0&&document.visibilityState==='visible'?stable+1:0;
 }
 const params=new URLSearchParams(location.search);
 if(params.has('profile')||d.gpuPassProfile)throw Error('Clean comparison requires no profiling');
 if(d.renderer.domElement.width!==1280||d.renderer.domElement.height!==800||d.renderer.getPixelRatio()!==1)throw Error('Wrong actual renderer viewport');
 if(document.querySelector('#diagnostics')?.open)throw Error('Close diagnostics before sampling');
 const before=app.getSnapshot(),position=d.camera.position.clone(),yaw=d.controls.yaw,pitch=d.controls.pitch;
 if(before.preparing||!before.ready||before.time!==870||before.errors.length)throw Error('World not ready');
 // Keep snapshot allocation outside the measured 180 intervals.
 stamp=await next();let frame=d.renderer.info.render.frame;
 const samples=[];let valid=true,maxPoseSquared=0;
 for(let i=0;i<180;i++){
  const now=await next(),nextFrame=d.renderer.info.render.frame,ts=d.terrain.stats;
  const pose=d.camera.position.distanceToSquared(position);maxPoseSquared=Math.max(maxPoseSquared,pose);
  const ok=ts.queuedTiles===0&&ts.morphingGroups===0&&pose===0&&d.controls.yaw===yaw&&d.controls.pitch===pitch&&nextFrame>frame&&document.visibilityState==='visible';
  valid&&=ok;samples.push({dt:now-stamp,renderFrames:nextFrame-frame,valid:ok});stamp=now;frame=nextFrame;
 }
 const after=app.getSnapshot(),sorted=samples.map(s=>s.dt).sort((a,b)=>a-b),mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
 const evidence={summary:{name:options.name,mean,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],min:sorted[0],max:sorted.at(-1),samples:180,valid:valid&&!after.errors.length,poseUnchanged:maxPoseSquared===0&&after.yaw===yaw&&after.pitch===pitch,singleWorld:true,singleWorldBasis:'Global CUA inventory checked by coordinator and receiver; only existing scene tab1839973815 retained',profile:false,cachePolicy:'Default browser HTTP cache and existing IDB retained equally across navigation; not device cold-start evidence',candidate:d.ecology.treeHighPhoto48},before,after,samples};
 const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:options.name,snapshot:evidence})});
 if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());
 window.__treeHighPhoto50Sample=evidence;return {saved:true,...evidence.summary,firstFrame:after.loadTimings.phases.firstFrame,tree:{active:after.ecology.treeActiveInstances,batches:after.ecology.treeActiveBatches,windRoots:after.ecology.treeRootWindRoots,windBytes:after.ecology.treeRootWindUploadBytes},errors:after.errors};
})()
