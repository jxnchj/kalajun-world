import {BoardwalkPlantContact39} from './boardwalk-plant-contact39.js';
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import * as THREE from "three";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {WorldEcology,decodeHabitatMap} from "./ecology.js";
import {householdYards,householdYardGeometry,householdYardMaterial,householdYardViewpoints,HOUSEHOLD_YARD_RECIPES} from "./household-yards.js";
import {householdStyle} from "./household-living.js";
import {WorldPaths} from "./paths.js";
import {createPathMaterials} from "./path-materials.js";
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
function ecology(w){const e=new WorldEcology(w);e.floraLocal=decodeHabitatMap(json("data/vegmap.json"),bin("data/vegmap.bin.gz"));e.floraCore=decodeHabitatMap(json("data/vegcore.json"),bin("data/vegcore.bin.gz"));return e;}

test('three authored yard studies share stable household identities, footprint and real public-route endpoint',()=>{
 const world=actual(),yards=householdYards(world);assert.strictEqual(householdYards(world),yards);assert.equal(yards.households.length,3);assert.equal(yards.routes.length,9);assert.equal(yards.stats.publicConnections,1);assert.equal(yards.routes.filter(r=>r.role==='service-side').length,3);
 for(const recipe of HOUSEHOLD_YARD_RECIPES){assert.equal(householdStyle(recipe.entityId),recipe.style);assert.ok(yards.households.some(h=>h.entityId===recipe.entityId));}
 for(const route of yards.routes){
  assert.ok(route.length>3);assert.ok(route.stations.length>route.length/.33);assert.ok(route.stations.every(p=>Number.isFinite(p.x+p.z+p.half)&&p.half>.15));
  for(let i=1;i<route.stations.length;i++)assert.ok(Math.hypot(route.stations[i].x-route.stations[i-1].x,route.stations[i].z-route.stations[i-1].z)<.34);
  if(route.connection){const p=route.stations.at(-1);assert.ok(Math.hypot(p.x-route.connection.point[0],p.z-route.connection.point[1])<1e-6);}
 }
 assert.ok(yards.stats.length>65);assert.equal(world.objects.paths.some(r=>r.id?.includes('yard')),false,'source route data is never mutated');
});

test('yard soil meshes retain upward faces and follow authoritative terrain without entering water or changing collision ground',t=>{
 const world=actual(),yards=householdYards(world);let triangles=0,vertices=0,minUp=1,maxGroundError=0;const groundBefore=yards.routes.flatMap(r=>r.stations.map(p=>world.surface.heightAt(p.x,p.z)));
 for(const route of yards.routes){
  const geometry=householdYardGeometry(world,route),p=geometry.attributes.position,index=geometry.index;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),height=world.surface.heightAt(x,z);maxGroundError=Math.max(maxGroundError,Math.abs(y-height-.018));
   assert.ok(Math.abs(y-height-.018)<.001,'path follows physical ground to float32 tolerance');assert.equal(world.hydrology.sampleAt(x,z).insideWater,false);minUp=Math.min(minUp,world.surface.normalAt(x,z,.25).y);
  }
  for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).y>0);}
  triangles+=index.count/3;vertices+=p.count;geometry.dispose();
 }
 assert.deepEqual(yards.routes.flatMap(r=>r.stations.map(p=>world.surface.heightAt(p.x,p.z))),groundBefore);assert.ok(minUp>.85,'sampled yard ground remains walkable');assert.ok(triangles>1000);
 const paths=new WorldPaths(world);assert.equal(paths.group.children.filter(m=>m.userData.kind==='household-yard').length,9);assert.equal(paths.stats.triangles,triangles);assert.equal(new Set(paths.group.children.filter(m=>m.userData.kind==='household-yard').map(m=>m.material)).size,1,'existing path PBR material reused');paths.dispose();
 t.diagnostic(JSON.stringify({length:yards.stats.length,triangles,vertices,minUp,maxGroundError,publicConnections:yards.stats.publicConnections}));
});

