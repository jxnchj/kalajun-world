import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {projectSegment} from './hydrology.js';
import {WorldEcology,decodeHabitatMap,cellRandom} from './ecology.js';
import {grassStemFeet,brookGrassIntersectsWater,brookShoulderSuitable,seatBrookShoulderGrass,valleyShoulderSuitable} from './brook-shoulder-grass.js';
import {riverSectionAt,riverBankRise} from './river-section.js';
import {CSM} from 'three/addons/csm/CSM.js';
import {WorldEnvironment} from './environment.js';
import {getShoreStoneField} from './shore-contact.js';
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


import {createWaterGeometry} from './water.js';
for(const sectionProfile of [false,true])test('actual wide valley shares curved water and terrain while keeping network interfaces and all source grass identities'+(sectionProfile?' with asymmetric bed':''),async t=>{
 const saved=globalThis.location;let base,w,old,fresh;try{globalThis.location={search:'?valleyLandform=1&valleyMeanders=0&valleySection=0'};base=actual('valley-baseline');old=ecology(base);globalThis.location={search:'?valleyLandform=1&valleyMeanders=1'+(sectionProfile?'&valleySection=1':'&valleySection=0')};w=actual('valley-curved-'+sectionProfile);fresh=ecology(w);}finally{globalThis.location=saved;}
 assert.equal(w.hydrology.stats.forestBankCurvature38,true,'exercise adopted forest/valley composition');
 assert.ok(w.forestShoulderSourceWorld,'forest source remains available on the main world');
 assert.equal(fresh.valleyBanks.sourceWorld.forestShoulderSourceWorld,undefined,'old-valley selection must not redirect into the new-valley forest alias');
 const h=w.hydrology,result=h.stats.valleyMeanders;assert.ok(result.nodes>20);assert.ok(result.maxOffset>4);const v=h.viewpoints.find(v=>v.id==='river-valley');
 let waterVertices=0,roads=0;for(const line of h.lines){const before=base.hydrology.lines.find(l=>l.id===line.id);assert.deepEqual([line.nodes[0].x,line.nodes[0].z,line.nodes.at(-1).x,line.nodes.at(-1).z],[before.nodes[0].x,before.nodes[0].z,before.nodes.at(-1).x,before.nodes.at(-1).z]);line.nodes.forEach((n,i)=>assert.equal(n.level,before.nodes[i].level));if(line.join)for(const k of [0,1]){const a=line.join.line.nodes[line.join.index+k],b=before.join.line.nodes[before.join.index+k];assert.equal(a.x,b.x);assert.equal(a.z,b.z);}}
 for(const s of h.segments.filter(s=>s.meander&&s.lineId===result.lineId)){const g=createWaterGeometry([s],{detail:true});for(let i=0;i<g.attributes.position.count;i++){const x=g.attributes.position.getX(i),y=g.attributes.position.getY(i),z=g.attributes.position.getZ(i),q=h.sampleAt(x,z,{includeDepth:false});assert.ok(Math.abs(q.surfaceLevel+.006-y)<.0003);assert.ok(w.surface.heightAt(x,z)<=y+.015);waterVertices++;}g.dispose();}
 for(const routes of [w.objects.tracks||[],w.objects.paths||[],w.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){const a=route.pts[i-1],b=route.pts[i],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5);for(let j=0;j<=count;j++){const x=a[0]+(b[0]-a[0])*j/count,z=a[1]+(b[1]-a[1])*j/count;assert.equal(w.surface.heightAt(x,z),base.surface.heightAt(x,z));roads++;}}
 for(const e of base.entities)assert.deepEqual(w.surface.buildingPose(e.id),base.surface.buildingPose(e.id));
 let sources=0,moved=0,wet=0,maxShift=0,inside=0,treeSources=0;const missing=[],wetRoots=[];
 for(let iz=Math.floor((v.z-105)/.8);iz<Math.ceil((v.z+105)/.8);iz++)for(let ix=Math.floor((v.x-45)/.8);ix<Math.ceil((v.x+45)/.8);ix++){
  const a=old.grassAt(ix,iz);if(!a)continue;sources++;let b;try{b=fresh.grassAt(ix,iz);}catch(e){missing.push({id:a.id,error:e.message});a.brookAsset?.dispose();continue;}
  if(!b){missing.push({id:a.id,reason:'missing'});a.brookAsset?.dispose();continue;}
  assert.equal(a.id,b.id);for(const k of ['s','sy','rot'])assert.equal(a[k],b[k]);
  const d=Math.hypot(b.x-a.x,b.z-a.z);if(d>.001)moved++;maxShift=Math.max(maxShift,d);if(w.hydrology.sampleAt(b.x,b.z,{includeDepth:false}).insideWater)inside++;
  if(b.brookAsset){wet++;for(const foot of b.brookAsset.feet)assert.ok(foot.y<=w.surface.heightAt(foot.x,foot.z)+1e-5);wetRoots.push(b);}a.brookAsset?.dispose();
 }
 for(let iz=Math.floor((v.z-105)/12);iz<Math.ceil((v.z+105)/12);iz++)for(let ix=Math.floor((v.x-45)/12);ix<Math.ceil((v.x+45)/12);ix++){const a=old.originalTreeAt(ix,iz);if(a){treeSources++;assert.deepEqual(fresh.originalTreeAt(ix,iz),a);}}
 t.diagnostic(JSON.stringify({result,waterVertices,roads,sources,moved,wet,maxShift,inside,treeSources,missing}));assert.equal(missing.length,0);assert.equal(inside,0);assert.ok(moved>100&&waterVertices>100);
 const {WorldTerrain}=await import('./terrain.js'),{createTerrainSurfaceContact}=await import('./terrain-surface-contact.js'),{refreshBrookWetContact}=await import('./brook-wetgrass.js');
 const terrain=new WorldTerrain(w),patches=new Map();for(const r of wetRoots)for(const groups of r.brookAsset.seating)for(const group of groups)for(const p of group.points){const x=Math.floor(p.x/20)*20,z=Math.floor(p.z/20)*20,key=x+','+z;if(patches.has(key))continue;const n=terrain._node(x,z,20,12,null),job=terrain._job(n);while(job.row<=32)terrain._buildRow(job);terrain._finish(job);n.mesh.visible=true;patches.set(key,n);}
 const contact=createTerrainSurfaceContact({roots:[...patches.values()]}),tile={wet:wetRoots,wetMeshes:[]};fresh.setTerrainSurfaceContact(contact);fresh.addBrookWetMeshes(tile);const pending=wetRoots.filter(r=>r.renderContact.pending);t.diagnostic(JSON.stringify({actualTerrainPatches:patches.size,wetRoots:wetRoots.length,pending:pending.map(r=>({id:r.id,x:r.x,z:r.z,delta:r.renderContact.minDelta}))}));assert.equal(pending.length,0,'all retained wet roots must be visible on actual settled terrain triangles');assert.equal(refreshBrookWetContact(w,tile,contact).pending,0);fresh.disposeBrookWetTile(tile);for(const n of patches.values())terrain._release(n);terrain.dispose();old.dispose();fresh.dispose();
});

