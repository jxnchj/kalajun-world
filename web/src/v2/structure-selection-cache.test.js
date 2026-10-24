// Original-source comparison explicitly retains original timber; default timber is exercised by actual endpoint and household physics tests.
// Retained original-source comparison fixture; new default source is covered by lodge-furniture-loader.test.js.
import {WorldDoors} from "./doors.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldStructures} from './structures.js';
import {createStructureSelection} from './structure-selection.js';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const RESULTS=['visibleBatches','visibleTriangles','shadowBatches','culledDetailInstances','lowLODInstances','activeTriangles','revision'];
function fixture(enabled){
 const s=new WorldStructures({entities:[]},{selectionCache:enabled});s.stats.status='ready';
 const matrices=[new THREE.Matrix4().makeTranslation(0,0,-20),new THREE.Matrix4().makeTranslation(0,0,-120)],entities=['near','far'],scales=[1,1],worldBounds=matrices.map(m=>new THREE.Box3(new THREE.Vector3(-3,-1,-3),new THREE.Vector3(3,8,3)).applyMatrix4(m)),distances=new Float64Array(2);
 s._selectionBins.push({worldBounds,distances});
 for(const role of ['body','interior','roof-grass']){
  const geometry=new THREE.BoxGeometry(4,8,4),material=new THREE.MeshStandardMaterial(),part={geometry,material,role,low:{error:.01}},make=far=>{
   const m=new THREE.InstancedMesh(geometry,material,2);matrices.forEach((a,i)=>m.setMatrixAt(i,a));m.computeBoundingBox();m.computeBoundingSphere();m.instanceMatrix.needsUpdate=true;m.count=far?0:2;m.visible=!far;m.castShadow=false;m.userData.activeEntityIds=far?[]:entities.slice();s.group.add(m);return m;
  };
  s._batches.push({mesh:make(false),lodMesh:make(true),part,matrices,worldBounds,scales,distances,entities,nearSelection:'0,1',farSelection:'',nearBuffer:createStructureSelection(2,true),farBuffer:createStructureSelection(2),detailState:new Uint8Array(2).fill(1),lodState:new Uint8Array(2)});
 }
 s.camera=new THREE.PerspectiveCamera(60,1,.1,2000);return s;
}
function snapshot(s){return {stats:Object.fromEntries(RESULTS.map(k=>[k,s.stats[k]??0])),b:s._batches.map(b=>({detail:[...b.detailState],lod:[...b.lodState],near:b.nearSelection,far:b.farSelection,meshes:[b.mesh,b.lodMesh].filter(Boolean).map(m=>({count:m.count,visible:m.visible,castShadow:m.castShadow,ids:m.userData.activeEntityIds,matrix:[...m.instanceMatrix.array],box:m.boundingBox?.toJSON?.()??[m.boundingBox.min.toArray(),m.boundingBox.max.toArray()],sphere:[m.boundingSphere.center.toArray(),m.boundingSphere.radius]}))}))};}
function both(a,b){a.update(a.camera,.016);b.update(b.camera,.016);assert.deepEqual(snapshot(a),snapshot(b));}
test('stable real update skips selection only; independent living/entry updates and native matrices still execute',()=>{
 const a=fixture(false),b=fixture(true);let living=0,entry=0;b.householdLiving={update(){living++;}};b.householdEntrySteps={update(){entry++;}};
 both(a,b);const versions=b._batches.map(x=>x.mesh.instanceMatrix.version);
 for(let i=0;i<4;i++)both(a,b);
 assert.equal(b.selectionCache.stats.hits,4);assert.equal(living,5);assert.equal(entry,5);assert.equal(b.stats.distanceTests,0);assert.deepEqual(b._batches.map(x=>x.mesh.instanceMatrix.version),versions);
 b.selectionCache.enabled=false;both(a,b);assert.equal(b.stats.distanceTests,2);assert.equal(b.selectionCache.data,null);
 b.selectionCache.enabled=true;both(a,b);both(a,b);assert.equal(b.selectionCache.stats.hits,5);
});
const mutations={
 'camera translation':s=>{s.camera.position.z=70;},
 'camera rotation':s=>{s.camera.rotation.y=.7;},
 'camera projection':s=>{s.camera.zoom=2;s.camera.updateProjectionMatrix();},
 'group transform':s=>{s.group.position.x=22;},
 'direct manual mesh matrix':s=>{const m=s._batches[0].mesh;m.updateMatrix();m.matrixAutoUpdate=false;m.matrix.elements[12]+=5;},
 'source bounds':s=>{s._batches[1].worldBounds[1].min.z-=300;s._batches[1].worldBounds[1].max.z-=300;},
 'source scale':s=>{s._batches[0].scales[1]=.05;},
 'source matrix':s=>{s._batches[0].matrices[0].elements[13]=7;},
 'source identities':s=>{s._batches[0].entities[1]='replaced';},
 'part role':s=>{s._batches[1].part.role='body';},
 'LOD error':s=>{s._batches[0].part.low.error=4;},
 'hysteresis detail':s=>{s._batches[1].detailState[1]^=1;},
 'hysteresis lod':s=>{s._batches[0].lodState[1]^=1;},
 'selection buffer':s=>{s._batches[0].nearBuffer.previousCount=0;},
 'selection key':s=>{s._batches[0].nearSelection='external';},
 'mesh count':s=>{s._batches[0].mesh.count=0;},
 'mesh visibility':s=>{s._batches[0].mesh.visible=false;},
 'mesh shadow override':s=>{s._batches[0].mesh.castShadow=false;},
 'instance version':s=>{s._batches[0].mesh.instanceMatrix.needsUpdate=true;},
 'mesh bounds':s=>{s._batches[0].mesh.boundingBox.min.x-=500;},
 'mesh sphere':s=>{s._batches[0].mesh.boundingSphere.radius+=400;},
 'geometry replacement':s=>{s._batches[0].mesh.geometry=s._batches[0].mesh.geometry.clone();},
 'triangle count':s=>{s._batches[0].mesh.geometry.index.count-=3;},
 'material identity':s=>{s._batches[0].mesh.material=s._batches[0].mesh.material.clone();},
 'material transparent':s=>{s._batches[0].mesh.material.transparent=true;},
 'thin glass':s=>{s._batches[0].mesh.material.userData.lodgeThinGlass=true;},
 'shadow distance':s=>{s.shadowDistance=1;},
 'distance mode':s=>{s.selectionReuse=false;},
 'buffer mode':s=>{s.selectionBuffers=false;},
 'replace batches':s=>{s._batches=s._batches.slice().reverse();},
 'add batch':s=>{s._batches.push({...s._batches[0]});},
 'remove batch':s=>{s._batches.pop();},
};
for(const [name,mutate]of Object.entries(mutations))test('native equivalence and immediate invalidation: '+name,()=>{
 const a=fixture(false),b=fixture(true);both(a,b);both(a,b);const misses=b.selectionCache.stats.misses;
 mutate(a);mutate(b);both(a,b);assert.equal(b.selectionCache.stats.misses,misses+1,name);both(a,b);
});
test('optics/GI values remain live without invalidating unrelated selection; source clear releases references',()=>{
 const a=fixture(false),b=fixture(true);both(a,b);for(const s of[a,b]){s._batches[0].mesh.material.opacity=.4;s._batches[0].mesh.material.color.set('red');s._batches[0].mesh.material.roughness=.2;}
 both(a,b);assert.equal(b.selectionCache.stats.hits,1);assert.equal(b._batches[0].mesh.material.opacity,.4);b.selectionCache.clear();assert.equal(b.selectionCache.data,null);assert.equal(b.selectionCache.sources.length,0);
});
test('actual checked-in cabin meshes and two representative placement fixtures retain exact native result across near/far/rotation and material edits',async()=>{
 globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
 const entities=[{id:'near',assetId:'cabin_small',x:20,z:20,rot:.32,scale:{x:1,y:1,z:1}},{id:'far',assetId:'cabin_small',x:235,z:235,rot:-.57,scale:{x:1.2,y:.9,z:.8}}];
 const load=async enabled=>{
  const s=new WorldStructures({entities,surface:{buildingPose:e=>({...e,y:2200})}},{guestVanity:false,lodgeFurniture:false,lodgeChairs:false,cabinTimber:false,selectionCache:enabled,cooperativePreparation:false});
  s.loadAsset=async path=>{const bytes=await readFile(new URL('../../public/'+path.replace(/^\.\//,''),import.meta.url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
  await s.load();s.camera=new THREE.PerspectiveCamera(60,1.6,.1,200000);return s;
 };
 const a=await load(false),b=await load(true);
 try{
  for(const [x,z]of[[20,20],[235,235],[40000,40000],[20,20]]){
   for(const s of[a,b]){s.camera.position.set(x,2201.6,z);s.camera.lookAt(0,2200,0);}
   both(a,b);both(a,b);
   for(const s of[a,b])s.camera.rotation.y+=.3;both(a,b);both(a,b);
  }
  for(const s of[a,b])s._batches[0].mesh.material.transparent=true;both(a,b);both(a,b);
  assert.equal(a.stats.instances,b.stats.instances);assert.equal(a.stats.triangles,b.stats.triangles);assert.ok(b.selectionCache.stats.hits>=9);
 }finally{a.dispose();b.dispose();}
});
test('current complete 364-entity/18-asset set retains native selection with stable cache and actual shared bins',async t=>{
 globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
 const {createEntities}=await import('./world-data.js'),json=async p=>JSON.parse(await readFile(new URL('../../public/'+p,import.meta.url)));
 const objects=await json('data/objects.json'),manifest=await json('world-v2/manifest.json'),entities=createEntities(objects,manifest.assetMetadata);
 assert.equal(entities.length,364);
 const doors=new WorldDoors({document:null,eventTarget:null});
 const s=new WorldStructures({entities,surface:{buildingPose:e=>({...e,y:2200})}},{guestVanity:false,lodgeFurniture:false,lodgeChairs:false,cabinTimber:false,doors,selectionCache:false,cooperativePreparation:false});
 s.loadAsset=async path=>{const bytes=await readFile(new URL('../../public/'+path.replace(/^\.\//,''),import.meta.url));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 await s.load();const camera=new THREE.PerspectiveCamera(60,1.6,.1,200000);
 try {
  assert.equal(s.stats.assetsLoaded,18);
  for(const e of [entities[0],entities.find(e=>e.assetId==='gh_lanchuan_lodge'),entities.find(e=>e.assetId==='yurt')]){
   assert.ok(e);camera.position.set(e.x,2201.6,e.z);camera.lookAt(e.x+30,2202,e.z+10);
   s.selectionCache.enabled=false;s.update(camera,.016);const expected=snapshot(s);
   s.selectionCache.enabled=true;s.update(camera,.016);assert.deepEqual(snapshot(s),expected);
   const hits=s.selectionCache.stats.hits;s.update(camera,.016);assert.deepEqual(snapshot(s),expected);assert.equal(s.selectionCache.stats.hits,hits+1);
   assert.equal(s.stats.distanceTests,0);
  }
  t.diagnostic(JSON.stringify({entities:entities.length,assets:s.stats.assetsLoaded,batches:s._batches.length,guardValues:s.selectionCache.stats.values,sharedInputArrays:s.selectionCache.sources.length}));
 }finally{s.dispose();doors.dispose();}
});
test('detached distance/bin-bound arrays remain exact inputs after their reference replacement was captured',()=>{
 for(const kind of ['bounds','distances']){
  const a=fixture(false),b=fixture(true);both(a,b);
  for(const s of [a,b]){
   if(kind==='bounds')s._selectionBins[0].worldBounds=s._selectionBins[0].worldBounds.map(box=>box.clone());
   else s._batches[1].distances=s._batches[1].distances.slice();
  }
  both(a,b);both(a,b);const misses=b.selectionCache.stats.misses;
  for(const s of [a,b]){
   if(kind==='bounds'){s._selectionBins[0].worldBounds[1].min.z-=500;s._selectionBins[0].worldBounds[1].max.z-=500;}
   else s._batches[1].distances[1]=0;
  }
  both(a,b);assert.equal(b.selectionCache.stats.misses,misses+1);both(a,b);
 }
});

test('material partitions share distance work and invalidate changed source index mappings',()=>{
 const s=fixture(true),base=s._selectionBins[0],derived={worldBounds:[base.worldBounds[1]],distances:new Float64Array(1),sourceDistances:base.distances,sourceIndices:[1]};
 s._selectionBins.push(derived);s.update(s.camera,.016);
 assert.equal(s.stats.distanceTests,2);assert.equal(derived.distances[0],base.distances[1]);
 s.update(s.camera,.016);assert.equal(s.stats.distanceTests,0);const misses=s.selectionCache.stats.misses;
 derived.sourceIndices[0]=0;s.update(s.camera,.016);
 assert.equal(s.selectionCache.stats.misses,misses+1);assert.equal(s.stats.distanceTests,2);assert.equal(derived.distances[0],base.distances[0]);
});
