// Observer only: real movement and turning are supplied by normal browser input.
// Set __treeHighPhoto50MotionOptions={action:'begin'|'end',name} then evaluate.
(async()=>{
 const app=window.kalajunV2,d=app?.debug,o=window.__treeHighPhoto50MotionOptions;
 if(!d||!['begin','end'].includes(o?.action))throw Error('Ready app and begin/end action required');
 const read=()=>({t:performance.now(),frame:d.renderer.info.render.frame,position:d.camera.position.toArray(),yaw:d.controls.yaw,pitch:d.controls.pitch,
  cell:[Math.floor(d.camera.position.x/48),Math.floor(d.camera.position.z/48)],candidate:d.ecology.treeHighPhoto48,
  active:d.ecology.stats.treeActiveInstances,batches:d.ecology.stats.treeActiveBatches,q:d.terrain.stats.queuedTiles,m:d.terrain.stats.morphingGroups});
 if(o.action==='begin'){
  if(window.__treeHighPhoto50MotionState?.running)throw Error('Motion observer already running');
  const state={running:true,before:app.getSnapshot(),samples:[],started:performance.now()};window.__treeHighPhoto50MotionState=state;
  const tick=()=>{if(!state.running)return;const now=read();const prev=state.samples.at(-1);if(!prev||now.t-prev.t>=250)state.samples.push(now);
   if(now.t-state.started>120000){state.running=false;state.timeout=true;return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);
  return {started:true,...read()};
 }
 const state=window.__treeHighPhoto50MotionState;if(!state)throw Error('Start the observer before real input');
 state.running=false;let settled=0,waitStart=performance.now();
 while(settled<60){await new Promise(requestAnimationFrame);const s=d.terrain.stats;settled=s.queuedTiles===0&&s.morphingGroups===0?settled+1:0;if(performance.now()-waitStart>120000)throw Error('Motion destination did not settle');}
 if(!/^[a-z0-9][a-z0-9-]{0,69}$/.test(o.name||''))throw Error('Evidence name required');
 const after=app.getSnapshot(),start=state.before.position,end=after.position;
 const evidence={name:o.name,before:state.before,after,samples:state.samples,summary:{distanceXZ:Math.hypot(end[0]-start[0],end[2]-start[2]),
  crossed48mCell:Math.floor(start[0]/48)!==Math.floor(end[0]/48)||Math.floor(start[2]/48)!==Math.floor(end[2]/48),
  yawChanged:after.yaw!==state.before.yaw,pitchChanged:after.pitch!==state.before.pitch,frames:after.render.frame-state.before.render.frame,
  realRAF:true,timeout:!!state.timeout,errors:after.errors}};
 evidence.summary.valid=evidence.summary.distanceXZ>=48&&evidence.summary.crossed48mCell&&!after.errors.length&&!after.preparing;
 const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:o.name,snapshot:evidence})});
 if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());
 window.__treeHighPhoto50MotionResult=evidence;return {saved:true,...evidence.summary};
})()
