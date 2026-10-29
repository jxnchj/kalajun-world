import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {groundBiasDistance41} from './shadow-ground-cdf41.js';
import {ShadowMomentsWorld41} from './shadow-moments-world41.js';
import {csmPhysicalLighting} from './csm-physical.js';
test('ground bias follows actual normal-offset ray intersection on tilted receiver planes',()=>{
 for(const [gx,gy]of[[0,0],[.3,-.2],[-.8,.4],[1.2,-.9]])for(const b of[.008,.04]){
 const n=new T.Vector3(gx,gy,-1).normalize(),p=n.clone().multiplyScalar(b),groundAtBiasedXY=gx*p.x+gy*p.y,depthBias=.004;
 assert.ok(Math.abs(groundBiasDistance41(b,depthBias,gx,gy)-(p.z-groundAtBiasedXY+depthBias))<1e-12);
 }
});
test('CDF variant retains source wind/alpha and directly encodes four visibility thresholds, with native fallback for predictor disagreement',()=>{
 const owner=Object.create(ShadowMomentsWorld41.prototype);Object.assign(owner,{encoding:'cdf',format:'half',size:2048,uniforms:{},depthMaterials:new Map(),restores:[]});const source=new T.MeshDepthMaterial({alphaTest:.43});source.onBeforeCompile=s=>s.vertexShader+='\n// source wind';const shader={vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader,uniforms:{}};owner.depth(source).onBeforeCompile(shader,{});assert.match(shader.vertexShader,/source wind/);assert.match(shader.fragmentShader,/#include <alphatest_fragment>/);assert.match(shader.fragmentShader,/gl_FragColor=step\(thresholds41,vec4\(groundD41\)\)/);assert.doesNotMatch(shader.fragmentShader,/gl_FragColor=vec4\(momentD41/);
 const m=new T.MeshStandardMaterial();m.onBeforeCompile=s=>s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',csmPhysicalLighting);owner.terrain={materials:[m]};owner.installReceivers();const ground={uniforms:{},fragmentShader:'#include <shadowmap_pars_fragment>\n#include <lights_fragment_begin>'};m.onBeforeCompile(ground,{});assert.match(ground.fragmentShader,/if\(abs\(d\)>groundCDFWidth41\)return -1/);assert.match(ground.fragmentShader,/if\(min\(min\(v.x,v.y\),min\(v.z,v.w\)\)<0.\)return getShadow/);assert.match(ground.fragmentShader,/cascade==0\?momentNear41/);assert.match(ground.fragmentShader,/shiftedZ=z\+depthReference41\(uv\)-receiverReference/);assert.equal(source.alphaTest,.43);
});

test('CDF filtering follows a tilted receiver without erasing a genuine predictor residual',()=>{
 const width=.006,pitch=119.75629145891888/2048;
 for(const [gx,gy] of [[.8,.4],[-1.1,.6],[.3,-.7]]){
  const reference=(x,y)=>.23+(gx*x+gy*y)/64;
  const bias=groundBiasDistance41(.008,-.0039995,gx,gy)/64;
  const receiver=[.36*pitch,.81*pitch];
  for(const residual of [.0002,.012]){
   const z=reference(...receiver)+bias+residual/64;
   const offsets=[[0,0],[pitch,0],[0,pitch],[pitch,pitch]].map(([x,y])=>(z+reference(x,y)-reference(...receiver)-(reference(x,y)+bias))*64);
   offsets.forEach(d=>assert.ok(Math.abs(d-residual)<1e-12));
   assert.equal(offsets.every(d=>Math.abs(d)<=width),residual<width);
  }
 }
});
