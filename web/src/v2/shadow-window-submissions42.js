import {sourceGeometryState42} from './shadow-window-coverage42.js';
// Observe the native nearest shadow pass. Due-scan state is deliberately not a
// draw list: a cascade known to redraw may have no tracker entries at all.
const DEPTH_FIELDS = ['side','visible','wireframe','map','alphaMap','alphaTest','clipShadows','clippingPlanes','clipIntersection','displacementMap','displacementScale','displacementBias','wireframeLinewidth','linewidth'];
export class ShadowWindowSubmissions42 {
 constructor(renderer,shadow,{afterShadow=null}={}) {
  this.renderer=renderer;this.shadow=shadow;this.afterShadow=afterShadow;this.records=new Map();this.facades=new WeakMap();this.groupFacades=new WeakMap();this.ready=false;this.disposed=false;this.revision=0;
  this.stats={passes:0,captures:0,draws:0,sources:0,failures:0};
  const owner=this,previous=renderer.shadowMap.render;this.previous=previous;
  this.wrapper=function(...args){
   if(owner.disposed||!renderer.shadowMap.enabled)return previous.apply(this,args);
   const direct=renderer.renderBufferDirect,records=new Map();let draws=0,success=false,unsupported=null;
   // Empty *redrawn* cascades clear old sources. A cached pass preserves them.
   const scheduled=renderer.shadowMap.autoUpdate!==false||renderer.shadowMap.needsUpdate;
   const present=!Array.isArray(args[0])||args[0].some(light=>light.shadow===shadow);
   const redraw=present&&scheduled&&(shadow.autoUpdate!==false||shadow.needsUpdate);
   const wrapped=function(camera,scene,geometry,depth,object,group){
    const result=direct.call(this,camera,scene,geometry,depth,object,group);
    if(camera===shadow.camera){
     const original=object.userData?.treeViewSource||object;
     let source=original;
     if(original!==object){
      // The off-scene owner supplies canonical attributes; the actual submitted
      // proxy supplies the parent/world transform. Never overwrite either.
      source=owner.facades.get(object);
      if(!source||Object.getPrototypeOf(source)!==original){source=Object.create(original);source.matrixWorld=object.matrixWorld.clone();owner.facades.set(object,source);}
      source.matrixWorld.copy(object.matrixWorld);
     }
     if(group){
      // Native multi-material groups are distinct depth draws. Preserve their
      // exact index interval and selected colour material without copying VBOs.
      let groups=owner.groupFacades.get(object);if(!groups){groups=new Map();owner.groupFacades.set(object,groups);}
      const key=[group.start,group.count,group.materialIndex??0].join('/'),base=source,baseGeometry=base.geometry;
      let facade=groups.get(key);
      if(!facade||Object.getPrototypeOf(facade)!==base||Object.getPrototypeOf(facade.geometry)!==baseGeometry){facade=Object.create(base);facade.geometry=Object.create(baseGeometry);facade.geometry.drawRange={start:0,count:0};facade.geometry.groups=[];groups.set(key,facade);}
      const total=baseGeometry.index?.count??baseGeometry.attributes.position.count;
      const start=Math.max(0,baseGeometry.drawRange.start,group.start),end=Math.min(total,baseGeometry.drawRange.start+baseGeometry.drawRange.count,group.start+group.count);
      facade.geometry.drawRange.start=start;facade.geometry.drawRange.count=Math.max(0,end-start);
      facade.material=Array.isArray(base.material)?base.material[group.materialIndex??0]:base.material;
      if(!facade.material){unsupported='Missing native group material: '+object.name;return result;}
      source=facade;
     }else if(Array.isArray(source.material)){unsupported='Native material array without explicit group: '+object.name;return result;}
     const state=Object.fromEntries(DEPTH_FIELDS.map(k=>[k,depth[k]]));
     const record=records.get(source)||{source,original,object,depth,state,groups:[],draws:0};
     // Group-dependent shaders/materials need explicit views, not silent reuse.
     if(record.depth!==depth||DEPTH_FIELDS.some(k=>record.state[k]!==state[k])){unsupported='Coverage source has incompatible native depth groups: '+object.name;return result;}
     record.groups.push(group?{...group}:null);record.draws++;records.set(source,record);draws++;
    }
    return result;
   };
   renderer.renderBufferDirect=wrapped;
   try{const value=previous.apply(this,args);success=true;return value;}
   finally{
    if(renderer.renderBufferDirect===wrapped)renderer.renderBufferDirect=direct;
    owner.stats.passes++;owner.stats.cameraId70=args[2]?.id??null;
    if(!success){owner.ready=false;owner.stats.failures++;}
    else {
     if(unsupported){owner.ready=false;owner.stats.failures++;owner.stats.reason=unsupported;}
     else if(draws||redraw){
      for(const[source,record]of records){const old=owner.records.get(source),scratch=sourceGeometryState42(source,old?.scratch||[]),changed=!old||old.snapshot.length!==scratch.length||scratch.some((v,i)=>v!==old.snapshot[i])||DEPTH_FIELDS.some(k=>record.state[k]!==old.state[k]);record.version=changed?++owner.revision:old.version;record.snapshot=changed?scratch:old.snapshot;record.scratch=changed?(old?.snapshot||[]):scratch;}
      if([...owner.records.keys()].some(source=>!records.has(source)))owner.revision++;
      owner.stats.reason='captured';owner.stats.revision=owner.revision;owner.records=records;owner.ready=true;owner.stats.captures++;owner.stats.draws=draws;owner.stats.sources=records.size;}
     // Native onAfterShadow/index restoration has completed here. Nested mask
     // rendering disables shadowMap, so it cannot recursively capture itself.
     if(draws||redraw||unsupported)owner.afterShadow?.(owner);
    }
   }
  };
  renderer.shadowMap.render=this.wrapper;
 }
 sources(){if(!this.ready)throw Error('Nearest native shadow submission not captured yet');return [...this.records.keys()];}
 states(){return new Map([...this.records].map(([source,record])=>[source,record.state]));}
 dispose(){this.disposed=true;if(this.renderer.shadowMap.render===this.wrapper)this.renderer.shadowMap.render=this.previous;this.records.clear();this.ready=false;this.afterShadow=null;}
}
