import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../../web/node_modules/three/build/three.module.js';
import {actualForestWorld} from '../benchmark_forest_exclusion_v38.mjs';
import {WorldEcology} from '../../web/src/v2/ecology.js';
import {refreshPlantBounds} from '../../web/src/v2/ecology.js';
import {createSpruceLoader,spruceGeometryContainer} from '../../web/src/v2/spruce-loading.js';
import {applySpruceVolume} from '../../web/src/v2/spruce-volume.js';
import {terrainRowWorkerPolicy} from '../../web/src/v2/terrain-row-worker-client.js';
import {CSM} from '../../web/node_modules/three/examples/jsm/csm/CSM.js';
import {configureCSMDepth} from '../../web/src/v2/depth-mode.js';
import {createNearShadowDetail,configureNearShadowDetail} from '../../web/src/v2/near-shadow-detail.js';
import {SunShadowReceiverCulling} from '../../web/src/v2/sun-shadow-receivers.js';
import {selectWaterReflectionPatch,createWaterReflectionCamera,WATER_REFLECTION_LIMITS} from '../../web/src/v2/water-reflection.js';
import {sunPosition,sunDirection,beijingTime} from '../../web/src/sun.js';

const world=actualForestWorld(undefined,'rgba'),assets={},names=['column','edge','old','pencil','young'];
const loader=createSpruceLoader();loader.register(()=>({name:'TEST_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new T.Texture())}));
for(const lod of ['hi','mid']){const b=readFileSync(new URL('../../web/public/assets/v2/schrenk-spruce-'+lod+'.glb',import.meta.url));assets[lod]=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
applySpruceVolume(assets.hi,assets.mid);
function ecology(enabled){const e=new WorldEcology(world,{treeHighPhoto48:enabled});
 for(const [lod,mode]of [['hi',5],['mid',1]]){const source=assets[lod].scene;source.updateMatrixWorld(true);source.traverse(o=>{if(!o.isMesh)return;const geometry=spruceGeometryContainer(o.geometry,o.matrixWorld);
  for(const [from,to]of [['_plant_wind','aPlantWind'],['_crown_occlusion','aCrownOcclusion']]){geometry.setAttribute(to,geometry.getAttribute(from));geometry.deleteAttribute(from);}
  const material=o.material.clone(),mesh=new T.InstancedMesh(geometry,material,1600);mesh.customDepthMaterial=new T.MeshDepthMaterial();e.nearParts.push({mode,variant:names.findIndex(n=>o.name.startsWith(n+'_')),mesh});e.materials.push(material);
 });}return e;
}
const residents=e=>[...e.nearTreeBatches.values()].flatMap(b=>b.records.map(r=>[b.partIndex+':'+r.id,r.x,r.y,r.z,r.s,r.sy,r.rot])).sort((a,b)=>a[0].localeCompare(b[0]));
const state=e=>new Map([...e.nearTreeBatches.values()].flatMap(b=>b.activeRecords.map((r,i)=>[b.partIndex+':'+r.id,{matrix:Array.from(new Uint32Array(b.mesh.instanceMatrix.array.buffer,b.mesh.instanceMatrix.array.byteOffset+i*64,16)),wind:Array.from(new Uint32Array(b.mesh.geometry.attributes.aTreeRootWind.data.array.buffer,i*20,5))}])));
test('mode5-only 48m native partition preserves actual roots and exact matrices/wind across movement and retirement',t=>{
 const a=ecology(false),b=ecology(true),camera={position:new T.Vector3(-3611.851169467755,2329.157270885741,4805.483400316967)},origin=camera.position.clone();
 const retired=new Map();let atOrigin;
 try{for(const [step,offset]of [0,.001,12.1,48.1,96.1,0,700,0].entries()){
  camera.position.copy(origin);camera.position.x+=offset;
  for(const e of [a,b]){e.rebuildNearTrees(camera);e.windField.update(4+step,camera.position);e.treeRootWind.update(e.nearTreeBatches,e.windField,4+step,e.treeBatchRevision);}
  assert.deepEqual(residents(b),residents(a));assert.deepEqual(state(b),state(a));
  for(const e of [a,b])for(const batch of e.nearTreeBatches.values()){
   const m=batch.mesh,template=e.nearParts[batch.partIndex].mesh,wanted=e===b&&batch.mode===5&&m.material.alphaTest>0?48:96;
   for(const r of batch.records)assert.equal(batch.chunk,Math.floor(r.x/wanted)+','+Math.floor(r.z/wanted));
   assert.strictEqual(m.geometry.attributes.position,template.geometry.attributes.position);assert.strictEqual(m.geometry.index,template.geometry.index);assert.strictEqual(m.material,template.material);assert.strictEqual(m.customDepthMaterial,template.customDepthMaterial);
   if(!retired.has(m.geometry)){retired.set(m.geometry,0);m.geometry.addEventListener('dispose',()=>retired.set(m.geometry,retired.get(m.geometry)+1));}
  }
  if(!step){assert.equal(b.treeHighPhoto48,true);assert.equal(a.treeHighPhoto48,false);atOrigin={oldBatches:a.nearTreeBatches.size,newBatches:b.nearTreeBatches.size,oldWindBytes:a.treeRootWind.stats.bytes,newWindBytes:b.treeRootWind.stats.bytes,oldWindRoots:a.treeRootWind.stats.roots,newWindRoots:b.treeRootWind.stats.roots};assert.equal(atOrigin.newBatches-atOrigin.oldBatches,30);assert.equal(atOrigin.newWindBytes-atOrigin.oldWindBytes,1560);assert.equal(atOrigin.oldWindRoots,atOrigin.newWindRoots);}
 }}finally{a.dispose();b.dispose();}
 for(const count of retired.values())assert.equal(count,1,'each observed owner geometry retires once');assert.equal(a.treeRootWind.allocations.size,0);assert.equal(b.treeRootWind.allocations.size,0);
 t.diagnostic(JSON.stringify({atOrigin,positions:8,source:'actual current hi/mid GLB and root generation',unchanged:true}));
});
test('candidate remains explicit OFF by default and does not disable the terrain worker',()=>{
 const e=new WorldEcology(world);try{assert.equal(e.treeHighPhoto48,false);}finally{e.dispose();}
 for(const value of ['0','1'])assert.deepEqual(terrainRowWorkerPolicy('?view=river-forest&treeHighPhoto48='+value),{requested:true,compatible:true,enabled:true});
 assert.equal(terrainRowWorkerPolicy('?treeHighPhoto48=1&futureSurfaceVariant=1').enabled,false);
 assert.throws(()=>new WorldEcology(world,{treeHighPhoto48:true,treeBatchSize:64}),/requires native 96m/);
 assert.throws(()=>new WorldEcology(world,{treeHighPhoto48:true,treeWindAtlas44:true}),/requires native 96m/);
});
test('review-only hot switch after actual 289m movement is rejected while fixed URL modes stay exact',t=>{
 const a=ecology(false),b=ecology(true),start=new T.Vector3(-3611.851169467755,2329.157270885741,4805.483400316967),end=new T.Vector3(-3689.0795388471156,2311.836006170602,4526.779127051337),camera={position:start.clone()};
 let mismatch;
 try{
  // Reproduce streamed-tree updates along the actual browser's endpoint segment.
  // These are fixed construction modes, matching normal URL-selected operation.
  for(let i=0;i<=25;i++){
   camera.position.lerpVectors(start,end,i/25);
   for(const e of[a,b]){e.rebuildNearTrees(camera);e.windField.update(4+i*.25,camera.position);e.treeRootWind.update(e.nearTreeBatches,e.windField,4+i*.25,e.treeBatchRevision);}
   assert.deepEqual(residents(b),residents(a));assert.deepEqual(state(b),state(a));
  }
  // This is unsupported review-helper mutation, not a production UI action.
  // Existing 96m solid groups keep swap-removal order, newly made 96m foliage
  // joins their wind buffer with source order. Preserve the strict validator.
  b.treeHighPhoto48=false;b.rebuildNearTrees(camera);
  const groups=new Map();
  for(const batch of b.nearTreeBatches.values()){
   const buffer=batch.mesh.geometry.attributes.aTreeRootWind.data,previous=groups.get(buffer);
   if(!previous)groups.set(buffer,batch);
   else if(previous.activeRecords.some((r,i)=>r.id!==batch.activeRecords[i]?.id)){
    mismatch={mode:batch.mode,chunk:batch.chunk,firstPart:previous.partIndex,secondPart:batch.partIndex,firstAlpha:previous.mesh.material.alphaTest,secondAlpha:batch.mesh.material.alphaTest,
     firstOrder:previous.activeRecords.map(r=>r.id),secondOrder:batch.activeRecords.map(r=>r.id)};break;
   }
  }
  assert.ok(mismatch,'actual-source sequence reproduces the failed hot switch');
  assert.throws(()=>b.treeRootWind.update(b.nearTreeBatches,b.windField,11,b.treeBatchRevision),/Shared tree wind parts must retain identical active root order/);
  b.treeHighPhoto48=true;b.rebuildNearTrees(camera);b.treeRootWind.update(b.nearTreeBatches,b.windField,10.25,b.treeBatchRevision);
  assert.deepEqual(residents(b),residents(a));assert.deepEqual(state(b),state(a));
  t.diagnostic(JSON.stringify({fixedModePositions:26,rootMatrixWindExact:true,hotSwitchFailure:mismatch,restoredCandidateExact:true}));
 }finally{a.dispose();b.dispose();}
});
test('runtime native grouping reproduces audited actual main, mirror and three receiver-aware CSM contributions',()=>{
 const a=ecology(false),b=ecology(true),audit=JSON.parse(readFileSync(new URL('../reports/photo-native-partition49.json',import.meta.url))),p=audit.pose;
 const camera=new T.PerspectiveCamera(52,1280/800,.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.position.fromArray(p.pose);camera.rotation.set(p.pitch*Math.PI/180,-p.yaw*Math.PI/180,0,'YXZ');camera.updateMatrixWorld();
 const scene=new T.Scene(),s=sunPosition(world.meta.lat,world.meta.lon,beijingTime('2026-07-25 14:30:00')),sun=sunDirection(s.azimuth,s.elevation,new T.Vector3()),detail=createNearShadowDetail({maxTextures:16,maxTextureSize:16384,cloudArraySampler:true,sharedOrmSampler:true},'auto');
 const csm=new CSM({camera,parent:scene,cascades:detail.cascades,maxFar:500,mode:'custom',customSplitsCallback:detail.customSplitsCallback,shadowMapSize:detail.shadowMapSize,lightDirection:sun.clone().negate().normalize(),lightNear:1,lightFar:8000,lightMargin:2000});csm.fade=true;configureCSMDepth(csm,camera);const restoreSnap=configureNearShadowDetail(csm,detail,{reversedDepth:true});csm.update();scene.updateMatrixWorld(true);for(const light of csm.lights)light.shadow.updateMatrices(light,camera);
 const patch=selectWaterReflectionPatch(world.hydrology,camera),mirror=createWaterReflectionCamera(camera,patch.plane),receivers=new SunShadowReceiverCulling(csm.lights,{csm});receivers.update(camera,sun,{additionalCameras:[mirror]});
 const frustum=c=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth),passes=[{name:'main.color',f:frustum(camera)},{name:'reflection.color',f:frustum(mirror),reflection:true},...csm.lights.map((l,i)=>({name:'main.shadow'+i,f:l.shadow.getFrustum()}))];
 try{for(const [j,e]of [a,b].entries()){
  e.rebuildNearTrees(camera);e.group.updateMatrixWorld(true);const model=audit.models.find(m=>m.photoMetres===(j?48:96)&&m.highOnly===!!j);
  for(const pass of passes){const actual={'photo-1':{draws:0,triangles:0,instances:0},'photo-5':{draws:0,triangles:0,instances:0}};
   const range=m=>!pass.reflection||m.boundingSphere.center.distanceTo(patch.center)-m.boundingSphere.radius<=WATER_REFLECTION_LIMITS.sceneRadius;
   for(const batch of e.nearTreeBatches.values()){
    const m=batch.mesh;if(!(m.material.alphaTest>0))continue;const hit=m.visible&&range(m)&&m.intersectsFrustum(pass.f);if(hit){const r=actual['photo-'+batch.mode];r.draws++;r.triangles+=m.count*m.geometry.index.count/3;r.instances+=m.count;}
    for(const root of batch.activeRecords){const probe={geometry:m.geometry,userData:{},count:1,matrixWorld:new T.Matrix4()};refreshPlantBounds(probe,[root],camera.position,Infinity,0).expandByVector(new T.Vector3(1.25,.4,1.25));probe.boundingBox.getBoundingSphere(probe.boundingSphere);if(range(probe)&&probe.intersectsFrustum(pass.f))assert.ok(hit,pass.name+' must retain '+root.id);}
   }
   const expected=model.rows.find(r=>r.pass===pass.name).families;for(const key of Object.keys(actual))assert.deepEqual(actual[key],expected[key],pass.name+'/'+key);
  }
 }}finally{a.dispose();b.dispose();receivers.dispose();restoreSnap();csm.dispose();csm.remove();}
});
