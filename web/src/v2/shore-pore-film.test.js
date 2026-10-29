import {createLegacyTerrainMaterial} from './fixtures/legacy-terrain-material.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shorePorousRoughness,shoreWetRoughness,SHORE_MATERIAL_GLSL} from './shore-material.js';
import {createTerrainMaterial} from './terrain-material.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
test('saturated exposed mineral soil retains pore roughness without changing dry and submerged endpoints',()=>{
 for(const dry of [.8,.87,.96,1])for(const grain of [0,.3,.7,1])for(const wet of [0,.2,.6,1]){
  for(const h of [-.4,-.06,-.02,0,.1])for(const d of [-1,-.12,-.03,0,.4]){
   const v=shorePorousRoughness(dry,wet,grain,h,d),old=shoreWetRoughness(dry,wet,grain);
   assert.ok(v>=shoreWetRoughness(dry,1,grain)-1e-15&&v<=dry);
   if(wet===0||h<=-.06&&d<=-.12)assert.ok(Math.abs(v-old)<1e-15);
   if(h>=0||d>=-.015)assert.ok(v>=dry*.91);
  }
 }
 assert.ok(shorePorousRoughness(.9,1,.5,-.00359,.07767)>.83);
 assert.ok(shoreWetRoughness(.9,1,.5)<.59);
});
test('actual GLSL and CPU match across waterline and pixel/LOD-independent coordinates',()=>{
 const body=SHORE_MATERIAL_GLSL.match(/float shorePorousRoughness\([^]*?\n}/)[0]
  .replace(/float shorePorousRoughness\(([^)]*)\)/,(_,a)=>`function shorePorousRoughness(${a.replace(/float /g,'')})`).replace(/\bfloat /g,'let ');
 const fn=new Function('smoothstep','clamp','mix','max','shoreWetRoughness',body+';return shorePorousRoughness;')(smoothstep,clamp,mix,Math.max,shoreWetRoughness);
 for(const dry of [.8,.91,1])for(const grain of [0,.5,1])for(const wet of [0,.3,1])for(const h of [-.3,-.06,-.04,-.01,0,.2])for(const d of [-.5,-.1,-.03,0,.2])assert.equal(fn(dry,wet,grain,h,d),shorePorousRoughness(dry,wet,grain,h,d));
 assert.doesNotMatch(body,/camera|texture|noise|fwidth|dFdx|dFdy|distance\(/);
 for(const d of [-.12,-.03,0,.2]){let last=shorePorousRoughness(.9,1,.5,-.1,d);for(let i=-99;i<=100;i++){
  const next=shorePorousRoughness(.9,1,.5,i*.001,d);assert.ok(Math.abs(next-last)<.01);last=next;
 }}
});
test('live v31 comparison changes soil film only, with original density, colour, roots and water unchanged',()=>{
 const r=createLegacyTerrainMaterial(),m=r.material,s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{m.onBeforeCompile(s);const key=m.customProgramCacheKey(),version=m.version,u=m.userData.terrainPoreFilm;
  assert.strictEqual(u,s.uniforms.terrainPoreFilm);assert.equal(u.value,1);u.value=0;assert.equal(s.uniforms.terrainPoreFilm.value,0);
  assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);
  assert.match(s.fragmentShader,/shorePorousRoughness\(roughnessFactor,terrainWetness,terrainShoreGrain,vTerrainHydrology.w,vTerrainShoreDistance\),terrainPoreFilm/);
  assert.equal((s.fragmentShader.match(/textureGrad\(terrainScan/g)||[]).length,4);
  // The new response is confined to roughness; no albedo, alpha or normal mask
  // is changed, and the accepted root/organic endpoint overrides still follow.
  const call=s.fragmentShader.indexOf('float terrainSoilWetResponse='),root=s.fragmentShader.indexOf('roughnessFactor=mix(roughnessFactor,terrainCanopyRoughness,terrainRootCover)');
  assert.ok(call<root);assert.equal((s.fragmentShader.match(/terrainPoreFilm/g)||[]).length,2);
 }finally{m.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
});