for(const sectionProfile of [false,true,'adopt'])test('full flower assets keep source identities, species and scale while following the shared valley banks'+(sectionProfile==='adopt'?' after default adoption':sectionProfile?' with asymmetric bed':''),async t=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{flowerAssetsFromScene}=await import('./flower-assets.js');
 const saved=globalThis.location;let base,w;try{globalThis.location={search:sectionProfile==='adopt'?'?valleyLandform=0&valleyMeanders=0&valleySection=0':'?valleyLandform=1&valleyMeanders=0&valleySection=0'};base=actual('flower-baseline-'+sectionProfile);globalThis.location={search:sectionProfile==='adopt'?'':'?valleyLandform=1&valleyMeanders=1'+(sectionProfile?'&valleySection=1':'&valleySection=0')};w=actual('flower-curved-'+sectionProfile);}finally{globalThis.location=saved;}
 const make=async world=>{const e=ecology(world);for(const [key,file]of [['flowerAssets','meadow-flowers-lod.glb'],['flowerNearAssets','meadow-flowers.glb']]){const data=readFileSync(new URL('assets/v2/'+file,root));e[key]=flowerAssetsFromScene((await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene);}e.flowerPools=e.flowerAssets.variants.filter(v=>v.role!=='seed').map(variant=>({variant,mesh:new THREE.InstancedMesh(variant.parts[0].geometry,variant.parts[0].material,8000),records:[],dirtyMin:Infinity,dirtyMax:0}));for(const p of e.flowerPools)e.group.add(p.mesh);return e;};
 const old=await make(base),fresh=await make(w),v=w.hydrology.viewpoints.find(v=>v.id==='river-valley'),tiles=[];
 for(let z=Math.floor((v.z-105)/24);z<=Math.floor((v.z+105)/24);z++)for(let x=Math.floor((v.x-45)/24);x<=Math.floor((v.x+45)/24);x++)tiles.push([x,z]);
 for(const [x,z]of tiles){old.addFlowers(x,z);fresh.addFlowers(x,z);}const records=e=>new Map([...e.flowerTiles.values()].flat().map(p=>[p.id,p])),a=records(old),b=records(fresh);if(sectionProfile==='adopt'){assert.ok(b.size>=a.size);for(const id of a.keys())assert.ok(b.has(id),id+' original flower retained');}else assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());let moved=0,inside=0;
 for(const [id,r]of b){const p=a.get(id);if(!p)continue;assert.equal(r.s,p.s);assert.equal(r.rot,p.rot);assert.equal(r.pool.variant.id,p.pool.variant.id);if(Math.hypot(r.x-p.x,r.z-p.z)>.001)moved++;if(w.hydrology.sampleAt(r.x,r.z,{includeDepth:false}).insideWater)inside++;}
 t.diagnostic(JSON.stringify({flowerSources:a.size,moved,inside,tiles:tiles.length}));assert.ok(a.size>100&&moved>10);assert.equal(inside,0);old.dispose();fresh.dispose();
});

