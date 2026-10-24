import {decodeGzipBytes} from './world-data.js';
import {rootBytesSHA} from './forest-root-codec.js';
import {forestRootInputHashes} from './forest-root-inputs.js';
import {MEADOW_ROOT_VERSION,decodeMeadowRoots,sourceCells} from './meadow-root-codec.js';
// These options change roots, their swept collision envelope, or source fields.
export const MEADOW_CACHE_SPATIAL_PARAMETERS=['boardwalkPlantContact39','forestRootedShoulder38','demInterpolation','landcoverSampling','riverMeanders','bankProfile','bankContour','bankShoulders','shoreLobes','brookLandform','brookIncision','brookMeanders','valleyLandform','valleyMeanders','valleySection','riverValleyWet','thresholdPlants','lodgeStairPlants','guestStairPlants','householdYards','householdEntry','meadowPattern','meadowRotation','meadowRelief','meadowLandscape','meadowFootprint'];
export async function meadowRootInputHashes(eco){
 const world=await eco.world.getForestRootInputHashes();
 const habitat=await forestRootInputHashes({localMeta:eco.floraLocal.meta,local:eco.floraLocal.data,coreMeta:eco.floraCore.meta,core:eco.floraCore.data});
 return {world,habitat};
}
export class MeadowRootCache{
 constructor(eco,{search=globalThis.location?.search||'',fetchImpl=(...args)=>globalThis.fetch(...args),loadCode=()=>import('virtual:meadow-root-binding').then(m=>m.default)}={}){
  this.eco=eco;this.fetch=fetchImpl;this.loadCode=loadCode;this.tiles=new Map();this.ready=false;this.disposed=false;
  const p=new URLSearchParams(search),experiment=MEADOW_CACHE_SPATIAL_PARAMETERS.find(key=>p.has(key));
  this.reason=p.get('meadowRootCache')!=='1'?'disabled':experiment?'explicit spatial option: '+experiment:null;
  this.stats={enabled:!this.reason,status:this.reason?'bypass':'pending',reason:this.reason,ready:false,tiles:0,roots:0,hits:0,misses:0,cachedRoots:0,proceduralRoots:0,elapsedMs:0};
 }
 prefetch({signal}={}){
  if(this.reason||this.disposed)return null;if(this.download)return this.download;
  const start=performance.now();this.stats.prefetchStartedMs=start;
  this.download=(async()=>{
   const [response,code]=await Promise.all([this.fetch('./data/v2/meadow-roots-38.json',{signal}),this.loadCode()]);
   if(!response.ok)throw new Error('Meadow manifest HTTP '+response.status);const manifest=await response.json();
   if(manifest.version!==MEADOW_ROOT_VERSION||manifest.code.signature!==code.signature)throw new Error('Meadow source binding changed');
   const r=await this.fetch('./'+manifest.url+'?v='+manifest.sha256,{signal});if(!r.ok)throw new Error('Meadow bundle HTTP '+r.status);
   const body=new Uint8Array(await r.arrayBuffer()),gzip=body[0]===31&&body[1]===139;
   if(body.length!==(gzip?manifest.gzipBytes:manifest.rawBytes)||await rootBytesSHA(body)!==(gzip?manifest.sha256:manifest.rawSHA256))throw new Error('Meadow transport checksum mismatch');
   const bytes=await decodeGzipBytes(body),decodeStart=performance.now(),tiles=await decodeMeadowRoots(bytes,manifest);
   Object.assign(this.stats,{rawBytes:bytes.length,responseBytes:body.length,prefetchMs:performance.now()-start,decodeMs:performance.now()-decodeStart});
   return {manifest,tiles};
  })();
  // Prefetch starts with the asset requests; actual decoded habitat inputs are
  // available later. Never publish or use roots before that verification.
  this.download.catch(()=>{});return this.download;
 }
 async prepare({signal}={}){
  if(this.reason||this.disposed)return false;if(this.pending)return this.pending;const start=performance.now();
  this.pending=(async()=>{
   const [{manifest,tiles},inputs]=await Promise.all([this.prefetch({signal}),meadowRootInputHashes(this.eco)]);
   if(JSON.stringify(manifest.inputs)!==JSON.stringify(inputs)){tiles.clear();throw new Error('Meadow world/habitat inputs changed');}
   if(this.disposed||signal?.aborted){tiles.clear();return false;}this.tiles=tiles;this.ready=true;
   Object.assign(this.stats,{ready:true,status:'ready',tiles:tiles.size,roots:manifest.roots,elapsedMs:performance.now()-start});return true;
  })().catch(error=>{this.tiles.clear();this.ready=false;Object.assign(this.stats,{status:signal?.aborted?'aborted':'fallback',reason:String(error?.message||error),elapsedMs:performance.now()-start});return false;});return this.pending;
 }
 readTile(tx,tz){
  if(!this.ready)return undefined;const tile=this.tiles.get(tx+','+tz);if(!tile){this.stats.misses++;return undefined;}
  this.stats.hits++;const cells=sourceCells(tx,tz),list=[];
  tile.slots.forEach((entry,i)=>{
   if(entry===null)return;
   if(entry===true){const root=this.eco.grassAt(...cells[i]);if(root)list.push(root);this.stats.proceduralRoots++;return;}
   const root={...entry.root};this.eco.grassRootField.seed(root,entry.fields);list.push(root);this.stats.cachedRoots++;
  });return list;
 }
 dispose(){this.disposed=true;this.ready=false;this.tiles.clear();this.stats.ready=false;this.download?.then(({tiles})=>tiles.clear()).catch(()=>{});}
}
