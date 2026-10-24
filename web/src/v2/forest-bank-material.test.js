import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrainMaterial} from './terrain-material.js';
function compile(result){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};result.material.onBeforeCompile(shader);return shader;}
test('two local bank candidates default on and independently switch existing shader uniforms without replacing textures or rebuilding material',()=>{
 const a=createTerrainMaterial(),b=createTerrainMaterial();try{
  const shader=compile(a),u=a.material.userData,version=a.material.version,pixels=a.textures.packed.image.data;
  for(const key of ['forestSediment38','forestRootSurface38']){assert.equal(u[key].value,1);assert.equal(shader.uniforms[key],u[key]);u[key].value=0;}
  u.forestSediment38.value=1;assert.equal(shader.uniforms.forestSediment38.value,1);assert.equal(shader.uniforms.forestRootSurface38.value,0);
  u.forestRootSurface38.value=1;u.forestSediment38.value=0;assert.equal(shader.uniforms.forestRootSurface38.value,1);assert.equal(shader.uniforms.forestSediment38.value,0);
  u.forestRootSurface38.value=0;assert.equal(a.material.version,version);assert.equal(a.textures.packed.image.data,pixels);assert.equal(pixels,b.textures.packed.image.data);
  assert.equal(b.material.userData.forestSediment38.value,1);assert.equal(b.material.userData.forestRootSurface38.value,1);
 }finally{for(const x of [a,b]){x.material.dispose();Object.values(x.textures).forEach(t=>t.dispose());}}
});
test('compiled sediment replacement removes only river-added rock and uses the same weight for existing soil albedo normal and roughness',()=>{
 const x=createTerrainMaterial();try{const s=compile(x).fragmentShader;
  assert.ok(s.includes('forestNaturalRock38=terrainRockFraction(terrainBare,terrainSlope,vTerrainWorldPosition.y)*(1.-terrainSnow)*(1.-terrainOrganicCover)'));
  assert.ok(s.includes('forestSediment38*forestBankMaterialReach38*max(0.,terrainRockWeight-forestNaturalRock38)/max(.000001,terrainRockWeight)'));
  assert.ok(s.includes('terrainRockColor=mix(terrainRockColor,terrainSoilColor,forestSedimentWeight38)'));
  assert.ok(s.includes('mix(terrainRockGradient * 0.72,terrainSoilGradient,forestSedimentWeight38)'));
  assert.ok(s.includes('mix(.87,.96,forestSedimentWeight38)'));
  assert.ok(s.includes('smoothstep(36.,60.,length(terrainXZ-vec2(-3611.9813305250705,4805.371282289286)))'));
  assert.ok(s.includes('mix(terrainShoreLiving,terrainForestColor,forestRootSurfaceWeight38),terrainRootCover'));
  assert.ok(s.includes('mix(terrainGrassGradient,terrainForestGradient+terrainReferenceGradient,forestRootSurfaceWeight38),terrainRootCover'));
  assert.ok(s.includes('mix(terrainCanopyRoughness,forestRootRoughness38,forestRootSurfaceWeight38),terrainRootCover'));
 }finally{x.material.dispose();Object.values(x.textures).forEach(t=>t.dispose());}
});
