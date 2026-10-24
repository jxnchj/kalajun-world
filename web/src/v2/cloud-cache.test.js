import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CloudShadowCache, CLOUD_CACHE, cloudCacheOrigin } from "./cloud-cache.js";
import { createCloudUniforms, installCloudShadows } from "./cloud-field.js";
function fixture(supported=true,array=false){
 const calls=[],r={autoClear:false,target:{existing:true},extensions:{has:()=>supported},getRenderTarget(){return this.target;},getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>1,setRenderTarget(t,f,l){this.target=t;this.face=f;this.level=l;},render(scene){calls.push({target:this.target,layer:this.face,time:scene.children[0].material.uniforms.uCloudTime.value});}};
 const original=r.target,u=createCloudUniforms({array}),c=new CloudShadowCache(r,u),camera={position:new THREE.Vector3(0,2200,0)};
 return {r,u,c,camera,calls,original};
}
test("cloud cache reuses adjacent time slices and restores renderer state without rebaking each frame",()=>{
 const f=fixture();f.c.update(f.camera);assert.equal(f.calls.length,2);assert.equal(f.r.target,f.original);assert.equal(f.r.autoClear,false);assert.equal(f.r.face,2);assert.equal(f.r.level,1);
 const first=f.u.uCloudCacheB.value;f.u.uCloudTime.value=.25;f.c.update(f.camera);assert.equal(f.calls.length,2);assert.equal(f.u.uCloudCacheBlend.value,.5);
 f.u.uCloudTime.value=.51;f.c.update(f.camera);assert.equal(f.calls.length,3);assert.equal(f.u.uCloudCacheA.value,first);assert.equal(f.calls[2].time,1);
 f.u.uCloudTime.value=5;f.c.update(f.camera);assert.equal(f.calls.length,5,"jump regenerates both time endpoints");
 f.u.uCloudCoverage.value=.6;f.c.update(f.camera);assert.equal(f.calls.length,7);
 let disposed=0;f.c.targets.forEach(t=>t.addEventListener("dispose",()=>disposed++));f.c.dispose();assert.equal(disposed,2);assert.equal(f.u.uCloudCacheReady.value,0);
});
test("cache projection follows the sun in physical cloud-plane coordinates, including negative and low-sun worlds",()=>{
 for(const sun of [new THREE.Vector3(0,1,0),new THREE.Vector3(.8,.1,-.5),new THREE.Vector3(-.8,-.01,.5)])
 for(const position of [new THREE.Vector3(-3610,2329,4780),new THREE.Vector3(40900,5000,-40900)]){
  const o=cloudCacheOrigin(position,sun),t=Math.max(4400-position.y,0)/Math.max(sun.y,.008);
  const x=position.x+sun.x*t,z=position.z+sun.z*t;
  for(const [v,origin]of [[x,o[0]],[z,o[1]]])assert.ok(v-origin>=CLOUD_CACHE.span/2&&v-origin<CLOUD_CACHE.span/2+CLOUD_CACHE.step);
 }
 const f=fixture();f.c.update(f.camera);f.camera.position.x+=CLOUD_CACHE.step;f.c.update(f.camera);assert.equal(f.calls.length,4);assert.equal(f.c.stats.rebases,2);f.c.dispose();
});
test("unsupported float rendering retains analytic cloud shadows; supported shader keeps exact field outside and blends cache edges",()=>{
 const f=fixture(false);f.c.update(f.camera);assert.equal(f.calls.length,0);assert.equal(f.u.uCloudCacheReady.value,0);f.c.dispose();
 const s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 installCloudShadows(s,createCloudUniforms());assert.match(s.fragmentShader,/edge<=0.\)return cloudDepthAt\(p\)/);assert.match(s.fragmentShader,/mix\(cloudDepthAt\(p\),d,smoothstep/);
 assert.match(s.fragmentShader,/float depth=cachedCloudDepthAt\(sampleXZ\)/);assert.match(s.fragmentShader,/directionalLight.color \* cloudDirectAttenuation/);
});

