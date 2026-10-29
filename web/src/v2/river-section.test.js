import test from "node:test";
import assert from "node:assert/strict";
import {createHydrology} from "./hydrology.js";
import {riverSectionAt,riverCrossPoint,riverSectionDepth,riverBankRise,riverBankMaterialDistance,projectRiverSection,riverBankMargin} from "./river-section.js";
import {createWaterGeometry} from "./water.js";
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function fixture(naturalBanks=true){
  const streamData={lines:[Array.from({length:121},(_,i)=>[i*4,Math.sin(i*.035)*9,4])]},heightAt=(x,z)=>200-x*.025+Math.abs(z)*.0002;
  return {heightAt,h:createHydrology({streamData,heightAt,naturalBanks})};
}
test("representative bank shape preserves every source centre/level, enabled span and protection envelope",()=>{
  const {h}=fixture(),old=fixture(false).h;
  assert.equal(h.segments.length,old.segments.length);assert.deepEqual(h.unresolved.map(s=>[s.id,s.reason]),old.unresolved.map(s=>[s.id,s.reason]));
  for(let i=0;i<h.lines.length;i++)assert.deepEqual(h.lines[i].nodes.map(n=>[n.x,n.z,n.width,n.level,n.distance]),old.lines[i].nodes.map(n=>[n.x,n.z,n.width,n.level,n.distance]));
  for(let i=0;i<h.segments.length;i++)assert.deepEqual(h.segments[i].bounds,old.segments[i].bounds);
  assert.ok(h.stats.naturalBanks.segments>0);let asymmetric=0,shallow=0;
  for(const s of h.segments)for(const t of [0,.25,.5,.75,1]){
    const n=riverSectionAt(s,t);assert.ok(n.left>0&&n.right>0);assert.ok(n.left<=n.sourceWidth*.5&&n.right<=n.sourceWidth*.5);
    near(n.outer,n.sourceWidth*.5+riverBankMargin(n.sourceWidth));
    if(Math.abs(n.left-n.right)>.05)asymmetric++;
    if(n.weight>.95){near(riverSectionDepth(n,1),.025*(1-n.weight));if(riverSectionDepth(n,.7)<.12)shallow++;}
  }
  assert.ok(asymmetric>30&&shallow>30);
});
test("turning water cross-sections invert to the shared query, bed and vegetation exclusion",()=>{
  const {h,heightAt}=fixture();let samples=0;
  for(const s of h.segments.filter(s=>s.naturalBanks))for(const t of [.18,.5,.82]){
    const n=riverSectionAt(s,t);
    for(const side of [-.8,-.55,0,.55,.8]){
      const p=riverCrossPoint(n,side),inverse=projectRiverSection(p.x,p.z,s,t+.01);
      near(inverse.t,t,1e-6);const q=h.sampleAt(p.x,p.z),cheap=h.sampleAt(p.x,p.z,{includeDepth:false});
      assert.equal(q.insideWater,true);assert.equal(cheap.insideWater,true);assert.equal(h.isExcluded(p.x,p.z),true);
      near(q.waterLevel,n.level,.0001);near(q.depth,riverSectionDepth(n,side),.0001);near(q.waterLevel-h.bedHeightAt(p.x,p.z),q.depth);
      assert.ok(h.bedHeightAt(p.x,p.z)<=heightAt(p.x,p.z));samples++;
    }
    for(const side of [-1,1]){
      const half=side<0?n.left:n.right,inside={x:n.x-n.fz*side*(half-.001),z:n.z+n.fx*side*(half-.001)},outside={x:n.x-n.fz*side*(half+.001),z:n.z+n.fx*side*(half+.001)};
      near(h.bedHeightAt(inside.x,inside.z),h.bedHeightAt(outside.x,outside.z),.002);
      const edge={x:n.x-n.fz*side*n.outer,z:n.z+n.fx*side*n.outer};near(h.bedHeightAt(edge.x,edge.z),heightAt(edge.x,edge.z),.002);
    }
  }
  assert.ok(samples>100);
});
test("modified cross-section endpoints and shader profile attributes are identical across chunks and both water representations",()=>{
  const {h}=fixture();let count=0;
  for(let j=0;j<h.segments.length-1;j++){
    const a=h.segments[j],b=h.segments[j+1];if(a.b!==b.a||(!a.naturalBanks&&!b.naturalBanks))continue;
    const g=createWaterGeometry([a],{detail:true});
    for(const detail of [false,true]){
      const k=createWaterGeometry([b],{detail}),last=g.attributes.position.count-5;
      for(const [ia,ib] of [[last,0],[last+4,detail?4:1]])for(const name of ["position","aRiverProfile","aAcross"]){
        const x=g.attributes[name],y=k.attributes[name];for(let c=0;c<x.itemSize;c++)assert.equal(x.getComponent(ia,c),y.getComponent(ib,c));
      }
      k.dispose();
    }
    g.dispose();count++;
  }
  assert.ok(count>20);
});


