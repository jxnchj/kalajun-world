// Run only after real RAF movement/turning. This is a same-pose correctness
// comparison of the proxy's full-prefix and compact paths, not native FPS.
// Set __treeViewPassShare42VisualOptions={name,motionEvidence} before injection.
(async () => {
 const app=window.kalajunV2,d=app?.debug,options=window.__treeViewPassShare42VisualOptions;
 if(!d||!/^[a-z0-9][a-z0-9-]{0,69}$/.test(options?.name||''))throw Error('Ready debug world and valid evidence name required');
 const views=[...d.ecology.nearTreeBatches.values()].filter(batch=>batch.view);
 if(!views.length||views.some(batch=>!batch.view.stats.passShareEnabled))throw Error('Shared candidate must actually be installed');
 const r=d.renderer,gl=r.getContext(),width=r.domElement.width,height=r.domElement.height;
 const hold=d.setReviewHold(true),control=d.ecology.treeViewCull.value,reflectionTime=d.water.reflection.lastCapture;
 const shadow={autoUpdate:r.shadowMap.autoUpdate,needsUpdate:r.shadowMap.needsUpdate,lights:d.environment.csm.lights.map(light=>({autoUpdate:light.shadow.autoUpdate,needsUpdate:light.shadow.needsUpdate}))};
 const evidence={name:options.name,scope:'Same frozen pose after real RAF motion; full proxy prefix / compact shared / full return; freshly rendered shadow maps and eligible reflection for each state.',
  motionEvidence:options.motionEvidence??null,position:d.camera.position.toArray(),yaw:d.controls.yaw,pitch:d.controls.pitch,time:d.environment.minutes,viewport:[width,height],pixelRatio:r.getPixelRatio(),proxies:views.length,sharing:views.filter(batch=>batch.view.stats.passShareEnabled).length,reflectionCaptures:[]};
 function draw(value){
  d.ecology.treeViewCull.value=value;
  d.camera.updateMatrixWorld(true);d.environment.csm.update();d.scene.updateMatrixWorld(true);
  // Receiver domains must follow the actual camera before compact caster tests.
  d.environment.shadowReceivers.update(d.camera,d.environment.sun,{additionalCameras:d.environment.shadowReceiverCameras,shadowType:r.shadowMap.type});
  r.shadowMap.needsUpdate=true;for(const light of d.environment.csm.lights)light.shadow.needsUpdate=true;
  d.renderFrozenWorld();
  d.water.reflection.lastCapture=-Infinity;
  const captured=d.water.renderReflection(r,d.scene,d.camera,{now:performance.now()/1000,lightingRevision:d.environment.minutes});
  evidence.reflectionCaptures.push({value,captured,reason:d.water.reflection.stats.reason});
  d.renderFrozenWorld();
  const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
 }
 function diff(a,b){let pixels=0,maxChannel=0,sum=0;for(let i=0;i<a.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(a[i+c]-b[i+c]);sum+=delta;maxChannel=Math.max(maxChannel,delta);changed ||= delta!==0;}if(changed)pixels++;}return {pixels,maxChannel,meanChannel:sum/a.length};}
 let png;
 try{
  const before=draw(0),shared=draw(1),after=draw(0);
  evidence.fullVsShared=diff(before,shared);evidence.fullReturn=diff(before,after);
  const restored=draw(control);evidence.restored=diff(control?shared:before,restored);
  png=r.domElement.toDataURL('image/png');evidence.errors=app.getSnapshot().errors;
  evidence.valid=evidence.fullVsShared.pixels===0&&evidence.fullReturn.pixels===0&&evidence.restored.pixels===0&&evidence.errors.length===0;
 }finally{
  d.ecology.treeViewCull.value=control;d.water.reflection.lastCapture=reflectionTime;
  r.shadowMap.autoUpdate=shadow.autoUpdate;r.shadowMap.needsUpdate=shadow.needsUpdate;
  d.environment.csm.lights.forEach((light,i)=>Object.assign(light.shadow,shadow.lights[i]));d.setReviewHold(hold);
 }
 const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:options.name,snapshot:evidence,png})});
 if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());
 window.__treeViewPassShare42VisualResult={...evidence,saved:true};return window.__treeViewPassShare42VisualResult;
})()
