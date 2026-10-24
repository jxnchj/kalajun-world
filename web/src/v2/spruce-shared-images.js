import * as THREE from 'three';
import manifest from '../../public/assets/v2/spruce/shared-v38/manifest.json' with {type:'json'};
import originalManifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import {createSpruceLoader} from './spruce-loading.js';
import {loadWorldGLB,exactGLBBuffer} from './glb-transport.js';
import {decodeGzipBytes} from './world-data.js';
import {rootBytesSHA} from './forest-root-codec.js';
const checkAbort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Spruce image loading aborted','AbortError');};
function disposePartial(gltf,closeImages=false){
 const geometries=new Set(),materials=new Set(),textures=new Set();gltf?.scene?.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
 if(closeImages)for(const image of new Set([...textures].map(t=>t.image)))if(image?.width||image?.height)image.close?.();
 // Shared decoded images belong to the transaction pool, not this LOD.
}
export class SpruceSharedImages{
 constructor({signal,search=globalThis.location?.search||'',fetchImpl=(...args)=>globalThis.fetch(...args),bitmapImpl=globalThis.createImageBitmap?.bind(globalThis),metadata=manifest,sourceManifest=originalManifest,baseURL=globalThis.location?.href||'http://localhost/',loadOriginal=(url,loader)=>loadWorldGLB(url,loader)}={}){
  this.signal=signal;this.fetch=fetchImpl;this.bitmap=bitmapImpl;this.metadata=metadata;this.baseURL=baseURL;this.loadOriginal=loadOriginal;this.images=new Map();this.sources=new Map();this.loads=new Map();this.closed=false;this.controller=new AbortController();
  this.onAbort=()=>this.controller.abort(signal?.reason);signal?.addEventListener('abort',this.onAbort,{once:true});if(signal?.aborted)this.onAbort();
  const requested=new URLSearchParams(search).get('spruceSharedImages')!=='0';
  const sourceCurrent=['hi','mid'].every(lod=>metadata.lods?.[lod]?.sourceSha256===sourceManifest.assets?.[metadata.lods?.[lod]?.source]?.sha256);
  const reason=!requested?'disabled':!bitmapImpl?'ImageBitmap unavailable':!sourceCurrent?'canonical source binding changed':null;
  this.enabled=!reason;this.stats={enabled:this.enabled,reason,status:this.enabled?'pending':'bypass',imageRequests:0,imageDecodes:0,sharedSourceSlots:0,imageResponseBytes:0,glbResponseBytes:0,imageDecodeMs:0,byLod:{},...metadata.bytes};
  if(this.enabled){
   this.manager=new THREE.LoadingManager();this.loader=createSpruceLoader(this.manager);
   this.imageEntries=new Map(metadata.images.map(entry=>[new URL('./'+entry.url,baseURL).href,entry]));
   const pool=this;
   this.manager.addHandler(/^images\/[a-f0-9]{64}\.png$/,{isImageBitmapLoader:true,load(url,onLoad,_progress,onError){
    pool.manager.itemStart(url);pool.loadImage(url).then(image=>{onLoad(image);pool.manager.itemEnd(url);},error=>{onError?.(error);pool.manager.itemError(url);pool.manager.itemEnd(url);});
   }});
  }
 }
 loadImage(url){
  const canonical=new URL(url,this.baseURL).href;if(this.images.has(canonical))return this.images.get(canonical);
  const entry=this.imageEntries.get(canonical);if(!entry)return Promise.reject(new Error('Unregistered shared spruce image'));
  const work=(async()=>{
   checkAbort(this.controller.signal);this.stats.imageRequests++;
   const response=await this.fetch(canonical,{signal:this.controller.signal,credentials:'same-origin'});if(!response.ok)throw new Error('Shared spruce image HTTP '+response.status);
   const bytes=new Uint8Array(await response.arrayBuffer());this.stats.imageResponseBytes+=bytes.length;
   if(bytes.length!==entry.bytes||await rootBytesSHA(bytes)!==entry.sha256)throw new Error('Shared spruce PNG checksum mismatch');checkAbort(this.controller.signal);
   const started=performance.now(),image=await this.bitmap(new Blob([bytes],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});this.stats.imageDecodeMs+=performance.now()-started;this.stats.imageDecodes++;
   if(this.closed||this.controller.signal.aborted){image.close?.();checkAbort(this.controller.signal);throw new Error('Shared spruce image pool disposed');}return image;
  })();work.catch(()=>{});this.images.set(canonical,work);return work;
 }
 adoptSources(gltf){
  const textures=new Set();gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m))if(t?.isTexture)textures.add(t);});
  for(const texture of textures){
   const image=texture.image,source=this.sources.get(image);
   // Share only immutable pixels. Texture objects retain each GLTF sampler,
   // UV transform/channel, colour space and material association independently.
   if(source&&source!==texture.source){texture.source=source;this.stats.sharedSourceSlots++;}else if(!source)this.sources.set(image,texture.source);
  }
 }
 async checkMaterials(gltf){
  const slots={normalTexture:'normalMap',occlusionTexture:'aoMap',emissiveTexture:'emissiveMap'};
  for(let i=0;i<gltf.parser.json.materials.length;i++){
   const definition=gltf.parser.json.materials[i],material=await gltf.parser.getDependency('material',i);
   if(definition.pbrMetallicRoughness?.baseColorTexture&&!material.map)throw new Error('Shared spruce base colour image missing');
   for(const [field,slot]of Object.entries(slots))if(definition[field]&&!material[slot])throw new Error('Shared spruce '+slot+' missing');
  }
 }
 load(lod,originalLoader){
  if(!['hi','mid'].includes(lod))throw new Error('Unknown shared spruce LOD');if(this.loads.has(lod))return this.loads.get(lod);
  const entry=this.metadata.lods[lod],original='./'+entry.source;
  if(!this.enabled)return this.loadOriginal(original,originalLoader);
  // Request each original PNG exactly once alongside both geometry payloads,
  // instead of waiting for either GLB JSON to reveal its image dependencies.
  for(const image of this.metadata.images)this.loadImage('./'+image.url).catch(()=>{});
  const work=(async()=>{let gltf;const start=performance.now();
   try{
    checkAbort(this.controller.signal);const r=await this.fetch('./'+entry.url+'?v='+entry.gzipSha256,{signal:this.controller.signal});if(!r.ok)throw new Error('Shared spruce geometry HTTP '+r.status);
    const transport=new Uint8Array(await r.arrayBuffer());this.stats.glbResponseBytes+=transport.length;
    const raw=await decodeGzipBytes(transport);if(raw.length!==entry.rawBytes||await rootBytesSHA(raw)!==entry.sha256)throw new Error('Shared spruce geometry checksum mismatch');checkAbort(this.controller.signal);
    await Promise.all(entry.imageURIs.map(uri=>this.loadImage('./'+entry.base+uri)));checkAbort(this.controller.signal);
    gltf=await this.loader.parseAsync(exactGLBBuffer(raw),'./'+entry.base);checkAbort(this.controller.signal);await this.checkMaterials(gltf);this.adoptSources(gltf);
    gltf.userData={...gltf.userData,sharedImageTransport:{source:entry.source,sourceSha256:entry.sourceSha256,responseBytes:transport.length,rawBytes:raw.length}};
    this.stats.byLod[lod]={status:'shared',elapsedMs:performance.now()-start};this.stats.status=Object.values(this.stats.byLod).some(v=>v.status==='fallback')?'fallback':'active';return gltf;
   }catch(error){
    disposePartial(gltf);if(this.closed||this.controller.signal.aborted)throw error;
    // A failed optional delivery never publishes an untextured/empty tree.
    // Retry the complete original registered GLB only on this failure path.
    this.stats.byLod[lod]={status:'fallback',reason:String(error?.message||error),elapsedMs:performance.now()-start};this.stats.status='fallback';
    const originalGltf=await this.loadOriginal(original,originalLoader);if(this.closed||this.controller.signal.aborted){disposePartial(originalGltf,true);checkAbort(this.controller.signal);}return originalGltf;
   }
  })();this.loads.set(lod,work);return work;
 }
 dispose(){
  if(this.closed)return;this.closed=true;this.signal?.removeEventListener('abort',this.onAbort);this.controller.abort();
  for(const pending of this.images.values())pending.then(image=>{if(image.width||image.height)image.close?.();}).catch(()=>{});this.images.clear();this.sources.clear();this.loads.clear();
 }
}