test("one-sided bank rise and moisture coordinates are monotone, bounded and meet both unchanged endpoints",()=>{
  const section={left:.6,right:.75,outer:2.1,barLeft:.94,barRight:.08,weight:1};
  for(const weight of [0,.2,.7,1])for(const barLeft of [.08,.27,.51,.79,.94])for(const side of [-1,1]){
    const n={...section,weight,barLeft,barRight:1.02-barLeft},half=side<0?n.left:n.right;
    let prevRise=-1,prevMaterial=-1;
    for(let i=0;i<=200;i++){
      const u=i/200,d=half+(n.outer-half)*u,r=riverBankRise(n,side,u),m=riverBankMaterialDistance(n,side,d);
      assert.ok(r>=prevRise&&r>=0&&r<=1);assert.ok(m>=prevMaterial&&m>=half&&m<=n.outer);
      if(weight===0){near(r,u*u*(3-2*u));near(m,d);}
      prevRise=r;prevMaterial=m;
    }
    assert.equal(riverBankRise(n,side,0),0);assert.equal(riverBankRise(n,side,1),1);
    near(riverBankMaterialDistance(n,side,half),half);near(riverBankMaterialDistance(n,side,n.outer),n.outer);
    assert.ok(riverBankRise(n,side,1e-5)/1e-5<.001);
    assert.ok((1-riverBankRise(n,side,1-1e-5))/1e-5<.001);
  }
  assert.ok(riverBankRise(section,1,.5)-riverBankRise(section,-1,.5)>.5,"opposite bank must not duplicate the low shoulder");
});
test("bank height and cheap masks follow the same side strength without extra height reads or wider vegetation exclusion",()=>{
  const {h}=fixture();let reads=0;h.bindSurface(()=>{reads++;throw new Error("mask-only query sampled the final height");});
  for(const s of h.segments.filter(s=>s.naturalBanks))for(const side of [-1,1]){
    const n=riverSectionAt(s,.5),half=side<0?n.left:n.right,margin=n.outer-half;
    const point=d=>({x:n.x-n.fz*side*d,z:n.z+n.fx*side*d});
    for(const u of [.1,.4,.7,.95]){
      const d=half+u*margin,p=point(d),base=200,q=h.sampleAt(p.x,p.z,{includeDepth:false});
      if(q.id!==s.id)continue;
      near(h.bedHeightAt(p.x,p.z,base),n.level-.025*(1-n.weight)+(base-n.level+.025*(1-n.weight))*riverBankRise(n,side,u),.00001);
      const m=riverBankMaterialDistance(n,side,d),t=Math.max(0,Math.min(1,(m-half*.65)/(margin+half*.35)));
      near(q.wetness,1-t*t*(3-2*t),.00001);
    }
    const p=point(n.outer+.01);
    assert.equal(h.isExcluded(p.x,p.z),false);assert.equal(h.sampleAt(p.x,p.z,{includeDepth:false}).wetness,0);
    const root=point(half*.7);assert.equal(h.isExcluded(root.x,root.z),true);
  }
  assert.equal(reads,0);
});

import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
function actual(){
  const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
  const meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
  // Actual DEM/detail, network and buildings; landcover is not used by these physical checks.
  return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),
    coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
    detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}
