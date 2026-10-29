// Review-only observer. Uses the existing app/runtime and evidence endpoint;
// never draws, freezes, moves, compiles or installs a second shadow controller.
export function observeShadowWindow45({name,frames=480,speed=2.8,maxMs=180000,startOnInput=false,anchorProbe=null}={}){
 if(!/^[a-zA-Z0-9_-]{1,70}$/.test(name||''))throw Error('Invalid evidence name');
 if(!Number.isInteger(frames)||frames<1||frames>1800)throw Error('Invalid frame limit');
 const result={state:'waiting-first-interactive',installedAt:performance.now(),url:location.href,rows:[],keyEvents:[]};
 let raf=0,cancelled=false,last=null,api,controls,oldSpeed,lastFrame=-1,resolve,reject;
 const done=new Promise((a,b)=>{resolve=a;reject=b;});
 const clone=v=>v===undefined?null:structuredClone(v);
 const key=e=>{if(!['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code))return;if(e.type==='keydown'&&e.code==='KeyW'&&!result.inputPosition&&api?.debug)result.inputPosition=api.debug.camera.position.toArray();result.keyEvents.push({type:e.type,code:e.code,repeat:e.repeat,t:performance.now(),trusted:e.isTrusted,position:api?.debug.camera.position.toArray()??null});};
 addEventListener('keydown',key,true);addEventListener('keyup',key,true);
 const cleanup=()=>{cancelAnimationFrame(raf);removeEventListener('keydown',key,true);removeEventListener('keyup',key,true);if(controls)controls.speed=oldSpeed;};
 const finish=async()=>{
  result.state='complete';result.end=api.getSnapshot();const c=api.debug.localShadowWindow42.controller;
  result.controller=clone(c?.stats);result.index=clone(c?.index.stats);result.owner=clone(c?.owner?.stats);
  const origin=result.inputPosition??result.start.position,p=result.end.position;
  result.horizontalDistance=Math.hypot(p[0]-origin[0],p[2]-origin[2]);
  result.summary={frames:result.rows.length,ready:result.rows.filter(r=>r.ready&&r.valid===null).length,pending:result.rows.filter(r=>r.pending).length,hiddenFrames:result.rows.filter(r=>r.visibility!=='visible').length};
  cleanup();const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});
  if(!response.ok)throw Error('Evidence save HTTP '+response.status);result.saved=true;resolve(result);
 };
 const tick=now=>{
  try{
   if(cancelled)return;
   if(now-result.installedAt>maxMs)throw Error('Observer timeout; no synthetic completion');
   api=window.kalajunV2;const d=api?.debug;
   if(!d){raf=requestAnimationFrame(tick);return;}
   if(!controls){const start=api.getSnapshot();if(!start.ready||start.preparing){raf=requestAnimationFrame(tick);return;}
    if(!d.localShadowWindow42?.enabled)throw Error('localShadowWindow42 is not enabled');
    controls=d.controls;oldSpeed=controls.speed;if(speed!==null)controls.speed=speed;
    result.start=start;result.startController=clone(d.localShadowWindow42.controller?.stats);result.armedAt=performance.now();result.firstFrameToArmMs=result.armedAt-start.loadTimings.navigationToFirstFrameSubmittedMs;result.state=startOnInput?'waiting-native-input':'recording';result.speed=controls.speed;
   }
   if(startOnInput&&!result.inputPosition){raf=requestAnimationFrame(tick);return;}
   if(result.state==='waiting-native-input'){result.state='recording';result.inputAfterArmMs=performance.now()-result.armedAt;}
   const f=d.renderer.info.render.frame;
   if(f!==lastFrame){lastFrame=f;const c=d.localShadowWindow42.controller,o=c?.owner,b=d.ecology.reachBankCover39?.stats;
    const hit=anchorProbe?anchorProbe(d.camera,api.world.surface):null;const desired=hit?.point??null,lightError=desired&&o?.budget?.basis?[o.budget.basis.right,o.budget.basis.up].map(axis=>axis.reduce((n,v,i)=>n+v*(desired[i]-o.anchor[i]),0)):null;
    if(!result.inputPosition&&controls.keys.has('KeyW'))result.inputPosition=d.camera.position.toArray();
    result.rows.push({t:performance.now(),dt:last===null?null:now-last,renderFrame:f,position:d.camera.position.toArray(),beforeColor70:clone(c?.stats.beforeColor70??null),ready:o?.stats.ready??false,valid:o?o.valid():'no-owner',pending:!!c?.pending,provisionalSources:o?.stats.provisional57?.sources?.length??0,provisionalExtraTriangles:o?.stats.provisional57?.extraTrianglesUpperBound??0,desiredAnchor:desired,windowAnchor:o?.anchor?.slice()??null,lightErrorXY:lightError,groundCenterInWindow:lightError?lightError.every(v=>Math.abs(v)<o.span/2):null,deltaActive:!!o?.budget.delta64,deltaSources:o?.budget.delta64?.sources?.length??0,deltaExtraTriangles:o?.budget.delta64?.extraTrianglesUpperBound??0,detailCalls:o?.stats.calls??null,detailTriangles:o?.stats.triangles??null,detailTotalMs:o?.stats.renderTiming?.totalMs??null,preparations:c?.stats.preparations??0,phase:c?.stats.phase,reason:c?.stats.reason,sourceRevision:c?.submissions.revision,visibility:document.visibilityState,q:d.terrain.stats.queuedTiles,bankBuilt:b?.built,bankBuildWorkMs:b?.buildWorkMs,shadowBounds45:clone(b?.shadowBounds45)});last=now;
   }
   if(result.rows.length>=frames){finish().catch(e=>{result.state='failed';result.error=String(e);reject(e);});return;}
   raf=requestAnimationFrame(tick);
  }catch(e){cleanup();result.state='failed';result.error=String(e);reject(e);}
 };
 raf=requestAnimationFrame(tick);
 return {result,done,cancel(){cancelled=true;cleanup();result.state='cancelled';resolve(result);}};
}
