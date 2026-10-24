import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import * as THREE from "three";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {WorldEcology,decodeHabitatMap,meadowGeometry,basalGrassGeometry} from "./ecology.js";
import {forestFloorAt,createForestFloorGeometry} from "./forest-floor.js";
import {WorldWater,createShoreRockMaterial} from "./water.js";
import {createShoreStones,createShoreRockGeometry,createRiverPebbleGeometry,shoreStoneMatrix} from "./shore-stones.js";
import {createPlantEnvelope,createShoreStoneCollider,plantIntersectsStone,getShoreStoneField,relocateShorePlant,releaseShoreStoneField} from "./shore-contact.js";
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
// Wet roots own fresh BufferGeometry objects on each source query. Compare
// every rendered value, not Three.js allocation UUIDs or disposer closures.
function sameRootAndGeometry(actual,expected){
 const {brookAsset:a,...ar}=actual,{brookAsset:b,...br}=expected;assert.deepEqual(ar,br);assert.equal(Boolean(a),Boolean(b));
 if(!a)return;
 for(const key of ['feet','seating','envelope','physicalOnly'])assert.deepEqual(a[key],b[key]);
 assert.equal(a.geometries.length,b.geometries.length);
 for(let i=0;i<a.geometries.length;i++){
  const x=a.geometries[i],y=b.geometries[i];assert.deepEqual(x.index?.array,y.index?.array);assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));
  for(const key of Object.keys(x.attributes)){assert.equal(x.attributes[key].itemSize,y.attributes[key].itemSize);assert.equal(x.attributes[key].normalized,y.attributes[key].normalized);assert.deepEqual(x.attributes[key].array,y.attributes[key].array);}
 }
 a.dispose();
}
test("rendered stone matrices match the shared tilted three-dimensional collider exactly",()=>{
 const w=actual(),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest"),segments=w.hydrology.nearSegments(view.x,view.z,18),records=createShoreStones(w,segments),water=new WorldWater(w);
 const item=water.buildBucket({id:"test",segments,bounds:{minX:view.x-24,maxX:view.x+24,minZ:view.z-24,maxZ:view.z+24}});
 water.buildStones(item);assert.equal(item.rocks.count,records.length);
 for(let i=0;i<records.length;i++){
  const expected=shoreStoneMatrix(records[i]).elements.map(Math.fround);
  assert.deepEqual(Array.from(item.rocks.instanceMatrix.array.slice(i*16,i*16+16)),expected);
 }
 const primary=records.find(r=>r.id==="river-41711e76-99c57ca2:862:1"),g=createShoreRockGeometry(),c=createShoreStoneCollider(primary,g);
 assert.ok(c.slabs.length>5);assert.equal(g.index.count/3,1260);
 const blade=new THREE.BoxGeometry(.04,.08,.04),envelope=createPlantEnvelope([blade],{wind:false});
 assert.equal(plantIntersectsStone({x:primary.x,y:primary.y,z:primary.z,s:1},envelope,c),true);
 assert.equal(plantIntersectsStone({x:primary.x,y:c.box.max.y+.5,z:primary.z,s:1},envelope,c),false,"a plant above a low stone is not excluded by a full-height disk");
 assert.equal(plantIntersectsStone({x:c.box.max.x+2,y:primary.y,z:primary.z,s:1},envelope,c),false);
 blade.dispose();g.dispose();water.dispose();
});
test("swept blade envelope catches leaf contact outside the root and relocation remains explicit when impossible",()=>{
 const w=actual(),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest"),record=createShoreStones(w,w.hydrology.nearSegments(view.x,view.z,10)).find(r=>r.sourceAnchor);
 const geometry=new THREE.BoxGeometry(1.8,.05,.1);geometry.translate(-.9,0,0);
 const stoneGeometry=createShoreRockGeometry(),envelope=createPlantEnvelope([geometry],{wind:false}),stone=createShoreStoneCollider(record,stoneGeometry);
 const plant={id:"blade-probe",x:stone.box.max.x+.1,y:record.y,z:record.z,s:1,rot:0};
 assert.ok(plant.x>stone.box.max.x);assert.equal(plantIntersectsStone(plant,envelope,stone),true);
 const result=relocateShorePlant(w,plant,envelope,()=>false);
 assert.equal(result.shoreUnresolved,true);assert.equal(result.id,plant.id);assert.equal(result.x,plant.x);
 const moved=relocateShorePlant(w,plant,envelope,()=>true);assert.ok(moved.shoreMove>0);assert.equal(getShoreStoneField(w).intersects(moved,envelope),false);
 geometry.dispose();stoneGeometry.dispose();releaseShoreStoneField(w);
});
test("real river entrances keep grass and understory identities and counts while clearing full swept leaves",t=>{
 const w=actual(),baseline={...w},before=ecology(baseline),after=ecology(w),field=getShoreStoneField(w),reports=[];
 // Isolate stone contact, not hydrology: wet-bank rooting requires the actual
 // channel query even in this no-contact baseline. Source root eligibility
 // still uses its own original-world collision field.
 t.mock.method(getShoreStoneField(baseline),'intersects',()=>false);
 assert.strictEqual(baseline.hydrology.nearSegments,w.hydrology.nearSegments);
 const floorEnvelopes=new Map();
 for(const kind of ["sedge","fern","shrub"]){const g=createForestFloorGeometry(kind);floorEnvelopes.set(kind,createPlantEnvelope([g]));g.dispose();}
 for(const view of w.hydrology.viewpoints){
  const start=performance.now(),report={view:view.id,grass:0,grassMoved:0,grassBeforeHits:0,floor:0,floorMoved:0,floorBeforeHits:0,unresolved:0,maxMove:0};
  for(let iz=Math.floor((view.z-28)/.8);iz<Math.ceil((view.z+28)/.8);iz++)for(let ix=Math.floor((view.x-28)/.8);ix<Math.ceil((view.x+28)/.8);ix++){
   const a=before.grassAt(ix,iz),b=after.grassAt(ix,iz);assert.equal(!!a,!!b);
   if(!a)continue;report.grass++;assert.equal(a.id,b.id);assert.equal(a.s,b.s);assert.equal(a.sy,b.sy);assert.equal(a.rot,b.rot);
   if(field.intersects(a,a.brookAsset?.envelope??after.shoreGrassEnvelope))report.grassBeforeHits++;
   if(b.shoreMove){report.grassMoved++;report.maxMove=Math.max(report.maxMove,b.shoreMove);}if(b.shoreUnresolved)report.unresolved++;
   assert.equal(field.intersects(b,b.brookAsset?.envelope??after.shoreGrassEnvelope),false,b.id+" full rendered swept leaves touch stone after relocation");
   assert.equal(after.excluded(b.x,b.z,.3,Boolean(b.brookAsset)),false);assert.equal(w.hydrology.sampleAt(b.x,b.z,{includeDepth:false}).insideWater,false);
   sameRootAndGeometry(after.grassAt(ix,iz),b);a.brookAsset?.dispose();b.brookAsset?.dispose();
  }
  for(let iz=Math.floor((view.z-28)/2.4);iz<Math.ceil((view.z+28)/2.4);iz++)for(let ix=Math.floor((view.x-28)/2.4);ix<Math.ceil((view.x+28)/2.4);ix++){
   const a=forestFloorAt(baseline,ix,iz,(x,z,p)=>before.excluded(x,z,p,true)),b=forestFloorAt(w,ix,iz,(x,z,p)=>after.excluded(x,z,p,true));assert.equal(!!a,!!b);
   if(!a)continue;report.floor++;assert.equal(a.id,b.id);assert.equal(a.kind,b.kind);assert.equal(a.s,b.s);
   const envelope=floorEnvelopes.get(b.kind);if(!envelope)continue;
   if(field.intersects(a,envelope))report.floorBeforeHits++;
   if(b.shoreMove){report.floorMoved++;report.maxMove=Math.max(report.maxMove,b.shoreMove);}if(b.shoreUnresolved)report.unresolved++;
   assert.equal(field.intersects(b,envelope),false,b.id+" understory touches stone");
   assert.equal(after.excluded(b.x,b.z,.85,true),false);assert.equal(w.hydrology.sampleAt(b.x,b.z,{includeDepth:false}).insideWater,false);
  }
  report.cpuMs=+(performance.now()-start).toFixed(2);reports.push(report);
 }
 assert.ok(reports.reduce((n,r)=>n+r.grassBeforeHits+r.floorBeforeHits,0)>10);
 assert.equal(reports.reduce((n,r)=>n+r.unresolved,0),0);
 assert.ok(field.tiles.size<=field.stats.maxTiles);t.diagnostic(JSON.stringify(reports));before.dispose();after.dispose();
});
test("stone material keeps its existing noise/sampler budget and filters grains by projected footprint",()=>{
 const m=createShoreRockMaterial(),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/fwidth\(vShoreWorld\*110\.0\)/);
 assert.match(shader.fragmentShader,/stoneFracture\*\.00035/);
 assert.ok(!shader.fragmentShader.includes("fractureCoord"),"periodic warped contours must not return as rock seams");
 assert.match(shader.fragmentShader,/smoothstep\(\.66,\.82,stoneBroad\)\*\(1.0-smoothstep\(\.30,\.48,stoneGrain\)\)/);
 assert.equal((shader.fragmentShader.match(/shoreNoise\(vShoreWorld/g)||[]).length,2);
 assert.equal((shader.fragmentShader.match(/uniform sampler/g)||[]).length,(THREE.ShaderLib.standard.fragmentShader.match(/uniform sampler/g)||[]).length);
 m.dispose();
});

