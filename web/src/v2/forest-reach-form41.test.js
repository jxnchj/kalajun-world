import test from 'node:test';import assert from 'node:assert/strict';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
import {riverSectionAt,riverCrossPoint} from './river-section.js';
import {createWaterGeometry} from './water.js';
import {reachForm41Parameters,REACH_FORM41_LANDFORMS,REACH_FORM41_REVISION} from './forest-reach-form41.js';
const baseline=actualForestWorld(undefined,'rgba',{forestReach39:false});
const saved=globalThis.location;globalThis.location={search:'?forestReach39=1&forestReachForm41=1'};
const world=actualForestWorld(undefined,'rgba',{forestReach39:true});globalThis.location=saved;
const h=world.hydrology,reach=h.forestReach39,segments=h.segments.filter(reach.activeSegment);
const at=offset=>{const d=reach.origin+offset,s=segments.find(s=>s.a.distance<=d&&s.b.distance>=d);return{s,t:(d-s.a.distance)/(s.b.distance-s.a.distance)};};
test('41 defaults on with explicit old-form fallback, has continuous source-station profiles and independent unequal banks',()=>{
 assert.equal(baseline.hydrology.forestReach39,null);assert.equal(reach.stats.form41,true);assert.equal(reach.stats.giMatched,false);
 const previous=globalThis.location;globalThis.location={search:'?forestReach39=1&forestReachForm41=0'};const old=actualForestWorld(undefined,'rgba',{forestReach39:true});globalThis.location=previous;assert.equal(old.hydrology.forestReach39.stats.form41,false);
 for(const s of [-13.5,-9,1.75,5.75,9,14.75])for(const deposition of [.2,.5,.8]){const a=reachForm41Parameters(s-1e-5,deposition),b=reachForm41Parameters(s+1e-5,deposition);for(const key of ['width','height','run','depth'])assert.ok(Math.abs(a[key]-b[key])<1e-5);}
 const inner=reachForm41Parameters(1.75,.82),outer=reachForm41Parameters(1.75,.18);assert.ok(inner.run>outer.run);assert.ok(inner.height<outer.height);
});
test('actual revised bed preserves geographic network, endpoints, trees and unrelated terrain',()=>{
 assert.deepEqual(h.segments,baseline.hydrology.segments);assert.deepEqual(world.entities,baseline.entities);
 for(const r of FOREST_REACH39_SOURCE.trees)assert.equal(world.surface.heightAt(r.x,r.z),baseline.surface.heightAt(r.x,r.z));
 for(const s of [-18,18]){const{ s:g,t}=at(s),q=riverSectionAt(g,t);assert.deepEqual(reach.waterSectionAt(g,t),q);for(let d=-q.outer;d<=q.outer;d+=.05){const x=q.x-q.fz*d,z=q.z+q.fx*d;assert.equal(world.surface.heightAt(x,z),baseline.surface.heightAt(x,z));}}
 for(const [x,z]of [[0,0],[-1999,3373],[-2220,3363],[-3620,4770],[-3650,4835]])assert.equal(world.surface.heightAt(x,z),baseline.surface.heightAt(x,z));
});
test('every actual section retains connected water volume; center-side and shoreline heights are continuous',()=>{
 for(let offset=-17.9;offset<18;offset+=.25){const{s,t}=at(offset),q=reach.waterSectionAt(s,t);assert.ok(q.width>.35&&q.width<2.5);for(let a=-.99;a<1;a+=.05){const p=riverCrossPoint(q,a),height=world.surface.heightAt(p.x,p.z);assert.ok(height<=q.level+.001,JSON.stringify({offset,a,height,water:q.level}));assert.ok(Math.abs(reach.depthAt(p.x,p.z,q.level)-Math.max(0,q.level-height))<1e-7);}
  const original=riverSectionAt(s,t);for(const d of [-original.left,0,original.right]){const a={x:q.x-q.fz*(d-1e-6),z:q.z+q.fx*(d-1e-6)},b={x:q.x-q.fz*(d+1e-6),z:q.z+q.fx*(d+1e-6)};assert.ok(Math.abs(reach.heightAt(a.x,a.z)-reach.heightAt(b.x,b.z))<1e-5);}
 }
});
test('revised water geometry shares exact near/far source and sampled physical depth',()=>{
 const near=createWaterGeometry(segments,{detail:true,reach}),far=createWaterGeometry(segments,{reach});try{assert.ok(near.userData.depthRefinement41.maxError<.004);assert.ok(near.userData.depthRefinement41.rounds<=4);assert.deepEqual(near.userData.depthRefinement41,far.userData.depthRefinement41);for(const name of ['position','aAcross','aReachDepth'])assert.deepEqual(near.attributes[name].array,far.attributes[name].array);assert.deepEqual(near.index.array,far.index.array);
 let maxError=0;const pos=near.attributes.position,depth=near.attributes.aReachDepth,index=near.index;
 for(let j=0;j<index.count;j+=39){const ids=[index.getX(j),index.getX(j+1),index.getX(j+2)],x=ids.reduce((n,i)=>n+pos.getX(i),0)/3,z=ids.reduce((n,i)=>n+pos.getZ(i),0)/3,level=ids.reduce((n,i)=>n+pos.getY(i),0)/3-.006,pred=ids.reduce((n,i)=>n+depth.getX(i),0)/3;maxError=Math.max(maxError,Math.abs(pred-reach.depthAt(x,z,level)));}assert.ok(maxError<.004,'physical depth error '+maxError);
 }finally{near.dispose();far.dispose();}
});
test('full representative grass and tree identities, sizes and complete leaf geometry survive reach-scale reseating',async t=>{
 const {WorldEcology,MEADOW}=await import('./ecology.js'),a=new WorldEcology(baseline),b=new WorldEcology(world);let grass=0,trees=0,moved=0;
 try{for(let iz=Math.floor(4783/MEADOW.cell);iz<=Math.ceil(4829/MEADOW.cell);iz++)for(let ix=Math.floor(-3634/MEADOW.cell);ix<=Math.ceil(-3590/MEADOW.cell);ix++){
  const p=a._grassAt(ix,iz),q=b._grassAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(!p)continue;
  const {y:py,x:px,z:pz,brookAsset:pa,...pr}=p,{y:qy,x:qx,z:qz,forestReachMove,brookAsset:qa,...qr}=q;assert.deepEqual(pr,qr);
  if(forestReachMove){moved++;assert.ok(Math.hypot(qx-px,qz-pz)<=1.600001);assert.equal(world.hydrology.sampleAt(qx,qz).insideWater,false);assert.ok(qa);for(const[k,g]of qa.geometries.entries()){const source=[b.grassGeometries[0],b.grassGeometries[1],b.baseGrassGeometry][k];assert.equal(g.attributes.position.count,source.attributes.position.count);assert.deepEqual(g.attributes.aPlantWind.array,source.attributes.aPlantWind.array);assert.deepEqual(g.index.array,source.index.array);}}
  else{assert.equal(px,qx);assert.equal(pz,qz);}assert.ok(Math.abs(qy-(world.surface.heightAt(qx,qz)-.035))<1e-8);pa?.dispose();qa?.dispose();grass++;
 }
 for(let iz=398;iz<=403;iz++)for(let ix=-304;ix<=-298;ix++){const p=a.treeAt(ix,iz),q=b.treeAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(!p)continue;const{y:py,...pr}=p,{y:qy,...qr}=q;assert.deepEqual(pr,qr);assert.equal(py,qy);trees++;}
 assert.equal(grass,1317);assert.equal(trees,42);assert.ok(moved>=24);t.diagnostic(JSON.stringify({grass,trees,moved,layout:b.forestReachCommunity39.stats}));
 }finally{a.dispose();b.dispose();}
});

