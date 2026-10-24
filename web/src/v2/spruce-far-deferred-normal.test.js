import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {attachEcologyWind} from './ecology.js';
import {installFarSpruceImpostor} from './spruce-far-impostor.js';
const metadata=JSON.parse(readFileSync(new URL('../../public/assets/v2/spruce/far-v14/impostor-manifest.json',import.meta.url)));
function compile(depth=false){
 const material=depth?new THREE.MeshDepthMaterial():new THREE.MeshStandardMaterial();attachEcologyWind(material,{},0);installFarSpruceImpostor(material,{metadata,albedo:new THREE.Texture(),normal:new THREE.Texture()});
 const lib=depth?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,{});return {material,shader};
}
test('deferred normal remains opt-in and can toggle without recompilation or alpha/material changes',()=>{
 for(const depth of [false,true]){const {material,shader}=compile(depth),u=material.userData.farImpostorUniforms.uFarDeferredNormal,key=material.customProgramCacheKey(),version=material.version;
  assert.equal(u.value,0);assert.strictEqual(shader.uniforms.uFarDeferredNormal,u);u.value=1;assert.equal(shader.uniforms.uFarDeferredNormal.value,1);u.value=0;assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);assert.equal(material.alphaToCoverage,true);assert.equal(material.alphaTest,.003);assert.equal(material.side,THREE.DoubleSide);material.dispose();
 }
});
test('deferred path cannot sample normals in the albedo phase; baseline retains original implicit samples',()=>{
 const {material,shader}=compile(),f=shader.fragmentShader,sample=f.slice(f.indexOf('void farSample('),f.indexOf('vec3 farSurvivingNormal'));
 assert.match(sample,/if\(uFarZeroWeightLayers>\.5\|\|uFarDeferredNormal>\.5\)/);
 assert.match(sample,/c=textureGrad\(uFarAlbedo,vec3\(st,layer\),dx,dy\);n=vec3\(0\.\);\s*if\(uFarDeferredNormal<\.5\)n=textureGrad\(uFarNormal,vec3\(st,layer\),dx,dy\)/);
 assert.match(sample,/else\{\s*c=texture\(uFarAlbedo,vec3\(st,layer\)\);n=texture\(uFarNormal,vec3\(st,layer\)\).xyz\*2\.-1\.;/);
 material.dispose();
});
test('all explicit gradients are established before LOD/clipping/alpha discard; surviving normal uses the same rect and domain mask',()=>{
 const {material,shader}=compile(),f=shader.fragmentShader,body=f.slice(f.indexOf('void main()'));
 assert.match(body,/^void main\(\)\s*\{\s*farPlaneDx=dFdx\(vFarPlane\);farPlaneDy=dFdy\(vFarPlane\);/);
 const normal=f.slice(f.indexOf('vec3 farSurvivingNormal'),f.indexOf('vec3 farSurvivingNormal')+500);
 assert.match(normal,/st=\(vFarPlane-rect.xy\)\/\(rect.zw-rect.xy\)/);assert.match(normal,/dx=farPlaneDx\/\(rect.zw-rect.xy\),dy=farPlaneDy\/\(rect.zw-rect.xy\)/);
 assert.match(normal,/textureGrad\(uFarNormal,vec3\(st,layer\),dx,dy\).xyz\*2\.-1\./);assert.match(normal,/step\(0\.,st.x\)\*step\(st.x,1\.\)\*step\(0\.,st.y\)\*step\(st.y,1\.\)/);assert.match(normal,/return n\*inside/);
 material.dispose();
});
test('normal reads follow unchanged alpha and non-MSAA stochastic coverage, preserving strict zero-weight and full four-layer blends',()=>{
 for(const depth of [false,true]){const {material,shader}=compile(depth),f=shader.fragmentShader,body=f.slice(f.indexOf('void main()'));
 const coverage='if(diffuseColor.a<.003)discard;\nif(uFarMultisample<.5){float farAlphaNoise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))+ .381966));if(diffuseColor.a<farAlphaNoise)discard;diffuseColor.a=1.;}';
 const at=body.indexOf(coverage),defer=body.indexOf('if(uFarDeferredNormal>.5){');assert.ok(at>0);
 if(depth){assert.equal(defer,-1,'depth output has no normal consumer');assert.equal((body.match(/farSurvivingNormal\(/g)||[]).length,0);material.dispose();continue;}
 assert.ok(defer>at+coverage.length);assert.equal((body.slice(0,defer).match(/farSurvivingNormal\(/g)||[]).length,0);
 assert.ok(body.indexOf('if(uPlantMode<.5)')<defer,'normal reads also follow existing ecological LOD discard');
 const stage=body.slice(defer,body.indexOf('farNormal.y-=',defer));
 assert.equal((stage.match(/farSurvivingNormal\(/g)||[]).length,8,'two lower, two upper, four interior reads');
 assert.match(stage,/vFarSelection.w<=0\./);assert.match(stage,/vFarSelection.w>=1\./);
 assert.match(stage,/farNormal=mix\(mix\(farN0,farN1,vFarSelection.z\),mix\(farN2,farN3,vFarSelection.z\),vFarSelection.w\)/);
 assert.doesNotMatch(stage,/discard|smoothstep|epsilon/);material.dispose();
 }
});
