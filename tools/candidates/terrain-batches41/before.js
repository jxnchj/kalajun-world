import {BufferGeometry,BufferAttribute,Mesh} from 'three';
// Submission-only grouping. Authoritative tiles, LOD selection, morphs and physics
// remain owned by WorldTerrain. Only four fully settled siblings can be grouped.
export function terrainSiblingSignature(parent){
 const children=parent.children;
 if(!children||children.length!==4||parent.transition)return null;
 const parts=[];
 for(const node of children){
  const m=node.mesh,g=m?.geometry;
  if(node.dead||!m?.visible||node.split||node.transition||!g?.index||g.groups.length||g.drawRange.start!==0||g.drawRange.count<g.index.count||m.morphTargetInfluences?.some(v=>v!==0))return null;
  if(m.material!==children[0].mesh.material||m.layers.mask!==children[0].mesh.layers.mask||m.renderOrder!==children[0].mesh.renderOrder||m.castShadow!==children[0].mesh.castShadow||m.receiveShadow!==children[0].mesh.receiveShadow)return null;
  if(m.rotation.x||m.rotation.y||m.rotation.z||m.scale.x!==1||m.scale.y!==1||m.scale.z!==1)return null;
  parts.push(m,g,g.index,g.index.version,m.position.x,m.position.y,m.position.z,m.layers.mask,m.renderOrder,m.castShadow,m.receiveShadow);
  for(const name of Object.keys(g.attributes).sort()){const a=g.attributes[name];if(a.isInterleavedBufferAttribute)return null;parts.push(name,a,a.version,a.array,a.itemSize,a.normalized,a.gpuType);}
 }
 return parts;
}
const equal=(a,b)=>a?.length===b?.length&&a.every((v,i)=>v===b[i]);
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
 const mesh=new Mesh(geometry,first.material);mesh.name='Settled terrain sibling group';mesh.position.set(origin.x,0,origin.z);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;
 mesh.userData.terrainTile={x:parent.x,z:parent.z,size:parent.size,spacing:parent.children[0].size/32,depth:parent.children[0].depth,submissionGroup:true};
 return {mesh,sources,bytes:index.byteLength+Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)};
}
export class TerrainSiblingBatches{
 constructor(group,{enabled=false,maxBuildMs=2}={}){this.group=group;this.enabled=enabled;this.maxBuildMs=maxBuildMs;this.records=new Map();this.hidden=[];this.stats={enabled,groups:0,sourceTiles:0,savedDraws:0,bytes:0,buildMs:0};}
 restore(){for(const m of this.hidden)m.visible=true;this.hidden.length=0;for(const r of this.records.values())r.mesh.visible=false;}
 update(nodes){
  const start=performance.now();this.stats.enabled=this.enabled;
  if(!this.enabled){this.stats.groups=this.stats.sourceTiles=this.stats.savedDraws=0;return;}
  const parents=new Set();for(const n of nodes)if(n.parent&&n.mesh?.visible)parents.add(n.parent);
  const used=new Set();let groups=0;
  for(const p of parents){const signature=terrainSiblingSignature(p);if(!signature)continue;
   let r=this.records.get(p);
   if(r&&!equal(r.signature,signature)){this.release(p);r=null;}
   if(!r){if(performance.now()-start>this.maxBuildMs)continue;r={...mergeTerrainSiblings(p),signature};this.records.set(p,r);this.group.add(r.mesh);}
   used.add(p);groups++;r.mesh.visible=true;for(const m of r.sources){m.visible=false;this.hidden.push(m);}
  }
  for(const p of this.records.keys())if(!used.has(p))this.release(p);
  Object.assign(this.stats,{groups,sourceTiles:groups*4,savedDraws:groups*3,bytes:[...this.records.values()].reduce((n,r)=>n+r.bytes,0),buildMs:performance.now()-start});
 }
 release(p){const r=this.records.get(p);if(!r)return;r.mesh.removeFromParent();r.mesh.geometry.dispose();this.records.delete(p);}
 dispose(){this.restore();for(const p of this.records.keys())this.release(p);}
}
