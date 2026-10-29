// OFF by construction. Independent, bounded mid/far experiment; native receiver,
// PCF, depth convention, scheduler and complete source geometry remain unchanged.
export class ShadowStaticCache42 {
 constructor(app,{enabled=false,stableDue=3}={}){
  this.d=app.debug??app;const d=this.d;this.r=d.renderer;this.lights=d.environment.csm.lights;this.enabled=false;this.disposed=false;this.stableDue=stableDue;
  if(this.lights.length!==3||!Number.isInteger(stableDue)||stableDue<2)throw Error('Requires three original CSM and bounded stable warmup');
  this.original={shadow:this.r.shadowMap.render,draw:this.r.renderBufferDirect,clear:this.r.clear};
  this.states=[null,...[1,2].map(i=>({i,light:this.lights[i],projection:null,observations:0,cache:null,valid:false,sources:new Map()}))];
  const originalTracker=d.environment.shadowCasters;
  this.tracker=new originalTracker.constructor(d.scene,this.lights,{terrainDomainCapture:false,entryReuse:true,shadowType:this.r.shadowMap.type});
  const capture=this.tracker._object.bind(this.tracker);this.tracker._object=object=>this.eligible(object)?capture(object):0;
  this.objectPrototype=Object.getPrototypeOf(Object.getPrototypeOf(d.scene));
  this.stats={enabled:false,frames:0,hits:0,misses:0,warmBuilds:0,projectionMisses:0,sourceMisses:0,sourceScanMs:0,lastSourceScanMs:0,lastCPUms:0,skippedDraws:0,staticDraws:0,dynamicDraws:0,copyCalls:0,error:null,bytes:0,cascades:[null,{hits:0,misses:0,builds:0},{hits:0,misses:0,builds:0}]};
  this.phase=null;this.plans=new Map();this.shadowDepth=0;
  const owner=this;
  this.shadowHook=function(...args){return owner.render(this,args);};
  this.drawHook=function(...args){
   if(owner.enabled&&owner.shadowDepth){const plan=owner.plans.get(args[0]);if(plan){
    const isStatic=plan.sources.has(args[4]);
    if(owner.phase==='build'){if(!isStatic)return;owner.stats.staticDraws++;}
    else if(plan.action==='hit'||plan.action==='build'){if(isStatic){owner.stats.skippedDraws++;return;}owner.stats.dynamicDraws++;}
   }}
   return owner.original.draw.apply(this,args);
  };
  this.clearHook=function(...args){
   const plan=owner.enabled&&owner.shadowDepth&&owner.phase!=='build'?[...owner.plans.values()].find(p=>p.state.light.shadow.map===owner.r.getRenderTarget()&&(p.action==='hit'||p.action==='build')):null;
   const value=owner.original.clear.apply(this,args);
   if(plan)owner.copy(plan.state.cache.depthTexture,plan.state.light.shadow.map.depthTexture);
   return value;
  };
  this.r.shadowMap.render=this.shadowHook;this.r.renderBufferDirect=this.drawHook;this.r.clear=this.clearHook;
  this.setEnabled(enabled);
 }
 eligible(o){
  const p=this.objectPrototype;
  return !!o?.isMesh&&this.d.shadowStaticProfile39.classify(o)&&!o.userData.dynamicDoor&&!o.isSkinnedMesh
   &&o.onBeforeShadow===p.onBeforeShadow&&o.onAfterShadow===p.onAfterShadow
   &&(!o.morphTargetInfluences||o.morphTargetInfluences.every(v=>v===0));
 }
 setEnabled(value){if(this.disposed)throw Error('Disposed shadow cache');this.enabled=!!value;this.stats.enabled=this.enabled;if(!this.enabled){for(const s of this.states)if(s){s.valid=false;s.observations=0;s.cache?.dispose();s.cache?.depthTexture?.dispose();s.cache=null;s.sources.clear();}this.stats.bytes=0;}}
 signature(s,camera){
  const shadow=s.light.shadow,c=shadow.camera,m=shadow.map,t=m?.depthTexture;
  return [...c.matrixWorld.elements,...c.projectionMatrix.elements,...shadow.matrix.elements,c.reversedDepth,m,m?.width,m?.height,shadow.mapSize.x,shadow.mapSize.y,t,t?.type,t?.format,t?.compareFunction,t?.minFilter,t?.magFilter,this.r.shadowMap.type,camera.layers.mask];
 }
 same(a,b){return !!a&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
 sameSources(a,b){if(a.size!==b.size)return false;for(const[o,v]of a)if(b.get(o)!==v)return false;return true;}
 copy(from,to){
  const r=this.r,target=r.getRenderTarget(),face=r.getActiveCubeFace(),level=r.getActiveMipmapLevel(),v=r.getViewport(this.lights[1].shadow.map.viewport.clone()),s=r.getScissor(this.lights[1].shadow.map.scissor.clone()),test=r.getScissorTest();
  try{r.copyTextureToTexture(from,to);this.stats.copyCalls++;}finally{r.setRenderTarget(target,face,level);r.setViewport(v);r.setScissor(s);r.setScissorTest(test);}
 }
 allocate(s){
  const original=s.light.shadow.map;
  if(!original?.depthTexture||original.width!==2048||original.height!==2048||original.samples!==0)throw Error('Only existing complete 2048 single-sample depth targets are supported');
  if(s.cache&&(s.cache.width!==original.width||s.cache.height!==original.height||s.cache.depthTexture.type!==original.depthTexture.type||s.cache.depthTexture.format!==original.depthTexture.format)){s.cache.dispose();s.cache.depthTexture?.dispose();s.cache=null;}
  if(!s.cache){s.cache=original.clone();this.r.initRenderTarget(s.cache);if(s.cache.depthTexture===original.depthTexture)throw Error('Depth cache aliases original');}
  for(const k of ['type','format','compareFunction','minFilter','magFilter'])if(s.cache.depthTexture[k]!==original.depthTexture[k])throw Error('Depth texture contract changed');
  this.stats.bytes=this.states.filter(s=>s?.cache).reduce((n,s)=>n+s.cache.width*s.cache.height*4,0);
 }
 render(context,args){
  if(!this.enabled||this.disposed||this.shadowDepth||args[1]!==this.d.scene||args[2]!==this.d.camera)return this.original.shadow.apply(context,args);
  const start=performance.now(),[submitted,scene,camera]=args,r=this.r;
  if(!r.shadowMap.enabled||(!r.shadowMap.autoUpdate&&!r.shadowMap.needsUpdate))return this.original.shadow.apply(context,args);
  const due=this.states.map(s=>!!s&&submitted.includes(s.light)&&(s.light.shadow.autoUpdate||s.light.shadow.needsUpdate));
  if(!due.some(Boolean))return this.original.shadow.apply(context,args);
  this.stats.frames++;this.plans.clear();let buildChosen=false;
  try{
   // Current matrices are already propagated by the real renderer. No stale
   // due-scan registry is consulted: eligible sources are captured here.
   for(const s of this.states)if(s&&due[s.i]){
    s.light.shadow.updateMatrices(s.light,camera);const signature=this.signature(s,camera);
    if(!this.same(s.projection,signature)){s.projection=signature;s.observations=0;s.valid=false;this.stats.projectionMisses++;}
    else s.observations++;
    this.plans.set(s.light.shadow.camera,{state:s,action:'miss',sources:new Map()});
   }
   const captureMask=this.states.map(s=>!!s&&due[s.i]&&(s.valid||s.observations>=this.stableDue));
   const scanStart=performance.now();
   if(captureMask.some(Boolean))this.tracker.update(camera,{updateWorldMatrices:false,shadowType:r.shadowMap.type,skipCascades:captureMask.map(v=>!v)});
   this.stats.lastSourceScanMs=performance.now()-scanStart;this.stats.sourceScanMs+=this.stats.lastSourceScanMs;
   for(const plan of this.plans.values()){
    const s=plan.state;if(captureMask[s.i]){
     for(const[o,e]of this.tracker._entries[s.i])if(this.eligible(o))plan.sources.set(o,e.state);
     if(s.valid&&!this.sameSources(s.sources,plan.sources)){s.valid=false;s.observations=0;this.stats.sourceMisses++;}
     if(s.valid){plan.action='hit';this.stats.hits++;this.stats.cascades[s.i].hits++;}
     else if(s.observations>=this.stableDue&&!buildChosen&&plan.sources.size){plan.action='build';buildChosen=true;}
    }
    if(plan.action==='miss'){this.stats.misses++;this.stats.cascades[s.i].misses++;}
   }
   this.shadowDepth++;
   try{
    for(const plan of this.plans.values())if(plan.action==='build'){
     const s=plan.state;this.allocate(s);this.phase='build';r.shadowMap.needsUpdate=true;s.light.shadow.needsUpdate=true;
     this.original.shadow.call(context,[s.light],scene,camera);
     this.copy(s.light.shadow.map.depthTexture,s.cache.depthTexture);
     s.sources=plan.sources;s.valid=true;s.light.shadow.needsUpdate=true;
     this.stats.warmBuilds++;this.stats.cascades[s.i].builds++;
    }
    this.phase='composite';r.shadowMap.needsUpdate=true;
    return this.original.shadow.apply(context,args);
   }finally{this.shadowDepth--;this.phase=null;}
  }catch(error){
   this.stats.error=String(error);this.phase=null;this.shadowDepth=0;this.dispose();
   // Restore every originally due cascade via one complete native pass.
   r.shadowMap.needsUpdate=true;for(const s of this.states)if(s&&due[s.i])s.light.shadow.needsUpdate=true;
   return this.original.shadow.apply(context,args);
  }finally{this.plans.clear();this.stats.lastCPUms=performance.now()-start;}
 }
 dispose(){
  if(this.disposed)return;this.setEnabled(false);this.tracker.dispose();const r=this.r;
  if(r.shadowMap.render===this.shadowHook)r.shadowMap.render=this.original.shadow;
  if(r.renderBufferDirect===this.drawHook)r.renderBufferDirect=this.original.draw;
  if(r.clear===this.clearHook)r.clear=this.original.clear;
  this.disposed=true;
 }
}
