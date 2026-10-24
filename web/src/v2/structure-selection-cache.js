const RESULTS=['visibleBatches','visibleTriangles','shadowBatches','culledDetailInstances','lowLODInstances','activeTriangles'];
const values=(array,put)=>{put(array);put(array.length);for(let i=0;i<array.length;i++)put(array[i]);};
const vector=(v,put)=>{put(v);if(v){put(v.x);put(v.y);put(v.z);}};
const box=(b,put)=>{put(b);if(b){vector(b.min,put);vector(b.max,put);}};
function meshInputs(mesh,put){
 put(mesh);if(!mesh)return;
 put(mesh.geometry);put(mesh.geometry.index);put(mesh.geometry.index?.count);put(mesh.geometry.attributes.position);put(mesh.geometry.attributes.position?.count);
 put(mesh.material);put(mesh.material.transparent);put(mesh.material.userData.lodgeThinGlass);
 put(mesh.instanceMatrix);put(mesh.instanceMatrix.version);put(mesh.count);put(mesh.visible);put(mesh.castShadow);
 values(mesh.matrixWorld.elements,put);box(mesh.boundingBox,put);
 put(mesh.boundingSphere);if(mesh.boundingSphere){vector(mesh.boundingSphere.center,put);put(mesh.boundingSphere.radius);}
 put(mesh.userData.activeEntityIds);if(mesh.userData.activeEntityIds)values(mesh.userData.activeEntityIds,put);
}
function bufferInputs(buffer,put){
 put(buffer);if(buffer){put(buffer.count);put(buffer.previousCount);values(buffer.indices,put);values(buffer.previous,put);}
}
// An exact dependency stream for the existing selection loop, not a camera-only
// gate. Shared source arrays are recorded once rather than per material part.
function inputs(owner,camera,sources,put){
 put(owner._batches);put(owner._batches.length);put(owner._selectionBins);put(owner._selectionBins.length);
 put(owner.shadowDistance);put(owner.selectionReuse);put(owner.selectionBuffers);
 values(owner._viewProjection.elements,put);vector(owner._cameraPosition,put);
 put(camera.projectionMatrix.elements[5]);put(camera.coordinateSystem);put(camera.reversedDepth);
 for(const bin of owner._selectionBins){put(bin);put(bin.worldBounds);put(bin.distances);values(bin.distances,put);put(bin.sourceDistances);put(bin.sourceIndices);if(bin.sourceIndices)values(bin.sourceIndices,put);if(bin.sourceDistances)values(bin.sourceDistances,put);}
 for(const b of owner._batches){
  put(b);put(b.part);put(b.part.role);put(b.part.low);put(b.part.low?.error);
  put(b.entities);put(b.worldBounds);put(b.scales);put(b.matrices);put(b.distances);
  values(b.detailState,put);values(b.lodState,put);
  put(b.nearSelection);put(b.farSelection);bufferInputs(b.nearBuffer,put);bufferInputs(b.farBuffer,put);
  meshInputs(b.mesh,put);meshInputs(b.lodMesh,put);
 }
 for(const [array,type]of sources){
  put(array.length);
  for(const v of array){if(type==='box')box(v,put);else if(type==='matrix'){put(v);values(v.elements,put);}else put(v);}
 }
}
export class StructureSelectionCache {
 constructor({enabled=false}={}){this.enabled=enabled;this.data=null;this.sources=[];this.results={};this.stats={enabled,hits:0,misses:0,checks:0,lastCheckMs:0,values:0};}
 reuse(owner,camera){
  this.stats.enabled=this.enabled;
  if(!this.enabled){if(this.data||this.sources.length)this.clear();return false;}
  if(!this.data){this.stats.misses++;return false;}
  const started=performance.now();let i=0,match=true;
  inputs(owner,camera,this.sources,v=>{if(!Object.is(this.data[i++],v))match=false;});
  this.stats.checks++;this.stats.lastCheckMs=performance.now()-started;
  if(!match||i!==this.data.length){this.stats.misses++;return false;}
  for(const key of RESULTS)owner.stats[key]=this.results[key];this.stats.hits++;return true;
 }
 capture(owner,camera){
  if(!this.enabled)return;
  const sources=new Map();
  for(const bin of owner._selectionBins)sources.set(bin.worldBounds,'box');
  for(const b of owner._batches){sources.set(b.distances,'scalar');sources.set(b.entities,'scalar');sources.set(b.scales,'scalar');sources.set(b.matrices,'matrix');sources.set(b.worldBounds,'box');}
  this.sources=[...sources];const data=this.data||[];let i=0;
  inputs(owner,camera,this.sources,v=>{data[i++]=v;});data.length=i;this.data=data;this.stats.values=i;
  for(const key of RESULTS)this.results[key]=owner.stats[key];
 }
 clear(){this.data=null;this.sources=[];this.results={};}
}
