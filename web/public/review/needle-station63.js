const next=()=>new Promise(r=>requestAnimationFrame(r));
export async function benchmarkStation63(app,{name='needle-station63-abba',warm=120,samples=360}={}){
 if(!/^[\w-]+$/.test(name))throw Error('Invalid name');
 const d=app.debug,c=d.needleStationWind62,initial=app.getSnapshot(),records=[];
 if(initial.preparing||initial.terrain.queuedTiles||initial.errors.length)throw Error('Require settled world');
 if(!initial.gpu.available)throw Error('Require original profile=1 GPU timer');
 if(initial.viewport.width!==1280||initial.viewport.height!==800||initial.viewport.pixelRatio!==1)throw Error('Require1280x800 DPR1');
 const pose=JSON.stringify([initial.position,initial.yaw,initial.pitch,initial.time]);
 const check=()=>{const s=app.getSnapshot();if(document.visibilityState!=='visible'||s.errors.length||s.preparing||s.terrain.queuedTiles||JSON.stringify([s.position,s.yaw,s.pitch,s.time])!==pose)throw Error('World/visibility/input changed; benchmark invalid');return s;};
 const old=c.enabled;d.setReviewHold(false);
 const progress={phase:'starting',records};window.station63Progress=progress;
 try{
  for(const [label,enabled]of [['A1',false],['B1',true],['B2',true],['A2',false]]){
   progress.phase=label+'-warm';c.setEnabled(enabled);
   for(let i=0;i<warm;i++){await next();if(i%60===0)check();}
   progress.phase=label+'-sample';let last=await next();const intervals=[],gpuWindows=[];
   for(let i=0;i<samples;i++){const now=await next();intervals.push(now-last);last=now;if((i+1)%60===0){const s=check();gpuWindows.push(s.gpu.meanMs);if(enabled&&(s.needleStationWind62.stations!==88992||s.needleStationWind62.errors.length))throw Error('Candidate scope/error differs');}}
   const sorted=[...intervals].sort((a,b)=>a-b),snapshot=check();records.push({label,enabled,intervals,gpuWindows,meanMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p95:sorted[Math.ceil(sorted.length*.95)-1],gpuMeanMs:gpuWindows.reduce((a,b)=>a+b,0)/gpuWindows.length,snapshot});
  }
  progress.phase='complete';const result={scope:'one visible tab; original renderer GPU timer includes bake plus world/reflection; natural wind, same pose, ABBA; no geometry/LOD/density changes',warm,samples,records};
  const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});if(!r.ok)throw Error('Save failed');return result;
 }catch(e){progress.phase='failed';progress.error=String(e.stack);throw e;}finally{c.setEnabled(old);d.setReviewHold(false);}
}
