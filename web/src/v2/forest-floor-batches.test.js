import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { WorldEcology, refreshPlantBounds } from './ecology.js';
import { ForestFloor } from './forest-floor.js';
import { forestFloorBatchesEnabled } from './forest-floor-batches.js';
import { createWorldData, decodeHeightBytes } from './world-data.js';
import { configureCSMDepth } from './depth-mode.js';
import { selectWaterReflectionPatch, createWaterReflectionCamera } from './water-reflection.js';
import { sunPosition, sunDirection, beijingTime } from '../sun.js';
const root=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,root))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
function rgbPNG(name){
 const file=readFileSync(new URL(name,root)),parts=[];let width,height;
 for(let i=8;i<file.length;){const n=file.readUInt32BE(i),tag=file.toString("ascii",i+4,i+8),data=file.subarray(i+8,i+8+n);
  if(tag==="IHDR"){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],2);assert.equal(data[12],0);}
  if(tag==="IDAT")parts.push(data);i+=n+12;
 }
 const packed=inflateSync(Buffer.concat(parts)),stride=width*3,decoded=new Uint8Array(stride*height),data=new Uint8Array(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=packed[y*(stride+1)];for(let x=0;x<stride;x++){
  const a=x<3?0:decoded[y*stride+x-3],b=y?decoded[(y-1)*stride+x]:0,c=y&&x>=3?decoded[(y-1)*stride+x-3]:0;
  const prediction=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):NaN;assert.ok(Number.isFinite(prediction));
  decoded[y*stride+x]=(packed[y*(stride+1)+x+1]+prediction)&255;
 }}
 for(let i=0;i<width*height;i++){data.set(decoded.subarray(i*3,i*3+3),i*4);data[i*4+3]=255;}
 return{width,height,data};
}
const worlds=new Map();
function actual(riverMeanders){
 if(worlds.has(riverMeanders))return worlds.get(riverMeanders);
 const meta=json("data/scene.json");
 const world=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
  coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
  detailBytes:bin("data/detail.bin.gz"),coreLandcover:rgbPNG("data/core_landcover.png"),farLandcover:rgbPNG("data/far_landcover.png"),riverMeanders});
 worlds.set(riverMeanders,world);return world;
}

function view(world){
 const point=world.hydrology.viewpoints.find(v=>v.id==='river-forest'),c=new THREE.PerspectiveCamera(52,1280/800,.25,150000);
 c._reversedDepth=true;c.updateProjectionMatrix();c.position.set(point.x,world.surface.heightAt(point.x,point.z)+point.above,point.z);
 c.rotation.set(point.pitch*Math.PI/180,-point.yaw*Math.PI/180,0,'YXZ');c.updateMatrixWorld();return c;
}
function ready(floor,camera){for(let i=0;i<512;i++){floor.update(camera);if(!floor.stats.pending)return;}throw new Error('Forest floor did not finish streaming');}
function roots(floor){return [...floor.pools].flatMap(([kind,pool])=>pool.records.map(p=>[p.id,kind,p.x,p.y,p.z,p.s,p.rot,p.pitch,...pool.mesh.instanceMatrix.array.slice(p.slot*16,p.slot*16+16)])).sort((a,b)=>a[0].localeCompare(b[0]));}
function assertPartition(floor){
 const seen=new Set();let count=0;
 for(const batch of floor.submission.batches.values()){
  const source=batch.pool.mesh,mesh=batch.mesh;
  assert.strictEqual(mesh.geometry,source.geometry);assert.strictEqual(mesh.material,source.material);assert.strictEqual(mesh.customDepthMaterial,source.customDepthMaterial);
  assert.equal(mesh.castShadow,source.castShadow);assert.equal(mesh.receiveShadow,source.receiveShadow);assert.ok(mesh.count<=mesh.instanceMatrix.count);
  assert.equal(mesh.count,batch.records.length);assert.equal(source.parent,null);
  for(const [i,r]of batch.records.entries()){
   assert.ok(!seen.has(r.id));seen.add(r.id);count++;
   assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(i*16,i*16+16)),Array.from(source.instanceMatrix.array.slice(r.slot*16,r.slot*16+16)),r.id+' original Float32 transform');
  }
 }
 assert.equal(count,[...floor.pools.values()].reduce((n,p)=>n+p.records.length,0));return seen;
}
const frustum=c=>new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);

test('actual river roots and matrices survive block boundaries, streaming additions/removals and same-page rollback',t=>{
 const world=actual(),old=new WorldEcology(world),next=new WorldEcology(world),camera=view(world),origin=camera.position.clone();
 old.forestFloor.setSpatialBatches(false);next.forestFloor.setSpatialBatches(true);const a=old.forestFloor,b=next.forestFloor;let previous=new Set(),added=0,removed=0;
 try{
  for(const offset of [0,.001,12.1,48.1,-72.1,0,240]){
   camera.position.copy(origin);camera.position.x+=offset;camera.position.y=world.surface.heightAt(camera.position.x,camera.position.z)+1.8;
   ready(a,camera);ready(b,camera);assert.deepEqual(roots(b),roots(a));const current=assertPartition(b);
   for(const id of current)if(!previous.has(id))added++;for(const id of previous)if(!current.has(id))removed++;previous=current;
   const authoritative=roots(b);b.setSpatialBatches(false);assert.deepEqual(roots(b),authoritative);
   assert.equal(b.group.children.length,5);for(const p of b.pools.values())assert.equal(p.mesh.parent,b.group);
   b.setSpatialBatches(true);assert.deepEqual(roots(b),authoritative);assertPartition(b);
  }
  assert.ok(added>0&&removed>0);t.diagnostic(JSON.stringify({added,removed,resident:b.stats.spatialBatches.residentInstances,blocks:b.stats.spatialBatches.batches,scope:'real geographic roots and original matrices; no resident filtering'}));
 }finally{old.dispose();next.dispose();}
});

