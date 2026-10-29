import {createLegacyTerrainMaterial} from './fixtures/legacy-terrain-material.js';
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {forestScanMean,forestScanProjection,forestScanSlope,forestScanVarianceGain,FOREST_SCAN_GLSL,FOREST_SCAN_SCALE} from "./terrain-forest-scan.js";
import {createTerrainMaterial,setTerrainForestContinuity} from "./terrain-material.js";
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
const compile=material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;};
const dispose=result=>{result.material.dispose();Object.values(result.textures).forEach(t=>t.dispose());};
test("scan means are linear-light pixel means, not gamma RGB or alpha-weighted colours",()=>{
  assert.deepEqual(forestScanMean(new Uint8Array([0,0,0,255,255,255,255,0])),[.5,.5,.5]);
  for(const v of forestScanMean(new Uint8Array([128,128,128,255])))close(v,.21586050011389926,1e-13);
  assert.throws(()=>forestScanMean(new Uint8Array(3)),/RGBA/);
});
test("scan projections preserve physical scale and explicit derivatives at negative and far-world coordinates",()=>{
  for(const leaf of[false,true])for(const second of[false,true])for(const period of[2,3.2]){
    const expected=(second?FOREST_SCAN_SCALE:1)/period;
    for(const unit of[[1,0],[0,1]])close(Math.hypot(...forestScanProjection(unit,period,leaf,second,true)),expected);
    for(const p of[[-1800.3,3200.7],[0,0],[40000,-40000]])for(const d of[[.03,.2],[-.1,.004]]){
      const a=forestScanProjection(p,period,leaf,second),b=forestScanProjection(p.map((v,k)=>v+d[k]),period,leaf,second);
      const derivative=forestScanProjection(d,period,leaf,second,true);
      derivative.forEach((v,k)=>close(v,b[k]-a[k]));
    }
  }
});
test("same-period translations cannot repeat both scan projections and slopes obey the texture chain rule",()=>{
  for(const leaf of[false,true])for(const period of[2,3.2]){
    // Move exactly one full authored period along the first projection's u.
    const step=leaf?[.8*period,-.6*period]:[period,0];
    const first=forestScanProjection(step,period,leaf,false,true),second=forestScanProjection(step,period,leaf,true,true);
    close(first[0],1);close(first[1],0);
    assert.ok(second.some(v=>Math.abs(v-Math.round(v))>.2),"second projection must break the old axis repeat");
    for(const secondary of[false,true]){
      const n=[.23,-.31,.922],g=forestScanSlope(n,leaf,secondary);
      // h(uv) = -normal.xy/normal.z dot uv. Its finite world derivative
      // must agree with the inverse-rotated physical normal-map slope.
      for(let axis=0;axis<2;axis++){
        const p=[.42,-.93],q=p.slice();q[axis]+=1e-5;
        const a=forestScanProjection(p,period,leaf,secondary),b=forestScanProjection(q,period,leaf,secondary);
        const derivative=b.reduce((sum,v,k)=>sum-n[k]/n[2]*(v-a[k]),0)/1e-5*period;
        close(g[axis],derivative,1e-8);
      }
    }
  }
});
test("crossfade conserves independent fine variance instead of smoothing away the scan",()=>{
  for(const blend of[.28,.5,.72]){
    let sum=0,squares=0;const gain=forestScanVarianceGain(blend);
    for(const a of[-1,1])for(const b of[-1,1]){const v=(a*(1-blend)+b*blend)*gain;sum+=v;squares+=v*v;}
    close(sum/4,0);close(squares/4,1);
  }
  assert.match(FOREST_SCAN_GLSL,/mean\+\(mix\(a,b,blend\)-mean\)\*gain/);
  assert.match(FOREST_SCAN_GLSL,/inverseTurn\*\(-nb.xy\/max\(\.35,nb.z\)\)\*1.037/);
});
test("forest continuity is one live A/B uniform and retains exact original four-sample branch",()=>{
  const result=createLegacyTerrainMaterial(),m=result.material,s=compile(m),key=m.customProgramCacheKey(),version=m.version;
  assert.equal(s.uniforms.terrainForestContinuity,m.userData.terrainForestContinuity);
  setTerrainForestContinuity(m,false);assert.equal(s.uniforms.terrainForestContinuity.value,0);
  setTerrainForestContinuity(m,true);assert.equal(s.uniforms.terrainForestContinuity.value,1);
  assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);
  assert.throws(()=>setTerrainForestContinuity(m,1),/boolean/);
  const f=s.fragmentShader;
  assert.match(f,/if\(terrainForestContinuity<\.5 && terrainForest>\.001\)/);
  assert.match(f,/terrainMeso=\.5\+\(terrainPatch-\.5\)/,"legacy Meso branch retained");
  assert.equal((f.match(/texture\(terrainScan/g)||[]).length,4);
  assert.equal((f.match(/textureGrad\(terrainScan/g)||[]).length,4,"helper's four reads invoked once per layer = eight");
  assert.equal((f.match(/terrainForestScan\([01]\./g)||[]).length,2);
  assert.match(f,/terrainReferencesReady\*terrainForestSurface\*\(1\.-smoothstep\(32\.,90\.,distance/);
  assert.match(f,/terrainForest\*\(1\.-terrainRockWeight\)\*\(1\.-terrainSnow\)\*\(1\.-terrainRiverBed\)/);
  assert.equal((f.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3,"no added fragment sampler");
  dispose(result);
});
test("all new forest reads use explicit world derivatives calculated outside material branches",()=>{
  const result=createLegacyTerrainMaterial(),f=compile(result.material).fragmentShader;
  assert.ok(f.indexOf("terrainXZDX=dFdx")<f.indexOf("if(terrainForestContinuity<.5"));
  const helper=f.slice(f.indexOf("void terrainForestScan("),f.indexOf("float terrainRockFraction("));
  assert.doesNotMatch(helper,/dFdx|dFdy|texture\(/);
  assert.match(helper,/turn\*dx\*1.037,turn\*dy\*1.037/);
  assert.match(f,/terrainSampleGrad\(3\.,terrainXZ\/2\.\+vec2\(\.17,\.43\),terrainBlend,terrainXZDX\/2\.,terrainXZDY\/2\.\)/);
  assert.match(f,/terrainMeadowFeatures=meadowCommunityFeatures\(meadowFieldAt\(terrainXZ\),vTerrainCommunity\)/,"shared grass field unchanged");
  dispose(result);
});