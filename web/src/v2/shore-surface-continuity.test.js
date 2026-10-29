import {createLegacyTerrainMaterial} from './fixtures/legacy-terrain-material.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shoreOrganicRoughness,shoreWetRoughness,shoreForestSurfaceCover,SHORE_MATERIAL_GLSL} from './shore-material.js';
import {forestScanDistanceColor} from './terrain-forest-scan.js';
import {createTerrainMaterial} from './terrain-material.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,v)=>{const x=clamp((v-a)/(b-a),0,1);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} vs ${b}`);

test('saturated exposed humus retains porous roughness while immersed film and dry endpoints remain physical',()=>{
 for(const dry of [.9,.94,.97])for(const grain of [0,.5,1]){
  for(const clearance of [-.014,0,.02,.1])for(const distance of [-.01,0,.05,.4]){
   assert.ok(shoreOrganicRoughness(dry,1,grain,clearance,distance)>=.82);
   near(shoreOrganicRoughness(dry,0,grain,clearance,distance),dry);
  }
  near(shoreOrganicRoughness(dry,1,grain,-.08,-.2),shoreWetRoughness(dry,1,grain));
  let previous=shoreOrganicRoughness(dry,1,grain,0,-.2);
  for(let d=1;d<=1000;d++){
   const next=shoreOrganicRoughness(dry,1,grain,-d*.0001,-.2);
   assert.ok(next<=previous+1e-12&&Math.abs(next-previous)<.002);previous=next;
  }
 }
});
test('organic ground retains the same scan through riverbed classification without leaking onto mineral cuts',()=>{
 assert.equal(shoreForestSurfaceCover(0,.95,0),.95,'fully classified riverbed cannot erase an existing organic horizon');
 for(const forest of [0,.3,1])for(const organic of [0,.4,.95])for(const face of [0,.3,1]){
  const coverage=shoreForestSurfaceCover(forest,organic,face);
  assert.ok(coverage>=forest&&coverage<=1);
  if(face===1||organic===0)assert.equal(coverage,forest);
  // At every distance the residual's mean remains exactly the same. Thus
  // losing resolved scan detail cannot recolour a surviving organic bank.
  for(const fade of [0,.3,.7,1]){
   const c=forestScanDistanceColor([.06,.07,.03],[.09,.08,.04],[.09,.08,.04],coverage,fade);
   const far=forestScanDistanceColor([.06,.07,.03],[.09,.08,.04],[.09,.08,.04],coverage,0);
   c.forEach((v,i)=>near(v,far[i]));
  }
 }
});
test('shipped organic GLSL agrees with CPU across wetness, clearance, distance and coverage',()=>{
 const names=['shoreWaterFilm','shoreWetRoughness','shoreOrganicRoughness','shoreForestSurfaceCover'];
 const bodies=names.map(n=>SHORE_MATERIAL_GLSL.match(new RegExp(`float ${n}\\([^]*?\\n}`))[0]
  .replace(/float (\w+)\(([^)]*)\)/,(_,n,a)=>`function ${n}(${a.replace(/float /g,'')})`).replace(/\bfloat /g,'let ')).join('\n');
 const f=new Function('smoothstep','clamp','mix','max',bodies+';return {shoreOrganicRoughness,shoreForestSurfaceCover}')(smoothstep,clamp,mix,Math.max);
 for(const w of [0,.3,.7,1])for(const h of [-.1,-.025,0,.04])for(const d of [-.2,-.06,0,.1])near(f.shoreOrganicRoughness(.94,w,.3,h,d),shoreOrganicRoughness(.94,w,.3,h,d));
 for(const f1 of [0,.2,1])for(const o of [0,.6,1])for(const face of [0,.4,1])near(f.shoreForestSurfaceCover(f1,o,face),shoreForestSurfaceCover(f1,o,face));
});
test('one live A/B restores v29 and continuity retains existing scan reads, detail and distance limits',()=>{
 const r=createLegacyTerrainMaterial(),m=r.material,s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{
  m.onBeforeCompile(s);const f=s.fragmentShader,key=m.customProgramCacheKey(),version=m.version;
  assert.strictEqual(s.uniforms.terrainOrganicContinuity,m.userData.terrainOrganicContinuity);
  m.userData.terrainOrganicContinuity.value=0;assert.equal(s.uniforms.terrainOrganicContinuity.value,0);
  assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);
  assert.equal((f.match(/textureGrad\(terrainScan/g)||[]).length,4);
  assert.match(f,/terrainReferencesReady\*terrainForestSurface\*\(1\.-smoothstep\(32\.,90\.,distance/);
  assert.match(f,/\.76\*terrainReferencesReady\*terrainForestSurface\*terrainForestMeanContinuity/);
  assert.match(f,/terrainGradient\+=terrainReferenceGradient\*terrainOrganicCover\*\(1\.-terrainOrganicFace\)\*terrainOrganicContinuity/);
  assert.ok(f.indexOf('float terrainOrganicFace=')<f.indexOf('float terrainForestSurface='));
  assert.equal((f.match(/float terrainOrganicFace=/g)||[]).length,1);
 }finally{m.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
});
