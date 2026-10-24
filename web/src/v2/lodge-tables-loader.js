import * as THREE from 'three';
import {LODGE_TABLES_SOURCE} from './lodge-tables-definition.js';
import {LODGE_CHAIRS_SOURCE} from './lodge-chairs-definition.js';
import {originalLodgeChairsCollision} from './lodge-chairs-loader.js';
import {exactGLBBuffer,loadWorldGLB} from './glb-transport.js';
export const lodgeTablesURL=(base='./assets/')=>base.replace(/\/?$/,'/')+LODGE_TABLES_SOURCE.sourceGLB.replace(/^assets\//,'');
export async function loadLodgeTables(url,loader,{fetchImpl=(...a)=>globalThis.fetch(...a)}={}){
 let rawBytes=0;
 const verifiedParse=async(buffer,path)=>{
  const digest=await crypto.subtle.digest('SHA-256',buffer),sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(sha!==LODGE_TABLES_SOURCE.sourceSHA256)throw Error('Lodge tables source checksum mismatch');
  rawBytes=buffer.byteLength;return loader.parseAsync(buffer,path);
 };
 const wrapped={parseAsync:verifiedParse,loadAsync:async rawURL=>{
  const response=await fetchImpl(rawURL+'?v='+LODGE_TABLES_SOURCE.sourceSHA256);if(!response.ok)throw Error('Lodge tables source HTTP '+response.status);
  return verifiedParse(exactGLBBuffer(new Uint8Array(await response.arrayBuffer())),rawURL.slice(0,rawURL.lastIndexOf('/')+1));
 }};
 const gltf=await loadWorldGLB(url,wrapped,{fetchImpl});
 gltf.scene.traverse(n=>{if(!n.isMesh)return;for(let owner=n;owner;owner=owner.parent){
  if(owner.name.startsWith('chair38_')){n.userData={...n.userData,lodgeChair38:owner.name};break;}
  if(owner.name.startsWith('tablecraft38_')){n.userData={...n.userData,lodgeTable38:owner.name};break;}
 }});
 gltf.userData={...gltf.userData,lodgeTables:{active:true,sourceSHA256:LODGE_TABLES_SOURCE.sourceSHA256,responseBytes:gltf.userData?.assetTransport?.responseBytes??rawBytes,rawBytes,encoding:gltf.userData?.assetTransport?.encoding}};return gltf;
}
// Returns only replacements: callers retain all non-chair/non-table original parts.
// Never combine with old full-building collision or erase newly added tea support.
export async function lodgeTablesCollision(gltf){
 if(gltf.userData?.lodgeTables?.sourceSHA256!==LODGE_TABLES_SOURCE.sourceSHA256)throw Error('Lodge tables collision requires verified matching source');
 if(LODGE_TABLES_SOURCE.originalSHA256!==LODGE_CHAIRS_SOURCE.sourceSHA256||LODGE_TABLES_SOURCE.chairCollisionSourceSHA256!==LODGE_CHAIRS_SOURCE.originalSHA256)throw Error('Lodge tables chair collision ancestry differs');
 const parts=await originalLodgeChairsCollision();gltf.scene.updateMatrixWorld(true);
 const rootInverse=new THREE.Matrix4().copy(gltf.scene.matrixWorld).invert();let triangles=0;
 gltf.scene.traverse(n=>{if(!n.isMesh||!n.userData.lodgeTable38)return;
  const geometry=n.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse,n.matrixWorld));
  const count=(geometry.index?.count??geometry.attributes.position.count)/3;triangles+=count;
  parts.push({geometry,role:'interior',names:[n.userData.lodgeTable38],triangles:count,tableReplacement:true});
 });
 if(triangles!==LODGE_TABLES_SOURCE.addedTriangles){for(const p of parts)p.geometry.dispose();throw Error('Lodge tables collision geometry incomplete');}
 return parts;
}