test("real representative water edges reject neighbour end caps without cutting any foundation release or expanding outside-bank exclusion",t=>{
  const w=actual(),h=w.hydrology;let padPoints=0,shorePoints=0,maxOverlap=0;
  for(const p of w.surface.pads){
    const c=Math.cos(p.rot),s=Math.sin(p.rot),toWorld=(x,z)=>({x:p.x+x*c+z*s,z:p.z-x*s+z*c});
    for(const release of [0,3,6])for(const a of [-1,0,1])for(const b of [-1,0,1]){
      if(a===0&&b===0)continue;
      const q=toWorld(p.cx+a*(p.hx+release),p.cz+b*(p.hz+release)),raw=w.surface.uncarvedHeightAt(q.x,q.z);
      near(h.bedHeightAt(q.x,q.z),raw,1e-8);assert.equal(h.isExcluded(q.x,q.z),false);padPoints++;
    }
  }
  for(const view of h.viewpoints)for(const seg of h.nearSegments(view.x,view.z,200)){
    const g=createWaterGeometry([seg],{detail:true,reach:h.forestReach39}),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const bed=w.surface.heightAt(p.getX(i),p.getZ(i));maxOverlap=Math.max(maxOverlap,bed-p.getY(i));
      assert.ok(bed-p.getY(i)<.015,"actual end-cap/water-edge overlap");
    }
    g.dispose();
    if(!seg.naturalBanks)continue;
    const n=riverSectionAt(seg,.5);
    for(const side of [-1,1]){
      const x=n.x-n.fz*side*(n.outer+.01),z=n.z+n.fx*side*(n.outer+.01),q=h.sampleAt(x,z,{includeDepth:false});
      if(q.id!==null)continue; // Another preserved channel may legitimately be nearby.
      assert.equal(h.isExcluded(x,z),false);near(h.bedHeightAt(x,z),w.surface.uncarvedHeightAt(x,z));shorePoints++;
    }
  }
  assert.ok(padPoints>5000&&shorePoints>100);t.diagnostic(JSON.stringify({padPoints,shorePoints,maxWaterEdgeOverlap:maxOverlap}));
});


test("variable shoulders return geometry and material to the same untouched ground before the fixed envelope",t=>{
 const {h,heightAt}=fixture();let returned=0,shortened=0,minFraction=1,maxFraction=0;
 for(const segment of h.segments.filter(s=>s.naturalBanks))for(const t of [.2,.5,.8]){
  const section=riverSectionAt(segment,t);
  for(const side of [-1,1]){
   const half=side<0?section.left:section.right,extent=side<0?section.shoulderLeft:section.shoulderRight;
   assert.ok(extent>=.38&&extent<=1);minFraction=Math.min(minFraction,extent);maxFraction=Math.max(maxFraction,extent);
   if(extent<.75)shortened++;
   const distance=half+(section.outer-half)*extent;
   near(riverBankRise(section,side,extent),1);near(riverBankMaterialDistance(section,side,distance),section.outer);
   const x=section.x-section.fz*side*distance,z=section.z+section.fx*side*distance;
   const q=h.sampleAt(x,z,{includeDepth:false});
   if(q.id!==segment.id)continue;
   near(q.wetness,0);near(q.riverBed,0);near(q.bank,0);
   near(h.bedHeightAt(x,z),heightAt(x,z),1e-7);returned++;
  }
 }
 assert.ok(returned>100&&shortened>100);
 assert.ok(maxFraction-minFraction>.35,"actual shoulder widths must vary, not simply shrink both banks uniformly");
 t.diagnostic(JSON.stringify({returned,shortened,minFraction,maxFraction}));
});


test("cut banks interrupt the continuous low wet shoulder while deposition, water and outer ground remain",()=>{
 const section={left:.6,right:.75,outer:2.1,barLeft:.94,barRight:.08,weight:1};
 // Deposition pockets remain identical; only the opposite cut foot changes.
 for(let i=0;i<=200;i++)near(riverBankRise(section,-1,i/200,"v20"),riverBankRise(section,-1,i/200,"v19"));
 assert.ok(riverBankRise(section,1,.12,"v20")>riverBankRise(section,1,.12,"v19")+.25);
 for(const weight of [0,.2,.7,1])for(const deposition of [.08,.3,.6,.94])for(const side of [-1,1]){
  const n={...section,weight,barLeft:deposition,barRight:deposition,shoulderLeft:.55,shoulderRight:.85};
  const half=side<0?n.left:n.right,extent=side<0?n.shoulderLeft:n.shoulderRight;
  let previous=-1;
  for(let i=0;i<=200;i++){
   const u=i/200,rise=riverBankRise(n,side,u,"v20"),distance=half+(n.outer-half)*u;
   assert.ok(rise>=previous-1e-12&&rise<=1);previous=rise;
   const old=riverBankRise(n,side,u,"v19");assert.ok(rise>=old-1e-12,"new cut bank never deepens an existing cut or floods dry terrain");
   const q=Math.max(0,Math.min(1,u/extent));
   const oldMaterial=half+(n.outer-half)*(q+(old-q)*.60*n.weight);
   near(riverBankMaterialDistance(n,side,distance),oldMaterial);
   // Damp-soil selection retains its old continuous support, while material
   // exposure follows actual physical height in shoreTerrainBedCoverage.
  }
  near(riverBankRise(n,side,0,"v20"),0);near(riverBankRise(n,side,extent,"v20"),1);
  near(riverBankMaterialDistance(n,side,half,"v20"),half);
  near(riverBankMaterialDistance(n,side,n.outer,"v20"),n.outer);
 }
});


