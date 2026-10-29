import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';

export const ROOT_MAT_TRIAL_URL='./assets/v2/shore/root-mat-trial/root-mat-section.glb';
export const ROOT_MAT_TRIAL_PLACEMENT=Object.freeze({offset:1.5,upperGap:.28,lowerGap:.06,sourceDepth:.225,crestGap:.42});
export function reachRootMatTrialEnabled(search=globalThis.location?.search??''){
 const params=new URLSearchParams(search);
 return params.get('reachBankDesign50')==='root-pool'&&params.get('reachRootMat')==='1';
}
const abortError=()=>new DOMException('Root-mat trial disposed or aborted','AbortError');
const finite=p=>[p.x,p.y,p.z].every(Number.isFinite);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Source Blender X=along, Y=toward water, Z=up. GLB is (X,Z,-Y).
// Project onto the source substrate, rather than mistaking horizontal reveal
// for its signed normal distance. All roots, including buried tips, survive.
function sourceFace(u,v){return {f:-1.18*v+.003*Math.sin(16*u)+.0015*Math.sin(47*v+11*u),du:.048*Math.cos(16*u)+.0165*Math.cos(47*v+11*u),dv:-1.18+.0705*Math.cos(47*v+11*u)};}
export function projectRootMatSource(point){
 let u=point.x,v=point.y;
 for(let k=0;k<7;k++){
  const s=sourceFace(u,v),rx=u-point.x,ry=v-point.y,rz=-s.f-point.z;
  const a=1+s.du*s.du,b=s.du*s.dv,c=1+s.dv*s.dv,det=a*c-b*b;
  const r0=rx-s.du*rz,r1=ry-s.dv*rz;
  u-=(c*r0-b*r1)/det;v-=(a*r1-b*r0)/det;
 }
 const f=sourceFace(u,v),base=new THREE.Vector3(u,v,-f.f),normal=new THREE.Vector3(-f.du,-f.dv,-1).normalize();
 return {u,v,base,normal,distance:new THREE.Vector3().subVectors(point,base).dot(normal)};
}

export function createRootMatBankMapper(world){
 const reach=world.hydrology?.forestReach39,heightAt=world.surface?.heightAt;
 if(reach?.stats?.design50!=='root-pool'||typeof heightAt!=='function')throw new Error('Root-mat trial requires the actual root-pool heightAt surface');
 const line=world.hydrology.segments.filter(s=>s.lineId===reach.lineId),p=ROOT_MAT_TRIAL_PLACEMENT;
 const sectionAt=u=>{
  const distance=reach.origin+p.offset+u,s=line.find(s=>s.a.distance<=distance&&s.b.distance>=distance);
  if(!s)throw new Error('Root-mat trial cannot resolve the authored bank segment');
  const q=reach.waterSectionAt(s,(distance-s.a.distance)/(s.b.distance-s.a.distance));
  if(![q.x,q.z,q.right,q.level,q.fx,q.fz].every(Number.isFinite))throw new Error('Root-mat trial received a nonfinite water section');
  return q;
 };
 const height=(x,z)=>{const y=heightAt(x,z);if(!Number.isFinite(y))throw new Error('Root-mat trial heightAt returned nonfinite height');return y;};
 const surfaceNormal=(x,z)=>{const h=.002;return new THREE.Vector3(-(height(x+h,z)-height(x-h,z))/(2*h),1,-(height(x,z+h)-height(x,z-h))/(2*h)).normalize();};
 const atGap=(q,gap)=>{const x=q.x-q.fz*(q.right+gap),z=q.z+q.fx*(q.right+gap);return new THREE.Vector3(x,height(x,z),z);};
 const origin=atGap(sectionAt(0),(p.upperGap+p.lowerGap)/2);
 return {origin,height,surfaceNormal,
  mapSource(point){
   const source=projectRootMatSource(point);
   if(Math.abs(source.u)>.31||source.v>.01||source.v<-.24||source.distance<-.016||source.distance>.006)throw new Error('Root-mat trial source exceeds the authored centimetre-scale fit envelope');
   const q=sectionAt(source.u),progress=clamp(-source.v/p.sourceDepth,0,1),gap=p.upperGap+(p.lowerGap-p.upperGap)*progress;
   const base=atGap(q,gap),normal=surfaceNormal(base.x,base.z),position=base.clone().addScaledVector(normal,source.distance);
   return {position,base,normal,source,waterLevel:q.level,crestHeight:atGap(q,p.crestGap).y,gap};
  },
  // Independent closest-point check for tests; not a per-frame surface query.
  projectTarget(point){
   let x=point.x,z=point.z;
   for(let k=0;k<5;k++){
    const y=height(x,z),n=surfaceNormal(x,z),hx=-n.x/n.y,hz=-n.z/n.y;
    const rx=x-point.x,ry=y-point.y,rz=z-point.z,a=1+hx*hx,b=hx*hz,c=1+hz*hz,det=a*c-b*b;
    const r0=rx+hx*ry,r1=rz+hz*ry;x-=(c*r0-b*r1)/det;z-=(a*r1-b*r0)/det;
   }
   const base=new THREE.Vector3(x,height(x,z),z),normal=surfaceNormal(x,z);
   return {base,normal,distance:new THREE.Vector3().subVectors(point,base).dot(normal)};
  }
 };
}

