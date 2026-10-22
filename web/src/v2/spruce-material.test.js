import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {configureSpruceMaterial,installNeedleSurface,needleSurfaceSamplingGate} from "./spruce-material.js";
function compile(type=THREE.TangentSpaceNormalMap){
  const m=configureSpruceMaterial(new THREE.MeshStandardMaterial({normalMap:new THREE.Texture(),normalMapType:type,alphaTest:.45}));
  m.onBeforeCompile=shader=>{shader.vertexShader+="\n// previous wind/csm hook";};
  installNeedleSurface(m);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  m.onBeforeCompile(shader);
  return {m,shader,dispose(){m.normalMap.dispose();m.dispose();}};
}
test("normal relief samples with explicit gradients before its zero-contribution distance gate",()=>{
  const a=compile(),f=a.shader.fragmentShader;
  assert.ok(f.indexOf("dFdx(vNormalMapUv)")<f.indexOf("if(uNeedleSurfaceSamplingGate<.5||vPlantDistance<38.)"));
  assert.match(f,/textureGrad\( normalMap, vNormalMapUv, needleUvDx, needleUvDy \)/);
  assert.match(f,/USE_PACKED_NORMALMAP/);
  assert.match(f,/mapN.xy \*= normalScale/);
  assert.match(f,/normalize\( tbn \* mapN \)/);
  assert.match(f,/normal=normalize\(mix\(nonPerturbedNormal,normal,1.-smoothstep\(10.,38.,vPlantDistance\)\)\)/);
  assert.match(a.shader.vertexShader,/previous wind\/csm hook/);
  assert.equal(a.m.alphaTest,.45);assert.equal(a.m.transparent,false);a.dispose();
});
test("normal gate switch changes only a uniform, retaining shader key and alpha semantics",()=>{
  const a=compile(),b=compile(),key=a.m.customProgramCacheKey();
  assert.strictEqual(a.shader.uniforms.uNeedleSurfaceSamplingGate,b.shader.uniforms.uNeedleSurfaceSamplingGate);
  assert.strictEqual(a.m.userData.needleSurfaceSamplingGate,needleSurfaceSamplingGate);
  const old=needleSurfaceSamplingGate.value;
  needleSurfaceSamplingGate.value=0;
  assert.equal(a.shader.uniforms.uNeedleSurfaceSamplingGate.value,0);
  assert.equal(a.m.customProgramCacheKey(),key);
  needleSurfaceSamplingGate.value=old;a.dispose();b.dispose();
});
test("object-space maps and untextured bark retain their original normal path",()=>{
  const a=compile(THREE.ObjectSpaceNormalMap);
  assert.ok(!a.shader.fragmentShader.includes("textureGrad"));
  assert.ok(!a.shader.fragmentShader.includes("dFdx(vNormalMapUv)"));
  assert.match(a.shader.fragmentShader,/#include <normal_fragment_maps>/);
  const bark=configureSpruceMaterial(new THREE.MeshStandardMaterial());
  const hook=bark.onBeforeCompile;
  assert.strictEqual(installNeedleSurface(bark),bark);assert.strictEqual(bark.onBeforeCompile,hook);
  assert.equal(bark.alphaTest,0);bark.dispose();a.dispose();
});
