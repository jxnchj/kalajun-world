import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHydrology,projectSegment} from "./hydrology.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {riverSectionAt,riverCrossPoint,riverBankMargin,applyRepresentativeBanks} from "./river-section.js";
import {createWaterGeometry} from "./water.js";
import {bendRepresentativeReach,applyRepresentativeMeanders,applyBrookMeander} from "./river-meander.js";
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function fixture(z0=0){
 const heightAt=(x,z)=>100-x*.015+Math.abs(z-z0)*.02,h=createHydrology({streamData:{lines:[Array.from({length:121},(_,i)=>[i*4,z0,1.54])]},heightAt,riverMeanders:false});
 const line=h.lines[0],anchor=line.nodes[60].distance;applyRepresentativeBanks(h.lines,h.segments,[{segmentId:h.segments[60].id}]);
 return {h,line,anchor,heightAt};
}
for(const profile of ["v19","v22"])test(profile+" bends keep levels and endpoints while indexing their new shared physical footprint",()=>{
 const {h,line,anchor,heightAt}=fixture(29.8),original=structuredClone(line.nodes),before=JSON.stringify(original);
 const result=bendRepresentativeReach(line,h.segments,anchor,{heightAt,profile});h.refreshMeanderIndex();assert.ok(result.nodes>12);assert.ok(result.maxOffset>(profile==="v19"?1.5:4)&&result.maxOffset<=(profile==="v19"?2.8:6.4));
 let newlyIndexed=0;
 for(let i=0;i<line.nodes.length;i++){
  near(line.nodes[i].level,original[i].level);near(line.nodes[i].width,original[i].width);
  if(i)assert.ok(line.nodes[i].level<=line.nodes[i-1].level);
 }
 assert.deepEqual([line.nodes[0].x,line.nodes[0].z,line.nodes.at(-1).x,line.nodes.at(-1).z],[original[0].x,original[0].z,original.at(-1).x,original.at(-1).z]);
 for(const s of h.segments.filter(s=>s.meander)){
  const g=createWaterGeometry([s],{detail:true});
  for(let i=0;i<g.attributes.position.count;i++){
   const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i),q=h.sampleAt(x,z,{includeDepth:false});
   assert.notEqual(q.surfaceLevel,null);near(q.surfaceLevel+.006,g.attributes.position.getY(i),.0003);assert.ok(h.bedHeightAt(x,z)<=g.attributes.position.getY(i)+.002);
  }g.dispose();
  for(let j=0;j<=16;j++){
   const t=j/16,n=riverSectionAt(s,t);
   for(const side of [-1,1]){
    const half=side<0?n.left:n.right,extent=side<0?n.shoulderLeft:n.shoulderRight;
    const radius=half+(n.outer-half)*extent,x=n.x-n.fz*side*radius,z=n.z+n.fx*side*radius;
    const q=projectSegment(x,z,original[s.index],original[s.index+1]);assert.ok(q.distance<=result.maxOffset+1.54*.5+riverBankMargin(1.54)+.00001);
    assert.ok(x>=s.bounds.minX&&x<=s.bounds.maxX&&z>=s.bounds.minZ&&z<=s.bounds.maxZ);
    near(h.bedHeightAt(x,z),heightAt(x,z),.001);
    const inside={x:n.x-n.fz*side*.2,z:n.z+n.fx*side*.2};
    if(Math.floor(inside.z/32)!==Math.floor(29.8/32)){
      assert.ok(h.sampleAt(inside.x,inside.z).insideWater);assert.ok(h.nearSegments(n.x,n.z,.01).some(v=>v.id===s.id));newlyIndexed++;
    }
   }
  }
 }
 assert.ok(newlyIndexed>0,"exercise cells outside the original source bank bins");
 assert.equal(JSON.stringify(original),before);
});
test("junction locks and protected terrain cannot be overridden to force a bend",()=>{
 const {h,line,anchor,heightAt}=fixture(),original=structuredClone(line.nodes),junction=anchor+20;
 const result=bendRepresentativeReach(line,h.segments,anchor,{heightAt,lockedDistances:[junction]});assert.ok(result.nodes>0);
 for(let i=0;i<line.nodes.length;i++)if(Math.abs(original[i].distance-junction)<=8){near(line.nodes[i].x,original[i].x);near(line.nodes[i].z,original[i].z);}
 const blocked=fixture(),before=JSON.stringify(blocked.line.nodes),refused=bendRepresentativeReach(blocked.line,blocked.h.segments,blocked.anchor,{heightAt:blocked.heightAt,protectedAt:()=>"road"});
 assert.equal(refused.nodes,0);assert.equal(refused.reason,"no-safe-amplitude");assert.equal(JSON.stringify(blocked.line.nodes),before);
});
function actual(riverMeanders=false,forestBankCurvature38=true){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j("data/scene.json"),lc={width:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({forestReach39:false,forestBankCurvature38,meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc,riverMeanders});
}
for(const profile of ["v19","v22"])test(profile+" actual forest bend restores retired bed, occupies new terrain and retains junctions and foundations",t=>{
 // These v19/v22 construction fixtures validate the pre-curvature section.
 const w=actual(false,false),baseline=actual(false,false),h=w.hydrology,original=new Map(h.segments.map(s=>[s.id,{a:{...s.a},b:{...s.b},bounds:{...s.bounds}}]));
 const endpoints=h.lines.map(l=>[l.id,l.nodes[0].x,l.nodes[0].z,l.nodes.at(-1).x,l.nodes.at(-1).z]);
 const joins=()=>h.lines.filter(l=>l.join).map(l=>[l.id,...[l.join.line.nodes[l.join.index],l.join.line.nodes[l.join.index+1]].flatMap(n=>[n.x,n.z])]);
 const oldJoins=joins();
 const result=applyRepresentativeMeanders(h.lines,h.segments,h.viewpoints,{heightAt:w.surface.uncarvedHeightAt,profile});h.refreshMeanderIndex();t.diagnostic(JSON.stringify(result));assert.ok(result.nodes>20);assert.ok(result.maxOffset>(profile==="v19"?1.5:4)&&result.maxOffset<=(profile==="v19"?2.8:6.4));
 assert.deepEqual(h.lines.map(l=>[l.id,l.nodes[0].x,l.nodes[0].z,l.nodes.at(-1).x,l.nodes.at(-1).z]),endpoints);assert.deepEqual(joins(),oldJoins);
 let samples=0,padPoints=0,outerPoints=0,roadPoints=0,newChannel=0,retiredBed=0,maxCut=0;
 for(const s of h.segments){
  const old=original.get(s.id);near(s.a.level,old.a.level);near(s.b.level,old.b.level);
  if(!s.meander){assert.deepEqual(s.bounds,old.bounds);continue;}
  assert.deepEqual(s.meanderSource.bounds,old.bounds);
  const g=createWaterGeometry([s],{detail:true});
  for(let i=0;i<g.attributes.position.count;i++){
   const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i),y=g.attributes.position.getY(i),q=h.sampleAt(x,z,{includeDepth:false});
   assert.notEqual(q.surfaceLevel,null);near(q.surfaceLevel+.006,y,.0003);assert.ok(w.surface.heightAt(x,z)<=y+.015);samples++;
  }g.dispose();
  for(let j=0;j<=16;j++){
   const section=riverSectionAt(s,j/16),oldSection=riverSectionAt({...s,a:old.a,b:old.b},j/16);
   if(baseline.hydrology.sampleAt(section.x,section.z).wetness===0){
    const q=h.sampleAt(section.x,section.z);assert.ok(q.insideWater);assert.ok(h.isExcluded(section.x,section.z));newChannel++;
   }
   if(h.sampleAt(oldSection.x,oldSection.z).wetness===0){
    assert.ok(baseline.hydrology.sampleAt(oldSection.x,oldSection.z).insideWater);
    near(h.bedHeightAt(oldSection.x,oldSection.z),w.surface.uncarvedHeightAt(oldSection.x,oldSection.z),.0001);
    for(const padding of [0,.3,1,3])assert.equal(h.isExcluded(oldSection.x,oldSection.z,padding),false);retiredBed++;
   }
   for(const side of [-1,1]){
    const half=side<0?section.left:section.right,extent=side<0?section.shoulderLeft:section.shoulderRight;
    const support=half+(section.outer-half)*extent,p={x:section.x-section.fz*side*support,z:section.z+section.fx*side*support},q=projectSegment(p.x,p.z,old.a,old.b);
    // The terrain-validated displacement bounds the relocation, while the actual
    // bank support and DEM return follow that same moved physical section.
    assert.ok(q.distance<=result.maxOffset+old.a.width*.5+riverBankMargin(old.a.width)+.001);
    assert.ok(p.x>=s.bounds.minX&&p.x<=s.bounds.maxX&&p.z>=s.bounds.minZ&&p.z<=s.bounds.maxZ);
    near(h.bedHeightAt(p.x,p.z),w.surface.uncarvedHeightAt(p.x,p.z),.001);
    const outside=oldSection.outer+result.maxOffset+.02,ox=oldSection.x-oldSection.fz*side*outside,oz=oldSection.z+oldSection.fx*side*outside;
    near(h.bedHeightAt(ox,oz),w.surface.uncarvedHeightAt(ox,oz),.0001);for(const padding of [0,.3,1,3])assert.equal(h.isExcluded(ox,oz,padding),false);outerPoints++;
    for(const across of [0,.5,1]){
      const x=section.x-section.fz*side*half*across,z=section.z+section.fx*side*half*across,ground=w.surface.uncarvedHeightAt(x,z);
      assert.ok(ground>=section.level-.025);const cut=ground-h.bedHeightAt(x,z);maxCut=Math.max(maxCut,cut);
      assert.ok(cut<=2.2+Math.min(2.3,section.sourceWidth*.25));
    }
   }
  }
 }
 for(const p of w.surface.pads){const c=Math.cos(p.rot),s=Math.sin(p.rot);for(const dx of [-1,0,1])for(const dz of [-1,0,1]){if(!dx&&!dz)continue;const x=p.cx+dx*(p.hx+6),z=p.cz+dz*(p.hz+6),wx=p.x+x*c+z*s,wz=p.z-x*s+z*c;near(h.bedHeightAt(wx,wz),w.surface.uncarvedHeightAt(wx,wz),1e-8);padPoints++;}}
 for(const routes of [w.objects.tracks||[],w.objects.paths||[],w.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){
  const a=route.pts[i-1],b=route.pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/5));
  for(let j=0;j<=count;j++){const x=a[0]+(b[0]-a[0])*j/count,z=a[1]+(b[1]-a[1])*j/count;near(h.bedHeightAt(x,z),w.surface.uncarvedHeightAt(x,z),1e-8);roadPoints++;}
 }
 assert.ok(samples>100&&padPoints>2000&&outerPoints>1000&&roadPoints>100&&newChannel>30&&retiredBed>30);t.diagnostic(JSON.stringify({actualWaterVertices:samples,actualFoundationReleasePoints:padPoints,newDesignExteriorPoints:outerPoints,roadPathBoardwalkPoints:roadPoints,newChannelSamples:newChannel,retiredBedSamples:retiredBed,maxActualCut:maxCut}));
});


