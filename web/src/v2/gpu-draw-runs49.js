import {GPUPassProfile} from './gpu-pass-profile.js';

// Diagnostic only, imported explicitly into an already loaded review page.
// The existing query owner is retained, but at most ONE observed consecutive
// draw run is timed in a RAF. No render, shader, object or buffer is replaced.
export class GPUDrawRuns49 extends GPUPassProfile {
  constructor(renderer,{scene,camera,classify=()=> 'other',shadowCameras=[],maxPending=8}={}) {
    super(renderer,{scene,camera,enabled:true,maxPending,maxFrames:120});
    if(!this.ext)throw Error('GPU timer extension unavailable');
    this.classify=classify;this.shadowCameras=shadowCameras;this.target=null;this.depth49=0;
    this.frames49=[];this.run49=null;this.occurrences49=new Map();this.drawSerial49=0;
    this.oldDraw49=renderer.renderBufferDirect;this.oldShadow49=renderer.shadowMap.render;
    this.oldClear49=renderer.clear;this.oldTarget49=renderer.setRenderTarget;
    const owner=this;
    this.shadow49=function(...args){owner.break49();owner.depth49++;try{return owner.oldShadow49.apply(this,args);}finally{owner.break49();owner.depth49--;}};
    this.draw49=function(...args){
      const context=owner.stack.at(-1),object=args[4],geometry=args[2],group=args[5];
      if(owner.frame&&context){
        const view=owner.depth49?'shadow'+owner.shadowCameras.indexOf(args[0]):'color';
        const family=owner.classify(object),base=context.kind+'.'+view+'.'+family;
        if(!owner.run49||owner.run49.base!==base||owner.run49.context!==context){
          owner._end();const ordinal=owner.occurrences49.get(base)||0;owner.occurrences49.set(base,ordinal+1);
          const label=base+'#'+ordinal;
          owner.run49={base,label,context,draws:0,triangles:0,instances:0,signature:2166136261,objects:[]};
          owner.frame.runs49.push(owner.run49);context.label=label;owner._begin(label);
        }
        const run=owner.run49,indexCount=geometry.index?.count??geometry.attributes?.position?.count??0;
        let start=Math.max(0,geometry.drawRange?.start??0),end=Math.min(indexCount,start+(geometry.drawRange?.count??Infinity));
        if(group){start=Math.max(start,group.start);end=Math.min(end,group.start+group.count);}
        const instances=object.isInstancedMesh?object.count:geometry.isInstancedBufferGeometry?geometry.instanceCount:1;
        const corners=Math.max(0,end-start),triangles=object.isMesh?corners*instances/3:0;
        run.draws++;run.triangles+=triangles;run.instances+=instances;
        const tuple=[object.id,geometry.id,args[3]?.id,start,end,instances];
        for(const n of tuple){run.signature^=n>>>0;run.signature=Math.imul(run.signature,16777619)>>>0;}
        if(run.objects.length<3)run.objects.push({name:object.name,id:object.id,geometry:geometry.id,material:args[3]?.id,instances,triangles});
        owner.drawSerial49++;
      }
      try{return owner.oldDraw49.apply(this,args);}catch(error){owner._invalidate();throw error;}
    };
    this.clear49=function(...args){owner.break49();return owner.oldClear49.apply(this,args);};
    this.target49=function(...args){owner.break49();return owner.oldTarget49.apply(this,args);};
    renderer.renderBufferDirect=this.draw49;renderer.shadowMap.render=this.shadow49;
    if(this.oldClear49)renderer.clear=this.clear49;if(this.oldTarget49)renderer.setRenderTarget=this.target49;
  }
  _begin(label){
    if(!this.frame||!this.target||label!==this.target||this.frame.issued)return;
    super._begin(label);
  }
  break49(){this._end();this.run49=null;}
  beginFrame(){const ok=super.beginFrame();if(ok){this.frame.runs49=[];this.frame.target49=this.target;this.run49=null;this.occurrences49.clear();}return ok;}
  endFrame(options){
    const frame=this.frame;this.break49();super.endFrame(options);
    if(frame)this.frames49.push({frame:frame.id,target:frame.target49,issued:frame.issued,invalid:frame.invalid,runs:frame.runs49.map(({context,...run})=>run)});
  }
  dispose(){
    if(this.disposed)return;
    const r=this.renderer;this.break49();
    if(r.renderBufferDirect===this.draw49)r.renderBufferDirect=this.oldDraw49;
    if(r.shadowMap.render===this.shadow49)r.shadowMap.render=this.oldShadow49;
    if(r.clear===this.clear49)r.clear=this.oldClear49;
    if(r.setRenderTarget===this.target49)r.setRenderTarget=this.oldTarget49;
    super.dispose();
  }
}

