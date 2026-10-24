import {BatchedMesh,BufferGeometry,Box3,DataTexture,FloatType,Matrix4,NearestFilter,RGBAFormat,Sphere,Vector3} from 'three';
import {treeCullSphere,TREE_CULL_WIND} from './tree-frustum-cull.js';

const HEADER=`
uniform highp sampler2D uMiddleTreeWind;
mat4 ecoBatchMatrix;
vec4 aTreeRootWind;float aTreeRootEddy;
`;
export function installMiddleBatchShader(source,windTexture){
 const material=source.clone();let version=-1;
 material.onBeforeCompile=(shader,renderer)=>{
  source.onBeforeCompile.call(source,shader,renderer);shader.uniforms.uMiddleTreeWind={value:windTexture};
  const roots='attribute vec4 aTreeRootWind;attribute float aTreeRootEddy;';
  if(!shader.vertexShader.includes(roots)||!shader.vertexShader.includes('#include <batching_vertex>'))throw new Error('Middle BatchedMesh requires original root wind and native batching chunks');
  shader.vertexShader=HEADER+shader.vertexShader.replace(roots,'');
  // Static functions need a global matrix; native project/normal/worldpos chunks
  // still use the standard local batchingMatrix, assigned once below.
  shader.vertexShader=shader.vertexShader.replace(/\binstanceMatrix\b/g,'ecoBatchMatrix');
  shader.vertexShader=shader.vertexShader.replace(/vec3 ecoRoot\(\)\s*\{[\s\S]*?\n\}/,'vec3 ecoRoot() { return ecoBatchMatrix[3].xyz; }');
  shader.vertexShader=shader.vertexShader.replace('void main() {',`void main() {
float middleInstance=getIndirectIndex(gl_DrawID);
ecoBatchMatrix=getBatchingMatrix(middleInstance);
int middleWindSize=textureSize(uMiddleTreeWind,0).x;
int middleWindIndex=int(middleInstance)*2;
ivec2 middleWindUV=ivec2(middleWindIndex%middleWindSize,middleWindIndex/middleWindSize);
aTreeRootWind=texelFetch(uMiddleTreeWind,middleWindUV,0);
aTreeRootEddy=texelFetch(uMiddleTreeWind,middleWindUV+ivec2(1,0),0).x;
`);
  shader.vertexShader=shader.vertexShader.replace('#include <batching_vertex>','mat4 batchingMatrix=ecoBatchMatrix;');
 };
 material.customProgramCacheKey=()=>source.customProgramCacheKey()+'-middle-native-batched-v38';
 const sync=()=>{if(source.version===version)return;material.copy(source);material.defines={...source.defines};material.needsUpdate=true;version=source.version;};sync();
 return {material,sync};
}

