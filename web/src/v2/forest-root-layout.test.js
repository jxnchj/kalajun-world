import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import * as THREE from "three";
import {ForestRootLayout,FOREST_LAYOUT,forestLayoutMode} from "./forest-root-layout.js";
import {WorldEcology,cellRandom} from "./ecology.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {worldViewpoints} from "./viewpoints.js";
const flat=()=>({entities:[],objects:{},landcoverAt:()=>({r:1,g:0,b:0,a:1}),surface:{heightAt:()=>100,geographicHeightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}});
const root=(ix,iz,random=cellRandom)=>({id:`spruce:${ix}:${iz}`,x:(ix+.15+.7*random(ix,iz,1))*12,y:99.85,z:(iz+.15+.7*random(ix,iz,2))*12,s:.72+random(ix,iz,4)*.76,rot:random(ix,iz,5)*Math.PI*2,variant:Math.floor(random(ix,iz,6)*5)});
const layout=(world=flat(),options={})=>new ForestRootLayout(world,{originalAt:(x,z)=>root(x,z),excluded:()=>false,random:cellRandom,...options});
function nearest(rows){
 const bins=new Map();for(const p of rows){const key=Math.floor(p.x/24)+","+Math.floor(p.z/24);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(p);}
 return rows.map(p=>{let d=Infinity;for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++)for(const q of bins.get((Math.floor(p.x/24)+x)+","+(Math.floor(p.z/24)+z))||[])if(q!==p)d=Math.min(d,Math.hypot(p.x-q.x,p.z-q.z));return d;}).filter(Number.isFinite).sort((a,b)=>a-b);
}
function gridSignal(rows){return ["x","z"].map(key=>Math.hypot(rows.reduce((s,p)=>s+Math.cos(p[key]*Math.PI/6),0),rows.reduce((s,p)=>s+Math.sin(p[key]*Math.PI/6),0))/rows.length);}
const q=(a,t)=>a[Math.floor((a.length-1)*t)];

test("v14 startup A/B remains byte-equivalent and v15 preserves all identity/appearance records",()=>{
 assert.equal(forestLayoutMode("?forestLayout=v14"),"v14");assert.equal(forestLayoutMode("?forestLayout=v15"),"v15");assert.equal(forestLayoutMode(""),"v15");
 const eco=new WorldEcology(flat(),{forestLayout:"v14"}),next=new WorldEcology(flat(),{forestLayout:"v15"});
 for(let z=-22;z<=22;z++)for(let x=-22;x<=22;x++){
  const a=eco.treeAt(x,z),b=next.treeAt(x,z);assert.deepEqual(a,eco.originalTreeAt(x,z));assert.equal(!!a,!!b);
  if(a){for(const name of ["id","s","rot","variant"])assert.equal(b[name],a[name]);assert.ok(Math.hypot(b.x-a.x,b.z-a.z)<=18+1e-10);assert.equal(b.y,99.85);}
 }
 assert.equal(eco.forestLayout.stats.demSamples,0);eco.dispose();next.dispose();
});

test("continuous terrain-informed field is bounded across negative cells and independent of sampling order",()=>{
 const world=flat();world.surface.geographicHeightAt=(x,z)=>100+.08*z+5*Math.sin(x/180)*Math.cos(z/140);
 const a=layout(world),b=layout(world),points=[];
 for(let z=-700;z<700;z+=67)for(let x=-700;x<700;x+=59)points.push([x,z]);
 const first=points.map(([x,z])=>a.displacement(x,z));
 for(let i=points.length-1;i>=0;i--){const [x,z]=points[i];assert.deepEqual(b.displacement(x,z),first[i]);assert.ok(Math.hypot(first[i].x,first[i].z)<=18);}
 // Crossing an interpolation cell edge cannot create a chunk seam.
 for(const x of [-80.317*80,-.317*80,80-.317*80]){
  const l=a.displacement(x-1e-5,-.5),r=a.displacement(x+1e-5,-.5);assert.ok(Math.hypot(l.x-r.x,l.z-r.z)<2e-5);
 }
 const plain=layout(flat());assert.notDeepEqual(plain.displacement(71,53),a.displacement(71,53));
 const before=a.stats.demSamples;a.displacement(71,53);const after=a.stats.demSamples;a.displacement(71,53);assert.equal(a.stats.demSamples,after);assert.ok(after>=before);
 a.dispose();b.dispose();plain.dispose();
});

test("all candidate conflicts resolve safely without deletion and independently of query order",()=>{
 const random=(ix,iz,salt)=>salt===337?(ix===0?.1:.9):0;
 const source=(ix,iz)=>iz===0&&(ix===0||ix===1)?root(ix,iz,random):null;
 const make=()=>{const f=layout(flat(),{random,originalAt:source});f.displacement=(x,z)=>({x:7.8-x,z:1.8-z});return f;};
 const a=make(),b=make(),a0=a.at(0,0),a1=a.at(1,0),b1=b.at(1,0),b0=b.at(0,0);
 assert.deepEqual(a0,b0);assert.deepEqual(a1,b1);assert.equal(a0.x,7.8);assert.deepEqual(a1,source(1,0));
 assert.ok(Math.hypot(a0.x-a1.x,a0.z-a1.z)>=FOREST_LAYOUT.minSpacing);assert.equal(a.stats.conflictFallbacks,1);
 assert.equal(a.at(2,0),null);a.dispose();b.dispose();
});