test('adopted default retains every old-default grass and unchanged other rivers while explicit zero restores the prior world',t=>{
 const saved=globalThis.location;let oldWorld,newWorld,old,fresh;
 try{globalThis.location={search:'?valleyLandform=0&valleyMeanders=0&valleySection=0'};oldWorld=actual('adoption-old-default');old=ecology(oldWorld);globalThis.location={search:''};newWorld=actual('adoption-new-default');fresh=ecology(newWorld);}finally{globalThis.location=saved;}
 assert.equal(oldWorld.hydrology.stats.valleyDeposits.nodes,0);assert.equal(oldWorld.hydrology.stats.valleyMeanders.nodes,0);
 assert.equal(newWorld.hydrology.stats.valleyDeposits.sectionProfile,true);assert.ok(newWorld.hydrology.stats.valleyMeanders.nodes>0);
 const changed=newWorld.hydrology.stats.valleyMeanders.lineId;
 for(const line of oldWorld.hydrology.lines)if(line.id!==changed)assert.deepEqual(newWorld.hydrology.lines.find(l=>l.id===line.id).nodes,line.nodes);
 for(const e of oldWorld.entities)assert.deepEqual(newWorld.surface.buildingPose(e.id),oldWorld.surface.buildingPose(e.id));
 const v=newWorld.hydrology.viewpoints.find(v=>v.id==='river-valley');let sources=0,adopted=0,wet=0;
 for(let iz=Math.floor((v.z-105)/.8);iz<Math.ceil((v.z+105)/.8);iz++)for(let ix=Math.floor((v.x-45)/.8);ix<Math.ceil((v.x+45)/.8);ix++){
  const a=old.grassAt(ix,iz),b=fresh.grassAt(ix,iz);if(a){sources++;assert.ok(b,a.id+' original root retained');for(const k of ['id','s','sy','rot'])assert.equal(b[k],a[k]);}if(b){adopted++;if(b.brookAsset)wet++;assert.equal(newWorld.hydrology.sampleAt(b.x,b.z,{includeDepth:false}).insideWater,false);}
  a?.brookAsset?.dispose();b?.brookAsset?.dispose();
 }
 assert.equal(sources,16454);assert.equal(adopted,16761);assert.equal(wet,307);t.diagnostic(JSON.stringify({oldDefaultSources:sources,adoptedSources:adopted,added:adopted-sources,wet,unchangedOtherRivers:true}));old.dispose();fresh.dispose();
});

 test('river spatial queries reject nonfinite ranges; ordinary queries retain exact source segment identities',()=>{
 const h=actual('bounded-query').hydrology;for(const bad of [Infinity,-Infinity,NaN]){
 assert.throws(()=>h.nearSegments(0,0,bad),RangeError);assert.throws(()=>h.nearSegments(bad,0,1),RangeError);assert.throws(()=>h.nearSegments(0,bad,1),RangeError);
 for(const k of ['minX','maxX','minZ','maxZ'])assert.throws(()=>h.intersectsBounds({...{minX:0,maxX:1,minZ:0,maxZ:1},[k]:bad}),RangeError);
 }assert.throws(()=>h.nearSegments(0,0,-1),RangeError);assert.throws(()=>h.nearSegments(Number.MAX_VALUE,0,Number.MAX_VALUE),RangeError);assert.throws(()=>h.intersectsBounds({minX:Number.MAX_VALUE,maxX:Number.MAX_VALUE,minZ:0,maxZ:0}),RangeError);
 const s=h.segments[0],x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2;assert.ok(h.nearSegments(x,z,1).includes(s));for(const radius of [0,1,16,100])assert.deepEqual(h.nearSegments(x,z,radius).map(v=>v.id).sort(),h.segments.filter(v=>projectSegment(x,z,v.a,v.b).distance<=radius).map(v=>v.id).sort(),'finite grid query equals exhaustive geometric oracle');assert.deepEqual(h.nearSegments(1e7,1e7,0),[]);assert.equal(h.sampleAt(1e7,1e7,{includeDepth:false}).id,null);
 });
