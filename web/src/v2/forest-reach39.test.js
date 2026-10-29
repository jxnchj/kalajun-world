import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {createHydrology} from './hydrology.js';import {riverSectionAt,riverCrossPoint} from './river-section.js';
import {createWaterGeometry,createWaterMaterial} from './water.js';
import {brookGrassIntersectsWater} from './brook-shoulder-grass.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const originalLocation39=globalThis.location;globalThis.location={search:'?forestReachForm41=0'};
const source=actualForestWorld(undefined,'rgba',{forestReach39:false}),candidate=actualForestWorld(undefined,'rgba',{forestReach39:true}),h=candidate.hydrology,reach=h.forestReach39,segments=h.segments.filter(reach.activeSegment);
globalThis.location=originalLocation39;
function section(offset){const distance=reach.origin+offset,s=segments.find(s=>s.a.distance<=distance&&s.b.distance>=distance);return{s,t:(distance-s.a.distance)/(s.b.distance-s.a.distance)};}
test('explicit legacy 39 keeps geographic source and old habitat query; whole-reach off removes it',()=>{assert.equal(source.hydrology.forestReach39,null);assert.deepEqual(h.segments,source.hydrology.segments);assert.deepEqual(h.lines,source.hydrology.lines);assert.equal(reach.stats.giMatched,false);
 for(const offset of [-17,-10,0,10,17]){const{s,t}=section(offset),q=riverSectionAt(s,t);for(const across of [-1.5,-.5,0,.5,1.5]){const p=riverCrossPoint(q,across);assert.deepEqual(h.reachSource.sampleAt(p.x,p.z),source.hydrology.sampleAt(p.x,p.z));}}
});
test('continuous first connected water intersection cannot manufacture the rejected outer-limit ear',()=>{let previous;for(let s=-11;s<=-8.5;s+=.125){const{ s:g,t}=section(s),q=reach.waterSectionAt(g,t);assert.ok(q.right<.51);if(previous)assert.ok(Math.abs(q.right-previous)<.002);previous=q.right;}
 for(const offset of [-18,18]){const{s,t}=section(offset);assert.deepEqual(reach.waterSectionAt(s,t),riverSectionAt(s,t));}
});
test('water physical depth and ground share one height, preserve original root supports',()=>{for(const tree of FOREST_REACH39_SOURCE.trees)assert.equal(h.bedHeightAt(tree.x,tree.z),source.surface.heightAt(tree.x,tree.z));
 for(const offset of [-16,-12,-6,0,6,12,16]){const{s,t}=section(offset),q=reach.waterSectionAt(s,t);for(const across of [-.99,-.6,-.2,0,.4,.8,.99]){const p=riverCrossPoint(q,across),height=h.bedHeightAt(p.x,p.z),sample=h.sampleAt(p.x,p.z);assert.ok(height<=q.level+1e-6);assert.ok(Math.abs(sample.depth-Math.max(0,q.level-height))<1e-7);assert.ok(Math.abs(reach.depthAt(p.x,p.z,q.level)-sample.depth)<1e-7);}}
});
test('depositional old water edge has no eight-millimetre bed discontinuity',()=>{
 for(const offset of [-13.4,-13.35,-13.3]){const{s,t}=section(offset),q=riverSectionAt(s,t),points=[-1e-6,1e-6].map(delta=>riverCrossPoint(q,-1+delta)),heights=points.map(p=>reach.heightAt(p.x,p.z));assert.ok(Math.abs(heights[0]-heights[1])<1e-5);}
});
test('near and overview candidate use identical connected mesh, interpolated depth stays bounded',()=>{const near=createWaterGeometry(segments,{detail:true,reach}),far=createWaterGeometry(segments,{reach});try{for(const name of ['position','aAcross','aReachDepth'])assert.deepEqual(near.attributes[name].array,far.attributes[name].array);assert.deepEqual(near.index.array,far.index.array);
 const pos=near.attributes.position,depth=near.attributes.aReachDepth,index=near.index;let maxError=0,worst;
 for(let j=0;j<index.count;j+=39){const ids=[index.getX(j),index.getX(j+1),index.getX(j+2)],x=ids.reduce((n,i)=>n+pos.getX(i),0)/3,z=ids.reduce((n,i)=>n+pos.getZ(i),0)/3,level=ids.reduce((n,i)=>n+pos.getY(i),0)/3-.006,pred=ids.reduce((n,i)=>n+depth.getX(i),0)/3,actual=reach.depthAt(x,z,level);if(Math.abs(actual-pred)>maxError){maxError=Math.abs(actual-pred);worst={x,z,level,pred,actual,query:((q)=>({s:q.section.distance-reach.origin,d:q.distance,half:q.half}))(reach.queryAt(x,z)),points:ids.map(i=>[pos.getX(i),pos.getZ(i),depth.getX(i),near.attributes.aAcross.getX(i),near.attributes.aRiver.getW(i)])};}}
 assert.ok(maxError<.004,'depth interpolation error metres: '+maxError+' '+JSON.stringify(worst));
 }finally{near.dispose();far.dispose();}});
