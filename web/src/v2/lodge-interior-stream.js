import {lodgeTablesEnabled} from './lodge-tables-definition.js';
import * as THREE from 'three';
import {WATER_REFLECTION_LIMITS} from './water-reflection.js';
import {lodgeChairsEnabled,LODGE_CHAIRS_SOURCE} from './lodge-chairs-definition.js';
import {LODGE_DOOR} from './lodge-door.js';
export function lodgeInteriorStreamEnabled(search=globalThis.location?.search||''){
 const p=new URLSearchParams(search),explicit=p.get('lodgeInteriorStream38');if(explicit==='0')return false;
 if(!lodgeTablesEnabled(search)&&!lodgeChairsEnabled(search)){if(explicit==='1')throw Error('lodgeInteriorStream38 requires the current chairs source');return false;}return true;
}
export const lodgeStreamManifest=()=>import('./generated/lodge-interior-stream-38.json',{with:{type:'json'}}).then(m=>m.default);
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
export async function loadLodgeStreamPackage(kind,loader,{fetchImpl=(...a)=>fetch(...a),manifestLoader=lodgeStreamManifest,sourceBinding=LODGE_CHAIRS_SOURCE}={}){
 const manifest=await manifestLoader();if(manifest.sourceSHA256!==sourceBinding.sourceSHA256)throw Error('Lodge stream complete source differs');
 const pkg=manifest.packages[kind];if(!pkg)throw Error('Unknown lodge stream package');
 const url='./'+(pkg.gzipURL||pkg.url),response=await fetchImpl(url+'?v='+(pkg.gzipSHA256||pkg.sha256));if(!response.ok)throw Error('Lodge stream HTTP '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer()),gzip=bytes[0]===31&&bytes[1]===139;
 if(bytes.length!==(gzip?pkg.gzipBytes:pkg.bytes)||await sha(bytes)!==(gzip?pkg.gzipSHA256:pkg.sha256))throw Error('Lodge stream transfer checksum differs');
 const raw=gzip?new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):bytes;
 if(raw.length!==pkg.bytes||await sha(raw)!==pkg.sha256)throw Error('Lodge stream GLB checksum differs');
 const gltf=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),url.slice(0,url.lastIndexOf('/')+1));
 gltf.scene.traverse(n=>{if(!n.isMesh)return;let parent=n;while(parent&&!parent.name.startsWith('chair38_'))parent=parent.parent;if(parent)n.userData.lodgeChair38=parent.name;});
 gltf.userData={...gltf.userData,lodgeStream:{kind,manifest,responseBytes:bytes.length,rawBytes:raw.length}};return gltf;
}
// A single complete-building gate. No frustum-only shadow omission: the existing
// 350m caster range and 220+58m reflection reach are conservatively covered.
export class LodgeInteriorStream {
 constructor(world,{enabled=false,load,shadowDistance=350,finalize=async()=>{}}={}){
  this.shadowDistance=shadowDistance;this.requiredRange=shadowDistance+50;this.enabled=enabled;this.load=load;this.finalize=finalize;this.ready=false;this.pending=null;this.stage=null;this.disposed=false;
  this.stats={enabled,status:enabled?'shell':'disabled',attempts:0,error:null};
  this.entity=enabled?world.entities?.find(e=>e.id===LODGE_DOOR.entityId):null;
  if(enabled&&!this.entity)throw Error('Lodge streaming entity missing');
  if(this.entity){const p=world.surface.buildingPose(this.entity);this.pose=p;this.bounds=new THREE.Box3(new THREE.Vector3(-14,-2,-7),new THREE.Vector3(14,9,7)).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot),new THREE.Vector3(p.scale.x,p.scale.y,p.scale.z)));}
 }
 setBounds(bounds){
  if(!Array.isArray(bounds)||bounds.length!==2||bounds.flat().length!==6||bounds.flat().some(v=>!Number.isFinite(v)))throw Error("Invalid complete lodge bounds");
  const p=this.pose;this.bounds=new THREE.Box3(new THREE.Vector3().fromArray(bounds[0]),new THREE.Vector3().fromArray(bounds[1])).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot),new THREE.Vector3(p.scale.x,p.scale.y,p.scale.z)));
  // Patch reuse may retain a centre up to 8m from the new eligible centre.
  // Reflection rejection uses spheres, so include the whole building diameter
  // when translating that condition to this conservative building AABB gate.
  const radius=this.bounds.getBoundingSphere(new THREE.Sphere()).radius;
  this.requiredRange=Math.max(this.shadowDistance+50,Math.hypot(WATER_REFLECTION_LIMITS.range+8,WATER_REFLECTION_LIMITS.height)+WATER_REFLECTION_LIMITS.sceneRadius+2*radius);
  this.stats.requiredRange=this.requiredRange;
 }
 needs(position,camera){
  if(!this.enabled||this.ready)return false;
  if(this.bounds.distanceToPoint(position)<=this.requiredRange)return true;
  if(camera){camera.updateMatrixWorld();const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);return f.intersectsBox(this.bounds);}
  return false;
 }
 ensure(){
  if(!this.enabled||this.ready)return Promise.resolve();if(this.disposed)return Promise.reject(Error('Lodge stream disposed'));if(this.pending)return this.pending;
  this.stats.status='loading';this.stats.attempts++;this.stats.error=null;
  this.pending=(async()=>{if(!this.stage)this.stage=await this.load();if(this.disposed){this.stage?.dispose?.();this.stage=null;throw Error('Lodge stream disposed');}this.stats.status='preparing';await this.finalize(this.stage);if(this.disposed)throw Error('Lodge stream disposed');this.ready=true;this.stats.status='ready';})().catch(error=>{this.stats.status='failed';this.stats.error=error.message;throw error;}).finally(()=>{this.pending=null;});return this.pending;
 }
 assertCollision(entity){if(this.enabled&&!this.ready&&entity.id===this.entity.id)throw Error('Lodge interior/collision is not ready');}
 dispose(){this.disposed=true;this.stage?.dispose?.();this.stage=null;this.stats.status='disposed';}
}

export function assertLodgeCollisionCamera(stream,position,cameraPosition){
 if(stream.needs(position)&&position.distanceToSquared(cameraPosition)>1e-8)throw Error('Lodge collision preparation requires the active camera position; move the camera before enabling walking');
}

// Compile the whole installed package, including currently hidden chairs. A
// distant request must not mark it ready after compiling only the visible shell.
export async function compileLodgeStreamMaterials(renderer,scene,camera,structures,target){
 const {compilePreparedWorld}=await import('./shader-readiness.js');
 const input=new THREE.Group(),objects=structures._batches.filter(b=>b.mesh.userData.assetId==='gh_lanchuan_lodge').flatMap(b=>[b.mesh,b.lodMesh]).filter(Boolean).map(mesh=>{const proxy=Object.create(mesh);proxy.visible=true;proxy.count=Math.max(1,mesh.count);return proxy;});
 input.traverse=input.traverseVisible=visit=>{visit(input);for(const object of objects)visit(object);};
 const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();let pending;
 try{if(target)renderer.setRenderTarget(target);pending=compilePreparedWorld(renderer,input,camera,scene);}finally{renderer.setRenderTarget(previous,face,level);}
 return pending;
}
