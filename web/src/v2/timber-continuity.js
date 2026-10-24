import {Float32BufferAttribute} from 'three';
// Accepted side-surface repair; =0 retains the original asset for same-view comparison.
export function timberContinuityEnabled(search=globalThis.location?.search||''){
 return new URLSearchParams(search).get('timberContinuity')!=='0';
}
function decode(value){
 const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 return new Float32Array(raw.buffer);
}
async function digest(attribute){
 const a=attribute.array;
 const hash=await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
 return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function validateTimberContinuity(geometry,data){
 if(geometry.getAttribute('position')?.count!==data.vertexCount)throw new Error('Timber continuity vertex-count mismatch');
 for(const [attribute,expected]of [[geometry.getAttribute('position'),data.positionSHA256],[geometry.index,data.indexSHA256],[geometry.getAttribute('uv'),data.uvSHA256]]){
  if(!attribute||attribute.isInterleavedBufferAttribute||await digest(attribute)!==expected)throw new Error('Timber continuity original geometry/source binding mismatch');
 }
 const normals=decode(data.normals),occlusion=decode(data.occlusion);
 if(normals.length!==data.vertexCount*3||occlusion.length!==data.vertexCount*2)throw new Error('Timber continuity data length mismatch');
 for(let i=0;i<data.vertexCount;i++){
  if(Math.abs(Math.hypot(...normals.subarray(i*3,i*3+3))-1)>.0001)throw new Error('Timber continuity invalid normal');
  if(!occlusion.subarray(i*2,i*2+2).every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Timber continuity invalid occlusion');
 }
 return {normals,occlusion};
}
export async function prepareTimberContinuity(assetId,scene,{enabled=timberContinuityEnabled(),load=()=>import('./timber-continuity-data.js')}={}){
 if(!enabled||assetId!=='house_a')return null;
 const {default:data}=await load();
 const node=scene.getObjectByName(data.nodeName);
 if(!node?.isMesh||Array.isArray(node.material)||node.material.name!=='log')throw new Error('Timber continuity original log-side mesh missing');
 const payload=await validateTimberContinuity(node.geometry,data);
 return {node,...payload,version:data.version,samples:data.samples,sourceSHA256:data.sourceSHA256};
}
export function applyTimberContinuity(geometry,node,candidate){
 if(!candidate||node!==candidate.node)return false;
 // Copy arrays: downstream applyMatrix4 mutates normals in each prepared part.
 // Cap meshes and all spatial/UV attributes stay on their untouched source path.
 geometry.setAttribute('normal',new Float32BufferAttribute(candidate.normals.slice(),3));
 geometry.setAttribute('assetOcclusion',new Float32BufferAttribute(candidate.occlusion.slice(),2));
 return true;
}
