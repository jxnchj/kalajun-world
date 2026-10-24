import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {riverSectionAt,riverCrossPoint,riverBankRise} from './river-section.js';
import {createWaterGeometry} from './water.js';
import {applyBrookIncision} from './river-incision.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function actual(riverMeanders=false){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j("data/scene.json"),lc={width:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc,riverMeanders});
}
function candidate(search="?brookIncision=1"){const previous=globalThis.location;try{globalThis.location={search};return actual(true);}finally{globalThis.location=previous;}}
test('real brook incision creates physical bank relief while preserving geography, hydraulic grade and facilities',t=>{
 const original=actual(true),world=candidate(),old=original.hydrology,h=world.hydrology,result=h.stats.brookIncision;
 t.diagnostic(JSON.stringify(result));assert.ok(result.nodes>20);assert.ok(result.anchorLowering>=.12&&result.anchorLowering<=.25);assert.ok(result.maxGradeChange<=.004001);
 assert.deepEqual(h.viewpoints,old.viewpoints);assert.equal(h.stats.enabledLength,old.stats.enabledLength);assert.equal(h.segments.length,old.segments.length);
 for(const l of h.lines){const before=old.lines.find(q=>q.id===l.id);
  l.nodes.forEach((n,i)=>{const b=before.nodes[i];assert.deepEqual([n.x,n.z,n.width,n.depth,n.distance],[b.x,b.z,b.width,b.depth,b.distance]);assert.ok(n.level<=b.level+1e-9);assert.ok(b.level-n.level<=.25);if(i)assert.ok(n.level<=l.nodes[i-1].level+1e-9);});
  near(l.nodes[0].level,before.nodes[0].level);near(l.nodes.at(-1).level,before.nodes.at(-1).level);
  if(l.join)for(const offset of [0,1])near(l.join.line.nodes[l.join.index+offset].level,before.join.line.nodes[before.join.index+offset].level);
 }
 let roads=0,water=0,shores=0;
 for(const routes of [original.objects.tracks||[],original.objects.paths||[],original.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){
  const p=route.pts[i-1],q=route.pts[i],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz)||1;
  for(let k=0;k<=8;k++)for(const side of [-1,0,1]){const x=p[0]+dx*k/8-dz/length*side*(route.width||1.5)/2,z=p[1]+dz*k/8+dx/length*side*(route.width||1.5)/2;near(world.surface.heightAt(x,z),original.surface.heightAt(x,z),1e-8);roads++;}
 }
 for(const e of original.entities)assert.deepEqual(world.surface.buildingPose(e.id),original.surface.buildingPose(e.id));
 for(const s of h.segments.filter(s=>s.incision)){
  const g=createWaterGeometry([s],{detail:true});for(let i=0;i<g.attributes.position.count;i++){
   const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i),q=h.sampleAt(x,z,{includeDepth:false});near(q.surfaceLevel+.006,g.attributes.position.getY(i),.0003);assert.ok(h.bedHeightAt(x,z)<=g.attributes.position.getY(i)+.002);water++;
  }g.dispose();
  for(const t of [0,.25,.5,.75,1])for(const side of [-1,1]){
   const q=riverSectionAt(s,t),p=riverCrossPoint(q,side),sample=h.sampleAt(p.x,p.z,{includeDepth:false});near(sample.surfaceLevel,q.level,.0001);near(h.bedHeightAt(p.x,p.z),q.level,.002);
   const extent=side<0?q.shoulderLeft:q.shoulderRight,half=side<0?q.left:q.right,radius=half+(q.outer-half)*extent;
   const x=q.x-q.fz*side*radius,z=q.z+q.fx*side*radius;near(h.bedHeightAt(x,z),world.surface.uncarvedHeightAt(x,z),.002);shores++;
  }
 }
 assert.ok(water>100&&shores>100);t.diagnostic(JSON.stringify({roads,water,shores,allEntityPoses:'exact'}));
 const levels=h.lines.map(l=>l.nodes.map(n=>n.level));assert.strictEqual(applyBrookIncision(h.lines,h.segments,h.viewpoints,{heightAt:world.surface.uncarvedHeightAt}),result);assert.deepEqual(h.lines.map(l=>l.nodes.map(n=>n.level)),levels);
});

test('flat hydraulic reach and protected ground reject incision without partially mutating shared nodes',()=>{
 const make=(slope)=>{
  const nodes=Array.from({length:81},(_,i)=>({x:i*4,z:0,distance:i*4,width:1,depth:.24,level:100-i*4*slope,flowX:1,flowZ:0}));
  const line={id:'fixture',nodes},segments=nodes.slice(0,-1).map((a,i)=>({id:`fixture:${i}`,lineId:'fixture',index:i,a,b:nodes[i+1],length:4,slope,flowX:1,flowZ:0}));
  return {line,segments,views:[{id:'brook-lanchuan',segmentId:'fixture:40'}],heightAt:x=>100.05-x*slope};
 };
 const flat=make(0),before=structuredClone(flat.line.nodes);
 const a=applyBrookIncision([flat.line],flat.segments,flat.views,{heightAt:flat.heightAt});assert.equal(a.reason,'insufficient-hydraulic-room');assert.deepEqual(flat.line.nodes,before);
 const downhill=make(.02),original=structuredClone(downhill.line.nodes);
 const b=applyBrookIncision([downhill.line],downhill.segments,downhill.views,{heightAt:downhill.heightAt,protectedAt:()=>true});assert.equal(b.reason,'protected-ground');assert.deepEqual(downhill.line.nodes,original);
});

