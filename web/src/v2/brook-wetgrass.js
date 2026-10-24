import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createPlantEnvelope,getShoreStoneField} from './shore-contact.js';
import {brookRenderedBankHeight,brookGrassIntersectsWater} from './brook-shoulder-grass.js';
const prototypes=new WeakMap(),originalFootprintPrototypes=new WeakMap();
function compactPrototype(source,kind,preserveFootprint=false){
 const cache=preserveFootprint?originalFootprintPrototypes:prototypes;
 if(cache.has(source))return cache.get(source);
 const g=source.clone(),p=g.attributes.position,groups=[];let start=0;
 const blades=kind==='basal'?40:24;
 for(let b=0;b<blades;b++){
  const segments=kind==='basal'?3:kind==='near'?5:b<8?2:1,count=(segments+1)*2;
  const x=(p.getX(start)+p.getX(start+1))*.5,z=(p.getZ(start)+p.getZ(start+1))*.5;
  for(let i=start;i<start+count;i++)p.setXYZ(i,p.getX(i)-x*(preserveFootprint?0:.62),p.getY(i),p.getZ(i)-z*(preserveFootprint?0:.62));
  groups.push({start,count,x:x*(preserveFootprint?1:.38),z:z*(preserveFootprint?1:.38)});start+=count;
 }
 if(start<p.count)groups.push({start,count:p.count-start,x:0,z:0});
 const result={geometry:g,groups};cache.set(source,result);return result;
}
// Each blade retains all vertices and its local height/curvature. Only its
// rooted base is compacted and vertically seated; this is not whole-tuft tilt.
export function createBrookWetAsset(world,root,sources,{physicalOnly=false,preserveFootprint=false}={}){
 const c=Math.cos(root.rot),s=Math.sin(root.rot),cache=new Map(),feet=[];
 const ground=(x,z)=>physicalOnly?world.surface.heightAt(x,z):Math.min(world.surface.heightAt(x,z),brookRenderedBankHeight(world,x,z,cache));
 const geometries=[],seating=[];
 for(let k=0;k<3;k++){
  const prototype=compactPrototype(sources[k],['near','far','basal'][k],preserveFootprint),g=prototype.geometry.clone(),p=g.attributes.position,seats=[];
  for(const group of prototype.groups){
   const x=root.x+(c*group.x+s*group.z)*root.s,z=root.z+(-s*group.x+c*group.z)*root.s;
   let level=Infinity,points=[];
   for(const i of [group.start,group.start+1]){
    const px=root.x+(c*p.getX(i)+s*p.getZ(i))*root.s,pz=root.z+(-s*p.getX(i)+c*p.getZ(i))*root.s,q=world.hydrology.sampleAt(px,pz,{includeDepth:false});
    if(q.insideWater||q.shoreDistance<.012){g.dispose();geometries.forEach(v=>v.dispose());return null;}
    level=Math.min(level,ground(px,pz));points.push({x:px,z:pz});
   }
   const water=world.hydrology.sampleAt(x,z,{includeDepth:false});
   // The asymmetric valley uses actual finite water coverage, matching the
   // render contact check. A supported dry bank is not submerged merely because
   // its height approaches an extrapolated neighbouring water plane.
   const finiteWater=physicalOnly&&(world.hydrology.stats.valleyDeposits?.sectionProfile||(preserveFootprint&&world.hydrology.stats.forestBankCurvature38));
   if(!finiteWater&&Number.isFinite(water.surfaceLevel)&&level-water.surfaceLevel<.035){g.dispose();geometries.forEach(v=>v.dispose());return null;}
   level-=.014;
   seats.push({start:group.start,count:group.count,points,level});
   const delta=(level-root.y)/(root.sy??root.s);
   for(let i=group.start;i<group.start+group.count;i++)p.setY(i,p.getY(i)+delta);
   if(k!==1)feet.push({x,z,y:level});
  }
  p.needsUpdate=true;geometries.push(g);seating.push(seats);
 }
 const envelope=createPlantEnvelope([geometries[0],geometries[2]]);
 if((!physicalOnly&&brookGrassIntersectsWater(world,root,envelope))||getShoreStoneField(world).intersects(root,envelope)){geometries.forEach(g=>g.dispose());return null;}
 return {geometries,envelope,feet,seating,physicalOnly,dispose(){geometries.forEach(g=>g.dispose());}};
}
// Candidate only: detect differential terrain change at original leaf feet.
// Uniform root-Y movement needs no per-leaf asset. Preserve every original XZ.
export function forestCurvatureNeedsBladeSeat(world,root,sources){
 if(!world.hydrology?.stats.forestBankCurvature38||!world.forestShoulderSourceWorld||Math.hypot(root.x+3611.9813305250705,root.z-4805.371282289286)>26)return false;
 const source=world.forestShoulderSourceWorld.surface,c=Math.cos(root.rot),s=Math.sin(root.rot),delta=world.surface.heightAt(root.x,root.z)-source.heightAt(root.x,root.z);
 for(let kind=0;kind<sources.length;kind++){
  const {geometry,groups}=compactPrototype(sources[kind],['near','far','basal'][kind],true),p=geometry.attributes.position;
  for(const group of groups)for(const i of [group.start,group.start+1]){
   const x=root.x+(c*p.getX(i)+s*p.getZ(i))*root.s,z=root.z+(-s*p.getX(i)+c*p.getZ(i))*root.s;
   if(Math.abs(world.surface.heightAt(x,z)-source.heightAt(x,z)-delta)>1e-6)return true;
  }
 }
 return false;
}
export function createBrookWetBatch(records,kind,rootField){
 const parts=[];
 for(const root of records){
  const g=root.brookAsset.geometries[kind].clone(),p=g.attributes.position,c=Math.cos(root.rot),s=Math.sin(root.rot),n=p.count;
  const normals=g.attributes.normal;
  const roots=new Float32Array(n*3),heights=new Float32Array(n),scales=new Float32Array(n),drops=new Float32Array(n),field=new Float32Array(n*4),land=new Float32Array(n*4),community=new Float32Array(n*4);
  for(let i=0;i<n;i++){
   const nx=normals.getX(i)/root.s,ny=normals.getY(i)/(root.sy??root.s),nz=normals.getZ(i)/root.s,nl=Math.hypot(nx,ny,nz)||1;
   normals.setXYZ(i,(c*nx+s*nz)/nl,ny/nl,(-s*nx+c*nz)/nl);
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,root.x+(c*x+s*z)*root.s,root.y+y*(root.sy??root.s),root.z+(-s*x+c*z)*root.s);
   roots.set([root.x,root.y,root.z],i*3);heights[i]=Math.max(.01,y*(root.sy??root.s));scales[i]=root.s;drops[i]=(root.sy??root.s)/(root.s*root.s);
   field.set(rootField.sample(root),i*4);land.set(rootField.sampleLandform(root),i*4);community.set(rootField.sampleCommunity(root),i*4);
  }
  g.setAttribute('aBrookRoot',new THREE.BufferAttribute(roots,3));g.setAttribute('aBrookHeight',new THREE.BufferAttribute(heights,1));g.setAttribute('aBrookScale',new THREE.BufferAttribute(scales,1));
  g.setAttribute('aBrookDrop',new THREE.BufferAttribute(drops,1));
  g.setAttribute('aMeadowRootField',new THREE.BufferAttribute(field,4));g.setAttribute('aMeadowLandform',new THREE.BufferAttribute(land,4));g.setAttribute('aMeadowCommunity',new THREE.BufferAttribute(community,4));
  parts.push(g);
 }
 const geometry=mergeGeometries(parts);geometry.setAttribute('aBrookSeat',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));geometry.setAttribute('aBrookReady',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1),1));parts.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.boundingBox.expandByScalar(1.5);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=1.5;return geometry;
}
export function installBrookWetBatchMaterial(material){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader='attribute float aBrookSeat; attribute float aBrookReady; attribute vec3 aBrookRoot; attribute float aBrookHeight; attribute float aBrookScale; attribute float aBrookDrop;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {if(aBrookReady<.5){gl_Position=vec4(2.,2.,2.,1.);return;}').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=aBrookSeat;').replace(/vec3 ecoRoot\(\) \{[\s\S]*?\n\}/,'vec3 ecoRoot() {return aBrookRoot;}')
   .replace('ecoBend(position.y,ecoWeights,ecoRoot())','ecoBend(aBrookHeight,ecoWeights,ecoRoot())*aBrookScale')
   .replace('max(.15,position.y)','max(.15,aBrookHeight)').replace('transformed=vec3(0.);','transformed=aBrookRoot;')
   .replace('transformed.y-=dot(ecoOffset,ecoOffset)*.55;','transformed.y-=dot(ecoOffset,ecoOffset)*.55*aBrookDrop;');
 };
 material.customProgramCacheKey=()=>key+'-brook-per-blade-grounded-v1';return material;
}

