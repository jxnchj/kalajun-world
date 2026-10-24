import * as THREE from 'three';
import {GUEST_VANITY_SOURCE} from './guest-vanity-definition.js';
import {exactGLBBuffer,loadWorldGLB} from './glb-transport.js';
export const guestVanityURL=(base='./assets/')=>base.replace(/\/?$/,'/')+GUEST_VANITY_SOURCE.sourceGLB.replace(/^assets\//,'');
export async function loadGuestVanity(url,loader,{fetchImpl=(...a)=>globalThis.fetch(...a)}={}){
 let rawBytes=0;
 const verifiedParse=async(buffer,path)=>{
  const digest=await crypto.subtle.digest('SHA-256',buffer),sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==GUEST_VANITY_SOURCE.sourceSHA256)throw Error('Guest vanity source checksum mismatch');
  rawBytes=buffer.byteLength;return loader.parseAsync(buffer,path);
 };
 const wrapped={parseAsync:verifiedParse,loadAsync:async rawURL=>{
  const response=await fetchImpl(rawURL+'?v='+GUEST_VANITY_SOURCE.sourceSHA256);if(!response.ok)throw Error('Guest vanity source HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());return verifiedParse(exactGLBBuffer(bytes),rawURL.slice(0,rawURL.lastIndexOf('/')+1));
 }};
 const gltf=await loadWorldGLB(url,wrapped,{fetchImpl});
 gltf.userData={...gltf.userData,guestVanity:{active:true,sourceSHA256:GUEST_VANITY_SOURCE.sourceSHA256,responseBytes:gltf.userData?.assetTransport?.responseBytes??rawBytes,rawBytes,encoding:gltf.userData?.assetTransport?.encoding}};return gltf;
}
export async function originalGuestVanityCollision(){
 const {default:data}=await import('./generated/guest-vanity-collision-38.json',{with:{type:'json'}});
 if(data.sourceSHA256!==GUEST_VANITY_SOURCE.originalSHA256)throw Error('Guest vanity original collision source differs');
 return data.parts.map(p=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p.positions,3));geometry.setIndex(p.indices);return {geometry,role:'interior',names:[p.name],triangles:p.indices.length/3};});
}
