import {Frustum,Matrix4,Quaternion,Sphere,Vector3} from 'three';
import {roomCeilingHeight} from './room-lighting.js';

export function occupiedPastoralRoom(items,position){
 for(const item of items){
  const {pose,asset}=item,dx=position.x-pose.x,dz=position.z-pose.z,c=Math.cos(pose.rot),s=Math.sin(pose.rot);
  const x=(c*dx-s*dz)/pose.scale.x,z=(s*dx+c*dz)/pose.scale.z,y=(position.y-pose.y)/pose.scale.y,f=asset.floor;
  const inside=f.shape==='circle'?Math.hypot(x,z)<f.radius:x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1;
  if(inside&&y>0&&y<roomCeilingHeight(asset,x,z))return item;
 }
 return null;
}

// Keep one existing room-field/light pool. Selection changes its ownership,
// never the shader's world-to-room transform or its bounded volume contract.
// Actual room occupancy always wins. Outside, retain a near room only when a
// real aperture faces the observer and intersects the current camera frustum.
export class RoomViewSelection{
 constructor(rooms,{distance=12,retainDistance=14,hysteresis=1.2}={}){
  this.distance=distance;this.retainDistance=retainDistance;this.hysteresis=hysteresis;
  this.frustum=new Frustum();this.projection=new Matrix4();this.delta=new Vector3();this.previous=null;
  this.stats={roomId:null,reason:'none',visibleRooms:0,openingKind:null,distance:null};
  this.entries=rooms.map(item=>{
   const {pose}=item,q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),pose.rot),matrix=new Matrix4().compose(new Vector3(pose.x,pose.y,pose.z),q,new Vector3(pose.scale.x,pose.scale.y,pose.scale.z));
   return {item,openings:(item.asset.selectionOpenings??item.asset.openings).map(opening=>{
    const normal=new Vector3(...opening.normal),u=opening.kind==='roof-crown'?new Vector3(1,0,0):new Vector3(0,1,0).cross(normal).normalize(),v=new Vector3().crossVectors(normal,u).normalize();
    const scale=new Vector3(pose.scale.x,pose.scale.y,pose.scale.z),halfU=(opening.radius??opening.width*.5)*u.multiply(scale).length(),halfV=(opening.radius??opening.height*.5)*v.multiply(scale).length();
    // The floor inset ends before the wall/opening plane. This narrow exterior
    // skin keeps the same field while traversing that authored thickness.
    return {kind:opening.kind,sphere:new Sphere(new Vector3(...opening.center).applyMatrix4(matrix),Math.hypot(halfU,halfV)),normal:normal.applyQuaternion(q),area:4*halfU*halfV,skin:.26*Math.max(pose.scale.x,pose.scale.z)};
   })};
  });
 }
 select(camera,position,occupied){
  const stats=this.stats;stats.visibleRooms=0;stats.openingKind=null;stats.distance=null;
  if(occupied){this.previous=occupied;stats.roomId=occupied.id;stats.reason='occupied';return occupied;}
  this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  this.frustum.setFromProjectionMatrix(this.projection,camera.coordinateSystem,camera.reversedDepth);
  let selected=null,best=0,selectedOpening=null,selectedDistance=0;
  for(const {item,openings}of this.entries){
   const previous=item===this.previous,maxDistance=previous?this.retainDistance:this.distance;
   let score=0,openingBest=null,distanceBest=0;
   for(const opening of openings){
    this.delta.subVectors(position,opening.sphere.center);const squared=this.delta.lengthSq();
    if(squared>maxDistance*maxDistance)continue;
    const facing=this.delta.dot(opening.normal);if(facing < -opening.skin||!this.frustum.intersectsSphere(opening.sphere))continue;
    const distance=Math.sqrt(squared),candidate=opening.area*Math.max(.05,facing/Math.max(.15,distance))/Math.max(.25,squared);
    if(candidate>score){score=candidate;openingBest=opening;distanceBest=distance;}
   }
   if(!openingBest)continue;stats.visibleRooms++;
   if(previous)score*=this.hysteresis;
   if(score>best){selected=item;best=score;selectedOpening=openingBest;selectedDistance=distanceBest;}
  }
  this.previous=selected;stats.roomId=selected?.id??null;stats.reason=selected?'visible-opening':'none';stats.openingKind=selectedOpening?.kind??null;stats.distance=selected?selectedDistance:null;return selected;
 }
}
