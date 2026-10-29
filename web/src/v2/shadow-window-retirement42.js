// Retire detached private views outside selection/render. One indivisible dispose
// per animation frame: a slow driver call is measured, never claimed preemptible.
export class ShadowWindowRetirement42 {
 constructor({schedule=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id),now=()=>performance.now()}={}){this.schedule=schedule;this.cancel=cancel;this.now=now;this.queue=[];this.handle=null;this.closed=false;this.stats={pending:0,disposed:0,totalCpuMs:0,maxItemMs:0,maxFrameMs:0,frames:0,lastItemMs:0,lastSource:null};}
 enqueue(views){if(this.closed)throw Error('Retirement queue closed');for(const view of views)this.queue.push({view,age:0});this.stats.pending=this.queue.length;this.arm();}
 arm(){if(this.handle===null&&this.queue.length&&!this.closed)this.handle=this.schedule(()=>{this.handle=null;this.tick();});}
 tick(){if(this.closed)return;for(const entry of this.queue)entry.age++;if(this.queue[0]?.age>=2){const {view}=this.queue.shift(),start=this.now();view.dispose();const elapsed=this.now()-start;Object.assign(this.stats,{disposed:this.stats.disposed+1,totalCpuMs:this.stats.totalCpuMs+elapsed,maxItemMs:Math.max(this.stats.maxItemMs,elapsed),maxFrameMs:Math.max(this.stats.maxFrameMs,elapsed),frames:this.stats.frames+1,lastItemMs:elapsed,lastSource:view.source?.name||view._plan?.tag||'unnamed'});}this.stats.pending=this.queue.length;this.arm();}
 dispose(){this.closed=true;if(this.handle!==null)this.cancel(this.handle);this.handle=null;for(const{view}of this.queue.splice(0))view.dispose();this.stats.pending=0;}
}