test('every existing grass identity survives the three yard footprints with deterministic suitable relocation',t=>{
 const world=actual(),before=ecology(world),after=ecology(world);// Isolate the authored yard relocation from the later adopted boardwalk layer.
 before.boardwalkPlantContact39=new BoardwalkPlantContact39(world,{enabled:false});after.boardwalkPlantContact39=new BoardwalkPlantContact39(world,{enabled:false});
 before.thresholdPlants.yardBins.clear();let roots=0,moved=0,unchanged=0,maxShift=0,maxBaselineDelta=0,unresolved=0;const seen=new Set(),perHouse=[];
 try{
  for(const household of householdYards(world).households){
   const stations=householdYards(world).routes.filter(r=>r.entityId===household.entityId).flatMap(r=>r.stations),minX=Math.min(...stations.map(p=>p.x))-6,maxX=Math.max(...stations.map(p=>p.x))+6,minZ=Math.min(...stations.map(p=>p.z))-6,maxZ=Math.max(...stations.map(p=>p.z))+6,report={entityId:household.entityId,roots:0,moved:0};
   for(let iz=Math.floor(minZ/.8);iz<=Math.ceil(maxZ/.8);iz++)for(let ix=Math.floor(minX/.8);ix<=Math.ceil(maxX/.8);ix++){
    const key=ix+','+iz;if(seen.has(key))continue;seen.add(key);const a=before.grassAt(ix,iz),b=after.grassAt(ix,iz);assert.equal(!!a,!!b,'yard keeps source-cell population');if(!a)continue;roots++;report.roots++;
    for(const k of ['id','s','sy','rot'])assert.equal(b[k],a[k]);const shift=Math.hypot(a.x-b.x,a.z-b.z);maxBaselineDelta=Math.max(maxBaselineDelta,shift);
    if(shift>1e-8){moved++;report.moved++;before.thresholdPlants.enabled=false;const source=before.grassAt(ix,iz);before.thresholdPlants.enabled=true;const sourceShift=Math.hypot(source.x-b.x,source.z-b.z);maxShift=Math.max(maxShift,sourceShift);assert.ok(sourceShift<=4.800001,'bound is measured from original source cell, not an already-relocated v32 position');assert.ok(!after.excluded(b.x,b.z,.3));}else{unchanged++;const {yardMove,...same}=b;assert.deepEqual(same,a,'unchanged positions preserve all original root data apart from new diagnostic reason');}
    unresolved+=b.thresholdUnresolved?1:0;assert.equal(after.thresholdPlants.intersectsYard(b,after.shoreGrassEnvelope),false,'complete moving blade envelope stays outside path '+JSON.stringify({ix,iz,a,b,near:householdYards(world).routes.map(r=>({id:r.id,d:Math.min(...r.stations.map(p=>Math.hypot(p.x-b.x,p.z-b.z)))}))}));assert.deepEqual(after.grassAt(ix,iz),b,'streaming/revisit preserves identity and placement');
   }
   perHouse.push(report);
  }
  assert.ok(roots>600);assert.ok(moved>20);assert.equal(unresolved,0);t.diagnostic(JSON.stringify({roots,moved,unchanged,maxShift,maxBaselineDelta,unresolved,perHouse}));
 }finally{before.dispose();after.dispose();}
});

test('field approaches wear out continuously and all yard views describe stable exterior positions',()=>{
 const w=actual();
 for(const route of householdYards(w).routes){const g=householdYardGeometry(w,route),a=g.attributes.aYardCoverage.array;assert.ok(a.every(x=>x>=0&&x<=1));assert.equal(a[0],1);assert.equal(a.at(-1),route.fieldEnd?0:1);if(route.fieldEnd)assert.ok(a.some(x=>x>0&&x<1));g.dispose();}
 const views=householdYardViewpoints(w);assert.equal(views.length,3);for(const v of views){assert.equal(v.id,'yard-'+householdStyle(v.entityId));assert.ok(v.y-w.surface.heightAt(v.x,v.z)>3.19);}
 const source=createPathMaterials(),material=householdYardMaterial(source.dirt),shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'};material.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('vYardCoverage=aYardCoverage'));assert.ok(shader.fragmentShader.includes('coverage*=vYardCoverage'));assert.strictEqual(material.map,source.dirt.map);material.dispose();source.dirt.dispose();source.wood.dispose();source.dispose();
});

