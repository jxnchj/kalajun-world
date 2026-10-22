import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {decodeGzipBytes} from "./world-data.js";

export function createSpruceLoader(manager){return new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);}
export async function loadCompressedSpruce(url,loader=createSpruceLoader(),fetchImpl=fetch){
 const response=await fetchImpl(url);if(!response.ok)throw new Error("Spruce asset request failed: "+response.status+" "+url);
 const transport=new Uint8Array(await response.arrayBuffer()),bytes=await decodeGzipBytes(transport);
 if(bytes.length<20||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)!==0x46546c67)throw new Error("Invalid compressed spruce GLB: "+url);
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),url.slice(0,url.lastIndexOf("/")+1));
 gltf.userData={...gltf.userData,transportBytes:transport.byteLength,meshoptGLBBytes:bytes.byteLength};return gltf;
}
const sameBytes=(a,b)=>{
 if(a.byteLength!==b.byteLength)return false;
 const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
 for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;
};
const sameAttribute=(a,b)=>!!a===!!b&&(!a||!a.isInterleavedBufferAttribute&&!b.isInterleavedBufferAttribute&&a.itemSize===b.itemSize&&a.normalized===b.normalized&&a.array.constructor===b.array.constructor&&sameBytes(a.array,b.array));
export function sameSpruceGeometry(a,b){
 const keys=Object.keys(a.attributes).sort();
 return JSON.stringify(keys)===JSON.stringify(Object.keys(b.attributes).sort())&&keys.every(k=>sameAttribute(a.attributes[k],b.attributes[k]))&&sameAttribute(a.index,b.index)&&JSON.stringify(a.groups)===JSON.stringify(b.groups)&&JSON.stringify(a.drawRange)===JSON.stringify(b.drawRange)&&Object.keys(a.morphAttributes).length===0&&Object.keys(b.morphAttributes).length===0;
}
// Actual GPU reuse is limited to byte-proven static parts across hi/mid/needle.
// Near foliage uses a separate GPU brush template; this pool owns static shell parts.
export class SpruceGeometryPool {
 constructor(){this.candidates=new Map();this.owned=new Set();this.stats={reusedGeometries:0,vertexBytesSaved:0,indexBytesSaved:0};}
 adopt(variant,part,geometry){
  if(part==="bark"||part==="core"){
   const key=variant+":"+part,list=this.candidates.get(key)||[];
   const shared=list.find(g=>sameSpruceGeometry(g,geometry));
   if(shared){
    this.stats.reusedGeometries++;this.stats.vertexBytesSaved+=Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0);this.stats.indexBytesSaved+=geometry.index?.array.byteLength||0;
    geometry.dispose();return shared;
   }
   list.push(geometry);this.candidates.set(key,list);
  }
  this.owned.add(geometry);return geometry;
 }
 dispose(){for(const g of this.owned)g.dispose();this.owned.clear();this.candidates.clear();}
}

// Identity glTF nodes need a separate attribute-name container, not another copy
// of all near needles. Non-identity transforms still receive an owned clone.
export function spruceGeometryContainer(source,matrix){
 if(!matrix.equals(new THREE.Matrix4()))return source.clone().applyMatrix4(matrix);
 const g=new THREE.BufferGeometry();for(const [key,a]of Object.entries(source.attributes))g.setAttribute(key,a);
 g.userData={...source.userData};g.setIndex(source.index);g.groups=source.groups.map(x=>({...x}));g.drawRange={...source.drawRange};g.boundingBox=source.boundingBox?.clone()||null;g.boundingSphere=source.boundingSphere?.clone()||null;return g;
}
