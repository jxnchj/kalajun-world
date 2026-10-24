import {GUEST_LIVING_SOURCE} from './guest-living-definition.js';
import {exactGLBBuffer,loadWorldGLB} from './glb-transport.js';
export const guestLivingURL=(base='./assets/')=>base.replace(/\/?$/,'/')+GUEST_LIVING_SOURCE.sourceGLB.replace(/^assets\//,'');
export async function loadGuestLiving(url,loader,{fetchImpl=(...a)=>globalThis.fetch(...a)}={}){
 let rawBytes=0;
 const verifiedParse=async(buffer,path)=>{
  const digest=await crypto.subtle.digest('SHA-256',buffer),sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==GUEST_LIVING_SOURCE.sourceSHA256)throw Error('Guest living source checksum mismatch');
  rawBytes=buffer.byteLength;return loader.parseAsync(buffer,path);
 };
 const wrapped={parseAsync:verifiedParse,loadAsync:async rawURL=>{
  const response=await fetchImpl(rawURL+'?v='+GUEST_LIVING_SOURCE.sourceSHA256);if(!response.ok)throw Error('Guest living source HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());return verifiedParse(exactGLBBuffer(bytes),rawURL.slice(0,rawURL.lastIndexOf('/')+1));
 }};
 const gltf=await loadWorldGLB(url,wrapped,{fetchImpl});
 gltf.userData={...gltf.userData,guestLiving:{active:true,sourceSHA256:GUEST_LIVING_SOURCE.sourceSHA256,responseBytes:gltf.userData?.assetTransport?.responseBytes??rawBytes,rawBytes,encoding:gltf.userData?.assetTransport?.encoding}};return gltf;
}
