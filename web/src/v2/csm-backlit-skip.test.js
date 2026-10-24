import test from 'node:test';import assert from 'node:assert/strict';
import {MeshStandardMaterial,MeshPhysicalMaterial,ShaderLib,ShaderChunk} from 'three';
import {csmBacklitSkipEligible,installCSMBacklitSkip}from './csm-backlit-skip.js';
import {installCSMPhysicalLighting}from './csm-physical.js';
import {installCSMZeroFadeSkip}from './csm-zero-fade.js';
import {installCloseShadowOverlapShader}from './close-shadow-overlap.js';
test('eligibility is restricted to audited spruce Standard, never Physical or arbitrary room/terrain',()=>{const standard=new MeshStandardMaterial(),physical=new MeshPhysicalMaterial();assert.equal(csmBacklitSkipEligible(standard),false);standard.defines={ECO_ROOT_WIND:''};physical.defines={ECO_ROOT_WIND:''};assert.equal(csmBacklitSkipEligible(standard),true);assert.equal(csmBacklitSkipEligible(physical),false);});
test('actual Three CSM source changes only the sampling predicate; off has no hook or shader mutation',()=>{
 for(const zero of [0,1]){const s={uniforms:{},fragmentShader:ShaderLib.standard.fragmentShader};installCSMPhysicalLighting(s);installCSMZeroFadeSkip(s,{value:zero});installCloseShadowOverlapShader(s,{state:{enabled:false}});const before=s.fragmentShader;assert.equal(installCSMBacklitSkip(s,null),false);assert.equal(s.fragmentShader,before);assert.equal(installCSMBacklitSkip(s,{value:1}),true);assert.equal(installCSMBacklitSkip(s,{value:1}),false);assert.equal(s.fragmentShader.replace('uniform float uCSMBacklitSkip;\n','').replace(' && ( uCSMBacklitSkip < 0.5 || dot( geometryNormal, directLight.direction ) > 0.0 )',''),before);assert.ok(s.fragmentShader.includes('uCSMZeroFadeSkip'));}
});
test('actual Standard irradiance dependency and final perturbed normal justify zero-only skip',()=>{
 const chunk=ShaderChunk.lights_physical_pars_fragment.slice(ShaderChunk.lights_physical_pars_fragment.indexOf('void RE_Direct_Physical('));
 assert.match(chunk,/float dotNL = saturate\( dot\( geometryNormal, directLight.direction \) \);/);assert.match(chunk,/vec3 irradiance = dotNL \* directLight.color;/);assert.match(chunk,/reflectedLight.directSpecular \+= irradiance/);assert.match(chunk,/reflectedLight.directDiffuse \+= irradiance/);
 // Includes both sides of the terminator, tiny positive values (must sample),
 // all CSM fade ratios and coloured light. No epsilon widens the zero region.
 for(const dot of [-1,-.3,-1e-12,0,1e-12,.3,1])for(const shadow of [0,.01,.5,1])for(const fade of [0,.1,.9,1])for(const light of [0,.1,3.5]){
 const original=Math.max(0,dot)*light*(1-fade+fade*shadow),candidate=Math.max(0,dot)*light*(1-fade+fade*(dot>0?shadow:1));assert.equal(candidate,original);
 }
});
test('environment shares a live uniform across eligible materials without recompilation',async()=>{
 const {WorldEnvironment}=await import('./environment.js');
 const gate={value:1},env={registered:new Set(),csmBacklitSkip:gate,csm:{setupMaterial(){}},nearShadowDetail:{mode:'resolution'}};
 const a=new MeshStandardMaterial(),b=new MeshStandardMaterial(),other=new MeshStandardMaterial();a.defines={ECO_ROOT_WIND:''};b.defines={ECO_ROOT_WIND:''};
 WorldEnvironment.prototype.register.call(env,[a,b,other]);
 assert.strictEqual(a.userData.csmBacklitSkip,gate);assert.strictEqual(b.userData.csmBacklitSkip,gate);assert.equal(other.userData.csmBacklitSkip,undefined);
 const versions=[a.version,b.version],keys=[a.customProgramCacheKey(),b.customProgramCacheKey()];
 const shaders=[a,b].map(()=>{const shader={uniforms:{},fragmentShader:ShaderLib.standard.fragmentShader};installCSMPhysicalLighting(shader);installCSMBacklitSkip(shader,gate);return shader;});
 const sources=shaders.map(s=>s.fragmentShader);
 for(const value of [0,1,0,1]){env.csmBacklitSkip.value=value;for(const shader of shaders)assert.equal(shader.uniforms.uCSMBacklitSkip.value,value);assert.deepEqual([a.version,b.version],versions);assert.deepEqual([a.customProgramCacheKey(),b.customProgramCacheKey()],keys);assert.deepEqual(shaders.map(s=>s.fragmentShader),sources);}
 const off=new MeshStandardMaterial();off.defines={ECO_ROOT_WIND:''};WorldEnvironment.prototype.register.call({...env,registered:new Set(),csmBacklitSkip:null},[off]);assert.equal(off.userData.csmBacklitSkip,undefined);assert.doesNotMatch(off.customProgramCacheKey(),/backlit-skip/);
});
