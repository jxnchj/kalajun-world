import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildForestCutField38,sampleForestCutField38,cutHorizon38,installForestCutHorizon38,patchForestCutShader38,FOREST_CUT38} from './forest-cut-horizon-v38.js';
import {createTerrainMaterial} from './terrain-material.js';

test('pre-incision field never queries final height and bilinear sampling preserves a plane including boundary',async()=>{
 const fn=(x,z)=>2300+.13*x-.27*z;
 const field=await buildForestCutField38({uncarvedHeightAt:fn,heightAt(){throw Error('recursive surface');}},{spec:{x:0,z:0,span:2,spacing:.25},yieldTask:async()=>{}});
 for(const [x,z]of [[-1,-1],[1,1],[.131,.591],[-.14,-.67]])assert.ok(Math.abs(sampleForestCutField38(field,x,z)-fn(x,z))<1e-6);
 assert.throws(()=>sampleForestCutField38(field,1.01,0),/Outside/);
 await assert.rejects(()=>buildForestCutField38({heightAt:fn}),/uncarvedHeightAt/);
});
test('horizons follow cut depth, preserve all natural rock, immersed bed, uncut soil and distant scene',()=>{
 const base={depth:.05,shoreDistance:.1,clearance:.02};
 assert.equal(cutHorizon38(base).weight,1);
 assert.equal(cutHorizon38({...base,clearance:.8}).face,cutHorizon38(base).face);
 for(const change of [{naturalRock:.000001},{shoreDistance:-.02},{clearance:-.01},{depth:0},{distance:60},{forest:0}])assert.equal(cutHorizon38({...base,...change}).weight,0);
 assert.ok(cutHorizon38({...base,depth:.02}).face<cutHorizon38({...base,depth:.07}).face);
 assert.ok(cutHorizon38({...base,depth:.1}).mineral<cutHorizon38({...base,depth:.23}).mineral);
});
test('actual material compile patches color normal roughness together, defaults disabled and restores original hooks',()=>{
 const r=createTerrainMaterial(),m=r.material,compile=m.onBeforeCompile,key=m.customProgramCacheKey;
 const field={spec:FOREST_CUT38,origin:{x:-3676,z:4741.25},n:513,base:2328,data:new Float32Array(513*513),bytes:513*513*4};
 const h=installForestCutHorizon38(m,field),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 assert.equal(h.uniforms.forestCutEnabled38.value,0);assert.equal(h.cost.bytes,1052676);
 m.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('forestCutGradient38'));assert.ok(shader.fragmentShader.includes('forestCutRoughness38'));
 assert.equal((shader.fragmentShader.match(/texelFetch\(forestCutField38/g)||[]).length,4);
 // Preserve the existing real surface-height derivative AFTER material normals.
 // Otherwise candidate weight silently damps physical micro-relief too.
 const text=shader.fragmentShader,blend=text.indexOf('terrainGradient=mix(terrainGradient,forestCutGradient38,forestCutWeight38);'),derivative=text.indexOf('if(abs(terrainDet)>1e-8) terrainGradient+='),filter=text.indexOf('terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);');
 assert.ok(blend>=0&&blend<derivative&&derivative<filter);
 assert.equal((text.match(/if\(abs\(terrainDet\)>1e-8\) terrainGradient\+=/g)||[]).length,1);

 h.setEnabled(true);assert.equal(shader.uniforms.forestCutEnabled38.value,1);h.setEnabled(false);
 assert.throws(()=>h.setEnabled('true'),/Boolean/);assert.throws(()=>installForestCutHorizon38(m,field),/already/);
 h.dispose();assert.equal(m.onBeforeCompile,compile);assert.equal(m.customProgramCacheKey,key);assert.throws(()=>h.setEnabled(true),/Disposed/);
 m.dispose();Object.values(r.textures).forEach(t=>t.dispose());
});
test('shader source drift fails explicitly and never partially modifies shader',()=>{
 const shader={uniforms:{},fragmentShader:'unrelated'};assert.throws(()=>patchForestCutShader38(shader,{}),/contract changed/);assert.equal(shader.fragmentShader,'unrelated');assert.deepEqual(shader.uniforms,{});
});