test("invalid forest, foundations, roads and wet banks retain original roots rather than reduce counts",()=>{
 const cases=[
  w=>{w.landcoverAt=(x,z)=>({r:x>14?0:1,g:0,b:0,a:1});},
  w=>{w.entities=[{x:14,z:0,rot:.4,pad:{hx:3,hz:40,cx:0,cz:0}}];},
  w=>{w.objects={paths:[{width:2,pts:[[14,-150],[14,150]]}]};},
  w=>{w.hydrology={isExcluded:(x,z,padding)=>Math.abs(x-14)<1+padding,sampleAt:()=>({wetness:0,bank:0,insideWater:false})};},
 ];
 for(const setup of cases){
  const w=flat();setup(w);const eco=new WorldEcology(w,{forestLayout:"v15"});eco.forestLayout.displacement=()=>({x:18,z:0});
  let count=0,constrained=0;
  for(let z=-8;z<=8;z++)for(let x=-8;x<=1;x++){
   const old=eco.originalTreeAt(x,z),p=eco.treeAt(x,z);assert.equal(!!p,!!old);if(!p)continue;count++;
   assert.equal(eco.excluded(p.x,p.z,3),false);assert.ok(w.landcoverAt(p.x,p.z).r>=.24);assert.equal(p.id,old.id);
   if(p.x-old.x<17.99)constrained++;
  }
  assert.ok(count>50);assert.ok(constrained>0,"fixture must exercise target validation/backoff");eco.dispose();
 }
});

test("18 metre source halo includes relocated near roots while exact LOD/prefetch distances stay unchanged",()=>{
 const eco=new WorldEcology(flat(),{forestLayout:"v15"});eco.forestLayout.displacement=()=>({x:-18,z:0});
 const camera={position:new THREE.Vector3(0,102,0)};
 for(let variant=0;variant<5;variant++){
  const geometry=new THREE.BoxGeometry(1,18,1),material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1600);mesh.count=0;mesh.customDepthMaterial=new THREE.MeshDepthMaterial();eco.nearParts.push({variant,mode:1,mesh});eco.materials.push(material);
 }
 eco.rebuildNearTrees(camera);const expected=[],incoming=[];
 // Independent wider enumeration covers the full displacement support.
 for(let iz=-28;iz<=28;iz++)for(let ix=-28;ix<=28;ix++){
  const p=eco.treeAt(ix,iz);if(!p)continue;const d=Math.hypot(p.x,p.z);if(d>24&&d<252){expected.push(p.id);if(Math.abs(eco.originalTreeAt(ix,iz).x)>252)incoming.push(p.id);}
 }
 assert.ok(incoming.length>0,"fixture must require the new halo");
 const actual=[...eco.nearTreeBatches.values()].flatMap(b=>b.records.map(p=>p.id));assert.deepEqual(actual.sort(),expected.sort());
 for(const b of eco.nearTreeBatches.values())for(const p of b.activeRecords)assert.ok(Math.hypot(p.x,p.z)>41.9999&&Math.hypot(p.x,p.z)<235.0001);
 eco.dispose();
});

test("cached layout is bounded, deterministic after eviction and releases with the world",()=>{
 const f=layout(),first=f.at(-21,13),n=f.stats.demSamples;assert.strictEqual(f.at(-21,13),first);assert.equal(f.stats.demSamples,n);
 for(let i=0;i<FOREST_LAYOUT.cacheTiles+5;i++)f.at(i*64,0);
 assert.ok(f.tiles.size<=FOREST_LAYOUT.cacheTiles);assert.ok(f.field.size<=FOREST_LAYOUT.fieldNodes);assert.deepEqual(f.at(-21,13),first);
 f.dispose();assert.equal(f.tiles.size,0);assert.equal(f.field.size,0);assert.equal(f.stats.cachedCells,0);
});

// Read the actual source pixels without a browser or modifying data.
function png(bytes){
 let width,height,channels;const chunks=[];
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===2?3:d[9]===6?4:0;assert.ok(channels);}if(type==="IDAT")chunks.push(d);p+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;pixels[i]=(raw[y*(stride+1)+1+x]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 const data=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++){data[i*4]=pixels[i*channels];data[i*4+1]=pixels[i*channels+1];data[i*4+2]=pixels[i*channels+2];data[i*4+3]=channels===4?pixels[i*channels+3]:255;}return {width,height,data};
}
function actualWorld(riverMeanders){
 const base=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base))));
 const meta=json("data/scene.json");return createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),riverMeanders,coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:bin("data/detail.bin.gz"),coreLandcover:png(readFileSync(new URL("data/core_landcover.png",base))),farLandcover:png(readFileSync(new URL("data/far_landcover.png",base)))});
}