test("shared reach is idempotent, and runtime integration matches an explicitly unmodified baseline",()=>{
 const original=actual(false),h=original.hydrology;assert.equal(h.stats.meanders.reason,"disabled");
 const once=applyRepresentativeMeanders(h.lines,h.segments,h.viewpoints,{heightAt:original.surface.uncarvedHeightAt});h.refreshMeanderIndex();
 const state=()=>JSON.stringify(h.lines.filter(l=>l.id===once.lineId).map(l=>l.nodes));
 const saved=state(),twice=applyRepresentativeMeanders(h.lines,h.segments,h.viewpoints,{heightAt:original.surface.uncarvedHeightAt});
 assert.strictEqual(twice,once);assert.equal(state(),saved);const indexedLength=h.stats.enabledLength;h.refreshMeanderIndex();near(h.stats.enabledLength,indexedLength);
 const integrated=actual(true),active=integrated.hydrology;assert.ok(active.stats.meanders.nodes>0);
 const pick=hydrology=>hydrology.segments.filter(s=>s.meander&&s.lineId===once.lineId).map(s=>[s.id,s.a.x,s.a.z,s.a.level,s.b.x,s.b.z,s.b.level,s.length,s.a.bankShape,s.b.bankShape]);
 assert.deepEqual(pick(active),pick(h));
 for(const s of active.segments.filter(s=>s.meander)){
  const n=riverSectionAt(s,.43),p=riverCrossPoint(n,.3),q=active.sampleAt(p.x,p.z,{includeDepth:false});
  near(q.flowX,n.fx,1e-6);near(q.flowZ,n.fz,1e-6);assert.equal(q.insideWater,true);
 }
});


