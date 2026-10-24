import {terrainRowInput} from './terrain-row-kernel.js';
// Worker never owns queue order, activation or GPU upload policy. Inputs are
// structured-cloned, not transferred: the main world/parent remains live.
export class TerrainRowWorkerClient {
 constructor(inputs,{makeWorker=()=>new Worker(new URL('./terrain-row-worker.js',import.meta.url),{type:'module'}),limit=2,timeoutMs=15000}={}) {
  if(!Number.isInteger(limit)||limit<1||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('Invalid terrain worker limits');
  this.limit=limit;this.timeoutMs=timeoutMs;this.nextId=1;this.pending=new Map();this.ready=false;this.closed=false;
  this.stats={ready:false,pending:0,completed:0,discarded:0,computeMs:0,error:null,initMs:0};
  const start=performance.now();
  try{
   this.worker=makeWorker();this.timer=setTimeout(()=>this.fail('Terrain worker initialization timeout'),timeoutMs);
   this.worker.onmessage=event=>{
    if(this.closed)return;const m=event.data;
    if(!m||typeof m!=='object'){this.fail('Malformed terrain worker message');return;}
    if(m.type==='ready'){if(this.ready)return;clearTimeout(this.timer);this.ready=true;this.stats.ready=true;this.stats.initMs=performance.now()-start;return;}
    if(m.type==='error'){this.fail(m.message||'Terrain worker reported failure');return;}
    if(m.type!=='result')return;
    const p=this.pending.get(m.id);if(!p)return;
    clearTimeout(p.timer);this.pending.delete(m.id);this.stats.pending=this.pending.size;p.job.workerPending=false;
    if(p.job.node.dead||p.job.node.mesh||p.job.node.job!==p.job||p.job.row!==0||p.job.cached){this.stats.discarded++;return;}
    if(!validPayload(m.payload,p.job)||!Number.isFinite(m.ms)||m.ms<0){this.fail('Malformed terrain worker result');return;}
    this.stats.completed++;this.stats.computeMs+=m.ms;p.job.workerPayload=m.payload;
   };
   this.worker.onerror=event=>{event.preventDefault?.();this.fail(event.message||'Terrain worker error');};
   this.worker.onmessageerror=()=>this.fail('Terrain worker structured-clone failure');
   this.worker.postMessage({type:'init',inputs});
  }catch(error){this.fail(String(error));}
 }
 enqueue(job){
  if(!this.ready||this.closed||this.pending.size>=this.limit||job.node.dead||job.node.mesh||job.node.job!==job||job.cached||job.row!==0||job.workerPending||job.workerPayload)return false;
  const id=this.nextId++;
  try{
   const input=terrainRowInput(job.node),p={job,timer:setTimeout(()=>this.fail('Terrain worker job '+id+' timeout'),this.timeoutMs)};
   job.workerPending=true;this.pending.set(id,p);this.stats.pending=this.pending.size;
   this.worker.postMessage({type:'build',id,input});return true;
  }catch(error){this.fail(String(error));return false;}
 }
 fail(message){if(this.closed)return;this.stats.error=message;this.dispose();}
 dispose(){
  if(this.closed)return;clearTimeout(this.timer);this.closed=true;this.ready=false;this.stats.ready=false;
  if(this.worker){this.worker.onmessage=null;this.worker.onerror=null;this.worker.onmessageerror=null;this.worker.terminate();this.worker=null;}
  for(const {job,timer}of this.pending.values()){clearTimeout(timer);job.workerPending=false;}
  this.pending.clear();this.stats.pending=0;
 }
}
function validPayload(payload,job){
 if(!payload||typeof payload!=='object'||payload.row!==33||!Number.isFinite(payload.min)||!Number.isFinite(payload.max)||payload.min>payload.max)return false;
 const keys=Object.keys(job).filter(k=>ArrayBuffer.isView(job[k]));
 if(Object.keys(payload).some(k=>!keys.includes(k)&&!['row','min','max'].includes(k)))return false;
 return keys.every(k=>payload[k]?.constructor===job[k].constructor&&payload[k].length===job[k].length&&payload[k].byteLength===job[k].byteLength);
}

// Until variant inputs are explicitly shared, never run default-source worker
// computations for a URL that can select another authored surface.
export function terrainRowWorkerPolicy(search='') {
 const params=new URLSearchParams(search),safe=new Set(['terrainWorker38','view','place','time','debug','profile','gpuPassProfile','boardwalkEndGrain39','boardwalkPlantContact39','route3Courtyard38','meadowSourceRange39','farRectGate39','vanityUpperContact39','shadowDepthProfile39','shadowDepthTraversal39','seating39','cloudCacheArray39','shadowStaticProfile39']);
 const requested=params.get('terrainWorker38')!=='0';
 const compatible=[...params.keys()].every(k=>safe.has(k));
 return {requested,compatible,enabled:requested&&compatible};
}