export function classifyWorldDraw49(debug){
  const batchModes=new WeakMap();for(const batch of debug.ecology.nearTreeBatches.values())batchModes.set(batch.mesh,batch.mode);
  const under=(o,group)=>{if(!group)return false;for(let p=o;p;p=p.parent)if(p===group)return true;return false;};
  return object=>{
    const mode=batchModes.get(object);
    if(mode!==undefined)return object.material?.alphaTest>0?'photo-'+mode:'tree-solid';
    if(under(object,debug.ecology.gpuBrushes?.group))return object.name.startsWith('gpu-needle-')?'needle':'twig';
    if(object.geometry?.userData?.farTreeAllocation)return 'far-tree';
    if(under(object,debug.terrain.group))return 'terrain';
    if(under(object,debug.ecology.group))return 'ground-flora';
    if(under(object,debug.structures.group))return 'structures';
    if(under(object,debug.water.group))return 'water';
    return 'other';
  };
}

export async function collectGPUDrawRuns49(debug,{inventoryFrames=8,sampleFrames=60,maxTargets=12,nextFrame=()=>new Promise(requestAnimationFrame)}={}){
  const gl=debug.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext)throw Error('GPU timer extension unavailable');
  if(debug.gpuPassProfile||gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Use debug=1 without profile/gpuPassProfile and no other query owner');
  const p=new GPUDrawRuns49(debug.renderer,{scene:debug.scene,camera:debug.camera,classify:classifyWorldDraw49(debug),shadowCameras:debug.environment.csm.lights.map(l=>l.shadow.camera)});
  const originalRender=p.originalRender,originalShadow=p.originalShadow,oldDraw=p.oldDraw49,oldClear=p.oldClear49,oldTarget=p.oldTarget49;
  const stamps=[],baseline=new Map();let targets=[],result;
  try{
    // Each interval starts after one application RAF and closes after the next.
    await nextFrame();
    for(let i=0;i<inventoryFrames+sampleFrames;i++){
      p.target=i<inventoryFrames?null:targets[(i-inventoryFrames)%targets.length];
      const begun=p.beginFrame(),start=performance.now(),stamp=await nextFrame();p.endFrame();stamps.push({index:i,stamp,elapsedMs:performance.now()-start,begun});
      if(!begun)continue;
      if(i<inventoryFrames){
        for(const run of p.frames49.at(-1).runs){const prior=baseline.get(run.label);if(!prior||run.triangles>prior.triangles)baseline.set(run.label,run);}
        if(i===inventoryFrames-1){
          // Cover all observed photo/needle/twig passes before control runs.
          const selected=[...baseline.values()].filter(r=>/\.(photo-|needle|twig)/.test(r.base)).sort((a,b)=>b.triangles-a.triangles);
          const views=new Set(),representatives=[];
          for(const run of selected){const view=run.base.split('.').slice(0,2).join('.');if(!views.has(view)){views.add(view);representatives.push(run);}}
          for(const run of selected)if(!representatives.includes(run))representatives.push(run);
          targets=representatives.slice(0,maxTargets).map(r=>r.label);if(!targets.length)throw Error('No tree draw runs observed');
        }
      }
    }
    for(let i=0;i<8&&p.pending.length;i++){await nextFrame();p.collect();}
    const gpu=p.snapshot(),byFrame=new Map(p.frames49.map(f=>[f.frame,f]));
    const measured=gpu.samples.map(s=>{const f=byFrame.get(s.frame),run=f?.runs.find(r=>r.label===f.target),reference=baseline.get(f?.target);return{...s,run,baselineSame:!!run&&!!reference&&run.signature===reference.signature&&run.draws===reference.draws&&run.triangles===reference.triangles};});
    result={scope:'One consecutive original draw run query per RAF; sampled runs are NOT whole-family GPU totals or clean FPS',inventoryFrames,sampleFrames,maxPending:p.maxPending,targets,baseline:[...baseline.values()],frames:p.frames49,stamps,gpu:{...gpu,samples:measured}};
  }finally{
    p.dispose();
    const r=debug.renderer;const restored=r.render===originalRender&&r.shadowMap.render===originalShadow&&r.renderBufferDirect===oldDraw&&r.clear===oldClear&&r.setRenderTarget===oldTarget;
    if(!restored)throw Error('GPU draw run diagnostic hooks were replaced during capture; inspect ownership before continuing');
    if(result)result.restored=true;
  }
  return result;
}
