import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {createHydrology} from "./hydrology.js";
import {riverSectionAt} from "./river-section.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {shoreTerrainBedCoverage} from "./shore-material.js";
import {WorldTerrain} from "./terrain.js";
import {terrainFragmentBedCoverage} from "./terrain-material.js";

const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
function actual(){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
 const meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 // Physical validation uses the real DEM, river network and building protection.
 // This fixed landcover is deliberately not evidence about final colour.
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),
  coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
  detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}

test("height-aware bed leaves submerged surfaces and the muddy lip intact, preserving a reload A/B",()=>{
 for(const bed of [0,.01,.3,.7,1])for(const height of [-2,-.1,0,.02])assert.equal(shoreTerrainBedCoverage(bed,100+height,100),bed);
 for(const bed of [0,.01,.3,.7,1]){
  let prev=bed;
  for(let i=0;i<=100;i++){const value=shoreTerrainBedCoverage(bed,100+i*.01,100);assert.ok(value>=0&&value<=prev+1e-12);prev=value;}
  assert.equal(shoreTerrainBedCoverage(bed,100.3,100),0);
  assert.equal(shoreTerrainBedCoverage(bed,100.3,null),bed,"missing water must not mean zero altitude");
  assert.equal(shoreTerrainBedCoverage(bed,100.3,100,"v18"),bed);
 }
 const code=`globalThis.location={search:"?shoreElevation=v18"};const m=await import("./shore-material.js");console.log(JSON.stringify([m.SHORE_ELEVATION,m.shoreTerrainBedCoverage(.8,100.3,100)]));`;
 assert.deepEqual(JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",code],{cwd:new URL(".",import.meta.url),encoding:"utf8"})),["v18",.8]);
});

test("actual representative shores retain every shallow-bed sample while removing exposed continuous mineral coverage",t=>{
 const w=actual(),results=[];let allShallow=0,allDry=0;
 for(const view of w.hydrology.viewpoints){
  let shallow=0,dry=0,transition=0,oldMineral=0,newMineral=0,oldShoulder=0,newShoulder=0,total=0,outsideLevel=0;
  for(const seg of w.hydrology.nearSegments(view.x,view.z,100))for(const u of [.25,.5,.75]){
   const n=riverSectionAt(seg,u);
   for(const side of [-1,1])for(let i=0;i<=40;i++){
    const d=n.outer*i/40,x=n.x-n.fz*side*d,z=n.z+n.fx*side*d,q=w.hydrology.sampleAt(x,z,{includeDepth:false});
    if(q.id!==seg.id)continue;
    assert.ok(Number.isFinite(q.surfaceLevel));
    if(q.waterLevel!==null)assert.equal(q.surfaceLevel,q.waterLevel);else outsideLevel++;
    const height=w.surface.heightAt(x,z)-q.surfaceLevel,bed=shoreTerrainBedCoverage(q.riverBed,w.surface.heightAt(x,z),q.surfaceLevel);
    if(height<=.02){assert.equal(bed,q.riverBed,"real submerged/muddy edge must stay mineral");shallow++;}
    else if(height>=.12){assert.equal(bed,0,"exposed soil shoulder should use its actual landcover");dry++;}
    else transition++;
    assert.ok(bed<=q.riverBed);oldMineral+=smooth(.55,.95,q.riverBed);newMineral+=smooth(.55,.95,bed);
    if(height>.02){oldShoulder+=smooth(.55,.95,q.riverBed);newShoulder+=smooth(.55,.95,bed);}total++;
   }
  }
  assert.ok(shallow>1000&&dry>100&&outsideLevel>1000);
  assert.ok(newMineral<=oldMineral,"no new mineral belt");
  assert.ok(newShoulder<oldShoulder*.85,"the actual exposed shoulder must visibly lose mineral coverage; the submerged river is intentionally unchanged");
  allShallow+=shallow;allDry+=dry;results.push({id:view.id,total,shallow,dry,transition,mineralCoverageReduction:1-newMineral/oldMineral,exposedShoulderReduction:1-newShoulder/oldShoulder});
 }
 assert.ok(allShallow>20000&&allDry>4000);t.diagnostic(JSON.stringify(results));
});

test("shared terrain vertices and cached child LODs retain identical height-aware shore material",()=>{
 const raw=(x,z)=>100-x*.005+Math.abs(z)*.04;
 const h=createHydrology({streamData:{lines:[Array.from({length:81},(_,i)=>[-160+i*4,0,4])]},heightAt:raw});
 const height=(x,z)=>h.bedHeightAt(x,z),normalAt=(x,z,e)=>{const dx=height(x-e,z)-height(x+e,z),dz=height(x,z-e)-height(x,z+e),n=Math.hypot(dx,2*e,dz);return{x:dx/n,y:2*e/n,z:dz/n};};
 const world={meta:{far:{size:320}},surface:{pads:[],heightAt:height,geographicHeightAt:raw,normalAt},hydrology:h,landcoverAt:()=>({r:.15,g:.02,b:0,a:1})};
 // Terrain already has the physical y. Its cheap query must not sample height
 // again or invoke depth; this remains true across parent/cache paths.
 h.bindSurface(()=>{throw Error("material-only query read depth");});
 const terrain=new WorldTerrain(world),nodes=[...terrain.roots];
 try{
  let frontier=terrain.roots.filter(n=>n.x===0&&(n.z===0||n.z===-40));
  for(let depth=0;depth<2;depth++){
   const next=[];for(const parent of frontier)for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]]){
    const size=parent.size/2,node=terrain._node(parent.x+dx*size,parent.z+dz*size,size,parent.depth+1,parent),job=terrain._job(node);
    while(job.row<=32)terrain._buildRow(job);terrain._finish(job);nodes.push(node);next.push(node);
   }frontier=next;
  }
  const shared=new Map();let repeated=0,adjusted=0,submerged=0;
  for(const node of nodes){
   const attr=node.mesh.geometry.attributes.terrainHydrology;
   for(let j=0;j<=32;j++)for(let i=0;i<=32;i++){
    const k=j*33+i,x=node.x+i*node.size/32,z=node.z+j*node.size/32,y=node.heights[k],q=h.sampleAt(x,z,{includeDepth:false});
    const value=[attr.getX(k),attr.getY(k),attr.getZ(k),attr.getW(k)],expected=shoreTerrainBedCoverage(q.riverBed,y,q.surfaceLevel);
    const clearance=Number.isFinite(q.surfaceLevel)?y-q.surfaceLevel:.12;
    assert.equal(attr.itemSize,4);
    assert.equal(value[0],Math.fround(q.wetness));assert.equal(value[1],Math.fround(q.riverBed));assert.equal(value[2],Math.fround(q.bank));
    assert.equal(value[3],Math.fround(clearance),"all physical clearance samples remain exact Float32 values");
    const resolved=terrainFragmentBedCoverage(value[1],value[3]);
    // Raw mask and metric clearance now travel separately through Float32.
    // smoothstep over 0.10 m has maximum slope 15/m. Bound only the two
    // representation roundoffs; all shared/cache attributes below stay exact.
    const roundingBound=2**-24*(1+15*Math.abs(clearance));
    assert.ok(Math.abs(resolved-expected)<=roundingBound,"same physical endpoint coverage within its derived Float32 representation bound");
    if(clearance>=.12)assert.equal(resolved,0,"elevated dry source points remain exactly uncoated");
    assert.equal(y,height(x,z),"no terrain/physics changes");
    if(q.surfaceLevel!==null&&y<=q.surfaceLevel+.02){assert.equal(value[1],Math.fround(q.riverBed));submerged++;}
    if(expected<q.riverBed*.95)adjusted++;
    const key=x+","+z;if(shared.has(key)){assert.deepEqual(value,shared.get(key));repeated++;}else shared.set(key,value);
   }
  }
  assert.ok(repeated>5000&&adjusted>100&&submerged>1000);assert.ok(terrain.sampleCache.stats.parentVertexHits>0&&terrain.sampleCache.stats.vertexHits>0);
 }finally{terrain.dispose();}
});
