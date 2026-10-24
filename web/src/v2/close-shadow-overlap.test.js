import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CSM} from 'three/addons/csm/CSM.js';import {CSMShader} from 'three/addons/csm/CSMShader.js';
import {createNearShadowDetail,configureNearShadowDetail} from './near-shadow-detail.js';
import {configureCSMDepth} from './depth-mode.js';
import {installCloseShadowOverlap,csmFadeEdge,csmFadeMargin,installCloseShadowOverlapShader} from './close-shadow-overlap.js';
import {csmReceiverDepthRanges} from './sun-shadow-receivers.js';
function make(reversed=false){const camera=new T.PerspectiveCamera(52,1.6,.25,150000);camera._reversedDepth=reversed;camera.updateProjectionMatrix();camera.position.set(-3612,2329,4805);camera.rotation.set(-.1,.5,0);camera.updateMatrixWorld();const d=createNearShadowDetail({maxTextures:16,maxTextureSize:8192,sharedOrmSampler:true},'close'),scene=new T.Scene(),csm=new CSM({camera,parent:scene,cascades:d.cascades,maxFar:500,mode:'custom',customSplitsCallback:d.customSplitsCallback,shadowMapSize:d.shadowMapSize,lightDirection:new T.Vector3(-.3,-.9,.2).normalize(),lightNear:1,lightFar:8000,lightMargin:2000});csm.fade=true;configureCSMDepth(csm,camera);configureNearShadowDetail(csm,d);return {csm,camera,scene};}
function weight(csm,i,depth){const span=Math.min(csm.maxFar,csm.camera.far)-csm.camera.near,x=csmFadeEdge(csm,i?csm.breaks[i-1]:0),y=csmFadeEdge(csm,csm.breaks[i]),z=depth/span,edge=z<(x+y)*.5?(i?csm.breaks[i-1]:0):csm.breaks[i],m=csmFadeMargin(csm,edge),lo=x-m*.5,hi=y+m*.5;if(z<lo||z>=hi)return 0;return m?Math.max(0,Math.min(1,Math.min(z-lo,hi-z)/m)):1;}
test('one-metre overlap preserves first map pitch and complete weights over the actual shader/camera depth convention',()=>{
 for(const reversed of[false,true]){const {csm,camera}=make(reversed),before=csm.lights.map(l=>l.shadow.camera.projectionMatrix.clone()),h=installCloseShadowOverlap(csm,{enabled:true});try{
  assert.deepEqual(csm.lights[0].shadow.camera.projectionMatrix.elements,before[0].elements,'near texel precision unchanged');
  assert.deepEqual(csm.lights[2].shadow.camera.projectionMatrix.elements,before[2].elements);assert.deepEqual(csm.lights[3].shadow.camera.projectionMatrix.elements,before[3].elements);
  const ranges=csmReceiverDepthRanges(camera,csm),edge=csm.breaks[0]*(500-camera.near);assert.ok(Math.abs(ranges[0][1]-edge)<1e-12);assert.ok(Math.abs(ranges[1][0]-(edge-1))<1e-12);
  for(let n=0;n<=200;n++){const depth=edge-1.5+n*.01,a=weight(csm,0,depth),b=weight(csm,1,depth);assert.ok(Math.abs(a+b-1)<1e-12);if(a)assert.ok(depth>=ranges[0][0]&&depth<=ranges[0][1]);if(b)assert.ok(depth>=ranges[1][0]&&depth<=ranges[1][1]);}
  assert.ok(Math.abs(-csm.frustums[1].vertices.near[0].z-ranges[1][0])<1e-10);
 }finally{h.dispose();assert.deepEqual(csm.lights[0].shadow.camera.projectionMatrix.elements,before[0].elements);csm.dispose();}}
});
test('actual CSM projected maps enclose all transition-frustum corners after snap, camera movement, resize and both depth conventions',()=>{
 for(const reversed of[false,true]){const {csm,camera,scene}=make(reversed),h=installCloseShadowOverlap(csm,{enabled:true});try{
 for(const sun of[[.3,-.9,.2],[-.8,-.2,.5],[.4,-.6,-.7]])for(const aspect of[.7,1.6,2.4]){
  camera.aspect=aspect;camera.position.x+=.013;camera.rotation.y+=.19;camera.updateMatrixWorld();csm.lightDirection.set(...sun).normalize();csm.updateFrustums();csm.update();scene.updateMatrixWorld();
  const ranges=csmReceiverDepthRanges(camera,csm);
  for(const i of[0,1]){const light=csm.lights[i];light.shadow.updateMatrices(light);const mat=new T.Matrix4().multiplyMatrices(light.shadow.camera.projectionMatrix,light.shadow.camera.matrixWorldInverse),near=-csm.mainFrustum.vertices.near[0].z,far=-csm.mainFrustum.vertices.far[0].z;
   for(const depth of[ranges[1][0]+1e-8,ranges[0][1]-1e-8])for(let k=0;k<4;k++){
    const v=new T.Vector3().lerpVectors(csm.mainFrustum.vertices.near[k],csm.mainFrustum.vertices.far[k],(depth-near)/(far-near)).applyMatrix4(camera.matrixWorld).applyMatrix4(mat);
    assert.ok(Math.abs(v.x)<=1.00001&&Math.abs(v.y)<=1.00001,JSON.stringify({i,sun,aspect,v:v.toArray()}));
   }
  }
 }
 }finally{h.dispose();csm.dispose();}}
});
test('shader and diagnostics use the same edge remap without changing PCF, caster wind or map samples',()=>{
 const {csm}=make(),h=installCloseShadowOverlap(csm,{enabled:true}),debug={value:0},shader={uniforms:{},fragmentShader:CSMShader.lights_fragment_begin+'\n#include <dithering_fragment>'};
 installCloseShadowOverlapShader(shader,h,debug);assert.equal(shader.uniforms.uCloseShadowOverlap,h.state.uniform);assert.equal(shader.uniforms.uWorldCascadeDebug,debug);assert.match(shader.fragmentShader,/cascade=vec2\(closeCSMEdge/);assert.match(shader.fragmentShader,/margin = closeCSMMargin/);assert.match(shader.fragmentShader,/weightSum/);assert.equal((shader.fragmentShader.match(/getShadow\(/g)||[]).length,(CSMShader.lights_fragment_begin.match(/getShadow\(/g)||[]).length);h.dispose();csm.dispose();
});

test('optional overlap absent leaves existing environment shader fixtures byte-for-byte unchanged',()=>{const shader={uniforms:{},fragmentShader:CSMShader.lights_fragment_begin};const before=shader.fragmentShader;installCloseShadowOverlapShader(shader,undefined);assert.equal(shader.fragmentShader,before);assert.deepEqual(shader.uniforms,{});});