test("connected bank reaches vary left and right independently without deepening cuts or moving water and soil masks",t=>{
 const base={left:.6,right:.75,outer:2.1,barLeft:.6,barRight:.42,weight:1,shoulderLeft:.8,shoulderRight:.7};
 const values=[[],[]];let min=1,max=0;
 for(let distance=0;distance<180;distance+=.25){
  const section={...base,distance};
  for(const side of [-1,1]){
   let previous=-1;
   for(let i=0;i<=100;i++){
    const u=i/100,r=riverBankRise(section,side,u,"v21"),old=riverBankRise(section,side,u,"v20");
    assert.ok(r>=old-1e-12&&r>=previous-1e-12&&r<=1);previous=r;
   }
   assert.equal(riverBankRise(section,side,0,"v21"),0);assert.equal(riverBankRise(section,side,1,"v21"),1);
   const value=riverBankRise(section,side,.25,"v21");values[side<0?0:1].push(value);min=Math.min(min,value);max=Math.max(max,value);
   const a=riverBankRise({...section,distance:distance-.00001},side,.25,"v21"),b=riverBankRise({...section,distance:distance+.00001},side,.25,"v21");
   assert.ok(Math.abs(a-b)<.00001,"river-distance kernels meet continuously even at 7/23 m cell boundaries");
   const zero={...section,weight:0};near(riverBankRise(zero,side,.25,"v21"),riverBankRise(zero,side,.25,"v20"));
  }
 }
 assert.ok(max-min>.25,"actual shape changes across reaches, not one narrower parallel strip");
 let asymmetric=0;for(let i=0;i<values[0].length;i++)if(Math.abs(values[0][i]-values[1][i])>.1)asymmetric++;
 assert.ok(asymmetric>100,"left and right cannot form repeated paired cuts");
 t.diagnostic(JSON.stringify({minRiseAtQuarterBank:min,maxRiseAtQuarterBank:max,asymmetricSamples:asymmetric}));
});


test("v23 contours alternate retained deposition shelves and compact reaches without moving wetness or water",t=>{
 const {h}=fixture();let broad=0,compact=0,asymmetric=0;let maxChange=0;
 for(const segment of h.segments.filter(s=>s.naturalBanks))for(const t of [.2,.5,.8]){
  const section=riverSectionAt(segment,t),values=[];
  for(const side of [-1,1]){
   let previous=-1,changed=0;
   for(let i=0;i<=100;i++){
    const u=i/100,a=riverBankRise(section,side,u,"v21"),b=riverBankRise(section,side,u,"v23");
    assert.ok(b>=a-1e-12&&b>=previous-1e-12&&b<=1,"cut is never deeper or non-monotone");previous=b;changed=Math.max(changed,b-a);
   }
   maxChange=Math.max(maxChange,changed);if(changed<.08)broad++;if(changed>.25)compact++;
   values.push(riverBankRise(section,side,.2,"v23"));
   near(riverBankRise(section,side,0,"v23"),0);near(riverBankRise(section,side,1,"v23"),1);
   assert.ok(riverBankRise(section,side,1e-7,"v23")/1e-7<.001,"water edge remains tangent-continuous");
   const a=riverBankRise({...section,distance:section.distance-1e-6},side,.2,"v23"),b=riverBankRise({...section,distance:section.distance+1e-6},side,.2,"v23");
   assert.ok(Math.abs(a-b)<1e-5,"along-bank shape stays continuous");
  }
  if(Math.abs(values[0]-values[1])>.25)asymmetric++;
 }
 assert.ok(broad>20,"wide shallow deposition pockets must survive");assert.ok(compact>20,"actual exposed cut footprint must contract in some reaches");assert.ok(asymmetric>20,"opposite banks must not copy one another");
 const zero={left:.6,right:.75,outer:2.1,barLeft:.6,barRight:.42,weight:0};
 for(const side of [-1,1])for(const u of [0,.1,.5,1])near(riverBankRise(zero,side,u,"v23"),riverBankRise(zero,side,u,"v21"));
 t.diagnostic(JSON.stringify({retainedBroadSides:broad,compactSides:compact,asymmetricSections:asymmetric,maxRiseChange:maxChange}));
});


