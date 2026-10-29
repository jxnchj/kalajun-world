import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
import {createTerrainMaterial} from './terrain-material.js';
import {installReachFacies44,reachFaciesRecovery44} from './reach-facies44.js';
import {REACH_SURFACE41_PATCHES} from './forest-reach-surface41.js';
test('actual exterior low bank is recovered; deep channel, original deposits and distant soil remain',()=>{
 const {rows}=JSON.parse(fs.readFileSync(new URL('../../../tools/reports/reach-facies44-sections.json',import.meta.url)));
 const bad=rows.filter(p=>p.shore>0&&p.oldBed>.2&&p.organic<.2);assert.equal(bad.length,957);
 let recovered=0;for(const p of bad){const r=reachFaciesRecovery44(p.x,p.z,p.shore,p.clearance);assert.ok(r>=0&&r<=1);if(r>.5)recovered++;assert.equal(reachFaciesRecovery44(p.x,p.z,-.2,p.clearance),0);assert.equal(reachFaciesRecovery44(p.x,p.z,p.shore,-.2),0);}
 assert.ok(recovered>600,recovered);for(const p of REACH_SURFACE41_PATCHES.filter(p=>p.kind==='sand'||p.kind==='gravel'))assert.equal(reachFaciesRecovery44(p.x,p.z,.15,.03),0);
 assert.equal(reachFaciesRecovery44(0,0,.1,.03),0);
});
test('adopted complete material chain shares recovery and keeps original vertex, samplers, default OFF and disposal',()=>{
 const previousLocation=globalThis.location;let r;try{globalThis.location={search:'?reachFacies44=0'};r=createTerrainMaterial();}finally{globalThis.location=previousLocation;}const m=r.material,compile=()=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
 const before=compile(),o=installReachFacies44(m);
 try{assert.equal(o.uniform.value,0);const after=compile();assert.equal(after.vertexShader,before.vertexShader);assert.equal(after.fragmentShader.split('textureGrad(').length,before.fragmentShader.split('textureGrad(').length);for(const token of ['terrainPhysicalBed*=1.-reachRecovery44;','reachBed41*=1.-reachRecovery44;','reachRoots41=max(reachRoots41,reachRecovery44);','terrainForestGradient+terrainReferenceGradient,reachRoots41','reachTotal41*.7'])assert.ok(after.fragmentShader.includes(token),token);assert.equal(after.uniforms.uReachFacies44,o.uniform);o.setEnabled(true);assert.equal(o.uniform.value,1);o.setEnabled(false);o.dispose();assert.equal(compile().fragmentShader,before.fragmentShader);assert.throws(()=>o.setEnabled(true));}finally{o.dispose();m.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
});

test('default adopts only matching reach material and legal worker switches preserve exact fallback',()=>{
 const saved=globalThis.location;
 try{
  for(const [search,active] of [['',true],['?reachFacies44=1',true],['?reachFacies44=0',false],['?forestReachSurface41=0',false],['?forestReachForm41=0',false],['?forestReach39=0',false]]){
   globalThis.location={search};const r=createTerrainMaterial();
   try{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};r.material.onBeforeCompile(s);assert.equal(!!s.uniforms.uReachFacies44,active,search);if(active)assert.equal(s.uniforms.uReachFacies44.value,1);else assert.ok(!s.fragmentShader.includes('reachRecovery44'),search);}
   finally{r.material.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
  }
  for(const q of ['?reachFacies44=0','?reachFacies44=1','?reachFacies44=0&reachFacies44=1'])assert.equal(terrainRowWorkerPolicy(q).enabled,true,q);
  for(const q of ['?reachFacies44=','?reachFacies44=true','?reachFacies44=2','?reachFacies44=0&reachFacies44=bad'])assert.equal(terrainRowWorkerPolicy(q).enabled,false,q);
 }finally{globalThis.location=saved;}
});
