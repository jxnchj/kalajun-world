import {reachPlantIntersectsWater40} from './reach-water-contact40.js';
import test from 'node:test';import{readFileSync}from'node:fs';import assert from 'node:assert/strict';import * as T from 'three';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
// These fixtures preserve the original 39 geometry; adopted 41 coverage is tested separately.
function legacyReachWorld39(){const previous=globalThis.location;try{globalThis.location={search:'?forestReachForm41=0'};return actualForestWorld(undefined,'rgba',{forestReach39:true});}finally{globalThis.location=previous;}}
import {WorldEcology} from './ecology.js';import {ReachBankCover39,reachCoverPrototype39} from './forest-reach-cover39.js';import{createForestFloorGeometry}from'./forest-floor.js';import{brookGrassIntersectsWater}from'./brook-shoulder-grass.js';
test('new sedge keeps every original vertex/leaf and root mat has real positive thickness',()=>{const a=reachCoverPrototype39('sedge'),b=createForestFloorGeometry('sedge'),m=reachCoverPrototype39('mat');try{assert.equal(a.groups.length,17);assert.deepEqual(a.geometry.index.array,b.index.array);for(const[k,v]of Object.entries(b.attributes))assert.deepEqual(a.geometry.attributes[k].array,v.array);assert.equal(m.groups.length,24);m.geometry.computeBoundingBox();assert.ok(m.geometry.boundingBox.max.y>.025);assert.ok(m.geometry.boundingBox.max.x-m.geometry.boundingBox.min.x>.18);assert.ok(m.geometry.index.count>=24*18);}finally{a.geometry.dispose();b.dispose();m.geometry.dispose();}});
test('default and explicit sub-switch create no new geometry or materials',()=>{const c=new ReachBankCover39({hydrology:{}},{enabled:false});assert.equal(c.materials.length,0);assert.equal(c.group.children.length,0);c.dispose();});
test('actual 36m added bank communities retain wind/depth, dry blade feet and spatial patches with rendered contact',t=>{
 const world=legacyReachWorld39(),eco=new WorldEcology(world,{reachCoverPrepared:false}),cover=eco.reachBankCover39;
 try{cover.build();assert.equal(cover.stats.sedges,192);assert.equal(cover.stats.mats,261);let count=0;const bands=new Set(),distances=new Set();
  for(const pool of cover.pools){assert.equal(pool.mesh.castShadow,true);assert.equal(pool.mesh.receiveShadow,true);assert.ok(pool.geometry.boundingBox);let sum=0;
   for(const r of pool.records){count++;bands.add(Math.floor((r.offset+18)/6));const q=world.hydrology.sampleAt(r.x,r.z);assert.equal(q.insideWater,false);distances.add(Math.floor(q.shoreDistance/.1));assert.equal(reachPlantIntersectsWater40(world,r,[r.coverAsset.geometry]),false);sum+=r.coverAsset.geometry.attributes.position.count;
    assert.deepEqual(r.coverAsset.geometry.attributes.aPlantWind.array,pool.prototype.geometry.attributes.aPlantWind.array);
    for(const seat of r.coverAsset.seats){for(const p of seat.points)assert.equal(world.hydrology.sampleAt(p.x,p.z).insideWater,false);assert.ok(Math.abs(seat.level-(Math.min(...seat.points.map(p=>world.surface.heightAt(p.x,p.z)))-.002))<1e-8);}
   }assert.equal(pool.geometry.attributes.position.count,sum);
   const shaders=[pool.material,pool.depth].map((m,i)=>{const lib=i?T.ShaderLib.depth:T.ShaderLib.standard,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s,{});return s;});
   for(const s of shaders){assert.ok(s.vertexShader.includes('return aBrookRoot;'));assert.ok(s.vertexShader.includes('ecoBend(aBrookHeight'));assert.strictEqual(s.uniforms.uWindTime,eco.uniforms.uWindTime);}
  }
  assert.ok(bands.size>=5);assert.ok(distances.size>=5,'a two-dimensional patch cannot collapse to one shore-distance row');
  const contact={bind(points){let first=true;return{changed:()=>first,samples(){first=false;return points.map(p=>({height:world.surface.heightAt(p.x,p.z),spacing:.15625,morphing:false}));}};}};
  cover.update({position:new T.Vector3(-3612,2327,4805)},contact);drainContact42(cover);assert.equal(cover.stats.pending,0);for(const p of cover.pools)assert.ok(p.geometry.attributes.aBrookReady.array.every(v=>v===1));
  t.diagnostic(JSON.stringify({...cover.stats,coveredSixMetreBands:[...bands],shoreDistanceBins:[...distances],count}));
 }finally{eco.dispose();}
});