test('default shader remains original; enabled material explicitly consumes physical candidate depth',()=>{for(const enabled of[false,true]){const m=createWaterMaterial({}, {reachEnabled:enabled}),shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};m.onBeforeCompile(shader);assert.equal(shader.vertexShader.includes('aReachDepth'),enabled);assert.equal(shader.fragmentShader.includes('riverDepth=max(0.,vReachDepth.x)'),enabled);m.dispose();}});

test('whole-world community retains identities scales counts; validated local moves and untouched trees' ,async(t)=>{
 const {WorldEcology,MEADOW}=await import('./ecology.js'),a=new WorldEcology(source),b=new WorldEcology(candidate);let grass=0,trees=0,moved=0;
 try{
  assert.deepEqual(candidate.entities,source.entities);assert.notDeepEqual(candidate.getForestRootInputHashes(),source.getForestRootInputHashes());assert.equal(candidate.forestReach39.giMatched,false);
  for(let iz=Math.floor(4783/MEADOW.cell);iz<=Math.ceil(4829/MEADOW.cell);iz++)for(let ix=Math.floor(-3634/MEADOW.cell);ix<=Math.ceil(-3590/MEADOW.cell);ix++){
   const p=a._grassAt(ix,iz),q=b._grassAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(!p)continue;const {y:py,x:px,z:pz,brookAsset:pa,...pr}=p,{y:qy,x:qx,z:qz,forestReachMove,brookAsset:qa,...qr}=q;assert.deepEqual(pr,qr);if(forestReachMove){moved++;assert.ok(Math.hypot(qx-px,qz-pz)<=1.600001);assert.equal(candidate.hydrology.sampleAt(qx,qz).insideWater,false);assert.ok(qa);assert.equal(brookGrassIntersectsWater(candidate,q,qa.envelope),false);for(const[k,g]of qa.geometries.entries()){const original=[b.grassGeometries[0],b.grassGeometries[1],b.baseGrassGeometry][k];assert.equal(g.attributes.position.count,original.attributes.position.count);assert.deepEqual(g.attributes.aPlantWind.array,original.attributes.aPlantWind.array);}assert.ok(Math.abs(qy-(candidate.surface.heightAt(qx,qz)-.035))<1e-8);}else{assert.equal(px,qx);assert.equal(pz,qz);assert.ok(Math.abs(qy-py-(candidate.surface.heightAt(px,pz)-source.surface.heightAt(px,pz)))<1e-8);}pa?.dispose();qa?.dispose();grass++;
  }
  for(let iz=398;iz<=403;iz++)for(let ix=-304;ix<=-298;ix++){const p=a.treeAt(ix,iz),q=b.treeAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(!p)continue;const{y:py,...pr}=p,{y:qy,...qr}=q;assert.deepEqual(pr,qr);assert.ok(Math.abs(qy-py-(candidate.surface.heightAt(p.x,p.z)-source.surface.heightAt(p.x,p.z)))<1e-8);trees++;}
  for(const [x,z]of [[0,0],[-1999,3373],[-2220,3363],[-3620,4770],[-3650,4835]])assert.equal(candidate.surface.heightAt(x,z),source.surface.heightAt(x,z));assert.ok(grass>400);assert.ok(trees>10);assert.ok(moved>=24,JSON.stringify(b.forestReachCommunity39?.stats));assert.ok(b.forestReachCommunity39.stats.bands.every(v=>v.moved>=2));assert.ok(b.forestReachCommunity39.stats.bands.reduce((n,v)=>n+v.afterWithin80cm-v.beforeWithin80cm,0)>0);assert.ok(moved<grass);t.diagnostic(JSON.stringify({sampledGrass:grass,sampledTrees:trees,sampledMoved:moved,layout:b.forestReachCommunity39.stats}));
 }finally{a.dispose();b.dispose();}
});


test('physical root shoulders are bounded asymmetric landforms with smooth release, not periodic shore strips',async()=>{
 const {reachRootShoulderLift39:lift}=await import('./forest-reach39.js');
 assert.equal(lift(-12.6,.37,1),0);assert.ok(Math.abs(lift(-12.6,.37,-1)-.055)<1e-12);
 assert.ok(Math.abs(lift(1.8,.40,-1)-.075)<1e-12);
 for(const side of [-1,1])for(let s=-18;s<=18;s+=.1){assert.equal(lift(s,0,side),0);assert.equal(lift(s,1,side),0);for(let t=0;t<=1;t+=.05)assert.ok(lift(s,t,side)>=0&&lift(s,t,side)<=.075000001);}
 for(const s of [-14.8,-10.4,-6.7,-3.5,-1,4.6,8.1,12.3])for(const side of [-1,1])assert.ok(Math.abs(lift(s-1e-5,.4,side)-lift(s+1e-5,.4,side))<1e-7);
 // The connected shoreline and physical depth are checked around each tongue,
 // including its ends; roots and upper soil remain in the existing checks.
 for(const offset of [-14.7,-12.6,-10.5,-6.6,-5.1,-3.6,-.9,1.8,4.5,8.2,10.2,12.2]){
  const {s,t}=section(offset),q=reach.waterSectionAt(s,t);
  for(let a=-.99;a<=.99;a+=.06){const p=riverCrossPoint(q,a);assert.ok(reach.heightAt(p.x,p.z)<=q.level+1e-6);}
 }
});