for(const riverMeanders of [false,undefined])test("cross-tile relocated plants retain source ownership and stationary collider cache: "+(riverMeanders===false?"original drainage":"default designed bend"),t=>{
 const w=actual(riverMeanders),eco=ecology(w),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest"),field=getShoreStoneField(w);
 let x=view.x,z=view.z,probe=null;
 if(riverMeanders!==false){
  assert.ok(w.hydrology.stats.meanders.nodes>0);
  // Find a real current-world relocation near this reach, instead of relying
  // on the old bank's one camera-specific root to keep crossing a tile edge.
  for(let iz=Math.floor((view.z-110)/.8);iz<=Math.ceil((view.z+110)/.8)&&!probe;iz++)for(let ix=Math.floor((view.x-110)/.8);ix<=Math.ceil((view.x+110)/.8);ix++){
   const p=eco.grassAt(ix,iz);if(p?.shoreMove&&(Math.floor(p.x/24)!==Math.floor(ix*.8/24)||Math.floor(p.z/24)!==Math.floor(iz*.8/24))){probe=p;break;}
  }
  assert.ok(probe,"default scene must exercise a real crossed root");x=probe.x;z=probe.z;
 }
 const camera={position:new THREE.Vector3(x,w.surface.heightAt(x,z)+1.8,z)};
 const baseline=ecology({...w}),baseStart=performance.now();let baseMax=0;
 t.mock.method(getShoreStoneField(baseline.world),'intersects',()=>false);
 assert.strictEqual(baseline.world.hydrology.nearSegments,w.hydrology.nearSegments);
 eco.uniforms.uWorldViewer.value.copy(camera.position);baseline.uniforms.uWorldViewer.value.copy(camera.position);
 for(let i=0;i<160;i++){const tick=performance.now();baseline.updateMeadow(camera);baseline.forestFloor.update(camera);baseMax=Math.max(baseMax,performance.now()-tick);if(!baseline.stats.grassPending&&!baseline.forestFloor.stats.pending)break;}
 const baselineCPU=performance.now()-baseStart,baselineGrass=baseline.stats.grassTufts,baselineFloor=[...baseline.forestFloor.pools.values()].reduce((n,p)=>n+p.records.length,0),baselineIDs=[...baseline.grassTiles.values()].flatMap(tile=>tile.list.map(p=>p.id)).sort(),baselineFloorIDs=[...baseline.forestFloor.pools.values()].flatMap(p=>p.records.map(r=>r.id)).sort();baseline.dispose();
 const start=performance.now();let frames=0,maxBuild=0;
 for(;frames<160;frames++){const tick=performance.now();eco.updateMeadow(camera);eco.forestFloor.update(camera);maxBuild=Math.max(maxBuild,performance.now()-tick);if(!eco.stats.grassPending&&!eco.forestFloor.stats.pending)break;}
 assert.ok(frames<160);const built=field.stats.builtTiles,colliders=field.stats.collidersBuilt,evicted=field.stats.evictedTiles;
 const all=[...eco.grassTiles.values()].flatMap(t=>t.list),ids=all.map(p=>p.id);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),baselineIDs,"all source grass identities survive contact relocation");
 assert.deepEqual([...eco.forestFloor.pools.values()].flatMap(p=>p.records.map(r=>r.id)).sort(),baselineFloorIDs);
 if(probe)assert.ok(ids.includes(probe.id),"the real cross-boundary source root remains resident");
 let crossed=0;
 for(const tile of eco.grassTiles.values())for(const p of tile.list){
  const [,ix,iz]=p.id.split(":").map((v,i)=>i?Number(v):v);
  assert.equal(Math.floor(ix*.8/24),tile.tx);assert.equal(Math.floor(iz*.8/24),tile.tz);
  if(Math.floor(p.x/24)!==tile.tx||Math.floor(p.z/24)!==tile.tz){
   crossed++;assert.deepEqual(eco.grassAt(ix,iz),p);
   for(const mesh of tile.meshes)if(mesh){const sphere=mesh.boundingSphere;assert.ok(new THREE.Vector3(p.x,p.y,p.z).distanceTo(sphere.center)<sphere.radius,JSON.stringify({id:p.id,kind:p.kind,mesh:mesh.name,range:Math.hypot(p.x-camera.position.x,p.z-camera.position.z),root:[p.x,p.y,p.z],center:sphere.center.toArray(),radius:sphere.radius}));}
  }
 }
 for(let i=0;i<30;i++){eco.updateMeadow(camera);eco.forestFloor.update(camera);}
 assert.equal(field.stats.builtTiles,built);assert.equal(field.stats.collidersBuilt,colliders);assert.equal(field.stats.evictedTiles,evicted);
 assert.ok(field.tiles.size<=field.stats.maxTiles);assert.ok(field.colliders.size<=1024);
 assert.equal(eco.stats.shorePlantsUnresolved,0);assert.equal(eco.forestFloor.stats.shorePlantsUnresolved,0);
 assert.ok(crossed>0,"real shifted roots should exercise source tile ownership");
 assert.equal(all.length,baselineGrass);assert.equal([...eco.forestFloor.pools.values()].reduce((n,p)=>n+p.records.length,0),baselineFloor);
 t.diagnostic(JSON.stringify({riverMeanders:riverMeanders??"default",boundaryProbe:probe?.id,frames,grassTiles:eco.grassTiles.size,forestTiles:eco.forestFloor.tiles.size,grass:all.length,crossedTileRoots:crossed,contactTiles:field.tiles.size,...field.stats,CPUms:+(performance.now()-start).toFixed(2),maxBuildFrameCPUms:+maxBuild.toFixed(2),baselineCPUms:+baselineCPU.toFixed(2),baselineMaxBuildFrameCPUms:+baseMax.toFixed(2)}));
 eco.dispose();assert.equal(field.tiles.size,0);assert.equal(field.colliders.size,0);assert.equal(field.geometry,null);
});

