import {LODGE_FURNITURE_SOURCE} from './lodge-furniture-definition.js';
import {exactGLBBuffer} from './glb-transport.js';

// A geometry/GI pair is indivisible: failed candidate bytes never fall back to
// the old building. Parse through the owner's private loader and texture pool.
export function lodgeFurnitureURL(base='./assets/') {
 return base.replace(/\/?$/, '/')+LODGE_FURNITURE_SOURCE.sourceGLB.replace(/^assets\//,'');
}
export async function loadLodgeFurniture(url,loader,{fetchImpl=(...a)=>globalThis.fetch(...a)}={}) {
 const response=await fetchImpl(url+'?v='+LODGE_FURNITURE_SOURCE.sourceSHA256);
 if(!response.ok)throw Error('Lodge furniture source HTTP '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 const digest=await crypto.subtle.digest('SHA-256',exactGLBBuffer(bytes));
 const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 if(sha!==LODGE_FURNITURE_SOURCE.sourceSHA256)throw Error('Lodge furniture source checksum mismatch');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<20||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==bytes.length)throw Error('Invalid lodge furniture GLB');
 const gltf=await loader.parseAsync(exactGLBBuffer(bytes),url.slice(0,url.lastIndexOf('/')+1));
 gltf.userData={...gltf.userData,lodgeFurniture:{active:true,sourceSHA256:sha,responseBytes:bytes.length}};
 return gltf;
}
