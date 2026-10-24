import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {createTerrainMaterial} from './terrain-material.js';import {installMeadowDistanceCanopy} from './meadow-distance-canopy.js';
const compile=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
test('isolated canopy candidate defaults off, preserves all vertex and source sampling, and restores exact original hook',()=>{
 const r=createTerrainMaterial(),m=r.material,original=compile(m),hook=m.onBeforeCompile,key=m.customProgramCacheKey;
 const state=installMeadowDistanceCanopy(m),s=compile(m);assert.equal(state.uniform.value,0);assert.equal(s.uniforms.uMeadowDistanceCanopy,state.uniform);assert.equal(s.vertexShader,original.vertexShader);
 for(const token of ['textureGrad(meadowSurfaceField','terrainGrassColor*=meadowLandformTint','meadowCanopyColor(terrainMeadowFeatures)','terrainSwardResolved=meadowCanopyResolved(terrainFootprint)','terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);'])assert.equal(s.fragmentShader.split(token).length,original.fragmentShader.split(token).length);
 for(const text of ['if(uMeadowDistanceCanopy>.5 && abs(terrainDet)>1e-8)','meadowRawSlope-meadowOldSlope*meadowLegacyFade','(1.-terrainRiverBed)*(1.-terrainBank)*(1.-terrainSoilWeight)'])assert.ok(s.fragmentShader.includes(text));
 state.setEnabled(true);assert.equal(state.uniform.value,1);state.setEnabled(false);assert.equal(state.uniform.value,0);assert.throws(()=>state.setEnabled(1),/boolean/);
 state.dispose();assert.equal(m.onBeforeCompile,hook);assert.equal(m.customProgramCacheKey,key);assert.equal(compile(m).fragmentShader,original.fragmentShader);m.dispose();for(const t of Object.values(r.textures))t.dispose();
});
test('unsupported material cannot silently claim the candidate is installed',()=>{const m=new T.MeshStandardMaterial();installMeadowDistanceCanopy(m);assert.throws(()=>compile(m),/anchor missing/);m.dispose();});