test('yard wear follows fixed metre-scale ground while preserving all route stations and widths',t=>{
 const world=actual(),routes=householdYards(world).routes;let samples=0,minWear=1,maxWear=0,minEdge=1,maxEdge=0;
 for(const route of routes){
  const before=JSON.stringify(route.stations),a=householdYardGeometry(world,route),b=householdYardGeometry(world,route),wear=a.attributes.aYardSurface;
  assert.equal(wear.count,a.attributes.position.count);assert.equal(wear.itemSize,3);
  assert.deepEqual(wear.array,b.attributes.aYardSurface.array,'revisiting a household cannot animate or reshuffle bare soil patches');
  for(let i=0;i<wear.count;i++){
   assert.ok(Math.abs(wear.getX(i)-route.stations[Math.floor(i/5)].half*2)<1e-6,'edge distances use full physical route width in metres');
   for(const value of [wear.getY(i),wear.getZ(i)])assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
   minWear=Math.min(minWear,wear.getY(i));maxWear=Math.max(maxWear,wear.getY(i));minEdge=Math.min(minEdge,wear.getZ(i));maxEdge=Math.max(maxEdge,wear.getZ(i));samples++;
  }
  assert.equal(JSON.stringify(route.stations),before,'artistic wear does not change clearance or path circulation');a.dispose();b.dispose();
 }
 assert.ok(maxWear-minWear>.65,'actual yards include broad spatial variation');assert.ok(maxEdge-minEdge>.65,'actual edge erosion is not constant');
 t.diagnostic(JSON.stringify({samples,minWear,maxWear,minEdge,maxEdge}));
});

test('yard soil pigment and coverage reuse the base map without new time fields or texture allocations',()=>{
 const source=createPathMaterials(),sourceColour=source.dirt.color.clone(),sourceKey=source.dirt.customProgramCacheKey(),material=householdYardMaterial(source.dirt);
 try{
  const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader},uniformNames=Object.keys(shader.uniforms);
  material.onBeforeCompile(shader,{});
  assert.deepEqual(Object.keys(shader.uniforms),uniformNames);assert.strictEqual(material.map,source.dirt.map);assert.equal(material.roughness,source.dirt.roughness);assert.equal(material.transparent,false);
  assert.ok(source.dirt.color.equals(sourceColour));assert.equal(source.dirt.customProgramCacheKey(),sourceKey,'shared public roads retain their original material');
  assert.ok(material.color.r<sourceColour.r&&material.color.g<sourceColour.g&&material.color.b<sourceColour.b,'local soil retains a pigment distinct from the old pale fill');
  assert.match(shader.fragmentShader,/yardEdgeDistance=pathEdge\*vYardSurface\.x/);
  assert.match(shader.fragmentShader,/coverage\*=smoothstep\(\.20,\.39,vYardSurface\.y\)/);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb\*=mix\(\.82,1\.04,vYardSurface\.y\)/);
  assert.ok(shader.fragmentShader.indexOf('coverage*=vYardCoverage')<shader.fragmentShader.indexOf('if(coverage<=screenNoise)discard'));
 }finally{material.dispose();source.dirt.dispose();source.wood.dispose();source.dispose();}
});

