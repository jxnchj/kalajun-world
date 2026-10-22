import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createTerrainMaterial,setTerrainRockSamplingOptimization} from "./terrain-material.js";
const compile=material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;};
const dispose=world=>{world.material.dispose();Object.values(world.textures).forEach(t=>t.dispose());};
test("rock A/B switches a live uniform without recompilation or texture/material mutation",()=>{
 const world=createTerrainMaterial(),m=world.material,shader=compile(m),uniform=shader.uniforms.terrainSkipZeroRockSamples;
 const key=m.customProgramCacheKey(),version=m.version,texture=shader.uniforms.terrainPackedFields.value;
 assert.strictEqual(uniform,m.userData.terrainSkipZeroRockSamples);assert.equal(uniform.value,1);
 setTerrainRockSamplingOptimization(m,false);assert.equal(uniform.value,0);
 setTerrainRockSamplingOptimization(m,true);assert.equal(uniform.value,1);
 assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);
 assert.strictEqual(shader.uniforms.terrainPackedFields.value,texture);
 assert.equal(texture.anisotropy,8);assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);
 assert.throws(()=>setTerrainRockSamplingOptimization(m,.001),/boolean/);
 assert.throws(()=>setTerrainRockSamplingOptimization(new THREE.MeshStandardMaterial(),true),/no terrain/);
 dispose(world);
});
test("only exactly zero rock weight skips all six samples; every blend boundary remains complete",()=>{
 const world=createTerrainMaterial(),s=compile(world.material).fragmentShader;
 const guard="if(terrainSkipZeroRockSamples<.5 || terrainRockWeight!=0.)";
 const start=s.indexOf(guard),end=s.indexOf("\n}",start),body=s.slice(start,end);
 assert.ok(start>s.indexOf("float terrainRockWeight ="));
 assert.equal((body.match(/terrainSampleGrad\(2\./g)||[]).length,3);
 assert.equal((s.match(/textureGrad\(terrainPackedFields/g)||[]).length,2);
 assert.match(s,/vec4 terrainRockX=vec4\(0\.\),terrainRockY=vec4\(0\.\),terrainRockZ=vec4\(0\.\);/);
 assert.doesNotMatch(body,/discard|return|terrainRockWeight\s*=|[<>]=?\s*0\.00/);
 assert.ok(s.indexOf("terrainRockDX=dFdx")<start,"quad derivatives must be calculated outside divergent control");
 assert.ok(s.indexOf("terrainRockDY=dFdy")<start);
 assert.doesNotMatch(body,/dFdx|dFdy|texture\(/,"guard has no implicit-derivative texture operations");
 for(const plane of ["yz","xz","xy"])assert.ok(body.includes("terrainRockDX."+plane+",terrainRockDY."+plane));
 // Zero is algebraically neutral for both the rock colour and tangent gradient.
 // Tiny positive weights cannot be folded into a guessed epsilon.
 for(const w of [0,Number.MIN_VALUE,1e-12,1e-6,.003,.5,1]){
   const skip=w===0;
   const sample=[.31,.7,-.2,.8],neutral=[0,0,0,0],base=[.2,.4,.1,.6];
   const normal=base.map((v,i)=>v*(1-w)+sample[i]*w);
   const optimized=base.map((v,i)=>v*(1-w)+(skip?neutral:sample)[i]*w);
   assert.deepEqual(optimized,normal);
   if(w>0)assert.equal(skip,false);
 }
 dispose(world);
});
test("explicit rock gradients retain both rotated projections and normal-gradient decoding",()=>{
 const world=createTerrainMaterial(),s=compile(world.material).fragmentShader;
 const start=s.indexOf("vec4 terrainSampleGrad("),body=s.slice(start,s.indexOf("\n}\n",start)+3);
 assert.match(body,/vec3\(p \+ vec2\(0.137, 0.619\),layer\),dx,dy/);
 assert.match(body,/rotation\*dx\*1.371,rotation\*dy\*1.371/);
 assert.match(body,/b.gb = inverseRotation \* \(b.gb \* 2.0 - 1.0\) \* 1.371/);
 assert.match(body,/return mix\(a, b, blend\)/);
 // Linear UV transforms commute with finite derivatives, including oblique,
 // anisotropic and negative-world samples. Offsets never enter the footprint.
 const rotate=([x,y])=>[.8*x-.6*y,.6*x+.8*y],uv=p=>rotate(p).map((v,i)=>v*1.371+[.735,.284][i]);
 for(const p of [[-902.4,1201.6],[0,0],[12000,-5000]])for(const d of [[.0003,.02],[4,.1],[-.03,.07]]){
   const exact=rotate(d).map(v=>v*1.371),a=uv(p),b=uv(p.map((v,i)=>v+d[i]));
   exact.forEach((v,i)=>assert.ok(Math.abs(v-(b[i]-a[i]))<1e-8));
 }
 dispose(world);
});
