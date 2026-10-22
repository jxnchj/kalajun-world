// Prediction and rendering compare exactly the same spatial fields. Caster
// revisions remain independent; no mutable scene state is presumed unchanged.
function cameraSignature(camera){
  camera.updateMatrixWorld();
  return camera.matrixWorld.elements.join(",")+":"+camera.projectionMatrix.elements.join(",");
}
function spatialSignature(view,light){
  const c=light.shadow.camera;
  return view+"|"+light.position.toArray()+"|"+light.target.position.toArray()+"|"+
    [c.left,c.right,c.top,c.bottom,c.near,c.far].join(",");
}
// Reuse a cascade until moving vegetation could shift its silhouette by a
// fraction of one shadow texel. Resolution, caster geometry and range stay intact.
export class SunShadowScheduler {
  constructor(lights,{maxTexelDrift=.3,maxCasterSpeed=1.25,maxInterval=.12}={}) {
    this.lights=lights;this.maxTexelDrift=maxTexelDrift;this.maxCasterSpeed=maxCasterSpeed;this.maxInterval=maxInterval;
    this.elapsed=0;this.sceneRevision="";this.force=false;
    this.states=lights.map(()=>({signature:null,spatialSignature:null,renderedAt:-Infinity,interval:0}));
    this.stats={requested:0,reused:0,cascades:lights.map(()=>({updates:0,reused:0,intervalMs:0}))};
    for(const light of lights){light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;}
  }
  setSceneState(revision,force=false){this.sceneRevision=Array.isArray(revision)?revision.map(String):String(revision);this.force=force;}
  // An already due map will be rendered from current geometry regardless of its
  // content revision. Its invalidation scan cannot change that decision.
  dueCascades(dt,camera=null,{force=this.force}={}) {
    const view=camera?cameraSignature(camera):null;
    const elapsed=this.elapsed+Math.max(0,Number.isFinite(dt)?dt:0);
    return this.lights.map((light,i)=>{
      const s=light.shadow,c=s.camera;
      const texel=Math.min(Math.abs(c.right-c.left)/s.mapSize.x,Math.abs(c.top-c.bottom)/s.mapSize.y);
      const interval=Math.min(this.maxInterval,texel*this.maxTexelDrift/this.maxCasterSpeed);
      return this.force||force||!s.map||s.needsUpdate||(camera!==null&&this.states[i].spatialSignature!==spatialSignature(view,light))||elapsed-this.states[i].renderedAt>=interval;
    });
  }
  update(dt,camera) {
    this.elapsed+=Math.max(0,Number.isFinite(dt)?dt:0);
    const view=cameraSignature(camera);
    this.lights.forEach((light,i)=>{
      const shadow=light.shadow,c=shadow.camera,state=this.states[i],stats=this.stats.cascades[i];
      const texel=Math.min(Math.abs(c.right-c.left)/shadow.mapSize.x,Math.abs(c.top-c.bottom)/shadow.mapSize.y);
      const interval=Math.min(this.maxInterval,texel*this.maxTexelDrift/this.maxCasterSpeed);
      state.interval=interval;stats.intervalMs=interval*1000;
      const revision=Array.isArray(this.sceneRevision)?this.sceneRevision[i]:this.sceneRevision;
      const spatial=spatialSignature(view,light),signature=spatial+"|"+revision;
      const refresh=this.force||!shadow.map||shadow.needsUpdate||state.signature!==signature||this.elapsed-state.renderedAt>=interval;
      if(refresh){
        shadow.needsUpdate=true;state.signature=signature;state.spatialSignature=spatial;state.renderedAt=this.elapsed;
        stats.updates++;this.stats.requested++;
      } else {stats.reused++;this.stats.reused++;}
    });
    this.force=false;
  }
  dispose(){for(const light of this.lights)light.shadow.autoUpdate=true;}
}
