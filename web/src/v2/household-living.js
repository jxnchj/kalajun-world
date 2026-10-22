import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadWorldGLB} from './glb-transport.js';
import {preserveAssetOcclusion} from './asset-occlusion.js';
import {createStructureDepth} from './room-shadow.js';

export const HOUSEHOLD_LIVING = Object.freeze({version:'household-living-32',url:'v2/household_living.glb',styles:['门廊饮茶','手作与收纳','晾晒与织物']});
export function householdStyle(id){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%3;}
const houses=world=>(world.entities||[]).filter(e=>e.assetId==='house_a'&&!e.part);
const poseMatrix=pose=>new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));
const tri=g=>(g.index?.count??g.attributes.position.count)/3;
export function householdViewpoints(world){
 const list=houses(world),reference=list.find(e=>e.id==='cabins:-1743,3612:30f9adc9fb584805')||list[0];if(!reference)return [];
 const rp=world.surface.buildingPose(reference);
 return HOUSEHOLD_LIVING.styles.flatMap((label,style)=>{
  const entity=list.filter(e=>householdStyle(e.id)===style).sort((a,b)=>{const p=world.surface.buildingPose(a),q=world.surface.buildingPose(b);return Math.hypot(p.x-rp.x,p.z-rp.z)-Math.hypot(q.x-rp.x,q.z-rp.z)||a.id.localeCompare(b.id);})[0];if(!entity)return [];
  const pose=world.surface.buildingPose(entity),m=poseMatrix(pose),p=new THREE.Vector3(-4.5,1.9,7.4).applyMatrix4(m),target=new THREE.Vector3(-1.6,.6,3.8).applyMatrix4(m);p.y=Math.max(p.y,world.surface.heightAt(p.x,p.z)+1.65);const d=target.sub(p);
  return [{id:'household-'+style,name:label+' · 木屋',category:'牧居生活',entityId:entity.id,householdStyle:style,x:p.x,y:p.y,z:p.z,above:p.y-world.surface.heightAt(p.x,p.z),yaw:Math.atan2(d.x,-d.z)*180/Math.PI,pitch:Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI}];
 });
}

// Each household keeps its original complete house/porch. These are additive,
// stable usage sets, not palette randomness or replacements for existing detail.
export class HouseholdLiving {
 constructor(world){this.world=world;this.group=new THREE.Group();this.group.name='household-living';this.templates=new Map();this.batches=[];this.geometries=new Set();this.depths=new Set();this.stats={version:HOUSEHOLD_LIVING.version,status:'idle',households:0,styleCounts:[0,0,0],sourceTriangles:0,instanceTriangles:0,batches:0,newMaterials:0,newTextures:0,visibleBatches:0,visibleTriangles:0};}
 async load(structures,{loadAsset=loadWorldGLB}={}){
  this.stats.status='loading';const entries=houses(this.world);if(!entries.length){this.stats.status='ready';return this;}
  const loader=new GLTFLoader(),base=(this.world.assetBase||'./assets/').replace(/\/?$/,'/');
  const started=performance.now(),gltf=await loadAsset(base+HOUSEHOLD_LIVING.url,loader);this.stats.loadMs=performance.now()-started;gltf.scene.updateMatrixWorld(true);
  const sources=new Set(),sourceMaterials=new Set();
  try{gltf.scene.traverse(node=>{
   if(!node.isMesh)return;const style=node.userData.householdStyle,origin=node.userData.householdOrigin,sourceMaterial=node.userData.sourceMaterial;
   if(!Number.isInteger(style)||style<0||style>2||!Array.isArray(origin))throw new Error('Invalid household asset metadata: '+node.name);
   const material=structures.materials.find(m=>m.userData.sourceMaterialNames?.includes(sourceMaterial));
   if(!material)throw new Error('Household canonical PBR material missing: '+sourceMaterial);
   const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);geometry.translate(-origin[0],-origin[2],origin[1]);preserveAssetOcclusion(geometry,true);geometry.computeBoundingBox();geometry.computeBoundingSphere();this.geometries.add(geometry);sources.add(node.geometry);sourceMaterials.add(node.material);
   const part={geometry,material,role:'body',names:[node.name],triangles:tri(geometry)};if(!this.templates.has(style))this.templates.set(style,[]);this.templates.get(style).push(part);this.stats.sourceTriangles+=part.triangles;
  });}finally{gltf.scene.traverse(node=>{if(node.isMesh){sources.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])sourceMaterials.add(m);}});for(const g of sources)g.dispose();for(const m of sourceMaterials)m.dispose();}
  if(this.templates.size!==3)throw new Error('Household asset must contain all three complete usage sets');
  const bins=new Map();
  for(const entity of entries){const pose=this.world.surface.buildingPose(entity),style=householdStyle(entity.id),tx=Math.floor(pose.x/256),tz=Math.floor(pose.z/256),key=style+':'+tx+','+tz;this.stats.styleCounts[style]++;this.stats.households++;
   if(!bins.has(key))bins.set(key,{style,tx,tz,records:[]});bins.get(key).records.push({id:entity.id,pose});
  }
  const depthMap=new Map();
  for(const bin of bins.values())for(const part of this.templates.get(bin.style)){
   const mesh=new THREE.InstancedMesh(part.geometry,part.material,bin.records.length);mesh.name='household/'+bin.style+'/'+bin.tx+','+bin.tz+'/'+part.material.name;mesh.position.set(bin.tx*256,0,bin.tz*256);mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.receiveShadow=true;
   bin.records.forEach(({pose},i)=>mesh.setMatrixAt(i,poseMatrix({...pose,x:pose.x-bin.tx*256,z:pose.z-bin.tz*256})));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
   if(!depthMap.has(part.material)){const depth=createStructureDepth(part.material);depthMap.set(part.material,depth);this.depths.add(depth);}mesh.customDepthMaterial=depthMap.get(part.material);
   mesh.userData={householdStyle:bin.style,entityIds:bin.records.map(r=>r.id),activeEntityIds:bin.records.map(r=>r.id),detailRole:'body',sourceMeshes:part.names};this.group.add(mesh);this.batches.push({mesh,triangles:part.triangles*bin.records.length,worldBounds:mesh.boundingBox.clone().translate(mesh.position)});this.stats.instanceTriangles+=part.triangles*bin.records.length;
  }
  this.stats.batches=this.batches.length;this.stats.prepareMs=performance.now()-started-this.stats.loadMs;this.stats.status='ready';return this;
 }
 partsFor(entity){return entity.assetId==='house_a'&&!entity.part?this.templates.get(householdStyle(entity.id))||[]:[];}
 update(camera,frustum){let visible=0,triangles=0;for(const b of this.batches){b.mesh.castShadow=b.worldBounds.distanceToPoint(camera.position)<=350;if(frustum.intersectsBox(b.worldBounds)){visible++;triangles+=b.triangles;}}this.stats.visibleBatches=visible;this.stats.visibleTriangles=triangles;}
 dispose(){for(const b of this.batches)b.mesh.dispose();for(const g of this.geometries)g.dispose();for(const d of this.depths)d.dispose();this.batches=[];this.geometries.clear();this.depths.clear();this.templates.clear();this.group.removeFromParent();this.group.clear();this.stats.status='disposed';}
}