test('budgeted runtime generation preserves full source output and advertises pending until complete',()=>{
 const world=legacyReachWorld39(),eco=new WorldEcology(world,{reachCoverPrepared:false}),cover=eco.reachBankCover39,camera={position:new T.Vector3(-3612,2327,4805)},contact={bind(points){let first=true;return{changed:()=>first,samples(){first=false;return points.map(p=>({height:world.surface.heightAt(p.x,p.z),spacing:.15625,morphing:false}));}};}};
 try{cover.update(camera,contact);assert.equal(cover.stats.built,false);assert.equal(cover.stats.pending,1);let calls=1;while(!cover.stats.built&&calls++<2000)cover.update(camera,contact);assert.ok(cover.stats.built);assert.equal(cover.stats.sedges,192);assert.equal(cover.stats.mats,261);drainContact42(cover);assert.equal(cover.stats.pending,0);assert.equal(cover.group.children.length,2);cover.update({position:new T.Vector3(0,0,0)},null);drainContact42(cover);assert.equal(cover.stats.pending,0);assert.equal(cover.group.visible,false);assert.equal(cover.stats.sedges,192);cover.update(camera,contact);assert.equal(cover.group.visible,true);drainContact42(cover);assert.equal(cover.stats.pending,0);}finally{eco.dispose();}
});

test('actual two settled browser roots validate their individual seated wind envelopes, not a uniformly lowered surrogate',()=>{
 const world=legacyReachWorld39(),eco=new WorldEcology(world,{reachCoverPrepared:false}),cover=eco.reachBankCover39;
 const records=JSON.parse(readFileSync(new URL('./fixtures/reach-cover39-settled-contact.json',import.meta.url))).roots;let matched=0;
 try{cover.build();const contact={bind(points){const record=records.find(r=>Math.abs(r.firstFoot.x-points[0].x)<1e-6&&Math.abs(r.firstFoot.z-points[0].z)<1e-6);if(record)matched++;let first=true;return{changed:()=>first,samples(){first=false;return record?.samples??points.map(p=>({height:world.surface.heightAt(p.x,p.z),spacing:.15625,morphing:false}));}};}};
 cover.update({position:new T.Vector3(-3612,2327,4805)},contact);assert.equal(matched,2);drainContact42(cover);assert.equal(cover.stats.pending,0);
 for(const record of records){const root=cover.pools[0].records.find(r=>r.id===record.id);drainContact42(cover);assert.equal(root.contactReady,true);assert.equal(root.contactFailure,null);}
 }finally{eco.dispose();}
});


test('real settled sedge overhang is not a solid 12cm hull; actual water penetration is still rejected',()=>{
 const world=legacyReachWorld39(),eco=new WorldEcology(world,{reachCoverPrepared:false}),cover=eco.reachBankCover39;
 try{cover.build();const root=cover.pools[0].records.find(r=>r.id==='reach39:sedge:-10053:13324');assert.ok(root);
  assert.ok(Math.abs(root.x+3618.9898873364755)<1e-9);assert.ok(Math.abs(root.z-4796.759646235415)<1e-9);
  assert.equal(brookGrassIntersectsWater(world,root,root.coverAsset.envelope),true,'reproduces old broad-phase false positive');
  assert.equal(reachPlantIntersectsWater40(world,root,[root.coverAsset.geometry]),false,'separate real leaf surfaces clear the water');
  assert.equal(reachPlantIntersectsWater40(world,{...root,y:root.y-.02},[root.coverAsset.geometry]),true,'same real plant penetrating water by 2cm is rejected');
  assert.equal(reachPlantIntersectsWater40(world,{...root,y:root.y-1},[root.coverAsset.geometry]),true,'fully submerged real plant is rejected, not lost below a thin water skin');
  assert.equal(cover.stats.waterBroadPhaseFalsePositives,10);
  for(const seat of root.coverAsset.seats)for(const p of seat.points)assert.equal(world.hydrology.sampleAt(p.x,p.z).insideWater,false);
 }finally{eco.dispose();}
});

// Lock the bound to the actual shader used by this mode. A future wind law
// change must revisit the contact envelope, not silently reuse stale constants.
test('candidate water envelope bounds the actual mode 9 shader wind and sag',()=>{
 const source=readFileSync(new URL('./ecology.js',import.meta.url),'utf8');
 for(const part of ['mix(.68,1.25,seed)','(current-previous)*.32','(current+returning)*.23*flex','local*.012*sqrt(current)','(field.g-current)*.10','eddy*.045*weight*flex','dot(ecoOffset,ecoOffset)*.55'])assert.ok(source.includes(part),part);
 assert.ok(.23*1.25*1.32+.5*.045*1.25<.43);
 assert.ok(.10+.5*.012<.11);
 const field=readFileSync(new URL('./wind-field.js',import.meta.url),'utf8');
 assert.ok(field.includes('UnsignedByteType'),'wind channels remain normalized [0,1]');
});

function drainContact42(cover){for(let i=0;cover.stats.pending&&i<4000;i++)cover.update({position:new T.Vector3(-3612,2327,4805)});}
