import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {clone as cloneSkeleton} from "three/addons/utils/SkeletonUtils.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";

// First living-pasture migration: the original Blender-rigged sheep and authored
// clips, shaded by v2's physical environment. No procedural replacement animals.
export const PASTURE_SHEEP_COUNT=12;
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0), RADIUS=11;
const rand=(a,b=0)=>{let n=Math.imul(a+7919*b,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
function distanceToSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],dd=dx*dx+dz*dz,t=dd?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/dd,0,1):0;return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
export function pastureGroundAllowed(world,x,z){
 const lc=world.landcoverAt(x,z),n=world.surface.normalAt(x,z,1),water=world.hydrology?.sampleAt(x,z);
 if(lc.r>.12||lc.g>.3||lc.b>.1||n.y<.955||water?.insideWater||(water?.wetness??0)>.12)return false;
 if(world.entities.some(e=>Math.hypot(e.x-x,e.z-z)<Math.max(16,Math.hypot(e.scale?.x??1,e.scale?.z??1)*6)))return false;
 for(const kind of ["tracks","paths","boardwalks","fences"])
  for(const line of world.objects[kind]||[])for(let j=1;j<line.pts.length;j++)
   if(distanceToSegment(x,z,line.pts[j-1],line.pts[j])<(line.width??1.5)/2+2)return false;
 return Number.isFinite(world.surface.heightAt(x,z));
}
export function selectPasture(world){
 const anchor=world.entities.find(e=>e.id===SETTLEMENT_ASSETS.yurt.representativeId);
 if(!anchor)throw new Error("Pasture requires the existing representative pastoral yurt");
 // Historical pastoral entity is the anchor, not a claim that a photographed
 // flock occupied this exact patch. Preserve all authored placement and plants.
 for(let ring=0;ring<9;ring++)for(let a=0;a<32;a++){
  const angle=(a/32+.137)*TAU,r=65+ring*24,x=anchor.x+Math.sin(angle)*r,z=anchor.z+Math.cos(angle)*r;
  let valid=pastureGroundAllowed(world,x,z);
  for(let j=0;j<16&&valid;j++)valid=pastureGroundAllowed(world,x+Math.sin(j/16*TAU)*(RADIUS+3),z+Math.cos(j/16*TAU)*(RADIUS+3));
  if(!valid)continue;
  const members=[];
  for(let k=1;k<400&&members.length<PASTURE_SHEEP_COUNT;k++){
   const a=rand(k,1)*TAU,r=Math.sqrt(rand(k,2))*(RADIUS-2),px=x+Math.sin(a)*r,pz=z+Math.cos(a)*r;
   if(!pastureGroundAllowed(world,px,pz)||members.some(m=>Math.hypot(m.x-px,m.z-pz)<2.35))continue;
   members.push({x:px,z:pz,yaw:rand(k,3)*TAU,size:.9+rand(k,4)*.2,seed:k});
  }
  if(members.length!==PASTURE_SHEEP_COUNT)continue;
  // Keep the accepted flock selection stable when refining its observation point.
  if(!pastureGroundAllowed(world,x+15,z+20))continue;
  const vx=x+9,vz=z+12;
  if(!pastureGroundAllowed(world,vx,vz))continue;
  return {x,z,radius:RADIUS,anchorId:anchor.id,members,viewpoint:{id:"pasture-sheep",name:"牧居草场 · 羊群",category:"牧居生活",x:vx,z:vz,above:1.9,yaw:Math.atan2(x-vx,vz-z)*180/Math.PI,pitch:-7}};
 }
 throw new Error("No safe open pasture found near the representative yurt; refusing to place animals in water, forest or buildings");
}
function disposeAsset(root){
 const geometry=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 root?.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 for(const g of geometry)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const s of skeletons)s.dispose();
 const images=new Set([...textures].map(t=>t.source?.data));for(const image of images)image?.close?.();
}
export class WorldPasture{
 constructor(world,{loader=new GLTFLoader()}={}){
  this.world=world;this.loader=loader;this.layout=selectPasture(world);this.viewpoint=this.layout.viewpoint;
  this.group=new THREE.Group();this.group.name="world-pasture";this.materials=[];this.animals=[];this.disposed=false;this.elapsed=0;
  this.stats={ready:false,count:0,planned:PASTURE_SHEEP_COUNT,triangles:0,source:"assets/sheep.glb",quality:"original lod0 with original normal/basecolor maps",anchorId:this.layout.anchorId,center:{x:this.layout.x,z:this.layout.z},elapsed:0,states:{}};
  this._normal=new THREE.Vector3();this._yaw=new THREE.Quaternion();
 }
 load(){
  if(this.disposed)return Promise.reject(new Error("Pasture is disposed"));
  if(this._load)return this._load;
  this._load=this.loader.loadAsync(this.world.assetBase+"sheep.glb").then(gltf=>{
   if(this.disposed){disposeAsset(gltf.scene);return this;}
   this.asset=gltf.scene;
   const source=gltf.scene.getObjectByName("lod0"),rig=gltf.scene.getObjectByName("rig");
   if(!source?.isSkinnedMesh||!rig?.userData.clips)throw new Error("Original sheep rig or highest-detail mesh missing");
   this.clipMeta=JSON.parse(rig.userData.clips);this.clips=new Map(gltf.animations.map(c=>[c.name,c]));
   for(const name of ["graze","look","walk_graze","lie","lie_down","get_up"])if(!this.clips.has(name))throw new Error("Sheep clip missing: "+name);
   const meshCopies=[];gltf.scene.traverse(o=>{if(o.isMesh&&o!==source)meshCopies.push(o);});
   // Retain original loaded resources for ownership/disposal, but clone a rig
   // with only its full-resolution render mesh. No overlapping LOD shells.
   const removed=meshCopies.map(o=>({o,parent:o.parent}));for(const {o} of removed)o.removeFromParent();
   const material=source.material.clone();material.vertexColors=false; // COLOR_0 is coat-region metadata, not RGB.
   material.name="pasture-sheep-original-physical";this.materials.push(material);
   const originalMaterial=source.material;source.material=material;
   try{this.layout.members.forEach((member,index)=>{
    const root=cloneSkeleton(gltf.scene),mesh=root.getObjectByName("lod0");root.name="pasture-sheep-"+index;mesh.castShadow=mesh.receiveShadow=true;
    // All authored gait/lying poses stay inside this local envelope; frustum
    // culling only skips offscreen animals and never substitutes lower detail.
    mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.55,0),1.6);mesh.frustumCulled=true;
    root.scale.setScalar(member.size);this.group.add(root);
    const mixer=new THREE.AnimationMixer(root),actions=new Map();
    for(const [name,clip] of this.clips){const action=mixer.clipAction(clip);if(!this.clipMeta[name].loop){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}actions.set(name,action);}
    const state=index<2?"lie":index<5?"look":"graze",animal={...member,root,mesh,mixer,actions,state,phase:0,remaining:6+rand(index+1,8)*16,transitions:0,clip:state,tx:member.x,tz:member.z};
    const action=actions.get(state);action.play();action.time=rand(index+1,9)*this.clips.get(state).duration;mixer.update(0);
    this.animals.push(animal);this.place(animal);
   });}finally{source.material=originalMaterial;for(const {o,parent} of removed)parent.add(o);}
   this.stats.ready=true;this.stats.count=this.animals.length;this.stats.triangles=(source.geometry.index?.count??source.geometry.attributes.position.count)/3*this.animals.length;this.update(null,0);return this;
  }).catch(error=>{this.stats.error=error.message;this.dispose();throw error;});
  return this._load;
 }
 place(animal){
  const {x,z,yaw,size,root}=animal,n=this.world.surface.normalAt(x,z,.6);
  this._normal.set(n.x,n.y,n.z).normalize();root.quaternion.setFromUnitVectors(UP,this._normal).multiply(this._yaw.setFromAxisAngle(UP,yaw));
  // Model authored with hoof soles at y=0; use local slope, not a horizontal
  // translation. Tiny clearance avoids numerical terrain/hoof z fighting.
  root.position.set(x,this.world.surface.heightAt(x,z)+.012*size,z);
 }
 setClip(animal,name){
  if(name===animal.clip)return;const old=animal.actions.get(animal.clip),next=animal.actions.get(name);
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();old.crossFadeTo(next,.4,false);animal.clip=name;animal.phase=0;
 }
 choose(animal){
  const k=++animal.transitions+animal.seed*67,u=rand(k,12);
  if(u<.58){
   for(let j=0;j<8;j++){
    const angle=rand(k,j+30)*TAU,r=1.3+rand(k,j+50)*2.5,x=animal.x+Math.sin(angle)*r,z=animal.z+Math.cos(angle)*r;
    if(Math.hypot(x-this.layout.x,z-this.layout.z)>this.layout.radius||!pastureGroundAllowed(this.world,x,z)||this.animals.some(other=>other!==animal&&Math.hypot(x-other.x,z-other.z)<1.5))continue;
    animal.tx=x;animal.tz=z;animal.state="walk";this.setClip(animal,"walk_graze");return;
   }
  }
  animal.state=u>.86?"lie_down":u>.65?"look":"graze";animal.remaining=7+rand(k,13)*15;this.setClip(animal,animal.state);
 }
 step(animal,dt){
  animal.phase+=dt;animal.remaining-=dt;
  if(animal.state==="walk"){
   const dx=animal.tx-animal.x,dz=animal.tz-animal.z,d=Math.hypot(dx,dz),want=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(want-animal.yaw),Math.cos(want-animal.yaw));
   // Turn while planting feet; translation and clip speed agree when moving.
   const rate=Math.max(0,Math.cos(turn)),speed=this.clipMeta.walk_graze.speed*animal.size*rate;
   animal.yaw+=turn*Math.min(1,dt*3);animal.actions.get("walk_graze").setEffectiveTimeScale(rate);
   const step=Math.min(d,speed*dt),x=animal.x+Math.sin(animal.yaw)*step,z=animal.z+Math.cos(animal.yaw)*step;
   if(d<.15||!pastureGroundAllowed(this.world,x,z)||this.animals.some(other=>other!==animal&&Math.hypot(x-other.x,z-other.z)<1.05)){
    animal.state="graze";animal.remaining=7+rand(animal.transitions,23)*12;this.setClip(animal,"graze");
   }else{animal.x=x;animal.z=z;this.place(animal);}
  }else if(animal.state==="lie_down"&&animal.phase>=this.clips.get("lie_down").duration){animal.state="lie";animal.remaining=22+rand(animal.seed,24)*18;this.setClip(animal,"lie");}
  else if(animal.state==="lie"&&animal.remaining<=0){animal.state="get_up";this.setClip(animal,"get_up");}
  else if(animal.state==="get_up"&&animal.phase>=this.clips.get("get_up").duration){animal.state="graze";animal.remaining=8;this.setClip(animal,"graze");}
  else if((animal.state==="graze"||animal.state==="look")&&animal.remaining<=0)this.choose(animal);
  animal.mixer.update(dt);
 }
 update(camera,dt){
  if(!this.stats.ready||this.disposed)return;
  const delta=Math.min(.25,Math.max(0,Number(dt)||0)),steps=Math.ceil(delta/.05);for(let i=0;i<steps;i++)for(const animal of this.animals)this.step(animal,delta/steps);
  this.elapsed+=delta;this.stats.elapsed=this.elapsed;this.stats.states={};for(const a of this.animals)this.stats.states[a.state]=(this.stats.states[a.state]||0)+1;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const animal of this.animals){animal.mixer.stopAllAction();animal.mixer.uncacheRoot(animal.root);animal.mesh.skeleton.dispose();}
  this.group.removeFromParent();this.group.clear();this.animals.length=0;this.materials.forEach(m=>m.dispose());disposeAsset(this.asset);this.materials.length=0;this.stats.ready=false;
 }
}
