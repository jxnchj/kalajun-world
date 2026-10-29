import {GUEST_DOORS41,guestDoorsEnabled41,guestDoorEntry41} from './guest-doors41.js';
import * as THREE from "three";
import {BOARDWALK_CABIN,BOARDWALK_YURT} from "./boardwalk-endpoints.js";
import {boardwalkTimberEnabled} from "./boardwalk-timber.js";
import {LODGE_DOOR,lodgeDoorEnabled} from "./lodge-door.js";
import {clearThresholdStones} from "./threshold-stones.js";
import {preserveAssetOcclusion} from "./asset-occlusion.js";
import {createStructureDepth} from "./room-shadow.js";

// Coarse spatial bins bound submission without multiplying draw calls for the
// very small original door meshes; nearby shadow reach uses individual leaves.
const TILE_SIZE=4096,SHADOW_DISTANCE=350;
const ASSETS=new Set(["house_a","yurt"]),UP=new THREE.Vector3(0,1,0);
const matrixForPose=pose=>new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(UP,pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));
// Original authored hinges and full door meshes. This is articulation, not a
// character controller: an optional collision guard owns rotational sweep checks.
export class WorldDoors {
 constructor({document:doc=globalThis.document,eventTarget=globalThis.window,lodgeDoor=lodgeDoorEnabled(),boardwalkDoors=boardwalkTimberEnabled(),guestDoors=guestDoorsEnabled41()}={}){
  this.guestDoors=guestDoors;this.lodgeDoor=lodgeDoor;this.boardwalkDoors=boardwalkDoors;
  this.group=new THREE.Group();this.group.name="world-v2-doors";this.templates=new Map();this.entries=new Map();this.leaves=[];this.geometries=new Set();this.depths=new Map();this.active=null;this.disposed=false;this._matrix=new THREE.Matrix4();this._rotation=new THREE.Matrix4();this._point=new THREE.Vector3();this._forward=new THREE.Vector3();
  this.stats={ready:false,entries:0,leaves:0,triangles:0,batches:0,moving:0,revision:0,active:null};
  const panel=doc?.querySelector("#world-panel details");
  if(panel){
   this.button=doc.createElement("button");this.button.id="door-switch";this.button.type="button";this.button.hidden=true;this.button.style.cssText="border:0;border-top:1px solid #ffffff26;background:none;padding:12px 0;width:100%;text-align:left;font-size:11px;margin-top:12px";this.button.setAttribute("aria-keyshortcuts","F");this.button.title="靠近门口开关门（F）；步行时门会在身体阻挡处停下";this.button.addEventListener("click",()=>this.toggle());panel.insertBefore(this.button,panel.querySelector("#map-toggle"));
  }
  this.eventTarget=eventTarget;this.onKey=e=>{if(e.code!=="KeyF"||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target?.isContentEditable||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target?.tagName??""))return;if(this.active){e.preventDefault();this.toggle();}};eventTarget?.addEventListener("keydown",this.onKey);
 }
 captureAsset(assetId,scene,materialFor){
  if(!(this.guestDoors&&assetId===GUEST_DOORS41.assetId)&&!ASSETS.has(assetId)&&!(this.lodgeDoor&&assetId===LODGE_DOOR.assetId)&&!(this.boardwalkDoors&&[BOARDWALK_CABIN.assetId,BOARDWALK_YURT.assetId].includes(assetId)))return 0;if(this.disposed)throw new Error("Doors disposed");if(this.templates.has(assetId))throw new Error("Door asset already captured");
  const threshold=clearThresholdStones(assetId,scene);this.stats.thresholdStones??={moved:0,triangles:0,assets:[]};this.stats.thresholdStones.moved+=threshold.moved;this.stats.thresholdStones.triangles+=threshold.triangles;this.stats.thresholdStones.assets.push(threshold);
  scene.updateMatrixWorld(true);const hinges=[];scene.traverse(node=>{if(new RegExp("^"+assetId+"_door\\d+(_out)?$").test(node.name)&&!(assetId===GUEST_DOORS41.assetId&&node.name.endsWith("door0")))hinges.push(node);});
  const templates=[];
  if(assetId===LODGE_DOOR.assetId&&(hinges.length!==1||hinges[0].name!==LODGE_DOOR.name||hinges[0].position.distanceTo(new THREE.Vector3(...LODGE_DOOR.hinge))>1e-6))throw Error("Authored lodge hinge changed; inspect source before articulation");
  if(assetId===BOARDWALK_CABIN.assetId&&(hinges.length!==1||hinges[0].name!==BOARDWALK_CABIN.name||hinges[0].position.distanceTo(new THREE.Vector3(...BOARDWALK_CABIN.hinge))>1e-6))throw Error("Authored boardwalk cabin hinge changed; inspect source before articulation");
  if(assetId===BOARDWALK_YURT.assetId&&(hinges.length!==2||BOARDWALK_YURT.hinges.some(expected=>{const hinge=hinges.find(h=>h.name===expected.name);return !hinge||hinge.position.distanceTo(new THREE.Vector3(...expected.position))>1e-6;})))throw Error("Authored boardwalk yurt hinges changed; inspect source before articulation");
  if(assetId===GUEST_DOORS41.assetId&&(hinges.length!==3||GUEST_DOORS41.hinges.some((p,i)=>{const h=hinges.find(h=>h.name===`gh_lanchuan_door${i+1}`);return !h||h.position.distanceTo(new THREE.Vector3(...p))>1e-6||Math.abs(new THREE.Euler().setFromQuaternion(h.quaternion,"YXZ").y-GUEST_DOORS41.open)>1e-6;})))throw Error("Guest source hinges or initial poses changed");
  for(const hinge of hinges){
   const inverse=hinge.matrixWorld.clone().invert(),parts=[],bounds=new THREE.Box3();
   hinge.traverse(node=>{if(!node.isMesh)return;if(node.isSkinnedMesh)throw new Error("Unexpected skinned door");const geometry=node.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));preserveAssetOcclusion(geometry,true);geometry.computeBoundingBox();geometry.computeBoundingSphere();this.geometries.add(geometry);bounds.union(geometry.boundingBox);const material=Array.isArray(node.material)?node.material.map(materialFor):materialFor(node.material);parts.push({geometry,material,name:node.name});});
   if(!parts.length)continue;
   if(assetId===GUEST_DOORS41.assetId&&parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0)!==96)throw Error("Guest original door detail changed");
   const angle=new THREE.Euler().setFromQuaternion(hinge.quaternion,"YXZ").y;
   // Replacement assets already author their initial open pose, including the
   // two opposite yurt leaves. Never infer a sign from world-facing direction.
   const open=assetId===LODGE_DOOR.assetId?LODGE_DOOR.open:Math.abs(angle)>.2?angle:(/_out$/.test(hinge.name)?-1:1)*Math.sign(bounds.min.x+bounds.max.x)*1.75;
   const base=new THREE.Matrix4().multiplyMatrices(hinge.parent.matrixWorld,new THREE.Matrix4().makeTranslation(...hinge.position.toArray()));
   templates.push({name:hinge.name,base,scale:hinge.scale.clone(),parts,bounds,initial:angle,open});hinge.removeFromParent();
  }
  this.templates.set(assetId,templates);return templates.length;
 }
 place(world){
  if(this.disposed)throw new Error("Doors disposed");if(this.stats.ready)throw new Error("Doors already placed");
  for(const [assetId,templates] of this.templates){
   if(assetId===LODGE_DOOR.assetId&&world.entities.some(e=>e.assetId===assetId&&e.id!==LODGE_DOOR.entityId))throw Error("Lodge door candidate only supports the authored representative building");
   if(assetId===GUEST_DOORS41.assetId&&world.entities.some(e=>e.assetId===assetId&&e.id!==GUEST_DOORS41.entityId))throw Error("Guest articulation supports only source-bound representative building");
   const bins=new Map();
   for(const entity of world.entities.filter(e=>e.assetId===assetId&&!e.part)){const pose=world.surface.buildingPose(entity),key=Math.floor(pose.x/TILE_SIZE)+","+Math.floor(pose.z/TILE_SIZE);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(entity);}
   for(const [tile,entities] of bins)for(const template of templates){
    const meshes=template.parts.map(part=>{
     const mesh=new THREE.InstancedMesh(part.geometry,part.material,entities.length);mesh.name="door/"+tile+"/"+template.name+"/"+part.name;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=!part.material.transparent&&!part.material.userData.lodgeThinGlass;mesh.receiveShadow=true;mesh.userData={entityIds:entities.map(e=>e.id),activeEntityIds:entities.map(e=>e.id),dynamicDoor:true,tile,shadowBounds:[]};
     // Authored doors use single material meshes; keep groups for future assets.
     if(!Array.isArray(part.material)){if(!this.depths.has(part.material))this.depths.set(part.material,createStructureDepth(part.material));mesh.customDepthMaterial=this.depths.get(part.material);}
     mesh.boundingBox=new THREE.Box3();this.group.add(mesh);this.stats.triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3*entities.length;return mesh;
    });
    entities.forEach((entity,index)=>{
     const pose=world.surface.buildingPose(entity),building=matrixForPose(pose),base=new THREE.Matrix4().multiplyMatrices(building,template.base),leaf={entityId:entity.id,index,template,meshes,base,angle:template.initial,target:template.initial};
     const routeDoor=[BOARDWALK_CABIN,BOARDWALK_YURT].find(r=>r.assetId===assetId),interactive=!routeDoor||entity.id===routeDoor.entityId;
     const guestIndex=assetId===GUEST_DOORS41.assetId?Number(template.name.match(/door(\d+)$/)[1]):null,entryId=guestIndex?guestDoorEntry41(entity.id,guestIndex):entity.id;
     if(interactive&&!this.entries.has(entryId))this.entries.set(entryId,{id:entryId,assetId,name:guestIndex?`岚川客房 ${guestIndex} 房门`:assetId===LODGE_DOOR.assetId?"岚川公共楼正门":assetId===BOARDWALK_CABIN.assetId?"坡上小木屋门":assetId.startsWith("yurt")?"毡房门":"木屋门",leaves:[],center:new THREE.Vector3(),target:Math.abs(template.initial)>.2});
     // Shared static templates omit the captured leaf. Other cabin instances
     // retain that original leaf at its original pose, without new interaction.
     if(interactive){this.entries.get(entryId).leaves.push(leaf);this.leaves.push(leaf);}this.writeLeaf(leaf);
     // Rotation-invariant envelope prevents frustum/shadow bounds going stale
     // while the leaf rotates. Geometry and normals keep full original detail.
     const b=template.bounds,radius=Math.hypot(Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),Math.max(Math.abs(b.min.y),Math.abs(b.max.y)),Math.max(Math.abs(b.min.z),Math.abs(b.max.z)))*Math.max(pose.scale.x,pose.scale.y,pose.scale.z)*Math.max(...template.scale.toArray());
     const center=new THREE.Vector3().setFromMatrixPosition(base),box=new THREE.Box3(center.clone().addScalar(-radius),center.clone().addScalar(radius));const sphere=new THREE.Sphere(center,radius);for(const mesh of meshes){mesh.boundingBox.union(box);mesh.userData.shadowBounds.push(sphere);}
    });
    for(const mesh of meshes){mesh.boundingSphere=mesh.boundingBox.getBoundingSphere(new THREE.Sphere());mesh.instanceMatrix.needsUpdate=true;}
   }
  }
  for(const entry of this.entries.values()){
   for(const leaf of entry.leaves){const center=leaf.template.bounds.getCenter(new THREE.Vector3()).multiply(leaf.template.scale).applyMatrix4(leaf.base);entry.center.add(center);}entry.center.divideScalar(entry.leaves.length);
  }
  Object.assign(this.stats,{ready:true,entries:this.entries.size,leaves:this.leaves.length,batches:this.group.children.length});this.group.updateMatrixWorld(true);
 }
 writeLeaf(leaf){this._matrix.copy(leaf.base).multiply(this._rotation.makeRotationY(leaf.angle)).scale(leaf.template.scale);for(const mesh of leaf.meshes){mesh.setMatrixAt(leaf.index,this._matrix);mesh.instanceMatrix.needsUpdate=true;}}
 angles(entityId){const entry=this.entries.get(entityId);return entry?entry.leaves.map(leaf=>({name:leaf.template.name,angle:leaf.angle,open:leaf.template.open})):null;}
 openness(entityId){const entry=this.entries.get(entityId);return entry?entry.leaves.reduce((sum,leaf)=>sum+Math.min(1,Math.abs(leaf.angle)/(Math.PI/2)),0)/entry.leaves.length:1;}
 toggle(entityId=this.active?.id){const entry=this.entries.get(entityId);if(!entry)return false;entry.target=!entry.target;for(const leaf of entry.leaves){leaf.target=entry.target?leaf.template.open:0;leaf.blocked=false;}this.render();return true;}
 update(camera,dt=0){
  if(!this.stats.ready||this.disposed)return;let moving=0,changed=0;const step=Math.min(.1,Math.max(0,dt))*1.9;
  for(const leaf of this.leaves){const delta=leaf.target-leaf.angle;if(Math.abs(delta)<1e-9){leaf.blocked=false;continue;}moving++;if(step){const next=leaf.angle+Math.sign(delta)*Math.min(Math.abs(delta),step);if(this.motionGuard&&!this.motionGuard(leaf,next)){this.stats.blocked=(this.stats.blocked??0)+1;leaf.blocked=true;continue;}leaf.blocked=false;leaf.angle=next;this.writeLeaf(leaf);changed++;}}
  this.stats.moving=step?changed:moving;this.stats.pending=moving;if(changed)this.stats.revision++;
  if(camera){camera.getWorldPosition(this._point);camera.getWorldDirection(this._forward);
   // Same shadow reach as the static building path, now local to each tile.
   this.stats.shadowBatches=0;for(const mesh of this.group.children){mesh.castShadow=!mesh.material.transparent&&!mesh.material.userData.lodgeThinGlass&&mesh.userData.shadowBounds.some(sphere=>sphere.distanceToPoint(this._point)<=SHADOW_DISTANCE);if(mesh.castShadow)this.stats.shadowBatches++;}
   let candidate=null,best=3;
   for(const entry of this.entries.values()){const x=entry.center.x-this._point.x,y=entry.center.y-this._point.y,z=entry.center.z-this._point.z,distance=Math.hypot(x,y,z);if(distance<best&&x*this._forward.x+y*this._forward.y+z*this._forward.z>distance*.1){candidate=entry;best=distance;}}
   if(candidate!==this.active){this.active=candidate;this.render();}
  }
  this.stats.active=this.active?{id:this.active.id,name:this.active.name,target:this.active.target?"open":"closed",openness:this.openness(this.active.id),...this.state(this.active)}:null;this.render();
 }
 state(entry){const pending=entry.leaves.some(leaf=>Math.abs(leaf.target-leaf.angle)>1e-9),blocked=pending&&entry.leaves.some(leaf=>leaf.blocked),position=entry.leaves.every(leaf=>Math.abs(leaf.angle)<1e-9)?"closed":entry.leaves.every(leaf=>Math.abs(leaf.angle-leaf.template.open)<1e-9)?"open":"partial";return{position,pending,blocked};}
 render(){if(!this.button)return;this.button.hidden=!this.active;if(this.active){const {pending,blocked,position}=this.state(this.active),opening=this.active.target;
  const action=blocked?(opening?"开门受阻，请后退留出空间 · F 取消":"关门受阻，请离开门道 · F 重新开门"):pending?(opening?"正在开门 · F 改为关门":"正在关门 · F 重新开门"):position==="closed"?"已关闭 · 开门 F":"已打开 · 关门 F";
  const text=this.active.name+" · "+action;if(this.button.textContent!==text){this.button.textContent=text;this.button.setAttribute("aria-label",text);this.button.title=blocked?"留出空间后门会自动继续；无需再次按 F":"靠近门口开关门（F）；步行时门会在身体阻挡处停下";}
 }}
 dispose(){if(this.disposed)return;this.disposed=true;this.eventTarget?.removeEventListener("keydown",this.onKey);this.button?.remove();for(const mesh of this.group.children)mesh.dispose();for(const geometry of this.geometries)geometry.dispose();for(const depth of this.depths.values())depth.dispose();this.group.removeFromParent();this.group.clear();this.entries.clear();this.templates.clear();this.leaves.length=0;this.active=null;this.stats.ready=false;}
}
