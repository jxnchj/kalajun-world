import {isStandardProjectedDepth} from './room-shadow.js';

// Diagnostic only: standard projected depth is a cache candidate, not proof of
// temporal stability. Terrain morphs, doors and streaming still invalidate it.
export function standardShadowCandidate39(object){
  return !!object?.isMesh&&!object.isSkinnedMesh&&isStandardProjectedDepth(object.customDepthMaterial);
}
export class ShadowStaticProfile39{
  constructor(renderer,profile,{enabled=false,classify=standardShadowCandidate39}={}){
    this.renderer=renderer;this.profile=profile;this.enabled=enabled;this.classify=classify;this.depth=0;this.disposed=false;
    this.stats={shadowCalls:0,draws:0,candidateDraws:0,otherDraws:0,segments:0};
    if(!enabled)return;
    if(!profile||profile.renderer!==renderer||typeof profile._begin!=='function'||typeof profile._end!=='function')throw Error('Requires the existing GPUPassProfile owner');
    const owner=this;this.oldShadow=renderer.shadowMap.render;this.oldDraw=renderer.renderBufferDirect;this.oldClear=renderer.clear;
    this.shadowHook=function(...args){owner.depth++;owner.stats.shadowCalls++;try{return owner.oldShadow.apply(this,args);}finally{owner.depth--;}};
    this.clearHook=function(...args){
      const p=owner.profile,context=p.stack.at(-1);
      if(owner.depth&&p.frame&&context&&/^(main|reflection)\.shadow\./.test(context.label)){
        p._end();context.label=context.kind+'.shadow';p._begin(context.label);
      }
      return owner.oldClear.apply(this,args);
    };
    this.drawHook=function(...args){
      const p=owner.profile,context=p.stack.at(-1);
      if(owner.depth&&p.frame&&context&&/^(main|reflection)\.shadow(?:\.|$)/.test(context.label)){
        const candidate=owner.classify(args[4]),label=context.kind+'.shadow.'+(candidate?'standardCandidate':'animatedOrCustom');
        owner.stats.draws++;owner.stats[candidate?'candidateDraws':'otherDraws']++;
        if(context.label!==label){
          // Same owner's current timer ends before a new timer begins. Foreign
          // queries and capacity/disjoint failures use its existing rejection.
          p._end();context.label=label;p._begin(label);owner.stats.segments++;
        }
      }
      return owner.oldDraw.apply(this,args);
    };
    renderer.shadowMap.render=this.shadowHook;renderer.renderBufferDirect=this.drawHook;if(this.oldClear)renderer.clear=this.clearHook;
  }
  dispose(){
    if(this.disposed)return;
    if(this.renderer.shadowMap.render===this.shadowHook)this.renderer.shadowMap.render=this.oldShadow;
    if(this.renderer.renderBufferDirect===this.drawHook)this.renderer.renderBufferDirect=this.oldDraw;
    if(this.renderer.clear===this.clearHook)this.renderer.clear=this.oldClear;
    this.disposed=true;
  }
}
