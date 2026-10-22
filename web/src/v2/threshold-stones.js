import * as THREE from "three";
import {settlementAssetFor} from "./settlement-assets.js";

// The legacy foundation ring scattered complete rocks across the doorway.
// Translate those connected rocks beside the existing step; preserve authored
// step slabs, every vertex/index, material, UV and the rest of the building.
export function clearThresholdStones(assetId,scene){
 const asset=settlementAssetFor(assetId),door=asset?.openings.find(o=>o.kind==="door");
 const result={assetId,moved:0,triangles:0,stones:[]};if(!door)return result;scene.updateMatrixWorld(true);
 scene.traverse(node=>{
  if(!node.isMesh||node.name!==assetId+"_stone"||node.userData.thresholdStonesCleared)return;
  const g=node.geometry,a=g.attributes.position,index=g.index,parent=Array.from({length:a.count},(_,i)=>i),at=new Map(),p=new THREE.Vector3();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(i,j)=>{parent[root(i)]=root(j);};
  for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i);const key=[p.x,p.y,p.z].map(v=>Math.round(v*1e5)).join(',');if(at.has(key))join(i,at.get(key));else at.set(key,i);}
  const count=index?.count??a.count;for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);join(ids[0],ids[1]);join(ids[1],ids[2]);}
  const components=new Map();for(let i=0;i<a.count;i++){const id=root(i);if(!components.has(id))components.set(id,{ids:[],bounds:new THREE.Box3(),triangles:0});const c=components.get(id);c.ids.push(i);c.bounds.expandByPoint(p.fromBufferAttribute(a,i).applyMatrix4(node.matrixWorld));}
  for(let i=0;i<count;i+=3)components.get(root(index?index.getX(i):i)).triangles++;
  const half=door.width/2+.08,x=door.center[0],z=door.center[2],moved=[];
  for(const c of components.values()){
   const b=c.bounds;if(c.triangles<20||b.min.y<-.5||b.min.y>.2||b.max.y<asset.floorY+.012||b.max.z<z-.35||b.min.z>z+.38||b.max.x<x-half||b.min.x>x+half)continue;
   const center=b.getCenter(new THREE.Vector3()),side=center.x<x?-1:1;
   let dx=side<0?x-half-b.max.x-.025:x+half-b.min.x+.025;
   // A doorway can intersect more than one rock. Keep moved rocks separate;
   // do not pile them at one common coordinate or instantiate replacements.
   for(const other of moved){const bb=b.clone().translate(new THREE.Vector3(dx,0,0));if(bb.intersectsBox(other))dx+=side*(other.getSize(new THREE.Vector3()).x+.04);}
   const delta=new THREE.Vector3(dx,0,0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(node.matrixWorld).invert());
   for(const i of c.ids){p.fromBufferAttribute(a,i).add(delta);a.setXYZ(i,p.x,p.y,p.z);}
   moved.push(b.clone().translate(new THREE.Vector3(dx,0,0)));result.moved++;result.triangles+=c.triangles;result.stones.push({triangles:c.triangles,from:b.min.toArray(),to:moved.at(-1).min.toArray(),deltaX:dx});
  }
  if(moved.length){a.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();}node.userData.thresholdStonesCleared=true;
 });return result;
}
