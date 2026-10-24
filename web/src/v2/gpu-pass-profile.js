// Opt-in bounded GPU diagnostic. No CPU timing is reported as GPU time.
// render() tail includes Three's target resolve; setup contains pre-shadow work.
export class GPUPassProfile {
  constructor(renderer,{scene,camera,enabled=false,maxPending=48,maxFrames=60}={}) {
    this.renderer=renderer;this.scene=scene;this.camera=camera;this.enabled=enabled;
    this.gl=renderer.getContext();this.ext=enabled?this.gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
    this.maxPending=maxPending;this.maxFrames=maxFrames;this.pending=[];this.waiting=[];this.samples=[];this.frame=null;this.active=null;this.stack=[];this.disposed=false;
    this.counters={frames:0,discarded:0,disjoint:0,capacity:0,foreignQuery:0,errors:0};
    if(!this.ext)return;
    const owner=this;this.originalRender=renderer.render;this.originalShadow=renderer.shadowMap.render;
    this.renderHook=function(...args){
      if(!owner.frame)return owner.originalRender.apply(this,args);
      const parent=owner.stack.at(-1);owner._end();
      const kind=args[0]===owner.scene?(args[1]===owner.camera?'main':'reflection'):'output';
      const context={kind,label:kind==='output'?'output':kind+'.setup'};owner.stack.push(context);owner._begin(context.label);
      try{return owner.originalRender.apply(this,args);}catch(error){owner._invalidate();throw error;}
      finally{owner._end();owner.stack.pop();if(parent)owner._begin(parent.label);}
    };
    this.shadowHook=function(...args){
      const context=owner.stack.at(-1);
      if(!owner.frame||!context||context.kind==='output')return owner.originalShadow.apply(this,args);
      owner._end();context.label=context.kind+'.shadow';owner._begin(context.label);
      try{return owner.originalShadow.apply(this,args);}catch(error){owner._invalidate();throw error;}
      finally{owner._end();context.label=context.kind+'.color';owner._begin(context.label);}
    };
    renderer.render=this.renderHook;renderer.shadowMap.render=this.shadowHook;
  }
  _invalidate(){if(this.frame)this.frame.invalid=true;this.counters.errors++;}
  _begin(label){
    if(!this.frame||this.frame.invalid||this.disposed)return;
    if(this.active)throw new Error('GPU profile query nesting');
    const gl=this.gl,ext=this.ext;
    if(this.pending.length>=this.maxPending){this.frame.invalid=true;this.counters.capacity++;return;}
    // Never end or replace a query owned by another profiler.
    if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){this.frame.invalid=true;this.counters.foreignQuery++;return;}
    const query=gl.createQuery();if(!query){this._invalidate();return;}
    try{gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}catch(error){gl.deleteQuery(query);this._invalidate();throw error;}
    const record={query,label,frame:this.frame};this.pending.push(record);this.frame.pending++;this.frame.issued++;this.active=record;
  }
  _end(){if(!this.active)return;this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.active=null;}
  beginFrame(){
    if(this.disposed||!this.ext||!this.enabled)return false;
    if(this.frame)throw new Error('GPU profile frame already active');
    this.collect();if(this.pending.length>=this.maxPending){this.counters.capacity++;return false;}this.frame={id:++this.counters.frames,pending:0,issued:0,invalid:false,closed:false,passes:{}};return true;
  }
  endFrame({failed=false}={}){
    if(!this.frame)return;
    this._end();this.frame.invalid ||= failed;this.frame.closed=true;this.waiting.push(this.frame);this.frame=null;this.stack.length=0;this._publish();
  }
  _publish(){
    while(this.waiting.length&&this.waiting[0].pending===0){const frame=this.waiting.shift();
      if(frame.invalid||!frame.issued){this.counters.discarded++;continue;}
      const totalMs=Object.values(frame.passes).reduce((n,v)=>n+v,0);
      this.samples.push({frame:frame.id,passes:frame.passes,totalMs});if(this.samples.length>this.maxFrames)this.samples.shift();
    }
  }
  collect(){
    if(!this.ext||this.disposed)return;
    const gl=this.gl;
    if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){
      this.counters.disjoint++;if(this.frame)this.frame.invalid=true;
      this._end();for(const p of this.pending){p.frame.invalid=true;p.frame.pending--;gl.deleteQuery(p.query);}this.pending.length=0;this._publish();return;
    }
    while(this.pending.length&&this.pending[0]!==this.active&&gl.getQueryParameter(this.pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const p=this.pending.shift();const ns=gl.getQueryParameter(p.query,gl.QUERY_RESULT);gl.deleteQuery(p.query);p.frame.pending--;
      if(Number.isFinite(ns)&&ns>=0)p.frame.passes[p.label]=(p.frame.passes[p.label]||0)+ns/1e6;else p.frame.invalid=true;
    }
    this._publish();
  }
  snapshot(){
    this.collect();const labels=new Set(this.samples.flatMap(f=>Object.keys(f.passes)));
    return {enabled:this.enabled,available:!!this.ext,scope:'GPU timer query; render setup, shadowMap.render, post-shadow color plus resolve, output render; no nested queries',...this.counters,pending:this.pending.length,samples:this.samples.map(f=>({...f,passes:{...f.passes}})),means:Object.fromEntries([...labels].map(label=>[label,this.samples.reduce((n,f)=>n+(f.passes[label]||0),0)/this.samples.length]))};
  }
  dispose(){
    if(this.disposed)return;this._end();for(const p of this.pending)this.gl.deleteQuery(p.query);this.pending.length=0;this.waiting.length=0;this.frame=null;this.stack.length=0;
    if(this.renderer.render===this.renderHook)this.renderer.render=this.originalRender;
    if(this.renderer.shadowMap.render===this.shadowHook)this.renderer.shadowMap.render=this.originalShadow;
    this.disposed=true;
  }
}
