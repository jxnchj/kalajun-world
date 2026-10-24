import {Box3,Sphere,Vector3}from 'three';
import {decodeGzipBytes}from './world-data.js';
import {exactGLBBuffer}from './glb-transport.js';
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export const STRUCTURE_PREPARED_VERSION='structure-prepared-38';
export function preparedStructureEligible(assetId,parts,{enabled,doors,base='./assets/',search=globalThis.location?.search||''}){
 return enabled&&assetId==='house_a'&&parts.size===1&&parts.has('')&&Boolean(doors)&&base==='./assets/'&&new URLSearchParams(search).get('timberContinuity')!=='0'&&new URLSearchParams(search).get('stoneOcclusion')!=='0';
}
export class StructurePreparedAssets{
 constructor({enabled=new URLSearchParams(globalThis.location?.search||'').get('structurePrepared')==='1',fetchImpl=(...a)=>globalThis.fetch(...a),loadBinding=()=>import('virtual:structure-prepared-binding').then(m=>m.default)}={}){
  this.enabled=enabled;this.fetch=fetchImpl;this.loadBinding=loadBinding;this.stats={enabled,assets:{},prepared:0,fallbacks:0};
 }
 async load(assetId,parts,owner,url){
  if(!preparedStructureEligible(assetId,parts,{enabled:this.enabled,doors:owner.doors,base:owner.world.assetBase||'./assets/'}))return null;
  const stats=this.stats.assets[assetId]={status:'loading'},start=performance.now();
  try{
   this.pending??=Promise.all([this.fetch('./data/v2/structure-prepared-38.json').then(r=>{if(!r.ok)throw Error('Prepared structure manifest HTTP '+r.status);return r.json();}),this.loadBinding()]);
   const [manifest,binding]=await this.pending,entry=manifest.assets[assetId];
   if(!entry||manifest.signature!==binding.signature||entry.sourceSHA256!==binding.assets[assetId]?.sha256){
    Object.assign(stats,{status:'fallback',reason:'Prepared source/algorithm changed; complete original asset retained'});this.stats.fallbacks++;return null;
   }
   if(manifest.version!==STRUCTURE_PREPARED_VERSION)throw Error('Prepared structure version changed');
   const response=await this.fetch('./'+entry.url+'?v='+entry.gzipSHA256);if(!response.ok)throw Error('Prepared structure HTTP '+response.status);
   const transport=new Uint8Array(await response.arrayBuffer()),compressed=transport[0]===31&&transport[1]===139;
   if(transport.length!==(compressed?entry.gzipBytes:entry.rawBytes)||await sha(transport)!==(compressed?entry.gzipSHA256:entry.rawSHA256))throw Error('Prepared structure transport checksum mismatch');
   const bytes=await decodeGzipBytes(transport);
   if(bytes.length!==entry.rawBytes||await sha(bytes)!==entry.rawSHA256)throw Error('Prepared structure raw checksum mismatch');
   const gltf=await owner.loader.parseAsync(exactGLBBuffer(bytes),url.slice(0,url.lastIndexOf('/')+1));
   owner._trackSource(gltf);
   const meta=gltf.scene.userData.preparedStructure;
   if(meta?.version!==STRUCTURE_PREPARED_VERSION||meta.assetId!==assetId||meta.sourceSHA256!==entry.sourceSHA256||meta.signature!==binding.signature)throw Error('Prepared structure embedded source binding mismatch');
   Object.assign(stats,{status:'ready',responseBytes:transport.length,rawBytes:bytes.length,elapsedMs:performance.now()-start});this.stats.prepared++;
   return {gltf,meta};
  }catch(error){Object.assign(stats,{status:'failed',reason:error.message});throw error;}
 }
}
export function restorePreparedStructures(owner,assetId,gltf,meta){
 const materials=new Map(),templates=[];
 owner.doors.captureAsset(assetId,gltf.scene,source=>owner._material(source));
 const threshold=owner.doors.stats.thresholdStones;
 if(meta.threshold&&threshold){
  const at=threshold.assets.findIndex(v=>v.assetId===assetId),previous=threshold.assets[at];
  if(at<0||previous.moved!==0)throw Error('Prepared threshold was unexpectedly modified again');
  threshold.moved+=meta.threshold.moved;threshold.triangles+=meta.threshold.triangles;threshold.assets[at]=meta.threshold;
 }
 for(const record of meta.templates){
  const node=gltf.scene.getObjectByName(record.near),far=record.low?gltf.scene.getObjectByName(record.low.node):null;
  if(!node?.isMesh||Array.isArray(node.material)||record.low&&!far?.isMesh)throw Error('Prepared structure complete template missing');
  const restore=(mesh,bounds)=>{
   const g=mesh.geometry,a=g.getAttribute('_asset_occlusion');
   if(!a||a.itemSize!==2||g.getAttribute('color'))throw Error('Prepared structure AO contract changed');
   g.setAttribute('assetOcclusion',a);g.deleteAttribute('_asset_occlusion');
   g.boundingBox=new Box3(new Vector3().fromArray(bounds.box[0]),new Vector3().fromArray(bounds.box[1]));
   g.boundingSphere=new Sphere(new Vector3().fromArray(bounds.sphere[0]),bounds.sphere[1]);
   owner._sourceGeometries.delete(g);owner._geometries.add(g);return g;
  };
  let material=materials.get(node.material);if(!material){material=owner._material(node.material);materials.set(node.material,material);}
  for(const name of record.sourceMaterialNames)if(!material.userData.sourceMaterialNames.includes(name))material.userData.sourceMaterialNames.push(name);
  const geometry=restore(node,record.bounds);
  const count=(geometry.index?.count??geometry.attributes.position.count)/3;
  if(count!==record.triangles)throw Error('Prepared structure triangle count changed');
  const low=record.low?{geometry:restore(far,record.low.bounds),error:record.low.error,triangles:record.low.triangles}:null;
  if(low){if((low.geometry.index?.count??low.geometry.attributes.position.count)/3!==low.triangles)throw Error('Prepared far triangle count changed');owner.stats.lodTemplates++;}
  templates.push({geometry,material,role:record.role,names:record.names,triangles:record.triangles,low});
 }
 if(!templates.length)throw Error('Prepared structure cannot be an empty shell');
 owner._templates.set(assetId+':',templates);
}