test("default forest entrance follows the new physical bank using the established viewing convention",t=>{
 const before=actual(false).hydrology,after=actual(true).hydrology;
 const old=before.viewpoints.find(v=>v.id==="river-forest"),view=after.viewpoints.find(v=>v.id==="river-forest"),s=after.segments.find(s=>s.id===view.segmentId);
 assert.ok(s.meander);const side=s.a.width/2+3.6,tx=s.a.x+s.flowX*8,tz=s.a.z+s.flowZ*8;
 near(view.x,s.a.x-s.flowZ*side);near(view.z,s.a.z+s.flowX*side);
 near(Math.hypot(view.x-s.a.x,view.z-s.a.z),side);
 near((view.x-s.a.x)*s.flowX+(view.z-s.a.z)*s.flowZ,0);
 near(view.yaw,Math.atan2(tx-view.x,-(tz-view.z))*180/Math.PI);
 assert.equal(view.above,old.above);assert.equal(view.pitch,old.pitch);
 assert.ok(Math.hypot(view.x-old.x,view.z-old.z)>.1,"entrance moves with the new bank");
 const section=riverSectionAt(s,0),edge=riverCrossPoint(section,1),edgeDistance=Math.hypot(view.x-edge.x,view.z-edge.z);
 assert.ok(edgeDistance>=3.6-.025&&edgeDistance<=side+.025);
 assert.deepEqual(after.viewpoints.filter(v=>v.id!==view.id),before.viewpoints.filter(v=>v.id!==view.id));
 t.diagnostic(JSON.stringify({position:[view.x,view.z],yaw:view.yaw,sourceCenterOffset:side,physicalWaterEdgeDistance:edgeDistance,oldEntranceShift:Math.hypot(view.x-old.x,view.z-old.z)}));
});


