import * as THREE from 'three';
import {LODGE_CHAIRS_SOURCE} from './lodge-chairs-definition.js';
import {exactGLBBuffer,loadWorldGLB} from './glb-transport.js';
export const lodgeChairsURL=(base='./assets/')=>base.replace(/\/?$/,'/')+LODGE_CHAIRS_SOURCE.sourceGLB.replace(/^assets\//,'');
export async function loadLodgeChairs(url,loader,{fetchImpl=(...a)=>globalThis.fetch(...a)}={}){
 let rawBytes=0;
 const verifiedParse=async(buffer,path)=>{
  const digest=await crypto.subtle.digest('SHA-256',buffer),sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==LODGE_CHAIRS_SOURCE.sourceSHA256)throw Error('Lodge chairs source checksum mismatch');
  rawBytes=buffer.byteLength;return loader.parseAsync(buffer,path);
 };
 const wrapped={parseAsync:verifiedParse,loadAsync:async rawURL=>{
  const response=await fetchImpl(rawURL+'?v='+LODGE_CHAIRS_SOURCE.sourceSHA256);if(!response.ok)throw Error('Lodge chairs source HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());return verifiedParse(exactGLBBuffer(bytes),rawURL.slice(0,rawURL.lastIndexOf('/')+1));
 }};
 const gltf=await loadWorldGLB(url,wrapped,{fetchImpl});
 // Multi-material glTF nodes become Groups: mark every primitive child through its authored chair ancestor.
 gltf.scene?.traverse(n=>{if(!n.isMesh)return;let owner=n;while(owner&&!owner.name.startsWith("chair38_"))owner=owner.parent;if(owner)n.userData={...n.userData,lodgeChair38:owner.name};});
 gltf.userData={...gltf.userData,lodgeChairs:{active:true,sourceSHA256:LODGE_CHAIRS_SOURCE.sourceSHA256,responseBytes:gltf.userData?.assetTransport?.responseBytes??rawBytes,rawBytes,encoding:gltf.userData?.assetTransport?.encoding}};return gltf;
}
export async function originalLodgeChairsCollision(){
 const {default:data}=await import('./generated/lodge-chairs-collision-38.json',{with:{type:'json'}});
 if(data.sourceSHA256!==LODGE_CHAIRS_SOURCE.originalSHA256)throw Error('Lodge chair collision source differs');
 return data.parts.map(p=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));geometry.setIndex(p.indices);return {geometry,role:'interior',names:[p.name],triangles:p.indices.length/3};});
}
