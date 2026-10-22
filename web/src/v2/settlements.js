import {householdStyle,householdViewpoints} from './household-living.js';
import {householdRoomKey} from './household-room-fields.js';
import * as THREE from "three";
import { RoomFixtureControls } from "./room-fixture-controls.js";
import { shadowDepthBias } from "./depth-mode.js";
import { settlementAssetFor, settlementAssetViewpoints } from "./settlement-assets.js";
import { RoomIndirectLight, openingLightSample, roomCeilingHeight } from "./room-lighting.js";

// Local coordinates match the existing guest block exactly: x east, y up, z front.
// Right-hand rooms adopt one documented room-family design; their numbered identity
// and the concealed bathroom layouts are design adaptations, not surveyed facts.
export const LANCHUAN_ROOMS = Object.freeze([
  {id:"lanchuan-freedom-1",name:"岚川 · 草坡客房",x0:-1.75,x1:4.2,z0:-3.85,z1:3.25,windowX:.6,doorX:2.7},
  {id:"lanchuan-freedom-2",name:"岚川 · 相邻客房",x0:4.4,x1:9.8,z0:-3.85,z1:3.25,windowX:5.9,doorX:8},
  {id:"lanchuan-freedom-3",name:"岚川 · 东侧客房",x0:10,x1:14.75,z0:-3.85,z1:3.25,windowX:12,doorX:14},
]);
const rad=180/Math.PI;
function transform(pose,x,y,z) {
  const c=Math.cos(pose.rot),s=Math.sin(pose.rot),sx=x*pose.scale.x,sz=z*pose.scale.z;
  return new THREE.Vector3(pose.x+c*sx+s*sz,pose.y+y*pose.scale.y,pose.z-s*sx+c*sz);
}
function location(world,pose,room,name,id,from,to) {
  const p=transform(pose,...from),look=transform(pose,...to),d=look.clone().sub(p);
  return {id,name,category:"居所",entityId:pose.entityId,roomId:room.id,
    x:p.x,y:p.y,z:p.z,above:p.y-world.surface.heightAt(p.x,p.z),
    yaw:Math.atan2(d.x,-d.z)*rad,pitch:Math.atan2(d.y,Math.hypot(d.x,d.z))*rad};
}
export class SettlementRuntime {
  constructor(world) {
    this.world=world;this.group=new THREE.Group();this.group.name="world-v2-settlement-lights";
    this.viewpoints=[];this.anchors=[];this.poses=[];this.guestRooms=[];
    for(const entity of world.entities.filter(e=>e.assetId==="gh_lanchuan")) {
      const pose={...world.surface.buildingPose(entity),entityId:entity.id};
      this.poses.push(pose);
      for(const [index,room] of LANCHUAN_ROOMS.entries()) {
        // Openings follow the existing guesthouses.py shell, not the room-photo
        // label: front tall pane, rear window and the open entrance under porch.
        this.guestRooms.push({id:pose.entityId+":"+room.id,roomId:room.id,pose,asset:{
          portalSpots:false,height:2.68,bounceField:room.id,
          floor:{shape:"rect",x0:room.x0,x1:room.x1,z0:room.z0,z1:room.z1,y:.035},
          excludedBounds:[room.x1-1.86,room.x1,room.z0,room.z0+2.41],
          openings:[
            {kind:"window",center:[room.windowX,1.24,3.4],width:index===2?2.6:2.4,height:2.32,normal:[0,0,1],skyWeight:.55},
            {kind:"window",center:[[1.5,7.5,12.5][index],1.475,-4],width:1.3,height:1.15,normal:[0,0,-1],skyWeight:.85},
            {kind:"door",center:[room.doorX,1.15,3.4],width:index===2?.9:1,height:2.3,normal:[0,0,1],skyWeight:.30}
          ]}});
        const bx=room.windowX,viewX=room.doorX-.28;
        this.viewpoints.push(location(world,pose,room,room.name,room.id,[viewX,1.6,2.2],[bx,.98,-2.25]));
        if(room===LANCHUAN_ROOMS[0]) this.viewpoints.push(location(world,pose,room,"岚川 · 窗前看草原","lanchuan-window",
          [bx,1.55,.9],[bx,1.42,15]));
        // Bedside wall sconces and vanity fixture match the Blender geometry.
        // Emit just below the solid glow diffuser, so it cannot self-occlude the lamp.
        for(const [x,y,z,intensity] of [[bx-1.12,1.27,-3.39,104],[bx+1.12,1.27,-3.39,104],[room.x1-.9,2.04,-3.62,128]])
          this.anchors.push({position:transform(pose,x,y,z),target:transform(pose,x,y-1,z),intensity,roomId:room.id,entityId:pose.entityId});
      }
    }
    this.pastoralPoses=world.entities.filter(e=>settlementAssetFor(e.assetId)).map(e=>{const asset=settlementAssetFor(e.assetId);return {id:e.id,pose:world.surface.buildingPose(e),asset:e.assetId==="house_a"?{...asset,bounceField:householdRoomKey(householdStyle(e.id))}:asset};});
    this.viewpoints.push(...settlementAssetViewpoints(world),...householdViewpoints(world));
    this.lights=Array.from({length:3},(_,i)=>{
      const light=new THREE.SpotLight(0xffdfb3,0,4.2,Math.PI*.38,.65,2);
      light.name="room-local-light-"+i;light.castShadow=false;
      light.shadow.mapSize.set(512,512);light.shadow.camera.near=.04;
      light.shadow.bias=-.00008;light.shadow.normalBias=.012;
      // Fixtures and architecture are static: refresh only when this pool moves
      // to another lamp, instead of six cube faces per point light every frame.
      light.shadow.autoUpdate=false;light.shadow.needsUpdate=false;
      this.group.add(light,light.target);return light;
    });
    // Window/door sky fill approximates diffuse light entering real openings.
    // It is separate from the sun and exposure, and finite shadow maps prevent
    // it crossing partitions. These are not baked global-illumination probes.
    this.portalLights=this.lights; // The occupied room uses either fixtures or openings, never both pools.
    this.indirect=new RoomIndirectLight();
    this.fixtureControls=new RoomFixtureControls(this.guestRooms);
    this._camera=new THREE.Vector3();
  }
  setDoorOpenness(provider){this.doorOpenness=provider;return this;}
  registerMaterials(materials){this.indirect.register(materials);this.fixtureControls.register(materials);return this;}
  floorHeightAt(x,z) {
    for(const pose of this.poses) {
      const dx=x-pose.x,dz=z-pose.z,c=Math.cos(pose.rot),s=Math.sin(pose.rot);
      const lx=(c*dx-s*dz)/pose.scale.x,lz=(s*dx+c*dz)/pose.scale.z;
      const room=LANCHUAN_ROOMS.some(r=>lx>=r.x0&&lx<=r.x1&&lz>=r.z0&&lz<=r.z1);
      const porch=lx>=-2&&lx<=15.3&&lz>=3.25&&lz<=5.8;
      if(room||porch)return pose.y+(room ? .035 : 0)*pose.scale.y;
    }
    for(const {pose,asset} of this.pastoralPoses){
      const dx=x-pose.x,dz=z-pose.z,c=Math.cos(pose.rot),s=Math.sin(pose.rot);
      const lx=(c*dx-s*dz)/pose.scale.x,lz=(s*dx+c*dz)/pose.scale.z,f=asset.floor;
      const inside=f.shape==="circle"?Math.hypot(lx,lz)<=f.radius:lx>=f.x0&&lx<=f.x1&&lz>=f.z0&&lz<=f.z1;
      if(inside)return pose.y+f.y*pose.scale.y;
    }
    return null;
  }
  update(camera,dt,sunLighting=20) {
    const sunElevationDegrees=typeof sunLighting==="number"?sunLighting:(sunLighting?.elevation??20);
    this.sunLighting=typeof sunLighting==="object"?sunLighting:null;
    camera.getWorldPosition(this._camera);
    for(const light of this.lights)light.shadow.bias=shadowDepthBias(-.00008,camera.reversedDepth);
    let activeRoom=null,activePose=null;
    for(const pose of this.poses) {
      const dx=this._camera.x-pose.x,dz=this._camera.z-pose.z,c=Math.cos(pose.rot),s=Math.sin(pose.rot);
      const x=(c*dx-s*dz)/pose.scale.x,z=(s*dx+c*dz)/pose.scale.z;
      if(this._camera.y<pose.y || this._camera.y>pose.y+2.8*pose.scale.y)continue;
      activeRoom=LANCHUAN_ROOMS.find(r=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)?.id??null;
      if(activeRoom){activePose=pose;break;}
    }
    // Only the occupied room contributes local lamps. The fixed three-light pool
    // avoids activating neighbouring-room lamps while viewing this room.
    // The lamp shades direct light downwards; finite static shadow maps prevent
    // light leaking across the bathroom wall and preserve furniture occlusion.
    // Stable authored slots keep the same shadow map as the visitor crosses the room.
    this.activeGuestRoom=activeRoom?this.guestRooms.find(r=>r.roomId===activeRoom&&r.pose===activePose):null;
    this.fixtureControls.setActive(this.activeGuestRoom);
    const nearest=this.anchors.filter(a=>a.roomId===activeRoom&&a.entityId===activePose?.entityId).slice(0,3);
    const night=1-THREE.MathUtils.smoothstep(sunElevationDegrees,-4,12);
    this.lights.forEach((light,i)=>{
      const anchor=nearest[i];
      light.visible=Boolean(anchor);light.castShadow=Boolean(anchor);
      light.color.set(0xffdfb3);light.distance=4.2;light.angle=Math.PI*.38;light.penumbra=.65;light.shadow.normalBias=.012;light.shadow.radius=1;
      // Authored lamp power is independent of visitor position; attenuation is
      // already evaluated physically from each light to the shaded surface.
      light.intensity=anchor?anchor.intensity*this.fixtureControls.power(this.activeGuestRoom.id,night):0;
      if(anchor){
        if(light.userData.anchor!==anchor.entityId+":"+anchor.roomId+":"+anchor.position.toArray().join(",")){
          light.position.copy(anchor.position);light.target.position.copy(anchor.target);
          light.target.updateMatrixWorld();light.shadow.needsUpdate=true;
          light.userData.anchor=anchor.entityId+":"+anchor.roomId+":"+anchor.position.toArray().join(",");
        }
      }
    });
    this.daylight=THREE.MathUtils.smoothstep(sunElevationDegrees,-6,15);
    this.updateOpeningLight();
  }
  updateOpeningLight(){
    let occupied=null;
    for(const item of this.pastoralPoses){
      const {pose,asset}=item,dx=this._camera.x-pose.x,dz=this._camera.z-pose.z,c=Math.cos(pose.rot),s=Math.sin(pose.rot);
      const x=(c*dx-s*dz)/pose.scale.x,z=(s*dx+c*dz)/pose.scale.z,y=(this._camera.y-pose.y)/pose.scale.y,f=asset.floor;
      const inside=f.shape==="circle"?Math.hypot(x,z)<f.radius:x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1;
      if(inside&&y>0&&y<roomCeilingHeight(asset,x,z)){occupied=item;break;}
    }
    const doorOpen=occupied?this.doorOpenness?.(occupied.id)??1:1;
    this.indirect.setRoom(occupied||this.activeGuestRoom,this.daylight,this.sunLighting,occupied?[]:this.lights,doorOpen);
    if(!occupied)return;
    this.portalLights.forEach((light,i)=>{
      const opening=occupied?.asset.openings[i];
      const doorFraction=opening?.kind==="door"?this.indirect.field.doorFraction:1;
      light.visible=Boolean(opening)&&this.daylight>.001&&doorFraction>0;light.castShadow=light.visible;light.intensity=0;
      light.color.set(0xd4e3ee);light.penumbra=.8;light.shadow.normalBias=.004;light.shadow.radius=2.25;
      if(!opening)return;
      const {pose,id,asset}=occupied,key=id+":"+i,sample=openingLightSample(opening,pose),f=asset.floor;
      light.angle=sample.angle;
      light.distance=Math.hypot((f.shape==="circle"?f.radius*2:f.x1-f.x0)*pose.scale.x,
        (f.shape==="circle"?f.radius*2:f.z1-f.z0)*pose.scale.z,3*pose.scale.y)+1;
      if(light.userData.anchor!==key){
        light.position.copy(transform(pose,...sample.position));
        light.target.position.copy(transform(pose,...sample.target));
        light.target.updateMatrixWorld();light.shadow.needsUpdate=true;light.userData.anchor=key;
      }
      light.intensity=sample.intensity*this.daylight*doorFraction;
      // Closing a real door changes every portal shadow, including window/crown
      // paths to the leaf. Static 512 maps only refresh while its pose changes.
      if(this.lastDoorOpen!==doorOpen)light.shadow.needsUpdate=true;
    });
    this.lastDoorOpen=doorOpen;
  }
  dispose(){this.fixtureControls.dispose();this.indirect.dispose();for(const light of this.lights)light.shadow.dispose();this.group.removeFromParent();this.group.clear();this.lights.length=0;}
}
