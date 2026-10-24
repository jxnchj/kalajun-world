import test from 'node:test';import assert from 'node:assert/strict';
import {buildExclusionNeighborhoods} from './plant-exclusion-index.js';
import {WorldEcology} from './ecology.js';
test('expanded exclusion cells preserve exact source membership and order including negative and empty queries',()=>{
 const source=new Map([['-2,-1',[{id:1},{id:2}]],['0,0',[{id:3}]],['1,-1',[{id:4}]],['-2,0',[{id:5}]]]),index=buildExclusionNeighborhoods(source);
 for(let z=-4;z<=3;z++)for(let x=-5;x<=4;x++){
  const expected=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)expected.push(...(source.get((x+dx)+','+(z+dz))||[]));
  assert.deepEqual(index.get(x+','+z)||[],expected);
 }
});
test('indexed exact exclusion agrees at rotated pads, query-cell edges, dynamic padding, routes and wet-bank policy',()=>{
 const entities=[{x:-64,z:64,rot:.712,pad:{hx:12,hz:7,cx:2,cz:-1}},{x:0,z:-.01,rot:-.45,kind:'yurt'},{x:128,z:63.999,rot:.32}];
 const world={entities,objects:{paths:[{pts:[[-150,7],[150,21]],width:2}]},hydrology:{isExcluded:(x,z,p)=>Math.abs(x-80)<2+p},landcoverAt:()=>({r:1,g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}},eco=new WorldEcology(world);
 try{for(const pad of[0,.12,.3,2,3,12])for(const allow of[false,true])for(let iz=-30;iz<=30;iz++)for(let ix=-42;ix<=42;ix++){
  const x=ix*4-.0001,z=iz*4+.0001;eco.exclusionNeighborhoodsEnabled=false;const old=eco.excluded(x,z,pad,allow);eco.exclusionNeighborhoodsEnabled=true;assert.equal(eco.excluded(x,z,pad,allow),old,JSON.stringify({x,z,pad,allow}));
 }}finally{eco.dispose();}
});
