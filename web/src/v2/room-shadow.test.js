import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WorldShadowDepth, createStructureDepth, useProjectedShadowDepth } from "./room-shadow.js";
import { attachEcologyWind } from "./ecology.js";
test("perspective lamp shadows use projective depth without losing plant deformation",()=>{
  const base=new THREE.MeshDepthMaterial(),wind=attachEcologyWind(base,{},2,true);
  const key=wind.customProgramCacheKey(),depth=useProjectedShadowDepth(wind),shader={uniforms:{},
    vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
  depth.onBeforeCompile(shader,{});
  assert.match(shader.vertexShader,/ecoBend/);assert.match(shader.vertexShader,/morphtarget_vertex/);
  assert.doesNotMatch(shader.vertexShader+shader.fragmentShader,/#include <logdepthbuf_/);
  assert.match(depth.customProgramCacheKey(),new RegExp(key));
  const compiled=depth.onBeforeCompile;useProjectedShadowDepth(depth);assert.equal(depth.onBeforeCompile,compiled);
  depth.dispose();
});
test("new streamed casters receive cached depth materials, authored depths retain ownership",()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry();
  const a=new THREE.Mesh(geometry,material);a.castShadow=true;scene.add(a);
  const pass=new WorldShadowDepth(scene);pass.prepare();
  const b=new THREE.Mesh(geometry,material);b.castShadow=true;scene.add(b);pass.prepare();
  assert.equal(a.customDepthMaterial,b.customDepthMaterial);
  const authored=createStructureDepth(material),c=new THREE.Mesh(geometry,material);c.castShadow=true;c.customDepthMaterial=authored;scene.add(c);pass.prepare();
  assert.equal(c.customDepthMaterial,authored);assert.equal(pass.owned.size,1);
  let ownedDisposed=0,authoredDisposed=0;a.customDepthMaterial.addEventListener("dispose",()=>ownedDisposed++);authored.addEventListener("dispose",()=>authoredDisposed++);
  pass.dispose();assert.equal(ownedDisposed,1);assert.equal(authoredDisposed,0);
  authored.dispose();geometry.dispose();material.dispose();
});

test("projected shadow depth retains native normal and reversed depth buffer branches",()=>{
 const depth=useProjectedShadowDepth(new THREE.MeshDepthMaterial());
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
 depth.onBeforeCompile(shader,{});
 assert.match(shader.vertexShader,/#include <project_vertex>/);
 assert.match(shader.vertexShader,/vHighPrecisionZW = gl_Position.zw/);
 assert.match(shader.fragmentShader,/#ifdef USE_REVERSED_DEPTH_BUFFER/);
 assert.match(shader.fragmentShader,/float fragCoordZ = vHighPrecisionZW\[ 0 \] \/ vHighPrecisionZW\[ 1 \]/);
 assert.doesNotMatch(shader.vertexShader+shader.fragmentShader,/#include <logdepthbuf_/);
 for(const reverse of [false,true]){
   const camera=new THREE.PerspectiveCamera(120,1,.04,12);camera._reversedDepth=reverse;camera.updateProjectionMatrix();
   const near=new THREE.Vector3(0,0,-camera.near).applyMatrix4(camera.projectionMatrix).z;
   const far=new THREE.Vector3(0,0,-camera.far).applyMatrix4(camera.projectionMatrix).z;
   const unpack=v=>reverse?v:.5*v+.5;
   assert.ok(Math.abs(unpack(near)-(reverse?1:0))<1e-12);
   assert.ok(Math.abs(unpack(far)-(reverse?0:1))<1e-12);
 }
 depth.dispose();
});
