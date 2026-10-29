// Opt-in diagnostics. Per-RAF totals are distinct from per-invocation averages.
export class RafCPUProfile42 {
  constructor({now=()=>performance.now(),limit=120}={}){this.now=now;this.limit=limit;this.rows=[];this.active=null;this.scope=null;this.restores=[];}
  begin(){this.active={start:this.now(),renderMs:0,renderCalls:0,renders:{},boundaries:{}};}
  end(){if(!this.active)return;const r=this.active;r.syncMs=this.now()-r.start;delete r.start;this.rows.push(r);if(this.rows.length>this.limit)this.rows.shift();this.active=null;}
  recordRender(ms,type){const r=this.active;if(!r)return;r.renderMs+=ms;r.renderCalls++;const t=r.renders[type]??={ms:0,calls:0};t.ms+=ms;t.calls++;}
  wrap(object,key,name){if(!object||typeof object[key]!=='function')return;const original=object[key],descriptor=Object.getOwnPropertyDescriptor(object,key),owner=this;
    function wrapper(...args){if(!owner.active)return original.apply(this,args);const start=owner.now(),previous=owner.scope;owner.scope=name;try{return original.apply(this,args);}finally{const r=owner.active;if(r){const b=r.boundaries[name]??={ms:0,calls:0};b.ms+=owner.now()-start;b.calls++;}owner.scope=previous;}}
    object[key]=wrapper;this.restores.push(()=>{if(object[key]===wrapper){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}});
  }
  snapshot(){const rows=this.rows,summary={samples:rows.length,meanSyncMs:0,meanRendererMs:0,meanRendererCalls:0,renderTypes:{}};
    for(const r of rows){summary.meanSyncMs+=r.syncMs;summary.meanRendererMs+=r.renderMs;summary.meanRendererCalls+=r.renderCalls;for(const [name,v]of Object.entries(r.renders)){const t=summary.renderTypes[name]??={meanMs:0,meanCalls:0};t.meanMs+=v.ms;t.meanCalls+=v.calls;}}
    if(rows.length){summary.meanSyncMs/=rows.length;summary.meanRendererMs/=rows.length;summary.meanRendererCalls/=rows.length;for(const t of Object.values(summary.renderTypes)){t.meanMs/=rows.length;t.meanCalls/=rows.length;}}
    return {scope:'per-visible-RAF synchronous CPU; renderer calls included, boundaries overlap; excludes browser work between callbacks',...summary,rows:rows.map(r=>structuredClone(r))};
  }
  dispose(){for(const restore of this.restores.reverse())restore();this.restores=[];this.active=null;this.scope=null;}
}
