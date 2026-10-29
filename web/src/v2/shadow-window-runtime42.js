import {captureWindowTarget42} from './shadow-window-target42.js';
import {ShadowWindowController42} from './shadow-window-controller42.js';
// Explicit production dependencies, no window.kalajunV2/debug global required.
// Caller owns the loading overlay and must await prepare before resuming movement.
export class ShadowWindowRuntime42 {
 constructor({world,renderer,environment,camera,terrain,ecology,renderNative}, {enabled=false,controllerOptions={},createController=api=>new ShadowWindowController42(api,{wholeStaticSources:true,...controllerOptions})}={}){
  this.enabled=enabled;this.api={world,debug:{renderer,environment,camera,terrain,ecology}};this.renderNative=renderNative;this.createController=createController;this.controller=null;this.generation=0;this.disposed=false;this.pending=null;this.stats={enabled,ready:false,phase:'idle',preparations:0,last:null};
 }
 async prepare({isCurrent=()=>true,yieldToInput=()=>Promise.resolve(),maxPasses=10}={}){
  if(!this.enabled||this.disposed)return {status:'disabled'};
  const generation=++this.generation,previous=this.pending;
  // Cancel old receiver immediately; await its asynchronous work before disposal.
  this.controller?.setEnabled(false);
  const current=()=>!this.disposed&&generation===this.generation&&isCurrent();
  const run=async()=>{
   if(previous)await previous.catch(()=>{});
   if(!current())return {status:'cancelled'};
   if(this.controller?.pending)await this.controller.pending;
   if(!current())return {status:'cancelled'};
   this.controller?.dispose();this.controller=this.createController(this.api);const c=this.controller;
   c.setEnabled(true);const start=performance.now(),record={status:'preparing',nativePassMs:[],totalMs:0};this.stats.ready=false;this.stats.preparations++;this.stats.phase='loading-prewarm';
   try{
    for(let i=0;i<maxPasses;i++){
     await yieldToInput();if(!current()){c.setEnabled(false);record.status='cancelled';return record;}
     const d=this.api.debug;d.camera.updateMatrixWorld();d.environment.csm.update();d.environment.csm.lights[0].shadow.needsUpdate=true;d.renderer.shadowMap.needsUpdate=true;
     // Real native submission triggers the same afterShadow hook as normal play.
     // The first local reference/MSAA draw is measured here, not deferred to W.
     const before=performance.now(),restoreTarget=captureWindowTarget42(d.renderer);try{this.renderNative();}finally{restoreTarget();record.nativePassMs.push(performance.now()-before);}
     if(c.pending)await c.pending;
     if(!current()){c.setEnabled(false);record.status='cancelled';return record;}
     if(c.owner?.stats.ready&&!c.owner.valid()&&!c.pending){record.status='ready';record.localDraw={...c.owner.stats.renderTiming};record.compileWallMs=c.owner.stats.compileWallMs;this.stats.ready=true;return record;}
     if(c.stats.reason==='no-visible-near-ground'){record.status='native-only';return record;}
    }
    throw Error('Local shadow loading preparation did not settle: '+(c.submissions?.stats?.reason||c.stats.lastFailure?.message||c.stats.reason||'unknown')); 
   }catch(error){c.setEnabled(false);record.status='failed';record.error=String(error?.message??error);throw error;}
   finally{record.totalMs=performance.now()-start;this.stats.last=record;this.stats.phase=record.status;}
  };
  const pending=run();this.pending=pending;try{return await pending;}finally{if(this.pending===pending)this.pending=null;}
 }
 dispose(){this.disposed=true;this.generation++;this.stats.ready=false;this.controller?.dispose();this.controller=null;}
}
