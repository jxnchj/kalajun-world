import {GuestStairPlantField} from './guest-stair-plants.js';
import {LodgeStairPlantField} from './lodge-stair-plants.js';
import {settlementAssetFor} from "./settlement-assets.js";
import {householdYards} from "./household-yards.js";
import {householdEntryStepSegments} from "./household-entry-steps.js";
// Source door coordinates and asset bounds are available before GLB loading.
// Ownership stays with the original meadow cell; this never deletes a root.
export const THRESHOLD_PLANT_MAX_SHIFT=4.8;
const BIN=64;
const hash=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
export class ThresholdPlantField{
 constructor(world){
  this.world=world;this.guestStairs=new GuestStairPlantField(world);this.lodgeStairs=new LodgeStairPlantField(world);this.enabled=new URLSearchParams(globalThis.location?.search||"").get("thresholdPlants")!=="v25";this.entries=[];this.bins=new Map();
  for(const entity of world.entities||[]){
   const asset=settlementAssetFor(entity.assetId);if(!asset||entity.part)continue;
   const door=asset.openings.find(o=>o.kind==="door"),meta=world.manifest?.assetMetadata?.[entity.assetId];
   if(!door||!meta?.bounds||!world.surface.buildingPose)continue;
   const pose=world.surface.buildingPose(entity),c=Math.cos(pose.rot),s=Math.sin(pose.rot);
   const outdoor=asset.outdoor,margin=outdoor?.plantMargin??0;
   const entry={id:entity.id,pose,c,s,
    x0:Math.min(door.center[0]-.75,outdoor?outdoor.x0-margin:Infinity),
    x1:Math.max(door.center[0]+.75,outdoor?outdoor.x1+margin:-Infinity),
    z0:door.center[2]-.25,z1:Math.max(meta.bounds.max[2]+.35,outdoor?outdoor.z1+margin:-Infinity)};
   this.entries.push(entry);
   // Entire local rectangle, not merely its centre: rotated/scaled footprints
   // remain queryable across bin boundaries without scanning every building.
   const points=[[entry.x0,entry.z0],[entry.x0,entry.z1],[entry.x1,entry.z0],[entry.x1,entry.z1]].map(([x,z])=>[pose.x+c*x*pose.scale.x+s*z*pose.scale.z,pose.z-s*x*pose.scale.x+c*z*pose.scale.z]);
   for(let x=Math.floor(Math.min(...points.map(p=>p[0]))/BIN);x<=Math.floor(Math.max(...points.map(p=>p[0]))/BIN);x++)for(let z=Math.floor(Math.min(...points.map(p=>p[1]))/BIN);z<=Math.floor(Math.max(...points.map(p=>p[1]))/BIN);z++){
    const key=x+","+z;if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(entry);
   }
  }
  this.yards=householdYards(world);this.yardBins=new Map();
  for(const segment of [...this.yards.segments,...householdEntryStepSegments(world)]){const r=segment.radius;
   for(let x=Math.floor((Math.min(segment.a[0],segment.b[0])-r)/BIN);x<=Math.floor((Math.max(segment.a[0],segment.b[0])+r)/BIN);x++)for(let z=Math.floor((Math.min(segment.a[1],segment.b[1])-r)/BIN);z<=Math.floor((Math.max(segment.a[1],segment.b[1])+r)/BIN);z++){
    const key=x+","+z;if(!this.yardBins.has(key))this.yardBins.set(key,[]);this.yardBins.get(key).push(segment);
   }
  }
 }
 intersectsGuest(root,envelope){return this.guestStairs.intersects(root,envelope);}
 intersectsLodge(root,envelope){return this.lodgeStairs.intersects(root,envelope);}
 intersectsYard(root,envelope){
  const radius=envelope.radius*(root.s??1),seen=new Set();
  for(let x=Math.floor((root.x-radius)/BIN);x<=Math.floor((root.x+radius)/BIN);x++)for(let z=Math.floor((root.z-radius)/BIN);z<=Math.floor((root.z+radius)/BIN);z++)for(const e of this.yardBins.get(x+","+z)||[]){
   if(seen.has(e))continue;seen.add(e);const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],d2=dx*dx+dz*dz,t=d2?Math.max(0,Math.min(1,((root.x-e.a[0])*dx+(root.z-e.a[1])*dz)/d2)):0;
   if(Math.hypot(root.x-e.a[0]-t*dx,root.z-e.a[1]-t*dz)<=radius+e.radius)return true;
  }
  return false;
 }
 intersects(root,envelope){
  const radius=envelope.radius*(root.s??1),seen=new Set();
  for(let x=Math.floor((root.x-radius)/BIN);x<=Math.floor((root.x+radius)/BIN);x++)for(let z=Math.floor((root.z-radius)/BIN);z<=Math.floor((root.z+radius)/BIN);z++)for(const e of this.bins.get(x+","+z)||[]){
   if(seen.has(e))continue;seen.add(e);const dx=root.x-e.pose.x,dz=root.z-e.pose.z,lx=(e.c*dx-e.s*dz)/e.pose.scale.x,lz=(e.s*dx+e.c*dz)/e.pose.scale.z;
   const nx=Math.max(e.x0-lx,0,lx-e.x1)*e.pose.scale.x,nz=Math.max(e.z0-lz,0,lz-e.z1)*e.pose.scale.z;
   if(Math.hypot(nx,nz)<=radius)return true;
  }
  return this.intersectsYard(root,envelope)||this.intersectsLodge(root,envelope)||this.intersectsGuest(root,envelope);
 }
 relocate(root,envelope,suitable=()=>true,source=root){
  if(!this.enabled||!this.intersects(root,envelope))return root;
  const offset=root.y-this.world.surface.heightAt(root.x,root.z),phase=hash(root.id)*Math.PI*2;
  for(const radius of [.2,.4,.7,1,1.4,1.9,2.5,3.2,4,THRESHOLD_PLANT_MAX_SHIFT])for(let j=0;j<24;j++){
   const angle=phase+j*Math.PI/12,x=root.x+Math.cos(angle)*radius,z=root.z+Math.sin(angle)*radius;
   const moved={...root,x,z,y:this.world.surface.heightAt(x,z)+offset};
   if(Math.hypot(x-source.x,z-source.z)>THRESHOLD_PLANT_MAX_SHIFT+.000001||!Number.isFinite(moved.y)||this.intersects(moved,envelope)||!suitable(moved))continue;
   return {...moved,thresholdMove:radius,...(this.intersectsYard(root,envelope)?{yardMove:radius}:{})};
  }
  return {...root,thresholdUnresolved:true};
 }
}
