// Prepared only: inject on the same frozen build after world readiness.
// A: debug=1, profile parameter ABSENT. B: debug=1&profile=1.
// window.__profileOverhead46Options={name,profile:false|true}; same ABBA script.
// 60 settled RAFs, then 180 RAF intervals. During sampling read ONLY timestamps.
// The page remains interactive; never freeze it while collecting or saving.
(() => {
 const app=window.kalajunV2,d=app?.debug,o=window.__profileOverhead46Options;
 if(!d||!o||typeof o.profile!=='boolean')throw Error('Ready world and explicit boolean profile option required');
 if(!/^[a-z0-9][a-z0-9-]{0,69}$/.test(o.name||''))throw Error('Invalid evidence name');
 if(window.__profileOverhead46Run?.running)throw Error('Collector already running');
 const params=new URLSearchParams(location.search);
 if(params.get('debug')!=='1'||params.get('time')!=='870'||params.get('view')!=='river-forest')throw Error('Use debug=1, time=870, river-forest');
 if(o.profile?params.get('profile')!=='1':params.has('profile'))throw Error('Profile URL must match explicit mode; OFF means absent');
 const pose={position:[-3611.851169467755,2329.157270885741,4805.483400316967],yaw:-29.88794104541604,pitch:-10};
 function contextError(){
  const p=d.camera.position,c=d.renderer.domElement;
  if(document.visibilityState!=='visible')return 'Page hidden';
  if(c.width!==1280||c.height!==800||d.renderer.getPixelRatio()!==1)return 'Viewport or DPR changed';
  if(Math.max(Math.abs(p.x-pose.position[0]),Math.abs(p.y-pose.position[1]),Math.abs(p.z-pose.position[2]),Math.abs(d.controls.yaw-pose.yaw),Math.abs(d.controls.pitch-pose.pitch))>1e-6||d.environment.minutes!==870)return 'Pose or time changed';
  return null;
 }
 const initialError=contextError();if(initialError)throw Error(initialError);
 const state=window.__profileOverhead46Run={running:true,name:o.name,profile:o.profile,url:location.href,phase:'settling',started:performance.now(),stable:0,times:[],errors:[],invalid:[],protocol:{settleRAFs:60,sampleRAFs:180,viewport:[1280,800],pixelRatio:1,pose,time:870,collector:'Only RAF timestamp differences during measured samples; one full snapshot after final timestamp'}};
 let previousTimestamp=null;
 const onHidden=()=>{if(document.visibilityState!=='visible')finish('Page lost visibility');};
 const onError=e=>state.errors.push({message:e.message||'Resource error',file:e.filename||null});
 const onRejected=e=>state.errors.push({message:String(e.reason?.stack||e.reason)});
 addEventListener('visibilitychange',onHidden);addEventListener('error',onError);addEventListener('unhandledrejection',onRejected);
 const timeout=setTimeout(()=>finish('Collector timeout'),240000);
 function finish(reason){
  if(!state.running)return;state.running=false;clearTimeout(timeout);
  removeEventListener('visibilitychange',onHidden);removeEventListener('error',onError);removeEventListener('unhandledrejection',onRejected);
  state.measurementEnded=performance.now();if(reason)state.invalid.push(reason);
  const endError=contextError();if(endError)state.invalid.push(endError);
  state.lastRendererFrame=d.renderer.info.render.frame;
  state.terrainEnd={queuedTiles:d.terrain.stats.queuedTiles,morphingGroups:d.terrain.stats.morphingGroups};
  if(state.terrainEnd.queuedTiles||state.terrainEnd.morphingGroups)state.invalid.push('Terrain not settled at end');
  if(state.lastRendererFrame-state.firstRendererFrame<180)state.invalid.push('Too few actual rendered frames');
  if(state.times.length!==180)state.invalid.push('Incomplete sample count');
  const sorted=state.times.slice().sort((a,b)=>a-b);
  state.meanMs=state.times.reduce((sum,x)=>sum+x,0)/Math.max(1,state.times.length);
  state.p95Ms=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null;
  state.snapshot=app.getSnapshot();state.errors.push(...state.snapshot.errors);
  if(state.errors.length)state.invalid.push('Application errors');
  state.valid=state.invalid.length===0;state.phase='saving';
  fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:state.name,snapshot:state})})
   .then(async response=>{if(!response.ok)throw Error('Evidence HTTP '+response.status+': '+await response.text());state.saved=true;state.phase='done';})
   .catch(error=>{state.saved=false;state.saveError=error.message;state.phase='save-failed';});
 }
 function tick(now){
  if(!state.running)return;
  if(state.phase==='settling'){
   const t=d.terrain.stats;state.stable=t.queuedTiles===0&&t.morphingGroups===0?state.stable+1:0;
   if(state.stable===60){const error=contextError();if(error){finish(error);return;}state.firstRendererFrame=d.renderer.info.render.frame;state.phase='sampling';previousTimestamp=now;}
  }else{
   state.times.push(now-previousTimestamp);previousTimestamp=now;
   if(state.times.length===180){finish();return;}
  }
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
 return {started:true,name:state.name,profile:state.profile,result:'window.__profileOverhead46Run'};
})()