test("real three-region stands retain every source ID and habitat while reducing the 12m grid signature",t=>{
 const world=actualWorld(),a=new WorldEcology(world,{forestLayout:"v14"}),b=new WorldEcology(world,{forestLayout:"v15"});
 for(const view of worldViewpoints({water:world.hydrology.viewpoints}).filter(v=>["forest","river-forest","valley"].includes(v.id))){
  const old=[],next=[],shifts=[],start=performance.now();
  // The same source-index rectangle proves population conservation; a moved
  // camera circle need not contain exactly the same individual trees.
  for(let iz=Math.floor((view.z-600)/12);iz<=Math.floor((view.z+600)/12);iz++)for(let ix=Math.floor((view.x-600)/12);ix<=Math.floor((view.x+600)/12);ix++){
   const p=a.treeAt(ix,iz),r=b.treeAt(ix,iz);assert.equal(!!r,!!p);if(!p)continue;
   old.push(p);next.push(r);for(const name of ["id","s","rot","variant"])assert.equal(r[name],p[name]);
   const shift=Math.hypot(r.x-p.x,r.z-p.z);assert.ok(shift<=18+1e-9);shifts.push(shift);
   assert.equal(b.excluded(r.x,r.z,3),false);assert.ok(world.landcoverAt(r.x,r.z).r>=.24);assert.ok(Math.abs(r.y-(world.surface.heightAt(r.x,r.z)-.15))<1e-9);assert.ok(Number.isFinite(r.y));
  }
  assert.equal(old.length,{valley:5987,forest:841,"river-forest":7620}[view.id]);assert.equal(new Set(next.map(p=>p.id)).size,old.length);
  const before=nearest(old),after=nearest(next),signalA=gridSignal(old),signalB=gridSignal(next);
  assert.ok(after[0]>=2.6-1e-9,"no new trunk overlap, including adjacent source tiles");
  assert.ok(q(after,.5)>q(before,.5)*.85,"redistribution must not collapse the stand into crowded patches");
  assert.ok(signalB[0]<signalA[0]*.5&&signalB[1]<signalA[1]*.5,"the original 12m stripe signature materially falls on both axes");
  shifts.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({view:view.id,roots:old.length,gridBefore:signalA,gridAfter:signalB,nearestBefore:{min:before[0],p05:q(before,.05),median:q(before,.5),p95:q(before,.95)},nearestAfter:{min:after[0],p05:q(after,.05),median:q(after,.5),p95:q(after,.95)},shiftMedian:q(shifts,.5),shiftMax:shifts.at(-1),cpuGenerationAndChecksMs:performance.now()-start}));
 }
 a.dispose();b.dispose();
});


test("wider forest creek retains all accepted source tree identities and keeps the entrance landmarks dry",()=>{
 const before=actualWorld("v19"),after=actualWorld(true),a=new WorldEcology(before),b=new WorldEcology(after);
 const anchor=before.hydrology.viewpoints.find(v=>v.id==="river-forest"),oldIDs=[],newIDs=[];
 try{
  // Fixed source-cell support, independent of the entrance's new position.
  for(let iz=Math.floor((anchor.z-140)/12);iz<=Math.ceil((anchor.z+140)/12);iz++)for(let ix=Math.floor((anchor.x-140)/12);ix<=Math.ceil((anchor.x+140)/12);ix++){
   const old=a.originalTreeAt(ix,iz),next=b.originalTreeAt(ix,iz);
   if(old)oldIDs.push(old.id);if(next)newIDs.push(next.id);
   if(!old)continue;assert.ok(next,old.id+" must remain a source member");
   for(const key of ["id","s","rot","variant"])assert.equal(next[key],old[key]);
   const placed=b.treeAt(ix,iz);assert.ok(placed);assert.equal(b.excluded(placed.x,placed.z,3),false);
  }
  assert.deepEqual(newIDs,oldIDs);
  for(const [ix,iz]of [[-302,395],[-302,400],[-302,401]]){
   const root=b.originalTreeAt(ix,iz);assert.ok(root);assert.equal(after.hydrology.isExcluded(root.x,root.z,3),false);
   assert.equal(after.hydrology.sampleAt(root.x,root.z).insideWater,false);
  }
 }finally{a.dispose();b.dispose();}
});


test("priority-first pruning preserves exact roots, equal-priority ties and reverse-order queries",()=>{
 for(const tied of [false,true]){
  const random=tied?(x,z,salt)=>salt===337?.5:cellRandom(x,z,salt):cellRandom;
  const originalAt=(x,z)=>((x*17+z*3)%7===0?null:root(x,z,random));
  const old=layout(flat(),{priorityFirst:false,random,originalAt}),next=layout(flat(),{priorityFirst:true,random,originalAt});
  const points=[];for(let z=-35;z<=35;z++)for(let x=-35;x<=35;x++)points.push([x,z]);
  const expected=points.map(([x,z])=>old.at(x,z));
  for(let i=points.length-1;i>=0;i--)assert.deepEqual(next.at(...points[i]),expected[i]);
  assert.ok(next.stats.skippedLowerPriority>0);assert.equal(old.stats.skippedLowerPriority,0);
  old.dispose();next.dispose();
 }
});