export function fitRootMatGeometry(sourceGeometry,sourceMatrix,mapper){
 const geometry=sourceGeometry.clone().applyMatrix4(sourceMatrix),position=geometry.attributes.position;
 if(!position||!geometry.index)throw new Error('Root-mat trial requires indexed solid source geometry');
 const point=new THREE.Vector3(),records=[];
 const stats={vertices:position.count,triangles:geometry.index.count/3,sourceBuriedVertices:0,fittedBuriedVertices:0,maxOffsetError:0,maxNormalDistanceError:0,maxExposedDistance:0,minBuriedDistance:0,minWaterClearance:Infinity,minCrownClearance:Infinity,minTreeDistance:Infinity};
 try{
  for(let i=0;i<position.count;i++){
   point.fromBufferAttribute(position,i);if(!finite(point))throw new Error('Root-mat trial source position is nonfinite');
   const r=mapper.mapSource(point),local=r.position.clone().sub(mapper.origin);
   position.setXYZ(i,local.x,local.y,local.z);
   // Inspect the actual uploaded Float32 position, not the pre-rounding value.
   point.fromBufferAttribute(position,i).add(mapper.origin);
   const expected=r.base.clone().addScaledVector(r.normal,r.source.distance);
   stats.maxOffsetError=Math.max(stats.maxOffsetError,point.distanceTo(expected));
   // Tangent-normal residual at the final x/z (conservative curvature check).
   // The focused regression additionally uses independent closest projection.
   const signed=(point.y-mapper.height(point.x,point.z))*r.normal.y;
   stats.maxNormalDistanceError=Math.max(stats.maxNormalDistanceError,Math.abs(signed-r.source.distance));
   stats.sourceBuriedVertices+=Number(r.source.distance<0);stats.fittedBuriedVertices+=Number(signed<0);
   stats.maxExposedDistance=Math.max(stats.maxExposedDistance,signed);stats.minBuriedDistance=Math.min(stats.minBuriedDistance,signed);
   stats.minWaterClearance=Math.min(stats.minWaterClearance,point.y-r.waterLevel);
   if(r.source.v>-.045)stats.minCrownClearance=Math.min(stats.minCrownClearance,r.crestHeight-point.y);
   stats.minTreeDistance=Math.min(stats.minTreeDistance,...FOREST_REACH39_SOURCE.trees.map(t=>Math.hypot(t.x-point.x,t.z-point.z)));
   records.push({sourceDistance:r.source.distance,sourceDepth:r.source.v,base:r.base,normal:r.normal});
  }
  if(stats.minWaterClearance<.02||stats.minCrownClearance<.035||stats.minTreeDistance<2||stats.maxNormalDistanceError>.00008)throw new Error('Root-mat trial failed bank/water/protected-root contact bounds: '+JSON.stringify(stats));
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,stats,records};
 }catch(error){geometry.dispose();throw error;}
}

function disposeScene(scene){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 scene?.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
 scene?.clear();
}