test('combined brook landform aligns point bars with actual bends and preserves shared water, shoulders and facilities',t=>{
 const original=actual(true),world=candidate('?brookLandform=1'),h=world.hydrology,old=original.hydrology;
 t.diagnostic(JSON.stringify({incision:h.stats.brookIncision,meander:h.stats.brookMeanders,banks:h.stats.brookBendBanks}));
 assert.ok(h.stats.brookIncision.nodes>0&&h.stats.brookMeanders.nodes>0&&h.stats.brookBendBanks.nodes>0);
 const line=h.lines.find(l=>l.id===h.stats.brookMeanders.lineId),before=old.lines.find(l=>l.id===line.id);
 assert.deepEqual(h.viewpoints,old.viewpoints);const anchor=h.segments.find(s=>s.id===h.viewpoints.find(v=>v.id==='brook-lanchuan').segmentId),prior=old.segments.find(s=>s.id===anchor.id);near(anchor.a.x,prior.a.x);near(anchor.a.z,prior.a.z);
 for(const l of h.lines){const prev=old.lines.find(q=>q.id===l.id);assert.deepEqual([l.nodes[0].x,l.nodes[0].z,l.nodes[0].level,l.nodes.at(-1).x,l.nodes.at(-1).z,l.nodes.at(-1).level],[prev.nodes[0].x,prev.nodes[0].z,prev.nodes[0].level,prev.nodes.at(-1).x,prev.nodes.at(-1).z,prev.nodes.at(-1).level]);for(let i=1;i<l.nodes.length;i++)assert.ok(l.nodes[i].level<=l.nodes[i-1].level+1e-9);}
 let insideLeft=0,insideRight=0,water=0,terraces=0,roads=0;
 line.nodes.forEach((n,i)=>{if((n.bankShape?.bendWeight??0)<.999)return;const a=line.nodes[Math.max(0,i-3)],b=line.nodes[Math.min(line.nodes.length-1,i+3)],cross=(n.x-a.x)*(b.z-n.z)-(n.z-a.z)*(b.x-n.x);if(Math.abs(cross)<.001)return;assert.ok((n.bankShape.barLeft-n.bankShape.barRight)*cross>0);if(cross>0)insideLeft++;else insideRight++;});
 assert.ok(insideLeft>0&&insideRight>0);
 for(const s of h.segments.filter(s=>s.lineId===line.id&&s.incision)){
  const g=createWaterGeometry([s],{detail:true});for(let i=0;i<g.attributes.position.count;i++){const x=g.attributes.position.getX(i),z=g.attributes.position.getZ(i),q=h.sampleAt(x,z,{includeDepth:false});near(q.surfaceLevel+.006,g.attributes.position.getY(i),.0003);assert.ok(h.bedHeightAt(x,z)<=g.attributes.position.getY(i)+.002);water++;}g.dispose();
  for(const at of [0,.25,.5,.75,1])for(const side of [-1,1]){const q=riverSectionAt(s,at),half=side<0?q.left:q.right,extent=side<0?q.shoulderLeft:q.shoulderRight;let previous=-1;
   for(let j=0;j<=40;j++){const v=riverBankRise(q,side,extent*j/40);assert.ok(v>=previous-1e-9);previous=v;}near(previous,1);
   const r=half+(q.outer-half)*extent,x=q.x-q.fz*side*r,z=q.z+q.fx*side*r;near(h.bedHeightAt(x,z),world.surface.uncarvedHeightAt(x,z),.003);terraces++;
  }
 }
 for(const routes of [original.objects.tracks||[],original.objects.paths||[],original.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){const p=route.pts[i-1],q=route.pts[i],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz)||1;for(let k=0;k<=8;k++)for(const side of [-1,0,1]){const x=p[0]+dx*k/8-dz/length*side*(route.width||1.5)/2,z=p[1]+dz*k/8+dx/length*side*(route.width||1.5)/2;near(world.surface.heightAt(x,z),original.surface.heightAt(x,z),1e-8);roads++;}}
 for(const e of original.entities)assert.deepEqual(world.surface.buildingPose(e.id),original.surface.buildingPose(e.id));
 t.diagnostic(JSON.stringify({insideLeft,insideRight,water,terraces,roads,allEntityPoses:'exact'}));
});
