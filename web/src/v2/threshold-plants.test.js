import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {WorldEcology,decodeHabitatMap} from "./ecology.js";
import {ThresholdPlantField,THRESHOLD_PLANT_MAX_SHIFT} from "./threshold-plants.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
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

test("entrance query includes rotated/scaled envelopes and keeps unchanged or impossible roots",()=>{
 const pose={x:-64,z:64,y:3,rot:Math.PI/3,scale:{x:2,y:1,z:.7}},world={entities:[{id:"house",assetId:"house_a"}],manifest:{assetMetadata:{house_a:{bounds:{max:[4,5,3.93]}}}},surface:{buildingPose:()=>pose,heightAt:()=>0}},field=new ThresholdPlantField(world),e=field.entries[0];
 const point=(x,z)=>({id:"test",x:pose.x+Math.cos(pose.rot)*x*2+Math.sin(pose.rot)*z*.7,z:pose.z-Math.sin(pose.rot)*x*2+Math.cos(pose.rot)*z*.7,y:.1,s:1,rot:.2});
 const root=point(1,3),far=point(8,3),envelope={radius:.3};
 assert.equal(field.intersects(root,envelope),true);assert.equal(field.intersects(far,envelope),false);
 assert.strictEqual(field.relocate(far,envelope),far);
 assert.deepEqual(field.relocate(root,envelope,()=>false),{...root,thresholdUnresolved:true});
 const moved=field.relocate(root,envelope);assert.equal(moved.id,root.id);assert.equal(moved.y,root.y);assert.equal(moved.s,root.s);assert.equal(moved.rot,root.rot);assert.equal(field.intersects(moved,envelope),false);
 assert.deepEqual(field.relocate(root,envelope),moved);assert.ok(moved.thresholdMove<=THRESHOLD_PLANT_MAX_SHIFT);
 assert.equal(e.z1,SETTLEMENT_ASSETS.house_a.outdoor.z1+SETTLEMENT_ASSETS.house_a.outdoor.plantMargin);
 assert.equal(field.intersects(point(-2.5,4.1),envelope),true,"bench and platform footprint is clear too");
});

test("actual wooden house and yurt retain every original grass root while clearing whole wind-swept plants from the entrance",t=>{
 const w=actual(),before=ecology(w),after=ecology(w);before.thresholdPlants.enabled=false;
 const reports=[];
 try{
  assert.equal(after.thresholdPlants.entries.length,185);
  for(const asset of Object.values(SETTLEMENT_ASSETS)){
   const e=w.entities.find(e=>e.id===asset.representativeId),pose=w.surface.buildingPose(e),door=asset.openings.find(o=>o.kind==="door"),c=Math.cos(pose.rot),s=Math.sin(pose.rot);
   const x=pose.x+c*door.center[0]*pose.scale.x+s*door.center[2]*pose.scale.z,z=pose.z-s*door.center[0]*pose.scale.x+c*door.center[2]*pose.scale.z;
   const stats={asset:asset.sourceAsset,roots:0,moved:0,beforeHits:0,afterHits:0,unresolved:0,maxShift:0};
   for(let iz=Math.floor((z-12)/.8);iz<Math.ceil((z+12)/.8);iz++)for(let ix=Math.floor((x-12)/.8);ix<Math.ceil((x+12)/.8);ix++){
    const a=before.grassAt(ix,iz),b=after.grassAt(ix,iz);assert.equal(!!a,!!b,"never remove or add original plants");if(!a)continue;
    stats.roots++;for(const key of ["id","s","sy","rot"])assert.equal(a[key],b[key]);
    const hit=after.thresholdPlants.intersects(a,after.shoreGrassEnvelope);stats.beforeHits+=hit?1:0;
    if(!hit)assert.deepEqual(b,a,"unrelated roots remain byte-for-byte equivalent");
    stats.afterHits+=after.thresholdPlants.intersects(b,after.shoreGrassEnvelope)?1:0;
    stats.unresolved+=b.thresholdUnresolved?1:0;
    if(b.thresholdMove){stats.moved++;stats.maxShift=Math.max(stats.maxShift,b.thresholdMove);assert.ok(b.thresholdMove<=THRESHOLD_PLANT_MAX_SHIFT);assert.equal(after.excluded(b.x,b.z,.3),false);}
    assert.deepEqual(after.grassAt(ix,iz),b,"source cell replays exactly across unload/reload");
   }
   assert.ok(stats.roots>100&&stats.beforeHits>0);assert.equal(stats.afterHits,0);assert.equal(stats.unresolved,0);assert.equal(stats.beforeHits,stats.moved);reports.push(stats);
  }
  t.diagnostic(JSON.stringify(reports));
 }finally{before.dispose();after.dispose();}
});