export class ReachRootMatTrial{
 constructor(world,{search=globalThis.location?.search??'',url=ROOT_MAT_TRIAL_URL,fetchImpl=(...args)=>globalThis.fetch(...args),loader=new GLTFLoader()}={}){
  this.world=world;this.url=url;this.fetchImpl=fetchImpl;this.loader=loader;
  this.enabled=reachRootMatTrialEnabled(search);this.group=new THREE.Group();this.group.name='OFF trial — one fitted root-mat bank fragment';this.materials=[];
  this.stats={enabled:this.enabled,status:this.enabled?'idle':'off',meshes:0,triangles:0,responseBodyBytes:0,fitMs:0};
  this._disposed=false;this._pending=null;this._controller=null;
 }
 load(){
  if(this._disposed)return Promise.reject(abortError());
  if(!this.enabled||this.stats.status==='ready')return Promise.resolve(this);
  if(this._pending)return this._pending;
  this._pending=this._load().finally(()=>{this._pending=null;});return this._pending;
 }
 async _load(){
  this.stats.status='loading';delete this.stats.error;this._controller=new AbortController();let source,staged;
  try{
   const mapper=createRootMatBankMapper(this.world);
   const response=await this.fetchImpl(this.url,{signal:this._controller.signal});
   if(!response.ok)throw new Error('Root-mat trial asset HTTP '+response.status);
   const bytes=await response.arrayBuffer();this.stats.responseBodyBytes=bytes.byteLength;
   if(this._disposed)throw abortError();
   source=(await this.loader.parseAsync(bytes,'')).scene;
   if(this._disposed)throw abortError();
   source.updateMatrixWorld(true);const meshes=[];source.traverse(o=>{if(o.isMesh)meshes.push(o);});
   if(meshes.length!==2)throw new Error('Root-mat trial expected exactly two source material meshes');
   staged=new THREE.Group();staged.position.copy(mapper.origin);const stats=[];const begin=performance.now();
   for(const mesh of meshes){
    if(mesh.userData.detailRole!=='root-mat-fragment'||Array.isArray(mesh.material)||!mesh.material.isMeshStandardMaterial||Object.values(mesh.material).some(v=>v?.isTexture))throw new Error('Root-mat trial source material/role contract changed');
    const result=fitRootMatGeometry(mesh.geometry,mesh.matrixWorld,mapper),material=mesh.material.clone(),fitted=new THREE.Mesh(result.geometry,material);
    fitted.name=mesh.name;fitted.userData={...mesh.userData,rootMatTrial:true};fitted.castShadow=true;fitted.receiveShadow=true;staged.add(fitted);stats.push(result.stats);
   }
   this.stats.fitMs=performance.now()-begin;
   this.group.position.copy(staged.position);while(staged.children.length)this.group.add(staged.children[0]);
   this.materials=this.group.children.map(o=>o.material);
   this.stats={...this.stats,status:'ready',meshes:2,vertices:stats.reduce((n,s)=>n+s.vertices,0),triangles:stats.reduce((n,s)=>n+s.triangles,0),origin:mapper.origin.toArray(),parts:stats,
    sourceBuriedVertices:stats.reduce((n,s)=>n+s.sourceBuriedVertices,0),fittedBuriedVertices:stats.reduce((n,s)=>n+s.fittedBuriedVertices,0),
    maxOffsetError:Math.max(...stats.map(s=>s.maxOffsetError)),maxNormalDistanceError:Math.max(...stats.map(s=>s.maxNormalDistanceError)),maxExposedDistance:Math.max(...stats.map(s=>s.maxExposedDistance)),
    minWaterClearance:Math.min(...stats.map(s=>s.minWaterClearance)),minCrownClearance:Math.min(...stats.map(s=>s.minCrownClearance)),minTreeDistance:Math.min(...stats.map(s=>s.minTreeDistance))};
   return this;
  }catch(error){this.stats.status=this._disposed?'disposed':'error';this.stats.error=String(error?.message??error);throw error;}
  finally{disposeScene(source);disposeScene(staged);this._controller=null;}
 }
 dispose(){
  if(this._disposed)return;this._disposed=true;this._controller?.abort();
  this.group.removeFromParent();disposeScene(this.group);this.materials=[];this.stats.status='disposed';this.stats.meshes=0;this.stats.triangles=0;
 }
}