test('whole-reach local landforms produce alternating genuine bank widths and shallow/deep sections',()=>{
 assert.equal(reach.stats.form41Revision,REACH_FORM41_REVISION);let min=Infinity,max=0;
 for(let offset=-14;offset<=14;offset+=.125){const{s,t}=at(offset),q=reach.waterSectionAt(s,t);min=Math.min(min,q.width);max=Math.max(max,q.width);}
 assert.ok(max-min>.48,JSON.stringify({min,max}));
 for(const f of REACH_FORM41_LANDFORMS){const p=reachForm41Parameters(f.offset,.5,f.side);assert.ok(Math.abs(p.edgeShift)>.18,f.name);}
});
test('real root input hashes distinguish base, old39, form41 and the form revision',async()=>{
 const previous=globalThis.location;globalThis.location={search:'?forestReach39=1&forestReachForm41=0'};const old=actualForestWorld(undefined,'rgba',{forestReach39:true});globalThis.location=previous;
 assert.notDeepEqual(await world.getForestRootInputHashes(),await old.getForestRootInputHashes());assert.notDeepEqual(await old.getForestRootInputHashes(),await baseline.getForestRootInputHashes());
 // Source hashes are intentionally memoized per world; compare a new world
 // carrying a changed revision before its first hash is materialized.
 globalThis.location={search:'?forestReach39=1&forestReachForm41=1'};const changed=actualForestWorld(undefined,'rgba',{forestReach39:true});globalThis.location=previous;changed.hydrology.forestReach39.stats.form41Revision=REACH_FORM41_REVISION+'-changed';assert.notDeepEqual(await changed.getForestRootInputHashes(),await world.getForestRootInputHashes());
});
