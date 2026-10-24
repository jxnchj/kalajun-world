import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TreePhotoPrepass,photoDepthMaterial} from './tree-photo-prepass.js';
import {attachEcologyWind} from './ecology.js';
import {installSpruceBranchPhotos} from './spruce-branch-detail.js';
function shader(){return {uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};}
function fixture(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),group=new THREE.Group(),nearGroup=new THREE.Group();scene.add(group);group.add(nearGroup);
 const material=new THREE.MeshStandardMaterial({map:new THREE.Texture(),alphaTest:.45,side:THREE.DoubleSide});
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),material,3);mesh.count=3;mesh.castShadow=true;nearGroup.add(mesh);
 const ecology={group,nearGroup,nearTreeBatches:new Map([['a',{mesh,mode:5}]]),treeBatchRevision:1};
 return {scene,camera,mesh,material,ecology,p:new TreePhotoPrepass(scene,ecology,camera)};
}
test('exact original vertex, wind uniform identity, alpha/branch/LOD rejection before PBR cutoff',()=>{
 for(const alphaToCoverage of [false,true]){
  const source=new THREE.MeshStandardMaterial({alphaTest:.45,alphaToCoverage,side:THREE.DoubleSide}),uniforms={uWindTime:{value:7}};
  source.defines={...source.defines,ECO_ROOT_WIND:"",USE_CSM:1,CSM_CASCADES:3};
  attachEcologyWind(source,uniforms,5,false,true);installSpruceBranchPhotos(source);
  const original=shader();source.onBeforeCompile(original,{});
  const depth=photoDepthMaterial(source),candidate=shader();depth.onBeforeCompile(candidate,{});
  assert.deepEqual(depth.defines,source.defines);assert.notStrictEqual(depth.defines,source.defines);
  assert.equal(candidate.vertexShader,original.vertexShader);assert.equal(candidate.uniforms.uWindTime,uniforms.uWindTime);
  const end=original.fragmentShader.indexOf('#include <alphahash_fragment>')+'#include <alphahash_fragment>'.length;
  assert.equal(candidate.fragmentShader.slice(0,end),original.fragmentShader.slice(0,end));
  assert.match(candidate.fragmentShader,/branchDither/);assert.match(candidate.fragmentShader,/n<needleTree/);
  assert.doesNotMatch(candidate.fragmentShader,/#include <lights_fragment_begin>/);assert.match(candidate.fragmentShader,/gl_FragColor=vec4\(0.,0.,0.,diffuseColor.a\)/);
  assert.equal(depth.alphaToCoverage,alphaToCoverage);assert.equal(depth.alphaTest,source.alphaTest);assert.equal(depth.side,source.side);assert.equal(depth.colorWrite,false);
 }
});
test('CSM public shader registry restored on successful and failing compile',()=>{
 const source=new THREE.MeshStandardMaterial({alphaTest:.45}),prior={},registry=new Map([[source,prior]]);
 source.onBeforeCompile=s=>registry.set(source,s);const depth=photoDepthMaterial(source,registry);depth.onBeforeCompile(shader(),{});assert.equal(registry.get(source),prior);
 source.onBeforeCompile=s=>{registry.set(source,s);throw Error('compile');};assert.throws(()=>photoDepthMaterial(source,registry).onBeforeCompile(shader(),{}),/compile/);assert.equal(registry.get(source),prior);
});
test('default off, same-camera scope, no geometry/matrix allocation or source mutations during pass',()=>{
 const f=fixture();f.p.run(f.camera,()=>assert.equal(f.p.group.visible,false));assert.equal(f.p.entries.size,0);
 f.p.enabled=true;f.p.run({},()=>assert.equal(f.p.group.visible,false));
 f.p.run(f.camera,()=>{const proxy=[...f.p.entries.values()][0].proxy;assert.equal(f.p.group.visible,true);assert.equal(proxy.geometry,f.mesh.geometry);assert.equal(proxy.instanceMatrix,f.mesh.instanceMatrix);assert.equal(proxy.count,3);assert.equal(proxy.castShadow,false);assert.equal(f.mesh.castShadow,true);assert.equal(f.mesh.material,f.material);assert.equal(f.p.group.renderOrder,-Number.MAX_VALUE);});
 assert.equal(f.p.group.visible,false);f.p.run(f.camera,()=>{});assert.equal(f.p.stats.syncs,1);
});
test('render/compile failure hides all proxies, later ordinary render recovers',()=>{
 const f=fixture();f.p.enabled=true;assert.throws(()=>f.p.run(f.camera,()=>{throw Error('draw');}),/draw/);assert.equal(f.p.group.visible,false);assert.equal(f.p.stats.active,false);
 f.p.enabled=false;assert.equal(f.p.run(f.camera,()=>123),123);assert.equal(f.mesh.count,3);
});
test('stream deletion/disposal never disposes original instance buffer, geometry, material',()=>{
 const f=fixture();f.p.enabled=true;f.p.run(f.camera,()=>{});const proxy=[...f.p.entries.values()][0].proxy,original=f.mesh.instanceMatrix;
 let detached=false;proxy.addEventListener('dispose',()=>{detached=proxy.instanceMatrix!==original;});
 f.ecology.nearTreeBatches.clear();f.ecology.treeBatchRevision++;f.p.run(f.camera,()=>{});
 assert.equal(detached,true);assert.equal(f.p.entries.size,0);assert.equal(f.mesh.instanceMatrix,original);
 f.p.dispose();assert.equal(f.p.group.parent,null);assert.throws(()=>f.p.run(f.camera,()=>{}),/disposed/);
});
test('unsupported experimental geometry providers fail explicitly and preserve visibility',()=>{
 const f=fixture();f.p.enabled=true;f.ecology.treeViewCull={value:1};assert.throws(()=>f.p.run(f.camera,()=>{}),/incompatible/);assert.equal(f.p.group.visible,false);
});
test('coverage unsupported material states are rejected',()=>{
 for(const options of [{transparent:true},{depthWrite:false},{depthTest:false},{depthFunc:THREE.AlwaysDepth},{alphaTest:0}])assert.throws(()=>photoDepthMaterial(new THREE.MeshStandardMaterial({alphaTest:.45,...options})),/requires/);
});

test('candidate invariant is installed in both vertex programs and removed exactly on disable/dispose',()=>{
 const f=fixture(),source=f.material,originalCompile=source.onBeforeCompile,originalKey=source.customProgramCacheKey;
 const registry=new Map([[source,{originalShader:true}]]),originalShader=registry.get(source);f.p.getShaderRegistry=()=>registry;
 assert.equal(source.onBeforeCompile,originalCompile);f.p.enabled=true;
 f.p.run(f.camera,()=>{
  const original=shader(),proxy=shader();source.onBeforeCompile(original,{});
  [...f.p.entries.values()][0].proxy.material.onBeforeCompile(proxy,{});
  assert.match(original.vertexShader,/^invariant gl_Position;/);assert.equal(proxy.vertexShader,original.vertexShader);
 });
 registry.set(source,{candidateShader:true});f.p.enabled=false;
 assert.equal(source.onBeforeCompile,originalCompile);assert.equal(source.customProgramCacheKey,originalKey);assert.equal(registry.get(source),originalShader);
 const off=shader();source.onBeforeCompile(off,{});assert.doesNotMatch(off.vertexShader,/invariant gl_Position/);
 f.p.enabled=true;f.p.run(f.camera,()=>{});f.p.dispose();assert.equal(source.onBeforeCompile,originalCompile);assert.equal(source.customProgramCacheKey,originalKey);
});