test('actual complete flower assets retain all source IDs and replay on yard revisit',async t=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{flowerAssetsFromScene}=await import('./flower-assets.js');
 const make=async()=>{const e=ecology(actual());for(const [key,file] of [['flowerAssets','meadow-flowers-lod.glb'],['flowerNearAssets','meadow-flowers.glb']]){const data=readFileSync(new URL('assets/v2/'+file,root));e[key]=flowerAssetsFromScene((await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene);}
  e.flowerPools=e.flowerAssets.variants.filter(v=>v.role!=='seed').map(variant=>({variant,mesh:new THREE.InstancedMesh(variant.parts[0].geometry,variant.parts[0].material,8000),records:[],dirtyMin:Infinity,dirtyMax:0}));for(const p of e.flowerPools)e.group.add(p.mesh);return e;};
 const before=await make(),after=await make();before.thresholdPlants.yardBins.clear();const tiles=new Set();for(const r of householdYards(actual()).routes)for(const p of r.stations)for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)tiles.add((Math.floor(p.x/24)+x)+','+(Math.floor(p.z/24)+z));
 try{
  for(const key of tiles){const [x,z]=key.split(',').map(Number);before.addFlowers(x,z);after.addFlowers(x,z);}
  const records=e=>new Map([...e.flowerTiles.values()].flat().map(p=>[p.id,p])),a=records(before),b=records(after);assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());let moved=0,hits=0,unresolved=0;
  const pose=p=>Object.fromEntries(['id','x','y','z','s','rot'].map(k=>[k,p[k]]));
  for(const [id,p]of b){const old=a.get(id);assert.equal(p.s,old.s);assert.equal(p.rot,old.rot);assert.equal(p.pool.variant.id,old.pool.variant.id);if(p.x!==old.x||p.z!==old.z)moved++;hits+=after.thresholdPlants.intersectsYard(p,p.pool.shoreEnvelope)?1:0;unresolved+=p.thresholdUnresolved?1:0;}
  assert.ok(a.size>0);assert.equal(hits,0);assert.equal(unresolved,0);
  const saved=new Map([...b].map(([id,p])=>[id,pose(p)]));for(const key of tiles)after.removeFlowers(key);for(const key of tiles){const [x,z]=key.split(',').map(Number);after.addFlowers(x,z);}for(const [id,p]of records(after))assert.deepEqual(pose(p),saved.get(id));
  t.diagnostic(JSON.stringify({flowerRoots:a.size,moved,hits,unresolved,tiles:tiles.size}));
 }finally{before.dispose();after.dispose();}
});

test('actual standard PBR yard hooks compose with world CSM/cloud/aerial hooks and never cast opaque fade shadows',async()=>{
 const {CSM}=await import('three/addons/csm/CSM.js'),{WorldEnvironment}=await import('./environment.js'),{createCloudUniforms}=await import('./cloud-field.js'),{createAerialUniforms}=await import('./aerial-perspective.js');
 const camera=new THREE.PerspectiveCamera(60,1,.1,5000),scene=new THREE.Scene(),csm=new CSM({camera,parent:scene,cascades:3,maxFar:500});
 const paths=new WorldPaths(actual()),material=paths.group.children.find(m=>m.userData.kind==='household-yard').material,environment={csm,camera,clouds:createCloudUniforms(),aerial:createAerialUniforms(new THREE.Vector3(0,1,0)),registered:new Set()};
 try{
  WorldEnvironment.prototype.register.call(environment,[material]);const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,{});
  assert.equal(material.defines.USE_CSM,1);assert.equal(material.defines.CSM_CASCADES,3);assert.ok(shader.uniforms.CSM_cascades);assert.ok(shader.uniforms.uWorldCSMView);assert.match(material.customProgramCacheKey(),/yard-wear-35-world-aerial-physical-v3/);
  for(const marker of ['vYardCoverage=aYardCoverage','vPathUv=uv'])assert.equal(shader.vertexShader.split(marker).length-1,1);
  for(const marker of ['coverage*=vYardCoverage','material.multiScatteringCompensation','vCloudWorld','uAerial'])assert.ok(shader.fragmentShader.includes(marker),marker);
  assert.ok(shader.fragmentShader.indexOf('coverage*=vYardCoverage')<shader.fragmentShader.indexOf('if(coverage<=screenNoise)discard'));
  for(const mesh of paths.group.children.filter(m=>m.userData.kind==='household-yard')){assert.equal(mesh.castShadow,false,'ground decoration may receive but must not cast solid silhouettes at discarded edges');assert.equal(mesh.receiveShadow,true);assert.equal(mesh.material.isMeshStandardMaterial,true);}
 }finally{csm.dispose();csm.remove();paths.dispose();}
});