// Reference the analytic cloud field independently of the cache scheduler.
// Quantize stored values to the actual R16F representation before interpolation.
test("spatial/temporal cache preserves sampled cloud-shadow transmission across the whole world",()=>{
 const frac=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
 function gradient(x,y){
  let a=frac(x*.1031),b=frac(y*.1030),c=frac(x*.0973);
  const d=a*(b+33.33)+b*(c+33.33)+c*(a+33.33);a+=d;b+=d;c+=d;
  return [frac((a+b)*c)*2-1,frac((a+c)*b)*2-1];
 }
 function noise(x,y){
  const i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j,u=a*a*a*(a*(a*6-15)+10),v=b*b*b*(b*(b*6-15)+10);
  const at=(dx,dy)=>{const g=gradient(i+dx,j+dy);return g[0]*(a-dx)+g[1]*(b-dy);};
  return mix(mix(at(0,0),at(1,0),u),mix(at(0,1),at(1,1),u),v)*1.6;
 }
 function field(x,z,t){
  const u=x*.000001+t*.0000012,v=z*.000001+t*.00000045;
  let a=u*1000,b=v*1000,f=0,k=1;
  for(let i=0;i<4;i++){f+=k*noise(a,b);k*=.5;a=a*2+t*.0003;b=b*2+t*.0003;}
  const n=THREE.MathUtils.clamp(f*.7+.5,0,1),region=noise(u*300,v*300)*.37+.5;
  return Math.max(0,n-(1-THREE.MathUtils.clamp(.48+(region-.5)*.6,0,1)));
 }
 const step=CLOUD_CACHE.span/CLOUD_CACHE.size;
 function sampled(x,z,t){
  const i=Math.floor(x/step-.5),j=Math.floor(z/step-.5),a=x/step-.5-i,b=z/step-.5-j;
  const at=(dx,dy)=>THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(field((i+dx+.5)*step,(j+dy+.5)*step,t)));
  return mix(mix(at(0,0),at(1,0),a),mix(at(0,1),at(1,1),a),b);
 }
 let max=0,sum=0,seed=1;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<10000;i++){
  const x=(random()-.5)*80000,z=(random()-.5)*80000,t=random()*2000,e=Math.floor(t/CLOUD_CACHE.cadence)*CLOUD_CACHE.cadence;
  const cached=mix(sampled(x,z,e),sampled(x,z,e+CLOUD_CACHE.cadence),(t-e)/CLOUD_CACHE.cadence);
  const error=Math.abs(Math.exp(-7.2*cached)-Math.exp(-7.2*field(x,z,t)));max=Math.max(max,error);sum+=error;
 }
 assert.ok(max<.018,"maximum transmission error "+max);
 assert.ok(sum/10000<.0003,"mean transmission error "+sum/10000);
 console.log(JSON.stringify({cloudSamples:10000,maxTransmissionError:max,meanTransmissionError:sum/10000}));
});


test("array cache retains two R16F endpoints, rolls layers and matches the legacy bake schedule",()=>{
 const a=fixture(true,true),b=fixture(true,false);
 assert.equal(a.c.targets.length,1);assert.equal(a.c.targets[0].depth,2);assert.equal(a.c.targets[0].texture.type,THREE.HalfFloatType);assert.equal(a.c.targets[0].texture.format,THREE.RedFormat);
 assert.equal(a.c.targets[0].texture.minFilter,THREE.LinearFilter);assert.equal(a.c.stats.attachmentBytes,b.c.stats.attachmentBytes);
 const stored=new Map();let consumed=0;
 for(const time of [0,.25,.51,1.01,5,.1]){
  for(const f of [a,b]){f.u.uCloudTime.value=time;f.c.update(f.camera);}
  for(const call of a.calls.slice(consumed))stored.set(call.layer,call.time);consumed=a.calls.length;
  const epoch=Math.floor(time/.5)*.5;
  assert.equal(stored.get(a.u.uCloudCacheLayers.value.x),epoch);assert.equal(stored.get(a.u.uCloudCacheLayers.value.y),epoch+.5);
  assert.deepEqual(a.calls.map(c=>c.time),b.calls.map(c=>c.time));assert.equal(a.r.target,a.original);assert.equal(a.r.face,2);assert.equal(a.r.level,1);assert.equal(a.r.autoClear,false);
 }
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};installCloudShadows(shader,a.u);
 assert.match(shader.fragmentShader,/uniform highp sampler2DArray uCloudCacheArray/);assert.doesNotMatch(shader.fragmentShader,/sampler2D uCloudCache[AB]/);
 assert.equal((shader.fragmentShader.match(/texture\(uCloudCacheArray/g)||[]).length,2);
 let disposed=0;a.c.targets[0].addEventListener('dispose',()=>disposed++);a.c.dispose();assert.equal(disposed,1);b.c.dispose();
});
test("failed cloud bake restores caller layer and retries both endpoints without publishing mixed epochs",()=>{
 const f=fixture(true,true);f.c.update(f.camera);const render=f.r.render;f.u.uCloudTime.value=2;
 let n=0;f.r.render=function(...args){if(++n===2)throw Error('bake');return render.apply(this,args);};
 assert.throws(()=>f.c.update(f.camera),/bake/);assert.equal(f.r.target,f.original);assert.equal(f.r.face,2);assert.equal(f.r.level,1);assert.equal(f.r.autoClear,false);assert.equal(f.u.uCloudCacheReady.value,0);
 f.r.render=render;const before=f.calls.length;f.c.update(f.camera);assert.equal(f.calls.length-before,2);assert.equal(f.u.uCloudCacheReady.value,1);f.c.dispose();
});