test("v19 opt-in retains the accepted 2.8m reach independently of the new terrain-limited curve",()=>{
 const h=actual("v19").hydrology;near(h.stats.meanders.maxOffset,2.8);assert.equal(h.stats.meanders.profile,"v19");
 near(h.stats.meanders.lengthDelta,-.6432761145053942);
 const view=h.viewpoints.find(v=>v.id==="river-forest");near(view.x,-3611.9813305250705);near(view.z,4805.371282289286);near(view.yaw,-30.90412352938094);
 const n=actual(true).hydrology;assert.equal(n.stats.meanders.profile,"v22");assert.ok(n.stats.meanders.maxOffset>h.stats.meanders.maxOffset*1.8);
 assert.ok(n.stats.meanders.rejected.some(v=>v.reason==="low-water-edge"),"actual terrain, not an arbitrary displacement cap, rejects the full requested curve");
});


test("bounded brook design retains source anchor, all geographic junctions, poses and actual water support",t=>{
 const original=actual(true),oldLocation=globalThis.location;
 let candidate;try{globalThis.location={search:'?brookMeanders=1'};candidate=actual(true);}finally{globalThis.location=oldLocation;}
 const old=original.hydrology,h=candidate.hydrology,result=h.stats.brookMeanders;t.diagnostic(JSON.stringify(result));
 assert.ok(result.nodes>0,'actual terrain must accept a genuine designed curve');assert.ok(result.maxOffset<=2.4&&result.maxOffset>.2);
 const a=old.viewpoints.find(v=>v.id==='brook-lanchuan'),b=h.viewpoints.find(v=>v.id==='brook-lanchuan');assert.deepEqual(b,a);
 const source=old.segments.find(s=>s.id===a.segmentId),anchor=h.segments.find(s=>s.id===a.segmentId);near(anchor.a.x,source.a.x);near(anchor.a.z,source.a.z);
 let roadPoints=0;
 for(const routes of [original.objects.tracks||[],original.objects.paths||[],original.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){
  const p=route.pts[i-1],q=route.pts[i],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz)||1;
  for(let k=0;k<=8;k++)for(const side of [-1,0,1]){
   const x=p[0]+dx*k/8-dz/length*side*(route.width||1.5)/2,z=p[1]+dz*k/8+dx/length*side*(route.width||1.5)/2;
   near(candidate.surface.heightAt(x,z),original.surface.heightAt(x,z),1e-8);roadPoints++;
  }
 }
 for(const e of original.entities)assert.deepEqual(candidate.surface.buildingPose(e.id),original.surface.buildingPose(e.id));
 for(const line of h.lines){const before=old.lines.find(l=>l.id===line.id);line.nodes.forEach((n,i)=>near(n.level,before.nodes[i].level));assert.deepEqual([line.nodes[0].x,line.nodes[0].z,line.nodes.at(-1).x,line.nodes.at(-1).z],[before.nodes[0].x,before.nodes[0].z,before.nodes.at(-1).x,before.nodes.at(-1).z]);
  if(line.join)for(const offset of [0,1]){const q=line.join.line.nodes[line.join.index+offset],r=before.join.line.nodes[before.join.index+offset];near(q.x,r.x);near(q.z,r.z);}
 }
 let waterVertices=0;
 for(const s of h.segments.filter(s=>s.lineId===result.lineId&&s.meander)){
  const g=createWaterGeometry([s],{detail:true});for(let i=0;i<g.attributes.position.count;i++){
   const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i),q=h.sampleAt(x,z,{includeDepth:false});
   assert.notEqual(q.surfaceLevel,null);near(q.surfaceLevel+.006,g.attributes.position.getY(i),.0003);assert.ok(h.bedHeightAt(x,z)<=g.attributes.position.getY(i)+.002);waterVertices++;
  }g.dispose();
 }
 assert.ok(waterVertices>100);t.diagnostic(JSON.stringify({waterVertices,roadPoints,allEntityPoses:'exact',anchor:'exact'}));
});
