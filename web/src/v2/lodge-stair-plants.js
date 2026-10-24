import * as THREE from 'three';
import data from './lodge-stair-obstacle-data.js';
import {createPlantGeometryCollider,plantIntersectsStone} from './shore-contact.js';
export class LodgeStairPlantField{
 constructor(world,{obstacles=data,enabled=new URLSearchParams(globalThis.location?.search||'').get('lodgeStairPlants')!=='0'}={}){
  const data=obstacles;this.data=data;this.world=world;this.colliders=null;this.stats={parts:data.parts.length,triangles:data.parts.reduce((n,p)=>n+p.indices.length/3,0),built:false};
  this.entity=enabled?(world.entities||[]).find(e=>e.id===data.entityId):null;if(!this.entity)return;
  if(world.manifest?.assetMetadata?.[this.entity.assetId]?.sha256!==data.sourceSHA256)throw Error('Lodge stair vegetation obstacle source changed');
  const q=world.surface.buildingPose(this.entity);this.matrix=new THREE.Matrix4().compose(new THREE.Vector3(q.x,q.y,q.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),q.rot),new THREE.Vector3(q.scale.x,q.scale.y,q.scale.z));
  this.box=new THREE.Box3();for(const part of data.parts)this.box.union(new THREE.Box3(new THREE.Vector3(...part.bounds[0]),new THREE.Vector3(...part.bounds[1])).applyMatrix4(this.matrix));
 }
 intersects(root,envelope){
  if(!this.entity)return false;const r=envelope.radius*(root.s??1),b=this.box;if(root.x+r<b.min.x||root.x-r>b.max.x||root.z+r<b.min.z||root.z-r>b.max.z)return false;
  if(!this.colliders){this.colliders=this.data.parts.map(part=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));g.setIndex(part.indices);const c=createPlantGeometryCollider(g,this.matrix);g.dispose();return c;});this.stats.built=true;}
  return this.colliders.some(c=>plantIntersectsStone(root,envelope,c));
 }
}
