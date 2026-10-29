import {TerrainPreparedAdaptive42} from './terrain-prepared-adaptive42.js';
import {TerrainParentProof42} from './terrain-parent-proof42.js';
import {terrainPreparedHash42,decodeTerrainPreparedBlock42} from './terrain-prepared-codec42.js';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
// Experimental source-exact row provider. It owns no terrain, LOD or upload policy.
const TYPES={Float32Array,Float64Array,Uint16Array};
export const TERRAIN_PREPARED42_VERSION='terrain-rows42-shuffle-gzip-1';
export const terrainPrepared42Enabled=(search='')=>['1','all','adaptive'].includes(new URLSearchParams(search).get('terrainPrepared42'));
const key=n=>n.depth+':'+n.x+','+n.z;
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
export {terrainPreparedHash42,decodeTerrainPreparedBlock42} from './terrain-prepared-codec42.js';
function parentParts42(node){const p=node.parent;return p?[p.heights,p.centers,...['normal','color','terrainCover','terrainHydrology','terrainShoreDistance','terrainLandform','terrainCommunity'].map(n=>p.mesh.geometry.attributes[n].array)]:[];}
export function terrainPreparedParentSnapshot42(node){const parts=parentParts42(node),joined=new Uint8Array(parts.reduce((n,a)=>n+a.byteLength,0));let offset=0;for(const a of parts){joined.set(bytes(a),offset);offset+=a.byteLength;}return joined;}
export function terrainPreparedParentMatches42(node,snapshot){const parts=parentParts42(node);let offset=0;for(const a of parts){const b=bytes(a);if(offset+b.length>snapshot.length)return false;for(let i=0;i<b.length;i++)if(b[i]!==snapshot[offset+i])return false;offset+=b.length;}return offset===snapshot.length;}
export async function terrainPreparedParentHash42(node){return node.parent?terrainPreparedHash42(terrainPreparedParentSnapshot42(node)):null;}
function validateManifest(m,code,inputs){
 if(!/^[a-f0-9]{64}$/.test(code?.signature)||!Array.isArray(code.sources)||!code.sources.length||m?.version!==TERRAIN_PREPARED42_VERSION||m.code?.signature!==code?.signature||JSON.stringify(m.code?.sources)!==JSON.stringify(code?.sources))throw Error('source binding mismatch');
 if(JSON.stringify(m.inputs)!==JSON.stringify(inputs))throw Error('world input mismatch');
 if(!Array.isArray(m.schema)||!m.schema.length||!Array.isArray(m.entries)||m.entries.length>2048||!Array.isArray(m.shards))throw Error('invalid manifest shape');
 let rawLength=0;const names=new Set();for(const f of m.schema){const C=TYPES[f.type];if(!C||!Number.isInteger(f.length)||f.length<1||f.length>100000||f.bytes!==f.length*C.BYTES_PER_ELEMENT||typeof f.name!=='string'||names.has(f.name)||['node','row','min','max','__proto__','constructor','prototype'].includes(f.name))throw Error('invalid row schema');names.add(f.name);rawLength+=f.bytes;}if(rawLength>1024*1024)throw Error('oversized raw row');
 const shards=new Map(),entries=new Map();for(const s of m.shards){if(!/^[a-z0-9-]+\.pack$/.test(s.url)||shards.has(s.id)||!Number.isInteger(s.bytes)||s.bytes<1||s.bytes>1024*1024)throw Error('invalid shard');shards.set(s.id,s);}
 for(const e of m.entries){if(![e.x,e.z,e.size,e.depth,e.min,e.max].every(Number.isFinite)||e.size<=0||!Number.isInteger(e.depth)||e.depth<1||e.key!==key(e)||entries.has(e.key)||!shards.has(e.shard)||!Number.isInteger(e.length)||e.length<1||e.length>262144||e.rawLength!==rawLength||e.min>e.max||!Number.isInteger(e.offset)||e.offset<0||!/^[a-f0-9]{64}$/.test(e.sha256)||!(e.parentHash===null||/^[a-f0-9]{64}$/.test(e.parentHash)))throw Error('invalid row entry');entries.set(e.key,e);}
 for(const s of shards.values()){const rows=m.entries.filter(e=>e.shard===s.id).sort((a,b)=>a.offset-b.offset);let end=0;if(!rows.length||rows.length>4)throw Error('invalid sibling shard');for(const e of rows){if(e.offset!==end)throw Error('noncontiguous shard');end+=e.length;}if(end!==s.bytes)throw Error('shard byte mismatch');s.rows=rows;}
 return{entries,shards};
}
function validJob(job,schema){const keys=Object.keys(job).filter(k=>ArrayBuffer.isView(job[k]));return keys.length===schema.length&&schema.every(f=>job[f.name]?.constructor===TYPES[f.type]&&job[f.name].length===f.length&&job[f.name].byteLength===f.bytes);}
export class TerrainPreparedRows42 {
 constructor(world,{fallback,codeBinding,manifestURL='./data/v2/terrain-prepared42/river-forest.json',fetcher=null,cacheBytes=8*1024*1024,timeoutMs=10000,enabled=false,codec=null,adaptive=false,search=globalThis.location?.search??''}={}){
  this.codec=codec;this.world=world;this.fallback=fallback;this.codeBinding=codeBinding;this.manifestURL=manifestURL;this.fetcher=fetcher??((...a)=>globalThis.fetch(...a));this.workerFetch42=Boolean(codec&&!fetcher);this.cacheLimit=cacheBytes;this.timeoutMs=timeoutMs;this.limit=Number.isInteger(fallback?.limit)&&fallback.limit>0?fallback.limit:2;this.closed=false;this.localPending=new Map();this.cache=new Map();this.cacheBytes=0;this.failed=new Set();this.loads=new Map();this.controllers=new Set();this.entries=new Map();this.shards=new Map();
  this.stats={enabled,limit:this.limit,ready:false,requested:0,hits:0,misses:0,discarded:0,failed:0,evicted:0,downloadBytes:0,decodedBytes:0,cacheBytes:0,peakCacheBytes:0,decodeMs:0,parentHashMs:0,prepareMs:0,reasons:{},error:null};
  if(codec){this.stats.codec=codec.stats;this.parentProof=new TerrainParentProof42(codec,{snapshot:terrainPreparedParentSnapshot42,matches:terrainPreparedParentMatches42});this.stats.parentProof=this.parentProof.stats;if(this.workerFetch42)Object.defineProperty(this.stats,"downloadBytes",{enumerable:true,get:()=>codec.stats.downloadBytes??0});}
  if(adaptive&&codec){this.adaptive=new TerrainPreparedAdaptive42(fallback);this.stats.adaptive=this.adaptive.stats;}
  const params=new URLSearchParams(search);params.delete('terrainPrepared42');const compatible=terrainRowWorkerPolicy(params.toString()).compatible;if(enabled&&!compatible){this.stats.error='Incompatible terrain URL variant';this.reason(this.stats.error);}const design69=Boolean(world.hydrology?.forestReach39?.stats.design69||world.hydrology?.forestReach39?.stats.design73);if(design69){this.stats[world.hydrology?.forestReach39?.stats.design73?'variant73':'variant69']='live-worker';this.reason('69 surface: default prepared rows intentionally bypassed');}this.preparation=enabled&&compatible&&!design69?this.prepare():Promise.resolve(false);
 }
 get ready(){return !this.closed&&(this.stats.ready||!!this.fallback?.ready);}
 get pending(){const pending=new Map(this.localPending);for(const [id,p]of this.fallback?.pending??[])pending.set('worker:'+id,p);return pending;}
 reason(reason){this.stats.reasons[reason]=(this.stats.reasons[reason]??0)+1;}
 async prepare(){const start=performance.now(),controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),this.timeoutMs);try{
  const [response,inputs]=await Promise.all([this.fetcher(this.manifestURL,{signal:controller.signal}),this.world.getForestRootInputHashes()]);if(!response.ok)throw Error('manifest HTTP '+response.status);const m=await response.json(),checked=validateManifest(m,this.codeBinding,inputs);if(this.closed)return false;this.manifest=m;this.entries=checked.entries;this.shards=checked.shards;this.stats.ready=true;return true;
 }catch(e){this.stats.error=String(e);this.reason('manifest: '+String(e));return false;}finally{clearTimeout(timer);this.controllers.delete(controller);this.stats.prepareMs=performance.now()-start;}}
 enqueue(job){
  if(this.closed||this.pending.size>=this.limit||job.node.dead||job.node.mesh||job.node.job!==job||job.cached||job.row!==0||job.workerPending||job.workerPayload)return false;
  const k=key(job.node),e=this.entries.get(k);this.stats.requested++;
  if(!this.stats.ready||!e||this.failed.has(k)){this.stats.misses++;this.reason(!this.stats.ready?'not-ready':!e?'outside-priority-pack':'failed-row');return this.fallback?.enqueue(job)??false;}
  if(job.node.size!==e.size||!validJob(job,this.manifest.schema)){this.failed.add(k);this.reason('job schema/size mismatch');return this.fallback?.enqueue(job)??false;}
  if(this.adaptive&&!this.adaptive.allow(this.shards.get(e.shard),job.node.depth,this.cache.has(k)))return this.fallback?.enqueue(job)??false;
  const pending={job};this.localPending.set(job,pending);job.workerPending=true;
  this.supply(job,e).catch(error=>{this.failed.add(k);this.stats.failed++;this.stats.error=String(error);this.reason(String(error));}).finally(()=>{if(this.localPending.get(job)===pending){this.localPending.delete(job);job.workerPending=false;}});return true;
 }
 async supply(job,e){if(this.codec)return this.supplyWorker42(job,e);const t=performance.now(),parentHash=await terrainPreparedParentHash42(job.node);this.stats.parentHashMs+=performance.now()-t;if(parentHash!==e.parentHash)throw Error('parent hash mismatch');
  if(!this.cache.has(e.key))await this.loadShard(e.shard);
  if(this.closed)return;const payload=this.cache.get(e.key);if(!payload)throw Error('prepared row unavailable after bounded cache eviction');this.cache.delete(e.key);this.cacheBytes-=e.rawLength;this.stats.cacheBytes=this.cacheBytes;
  if(job.node.dead||job.node.mesh||job.node.job!==job||job.row!==0||job.cached){this.stats.discarded++;return;}
  if(await terrainPreparedParentHash42(job.node)!==e.parentHash)throw Error('parent changed while loading');if(this.closed)return;job.workerPayload=payload;this.stats.hits++;
 }
 async supplyWorker42(job,e){
  const verify=job.node.parent?this.parentProof.get(job.node,e.parentHash):e.parentHash===null?Promise.resolve(new Uint8Array()):Promise.reject(Error('parent hash mismatch'));
  const [snapshot]=await Promise.all([verify,this.cache.has(e.key)?Promise.resolve():this.loadShard(e.shard)]);
  if(this.closed)return;const payload=this.cache.get(e.key);if(!payload)throw Error('prepared row unavailable after bounded cache eviction');this.cache.delete(e.key);this.cacheBytes-=e.rawLength;this.stats.cacheBytes=this.cacheBytes;
  if(job.node.dead||job.node.mesh||job.node.job!==job||job.row!==0||job.cached){this.stats.discarded++;return;}
  const checkStart=performance.now(),equal=terrainPreparedParentMatches42(job.node,snapshot);this.stats.parentCompareCPUms=(this.stats.parentCompareCPUms??0)+performance.now()-checkStart;
  if(!equal)throw Error('parent changed while loading');job.workerPayload=payload;this.stats.hits++;
 }
 cacheRow42(e,payload){if(this.cache.has(e.key))this.cacheBytes-=e.rawLength;this.stats.decodedBytes+=e.rawLength;this.cache.set(e.key,payload);this.cacheBytes+=e.rawLength;while(this.cacheBytes>this.cacheLimit&&this.cache.size){const oldest=this.cache.keys().next().value;this.cache.delete(oldest);this.cacheBytes-=this.entries.get(oldest).rawLength;this.stats.evicted++;}this.stats.cacheBytes=this.cacheBytes;this.stats.peakCacheBytes=Math.max(this.stats.peakCacheBytes,this.cacheBytes);}
 async loadShard(id){if(this.loads.has(id))return this.loads.get(id);const promise=this.readShard(this.shards.get(id));this.loads.set(id,promise);try{return await promise;}finally{if(this.loads.get(id)===promise)this.loads.delete(id);}}
 async readShard(shard){const fetchStarted42=performance.now(),controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),this.timeoutMs);let reader;try{
  if(this.workerFetch42){const manifestURL=new URL(this.manifestURL,globalThis.location.href).href,result=await this.codec.run({type:'fetchShard',manifestURL,shard,schema:this.manifest.schema,timeoutMs:this.adaptive?this.adaptive.deadline(shard.id):this.timeoutMs});if(this.closed)return;this.adaptive?.complete(shard,result);for(const row of result.rows)this.cacheRow42(this.entries.get(row.key),row.payload);return;}
  const slash=this.manifestURL.lastIndexOf('/'),url=this.manifestURL.slice(0,slash+1)+shard.url,response=await this.fetcher(url,{signal:controller.signal});if(!response.ok||!response.body)throw Error('shard HTTP '+response.status);reader=response.body.getReader();
  if(this.codec){const packed=new Uint8Array(shard.bytes);let offset=0;while(true){const next=await reader.read();if(next.done)break;if(offset+next.value.length>packed.length)throw Error('oversized shard');packed.set(next.value,offset);offset+=next.value.length;this.stats.downloadBytes+=next.value.length;}if(offset!==packed.length)throw Error('truncated shard');const fetched42=performance.now(),rows=await this.codec.run({type:'shard',bytes:packed,shard,schema:this.manifest.schema},[packed.buffer]);if(this.closed)return;this.adaptive?.complete(shard,{downloadedBytes:offset,timings:{fetchMs:fetched42-fetchStarted42,codecMs:performance.now()-fetched42}});for(const row of rows)this.cacheRow42(this.entries.get(row.key),row.payload);return;}
  let chunk=new Uint8Array(),at=0,received=0;
  for(const e of shard.rows){const block=new Uint8Array(e.length);let filled=0;while(filled<block.length){if(at===chunk.length){const next=await reader.read();if(next.done)throw Error('truncated shard');chunk=next.value;at=0;received+=chunk.length;this.stats.downloadBytes+=chunk.length;if(received>shard.bytes)throw Error('oversized shard');}const n=Math.min(block.length-filled,chunk.length-at);block.set(chunk.subarray(at,at+n),filled);filled+=n;at+=n;}
   const start=performance.now(),payload=await decodeTerrainPreparedBlock42(block,e,this.manifest.schema);this.stats.decodeMs+=performance.now()-start;if(this.closed)return;this.stats.decodedBytes+=e.rawLength;this.cache.set(e.key,payload);this.cacheBytes+=e.rawLength;
   while(this.cacheBytes>this.cacheLimit&&this.cache.size){const oldest=this.cache.keys().next().value;this.cache.delete(oldest);this.cacheBytes-=this.entries.get(oldest).rawLength;this.stats.evicted++;}this.stats.cacheBytes=this.cacheBytes;this.stats.peakCacheBytes=Math.max(this.stats.peakCacheBytes,this.cacheBytes);
  }if(at!==chunk.length||!(await reader.read()).done)throw Error('trailing shard bytes');
 }catch(e){this.adaptive?.fail(shard.id,e,e.downloadedBytes??0);for(const row of shard.rows){this.failed.add(row.key);if(this.cache.delete(row.key))this.cacheBytes-=row.rawLength;}this.stats.cacheBytes=this.cacheBytes;throw e;}finally{clearTimeout(timer);this.controllers.delete(controller);await reader?.cancel().catch(()=>{});}}
 dispose(){if(this.closed)return;this.closed=true;this.stats.ready=false;for(const c of this.controllers)c.abort();this.controllers.clear();for(const {job}of this.localPending.values())job.workerPending=false;this.localPending.clear();this.cache.clear();this.cacheBytes=0;this.stats.cacheBytes=0;this.adaptive?.dispose();this.parentProof?.dispose();this.codec?.dispose();this.fallback?.dispose();}
}