// Only render-seat attributes vary with terrain LOD. Logical roots, source IDs,
// leaf vertices and eligibility remain fixed across camera movement.
export function refreshBrookWetContact(world,tile,contact){
 let pending=0,updated=0;const offsets=[0,0,0];
 for(const root of tile.wet){const asset=root.brookAsset;
  if(asset.physicalOnly){
   if(!root.renderContact&&contact){const points=asset.seating.flatMap(groups=>groups.flatMap(g=>g.points));root.renderContact={binding:contact.bind(points),pending:true};}
   const state=root.renderContact;
   if(!state){pending++;for(let kind=0;kind<3;kind++){const a=tile.wetMeshes[kind].geometry.attributes.aBrookReady;a.array.fill(0,offsets[kind],offsets[kind]+asset.geometries[kind].attributes.position.count);a.needsUpdate=true;}}
   else if(state.binding.changed()){
    const samples=state.binding.samples(),deltas=[];let cursor=0,minDelta=0,ready=samples.every(s=>s&&s.spacing<=.625&&!s.morphing);
    for(const groups of asset.seating){const ds=[];for(const group of groups){let y=group.level;for(const p of group.points){const sample=samples[cursor++];if(sample)y=Math.min(y,sample.height-.014);}const delta=y-group.level;ds.push(delta);minDelta=Math.min(minDelta,delta);}deltas.push(ds);}
    // Conservative full-leaf sweep under the largest downward seat change.
    const moved={...root,y:root.y+minDelta};
    if(ready&&getShoreStoneField(world).intersects(moved,asset.envelope)){
     // The maximum uniform drop is only a fast conservative gate. A high outer
     // foot must not drag the already-low water-side blade down in validation.
     const adjusted=[0,2].map(kind=>{const g=asset.geometries[kind].clone(),p=g.attributes.position;asset.seating[kind].forEach((seat,i)=>{for(let v=seat.start;v<seat.start+seat.count;v++)p.setY(v,p.getY(v)+deltas[kind][i]/(root.sy??root.s));});return g;});
     const actualEnvelope=createPlantEnvelope(adjusted);adjusted.forEach(g=>g.dispose());
     ready=!getShoreStoneField(world).intersects(root,actualEnvelope);
    }
    // Water has a finite horizontal footprint, not an infinite level plane.
    // A supported land-side foot is valid even a few millimetres below the
    // neighbouring water mesh's visual offset. Leaf ends may brush water.
    // Reject actual water-covered roots, not a fabricated vertical margin.
    for(let kind=0;kind<3;kind++)asset.seating[kind].forEach((group,i)=>{for(const point of group.points){const q=world.hydrology.sampleAt(point.x,point.z,{includeDepth:false});if(q.insideWater)ready=false;}});
    for(let kind=0;kind<3;kind++){const g=tile.wetMeshes[kind].geometry,seat=g.attributes.aBrookSeat,show=g.attributes.aBrookReady;
     asset.seating[kind].forEach((group,i)=>seat.array.fill(deltas[kind][i],offsets[kind]+group.start,offsets[kind]+group.start+group.count));
     show.array.fill(ready?1:0,offsets[kind],offsets[kind]+asset.geometries[kind].attributes.position.count);seat.needsUpdate=true;show.needsUpdate=true;
    }
    state.pending=!ready;state.minDelta=minDelta;updated++;
   }
   if(state?.pending)pending++;
  }
  for(let kind=0;kind<3;kind++)offsets[kind]+=asset.geometries[kind].attributes.position.count;
 }
 return {pending,updated};
}
