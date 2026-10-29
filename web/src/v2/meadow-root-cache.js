import {decodeGzipBytes} from './world-data.js';
import {rootBytesSHA} from './forest-root-codec.js';
import {forestRootInputHashes} from './forest-root-inputs.js';
import {MEADOW_ROOT_VERSION,decodeMeadowRoots,sourceCells} from './meadow-root-codec.js';
// These options change roots, their swept collision envelope, or source fields.
export const MEADOW_CACHE_SPATIAL_PARAMETERS=['shoreAsset42','route3Entry42','pastureLife41','boardwalkPlantContact39','forestRootedShoulder38','demInterpolation','landcoverSampling','riverMeanders','bankProfile','bankContour','bankShoulders','shoreLobes','brookLandform','brookIncision','brookMeanders','valleyLandform','valleyMeanders','valleySection','riverValleyWet','thresholdPlants','lodgeStairPlants','guestStairPlants','householdYards','householdEntry','meadowPattern','meadowRotation','meadowRelief','meadowLandscape','meadowFootprint'];
export async function meadowRootInputHashes(eco){
 const world=await eco.world.getForestRootInputHashes();
 const habitat=await forestRootInputHashes({localMeta:eco.floraLocal.meta,local:eco.floraLocal.data,coreMeta:eco.floraCore.meta,core:eco.floraCore.data});
 return {world,habitat};
}
// These are the two authored preparation destinations, shared with the package
// generator. The 96 m activation radius stays within its local source footprint;
// it is an admission rule, never a replacement for exact decoded tile lookup.
export const MEADOW_ROOT_CACHE_ANCHORS=Object.freeze([Object.freeze([-3611.9813305250705,4805.371282289286]),Object.freeze([-2216.832094723869,3361.4050159480757])]);
export const MEADOW_ROOT_CACHE_RADIUS=96;
export function meadowRootCacheArea(position){
 if(!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return -1;
 return MEADOW_ROOT_CACHE_ANCHORS.findIndex(([x,z])=>Math.hypot(position.x-x,position.z-z)<=MEADOW_ROOT_CACHE_RADIUS);
}
// Initial forest entry can prefetch in parallel with assets. Other entrances
// remain dormant until updateArea receives an actual destination in this domain.
export function meadowRootCacheEnabled42(search='',browser=typeof globalThis.window!=='undefined'){
 const p=new URLSearchParams(search),mode=p.get('meadowRootCache');
 return mode==='1'||(mode===null&&browser&&p.get('view')==='river-forest');
}
export class MeadowRootCache{
 constructor(eco,{search=globalThis.location?.search||'',browser=typeof globalThis.window!=='undefined',fetchImpl=(...args)=>globalThis.fetch(...args),loadCode=()=>import('virtual:meadow-root-binding').then(m=>m.default)}={}){
  this.eco=eco;this.cache69=Boolean(eco.world?.hydrology?.forestReach39?.stats.design69);this.cache73=Boolean(eco.world?.hydrology?.forestReach39?.stats.design73);this.manifestURL=this.cache73?'./data/v2/reach-design73/meadow-roots-38.json':this.cache69?'./data/v2/reach-design69/meadow-roots-38.json':'./data/v2/meadow-roots-38.json';this.fetch=fetchImpl;this.loadCode=loadCode;this.tiles=new Map();this.ready=false;this.disposed=false;this.transaction=null;this.area=-1;
  const p=new URLSearchParams(search),mode=p.get('meadowRootCache'),experiment=MEADOW_CACHE_SPATIAL_PARAMETERS.find(key=>p.has(key)&&!(key==='shoreAsset42'&&p.get(key)==='5')&&!(key==='pastureLife41'&&p.get(key)!=='0'));
  this.reason=!(mode==='1'||(mode===null&&browser))?'disabled':experiment?'explicit spatial option: '+experiment:null;
  this.active=!this.reason&&meadowRootCacheEnabled42(search,browser);
  this.stats={enabled:!this.reason,active:this.active,status:this.reason?'bypass':this.active?'pending':'dormant',reason:this.reason,ready:false,tiles:0,roots:0,hits:0,misses:0,cachedRoots:0,proceduralRoots:0,elapsedMs:0,activations:0,cancellations:0,attempts:0,lastError:null,area:-1};
 }
 updateArea(position,{needed=true,signal}={}){
  if(this.reason||this.disposed)return null;
  const area=needed?meadowRootCacheArea(position):-1,active=area>=0;
  this.area=area;this.stats.area=area;
  if(!active){
   if(this.active&&!this.ready)this.cancel('Destination left the prepared meadow area');
   this.active=false;this.stats.active=false;
   if(!this.ready)this.stats.status='dormant';
   return null;
  }
  if(!this.active){this.stats.activations++;this.active=true;this.stats.active=true;this.stats.reason=null;}
  if(this.ready)return null;
  // A failed attempt stays visible and does not retry every animation frame.
  // Leaving and re-entering clears the failed transaction and permits one retry.
  return this.eco.floraLocal&&this.eco.floraCore?this.prepare({signal}):this.prefetch({signal});
 }
 cancel(message='Meadow preparation cancelled'){
  const tx=this.transaction;if(!tx)return;
  if(!tx.settled)this.stats.cancellations++;
  tx.controller.abort(new DOMException(message,'AbortError'));tx.detach?.();
  if(tx.tiles&&tx.tiles!==this.tiles)tx.tiles.clear();
  this.transaction=null;this.download=null;this.pending=null;
 }
 prefetch({signal}={}){
  if(this.reason||!this.active||this.disposed)return null;if(this.transaction)return this.transaction.download;
  if(signal?.aborted){this.stats.status='aborted';this.stats.reason=String(signal.reason?.message||signal.reason||'Aborted');return null;}
  const controller=new AbortController(),tx={controller,settled:false,tiles:null},start=performance.now();this.transaction=tx;
  const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});tx.detach=()=>signal?.removeEventListener('abort',abort);
  const check=()=>{if(controller.signal.aborted||this.disposed||this.transaction!==tx)throw controller.signal.reason??new DOMException('Superseded meadow preparation','AbortError');};
  this.stats.attempts++;this.stats.prefetchStartedMs=start;this.stats.status='loading';this.stats.reason=null;
  tx.download=(async()=>{
   const [response,code]=await Promise.all([this.fetch(this.manifestURL,{signal:controller.signal}),this.loadCode()]);check();
   if(!response.ok)throw new Error('Meadow manifest HTTP '+response.status);const manifest=await response.json();check();
   if(manifest.version!==MEADOW_ROOT_VERSION||manifest.code.signature!==code.signature)throw new Error('Meadow source binding changed');
   const r=await this.fetch('./'+manifest.url+'?v='+manifest.sha256,{signal:controller.signal});check();if(!r.ok)throw new Error('Meadow bundle HTTP '+r.status);
   const body=new Uint8Array(await r.arrayBuffer()),gzip=body[0]===31&&body[1]===139;check();
   if(body.length!==(gzip?manifest.gzipBytes:manifest.rawBytes)||await rootBytesSHA(body)!==(gzip?manifest.sha256:manifest.rawSHA256))throw new Error('Meadow transport checksum mismatch');check();
   const bytes=await decodeGzipBytes(body),decodeStart=performance.now(),tiles=await decodeMeadowRoots(bytes,manifest);tx.tiles=tiles;check();
   Object.assign(this.stats,{rawBytes:bytes.length,responseBytes:body.length,prefetchMs:performance.now()-start,decodeMs:performance.now()-decodeStart});
   return {manifest,tiles};
  })().catch(error=>{if(tx.tiles&&tx.tiles!==this.tiles)tx.tiles.clear();if(this.transaction===tx){tx.settled=true;tx.detach();Object.assign(this.stats,{status:controller.signal.aborted?'aborted':'fallback',reason:String(error?.message||error),lastError:controller.signal.aborted?this.stats.lastError:String(error?.message||error)});}throw error;});
  // Observe early rejection even when decoded habitat is not available yet.
  this.download=tx.download;this.download.catch(()=>{});return this.download;
 }
 async prepare({signal}={}){
  if(this.reason||!this.active||this.disposed)return false;if(this.ready)return true;
  const download=this.prefetch({signal});if(!download)return false;const tx=this.transaction;if(tx.pending)return tx.pending;const start=performance.now();
  tx.pending=(async()=>{
   const [{manifest,tiles},inputs]=await Promise.all([download,meadowRootInputHashes(this.eco)]);
   if(JSON.stringify(manifest.inputs)!==JSON.stringify(inputs)){tiles.clear();throw new Error('Meadow world/habitat inputs changed');}
   if(this.disposed||tx.controller.signal.aborted||this.transaction!==tx){tiles.clear();return false;}this.tiles=tiles;this.ready=true;
   Object.assign(this.stats,{ready:true,status:'ready',reason:null,tiles:tiles.size,roots:manifest.roots,elapsedMs:performance.now()-start});return true;
  })().catch(error=>{
   if(tx.tiles&&tx.tiles!==this.tiles)tx.tiles.clear();
   if(this.transaction===tx){this.ready=false;Object.assign(this.stats,{status:tx.controller.signal.aborted?'aborted':'fallback',reason:String(error?.message||error),lastError:tx.controller.signal.aborted?this.stats.lastError:String(error?.message||error),elapsedMs:performance.now()-start});}return false;
  }).finally(()=>{tx.settled=true;tx.detach();});this.pending=tx.pending;return tx.pending;
 }
 readTile(tx,tz){
  if(!this.ready||!this.active)return undefined;const tile=this.tiles.get(tx+','+tz);if(!tile){this.stats.misses++;return undefined;}
  this.stats.hits++;const cells=sourceCells(tx,tz),list=[];
  tile.slots.forEach((entry,i)=>{
   if(entry===null)return;
   if(entry===true){const root=this.eco.grassAt(...cells[i]);if(root)list.push(root);this.stats.proceduralRoots++;return;}
   const root={...entry.root};this.eco.grassRootField.seed(root,entry.fields);list.push(root);this.stats.cachedRoots++;
  });return list;
 }
 dispose(){this.disposed=true;this.cancel('Meadow cache disposed');this.ready=false;this.active=false;this.tiles.clear();this.stats.ready=false;this.stats.active=false;this.stats.status='disposed';}
}
