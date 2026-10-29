// Read-only observer of the existing authoritative scan. No new source scanner,
// caster filtering, render/query hook, matrix update or scheduler modification.
export function observeShadowStaticStability42(app){
 const d=app.debug??app,owner=d.environment?.shadowCasters,lights=d.environment?.csm?.lights;
 if(!owner?.entryReuse||!owner._entries||lights?.length!==3||typeof d.shadowStaticProfile39?.classify!=='function')throw Error('Requires existing complete caster entry tracker');
 const objectPrototype=Object.getPrototypeOf(Object.getPrototypeOf(d.scene));
 const previous=owner.update,previousShadow=d.renderer.shadowMap.render,states=lights.map(()=>null),samples=[],spatialSamples=[],spatialStates=lights.map(()=>null),observedFrames=lights.map(()=>-1),consumedFrames=lights.map(()=>-1);let phase='stationary',disposed=false;
 const eligible=o=>d.shadowStaticProfile39.classify(o)&&!o.userData.dynamicDoor&&!o.isSkinnedMesh
  &&o.onBeforeShadow===objectPrototype.onBeforeShadow&&o.onAfterShadow===objectPrototype.onAfterShadow
  &&(!o.morphTargetInfluences||o.morphTargetInfluences.every(v=>v===0));
 const equal=(a,b)=>!!a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 function hook(...args){
  const result=previous.apply(this,args),start=performance.now(),row={phase,position:d.camera.position.toArray(),cascades:[]};
  lights.forEach((light,i)=>{
   if(owner.stats.skippedCascades?.[i]){row.cascades.push({skipped:true,sourceObserved:false});return;}
   const s=light.shadow,c=s.camera,m=s.map,signature=[...c.matrixWorld.elements,...c.projectionMatrix.elements,...s.matrix.elements,c.reversedDepth,m,m?.width,m?.height,s.mapSize.x,s.mapSize.y,m?.depthTexture?.type,m?.depthTexture?.format,m?.depthTexture?.compareFunction,d.renderer.shadowMap.type,args[0].layers.mask];
   observedFrames[i]=owner._frame;const entries=new Map();let standard=0,excluded=0;
   for(const [o,e]of owner._entries[i])if(d.shadowStaticProfile39.classify(o)){standard++;if(eligible(o))entries.set(o,e.state);else excluded++;}
   const old=states[i];let changed=0,added=0,removed=0;
   for(const [o,state]of entries){if(!old?.entries.has(o))added++;else if(old.entries.get(o)!==state)changed++;}
   if(old)for(const o of old.entries.keys())if(!entries.has(o))removed++;
   const projectionStable=!!old&&equal(old.signature,signature),sourcesStable=!!old&&!changed&&!added&&!removed;
   row.cascades.push({skipped:false,sourceObserved:true,standard,eligible:entries.size,excluded,projectionStable,sourcesStable,cacheWouldHit:projectionStable&&sourcesStable,changed,added,removed});states[i]={signature,entries};
  });
  row.observerCPUms=performance.now()-start;samples.push(row);return result;
 }
 function shadowHook(...args){
  const due=lights.map(l=>d.renderer.shadowMap.enabled!==false&&(d.renderer.shadowMap.autoUpdate!==false||d.renderer.shadowMap.needsUpdate===true)&&(l.shadow.autoUpdate!==false||l.shadow.needsUpdate===true));
  const value=previousShadow.apply(this,args),row={phase,position:d.camera.position.toArray(),cascades:[]};
  lights.forEach((l,i)=>{if(!due[i]){row.cascades.push({rendered:false});return;}const s=l.shadow,c=s.camera,m=s.map,signature=[...c.matrixWorld.elements,...c.projectionMatrix.elements,...s.matrix.elements,c.reversedDepth,m,m?.width,m?.height,s.mapSize.x,s.mapSize.y,m?.depthTexture?.type,m?.depthTexture?.format,m?.depthTexture?.compareFunction,d.renderer.shadowMap.type];
   const sourceObserved=observedFrames[i]===owner._frame&&consumedFrames[i]!==owner._frame&&args[2]===d.camera;consumedFrames[i]=owner._frame;
   row.cascades.push({rendered:true,projectionStable:equal(spatialStates[i],signature),sourceObserved,sourceStatus:sourceObserved?'current-complete-scan':'unknown-not-a-cache-hit'});spatialStates[i]=signature;
  });spatialSamples.push(row);return value;
 }
 owner.update=hook;if(typeof previousShadow==='function')d.renderer.shadowMap.render=shadowHook;
 return{setPhase(value){phase=String(value);},snapshot(){const phases=[...new Set(samples.map(s=>s.phase))],summary=phases.map(phase=>({phase,cascades:lights.map((_,i)=>{const rows=samples.filter(s=>s.phase===phase).map(s=>s.cascades[i]).filter(s=>!s.skipped);let longestHitRun=0,run=0;for(const r of rows){run=r.cacheWouldHit?run+1:0;longestHitRun=Math.max(longestHitRun,run);}return{observations:rows.length,projectionHits:rows.filter(r=>r.projectionStable).length,sourceHits:rows.filter(r=>r.sourcesStable).length,combinedHits:rows.filter(r=>r.cacheWouldHit).length,longestHitRun,last:rows.at(-1)??null};})}));return{method:'Observe original caster tracker after update; standard class is not automatically static; no fresh source traversal; candidates include zero-morph standard objects only',summary,samples,spatialSamples,spatialSummary:[...new Set(spatialSamples.map(s=>s.phase))].map(phase=>({phase,cascades:lights.map((_,i)=>{const rows=spatialSamples.filter(s=>s.phase===phase).map(s=>s.cascades[i]).filter(s=>s.rendered);return{rendered:rows.length,projectionHits:rows.filter(s=>s.projectionStable).length,currentSourceObserved:rows.filter(s=>s.sourceObserved).length};})}))};},dispose(){if(disposed)return;if(owner.update===hook)owner.update=previous;if(d.renderer.shadowMap.render===shadowHook)d.renderer.shadowMap.render=previousShadow;states.fill(null);spatialStates.fill(null);disposed=true;}};
}
