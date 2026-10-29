// Explicit one-page secondary check, never imported by production code.
// __treeHighPhoto50SequentialOptions={name:'tree-high-photo50-samepage'};
// Both states warm once, then normal RAF A/B/B/A; controls remain usable.
// Never executed: retired after the visual hot-switch reproduction failed.
throw new Error('Retired review helper: hot regrouping after movement violates shared wind slot order; no further same-page performance sampling');
(async()=>{
 const app=window.kalajunV2,d=app?.debug,o=window.__treeHighPhoto50SequentialOptions;
 if(!d||!/^[a-z0-9][a-z0-9-]{0,49}$/.test(o?.name||''))throw Error('Ready app and short evidence prefix required');
 const params=new URLSearchParams(location.search),initial=app.getSnapshot();
 const expected=[-3611.851169467755,2329.157270885741,4805.483400316967],yaw=-29.88794104541604,pitch=-10;
 if(params.has('profile')||d.gpuPassProfile)throw Error('Normal RAF without profile required');
 if(d.renderer.domElement.width!==1280||d.renderer.domElement.height!==800||d.renderer.getPixelRatio()!==1)throw Error('1280x800 DPR1 required');
 if(!initial.ready||initial.preparing||initial.time!==870||initial.errors.length||expected.some((v,i)=>Math.abs(v-initial.position[i])>1e-8)||Math.abs(initial.yaw-yaw)>1e-8||Math.abs(initial.pitch-pitch)>1e-8)throw Error('Return to original pose/time before starting');
 const position=d.camera.position.clone(),original=d.ecology.treeHighPhoto48,next=()=>new Promise(requestAnimationFrame),groups=[];
 let current=false;
 function state(){const s=d.terrain.stats;return {pose:d.camera.position.distanceToSquared(position)===0&&Math.abs(d.controls.yaw-yaw)<1e-8&&Math.abs(d.controls.pitch-pitch)<1e-8,
  q:s.queuedTiles,m:s.morphingGroups,visible:document.visibilityState==='visible',candidate:d.ecology.treeHighPhoto48,
  active:d.ecology.stats.treeActiveInstances,roots:d.ecology.stats.treeRootWindRoots,time:d.environment.minutes};}
 function check(s){return s.pose&&s.q===0&&s.m===0&&s.visible&&s.candidate===current&&s.active===3213&&s.roots===1027&&s.time===870;}
 function switchState(value){current=value;d.ecology.treeHighPhoto48=value;d.ecology.rebuildNearTrees(d.camera);d.ecology.syncTreeDynamics(d.camera);}
 async function settle(){let count=0,start=performance.now();while(count<60){await next();const s=state();if(!s.pose)throw Error('User or controls changed pose; comparison aborted');if(performance.now()-start>120000)throw Error('Could not reach 60 settled RAFs');count=check(s)?count+1:0;}}
 async function save(name,snapshot){const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot})});if(!r.ok)throw Error('Evidence HTTP '+r.status+': '+await r.text());}
 let result;
 try{
  for(const value of [false,true]){switchState(value);await settle();}
  for(const [tag,value]of [['a1',false],['b1',true],['b2',true],['a2',false]]){
   switchState(value);await settle();
   const before=app.getSnapshot();let last=await next(),frame=d.renderer.info.render.frame,valid=true;
   const samples=[];
   for(let i=0;i<180;i++){
    const stamp=await next(),f=d.renderer.info.render.frame,s=state(),ok=check(s)&&f>frame;
    valid&&=ok;samples.push({dt:stamp-last,renderFrames:f-frame,valid:ok});last=stamp;frame=f;
   }
   const after=app.getSnapshot(),sorted=samples.map(s=>s.dt).sort((a,b)=>a-b),name=o.name+'-'+tag;
   const summary={name,candidate:value,mean:sorted.reduce((a,b)=>a+b,0)/sorted.length,p50:sorted[90],p95:sorted[171],min:sorted[0],max:sorted.at(-1),samples:180,
    valid:valid&&!after.errors.length&&!after.preparing,poseUnchanged:state().pose,pmremLikeEvents:samples.map((s,i)=>({...s,i})).filter(s=>s.renderFrames>=34),
    active:after.ecology.treeActiveInstances,roots:after.ecology.treeRootWindRoots,batches:after.ecology.treeActiveBatches,windBytes:after.ecology.treeRootWindUploadBytes};
   const evidence={summary,scope:'Secondary same-page warmed native A/B/B/A; original four reload samples remain primary evidence; normal RAF, shadows, reflection, PMREM and user controls unchanged',before,after,samples};
   await save(name,evidence);groups.push(summary);window.__treeHighPhoto50SequentialProgress={completed:groups.length,groups};
   if(!summary.valid)throw Error('Invalid sample group '+tag+'; retained evidence and stopped');
  }
  result={name:o.name,scope:'Secondary same-page warmed ABBA, no reload and no hold',groups,valid:groups.every(g=>g.valid),originalCandidate:original};
 }finally{
  // Restore only our bounded candidate toggle; never undo a user camera movement.
  d.ecology.treeHighPhoto48=original;d.ecology.rebuildNearTrees(d.camera);d.ecology.syncTreeDynamics(d.camera);
 }
 await save(o.name+'-summary',result);window.__treeHighPhoto50SequentialResult=result;return {saved:true,...result};
})()
