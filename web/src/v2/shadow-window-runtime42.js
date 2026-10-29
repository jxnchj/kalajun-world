import {captureWindowTarget42} from './shadow-window-target42.js';
import {ShadowWindowController42} from './shadow-window-controller42.js';
// Snapshot only already-computed fields. Do not call valid(): it can refresh
// source certificates and is not a read-only diagnostic operation.
export function shadowWindowPreparationDiagnostic42(c){
 try{
 const o=c.owner,s=c.stats||{},n=c.submissions,ix=c.index?.stats||{};
 const snapshot={
  controller:{phase:s.phase??null,reason:s.reason??null,pending:Boolean(c.pending),preparations:s.preparations??0,failures:s.failures??0,lastFailure:s.lastFailure?{...s.lastFailure,changes:s.lastFailure.changes?.map(x=>({...x}))}:null,viewReconciliations:s.viewReconciliations??0,lastViewReconciliation:s.lastViewReconciliation?{...s.lastViewReconciliation}:null},
  submissions:{ready:n?.ready??false,revision:n?.revision??null,...(n?.stats||{})},
  index:{revision:c.index?.revision??null,sources:ix.sources??null,sourceWorkCount:ix.sourceWorkCount??null,maxSourceWork:ix.maxSourceWork?{...ix.maxSourceWork}:null},
  beforeColor:s.beforeColor70??null,
  owner:o?{ready:o.stats.ready,reason:o.stats.reason??null,viewsReady:o.viewsReady??null,programsRequired:o.programsRequired??null,programPreparationPending:o.programPreparationPending??null,sourceRevision:o.sourceRevision??null,commitGeneration:o.commitGeneration64??null,lastPlanReconciliation:o.stats.lastPlanReconciliation52?{...o.stats.lastPlanReconciliation52}:null,programMiss:o.stats.programMiss52??null}:null
 };
 // Also reject cycles/BigInt so diagnostics cannot break the existing JSON export.
 const copy=structuredClone(snapshot);JSON.stringify(copy);return copy;
 }catch(error){let message='Snapshot unavailable';try{message=String(error?.message??error).slice(0,512);}catch{}return{diagnosticError:message};}
}
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
   c.setEnabled(true);const start=performance.now(),record={status:'preparing',nativePassMs:[],passes:[],totalMs:0};this.stats.ready=false;this.stats.preparations++;this.stats.phase='loading-prewarm';
   try{
    for(let i=0;i<maxPasses;i++){
     await yieldToInput();if(!current()){c.setEnabled(false);record.status='cancelled';return record;}
     const d=this.api.debug;d.camera.updateMatrixWorld();d.environment.csm.update();d.environment.csm.lights[0].shadow.needsUpdate=true;d.renderer.shadowMap.needsUpdate=true;
     // Real native submission triggers the same afterShadow hook as normal play.
     // The first local reference/MSAA draw is measured here, not deferred to W.
     const before=performance.now(),restoreTarget=captureWindowTarget42(d.renderer);try{this.renderNative();}finally{restoreTarget();record.nativePassMs.push(performance.now()-before);}
     if(c.pending)await c.pending;
     if(!current()){c.setEnabled(false);record.status='cancelled';return record;}
     const ready=c.owner?.stats.ready&&!c.owner.valid()&&!c.pending;
     record.passes.push(shadowWindowPreparationDiagnostic42(c));
     if(ready){record.status='ready';record.localDraw={...c.owner.stats.renderTiming};record.compileWallMs=c.owner.stats.compileWallMs;this.stats.ready=true;return record;}
     if(c.stats.reason==='no-visible-near-ground'){record.status='native-only';return record;}
    }
    throw Error('Local shadow loading preparation did not settle: controller='+(c.stats.reason||'unknown')+'; native='+(c.submissions?.stats?.reason||'unknown')+'; owner='+(c.stats.beforeColor70?.valid??c.owner?.stats?.reason??'no-owner')+'; failure='+(c.stats.lastFailure?.message||'none'));
   }catch(error){record.failureState=shadowWindowPreparationDiagnostic42(c);c.setEnabled(false);record.status='failed';record.error=String(error?.message??error);throw error;}
   finally{record.totalMs=performance.now()-start;this.stats.last=record;this.stats.phase=record.status;}
  };
  const pending=run();this.pending=pending;try{return await pending;}finally{if(this.pending===pending)this.pending=null;}
 }
 dispose(){this.disposed=true;this.generation++;this.stats.ready=false;this.controller?.dispose();this.controller=null;}
}
