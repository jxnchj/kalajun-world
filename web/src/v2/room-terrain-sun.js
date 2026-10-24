import {Vector3,Matrix4,Quaternion} from 'three';
// The static transport tables combine all openings. Until per-opening tables
// exist, apply external occlusion only when ALL sampled aperture rays are
// blocked among openings facing the actual sun. Back-facing apertures cannot
// inject directional sunlight; their sky contribution remains untouched.
// A partially occluded sun-facing aperture keeps its original solar transport.
// This is sampled terrain visibility, not vegetation/building visibility or GI.
export class RoomTerrainSun {
 constructor(heightAt,{maxDistance=16000,enabled=true}={}){
  this.heightAt=heightAt;this.maxDistance=maxDistance;this.enabled=enabled;this.signature=null;
  this.stats={enabled,active:false,blockedRays:0,rays:0,heightSamples:0,updates:0,lastCpuMs:0,partial:false,model:'all sampled sun-facing apertures blocked by terrain; partial sun-facing occlusion unresolved'};
 }
 apply(item,lighting){
  if(!this.enabled||!item||!lighting?.sun||lighting.sun.y<=0){this.stats.active=false;return lighting;}
  const p=item.pose,s=lighting.sun,key=[item.id,p.x,p.y,p.z,p.rot,p.scale.x,p.scale.y,p.scale.z,s.x,s.y,s.z].join('|');
  if(key!==this.signature){
   const start=performance.now(),direction=new Vector3(s.x,s.y,s.z).normalize(),matrix=new Matrix4().compose(new Vector3(p.x,p.y,p.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.rot),new Vector3(p.scale.x,p.scale.y,p.scale.z));
   let rays=0,blocked=0,samples=0,minHitDistance=Infinity,maxHitDistance=0;const apertureResults=[];
   // Exclude the entire room footprint plus an exterior buffer. This pass is
   // for surrounding terrain, not the own foundation or wall/door geometry.
   const floor=item.asset.floor;
   const radius=floor?.shape==='circle'?floor.radius*Math.max(p.scale.x,p.scale.z):floor?Math.hypot(Math.max(Math.abs(floor.x0),Math.abs(floor.x1))*p.scale.x,Math.max(Math.abs(floor.z0),Math.abs(floor.z1))*p.scale.z):0;
   const startDistance=Math.max(2,2*radius+8);
   const horizontal=Math.hypot(direction.x,direction.z);
   for(const opening of item.asset.openings||[]){
    const openingRays=rays,openingBlocked=blocked;
    const center=new Vector3(...opening.center),normal=new Vector3(...opening.normal);
    const u=opening.kind==='roof-crown'?new Vector3(1,0,0):new Vector3(0,1,0).cross(normal).normalize();
    const v=new Vector3().crossVectors(normal,u).normalize();
    const halfU=opening.radius??opening.width*.5,halfV=opening.radius??opening.height*.5;
    // A 3x3 grid includes aperture boundaries, conservatively using the square
    // envelope of circular roof openings. No point starts on the terrain.
    for(const x of [-1,0,1])for(const y of [-1,0,1]){
     const origin=center.clone().addScaledVector(u,x*halfU).addScaledVector(v,y*halfV).applyMatrix4(matrix);rays++;
     if(horizontal<1e-5)continue;
     for(let distance=startDistance;distance<=this.maxDistance;distance*=1.15){
      const t=distance/horizontal,terrain=this.heightAt(origin.x+direction.x*t,origin.z+direction.z*t);samples++;
      // Margin avoids grazing self-intersection / foundation interpolation.
      if(Number.isFinite(terrain)&&terrain>origin.y+direction.y*t+.25){blocked++;minHitDistance=Math.min(minHitDistance,distance);maxHitDistance=Math.max(maxHitDistance,distance);break;}
     }
    }
    const facing=normal.clone().applyAxisAngle(new Vector3(0,1,0),p.rot).dot(direction);
    apertureResults.push({rays:rays-openingRays,blocked:blocked-openingBlocked,kind:opening.kind,sunFacing:facing>1e-7,facingCosine:facing});
   }
   const solarApertures=apertureResults.filter(a=>a.sunFacing);
   this.blocked=solarApertures.length>0&&solarApertures.every(a=>a.blocked===a.rays);this.signature=key;
   Object.assign(this.stats,{apertures:apertureResults,sunFacingApertures:solarApertures.length,allApertureSamplesBlocked:rays>0&&blocked===rays,active:this.blocked,partial:blocked>0&&blocked<rays,blockedRays:blocked,rays,heightSamples:samples,minHitDistance:blocked?minHitDistance:null,maxHitDistance:blocked?maxHitDistance:null,excludedNearMeters:startDistance,updates:this.stats.updates+1,lastCpuMs:performance.now()-start});
  }
  this.stats.active=this.blocked;
  return this.blocked?{...lighting,visibility:0,exteriorVisibility:lighting.visibility??1}:lighting;
 }
}
