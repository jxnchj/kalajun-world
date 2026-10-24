import {decodeGzipBytes}from './world-data.js';
import {decodeForestRootBundle,forestRootFromTile,rootBytesSHA,FOREST_ROOT_BUNDLE_VERSION}from './forest-root-codec.js';
export function forestRootCacheEligibility(search,mode){
 const p=new URLSearchParams(search);
 if(p.get('forestRootCache')!=='1')return 'disabled';
 if(mode!=='v15')return 'unsupported forest layout';
 for(const key of ['forestRootedShoulder38','demInterpolation','landcoverSampling','riverMeanders','bankProfile','bankContour','bankShoulders','shoreLobes','brookLandform','brookIncision','brookMeanders','valleyLandform','valleyMeanders','valleySection'])if(p.has(key))return 'explicit spatial experiment: '+key;
 return null;
}
export class ForestRootCache{
 constructor(world,{mode='v15',search=globalThis.location?.search||'',fetchImpl=(...args)=>globalThis.fetch(...args),loadCode=()=>import('virtual:forest-root-binding').then(m=>m.default)}={}){
  this.world=world;this.fetch=fetchImpl;this.loadCode=loadCode;this.reason=forestRootCacheEligibility(search,mode);this.ready=false;this.disposed=false;this.tiles=new Map();
  this.stats={enabled:!this.reason,ready:false,status:this.reason?'bypass':'pending',reason:this.reason,tiles:0,trees:0,hits:0,outside:0,records:0,responseBytes:0,rawBytes:0,elapsedMs:0};
 }
 async prepare({signal}={}){
  if(this.reason||this.disposed)return false;if(this.pending)return this.pending;
  const start=performance.now();
  this.pending=(async()=>{
   if(typeof this.world.getForestRootInputHashes!=='function')throw new Error('World has no exact input binding');
   const [response,code,inputs]=await Promise.all([this.fetch('./data/v2/forest-roots-38.json',{signal}),this.loadCode(),this.world.getForestRootInputHashes()]);
   if(!response.ok)throw new Error('Forest root manifest HTTP '+response.status);
   const manifest=await response.json();
   if(manifest.version!==FOREST_ROOT_BUNDLE_VERSION||manifest.code.signature!==code.signature)throw new Error('Forest root algorithm/source signature changed');
   if(JSON.stringify(manifest.inputs)!==JSON.stringify(inputs))throw new Error('Forest root actual world inputs changed');
   const packed=await this.fetch('./'+manifest.url+'?v='+manifest.sha256,{signal});if(!packed.ok)throw new Error('Forest root bundle HTTP '+packed.status);
   const transport=new Uint8Array(await packed.arrayBuffer());
   // HTTP Content-Encoding may already have inflated the gzip response body.
   // Validate against the matching exact representation, never skip a digest.
   const compressed=transport[0]===0x1f&&transport[1]===0x8b;
   const expectedBytes=compressed?manifest.gzipBytes:manifest.rawBytes,expectedSHA=compressed?manifest.sha256:manifest.rawSHA256;
   if(transport.byteLength!==expectedBytes||await rootBytesSHA(transport)!==expectedSHA)throw new Error('Forest root '+(compressed?'compressed':'HTTP-decoded')+' checksum mismatch');
   const bytes=await decodeGzipBytes(transport),tiles=await decodeForestRootBundle(bytes,manifest);
   if(this.disposed||signal?.aborted)return false;
   this.tiles=tiles;this.ready=true;Object.assign(this.stats,{status:'ready',ready:true,tiles:tiles.size,trees:manifest.trees,delivery:compressed?'gzip-body':'http-decoded-body',responseBytes:transport.byteLength,rawBytes:bytes.byteLength,elapsedMs:performance.now()-start});return true;
  })().catch(error=>{
   this.ready=false;this.tiles.clear();Object.assign(this.stats,{ready:false,status:signal?.aborted?'aborted':'fallback',reason:String(error?.message||error),elapsedMs:performance.now()-start});return false;
  });
  return this.pending;
 }
 at(ix,iz){
  if(!this.ready)return undefined;
  const tile=this.tiles.get(Math.floor(ix/32)+','+Math.floor(iz/32));
  if(!tile){this.stats.outside++;return undefined;}
  this.stats.hits++;const slot=(iz-tile.tz*32)*32+ix-tile.tx*32;
  if(tile.records[slot]===undefined&&tile.ranks[slot]>=0)this.stats.records++;
  return forestRootFromTile(tile,ix,iz);
 }
 dispose(){this.disposed=true;this.ready=false;this.tiles.clear();this.stats.ready=false;}
}