// Experimental mode1 alpha-tested crown submission only. Original resident
// sources own matrices/root wind and are retained intact for a runtime A/B.
export class SpruceMiddleBatched{
 constructor(parts,parent,{onChange=()=>{}}={}){
  this.parent=parent;this.onChange=onChange;this.entries=new Map();this.sources=[];this.lastBatches=null;this.lastRevision=-1;this.serial=0;this.active=true;this.disposed=false;this.matrix=new Matrix4();
  this.stats={enabled:true,forms:0,roots:0,sourceBatches:0,matrixWrites:0,windUploads:0,draws:0,subDraws:0,cpuMs:0,windBytes:0,geometryBytes:0,matrixTableBytes:0,idTableBytes:0,nativeMultiDraw:null};
  this.enabled={};Object.defineProperty(this.enabled,'value',{enumerable:true,get:()=>this.active,set:value=>this.setEnabled(Boolean(value))});
  for(let partIndex=0;partIndex<parts.length;partIndex++){
   const part=parts[partIndex],source=part.mesh;
   if(part.mode!==1||source.material.alphaTest<=0)continue;
   const sphere=treeCullSphere(source.geometry);if(!sphere)throw new Error('Middle batched foliage has unsupported complete wind bounds');
   const capacity=source.instanceMatrix.count,width=128,height=Math.ceil(capacity*2/width),data=new Float32Array(width*height*4),wind=new DataTexture(data,width,height,RGBAFormat,FloatType);
   wind.name='middle-tree-root-wind-'+part.variant;wind.minFilter=wind.magFilter=NearestFilter;wind.generateMipmaps=false;wind.needsUpdate=true;
   const colour=installMiddleBatchShader(source.material,wind),depth=installMiddleBatchShader(source.customDepthMaterial,wind);
   const mesh=new BatchedMesh(capacity,source.geometry.attributes.position.count,source.geometry.index.count,colour.material);
   mesh.name='spruce-middle-native-batched-'+part.variant;mesh.customDepthMaterial=depth.material;mesh.castShadow=true;mesh.receiveShadow=true;mesh.sortObjects=false;mesh.perObjectFrustumCulled=true;mesh.visible=false;mesh.count=0;
   const geometry=new BufferGeometry();
   for(const [name,a]of Object.entries(source.geometry.attributes)){if(a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer)throw new Error('Middle template must contain static attributes only');geometry.setAttribute(name,a);}
   geometry.setIndex(source.geometry.index);geometry.boundingBox=source.geometry.boundingBox?.clone()??new Box3().setFromBufferAttribute(source.geometry.attributes.position);
   geometry.boundingBox.expandByVector(new Vector3(...TREE_CULL_WIND)).expandByScalar(.25);
   geometry.boundingSphere=new Sphere(new Vector3(sphere[0],sphere[1],sphere[2]),sphere[3]+.25);
   const geometryId=mesh.addGeometry(geometry); // Native API copies all original attribute/index bytes.
   // The borrowed staging container never owns a WebGL allocation.
   const entry={partIndex,part,mesh,geometryId,wind,data,colour,depth,roots:new Map(),revision:0};this.entries.set(partIndex,entry);this.parent.add(mesh);
   const before=mesh.onBeforeRender;
   mesh.onBeforeRender=(renderer,scene,camera,g,m,group)=>{
    colour.sync();depth.sync();this.stats.nativeMultiDraw=renderer.extensions?.has?.('WEBGL_multi_draw')??this.stats.nativeMultiDraw;
    if(this.stats.nativeMultiDraw===false&&this.active){
     // Already queued draws remain valid through Three's native no-extension
     // fallback; restore original instancing for subsequent scene submissions.
     this.stats.fallback='WEBGL_multi_draw unavailable';this.setEnabled(false);
    }
    before.call(mesh,renderer,scene,camera,g,m,group);this.stats.draws++;this.stats.subDraws+=mesh._multiDrawCount;
   };
   this.stats.windBytes+=data.byteLength;
   this.stats.geometryBytes+=Object.values(mesh.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0)+mesh.geometry.index.array.byteLength;
   this.stats.matrixTableBytes+=mesh._matricesTexture.image.data.byteLength;this.stats.idTableBytes+=mesh._indirectTexture.image.data.byteLength;
  }
  this.stats.forms=this.entries.size;
 }
 setEnabled(value){
  if(this.disposed||value===this.active)return;this.active=value;this.stats.enabled=value;this.onChange();
  if(this.lastBatches)this.sync(this.lastBatches,this.lastRevision,true);
 }
 sync(batches,revision,force=false){
  if(this.disposed)return;const start=performance.now();this.lastBatches=batches;
  if(revision!==this.lastRevision||force){
   this.sources=[];for(const batch of batches.values())if(this.entries.has(batch.partIndex))this.sources.push(batch);
   this.lastRevision=revision;
   for(const batch of this.sources){const draw=batch.view?.proxy||batch.mesh;if(this.active)draw.removeFromParent();else if(draw.parent!==this.parent)this.parent.add(draw);}
  }
  if(!this.active){for(const e of this.entries.values())e.mesh.visible=false;this.stats.cpuMs=performance.now()-start;return;}
  const serial=++this.serial;let totalRoots=0;
  for(const e of this.entries.values()){e.changed=false;e.windChanged=false;if(!e.wanted)e.wanted=new Set();else e.wanted.clear();e.colour.sync();e.depth.sync();}
  // Release departing IDs before allocating arrivals, even at full capacity.
  for(const batch of this.sources){const e=this.entries.get(batch.partIndex);for(const root of batch.activeRecords)e.wanted.add(root.id);}
  for(const e of this.entries.values())for(const [key,r]of e.roots)if(!e.wanted.has(key)){e.mesh.deleteInstance(r.id);e.roots.delete(key);e.changed=true;}
  for(const batch of this.sources){
   const e=this.entries.get(batch.partIndex),source=batch.mesh,wind=source.geometry.attributes.aTreeRootWind.data;
   for(let i=0;i<batch.activeRecords.length;i++){
    const root=batch.activeRecords[i];let r=e.roots.get(root.id);
    if(!r){const id=e.mesh.addInstance(e.geometryId);r={id,matrix:new Float32Array(16).fill(NaN),seen:serial};e.roots.set(root.id,r);e.changed=true;}
    if(r.seen===serial&&r.batch&&r.batch!==batch)throw new Error('Duplicate middle-tree root in source chunks');r.seen=serial;r.batch=batch;
    const offset=i*16;let changed=false;
    if(r.matrixSource!==source||r.matrixVersion!==source.instanceMatrix.version||r.matrixSlot!==i){
     for(let k=0;k<16;k++)if(r.matrix[k]!==source.instanceMatrix.array[offset+k]){changed=true;break;}
     r.matrixSource=source;r.matrixVersion=source.instanceMatrix.version;r.matrixSlot=i;
    }
    if(changed){r.matrix.set(source.instanceMatrix.array.subarray(offset,offset+16));this.matrix.fromArray(r.matrix);e.mesh.setMatrixAt(r.id,this.matrix);this.stats.matrixWrites++;e.changed=true;}
    const o=r.id*8,w=i*5;for(let k=0;k<5;k++)if(e.data[o+k]!==wind.array[w+k]){e.data[o+k]=wind.array[w+k];e.windChanged=true;}
   }
  }
  for(const e of this.entries.values()){
   for(const [key,r]of e.roots)if(r.seen!==serial){e.mesh.deleteInstance(r.id);e.roots.delete(key);e.changed=true;}
   e.mesh.count=e.roots.size;e.mesh.visible=e.roots.size>0;totalRoots+=e.roots.size;
   if(e.changed){e.mesh.computeBoundingBox();e.mesh.computeBoundingSphere();e.mesh.userData.shadowRevision=++e.revision;}
   if(e.windChanged){e.wind.needsUpdate=true;this.stats.windUploads++;}
  }
  this.stats.roots=totalRoots;this.stats.sourceBatches=this.sources.length;this.stats.cpuMs=performance.now()-start;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const batch of this.sources){const draw=batch.view?.proxy||batch.mesh;if(!draw.parent)this.parent.add(draw);}
  for(const e of this.entries.values()){e.mesh.removeFromParent();e.mesh.dispose();e.colour.material.dispose();e.depth.material.dispose();e.wind.dispose();e.roots.clear();}
  this.entries.clear();this.sources=[];
 }
}
