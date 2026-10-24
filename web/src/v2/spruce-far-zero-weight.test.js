import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {attachEcologyWind} from './ecology.js';
import {installFarSpruceImpostor,selectFarSpruceFrames} from './spruce-far-impostor.js';
const metadata=JSON.parse(readFileSync(new URL('../../public/assets/v2/spruce/far-v14/impostor-manifest.json',import.meta.url)));
const assets={metadata,albedo:new THREE.Texture(),normal:new THREE.Texture()};
function compile(depth=false){
 const m=depth?new THREE.MeshDepthMaterial():new THREE.MeshStandardMaterial();attachEcologyWind(m,{},0);installFarSpruceImpostor(m,assets);
 const lib=depth?THREE.ShaderLib.depth:THREE.ShaderLib.standard,s={vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader,uniforms:{}};m.onBeforeCompile(s,{});return {m,s};
}
test('zero-weight candidate is runtime-switchable and opt-in; geometry/coverage/azimuth contract remains unchanged',()=>{
 for(const depth of [false,true]){
  const {m,s}=compile(depth),u=m.userData.farImpostorUniforms.uFarZeroWeightLayers,key=m.customProgramCacheKey(),version=m.version;
  assert.equal(u.value,0);assert.strictEqual(s.uniforms.uFarZeroWeightLayers,u);u.value=1;assert.equal(s.uniforms.uFarZeroWeightLayers.value,1);u.value=0;
  assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);assert.equal(m.alphaToCoverage,true);assert.equal(m.alphaTest,.003);
  assert.match(s.vertexShader,/vFarSelection=vec4\(farY0,farE0,farYaw-farY0,farElevation-farE0\)/);
  assert.match(s.fragmentShader,/farColour=mix\(farC0,farC1,vFarSelection.z\)/);assert.match(s.fragmentShader,/farColour=mix\(farC2,farC3,vFarSelection.z\)/);
  assert.match(s.fragmentShader,/diffuseColor.a\*=farColour.a/);assert.match(s.fragmentShader,/if\(uFarMultisample<.5\)/);if(!depth)assert.match(s.fragmentShader,/farNormal.y-=dot\(vFarBendSlope,farNormal.xz\)/);
  m.dispose();
 }
});
test('endpoint branches sample exactly two layer pairs; every interior weight retains original four pairs',()=>{
 const {m,s}=compile(),f=s.fragmentShader;
 const lower=f.indexOf('if(uFarZeroWeightLayers>.5 && vFarSelection.w<=0.)'),upper=f.indexOf('}else if(uFarZeroWeightLayers>.5 && vFarSelection.w>=1.)'),full=f.indexOf('}else{',upper),end=f.indexOf('diffuseColor.rgb*=farColour',full);
 assert.ok(lower>0&&upper>lower&&full>upper&&end>full);
 const calls=x=>(x.match(/farSample\(/g)||[]).length;
 assert.equal(calls(f.slice(lower,upper)),2);assert.equal(calls(f.slice(upper,full)),2);assert.equal(calls(f.slice(full,end)),4);
 assert.match(f.slice(full,end),/mix\(mix\(farC0,farC1,vFarSelection.z\),mix\(farC2,farC3,vFarSelection.z\),vFarSelection.w\)/);
 assert.doesNotMatch(f.slice(lower,end),/0\.0*1|epsilon|smoothstep/);m.dispose();
});
test('plane derivatives execute before all fragment branches/discards; each sampled frame scales both gradients by its rect',()=>{
 for(const depth of [false,true]){
  const {m,s}=compile(depth),f=s.fragmentShader,main=f.indexOf('void main()'),body=f.slice(main);
  assert.match(body,/^void main\(\)\s*\{\s*farPlaneDx=dFdx\(vFarPlane\);farPlaneDy=dFdy\(vFarPlane\);/);
  assert.equal((f.match(/dFdx\(vFarPlane\)/g)||[]).length,1);assert.equal((f.match(/dFdy\(vFarPlane\)/g)||[]).length,1);
  assert.match(f,/vec2 dx=farPlaneDx\/\(rect.zw-rect.xy\),dy=farPlaneDy\/\(rect.zw-rect.xy\)/);
  for(const texture of ['uFarAlbedo','uFarNormal']){
   assert.ok(f.includes('textureGrad('+texture+',vec3(st,layer),dx,dy)'));
   assert.ok(f.includes('texture('+texture+',vec3(st,layer))'),'off path preserves implicit sampling');
  }
  // The normal alpha domain mask must still run after either sampling path.
  assert.ok(f.indexOf('float inside=')>f.indexOf('textureGrad(uFarNormal'));m.dispose();
 }
});
test('actual frame-selection boundary weights preserve all forms and azimuths, without thresholding near-zero contributions',()=>{
 const mix=(a,b,t)=>a*(1-t)+b*t;
 for(let form=0;form<5;form++)for(let az=0;az<8;az++)for(const elevation of [-30,0,1e-8,22.5-1e-8,22.5,22.5+1e-8,45-1e-8,45,70]){
  const a=(az+.37)*Math.PI/4,e=elevation*Math.PI/180,x=Math.sin(a)*Math.cos(e),y=Math.sin(e),z=Math.cos(a)*Math.cos(e),s=selectFarSpruceFrames(form,x,y,z),raw=Math.max(0,Math.min(2,Math.atan2(y,Math.hypot(x,z))*180/Math.PI/22.5)),w=raw-Math.min(1,Math.floor(raw)),yaw=s.weights[1]+s.weights[3];
  const pair=w<=0?[0,1]:w>=1?[2,3]:[0,1,2,3];
  if(elevation<=0)assert.deepEqual(pair,[0,1]);else if(elevation>45)assert.deepEqual(pair,[2,3]);else if(elevation!==22.5&&elevation!==45)assert.equal(pair.length,4);
  // Both premultiplied colour/coverage and signed normal channels are linear
  // before reconstruction. Any discarded layer has mathematically zero weight.
  for(const values of [[.11,.72,.93,.04],[-.8,.5,.2,-.3],[1,0,.2,.7]]){
   const original=mix(mix(values[0],values[1],yaw),mix(values[2],values[3],yaw),w),candidate=pair.length===4?original:mix(values[pair[0]],values[pair[1]],yaw);
   assert.ok(Math.abs(original-candidate)<1e-12);for(let j=0;j<4;j++)if(!pair.includes(j))assert.equal(s.weights[j],0);
  }
 }
});
