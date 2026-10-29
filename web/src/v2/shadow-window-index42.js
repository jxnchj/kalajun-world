import {prepareColumnMesh42,columnMeshPrepared42,columnSourceBoxes42,createColumnPreparationBudget42,projectionCacheStats42} from './shadow-column-audit42.js';
export function windowSourceDiagnostic42(source){const g=source.geometry;return{id:source.id,uuid:source.uuid,name:source.name,type:source.type,geometryId:g.id,vertices:g.attributes.position?.count??0,indices:g.index?.count??0,instances:source.isInstancedMesh?source.count:1,wind:!!(g.attributes.aPlantWind||g.attributes._plant_wind),morphs:g.morphAttributes.position?.length??0};}
// Only a 2-D lookup over existing all-wind light-space envelopes. There is no
// alternate placement, LOD population or world traversal in this index.
export class ShadowWindowIndex42 {
 constructor({boundsCache=new WeakMap(),cellSize=4,maxCellsPerSource=4096,allowProvisional=false}={}){this.allowProvisional=allowProvisional;this.provisional=new Map();this.closed=false;this.boundsCache=boundsCache;this.cellSize=cellSize;this.maxCellsPerSource=maxCellsPerSource;this.cells=new Map();this.memberships=new Map();this.sourceBoxes=new Map();this.always=new Set();this.versions=new Map();this.revision=-1;this.basis=null;this.stats={sources:0,cells:0,queried:0,revision:-1};}
 remove(source){this.provisional.delete(source);for(const key of this.memberships.get(source)||[]){const set=this.cells.get(key);set?.delete(source);if(!set?.size)this.cells.delete(key);}this.memberships.delete(source);this.sourceBoxes.delete(source);this.always.delete(source);this.versions.delete(source);}
 *insertSteps(source,boxes){if(!boxes){this.remove(source);this.always.add(source);return;}const keys=new Set(),size=this.cellSize;let visited=0;
  for(let i=0;i<boxes.length;i+=4){if(![boxes[i],boxes[i+1],boxes[i+2],boxes[i+3]].every(Number.isFinite)){this.remove(source);this.always.add(source);return;}const x0=Math.floor((boxes[i]-1e-8)/size),y0=Math.floor((boxes[i+1]-1e-8)/size),x1=Math.floor((boxes[i+2]+1e-8)/size),y1=Math.floor((boxes[i+3]+1e-8)/size);if((x1-x0+1)*(y1-y0+1)>this.maxCellsPerSource){this.remove(source);this.always.add(source);return;}
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){keys.add(x+','+y);if(keys.size>this.maxCellsPerSource){this.remove(source);this.always.add(source);return;}if((++visited&127)===0)yield;}
  }
  if(this.closed)throw Error('Spatial index disposed');this.remove(source);this.sourceBoxes.set(source,boxes);this.memberships.set(source,keys);for(const key of keys){let set=this.cells.get(key);if(!set){set=new Set();this.cells.set(key,set);}set.add(source);}
 }
 async insert(source,boxes,budget){for(const step of this.insertSteps(source,boxes))await budget.checkpoint();}
 syncCached(submissions,basis,check,prepareStaticSource=null){
  const provisional=new Set();
  this.stats.lastCachedMiss=null;this.stats.lastCachedRoots=[];this.stats.lastCachedTerrain=[];if(this.closed||!submissions.ready)throw Error('Native source unavailable');const stamp=[...basis.right,...basis.up];if(!this.basis||stamp.some((v,i)=>v!==this.basis[i]))return false;
  for(const[source,record]of submissions.records){check();if(this.versions.get(source)===record.version)continue;if(!source.name.startsWith('gpu-')&&!columnMeshPrepared42(source,{basis,boundsCache:this.boundsCache,refreshRoots:true,check,onRootRefresh:detail=>this.stats.lastCachedRoots.push(detail),onMiss:reason=>{this.stats.lastCachedMiss={...windowSourceDiagnostic42(source),reason,phase:'index'};}})){if(!prepareStaticSource?.(source)){const miss=this.stats.lastCachedMiss?.reason;if(this.allowProvisional&&miss==='missing-geometry-interval'&&!source.isSkinnedMesh&&!source.morphTexture&&!source.geometry.isInstancedBufferGeometry&&!Array.isArray(source.material)){provisional.add(source);continue;}return false;}this.stats.lastCachedTerrain.push({id:source.id,geometryId:source.geometry.id,phase:'index',name:source.name,vertices:source.geometry.attributes.position.count,triangles:(source.geometry.index?.count??source.geometry.attributes.position.count)/3});this.stats.lastCachedMiss=null;}}
  for(const source of this.versions.keys())if(!submissions.records.has(source))this.remove(source);
  for(const[source,record]of submissions.records){check();if(this.versions.get(source)===record.version)continue;const since=this.provisional.get(source)?.since??performance.now(),boxes=provisional.has(source)||source.name.startsWith('gpu-')?null:columnSourceBoxes42(source,{basis,boundsCache:this.boundsCache});for(const step of this.insertSteps(source,boxes))check();this.versions.set(source,record.version);if(provisional.has(source))this.provisional.set(source,{version:record.version,since});}
  check();this.revision=submissions.revision;Object.assign(this.stats,{sources:this.versions.size,cells:this.cells.size,revision:this.revision});return true;
 }
 async sync(submissions,basis,{budget=createColumnPreparationBudget42()}={}){
  if(this.closed)throw Error('Spatial index disposed');if(!Number.isInteger(submissions.revision)||!submissions.ready)throw Error('Index requires completed native source revisions');
  const stamp=[...basis.right,...basis.up];if(!this.basis||stamp.some((v,i)=>v!==this.basis[i])){this.clear();this.basis=stamp;}
  if(this.revision===submissions.revision&&!this.provisional.size)return true;
  // Keep completed source versions. A new native frame may add/remove/change
  // sources while a cooperative slice yields; only those sources need work.
  Object.assign(this.stats,{syncRounds:0,sourcePrepared:0,sourceRetries:0,sourceReused:0,sourceWork:[],sourceWorkCount:0});
  for(;;){
   if(this.closed)throw Error('Spatial index disposed');if(!submissions.ready)throw Error('Native submission unavailable during spatial preparation');
   this.stats.syncRounds++;const records=[...submissions.records],live=new Set(records.map(([source])=>source));for(const source of this.versions.keys())if(!live.has(source))this.remove(source);
   for(const[source]of records){
    if(this.closed)throw Error('Spatial index disposed');const current=submissions.records.get(source);if(!current)continue;const version=current.version;
    if(this.versions.get(source)===version&&!this.provisional.has(source)){this.stats.sourceReused++;continue;}
    const workStart=performance.now(),before={...projectionCacheStats42},waitBefore=budget.stats?.yieldWaitMs??0;let workError=null;
    try{if(source.name.startsWith('gpu-'))await this.insert(source,null,budget);else{await prepareColumnMesh42(source,{basis,boundsCache:this.boundsCache,budget});await this.insert(source,columnSourceBoxes42(source,{basis,boundsCache:this.boundsCache}),budget);}}
    catch(error){workError=error.message;if(/changed during preparation/.test(error.message)&&submissions.records.get(source)?.version!==version){this.remove(source);this.stats.sourceRetries++;await budget.checkpoint();continue;}throw error;}
    finally{const wallMs=performance.now()-workStart,waitMs=(budget.stats?.yieldWaitMs??0)-waitBefore,row={...windowSourceDiagnostic42(source),version,wallMs,waitMs,activeMs:Math.max(0,wallMs-waitMs),vertexBuilds:projectionCacheStats42.vertexBuilds-before.vertexBuilds,rootBuilds:projectionCacheStats42.rootBuilds-before.rootBuilds,triangleBuilds:projectionCacheStats42.triangleBuilds-before.triangleBuilds,bankBaseBuilds:projectionCacheStats42.bankBaseBuilds-before.bankBaseBuilds,bankSeatScans:projectionCacheStats42.bankSeatScans-before.bankSeatScans,bankBaseAdoptions45:projectionCacheStats42.bankBaseAdoptions45-before.bankBaseAdoptions45,error:workError};this.stats.sourceWork.push(row);if(this.stats.sourceWork.length>64)this.stats.sourceWork.shift();this.stats.sourceWorkCount++;if(!this.stats.maxSourceWork||row.wallMs>this.stats.maxSourceWork.wallMs)this.stats.maxSourceWork=row;}
    if(this.closed)throw Error('Spatial index disposed');if(submissions.records.get(source)?.version!==version){this.remove(source);this.stats.sourceRetries++;}else{this.versions.set(source,version);this.stats.sourcePrepared++;}await budget.checkpoint();
   }
   // No await between the final complete live-version comparison and publish.
   const now=submissions.records;for(const source of this.versions.keys())if(!now.has(source))this.remove(source);
   if(now.size===this.versions.size&&[...now].every(([source,record])=>this.versions.get(source)===record.version)){
    this.revision=submissions.revision;Object.assign(this.stats,{sources:this.versions.size,cells:this.cells.size,revision:this.revision});return true;
   }
   await budget.checkpoint();
  }
 }
 query(anchor,span,basis){if(this.revision<0)throw Error('Spatial source index is not current');const x=anchor.reduce((n,v,i)=>n+v*basis.right[i],0),y=anchor.reduce((n,v,i)=>n+v*basis.up[i],0),half=span/2+1e-8,size=this.cellSize,out=new Set(this.always);for(let a=Math.floor((x-half)/size);a<=Math.floor((x+half)/size);a++)for(let b=Math.floor((y-half)/size);b<=Math.floor((y+half)/size);b++)for(const s of this.cells.get(a+','+b)||[])out.add(s);this.stats.coarseQueried=out.size;for(const source of out){const b=this.sourceBoxes.get(source);if(b?.length===4&&Array.from(b).every(Number.isFinite)&&(b[0]>x+half||b[2]<x-half||b[1]>y+half||b[3]<y-half))out.delete(source);}this.stats.boxRejected=this.stats.coarseQueried-out.size;this.stats.queried=out.size;return out;}
 certificate(anchor,span,basis,submissions){if(this.revision!==submissions.revision)throw Error('Cannot certify stale spatial index');return{anchor:anchor.slice(),span,basis,versions:new Map([...this.query(anchor,span,basis)].map(source=>[source,submissions.records.get(source)?.version]))};}
 validates(certificate,submissions){if(this.closed||this.revision<0||!submissions.ready||!certificate||!this.basis||[...certificate.basis.right,...certificate.basis.up].some((v,i)=>v!==this.basis[i]))return false;const candidates=this.query(certificate.anchor,certificate.span,certificate.basis);for(const[source,version]of certificate.versions)if(submissions.records.get(source)?.version!==version)return false;for(const[source,record]of submissions.records){if(certificate.versions.has(source))continue;if(this.versions.get(source)!==record.version)return false;if(candidates.has(source))return false;}return true;}
 clear(){this.provisional.clear();this.cells.clear();this.memberships.clear();this.sourceBoxes.clear();this.always.clear();this.versions.clear();this.revision=-1;}
 dispose(){this.closed=true;this.clear();this.basis=null;}
}
