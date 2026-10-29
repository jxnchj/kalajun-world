import {Box3,DynamicDrawUsage,Frustum,InstancedBufferAttribute,InstancedBufferGeometry,InstancedInterleavedBuffer,InterleavedBufferAttribute,Matrix4,Mesh,Vector3} from "three";
import {treeCullSphere,TREE_CULL_WIND} from "./tree-frustum-cull.js";
import {patchTreeWindAtlas44} from './tree-wind-atlas44.js';

const materialViews=new WeakMap();
const atlasMaterialViews=new WeakMap();
const MAX_VIEW_RECORDS=24;
const NATIVE_BOX_TEST=Frustum.prototype.intersectsBox;
function retainMaterial(source,atlas){
 if(!source||source.isRawShaderMaterial)throw new TypeError("Tree view batches require a Three material with the standard vertex prefix");
 let registry=materialViews;
 if(atlas){registry=atlasMaterialViews.get(atlas);if(!registry){registry=new WeakMap();atlasMaterialViews.set(atlas,registry);}}
 let entry=registry.get(source);
 if(!entry){
  const material=source.clone();entry={source,material,registry,references:0,version:-1};
  // Keep these wrappers installed once: WorldShadowDepth may subsequently wrap
  // the VIEW with projected-depth hooks. sync must never replace those hooks.
  material.onBeforeCompile=(shader,renderer)=>{source.onBeforeCompile.call(source,shader,renderer);if(atlas)patchTreeWindAtlas44(shader,atlas);};
  material.customProgramCacheKey=()=>source.customProgramCacheKey()+"-tree-view-instancing-v1"+(atlas?'-wind-atlas44':'');
  registry.set(source,entry);
 }
 entry.references++;syncMaterial(entry);return entry;
}
function syncMaterial(entry){
 const {source,material}=entry;if(entry.version===source.version)return;
 material.copy(source);material.userData={...source.userData,treeViewInstancing:true};
 material.defines={...source.defines,USE_INSTANCING:"",TREE_VIEW_SOURCE_VERSION:source.version};
 material.needsUpdate=true;entry.version=source.version;
}
function releaseMaterial(entry){if(--entry.references===0){entry.registry.delete(entry.source);entry.material.dispose();}}
const instanced=a=>a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer;
const version=a=>a?.data?.version??a?.version??-1;
function component(a,i,k){return a.isInterleavedBufferAttribute?a.data.array[i*a.data.stride+a.offset+k]:a.array[i*a.itemSize+k];}
function container(source){
 const g=new InstancedBufferGeometry();
 for(const [name,a]of Object.entries(source.attributes))g.setAttribute(name,instanced(a)&&!["aTreeRootWind","aTreeRootEddy"].includes(name)?a.clone():a);
 g.setIndex(source.index);g.groups=source.groups.map(v=>({...v}));g.drawRange={...source.drawRange};
 g.boundingBox=source.boundingBox?.clone()||null;g.boundingSphere=source.boundingSphere?.clone()||null;
 g.userData={ecologyWindAttributes:["aTreeRootWind","aTreeRootEddy"],treeViewGeometry:true};
 return g;
}
function releaseGeometry(g,owned){
 // Three owns attribute disposal per geometry, without reference counts. Detach
 // EVERY borrowed static/index/wind buffer before dispatching the dispose event.
 for(const name of Object.keys(g.attributes))if(!owned.has(name))g.deleteAttribute(name);
 g.setIndex(null);g.morphAttributes={};g.dispose();
}

/** Experimental draw proxy. Keep source off-scene as the sole CPU owner. Attach
 * only proxy to the source's former parent. Source.dispose() also releases this
 * proxy; neither path disposes source geometry/materials or calls source.dispose.
 * Directional custom-depth shadows only, matching this world's CSM path.
 * getFrame is optional; actual render hooks learn renderer.info.render.frame.
 */
