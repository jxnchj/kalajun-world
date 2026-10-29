export function terrainSiblingBatchPolicy42(search=''){const enabled=new URLSearchParams(search).get('terrainBatches')!=='0';return {enabled,boundedBuild42:enabled};}
import {isStandardProjectedDepth} from './room-shadow.js';
import {BufferGeometry,BufferAttribute,Mesh,Object3D,Box3,Sphere,Vector3} from 'three';
// Submission-only grouping. Authoritative tiles, LOD selection, morphs and physics
// remain owned by WorldTerrain. Only four fully settled siblings can be grouped.
// A stable scratch buffer is reused by update; allocation only when a group is
// first built/invalidated. Every frame still visits every effective input.
const finiteMorphs=new WeakMap(),validIndices=new WeakMap();
function validIndex(a,count){const old=validIndices.get(a);if(old&&old.array===a.array&&old.version===a.version&&old.count===count)return old.valid;let valid=true;for(let i=0;i<a.array.length;i++)if(a.array[i]>=count){valid=false;break;}validIndices.set(a,{array:a.array,version:a.version,count,valid});return valid;}
function finiteMorph(a){
 const old=finiteMorphs.get(a);if(old&&old.array===a.array&&old.version===a.version&&old.count===a.count)return old.valid;
 let valid=true;for(let i=0;i<a.array.length;i++)if(!Number.isFinite(a.array[i])){valid=false;break;}
 finiteMorphs.set(a,{array:a.array,version:a.version,count:a.count,valid});return valid;
}
export function terrainSiblingCheapRejection42(parent){
 if(parent.dead)return 'parent-dead';
 if(parent.transition)return 'parent-transition';
 if(!parent.children||parent.children.length!==4)return 'parent-child-count';
 for(let i=0;i<4;i++){const n=parent.children[i],m=n?.mesh;
  if(!n||n.dead)return 'child-dead';
  if(!m)return 'child-mesh-missing';
  if(!m.visible)return 'child-hidden';
  if(n.split)return 'child-split';
  if(n.transition)return 'child-transition';
  if(m.children.length)return 'mesh-children';
 }
 return null;
}
export function terrainSiblingSignature(parent,parts=[]){
 parts.length=0;const children=parent.children;
 if(parent.dead||!children||children.length!==4||parent.transition||!Number.isFinite(parent.x)||!Number.isFinite(parent.z))return null;
 const first=children[0].mesh;if(!first)return null;const fa=first.geometry?.attributes;
 if(!fa?.position||fa.position.itemSize!==3||fa.position.normalized||!(fa.position.array instanceof Float32Array))return null;
 let names=0;for(const name in fa)names++;
 parts.push(parent.x,parent.z,parent.size,children[0].size,children[0].depth,first.material);
 for(let child=0;child<4;child++){
  const node=children[child],m=node.mesh,g=m?.geometry;
  if(node.dead||!m?.visible||node.split||node.transition||!g?.index||g.groups.length||g.drawRange.start!==0||g.drawRange.count<g.index.count)return null;
  if(!m.isMesh||m.isSkinnedMesh||m.isInstancedMesh||Array.isArray(m.material)||(m.customDepthMaterial!==undefined&&!isStandardProjectedDepth(m.customDepthMaterial))||m.customDistanceMaterial||m.children.length||!m.matrixAutoUpdate||!m.matrixWorldAutoUpdate||m.pivot)return null;
  // Unsupported custom local/world update hooks may alter geometry placement.
  // The optional all-node matrix-cache combination conservatively uses tiles.
  if(m.updateMatrix!==Object3D.prototype.updateMatrix||m.updateMatrixWorld!==Object3D.prototype.updateMatrixWorld||m.onBeforeRender!==Object3D.prototype.onBeforeRender||m.onAfterRender!==Object3D.prototype.onAfterRender||m.onBeforeShadow!==Object3D.prototype.onBeforeShadow||m.onAfterShadow!==Object3D.prototype.onAfterShadow)return null;
  if(m.parent!==first.parent||m.material!==first.material||m.customDepthMaterial!==first.customDepthMaterial||m.layers.mask!==first.layers.mask||m.renderOrder!==first.renderOrder||m.castShadow!==first.castShadow||m.receiveShadow!==first.receiveShadow||m.frustumCulled!==first.frustumCulled)return null;
  if(m.quaternion.x||m.quaternion.y||m.quaternion.z||m.quaternion.w!==1||m.scale.x!==1||m.scale.y!==1||m.scale.z!==1||!Number.isFinite(m.position.x)||!Number.isFinite(m.position.y)||!Number.isFinite(m.position.z))return null;
  if(m.morphTargetInfluences)for(let i=0;i<m.morphTargetInfluences.length;i++)if(m.morphTargetInfluences[i]!==0)return null;
  const ix=g.index;if(ix.itemSize!==1||ix.normalized||ix.count!==ix.array.length||ix.count%3||!(ix.array instanceof Uint16Array||ix.array instanceof Uint32Array))return null;
  const count=g.attributes.position?.count;if(!count||!validIndex(ix,count)||!finiteMorph(g.attributes.position))return null;
  parts.push(node,m,g,ix,ix.version,ix.array,ix.count,ix.gpuType,m.parent,m.material,m.customDepthMaterial,m.customDepthMaterial?.version,m.position.x,m.position.y,m.position.z,m.layers.mask,m.renderOrder,m.castShadow,m.receiveShadow,m.frustumCulled,g.drawRange.count);
  let actualNames=0;
  for(const name in g.attributes){
   actualNames++;const a=g.attributes[name],base=fa[name];
   if(!base||a.isInterleavedBufferAttribute||!a.isBufferAttribute||a.count!==count||a.array.length!==a.count*a.itemSize||a.itemSize!==base.itemSize||a.normalized!==base.normalized||a.gpuType!==base.gpuType||a.array.constructor!==base.array.constructor||a.isFloat16BufferAttribute)return null;
   parts.push(name,a,a.version,a.array,a.itemSize,a.count,a.normalized,a.gpuType,a.array.constructor);
  }
  if(actualNames!==names)return null;
  // Zero morph weights leave base positions unchanged only for finite targets.
  // Check changed buffers once, but check identities/versions/layout every frame.
  parts.push(g.morphTargetsRelative);
  for(const name in g.morphAttributes){const targets=g.morphAttributes[name];if(targets.length&&(!m.morphTargetInfluences||m.morphTargetInfluences.length<targets.length))return null;parts.push(name,targets,targets.length);
   for(let i=0;i<targets.length;i++){const a=targets[i];if(!a.isBufferAttribute||a.isInterleavedBufferAttribute||a.isFloat16BufferAttribute||a.count!==count||a.array.length!==a.count*a.itemSize||!finiteMorph(a))return null;parts.push(a,a.version,a.array,a.count,a.itemSize,a.normalized,a.gpuType);}
  }
  const box=g.boundingBox,sphere=g.boundingSphere;parts.push(box,box?.min.x,box?.min.y,box?.min.z,box?.max.x,box?.max.y,box?.max.z,sphere,sphere?.center.x,sphere?.center.y,sphere?.center.z,sphere?.radius);
 }
 return parts;
}
const equal=(a,b)=>{if(a?.length!==b?.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
// Build-time snapshots permit allocation-free stable-frame comparisons. The
// full validator still runs on every changed input; no frame skipping or hash
// collision can conceal a change. Attribute values follow Three needsUpdate.
function captureFast(parent){
 const attribute=(name,a)=>({name,a,version:a.version,array:a.array,itemSize:a.itemSize,count:a.count,normalized:a.normalized,gpuType:a.gpuType});
 return {x:parent.x,z:parent.z,size:parent.size,childSize:parent.children[0].size,depth:parent.children[0].depth,nodes:parent.children.map(node=>{
  const m=node.mesh,g=m.geometry,b=g.boundingBox,r=g.boundingSphere;
  return {node,m,g,parent:m.parent,material:m.material,depthMaterial:m.customDepthMaterial,depthVersion:m.customDepthMaterial?.version,x:m.position.x,y:m.position.y,z:m.position.z,layers:m.layers.mask,order:m.renderOrder,cast:m.castShadow,receive:m.receiveShadow,cull:m.frustumCulled,index:attribute('',g.index),draw:g.drawRange.count,relative:g.morphTargetsRelative,
   attributes:Object.entries(g.attributes).map(([n,a])=>attribute(n,a)),morph:Object.entries(g.morphAttributes).map(([name,list])=>({name,list,attributes:list.map(a=>attribute('',a))})),
   box:b,sphere:r,bounds:[b?.min.x,b?.min.y,b?.min.z,b?.max.x,b?.max.y,b?.max.z,r?.center.x,r?.center.y,r?.center.z,r?.radius]};
 })};
}
function sameAttribute(a,r){return a===r.a&&a.version===r.version&&a.array===r.array&&a.itemSize===r.itemSize&&a.count===r.count&&a.normalized===r.normalized&&a.gpuType===r.gpuType&&!a.isInterleavedBufferAttribute&&!a.isFloat16BufferAttribute&&a.isBufferAttribute;}
function fastMatches(p,r){
 const c=p.children;if(p.dead||p.transition||!c||c.length!==4||p.x!==r.x||p.z!==r.z||p.size!==r.size||c[0].size!==r.childSize||c[0].depth!==r.depth)return false;
 for(let i=0;i<4;i++){
  const a=r.nodes[i],n=c[i],m=n.mesh,g=m?.geometry;if(n!==a.node||n.dead||n.split||n.transition||m!==a.m||!m.visible||g!==a.g||g.groups.length||g.drawRange.start!==0||g.drawRange.count!==a.draw)return false;
  if(!m.isMesh||m.parent!==a.parent||m.material!==a.material||m.position.x!==a.x||m.position.y!==a.y||m.position.z!==a.z||m.quaternion.x||m.quaternion.y||m.quaternion.z||m.quaternion.w!==1||m.scale.x!==1||m.scale.y!==1||m.scale.z!==1||m.pivot||!m.matrixAutoUpdate||!m.matrixWorldAutoUpdate)return false;
  if(m.layers.mask!==a.layers||m.renderOrder!==a.order||m.castShadow!==a.cast||m.receiveShadow!==a.receive||m.frustumCulled!==a.cull||m.children.length||m.customDepthMaterial!==a.depthMaterial||m.customDepthMaterial?.version!==a.depthVersion||(m.customDepthMaterial!==undefined&&!isStandardProjectedDepth(m.customDepthMaterial))||m.customDistanceMaterial||m.isInstancedMesh||m.isSkinnedMesh)return false;
  if(m.updateMatrix!==Object3D.prototype.updateMatrix||m.updateMatrixWorld!==Object3D.prototype.updateMatrixWorld||m.onBeforeRender!==Object3D.prototype.onBeforeRender||m.onAfterRender!==Object3D.prototype.onAfterRender||m.onBeforeShadow!==Object3D.prototype.onBeforeShadow||m.onAfterShadow!==Object3D.prototype.onAfterShadow)return false;
  if(m.morphTargetInfluences)for(let k=0;k<m.morphTargetInfluences.length;k++)if(m.morphTargetInfluences[k]!==0)return false;
  if(!sameAttribute(g.index,a.index)||g.morphTargetsRelative!==a.relative)return false;
  let j=0;for(const name in g.attributes){const ar=a.attributes[j++];if(!ar||name!==ar.name||!sameAttribute(g.attributes[name],ar))return false;}if(j!==a.attributes.length)return false;
  j=0;for(const name in g.morphAttributes){const mr=a.morph[j++],list=g.morphAttributes[name];if(!mr||name!==mr.name||list!==mr.list||list.length!==mr.attributes.length||(list.length&&(!m.morphTargetInfluences||m.morphTargetInfluences.length<list.length)))return false;for(let k=0;k<list.length;k++)if(!sameAttribute(list[k],mr.attributes[k]))return false;}if(j!==a.morph.length)return false;
  const b=g.boundingBox,s=g.boundingSphere,v=a.bounds;if(b!==a.box||s!==a.sphere||b?.min.x!==v[0]||b?.min.y!==v[1]||b?.min.z!==v[2]||b?.max.x!==v[3]||b?.max.y!==v[4]||b?.max.z!==v[5]||s?.center.x!==v[6]||s?.center.y!==v[7]||s?.center.z!==v[8]||s?.radius!==v[9])return false;
 }
 return true;
}
export function mergeTerrainSiblings(parent){
 if(!terrainSiblingSignature(parent))throw new Error('Only settled complete terrain siblings may be grouped');
 const sources=parent.children.map(n=>n.mesh),first=sources[0],names=Object.keys(first.geometry.attributes),count=sources.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
 const geometry=new BufferGeometry(),origin={x:parent.x,y:0,z:parent.z};
 for(const name of names){
  const a=first.geometry.attributes[name];
  if(!sources.every(m=>{const b=m.geometry.attributes[name];return b&&b.itemSize===a.itemSize&&b.normalized===a.normalized&&b.gpuType===a.gpuType&&b.array.constructor===a.array.constructor&&Object.keys(m.geometry.attributes).length===names.length;}))throw new Error('Terrain sibling attribute layouts differ');
  const array=new a.array.constructor(count*a.itemSize);let offset=0;
  for(const m of sources){const b=m.geometry.attributes[name];array.set(b.array,offset);
   if(name==='position')for(let i=0;i<b.count;i++){array[offset+i*3]+=m.position.x-origin.x;array[offset+i*3+1]+=m.position.y-origin.y;array[offset+i*3+2]+=m.position.z-origin.z;}
   offset+=b.array.length;
  }
  const b=new BufferAttribute(array,a.itemSize,a.normalized);b.gpuType=a.gpuType;geometry.setAttribute(name,b);
 }
 const Index=count>65535?Uint32Array:Uint16Array,index=new Index(sources.reduce((n,m)=>n+m.geometry.index.count,0));let indexOffset=0,vertexOffset=0;
 for(const m of sources){for(const v of m.geometry.index.array)index[indexOffset++]=v+vertexOffset;vertexOffset+=m.geometry.attributes.position.count;}
 geometry.setIndex(new BufferAttribute(index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const shift=new Vector3(),box=new Box3(),sphere=new Sphere();
 for(const m of sources){shift.copy(m.position).sub(new Vector3(origin.x,origin.y,origin.z));if(m.geometry.boundingBox)geometry.boundingBox.union(box.copy(m.geometry.boundingBox).translate(shift));if(m.geometry.boundingSphere)geometry.boundingSphere.union(sphere.copy(m.geometry.boundingSphere).translate(shift));}
 geometry.boundingSphere.radius+=Math.max(1,geometry.boundingSphere.radius)*Number.EPSILON*8;
 const mesh=new Mesh(geometry,first.material);mesh.name='Settled terrain sibling group';mesh.customDepthMaterial=first.customDepthMaterial;mesh.position.set(origin.x,0,origin.z);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;mesh.frustumCulled=first.frustumCulled;
 mesh.userData.terrainTile={x:parent.x,z:parent.z,size:parent.size,spacing:parent.children[0].size/32,depth:parent.children[0].depth,submissionGroup:true};
 return {mesh,sources,bytes:index.byteLength+Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)};
}
export class TerrainSiblingBatches{
 constructor(group,{enabled=false,maxBuildMs=2,boundedBuild42=false}={}){this.boundedBuild42=boundedBuild42;this.group=group;this.reflectionHook=()=>this.prepareWaterReflection42();this.enabled=enabled;this.maxBuildMs=maxBuildMs;this.records=new Map();this.hidden=[];this.parents=new Set();this.scratch=[];this.epoch=0;this.bytes=0;this.stats={enabled,groups:0,sourceTiles:0,savedDraws:0,bytes:0,buildMs:0};}
 prepareWaterReflection42(){
  if(!this.enabled||!this.boundedBuild42)return null;
  const saved=[];const restore=()=>{for(let i=saved.length-1;i>=0;i--){const [m,v]=saved[i];m.visible=v;}};
  try{for(const r of this.records.values())if(r.mesh.visible){saved.push([r.mesh,r.mesh.visible]);r.mesh.visible=false;for(const m of r.sources){saved.push([m,m.visible]);m.visible=true;}}return restore;}catch(error){restore();throw error;}
 }
 restore(){for(const m of this.hidden)m.visible=true;this.hidden.length=0;for(const r of this.records.values())r.mesh.visible=false;}
 update(nodes){
  const start=performance.now();this.stats.enabled=this.enabled;
  if(this.enabled&&this.boundedBuild42&&!this.group.userData.prepareWaterReflection42)this.group.userData.prepareWaterReflection42=this.reflectionHook;
  if(!this.enabled){if(this.boundedBuild42)this.dispose();else this.restore();this.stats.groups=this.stats.sourceTiles=this.stats.savedDraws=0;this.stats.buildMs=performance.now()-start;return;}
  const parents=this.parents;parents.clear();for(const n of nodes)if(n.parent&&n.mesh?.visible)parents.add(n.parent);
  const epoch=++this.epoch;let groups=0,fastGroups=0,fullChecks=0,rebuilds=0,retired=0,constructionMs=0,budgetDeferred=0,deepRejected=0;const cheapReasons={};
  for(const p of parents){let r=this.records.get(p);if(r&&r.mesh.parent!==this.group){this.release(p);r=null;}
   if(!r||!fastMatches(p,r.fast)){
    if(this.boundedBuild42){const reason=terrainSiblingCheapRejection42(p);if(reason){cheapReasons[reason]=(cheapReasons[reason]||0)+1;continue;}}
    fullChecks++;const signature=terrainSiblingSignature(p,this.scratch);if(!signature||p.children[0].mesh.parent!==this.group){deepRejected++;continue;}
    if(r&&!equal(r.signature,signature)){this.release(p);r=null;retired++;}
    if(!r){if((this.boundedBuild42?constructionMs:performance.now()-start)>this.maxBuildMs){budgetDeferred++;continue;}const buildStart=performance.now();r={...mergeTerrainSiblings(p),signature:signature.slice(),fast:captureFast(p),epoch};this.records.set(p,r);rebuilds++;this.bytes+=r.bytes;this.group.add(r.mesh);constructionMs+=performance.now()-buildStart;}
    else r.fast=captureFast(p);
   }else fastGroups++;
   r.epoch=epoch;groups++;r.mesh.visible=true;for(const m of r.sources){m.visible=false;this.hidden.push(m);}
  }
  for(const [p,r]of this.records)if(r.epoch!==epoch)this.release(p);
  Object.assign(this.stats,{fastGroups,fullChecks,rebuilds,retired,parents:parents.size,boundedBuild42:this.boundedBuild42,constructionMs,budgetDeferred,deepRejected,cheapReasons});
  this.stats.groups=groups;this.stats.sourceTiles=groups*4;this.stats.savedDraws=groups*3;this.stats.bytes=this.bytes;this.stats.buildMs=performance.now()-start;
 }
 release(p){const r=this.records.get(p);if(!r)return;r.mesh.removeFromParent();r.mesh.geometry.dispose();this.bytes-=r.bytes;this.records.delete(p);}
 dispose(){if(this.group.userData.prepareWaterReflection42===this.reflectionHook)delete this.group.userData.prepareWaterReflection42;this.restore();for(const p of this.records.keys())this.release(p);this.parents.clear();this.scratch.length=0;}
}
