import * as THREE from "three";
import {createShoreStones,createShoreRockGeometry,shoreStoneMatrix} from "./shore-stones.js";
import {settlementAssetFor} from "./settlement-assets.js";

// Rapier's continuous shape casts, contact planes, sliding and autostep own the
// collision response. No end-point push-out substitutes for a swept body.
const UP=new THREE.Vector3(0,1,0),IDENTITY={x:0,y:0,z:0,w:1};
const SUPPORTED=new Set(["house_a","yurt"]);
export const WALK_BODY=Object.freeze({radius:.22,height:1.65,eye:1.55,crouchHeight:1.16,crouchEye:1.06,step:.28});
let rapierPromise;
async function loadRapier(){return rapierPromise??=import("@dimforge/rapier3d-compat").then(async m=>{await m.init();return m;});}
function matrixFor(pose){return new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(UP,pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));}
export function collisionTriangles(parts,matrix=new THREE.Matrix4(),origin=new THREE.Vector3()){
 const vertices=[],indices=[],p=new THREE.Vector3();
 for(const {geometry,role} of parts){if(role==="roof-grass")continue;const a=geometry.attributes.position,offset=vertices.length/3;
  for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(matrix).sub(origin);vertices.push(p.x,p.y,p.z);}
  const count=geometry.index?.count??a.count;for(let i=0;i<count;i++)indices.push(offset+(geometry.index?geometry.index.getX(i):i));
 }
 return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export class WorldCollision {
 constructor(world,{structures,doors}={}){
  Object.assign(this,{world,structures,doors});this.origin=new THREE.Vector3();this.near=new Map();this.dynamic=new Map();this.stones=new Map();this.enabled=false;this.generation=0;this.disposed=false;this.crouching=false;this.velocityY=0;
  this.stats={status:"idle",mode:"flight",supportedAssets:[...SUPPORTED],activeBuildings:0,activeDoors:0,activeShoreStones:0,shoreTriangles:0,triangles:0,grounded:false,blockedDoors:0,collisions:0,errors:[]};
  this.entries=world.entities.filter(e=>SUPPORTED.has(e.assetId)&&!e.part).map(entity=>({entity,pose:world.surface.buildingPose(entity)}));
 }
 async enable(position){
  const generation=++this.generation;position=position.clone();if(this.disposed)throw new Error("Collision disposed");
  try{if(!this.R){this.stats.status="loading";const R=await loadRapier();if(generation!==this.generation||this.disposed)return false;this.R=R;this.physics=new this.R.World({x:0,y:-9.81,z:0});this.controller=this.physics.createCharacterController(.015);this.controller.enableAutostep(WALK_BODY.step,.18,false);this.controller.enableSnapToGround(.22);this.controller.setMaxSlopeClimbAngle(Math.PI/3);this.controller.setMinSlopeSlideAngle(Math.PI/3);}
   this.origin.set(Math.round(position.x/256)*256,Math.round(position.y/256)*256,Math.round(position.z/256)*256);this.clearNearby();this.enabled=true;this.crouching=false;this.velocityY=0;this.ensureNearby(position,true);this.createBody(position);
   this.physics.step();if(this.overlaps(position)){this.disable();this.stats.status="blocked";throw new Error("当前位置与实体相交，请先在自由飞行模式移至空处再步行");}
   this.stats.status="ready";this.stats.mode="walk";return this;
  }catch(error){this.disable();if(this.stats.status!=="blocked")this.stats.status="failed";this.stats.errors.push(error.message);throw error;}
 }
 disable(){this.generation++;this.enabled=false;this.stats.mode="flight";if(this.body){this.physics.removeCollider(this.body,true);this.body=null;}this.clearNearby();}
 createBody(position){if(this.body)this.physics.removeCollider(this.body,true);const height=this.crouching?WALK_BODY.crouchHeight:WALK_BODY.height,eye=this.crouching?WALK_BODY.crouchEye:WALK_BODY.eye;
  this.body=this.physics.createCollider(this.R.ColliderDesc.capsule(height/2-WALK_BODY.radius,WALK_BODY.radius).setTranslation(position.x-this.origin.x,position.y-eye+height/2-this.origin.y,position.z-this.origin.z));}
 bodyPose(position,crouch=this.crouching){const h=crouch?WALK_BODY.crouchHeight:WALK_BODY.height,e=crouch?WALK_BODY.crouchEye:WALK_BODY.eye;return{x:position.x-this.origin.x,y:position.y-e+h/2-this.origin.y,z:position.z-this.origin.z};}
 overlaps(position,crouch=this.crouching){const h=crouch?WALK_BODY.crouchHeight:WALK_BODY.height;return this.physics.intersectionWithShape(this.bodyPose(position,crouch),IDENTITY,new this.R.Capsule(h/2-WALK_BODY.radius,WALK_BODY.radius-.004),undefined,undefined,this.body)!==null;}
 setCrouching(value,position){if(value===this.crouching)return true;const oldEye=this.crouching?WALK_BODY.crouchEye:WALK_BODY.eye,newEye=value?WALK_BODY.crouchEye:WALK_BODY.eye,p=position.clone();p.y+=newEye-oldEye;if(!value&&this.overlaps(p,false))return false;this.crouching=value;position.copy(p);this.createBody(position);return true;}
 ensureNearby(position,force=false){
  if(!this.enabled)return;
  for(const {entity,pose} of this.entries){const distance=Math.hypot(position.x-pose.x,position.z-pose.z);if(distance<32&&!this.near.has(entity.id)){
    const parts=this.structures.collisionPartsFor?.(entity)??this.structures._templates.get(entity.assetId+":");if(!parts)continue;const data=collisionTriangles(parts,matrixFor(pose),this.origin);if(!data.indices.length)continue;const c=this.physics.createCollider(this.R.ColliderDesc.trimesh(data.vertices,data.indices));this.near.set(entity.id,{c,triangles:data.indices.length/3});
   }else if(distance>48&&this.near.has(entity.id)){this.physics.removeCollider(this.near.get(entity.id).c,true);this.near.delete(entity.id);}}
  if(force||!this.groundCenter||Math.hypot(position.x-this.groundCenter.x,position.z-this.groundCenter.z)>8)this.updateGround(position);
  this.syncShoreStones(position,force);this.syncDoors();this.stats.activeBuildings=this.near.size;this.stats.triangles=[...this.near.values()].reduce((s,v)=>s+v.triangles,0);
 }
 // Same scanned 1,260-triangle shell and instance transform as the renderer.
 // Only nearby fixed bodies are resident; no render LOD or stone count changes.
 // Refresh on a metric cell, not every animation frame. The 16 m retention
 // overlap covers the entire character sweep between consecutive refreshes.
 syncShoreStones(position,force=false){
  const h=this.world.hydrology;if(!h?.nearSegments)return;
  const ix=Math.floor(position.x/8),iz=Math.floor(position.z/8),key=ix+","+iz;
  if(!force&&key===this.stoneCell)return;this.stoneCell=key;
  const records=createShoreStones(this.world,h.nearSegments(position.x,position.z,40));
  for(const record of records){
   if(this.stones.has(record.id)||Math.hypot(record.x-position.x,record.z-position.z)>32)continue;
   this.stoneGeometry??=createShoreRockGeometry();
   const data=collisionTriangles([{geometry:this.stoneGeometry}],shoreStoneMatrix(record),this.origin);
   const c=this.physics.createCollider(this.R.ColliderDesc.trimesh(data.vertices,data.indices));
   this.stones.set(record.id,{c,record,triangles:data.indices.length/3});
  }
  for(const [id,item] of this.stones)if(Math.hypot(item.record.x-position.x,item.record.z-position.z)>48){this.physics.removeCollider(item.c,true);this.stones.delete(id);}
  this.stats.activeShoreStones=this.stones.size;this.stats.shoreTriangles=[...this.stones.values()].reduce((sum,item)=>sum+item.triangles,0);
 }
 updateGround(position){if(this.ground)this.physics.removeCollider(this.ground,true);const vertices=[],indices=[],n=48,step=1,x0=Math.floor(position.x)-n/2,z0=Math.floor(position.z)-n/2;
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const wx=x0+x*step,wz=z0+z*step;vertices.push(wx-this.origin.x,this.world.surface.heightAt(wx,wz)-this.origin.y,wz-this.origin.z);}
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  this.ground=this.physics.createCollider(this.R.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)));this.groundCenter=position.clone();
 }
 leafData(leaf,angle=leaf.angle){const matrix=leaf.base.clone().multiply(new THREE.Matrix4().makeRotationY(angle)).scale(leaf.template.scale);return collisionTriangles(leaf.template.parts,matrix,this.origin);}
 syncDoors(){if(!this.enabled)return;for(const leaf of this.doors?.leaves??[]){let item=this.dynamic.get(leaf);if(!this.near.has(leaf.entityId)){if(item){this.physics.removeCollider(item.c,true);this.dynamic.delete(leaf);}continue;}
   if(item?.angle===leaf.angle)continue;const data=this.leafData(leaf),shape=new this.R.TriMesh(data.vertices,data.indices);if(item){item.c.setShape(shape);item.angle=leaf.angle;}else this.dynamic.set(leaf,{c:this.physics.createCollider(new this.R.ColliderDesc(shape)),angle:leaf.angle});
  }this.stats.activeDoors=this.dynamic.size;}
 // A 1-degree angular partition plus the maximum arc radius as extra body
 // clearance covers the whole rotational sweep, not just sampled endpoints.
 allowDoorMotion(leaf,next){if(!this.enabled||!this.body||!this.near.has(leaf.entityId))return true;const delta=next-leaf.angle,steps=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/180))),step=delta/steps;
  const matrix=leaf.base.clone().scale(leaf.template.scale),scale=new THREE.Vector3().setFromMatrixScale(matrix),bounds=leaf.template.bounds,r=Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)))*Math.max(scale.x,scale.z),margin=r*Math.abs(step)/2+.002;
  const h=this.crouching?WALK_BODY.crouchHeight:WALK_BODY.height,shape=new this.R.Capsule(h/2-WALK_BODY.radius,WALK_BODY.radius+margin),pos=this.body.translation();
  for(let i=0;i<steps;i++){const data=this.leafData(leaf,leaf.angle+step*(i+.5)),leafShape=new this.R.TriMesh(data.vertices,data.indices);if(leafShape.intersectsShape({x:0,y:0,z:0},IDENTITY,shape,pos,IDENTITY)){this.stats.blockedDoors++;return false;}}
  return true;
 }
 move(position,movement,dt,{crouch=false}={}){if(!this.enabled)return position;if(Math.max(Math.abs(position.x-this.origin.x),Math.abs(position.z-this.origin.z))>256){this.clearNearby();this.origin.set(Math.round(position.x/256)*256,Math.round(position.y/256)*256,Math.round(position.z/256)*256);this.ensureNearby(position,true);this.createBody(position);this.stats.rebases=(this.stats.rebases??0)+1;}this.setCrouching(crouch,position);this.ensureNearby(position);this.body.setTranslation(this.bodyPose(position));this.physics.step();this.velocityY=Math.max(-35,this.velocityY-9.81*Math.min(dt,.1));
  const desired={x:movement.x,y:this.velocityY*Math.min(dt,.1),z:movement.z};this.controller.computeColliderMovement(this.body,desired);const corrected=this.controller.computedMovement();position.x+=corrected.x;position.y+=corrected.y;position.z+=corrected.z;this.body.setTranslation(this.bodyPose(position));this.stats.grounded=this.controller.computedGrounded();this.stats.collisions=this.controller.numComputedCollisions();if(this.stats.grounded)this.velocityY=0;return position;
 }
 clearNearby(){if(!this.physics)return;for(const v of this.near.values())this.physics.removeCollider(v.c,true);for(const v of this.dynamic.values())this.physics.removeCollider(v.c,true);for(const v of this.stones.values())this.physics.removeCollider(v.c,true);this.stones.clear();this.stoneCell=null;this.stats.activeShoreStones=0;this.stats.shoreTriangles=0;this.near.clear();this.dynamic.clear();if(this.ground)this.physics.removeCollider(this.ground,true);this.ground=null;this.groundCenter=null;this.stats.activeBuildings=0;this.stats.activeDoors=0;}
 dispose(){this.disposed=true;this.disable();this.stoneGeometry?.dispose();this.stoneGeometry=null;this.physics?.free();this.physics=null;this.stats.status="disposed";}
}

