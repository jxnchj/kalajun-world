import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createTerrainMaterial} from './terrain-material.js';
import {ROOT_FACE50 as p,rootFace50Weight} from './reach-root-face50.js';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
const shader=()=>({uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader});
test('exposed face uses source soil in an along/up chart, default has no candidate shader or sampler',()=>{
 const old=globalThis.location,all=[];
 try{
  for(const search of ['', '?reachBankDesign50=0','?reachBankDesign50=root-pool']){
   globalThis.location={search};const m=createTerrainMaterial();all.push(m);
   const s=shader();m.material.onBeforeCompile(s);m.compiled=s;
  }
  assert.equal(all[0].compiled.fragmentShader,all[1].compiled.fragmentShader);
  assert.equal(all[0].material.customProgramCacheKey(),all[1].material.customProgramCacheKey());
  assert.ok(!all[0].compiled.fragmentShader.includes('rootFaceWeight50'));
  assert.equal(all[2].compiled.vertexShader,all[0].compiled.vertexShader);
  assert.deepEqual(Object.keys(all[2].compiled.uniforms),Object.keys(all[0].compiled.uniforms));
  const f=all[2].compiled.fragmentShader;
  for(const needle of ['rootFaceWeight50','vTerrainWorldPosition.y-2327.25','reachFaceDX50=dFdx','terrainSampleGrad(1.,reachFaceUV50','terrainGradient=mix(terrainGradient,reachFaceGradient50,reachFace50)','roughnessFactor=mix(roughnessFactor,.92+.06*reachFaceSoil50.a,reachFace50)'])assert.ok(f.includes(needle),needle);
  assert.ok(f.indexOf('reachFaceDX50=dFdx')<f.indexOf('if(reachFace50>0.)'));
  assert.equal(all[2].material.userData.reachRootFace50,true);
 }finally{globalThis.location=old;for(const m of all){m.material.dispose();for(const tex of Object.values(m.textures))tex.dispose();}}
});
test('horizontal cap, bed, opposite-facing slope and outside lobe remain original',()=>{
 const v={x:p.x,z:p.z,clearance:.1,nx:p.fz*.6,nz:-p.fx*.6};
 assert.ok(rootFace50Weight(v)>.5);
 assert.equal(rootFace50Weight({...v,nx:0,nz:0}),0);
 assert.equal(rootFace50Weight({...v,clearance:.25}),0);
 assert.equal(rootFace50Weight({...v,clearance:-.01}),0);
 assert.equal(rootFace50Weight({...v,nx:-v.nx,nz:-v.nz}),0);
 assert.equal(rootFace50Weight({...v,x:v.x+p.fx*2.1,z:v.z+p.fz*2.1}),0);
 assert.equal(rootFace50Weight({...v,snow:1}),0);
});
test('real source side-slope has finite nonzero coverage with top and outside unchanged',t=>{
 const old=globalThis.location;let w;try{globalThis.location={search:'?reachBankDesign50=root-pool'};w=actualForestWorld(undefined,'rgba');}finally{globalThis.location=old;}
 let covered=0,max=0,cap=0;
 for(let along=-2;along<=2;along+=.05)for(let across=-.5;across<=1;across+=.025){
  const x=p.x+p.fx*along-p.fz*across,z=p.z+p.fz*along+p.fx*across;
  const q=w.hydrology.sampleAt(x,z),height=w.surface.heightAt(x,z),n=w.surface.normalAt(x,z,.025);
  const weight=rootFace50Weight({x,z,clearance:height-q.surfaceLevel,nx:n.x,nz:n.z});
  assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=1);
  if(weight>0){covered++;max=Math.max(max,weight);}
  if(n.y>.999)cap=Math.max(cap,weight);
 }
 assert.ok(covered>20,'actual exposed samples '+covered);assert.ok(max>.5);assert.equal(cap,0);
 t.diagnostic(JSON.stringify({covered,max,horizontalCapMax:cap}));
});