test("v24 transition shoulders release the low foot while retaining full deposition bays and all water endpoints",t=>{
  const {h}=fixture();let changed=0,unchanged=0,maxRise=0,oldLow=0,newLow=0;
  for(const segment of h.segments.filter(s=>s.naturalBanks))for(const t of [.2,.5,.8]){
    const section=riverSectionAt(segment,t);
    for(const side of [-1,1]){
      let prev=-1,delta=0;
      for(let i=0;i<=200;i++){
        const u=i/200,old=riverBankRise(section,side,u,"v23"),now=riverBankRise(section,side,u,"v24");
        assert.ok(now>=old-1e-12&&now>=prev-1e-12&&now<=1,"same cut-only monotone shoulder");prev=now;
        delta=Math.max(delta,now-old);maxRise=Math.max(maxRise,now-old);
        if(old<.24)oldLow++;if(now<.24)newLow++;
      }
      if(delta>.008)changed++;else unchanged++;
      near(riverBankRise(section,side,0,"v24"),0);near(riverBankRise(section,side,1,"v24"),1);
      assert.ok(riverBankRise(section,side,1e-7,"v24")/1e-7<.001,"no sharp water-lip step");
      const fullBay={...section,barLeft:.94,barRight:.94};
      for(const u of [0,.1,.3,.5,.8,1]){
        const old=riverBankRise(fullBay,side,u,"v23"),now=riverBankRise(fullBay,side,u,"v24");
        assert.equal(now===1,old===1,"full depositional bay returns to ground at the same outer extent");
        assert.ok(now>=old-1e-12,"same wide bay has a rising shoulder, not a lower trough");
      }
      const zero={...section,weight:0};
      near(riverBankRise(zero,side,.25,"v24"),riverBankRise(zero,side,.25,"v23"));
    }
  }
  assert.ok(changed>100&&unchanged>20,"depositional sides change while cut-bank reaches retain their form");
  assert.ok(newLow<oldLow*.98,"actual low shoulder footprint decreases, not just its colour");
  t.diagnostic(JSON.stringify({changedTransitionSides:changed,retainedSides:unchanged,maxRiseChange:maxRise,lowShoulderRatio:newLow/oldLow}));
});


import {terrainFragmentBedCoverage} from "./terrain-material.js";
import {shoreTerrainBedCoverage} from "./shore-material.js";
test("real bank cross sections reject interpolated elevated mud but preserve every submerged endpoint",t=>{
 const w=actual(),h=w.hydrology;let elevated=0,submerged=0,rejected=0,maxRejected=0;
 for(const view of h.viewpoints)for(const seg of h.nearSegments(view.x,view.z,80)){
  const section=riverSectionAt(seg,.5);
  for(const side of [-1,1]){
   const half=side<0?section.left:section.right;
   for(let d=half-.5;d<section.outer;d+=.3125){
    const endpoints=[d,d+.3125].map(r=>{
     const x=section.x-section.fz*side*r,z=section.z+section.fx*side*r;
     const y=w.surface.heightAt(x,z),water=h.sampleAt(x,z,{includeDepth:false});
     return {clearance:Number.isFinite(water.surfaceLevel)?y-water.surfaceLevel:.12,
      radial:water.riverBed,coverage:shoreTerrainBedCoverage(water.riverBed,y,water.surfaceLevel)};
    });
    for(const alpha of [0,.25,.5,.75,1]){
     const clearance=endpoints[0].clearance*(1-alpha)+endpoints[1].clearance*alpha;
     const old=endpoints[0].coverage*(1-alpha)+endpoints[1].coverage*alpha;
     const radial=endpoints[0].radial*(1-alpha)+endpoints[1].radial*alpha;
     const value=terrainFragmentBedCoverage(radial,clearance);
     if(clearance<=.02){assert.equal(value,radial);submerged++;}
     if(alpha===0||alpha===1)assert.ok(Math.abs(value-old)<1e-10,"each source endpoint retains its exact physical coverage");
     if(clearance>=.12){assert.equal(value,0);elevated++;if(old>.01)rejected++;maxRejected=Math.max(maxRejected,old);}
    }
   }
  }
 }
 assert.ok(submerged>100&&elevated>100&&rejected>10);
 t.diagnostic(JSON.stringify({submerged,elevated,rejected,maxRejected}));
});
