import * as THREE from 'three';
import {householdYards} from './household-yards.js';
import {preserveAssetOcclusion} from './asset-occlusion.js';
import {createStructureDepth} from './room-shadow.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadWorldGLB} from './glb-transport.js';
import {householdEntryStepGeometry33} from './household-entry-legacy.js';
import {householdEntryShadowMode,validateClosedEntryGeometry,installClosedEntryShadow} from './household-entry-shadow.js';
// Corrected editable source and its entity-only GI are selected together.
// The local v35 merge still requires moving browser and low-sun acceptance.
// Keep the exact v33 rollback; closed-shadow remains independently opt-in.
export const householdEntryMode=()=>new URLSearchParams(globalThis.location?.search||'').get('householdEntry')==='v33'?'v33':'editable';

export const HOUSEHOLD_ENTRY_ASSET=Object.freeze({version:'household-entry-tea-34',url:'v2/household_entry_tea.glb',entityId:'cabins:-1972,3678:784f73bf0ba94d17',roomKey:'house_a-entry-tea-34'});

const cache=new WeakMap(),DEPTH=.36,RISE=.17,MAX_GROUND_RISE=.19;
const matrixFor=pose=>new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));
const at=(pose,x,z)=>({x:pose.x+Math.cos(pose.rot)*x*pose.scale.x+Math.sin(pose.rot)*z*pose.scale.z,z:pose.z-Math.sin(pose.rot)*x*pose.scale.x+Math.cos(pose.rot)*z*pose.scale.z});
// Existing GLB contract: full wooden tread spans x=.23..1.77, z=4.40..4.76,
// top=-.19. Add only the missing exterior ground connection, never replace it.
export function householdEntryStepRecipes(world){
 if(cache.has(world))return cache.get(world);
 const result=[];
 for(const house of householdYards(world).households){
  const entity=world.entities.find(e=>e.id===house.entityId),pose=world.surface.buildingPose(entity),ground=(x,z)=>{const p=at(pose,x,z);return (world.surface.heightAt(p.x,p.z)-pose.y)/pose.scale.y;},front=4.76,x0=.23,x1=1.77;
  const initialGround=Math.min(...[x0,1,x1].map(x=>ground(x,front+.035/pose.scale.z))),gap=(-.19-initialGround)*pose.scale.y,courses=[];
  if(gap>MAX_GROUND_RISE)for(let i=0;i<12;i++){
   const z0=front+i*DEPTH/pose.scale.z,z1=front+(i+1)*DEPTH/pose.scale.z,top=-.19-(i+1)*RISE/pose.scale.y;
   const bottom=Math.min(...[x0,1,x1].flatMap(x=>[z0,z1].map(z=>ground(x,z))))-.08/pose.scale.y;
   const finalGap=(top-Math.min(...[x0,1,x1].map(x=>ground(x,z1+.035/pose.scale.z))))*pose.scale.y;
   courses.push({x0,x1,z0,z1,top,bottom,groundRise:finalGap});
   if(finalGap<=MAX_GROUND_RISE)break;
  }
  result.push({...house,pose,existingTreadGap:gap,courses});
 }
 cache.set(world,result);return result;
}
export function householdEntryStepSegments(world){
 return householdEntryStepRecipes(world).flatMap(r=>r.courses.map((c,i)=>{const a=at(r.pose,1,c.z0),b=at(r.pose,1,c.z1);return {id:r.entityId+'/entry-stone/'+i,a:[a.x,a.z],b:[b.x,b.z],radius:(c.x1-c.x0)*r.pose.scale.x*.5+.04};}));
}
export function validateHouseholdEntrySource(meta,recipe){
 if(meta.entryVersion!==HOUSEHOLD_ENTRY_ASSET.version||meta.geometryRevision!=='front-bevel-17p111mm'||meta.entityId!==recipe.entityId||meta.sourceMaterial!=='stone')throw new Error('Invalid entity-specific entry source metadata');
 const expected=recipe.courses.flatMap(c=>['x0','x1','z0','z1','top','bottom'].map(k=>c[k]));
 if(!Array.isArray(meta.courseContract)||meta.courseContract.length!==expected.length||expected.some((v,i)=>!Number.isFinite(meta.courseContract[i])||Math.abs(v-meta.courseContract[i])>.003)||!Array.isArray(meta.instanceScale)||meta.instanceScale.length!==3||[recipe.pose.scale.x,recipe.pose.scale.y,recipe.pose.scale.z].some((v,i)=>!Number.isFinite(meta.instanceScale[i])||Math.abs(v-meta.instanceScale[i])>1e-6))throw new Error('Entry terrain/pose differs from authored source; rebuild rather than stretch stonework');
}
export class HouseholdEntrySteps{
 constructor(world){
  this.world=world;this.mode=householdEntryMode();this.shadowMode=householdEntryShadowMode(this.mode);this.group=new THREE.Group();this.group.name='household-entry-steps';this.parts=new Map();this.geometries=new Set();this.depth=null;this.shadowHandles=[];
  this.stats={version:this.mode==='editable'?HOUSEHOLD_ENTRY_ASSET.version:'household-entry-33',mode:this.mode,shadowMode:this.shadowMode,status:'idle',checked:0,households:0,courses:0,triangles:0,drawMeshes:0,newMaterials:0,newTextures:0,sites:[]};
 }
 async load(structures,{loadAsset=loadWorldGLB}={}){
  this.stats.status='loading';const recipes=householdEntryStepRecipes(this.world),active=recipes.filter(r=>r.courses.length);
  for(const recipe of recipes){this.stats.checked++;this.stats.sites.push({entityId:recipe.entityId,existingTreadGap:recipe.existingTreadGap,courses:recipe.courses.length,groundRise:recipe.courses.at(-1)?.groundRise??recipe.existingTreadGap});}
  if(!active.length){this.stats.drawMeshes=this.group.children.length;this.stats.status='ready';return this;}
  if(this.mode==='editable'&&(active.length!==1||active[0].entityId!==HOUSEHOLD_ENTRY_ASSET.entityId))throw new Error('Entry source is authored for one verified tea household only');
  const recipe=active[0],material=structures.materials.find(m=>m.userData.sourceMaterialNames?.includes('stone'));
  if(!material)throw new Error('Canonical stone PBR material missing for household entry');
  if(this.mode==='v33'){
   for(const recipe of active){
    const geometry=householdEntryStepGeometry33(recipe);this.geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.name=recipe.entityId+'/entry-steps';mesh.matrix.copy(matrixFor(recipe.pose));mesh.matrixAutoUpdate=false;mesh.castShadow=true;mesh.receiveShadow=true;this.depth??=createStructureDepth(material);mesh.customDepthMaterial=this.depth;mesh.userData={entityId:recipe.entityId,kind:'household-entry-steps'};
    this.group.add(mesh);const part={geometry,material,role:'body',names:[mesh.name],triangles:geometry.index.count/3};this.parts.set(recipe.entityId,[part]);this.stats.households++;this.stats.courses+=recipe.courses.length;this.stats.triangles+=part.triangles;
   }
   this.stats.drawMeshes=this.group.children.length;this.stats.status='ready';return this;
  }
  const loader=new GLTFLoader(),base=(this.world.assetBase||'./assets/').replace(/\/?$/,'/'),started=performance.now(),gltf=await loadAsset(base+HOUSEHOLD_ENTRY_ASSET.url,loader);
  this.stats.loadMs=performance.now()-started;gltf.scene.updateMatrixWorld(true);const sourceGeometries=new Set(),sourceMaterials=new Set();
  try{
   if(this.shadowMode==='closed'){let count=0;gltf.scene.traverse(node=>{if(node.isMesh)count++;});if(count!==1)throw new Error('Closed entry shadow requires the verified single complete mesh');}
   gltf.scene.traverse(node=>{
    if(!node.isMesh)return;const meta=node.userData;
    validateHouseholdEntrySource(meta,recipe);this.stats.geometryRevision=meta.geometryRevision??'initial-10mm';
    const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);preserveAssetOcclusion(geometry,true);geometry.computeBoundingBox();geometry.computeBoundingSphere();this.geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=recipe.entityId+'/entry-steps';mesh.matrix.copy(matrixFor(recipe.pose));mesh.matrixAutoUpdate=false;mesh.castShadow=true;mesh.receiveShadow=true;this.depth??=createStructureDepth(material);mesh.customDepthMaterial=this.depth;mesh.userData={entityId:recipe.entityId,kind:'household-entry-steps',sourceAsset:HOUSEHOLD_ENTRY_ASSET.url};
    if(this.shadowMode==='closed'){
     if(meta.geometryRevision!=='front-bevel-17p111mm')throw new Error('Closed entry shadow requires the verified corrected geometry revision');
     const handle=installClosedEntryShadow(mesh,validateClosedEntryGeometry(geometry));this.shadowHandles.push(handle);this.stats.closedShadow=handle.stats;
    }
    this.group.add(mesh);
    const part={geometry,material,role:'body',names:[node.name],triangles:(geometry.index?.count??geometry.attributes.position.count)/3};if(!this.parts.has(recipe.entityId))this.parts.set(recipe.entityId,[]);this.parts.get(recipe.entityId).push(part);this.stats.triangles+=part.triangles;
   });
  }finally{
   gltf.scene.traverse(node=>{if(node.isMesh){sourceGeometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])sourceMaterials.add(m);}});for(const g of sourceGeometries)g.dispose();for(const m of sourceMaterials)m.dispose();
  }
  if(!this.parts.size)throw new Error('Entry asset contains no complete stonework');this.stats.households=1;this.stats.courses=recipe.courses.length;this.stats.drawMeshes=this.group.children.length;this.stats.status='ready';return this;
 }
 partsFor(entity){return this.parts.get(entity.id)||[];}
 update(camera){for(const mesh of this.group.children)mesh.castShadow=Math.hypot(mesh.matrix.elements[12]-camera.position.x,mesh.matrix.elements[14]-camera.position.z)<350;}
 dispose(){for(const handle of this.shadowHandles)handle.dispose();this.shadowHandles.length=0;for(const g of this.geometries)g.dispose();this.depth?.dispose();this.geometries.clear();this.parts.clear();this.group.removeFromParent();this.group.clear();this.stats.status='disposed';}
}