test('main, water reflection and all reversed CSM views preserve every contributing real understory root',t=>{
 const world=actual(),eco=new WorldEcology(world),floor=eco.forestFloor,camera=view(world),scene=new THREE.Scene();floor.setSpatialBatches(true);ready(floor,camera);floor.group.updateMatrixWorld(true);assertPartition(floor);
 const sun=sunPosition(world.meta.lat,world.meta.lon,beijingTime('2026-07-25 14:30:00'));
 const csm=new CSM({camera,parent:scene,cascades:3,maxFar:500,mode:'custom',customSplitsCallback:(n,near,far,a)=>a.push(60/far,180/far,1),shadowMapSize:2048,lightDirection:sunDirection(sun.azimuth,sun.elevation,new THREE.Vector3()).negate(),lightNear:1,lightFar:8000,lightMargin:2000});
 csm.fade=true;configureCSMDepth(csm,camera);csm.update();scene.updateMatrixWorld(true);
 const views=[['main',frustum(camera)],...csm.lights.map((light,i)=>{light.shadow.updateMatrices(light,camera);return['csm'+i,light.shadow.getFrustum()];})],patch=selectWaterReflectionPatch(world.hydrology,camera);assert.ok(patch);const mirror=createWaterReflectionCamera(camera,patch.plane);assert.ok(mirror);views.push(['mirror',frustum(mirror)]);
 try{
  const costs={};
  for(const[name,f]of views){
   let before=0,after=0,callsBefore=0,callsAfter=0,contributors=0;
   for(const pool of floor.pools.values()){
    if(pool.mesh.intersectsFrustum(f)){before+=pool.mesh.count*(pool.mesh.geometry.index?.count??pool.mesh.geometry.attributes.position.count)/3;callsBefore++;}
   }
   for(const batch of floor.submission.batches.values()){
    const m=batch.mesh,draw=m.intersectsFrustum(f);
    if(draw){after+=m.count*(m.geometry.index?.count??m.geometry.attributes.position.count)/3;callsAfter++;}
    for(const r of batch.records){
     const probe={geometry:m.geometry,userData:{},count:1,matrixWorld:new THREE.Matrix4()},box=refreshPlantBounds(probe,[r],camera.position,batch.pool.range,0);
     if(!box.isEmpty()&&f.intersectsBox(box)){contributors++;assert.ok(draw,name+' must retain '+r.id);}
    }
   }
   assert.ok(after<=before,name+' spatial blocks cannot submit more triangles than the full visible pool');
   costs[name]={before,after,callsBefore,callsAfter,contributors};
  }
  assert.ok(costs.main.after<costs.main.before);assert.ok(costs.main.contributors>0);
  t.diagnostic(JSON.stringify({costs,scope:'CPU submissions over actual full geometry and original range; GPU and pixels require browser'}));
 }finally{eco.dispose();csm.dispose();csm.remove();}
});

test('camera-only range updates do not upload matrices, and retired blocks never dispose shared assets',()=>{
 const world={landcoverAt:(x,z)=>({r:.6+.22*Math.sin(x/16),g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}},floor=new ForestFloor(world,{spatialBatches:true,bounds:refreshPlantBounds,depth:()=>new THREE.MeshDepthMaterial()}),camera={position:new THREE.Vector3(0,101.7,0)};
 let geometryDisposals=0,materialDisposals=0,depthDisposals=0,blockDisposals=0;
 for(const pool of floor.pools.values()){pool.mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);pool.mesh.material.addEventListener('dispose',()=>materialDisposals++);pool.mesh.customDepthMaterial.addEventListener('dispose',()=>depthDisposals++);}
 ready(floor,camera);const refs=new Map([...floor.submission.batches.values()].map(b=>[b,{version:b.mesh.instanceMatrix.version,buffer:b.mesh.instanceMatrix.array}]));
 const uploads=floor.submission.stats.matrixUploads,refreshes=floor.submission.stats.boundsRefreshes;
 camera.position.x+=.001;floor.update(camera);
 assert.equal(floor.submission.stats.matrixUploads,uploads);assert.ok(floor.submission.stats.boundsRefreshes>refreshes);
 for(const[b,ref]of refs){assert.equal(b.mesh.instanceMatrix.version,ref.version);assert.strictEqual(b.mesh.instanceMatrix.array,ref.buffer);b.mesh.addEventListener('dispose',()=>blockDisposals++);}
 floor.setSpatialBatches(false);camera.position.set(1200,101.7,-1200);ready(floor,camera);floor.setSpatialBatches(true);assertPartition(floor);
 assert.ok(blockDisposals>0);assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);assert.equal(depthDisposals,0);
 floor.dispose();assert.equal(geometryDisposals,5);assert.equal(materialDisposals,5);assert.equal(depthDisposals,5);assert.equal(floor.submission.batches.size,0);
 assert.equal(forestFloorBatchesEnabled('?floorBatches=0'),false);assert.equal(forestFloorBatchesEnabled(''),false);assert.equal(forestFloorBatchesEnabled('?floorBatches=1'),true);assert.equal(forestFloorBatchesEnabled('?floorBatches=other'),false);
});


test('normal world entry keeps original pool submission until explicitly opting into the candidate',()=>{
 const world={landcoverAt:()=>({r:0,g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}},floor=new ForestFloor(world);
 try{assert.equal(floor.submission.enabled,false);assert.equal(floor.group.children.length,5);for(const pool of floor.pools.values())assert.strictEqual(pool.mesh.parent,floor.group);assert.equal(floor.submission.batches.size,0);}
 finally{floor.dispose();}
});
