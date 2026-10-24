import * as THREE from "three";
import { sampleMeadowField, getMeadowLandform } from "./meadow-surface.js";

// Grass roots are already in world metres and their meshes/groups have identity
// transforms. Match the Float32 translation consumed by ecoRoot(), including
// negative/repeated texture coordinates. The vertex sampler uses mip level zero;
// hardware filtering precision can still differ slightly from CPU interpolation.
export class GrassRootField {
  constructor(world){this.cache=new WeakMap();this.samples=0;this.landformCache=new WeakMap();this.landform=world?getMeadowLandform(world):null;this.landformSamples=0;}
  seed(root,fields){
    if(!(fields instanceof Float32Array)||fields.length!==12)throw new Error("Prepared grass fields must retain 12 Float32 values");
    const x=Math.fround(root.x),z=Math.fround(root.z);
    this.cache.set(root,{x,z,value:fields.subarray(0,4)});
    this.landformCache.set(root,{x,z,value:fields.subarray(4,8),community:fields.subarray(8,12)});
  }
  sample(root){
    const x=Math.fround(root.x),z=Math.fround(root.z),cached=this.cache.get(root);
    if(cached&&cached.x===x&&cached.z===z)return cached.value;
    const value=new Float32Array(sampleMeadowField(x,z));
    this.cache.set(root,{x,z,value});this.samples++;return value;
  }
  sampleLandform(root){
    const x=Math.fround(root.x),z=Math.fround(root.z),cached=this.landformCache.get(root);
    if(cached&&cached.x===x&&cached.z===z)return cached.value;
    const community=new Float32Array(4);
    const value=new Float32Array(this.landform?this.landform.response(x,z,{},[1,1,1,0],community):[1,1,1,0]);
    this.landformCache.set(root,{x,z,value,community});this.landformSamples++;return value;
  }
  sampleCommunity(root){this.sampleLandform(root);return this.landformCache.get(root).community;}
  write(attribute,slot,root,landformAttribute,communityAttribute){
    attribute.array.set(this.sample(root),slot*4);
    if(landformAttribute)landformAttribute.array.set(this.sampleLandform(root),slot*4);
    if(communityAttribute)communityAttribute.array.set(this.sampleCommunity(root),slot*4);
  }
  dispose(){this.cache=new WeakMap();this.landformCache=new WeakMap();this.landform=null;}
}

// Each mesh owns a small instance buffer while sharing the original leaf data.
// A public render/shadow hook remembers one submitted geometry per source. If
// that mesh retires, keep this ONE geometry until the final wrapper retires;
// otherwise an unrendered final wrapper has no Three GPU-disposal listener.
// This retains at most one small field allocation per leaf LOD, not all retired
// tiles, and also frees the static buffers of never-rendered source templates.
const sourceReferences=new WeakMap();
export function createGrassFieldGeometry(source,capacity,dynamic=false){
  const g=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(source.attributes))g.setAttribute(name,attribute);
  g.setIndex(source.index);g.groups=source.groups.map(group=>({...group}));g.drawRange={...source.drawRange};
  g.boundingBox=source.boundingBox?.clone()||null;g.boundingSphere=source.boundingSphere?.clone()||null;
  g.setAttribute("aMeadowRootField",new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4)
    .setUsage(dynamic?THREE.DynamicDrawUsage:THREE.StaticDrawUsage));
  g.setAttribute("aMeadowLandform",new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4)
    .setUsage(dynamic?THREE.DynamicDrawUsage:THREE.StaticDrawUsage));
  g.setAttribute("aMeadowCommunity",new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4)
    .setUsage(dynamic?THREE.DynamicDrawUsage:THREE.StaticDrawUsage));
  let allocation=sourceReferences.get(source);
  if(!allocation){allocation={references:0,owner:null};sourceReferences.set(source,allocation);}
  allocation.references++;g.userData.grassFieldAllocation=allocation;g.userData.grassFieldSource=source;return g;
}
export function markGrassFieldRendered(){
  const g=this.geometry,allocation=g.userData.grassFieldAllocation;
  if(!allocation.owner)allocation.owner=g;
}
function disposePrivateField(g){
  for(const name of Object.keys(g.attributes))if(name!=="aMeadowRootField"&&name!=="aMeadowLandform"&&name!=="aMeadowCommunity")g.deleteAttribute(name);
  g.setIndex(null);g.dispose();
}
export function disposeGrassFieldGeometry(g){
  const source=g.userData.grassFieldSource,allocation=g.userData.grassFieldAllocation;
  if(!source||g.userData.grassFieldReleased)return;
  g.userData.grassFieldReleased=true;allocation.references--;
  if(allocation.references){
    if(allocation.owner!==g)disposePrivateField(g);
    return;
  }
  sourceReferences.delete(source);
  if(allocation.owner&&allocation.owner!==g){disposePrivateField(g);allocation.owner.dispose();}
  else g.dispose();
  allocation.owner=null;
}