test("wide source banks and tilted footprint corners remain discoverable across contact tile edges",()=>{
 const w=actual(),field=getShoreStoneField(w),g=createShoreRockGeometry();
 const segments=w.hydrology.segments.filter(s=>s.a.width>8&&s.index%3===1).slice(0,36),records=createShoreStones(w,segments);assert.ok(records.length>15);
 for(const r of records){const c=createShoreStoneCollider(r,g);
  for(const [x,z]of [[r.x,r.z],[c.box.min.x,c.box.min.z],[c.box.max.x,c.box.max.z],[c.box.min.x,c.box.max.z],[c.box.max.x,c.box.min.z]])
   assert.ok(field.near(x,z,.001).some(o=>o.record.id===r.id),r.id+" contact tile missed a wide-bank stone");
 }
 g.dispose();releaseShoreStoneField(w);
});

test("selective creases preserve every physical triangle and retain smooth worn regions",()=>{
 const g=createRiverPebbleGeometry(),smooth=createRiverPebbleGeometry({creaseAngle:Math.PI}),groups=new Map(),p=g.attributes.position,n=g.attributes.normal;
 assert.equal(g.index.count,540);assert.equal(smooth.index.count,540);assert.equal(smooth.attributes.position.count,92);assert.equal(p.count,227);
 // Expanded physical triangle coordinates are byte-for-byte unchanged.
 for(let i=0;i<g.index.count;i++)for(let k=0;k<3;k++)assert.equal(p.getComponent(g.index.getX(i),k),smooth.attributes.position.getComponent(smooth.index.getX(i),k));
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].join(",");if(!groups.has(key))groups.set(key,[]);groups.get(key).push([n.getX(i),n.getY(i),n.getZ(i)]);}
 assert.equal(groups.size,92);assert.ok([...groups.values()].some(v=>v.length>1));assert.ok([...groups.values()].some(v=>v.length===1));
 let curvedFaces=0;for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2);
  const d=(x,y)=>Math.hypot(n.getX(x)-n.getX(y),n.getY(x)-n.getY(y),n.getZ(x)-n.getZ(y));if(d(a,b)>.001||d(a,c)>.001)curvedFaces++;
 }
 assert.ok(curvedFaces>150,"do not turn the complete rock into a flat-shaded polyhedron");
 g.dispose();smooth.dispose();
});


test("scanned contact shells are built only for the exact tile footprint without dropping boundary stones",()=>{
 const w=actual(),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest");
 releaseShoreStoneField(w);
 const field=getShoreStoneField(w),g=createShoreRockGeometry();
 const ix=Math.floor(view.x/24),iz=Math.floor(view.z/24),x=(ix+.5)*24,z=(iz+.5)*24;
 const records=createShoreStones(w,w.hydrology.nearSegments(x,z,24*.72+12));
 const old=records.map(r=>createShoreStoneCollider(r,g)).filter(c=>
  c.box.max.x>=ix*24&&c.box.min.x<=(ix+1)*24&&c.box.max.z>=iz*24&&c.box.min.z<=(iz+1)*24);
 const current=field.tile(ix,iz);
 assert.deepEqual(current.map(c=>c.record.id),old.map(c=>c.record.id));
 assert.ok(old.length>0&&old.length<records.length,"exercise both included and broad-query-only stones");
 assert.equal(field.stats.collidersBuilt,old.length);
 for(let i=0;i<old.length;i++){assert.deepEqual(current[i].box,old[i].box);assert.deepEqual(current[i].slabs,old[i].slabs);}
 g.dispose();releaseShoreStoneField(w);
});
