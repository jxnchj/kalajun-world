import test from 'node:test';import assert from 'node:assert/strict';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {createTerrainRowKernel} from './terrain-row-kernel.js';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
import {reachSurface41Enabled} from './forest-reach-surface41.js';
import {FOREST_ROOT_SOURCE_PATHS} from '../../forest-root-binding.js';
test('adopted default and worker without location construct identical actual reach rows; rollback remains isolated',async()=>{
 const saved=globalThis.location;let a,b;try{
 globalThis.location={search:'?view=river-forest&time=870&debug=1'};const main=actualForestWorld();assert.ok(main.forestReach39);assert.equal(main.forestReach39.form41,true);assert.equal(reachSurface41Enabled(),true);
 delete globalThis.location;const worker=actualForestWorld();assert.deepEqual(await main.getForestRootInputHashes(),await worker.getForestRootInputHashes());a=createTerrainRowKernel(main);b=createTerrainRowKernel(worker);
 for(const [x,z,size]of [[-3615,4799,5],[-3619,4808,5],[-3632,4780,20],[-3620,4818,20],[0,0,20]]){
 const input={x,z,size,depth:11,parent:null},left=a.build(input),right=b.build(input);for(const key of Object.keys(left)){if(ArrayBuffer.isView(left[key]))assert.deepEqual(new Uint8Array(left[key].buffer),new Uint8Array(right[key].buffer),key);else assert.deepEqual(left[key],right[key],key);}}
 globalThis.location={search:'?forestReach39=0'};assert.equal(actualForestWorld().hydrology.forestReach39,null);assert.equal(reachSurface41Enabled(),false);
 globalThis.location={search:'?forestReachForm41=0'};assert.equal(actualForestWorld().forestReach39.form41,false);assert.equal(reachSurface41Enabled(),false);
 assert.equal(terrainRowWorkerPolicy('').enabled,true);for(const s of ['?forestReach39=0','?forestReachForm41=0','?forestReach39=1','?forestReachBankProfile41=legacy'])assert.equal(terrainRowWorkerPolicy(s).enabled,false,s);
 for(const name of ['forest-reach39.js','forest-reach39-source.js','forest-reach-form41.js','forest-reach-form41-legacy.js'])assert.ok(FOREST_ROOT_SOURCE_PATHS.includes('src/v2/'+name));
 }finally{a?.dispose();b?.dispose();globalThis.location=saved;}
});

test('auto adoption binds only compatible real source; explicit mismatches stay errors',()=>{
 const saved=globalThis.location;try{delete globalThis.location;
 for(const riverMeanders of [false,'v19']){const w=actualForestWorld(riverMeanders);assert.equal(w.hydrology.forestReach39,null);assert.equal(w.forestReach39,undefined);assert.throws(()=>actualForestWorld(riverMeanders,'rgba',{forestReach39:true}),/ForestReach39 source geometry mismatch/);}
 assert.equal(actualForestWorld(undefined,'rgba',{demInterpolation:'monotone'}).hydrology.forestReach39,null);
 globalThis.location={search:'?forestReach39=1'};assert.throws(()=>actualForestWorld(false),/ForestReach39 source geometry mismatch/);
 }finally{globalThis.location=saved;}
});

test('adopted shallow bar uses actual depth and retains the 8mm insideWater contract',()=>{
 const w=actualForestWorld(),points=[[-3623.280225665044,4818.322678475853],[-3618.7089359038046,4812.8669437101335]];
 for(const [x,z]of points){const q=w.hydrology.sampleAt(x,z),depth=q.waterLevel-w.surface.heightAt(x,z);assert.ok(q.shoreDistance<0);assert.ok(depth>0&&depth<.008);assert.ok(Math.abs(q.depth-depth)<1e-9);assert.equal(q.insideWater,false);}
});