export function installTreeViewBatch(source,{enabled=true,cacheIndices=true,reuseBuffers=new URLSearchParams(globalThis.location?.search||"").get("treeViewReuse")!=="0",sharePassRecords=new URLSearchParams(globalThis.location?.search||"").get("treeViewPassShare42")==="1",atlasBinding=null,stats={},getFrame}={}){
 if(!source?.isInstancedMesh||source.instanceColor||source.morphTexture||Array.isArray(source.material))throw new TypeError("Unsupported tree instance representation");
 if(source.castShadow&&!source.customDepthMaterial)throw new TypeError("Tree view proxy requires the original custom wind depth material");
 const geometry=source.geometry,sourceMatrix=source.instanceMatrix,capacity=source.instanceMatrix.count,wind=geometry.attributes.aTreeRootWind,eddy=geometry.attributes.aTreeRootEddy;
 if(!wind||!eddy||Object.keys(geometry.morphAttributes).length)throw new TypeError("Tree view proxy requires the original static root-wind geometry");
 for(const [name,a]of Object.entries(geometry.attributes))if(instanced(a)&&!['aTreeRootWind','aTreeRootEddy'].includes(name)
  &&!(a.isInstancedBufferAttribute&&a.count===1&&a.meshPerAttribute>=capacity))throw new TypeError("Unsupported per-root attribute: "+name);
 const atlas=atlasBinding?.owner;
 if(atlas&&(atlasBinding.source!==source||sharePassRecords))throw new Error('Tree wind atlas requires its own source binding and no pass-share experiment');
 const colour=retainMaterial(source.material,atlas),depth=source.customDepthMaterial?retainMaterial(source.customDepthMaterial,atlas):null,
  distance=source.customDistanceMaterial?retainMaterial(source.customDistanceMaterial,atlas):null;
 const full=container(geometry),fullMatrices=new InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(DynamicDrawUsage),
  fullForces=atlas?null:new InstancedInterleavedBuffer(new Float32Array(capacity*5),5).setUsage(DynamicDrawUsage),fullSlots=atlas?new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage):null;
 full.setAttribute("instanceMatrix",fullMatrices);
 if(atlas){full.deleteAttribute('aTreeRootWind');full.deleteAttribute('aTreeRootEddy');full.setAttribute('aTreeRootSlot44',fullSlots);}
 else{full.setAttribute("aTreeRootWind",new InterleavedBufferAttribute(fullForces,4,0));full.setAttribute("aTreeRootEddy",new InterleavedBufferAttribute(fullForces,1,4));}
 full.instanceCount=source.count;
 let fullMatrixVersion=-1,fullWindVersion=-1,fullEddyVersion=-1,fullCount=-1,fullSlotRevision=-1,fullAtlasRevision=-1;
 const proxy=new Mesh(full,colour.material);proxy.name=source.name+"-view";proxy.customDepthMaterial=depth?.material;proxy.customDistanceMaterial=distance?.material;
 proxy.userData={...source.userData,treeViewSource:source};proxy.layers=source.layers;proxy.frustumCulled=true;
 let visible=true,renderer=null,disposed=false,views=new WeakMap(),selections=new WeakMap(),selectionClock=0;
 const bufferReuse={value:reuseBuffers},indexCache={value:cacheIndices},selectionKey={predicate:null,state:null,revision:0,active:false,margin:0};
 Object.defineProperty(proxy,"visible",{configurable:true,get:()=>visible&&source.visible&&source.count>0,set:value=>{visible=!!value;}});
 Object.defineProperty(proxy,"instanceMatrix",{get:()=>source.instanceMatrix});
 Object.defineProperty(proxy,"boundingBox",{get:()=>source.boundingBox});Object.defineProperty(proxy,"boundingSphere",{get:()=>source.boundingSphere});
 proxy.computeBoundingSphere=()=>source.computeBoundingSphere();
 const poseParent=new Matrix4(),poseWorld=new Matrix4();let poseParentObject=null,poseReady=false,poseRevision=0;
 const records=new Set(),indices=new Uint32Array(capacity),matrix=new Matrix4(),combined=new Matrix4(),centre=new Vector3(),box=new Box3();
 const worldBounds=new Float64Array(capacity*6),boundsWorld=new Float64Array(16);let boundsVersion=-1,boundsCount=-1,boundsRevision=0;
 const batchWorldBox=new Box3(),batchValues=new Float64Array(6);let batchSourceBox=null,batchPoseRevision=-1,batchRevision=0;
 const constants=Object.entries(geometry.attributes).filter(([name,a])=>instanced(a)&&!["aTreeRootWind","aTreeRootEddy"].includes(name));
 const bytesPerView=capacity*(atlas?68:84)+constants.reduce((n,[,a])=>n+a.array.byteLength,0);
 // Keep the proven wind/morph support gate. For supported tall narrow trees,
 // the actual local box plus the COMPLETE wind box is much tighter than the
 // old circumsphere: tree height no longer becomes an artificial X/Z radius.
 const bound=treeCullSphere(geometry),boundsSource=geometry.userData.treeWindSource||geometry;
 if(bound&&!boundsSource.boundingBox)boundsSource.computeBoundingBox();
 const localBox=bound?boundsSource.boundingBox?.clone().expandByVector(new Vector3(...TREE_CULL_WIND)):null,
  localCentre=new Vector3(),localHalf=new Vector3(),supported=!!localBox&&!localBox.isEmpty()&&[...localBox.min,...localBox.max].every(Number.isFinite);
 if(supported){localBox.getCenter(localCentre);localBox.getSize(localHalf).multiplyScalar(.5);}
 const owned=new Set(["instanceMatrix","aTreeRootWind","aTreeRootEddy","aTreeRootSlot44",...constants.map(([name])=>name)]);
 Object.assign(stats,{queries:0,tested:0,selected:0,rejected:0,uploads:0,bytes:bytesPerView,viewGeometries:0,viewAllocations:0,viewRetirements:0,drawnInstances:0,draws:0,unsupportedBounds:!supported,capacityFallbacks:0,boundsBuilds:0,boundsBytes:worldBounds.byteLength,shadowCasterQueries:0,transformUpdates:0,batchBoundsBuilds:0,indexCacheHits:0,indexCacheMisses:0,indexCacheBypasses:0,indexTests:0,matrixCopies:0,forceCopies:0,fullMatrixCopies:0,fullForceCopies:0,layoutReuses:0,passShareEnabled:!!sharePassRecords,passShareHits:0,passShareTests:0});
 Object.assign(stats,{windAtlas44:!!atlas,slotCopies:0,fullSlotCopies:0});
 function sync(){
  if(disposed)return;
  if(source.geometry!==geometry||source.instanceMatrix!==sourceMatrix||source.instanceMatrix.count!==capacity||geometry.attributes.aTreeRootWind!==wind||geometry.attributes.aTreeRootEddy!==eddy||source.material!==colour.source||source.customDepthMaterial!==depth?.source)throw new Error("Reinstall the tree view proxy after replacing its source resources");
  if(source.count<0||source.count>capacity)throw new RangeError("Invalid tree active prefix");
  atlasBinding?.assertReady();
  syncMaterial(colour);if(depth)syncMaterial(depth);if(distance)syncMaterial(distance);
  full.instanceCount=source.count;proxy.count=source.count;proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;proxy.renderOrder=source.renderOrder;
  syncPose();
 }
 function syncPose(){
  // Off-scene sources do not receive scene matrix propagation. Compare exact
  // TRS/matrix values, avoiding repeated compose/quaternion callbacks when
  // only wind changes; manual matrices and parent changes still apply at once.
  const positionChanged=!proxy.position.equals(source.position),rotationChanged=!proxy.quaternion.equals(source.quaternion),scaleChanged=!proxy.scale.equals(source.scale);
  if(source.matrixAutoUpdate&&(!poseReady||positionChanged||rotationChanged||scaleChanged||!proxy.matrix.equals(source.matrix)))source.updateMatrix();
  if(positionChanged)proxy.position.copy(source.position);if(rotationChanged)proxy.quaternion.copy(source.quaternion);if(scaleChanged)proxy.scale.copy(source.scale);
  const localChanged=!proxy.matrix.equals(source.matrix);if(localChanged)proxy.matrix.copy(source.matrix);proxy.matrixAutoUpdate=source.matrixAutoUpdate;
  if(!poseReady||localChanged||proxy.parent!==poseParentObject||(proxy.parent&&!poseParent.equals(proxy.parent.matrixWorld))||!proxy.matrixWorld.equals(poseWorld)){
   if(proxy.parent){poseParent.copy(proxy.parent.matrixWorld);proxy.matrixWorld.multiplyMatrices(poseParent,source.matrix);}else proxy.matrixWorld.copy(source.matrix);
   poseParentObject=proxy.parent;poseWorld.copy(proxy.matrixWorld);poseReady=true;poseRevision++;stats.transformUpdates++;
  }
 }
 function batchIntersects(frustum){
  if(!source.visible||source.count===0)return false;
  const bounds=source.boundingBox;
  if(!bounds){if(batchSourceBox!==null){batchSourceBox=null;batchRevision++;}return true;}
  if(!frustum?.intersectsBox)return true;
  // The source envelope can be edited IN PLACE without any matrix revision.
  // Compare its identity and all six exact values; retain a separate box so
  // subsequent per-root queries cannot overwrite this shared coarse cache.
  if(bounds!==batchSourceBox||batchPoseRevision!==poseRevision
   ||bounds.min.x!==batchValues[0]||bounds.min.y!==batchValues[1]||bounds.min.z!==batchValues[2]
   ||bounds.max.x!==batchValues[3]||bounds.max.y!==batchValues[4]||bounds.max.z!==batchValues[5]){
   batchWorldBox.copy(bounds).applyMatrix4(proxy.matrixWorld);
   batchSourceBox=bounds;batchPoseRevision=poseRevision;
   batchValues[0]=bounds.min.x;batchValues[1]=bounds.min.y;batchValues[2]=bounds.min.z;
   batchValues[3]=bounds.max.x;batchValues[4]=bounds.max.y;batchValues[5]=bounds.max.z;
   batchRevision++;stats.batchBoundsBuilds++;
  }
  return !batchWorldBox.isEmpty()&&frustum.intersectsBox(batchWorldBox);
 }
 // The scheduler tracks a conservative caster SET, not an actual draw. It
 // must not select roots, allocate/copy instance buffers or change geometry.
 proxy.intersectsShadowCasterFrustum=frustum=>{
  if(disposed||!proxy.visible)return false;stats.shadowCasterQueries++;syncPose();return batchIntersects(frustum);
 };
 function restore(syncBuffers=true){
  if(disposed)return;
  // A rejected query/after hook restores only logical identity. Any path
  // that actually draws this full prefix calls the default synchronized form.
  // The CPU source never enters WebGLObjects, so it cannot own GPU instance
  // disposal. Even the full-prefix A/B uses private matrix/force buffers.
  if(syncBuffers&&(fullCount!==source.count||fullMatrixVersion!==source.instanceMatrix.version)){
   fullMatrices.array.set(source.instanceMatrix.array.subarray(0,source.count*16));fullMatrices.clearUpdateRanges();fullMatrices.addUpdateRange(0,source.count*16);fullMatrices.needsUpdate=true;fullMatrixVersion=source.instanceMatrix.version;stats.fullMatrixCopies++;
  }
  if(atlas&&syncBuffers&&(fullCount!==source.count||fullSlotRevision!==atlasBinding.revision||fullAtlasRevision!==atlas.layoutRevision)){
   atlasBinding.assertReady();fullSlots.array.set(atlasBinding.slots.subarray(0,source.count));fullSlots.clearUpdateRanges();fullSlots.addUpdateRange(0,source.count);fullSlots.needsUpdate=true;fullSlotRevision=atlasBinding.revision;fullAtlasRevision=atlas.layoutRevision;stats.fullSlotCopies++;stampAtlas(full);
  }
  if(!atlas&&syncBuffers&&(fullCount!==source.count||fullWindVersion!==version(wind)||fullEddyVersion!==version(eddy))){
   for(let i=0;i<source.count;i++){for(let k=0;k<4;k++)fullForces.array[i*5+k]=component(wind,i,k);fullForces.array[i*5+4]=component(eddy,i,0);}
   fullForces.clearUpdateRanges();fullForces.addUpdateRange(0,source.count*5);fullForces.needsUpdate=true;fullWindVersion=version(wind);fullEddyVersion=version(eddy);stats.fullForceCopies++;
  }
  if(syncBuffers)fullCount=source.count;full.instanceCount=source.count;proxy.count=source.count;proxy.geometry=full;
 }
 function stampAtlas(g){g.userData.treeWindAtlasRevision44=atlas.layoutRevision;g.userData.treeWindSlotRevision44=atlasBinding.revision;}
 function assertAtlasDraw(g){
  if(!atlas)return;atlasBinding.assertReady();
  if(g.userData.treeWindAtlasRevision44!==atlas.layoutRevision||g.userData.treeWindSlotRevision44!==atlasBinding.revision)throw new Error('Tree wind atlas layout changed after this render item was captured');
 }
 function retire(record){releaseGeometry(record.geometry,owned);record.retired=true;records.delete(record);stats.viewRetirements++;}
 function allocate(frame){
  // Native render.frame counts main, output and reflection renders. A dormant
  // cadence-delayed cascade can therefore be old yet still useful. Retire only
  // under capacity pressure; unrelated new views must not churn its VBOs.
  if(records.size>=MAX_VIEW_RECORDS)for(const record of records)if(record.frame<frame-2)retire(record);
  // Transient precompile frustums must not accumulate permanent VBOs. If all
  // slots may still be referenced, draw the full prefix until they can retire.
  if(records.size>=MAX_VIEW_RECORDS){stats.capacityFallbacks++;return null;}
  const g=container(geometry),matrices=new InstancedBufferAttribute(new Float32Array(capacity*16),16).setUsage(DynamicDrawUsage),
   forces=atlas?null:new InstancedInterleavedBuffer(new Float32Array(capacity*5),5).setUsage(DynamicDrawUsage),slots=atlas?new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage):null;
  g.setAttribute("instanceMatrix",matrices);
  if(atlas){g.deleteAttribute('aTreeRootWind');g.deleteAttribute('aTreeRootEddy');g.setAttribute('aTreeRootSlot44',slots);}
  else{g.setAttribute("aTreeRootWind",new InterleavedBufferAttribute(forces,4,0));g.setAttribute("aTreeRootEddy",new InterleavedBufferAttribute(forces,1,4));}
  g.instanceCount=0;
  const r={geometry:g,matrices,forces,slots,indices:new Uint32Array(capacity),count:0,matrixVersion:-1,windVersion:-1,eddyVersion:-1,slotRevision:-1,atlasRevision:-1,frame:-Infinity};
  records.add(r);stats.viewAllocations++;stats.viewGeometries=records.size;stats.bytes=(records.size+1)*bytesPerView;return r;
 }
 function selectionState(frustum){
  if(!indexCache.value||frustum.planes?.length!==6)return null;
  const predicate=frustum.intersectsBox;
  const state=predicate===NATIVE_BOX_TEST?null:predicate?.treeViewCullState;
  if(predicate!==NATIVE_BOX_TEST&&(state?.original!==NATIVE_BOX_TEST||!Number.isSafeInteger(state.revision)))return null;
  selectionKey.predicate=predicate;selectionKey.state=state;selectionKey.revision=state?.revision??0;
  selectionKey.active=state?.active??false;selectionKey.margin=selectionKey.active?state.margin:0;
  return selectionKey;
 }
 function sameSelection(entry,key,frustum){
  if(entry.predicate!==key.predicate||entry.state!==key.state||entry.revision!==key.revision||entry.active!==key.active||entry.margin!==key.margin
   ||entry.boundsRevision!==boundsRevision||entry.batchRevision!==batchRevision)return false;
  for(let i=0;i<6;i++){
   const p=frustum.planes[i],o=i*4;
   if(entry.planes[o]!==p.normal.x||entry.planes[o+1]!==p.normal.y||entry.planes[o+2]!==p.normal.z||entry.planes[o+3]!==p.constant)return false;
  }
  return true;
 }
 function storeSelection(entries,key,frustum,count){
  let entry;
  if(entries.length<2){entry={planes:new Float64Array(24),indices:new Uint32Array(capacity)};entries.push(entry);}
  else entry=entries[0].used<=entries[1].used?entries[0]:entries[1];
  Object.assign(entry,key,{boundsRevision,batchRevision,count,used:++selectionClock});
  for(let i=0;i<6;i++){
   const p=frustum.planes[i],o=i*4;entry.planes[o]=p.normal.x;entry.planes[o+1]=p.normal.y;entry.planes[o+2]=p.normal.z;entry.planes[o+3]=p.constant;
  }
  entry.indices.set(indices.subarray(0,count));return entry;
 }
 function sameLayout(r,count,selectedIndices){
  if(r.count!==count||r.matrixVersion!==source.instanceMatrix.version)return false;
  for(let j=0;j<count;j++)if(r.indices[j]!==selectedIndices[j])return false;return true;
 }
 function same(r,count,selectedIndices){
  if(atlas)return r.slotRevision===atlasBinding.revision&&r.atlasRevision===atlas.layoutRevision&&sameLayout(r,count,selectedIndices);
  return r.windVersion===version(wind)&&r.eddyVersion===version(eddy)&&sameLayout(r,count,selectedIndices);
 }
 function select(frustum){
  if(disposed)return false;sync();stats.queries++;
  // Baseline and optimized paths use the SAME original batch-level bounds.
  // Disabling compaction must not disable the accepted coarse frustum test.
  if(!batchIntersects(frustum)){restore(!bufferReuse.value);return false;}
  const active=typeof enabled==="function"?enabled():typeof enabled==="object"?enabled.value:enabled;
  if(!active||!supported||!frustum?.intersectsBox){restore();return true;}
  const world=proxy.matrixWorld.elements;
  if(boundsVersion!==source.instanceMatrix.version||boundsCount!==source.count||world.some((v,i)=>v!==boundsWorld[i])){
   for(let i=0;i<source.count;i++){
    matrix.fromArray(source.instanceMatrix.array,i*16);combined.multiplyMatrices(proxy.matrixWorld,matrix);
    centre.copy(localCentre).applyMatrix4(combined);
    const e=combined.elements,guard=.03+Math.max(Math.abs(centre.x),Math.abs(centre.y),Math.abs(centre.z))*.000002;
    // Absolute linear coefficients give the exact world AABB of the inflated
    // local box, including rotated/non-uniform parents and their shear.
    const x=Math.abs(e[0])*localHalf.x+Math.abs(e[4])*localHalf.y+Math.abs(e[8])*localHalf.z+guard,
     y=Math.abs(e[1])*localHalf.x+Math.abs(e[5])*localHalf.y+Math.abs(e[9])*localHalf.z+guard,
     z=Math.abs(e[2])*localHalf.x+Math.abs(e[6])*localHalf.y+Math.abs(e[10])*localHalf.z+guard,o=i*6;
    worldBounds[o]=centre.x-x;worldBounds[o+1]=centre.y-y;worldBounds[o+2]=centre.z-z;
    worldBounds[o+3]=centre.x+x;worldBounds[o+4]=centre.y+y;worldBounds[o+5]=centre.z+z;
    if(![x,y,z,centre.x,centre.y,centre.z].every(Number.isFinite))worldBounds[o]=NaN;
   }
   boundsVersion=source.instanceMatrix.version;boundsCount=source.count;boundsWorld.set(world);boundsRevision++;stats.boundsBuilds++;
  }
  const key=selectionState(frustum);let entries=key?selections.get(frustum):null,selection=null;
  if(entries)for(const entry of entries)if(sameSelection(entry,key,frustum)){selection=entry;break;}
  let count=0,selectedIndices=indices;
  if(selection){count=selection.count;selectedIndices=selection.indices;selection.used=++selectionClock;stats.indexCacheHits++;}
  else{
   if(key)stats.indexCacheMisses++;else stats.indexCacheBypasses++;
   for(let i=0;i<source.count;i++){
    const o=i*6;box.min.fromArray(worldBounds,o);box.max.fromArray(worldBounds,o+3);
    // Only known predicates with an exact state contract can skip this query.
    // Wind revisions affect the upload below, never this fixed-envelope set.
    if(!Number.isFinite(worldBounds[o])||frustum.intersectsBox(box))indices[count++]=i;
   }
   stats.indexTests+=source.count;
   if(key){if(!entries){entries=[];selections.set(frustum,entries);}selection=storeSelection(entries,key,frustum,count);selectedIndices=selection.indices;}
  }
  // Retain the public logical counts so A/B root ratios remain comparable;
  // indexTests measures the work actually performed after cache hits.
  stats.tested+=source.count;stats.selected+=count;stats.rejected+=source.count-count;
  if(!count){restore(!bufferReuse.value);return false;}
  let view=views.get(frustum)?.filter(r=>!r.retired)||[];views.set(frustum,view);
  const frame=getFrame?getFrame():renderer?.info?.render?.frame??0;
  let record=view.find(r=>same(r,count,selectedIndices));
  if(!record&&sharePassRecords){
   // Different main/mirror/cascade Frustum objects may select the exact same
   // roots. Reuse their immutable record only while every source version and
   // ordered index agrees. Ownership stays in records, not the per-view lists.
   // Any later mutation still goes through the existing frame < frame - 1 gate.
   for(const candidate of records){
    stats.passShareTests++;
    if(same(candidate,count,selectedIndices)){
     record=candidate;view.push(record);stats.passShareHits++;break;
    }
   }
  }
  if(!record){
   // Never overwrite a renderItem captured in this or the immediately previous
   // render frame (main/mirror). Reuse older slots, avoiding per-frame VBOs.
   // A matching layout is not safe to mutate while a render list can still
   // reference it. Wind-only reuse therefore selects an OLD matching slot,
   // never the current draw's VBO, even if the CPU indices are identical.
   let keepLayout=false;
   if(bufferReuse.value){record=view.find(r=>r.frame<frame-1&&sameLayout(r,count,selectedIndices));keepLayout=!!record;}
   if(!record)record=view.find(r=>r.frame<frame-1);
   if(!record){record=allocate(frame);if(!record){restore();return true;}view.push(record);}
   if(!keepLayout){
    for(let j=0;j<count;j++){
     const src=selectedIndices[j];record.indices[j]=src;
     for(let k=0;k<16;k++)record.matrices.array[j*16+k]=source.instanceMatrix.array[src*16+k];
    }
    record.matrices.clearUpdateRanges();record.matrices.addUpdateRange(0,count*16);record.matrices.needsUpdate=true;stats.matrixCopies++;
   }else stats.layoutReuses++;
   if(atlas){
    for(let j=0;j<count;j++)record.slots.array[j]=atlasBinding.slots[selectedIndices[j]];
    record.slots.clearUpdateRanges();record.slots.addUpdateRange(0,count);record.slots.needsUpdate=true;record.slotRevision=atlasBinding.revision;record.atlasRevision=atlas.layoutRevision;stats.slotCopies++;stampAtlas(record.geometry);
   }else{
    for(let j=0;j<count;j++){
     const src=selectedIndices[j];
     for(let k=0;k<4;k++)record.forces.array[j*5+k]=component(wind,src,k);
     record.forces.array[j*5+4]=component(eddy,src,0);
    }
    record.forces.clearUpdateRanges();record.forces.addUpdateRange(0,count*5);record.forces.needsUpdate=true;stats.forceCopies++;
   }
   record.count=count;record.matrixVersion=source.instanceMatrix.version;record.windVersion=version(wind);record.eddyVersion=version(eddy);
   record.geometry.instanceCount=count;
   stats.uploads++;
  }
  record.frame=frame;proxy.geometry=record.geometry;return true;
 }
 proxy.intersectsFrustum=select;
 proxy.onBeforeRender=(r,...args)=>{renderer=r;assertAtlasDraw(args[2]);source.onBeforeRender.call(source,r,...args);stats.draws++;stats.drawnInstances+=args[2].instanceCount;};
 proxy.onAfterRender=(r,...args)=>{try{source.onAfterRender.call(source,r,...args);}finally{restore(!bufferReuse.value);}};
 proxy.onBeforeShadow=(r,object,camera,shadowCamera,g,material,group)=>{
  renderer=r;if(material!==proxy.customDepthMaterial&&material!==proxy.customDistanceMaterial)throw new Error("Tree view proxy does not support an unadapted shadow material");
  assertAtlasDraw(g);
  source.onBeforeShadow.call(source,r,object,camera,shadowCamera,g,material,group);stats.draws++;stats.drawnInstances+=g.instanceCount;
 };
 proxy.onAfterShadow=(...args)=>{try{source.onAfterShadow.apply(source,args);}finally{restore(!bufferReuse.value);}};
 function dispose(){
  if(disposed)return;disposed=true;source.removeEventListener("dispose",dispose);proxy.removeFromParent();
  for(const record of records)releaseGeometry(record.geometry,owned);records.clear();views=new WeakMap();selections=new WeakMap();releaseGeometry(full,owned);
  releaseMaterial(colour);if(depth)releaseMaterial(depth);if(distance)releaseMaterial(distance);atlasBinding?.release();stats.viewGeometries=0;stats.bytes=0;stats.boundsBytes=0;
 }
 source.addEventListener("dispose",dispose);sync();restore();return {proxy,dispose,sync,restore,stats,source,indexCache,bufferReuse};
}
