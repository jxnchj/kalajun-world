// Diagnostic only. Evaluate in the existing ready app after normal RAF motion.
// __treeHighPhoto50VisualOptions={name,motionEvidence?}; no production imports.
// Retired after movement exposed incompatible historical slot ordering when
// newly rebuilt foliage rejoins retained solid force buffers. Keep for evidence.
throw new Error('Retired review helper: hot regrouping after movement violates shared wind slot order; use independently constructed URL modes');
(async()=>{
 const app=window.kalajunV2,d=app?.debug,options=window.__treeHighPhoto50VisualOptions;
 if(!d||!/^[a-z0-9][a-z0-9-]{0,69}$/.test(options?.name||''))throw Error('Ready app and evidence name required');
 const ready=app.getSnapshot();
 if(!ready.ready||ready.preparing||ready.terrain.queuedTiles||ready.terrain.morphingGroups||ready.errors.length)throw Error('World must be settled');
 if(d.ecology.treeViewCull.value||d.ecology.treeBatchSize!==96)throw Error('Native original grouping required');
 const r=d.renderer,gl=r.getContext(),width=r.domElement.width,height=r.domElement.height;
 if(width!==1280||height!==800||r.getPixelRatio()!==1)throw Error('1280x800 DPR1 required');
 const original=d.ecology.treeHighPhoto48,hold=d.setReviewHold(true),reflectionTime=d.water.reflection.lastCapture;
 const shadows={autoUpdate:r.shadowMap.autoUpdate,needsUpdate:r.shadowMap.needsUpdate,lights:d.environment.csm.lights.map(l=>({autoUpdate:l.shadow.autoUpdate,needsUpdate:l.shadow.needsUpdate}))};
 const evidence={name:options.name,position:ready.position,yaw:ready.yaw,pitch:ready.pitch,time:ready.time,viewport:ready.viewport,
  scope:'Synchronous frozen native 96m / mode5-photo48m / 96m; environment receiver and caster state updated for each draw; no RAF hold across network or tool calls',motionEvidence:options.motionEvidence??null,states:[]};
 function rebuild(value){d.ecology.treeHighPhoto48=value;d.ecology.rebuildNearTrees(d.camera);d.ecology.syncTreeDynamics(d.camera);}
 function draw(value){
  if(d.ecology.treeHighPhoto48!==value)rebuild(value);
  d.camera.updateMatrixWorld(true);d.scene.updateMatrixWorld(true);
  // Uses the mirror receiver camera made by the immediately preceding real RAF.
  // environment.update(0) refreshes CSM, receiver domains, and newly created casters
  // while preserving all elapsed wind/cloud/water time.
  d.environment.forceShadowUpdate=true;d.environment.update(0);
  r.shadowMap.needsUpdate=true;for(const l of d.environment.csm.lights)l.shadow.needsUpdate=true;
  d.renderFrozenWorld();
  d.water.reflection.lastCapture=-Infinity;
  const reflected=d.water.renderReflection(r,d.scene,d.camera,{now:performance.now()/1000,lightingRevision:d.environment.minutes});
  d.renderFrozenWorld();
  const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  evidence.states.push({candidate:value,reflected,reason:d.water.reflection.stats.reason,receivers:d.environment.shadowReceiverCameras?.length??0,
   instances:d.ecology.stats.treeActiveInstances,batches:d.ecology.stats.treeActiveBatches,windRoots:d.ecology.stats.treeRootWindRoots,windBytes:d.ecology.stats.treeRootWindUploadBytes});
  return {pixels,png:r.domElement.toDataURL('image/png')};
 }
 function diff(a,b){let pixels=0,maxChannel=0,sum=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let c=0;c<4;c++){const v=Math.abs(a[i+c]-b[i+c]);sum+=v;maxChannel=Math.max(maxChannel,v);changed ||=v!==0;}pixels+=changed?1:0;}return {pixels,maxChannel,meanChannel:sum/a.length};}
 let a,b,c;
 try{
  const warm=draw(false);a=draw(false);b=draw(true);c=draw(false);
  evidence.baselineRepeat=diff(warm.pixels,a.pixels);evidence.originalVsCandidate=diff(a.pixels,b.pixels);evidence.originalReturn=diff(a.pixels,c.pixels);
  if(original)draw(true);
  evidence.errors=app.getSnapshot().errors;
  evidence.valid=evidence.baselineRepeat.pixels===0&&evidence.originalVsCandidate.pixels===0&&evidence.originalReturn.pixels===0&&!evidence.errors.length;
 }finally{
  try{if(d.ecology.treeHighPhoto48!==original)rebuild(original);}
  finally{d.water.reflection.lastCapture=reflectionTime;r.shadowMap.autoUpdate=shadows.autoUpdate;r.shadowMap.needsUpdate=true;
   d.environment.csm.lights.forEach((l,i)=>{l.shadow.autoUpdate=shadows.lights[i].autoUpdate;l.shadow.needsUpdate=true;});
   d.environment.forceShadowUpdate=true;d.setReviewHold(hold);}
 }
 // All uploads happen after normal RAF and user controls have been released.
 for(const [suffix,png]of [['original',a.png],['candidate',b.png],['restore',c.png]]){
  const name=options.name+'-'+suffix;if(name.length>70)throw Error('Evidence name too long');
  const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:evidence,png})});
  if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());
 }
 window.__treeHighPhoto50VisualResult=evidence;return {saved:true,...evidence};
})()
