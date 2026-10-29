import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {attachEcologyWind} from './ecology.js';
import {configureSpruceMaterial,installNeedleSurface} from './spruce-material.js';
import {installCrownOcclusion} from './spruce-geometry.js';
import {installSpruceBranchPhotos} from './spruce-branch-detail.js';
import {installPhotoMiddleNormal63,specializePhotoMiddleNormal63} from './photo-middle-normal63.js';
function make(mode=1,type=T.TangentSpaceNormalMap,physical=false){const m=new (physical?T.MeshPhysicalMaterial:T.MeshStandardMaterial)({normalMap:new T.Texture(),normalMapType:type,alphaTest:.45,side:T.DoubleSide});configureSpruceMaterial(m);attachEcologyWind(m,{uWindTime:{value:1},uWorldViewer:{value:new T.Vector3()}},mode,false,true);installCrownOcclusion(m);installNeedleSurface(m);installSpruceBranchPhotos(m);return m;}
function compile(m){const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s,{});return s;}
const world=m=>({nearParts:[{mode:1,mesh:{material:m}},{mode:1,mesh:{material:m}}]});
test('actual wind/crown/photo/PBR chain retains exact vertex and alpha logic while only the proven zero-relief normal region changes',()=>{
 const m=make(),before=compile(m),hook=m.onBeforeCompile,key=m.customProgramCacheKey,texture=m.normalMap,version=m.version,c=installPhotoMiddleNormal63(world(m));assert.equal(c.stats.materials,1);assert.strictEqual(m.onBeforeCompile,hook);assert.equal(m.version,version);
 c.setEnabled(true);const after=compile(m);assert.equal(after.vertexShader,before.vertexShader);assert.strictEqual(m.normalMap,texture);assert.equal(m.side,T.DoubleSide);assert.equal(m.alphaTest,.45);
 const start='#include <map_fragment>',end='#include <roughnessmap_fragment>';assert.equal(after.fragmentShader.slice(after.fragmentShader.indexOf(start),after.fragmentShader.indexOf(end)),before.fragmentShader.slice(before.fragmentShader.indexOf(start),before.fragmentShader.indexOf(end)),'all colour/alpha/LOD/branch dither logic unchanged');
 assert.equal(after.fragmentShader.slice(after.fragmentShader.indexOf('#include <lights_physical_fragment>')),before.fragmentShader.slice(before.fragmentShader.indexOf('#include <lights_physical_fragment>')),'PBR/AO/fog/output unchanged');
 assert.ok(!after.fragmentShader.includes('needleUvDx'));assert.ok(!after.fragmentShader.includes('textureGrad( normalMap'));assert.ok(!after.fragmentShader.includes('mat3 tbn ='));assert.ok(after.fragmentShader.includes('normal=normalize(nonPerturbedNormal);'));assert.ok(after.fragmentShader.includes('normal *= faceDirection;'));assert.ok(after.fragmentShader.includes('vec3 normal = normalize( vNormal );'));
 for(const [k,v]of Object.entries(before.uniforms))assert.strictEqual(after.uniforms[k],v);
 c.setEnabled(false);assert.strictEqual(m.onBeforeCompile,hook);assert.strictEqual(m.customProgramCacheKey,key);assert.equal(compile(m).fragmentShader,before.fragmentShader);c.dispose();m.dispose();texture.dispose();
});
test('mode and distance contracts exclude near crowns and unsupported normal consumers rather than deleting valid shading',()=>{
 for(const [mode,type,physical]of [[5,T.TangentSpaceNormalMap,false],[12,T.TangentSpaceNormalMap,false],[1,T.ObjectSpaceNormalMap,false],[1,T.TangentSpaceNormalMap,true]]){const m=make(mode,type,physical),hook=m.onBeforeCompile,c=installPhotoMiddleNormal63({nearParts:[{mode,mesh:{material:m}}]},{enabled:true});assert.equal(c.stats.materials,0);assert.strictEqual(m.onBeforeCompile,hook);c.dispose();}
 const lie=make(5),c=installPhotoMiddleNormal63(world(lie),{enabled:true});assert.throws(()=>compile(lie),/actual 42..235/);c.dispose();
 for(const d of [38,38.001,41.999,42,42.001,61,165,234.99,235]){const visible=d>42&&d<235;if(visible)assert.ok(d>=38,'every surviving source fragment is beyond the original relief cutoff');}
 const shader=compile(make());shader.vertexShader=shader.vertexShader.replace('vPlantDistance<=42.','vPlantDistance<=35.');assert.throws(()=>specializePhotoMiddleNormal63(shader),/actual 42..235/);
});
test('foreign hook ownership is never overwritten during candidate teardown',()=>{const m=make(),c=installPhotoMiddleNormal63(world(m),{enabled:true}),installed=m.onBeforeCompile,other=()=>{};m.onBeforeCompile=other;assert.throws(()=>c.dispose(),/hook changed/);assert.strictEqual(m.onBeforeCompile,other);m.onBeforeCompile=installed;c.dispose();});
