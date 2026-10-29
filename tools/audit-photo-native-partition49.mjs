// Offline feasibility only. No production imports this file; no GPU or builds.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../web/node_modules/three/build/three.module.js';
import {CSM} from '../web/node_modules/three/examples/jsm/csm/CSM.js';
import {mergeGeometries} from '../web/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldEcology,refreshPlantBounds,treeBatchKey} from '../web/src/v2/ecology.js';
import {createSpruceLoader,spruceGeometryContainer,SpruceGeometryPool} from '../web/src/v2/spruce-loading.js';
import {applySpruceVolume} from '../web/src/v2/spruce-volume.js';
import {configureCSMDepth} from '../web/src/v2/depth-mode.js';
import {createNearShadowDetail,configureNearShadowDetail} from '../web/src/v2/near-shadow-detail.js';
import {SunShadowReceiverCulling} from '../web/src/v2/sun-shadow-receivers.js';
import {selectWaterReflectionPatch,createWaterReflectionCamera,WATER_REFLECTION_LIMITS} from '../web/src/v2/water-reflection.js';
import {sunPosition,sunDirection,beijingTime} from '../web/src/sun.js';

const baseline=JSON.parse(readFileSync(new URL('../docs/previews/v2-route-craft-38/gpu-runs49-forest.json',import.meta.url))),pose=baseline.before;
const world=actualForestWorld(undefined,'rgba'),eco=new WorldEcology(world),names=['column','edge','old','pencil','young'];
const loader=createSpruceLoader(),assets={},pool=new SpruceGeometryPool();
// Texture decode does not affect geometry, roots or conservative view predicates.
loader.register(()=>({name:'AUDIT_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new T.Texture())}));
for(const lod of ['hi','mid']){const b=readFileSync(new URL('../web/public/assets/v2/schrenk-spruce-'+lod+'.glb',import.meta.url));assets[lod]=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
applySpruceVolume(assets.hi,assets.mid);
for(const [lod,mode] of [['hi',5],['mid',1]]){
 const scene=assets[lod].scene,buckets=new Map();scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(!o.isMesh)return;const variant=names.findIndex(n=>o.name.startsWith(n+'_')),key=variant+':'+o.material.uuid;
  const b=buckets.get(key)??{variant,material:o.material,geometries:[]};buckets.set(key,b);
  const g=spruceGeometryContainer(o.geometry,o.matrixWorld);g.deleteAttribute('color');
  for(const [from,to]of [['_plant_wind','aPlantWind'],['_crown_occlusion','aCrownOcclusion']]){g.setAttribute(to,g.getAttribute(from));g.deleteAttribute(from);}b.geometries.push(g);
 });
 for(const b of buckets.values()){
  const g=pool.adopt(b.variant,b.material.name,b.geometries.length===1?b.geometries[0]:mergeGeometries(b.geometries));
  const mesh=new T.InstancedMesh(g,b.material,1600);mesh.count=0;mesh.customDepthMaterial=new T.MeshDepthMaterial();eco.nearParts.push({variant:b.variant,mode,mesh});
 }
}
const camera=new T.PerspectiveCamera(52,pose.viewport[0]/pose.viewport[1],.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.position.fromArray(pose.pose);camera.rotation.set(pose.pitch*Math.PI/180,-pose.yaw*Math.PI/180,0,'YXZ');camera.updateMatrixWorld();
eco.rebuildNearTrees(camera);eco.group.updateMatrixWorld(true);
assert.equal(eco.stats.treeHighActiveInstances,baseline.final.ecology.treeHighActiveInstances,'real high root contribution count');assert.equal(eco.stats.treeMidActiveInstances,baseline.final.ecology.treeMidActiveInstances,'real mid root contribution count');
const scene=new T.Scene(),s=sunPosition(world.meta.lat,world.meta.lon,beijingTime('2026-07-25 14:30:00')),sun=sunDirection(s.azimuth,s.elevation,new T.Vector3());
const detail=createNearShadowDetail({maxTextures:16,maxTextureSize:16384,cloudArraySampler:true,sharedOrmSampler:true},'auto');
const csm=new CSM({camera,parent:scene,cascades:detail.cascades,maxFar:500,mode:'custom',customSplitsCallback:detail.customSplitsCallback,shadowMapSize:detail.shadowMapSize,lightDirection:sun.clone().negate().normalize(),lightNear:1,lightFar:8000,lightMargin:2000});csm.fade=true;configureCSMDepth(csm,camera);const restoreSnap=configureNearShadowDetail(csm,detail,{reversedDepth:true});csm.update();scene.updateMatrixWorld(true);
for(const light of csm.lights)light.shadow.updateMatrices(light,camera);
const patch=selectWaterReflectionPatch(world.hydrology,camera);assert.ok(patch);const mirror=createWaterReflectionCamera(camera,patch.plane);assert.ok(mirror);
const receivers=new SunShadowReceiverCulling(csm.lights,{csm});receivers.update(camera,sun,{additionalCameras:[mirror]});
const frustum=c=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
const passes=[{name:'main.color',frustum:frustum(camera)},{name:'reflection.color',frustum:frustum(mirror),reflection:true},...csm.lights.map((l,i)=>({name:'main.shadow'+i,frustum:l.shadow.getFrustum()}))];
const sourceBatches=[...eco.nearTreeBatches.values()],partRecords=new Map();
for(const b of sourceBatches){const list=partRecords.get(b.partIndex)??{...b,records:[],activeRecords:[]};if(!partRecords.has(b.partIndex))partRecords.set(b.partIndex,list);list.records.push(...b.records);list.activeRecords.push(...b.activeRecords);}
const identity=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.id,r.x,r.y,r.z,r.s,r.sy,r.rot,r.variant]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
const inputSignature=[...partRecords.values()].map(p=>({part:p.partIndex,mode:p.mode,alpha:p.mesh.material.alphaTest,triangles:p.mesh.geometry.index.count/3,records:p.records.length,active:p.activeRecords.length,identity:identity(p.records)}));
function bounds(geometry,records){const p={geometry,userData:{},count:records.length,matrixWorld:new T.Matrix4()};refreshPlantBounds(p,records,camera.position,Infinity,0);if(!p.boundingBox.isEmpty())p.boundingBox.expandByVector(new T.Vector3(1.25,.4,1.25));p.boundingBox.getBoundingSphere(p.boundingSphere);return p;}
function accepted(g,pass){if(!g.count)return false;if(pass.reflection&&g.boundingSphere.center.distanceTo(patch.center)-g.boundingSphere.radius>WATER_REFLECTION_LIMITS.sceneRadius)return false;return pass.frustum.intersectsBox(g.boundingBox);}
const models=[];
for(const config of [{size:96},{size:48},{size:32},{size:48,highOnly:true},{size:32,highOnly:true}]){
 const {size,highOnly=false}=config;
 const groups=[],wind=new Map();let photos=0,solids=0,residentCapacity=0,active=0;
 for(const part of partRecords.values()){
  const photo=part.mesh.material.alphaTest>0,spatial=photo&&(!highOnly||part.mode===5)?size:96,byChunk=new Map(),activeIds=new Set(part.activeRecords.map(r=>r.id));
  for(const r of part.records){const key=treeBatchKey(r.x,r.z,spatial),list=byChunk.get(key)??[];if(!byChunk.has(key))byChunk.set(key,list);list.push(r);}
  for(const [chunk,records]of byChunk){const live=records.filter(r=>activeIds.has(r.id)),g=bounds(part.mesh.geometry,live),capacity=Math.max(64,records.length),family=photo?'photo-'+part.mode:'tree-solid';groups.push({g,part,family,records,live,chunk,capacity});if(photo)photos++;else solids++;residentCapacity+=capacity;active+=live.length;
   const key=part.mode+':'+part.variant+':'+spatial+':'+chunk;const prior=wind.get(key);if(prior){assert.equal(identity(prior.live),identity(live));prior.parts++;}else wind.set(key,{capacity,live,parts:1});
  }
 }
 const rows=passes.map(pass=>{const families={};let keptRootChecks=0;for(const group of groups){const {g,part,family,live}=group,hit=accepted(g,pass),f=families[family]??={draws:0,triangles:0,instances:0};if(hit){f.draws++;f.triangles+=g.count*part.mesh.geometry.index.count/3;f.instances+=g.count;}
  // Every conservative single-root contributor must remain in its parent group.
  for(const r of live)if(accepted(bounds(part.mesh.geometry,[r]),pass)){assert.ok(hit,pass.name+' loses '+r.id);keptRootChecks++;}
 }return{pass:pass.name,families,keptRootChecks};});
 models.push({photoMetres:size,highOnly,unchangedSolidMetres:96,residentPhotoBatches:photos,residentSolidBatches:solids,residentCapacity,activePartInstances:active,matrixCapacityBytes:residentCapacity*64,windGroups:wind.size,activeWindGroups:[...wind.values()].filter(w=>w.live.length).length,windCapacityBytes:[...wind.values()].reduce((n,w)=>n+w.capacity*20,0),windUploadBytes:[...wind.values()].reduce((n,w)=>n+w.live.length*20,0),staticGeometryShared:true,rows});
}
const expected={},actual=models[0];for(const r of baseline.result.baseline)if(/\.(photo-[15]|tree-solid)$/.test(r.base)){const key=r.base,e=expected[key]??={draws:0,triangles:0,instances:0};e.draws+=r.draws;e.triangles+=r.triangles;e.instances+=r.instances;}
const matches=[];for(const row of actual.rows)for(const [family,a]of Object.entries(row.families)){const key=row.pass+'.'+family,e=expected[key]??{draws:0,triangles:0,instances:0};matches.push({key,expected:e,actual:a,equal:e.draws===a.draws&&e.triangles===a.triangles&&e.instances===a.instances});}
const report={scope:'Offline actual current world roots, original GLB volume/attribute layout, complete existing wind boxes, original native predicates including actual CSM receiver domains and mirrored range. Near mode12/needle station path excluded and unchanged. No browser performance gain claimed.',pose,parts:inputSignature,sourceRootIds:identity([...partRecords.values()].flatMap(p=>p.records)),nearUnchanged:{residentInstances:baseline.final.ecology.treeNeedleResidentInstances,activeInstances:baseline.final.ecology.treeNeedleActiveInstances},models,baselineMatches:matches,allPhotoBaselineMatches:matches.filter(r=>r.key.includes('.photo-')).every(r=>r.equal),shadow:detail,receivers:receivers.stats};
assert.ok(report.allPhotoBaselineMatches,'Offline photo baseline must match actual browser draw/triangle/instance counts in every pass');
writeFileSync(new URL('reports/photo-native-partition49.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({models,baselineMatches:matches,allPhotoBaselineMatches:report.allPhotoBaselineMatches},null,2));
receivers.dispose();restoreSnap();csm.dispose();csm.remove();eco.dispose();pool.dispose();