// Reachable menu entries for the same original thresholds used by walking QA.
export function walkingViewpoints(world){
 return [...SUPPORTED].flatMap(id=>{
  const asset=settlementAssetFor(id),entity=world.entities.find(e=>e.id===asset.representativeId);if(!entity)return [];
  const q=world.surface.buildingPose(entity),door=asset.openings.find(o=>o.kind==="door"),lx=door.center[0],lz=id==="house_a"?4.15:4.6,c=Math.cos(q.rot),s=Math.sin(q.rot);
  const x=q.x+c*lx*q.scale.x+s*lz*q.scale.z,z=q.z-s*lx*q.scale.x+c*lz*q.scale.z,y=Math.max(q.y+1.65*q.scale.y,world.surface.heightAt(x,z)+1.65);
  const entries=[{id:"walk-"+id,name:id==="house_a"?"木屋门前 · 步行入口":"毡房门前 · 步行入口",category:"牧居生活",x,y,z,yaw:-q.rot*180/Math.PI,pitch:-7}];
  if(id==="house_a"){
    const px=q.x+c*2.9*q.scale.x+s*12.6*q.scale.z,pz=q.z-s*2.9*q.scale.x+c*12.6*q.scale.z;
    entries.unshift({id:"porch-house_a",name:"木屋门廊 · 牧居生活",category:"牧居生活",x:px,z:pz,
      y:Math.max(q.y+2.85*q.scale.y,world.surface.heightAt(px,pz)+1.8),yaw:-q.rot*180/Math.PI-14,pitch:-8});
  }
  return entries;
 });
}
