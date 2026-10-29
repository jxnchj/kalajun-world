import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import {createNearShadowDetail,configureNearShadowDetail,NEAR_SHADOW_SAMPLERS} from './near-shadow-detail.js';
import {configureCSMDepth} from './depth-mode.js';
const make=(detail,reversed=false)=>{
 const camera=new THREE.PerspectiveCamera(52,1453/839,.25,150000);camera._reversedDepth=reversed;camera.updateProjectionMatrix();camera.position.set(-3611.9813,2329.1612,4805.3713);camera.rotation.set(-.1,.5,0);camera.updateMatrixWorld();
 const csm=new CSM({camera,parent:new THREE.Scene(),cascades:detail.cascades,maxFar:500,mode:'custom',customSplitsCallback:detail.customSplitsCallback,shadowMapSize:detail.shadowMapSize,lightDirection:new THREE.Vector3(-.3,-.9,.2).normalize(),lightNear:1,lightFar:8000,lightMargin:2000});
 csm.fade=true;configureCSMDepth(csm,camera);return csm;
};
test('four-cascade choice respects actual fragment sampler capacity and texture-size fallback',()=>{
 const a=createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true});assert.equal(a.mode,'resolution');assert.equal(a.fragmentSamplers,16);assert.deepEqual(a.splits,[60,180,500]);assert.deepEqual(a.mapSizes,[4096,2048,2048]);
 const b=createNearShadowDetail({maxTextures:32,maxTextureSize:8192,cloudArraySampler:true});assert.equal(b.mode,'cascade');assert.equal(b.fragmentSamplers,17);assert.deepEqual(b.splits,[20,60,180,500]);assert.deepEqual(b.mapSizes,[2048,2048,2048,2048]);
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:2048},'cascade').mode,'legacy');
 assert.match(createNearShadowDetail({maxTextures:16,maxTextureSize:4096,cloudArraySampler:true},'cascade').reason,/17 fragment/);
 assert.equal(createNearShadowDetail({maxTextures:32,maxTextureSize:8192,cloudArraySampler:true},'legacy').extraShadowPixels,0);
 assert.equal(a.extraDepthBytesLowerBound,48*1024*1024);assert.equal(b.extraDepthBytesLowerBound,16*1024*1024);
 assert.throws(()=>createNearShadowDetail({},'guess'),/Unknown/);
});
test('sampler bound counts actual pastoral material maps separately and retains all room/light features',()=>{
 for(const name of ['house_a','yurt']){
  const bytes=readFileSync(new URL('../../public/assets/v2/'+name+'_lived.glb',import.meta.url)),j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  let max=0;for(const m of j.materials){const p=m.pbrMetallicRoughness||{};const count=Number(!!p.baseColorTexture)+2*Number(!!p.metallicRoughnessTexture)+['normalTexture','occlusionTexture','emissiveTexture'].reduce((n,k)=>n+Number(!!m[k]),0);max=Math.max(max,count);}
  assert.equal(max,NEAR_SHADOW_SAMPLERS.surface);
 }
 assert.equal(NEAR_SHADOW_SAMPLERS.withoutCSM,13);
 const room=readFileSync(new URL('./room-bounce-field.js',import.meta.url),'utf8')+readFileSync(new URL('./room-contact.js',import.meta.url),'utf8');assert.equal((room.match(/uniform (?:highp )?sampler[23]D /g)||[]).length,2);
 const cloud=readFileSync(new URL('./cloud-field.js',import.meta.url),'utf8');assert.equal((cloud.match(/uniform sampler2D uCloudCache/g)||[]).length,2);
});
test('adding a near cascade keeps every old far cutoff and at least its original shadow precision',()=>{
 const old=make(createNearShadowDetail({},'legacy')),d=createNearShadowDetail({maxTextures:32,maxTextureSize:8192,cloudArraySampler:true}),next=make(d);configureNearShadowDetail(next,d);
 try{
  for(let i=0;i<3;i++){const before=old.lights[i].shadow,after=next.lights[i+1].shadow;assert.ok(after.camera.right-after.camera.left<=before.camera.right-before.camera.left+1e-9);assert.equal(after.mapSize.x,2048);assert.equal(after.radius,2);assert.equal(after.normalBias,.04);}
  assert.ok((next.lights[0].shadow.camera.right-next.lights[0].shadow.camera.left)/(old.lights[0].shadow.camera.right-old.lights[0].shadow.camera.left)<.34);
  assert.equal(next.lights[0].shadow.normalBias,.008);assert.equal(next.lights[0].shadow.radius,.5);
 }finally{old.dispose();next.dispose();}
});
test('mixed map resolutions snap near light exactly like native 4096 CSM and leave all far light poses unchanged',()=>{
 for(const reversed of [false,true]){
  const legacy=make(createNearShadowDetail({},'legacy'),reversed),detail=createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true}),mixed=make(detail,reversed),fine=make(detail,reversed);
  fine.shadowMapSize=4096;const restore=configureNearShadowDetail(mixed,detail,{reversedDepth:reversed});
  try{for(let frame=0;frame<50;frame++){
   for(const c of [legacy,mixed,fine]){c.camera.position.x+=.0073;c.camera.position.z+=.0119;c.camera.updateMatrixWorld();c.update();}
   assert.deepEqual(mixed.lights[0].position.toArray(),fine.lights[0].position.toArray());assert.deepEqual(mixed.lights[0].target.position.toArray(),fine.lights[0].target.position.toArray());
   for(let i=1;i<3;i++){assert.deepEqual(mixed.lights[i].position.toArray(),legacy.lights[i].position.toArray());assert.deepEqual(mixed.lights[i].target.position.toArray(),legacy.lights[i].target.position.toArray());}
   assert.equal(Math.sign(mixed.lights[0].shadow.bias),reversed?1:-1);assert.equal(Math.abs(mixed.lights[0].shadow.bias),.0000005);
  }const wrapped=mixed.update;restore();assert.notStrictEqual(mixed.update,wrapped);}finally{legacy.dispose();mixed.dispose();fine.dispose();}
 }
});


test('legacy receiver-bias comparison changes only the offset direction, preserving every map and geometric offset',()=>{
 for(const reversed of [false,true]){
  const detail=createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true}),corrected=make(detail,reversed),legacy=make(detail,reversed);
  const restores=[configureNearShadowDetail(corrected,detail,{reversedDepth:reversed}),configureNearShadowDetail(legacy,detail,{reversedDepth:reversed,receiverBias:'legacy'})];
  try {for(let i=0;i<detail.cascades;i++){
   const a=corrected.lights[i].shadow,b=legacy.lights[i].shadow;
   assert.equal(a.bias,-b.bias);assert.equal(a.normalBias,b.normalBias);assert.equal(a.radius,b.radius);
   assert.deepEqual(a.mapSize.toArray(),b.mapSize.toArray());assert.deepEqual(a.camera.projectionMatrix.elements,b.camera.projectionMatrix.elements);
  }}finally{for(const restore of restores)restore();corrected.dispose();legacy.dispose();}
 }
});

test('opt-in close cascade improves grass pitch while preserving every original map precision',()=>{
 const d=createNearShadowDetail({maxTextures:17,maxTextureSize:8192,sharedOrmSampler:true,cloudArraySampler:true},'close');
 assert.equal(d.mode,'close');assert.equal(d.fragmentSamplers,17);assert.deepEqual(d.splits,[8,60,180,500]);assert.deepEqual(d.mapSizes,[4096,4096,2048,2048]);
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true},'close').mode,'resolution');
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:8192,sharedOrmSampler:true,cloudArraySampler:true}).mode,'resolution');
 const old=make(createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true})),next=make(d);
 const restores=[configureNearShadowDetail(old,createNearShadowDetail({maxTextures:16,maxTextureSize:8192,cloudArraySampler:true})),configureNearShadowDetail(next,d)];
 try{
  for(let i=0;i<3;i++){
   const a=old.lights[i].shadow,b=next.lights[i+1].shadow;
   assert.equal(b.mapSize.x,a.mapSize.x);assert.equal(b.normalBias,a.normalBias);assert.equal(b.radius,a.radius);
   assert.ok((b.camera.right-b.camera.left)/b.mapSize.x<=(a.camera.right-a.camera.left)/a.mapSize.x+1e-9);
  }
  const pitch=s=>(s.camera.right-s.camera.left)/s.mapSize.x;
  assert.ok(pitch(next.lights[0].shadow)<pitch(old.lights[0].shadow)/7);
 }finally{restores.forEach(f=>f());old.dispose();next.dispose();}
});

test('five-cascade micro is strictly opt-in and gated by both verified sampler savings',()=>{
 const caps={maxTextures:18,maxTextureSize:8192,sharedOrmSampler:true,cloudArraySampler:true};
 assert.equal(createNearShadowDetail(caps).mode,'cascade');
 assert.equal(createNearShadowDetail({...caps,maxTextures:16},'micro').mode,'resolution');
 const d=createNearShadowDetail(caps,'micro');assert.equal(d.mode,'micro');assert.equal(d.fragmentSamplers,18);assert.deepEqual(d.splits,[4,8,60,180,500]);assert.deepEqual(d.mapSizes,[4096,4096,4096,2048,2048]);
 for(const missing of ['sharedOrmSampler','cloudArraySampler']){const f=createNearShadowDetail({...caps,[missing]:false},'micro');assert.equal(f.mode,'resolution');assert.match(f.reason,/verified shared ORM and cloud array/);}
 assert.equal(createNearShadowDetail({...caps,maxTextures:17},'micro').mode,'resolution');assert.equal(createNearShadowDetail({...caps,maxTextureSize:2048},'micro').mode,'legacy');
 // Compare the review-only 8192 first close map against all five new maps.
 const largePixels=8192**2+4096**2+2*2048**2;assert.equal((largePixels-d.shadowPixels)*4,128*1024**2);assert.equal((largePixels-d.shadowPixels)*8,256*1024**2);
});
test('micro tightens first projection and preserves every close-mode 8m-and-farther map precision',()=>{
 const caps={maxTextures:18,maxTextureSize:8192,sharedOrmSampler:true,cloudArraySampler:true},close=createNearShadowDetail(caps,'close'),micro=createNearShadowDetail(caps,'micro');
 for(const reversed of [false,true]){const a=make(close,reversed),b=make(micro,reversed),restoreA=configureNearShadowDetail(a,close,{reversedDepth:reversed}),restoreB=configureNearShadowDetail(b,micro,{reversedDepth:reversed});
 try{const pitch=s=>(s.camera.right-s.camera.left)/s.mapSize.x;assert.ok(pitch(b.lights[0].shadow)<pitch(a.lights[0].shadow)*.51);
 for(let i=0;i<4;i++){const old=a.lights[i].shadow,next=b.lights[i+1].shadow;assert.equal(next.mapSize.x,old.mapSize.x);assert.ok(pitch(next)<=pitch(old)+1e-9);assert.equal(next.normalBias,old.normalBias);assert.equal(next.radius,old.radius);assert.equal(next.bias,old.bias);}
 const native=make(micro,reversed);native.shadowMapSize=4096;try{for(let frame=0;frame<8;frame++){for(const c of [b,native]){c.camera.position.x+=.013;c.camera.updateMatrixWorld();c.update();}for(let i=0;i<3;i++)assert.deepEqual(b.lights[i].position.toArray(),native.lights[i].position.toArray());}}finally{native.dispose();}
 }finally{restoreA();restoreB();a.dispose();b.dispose();}}
});
test('five-cascade scheduling and first-edge overlap preserve all downstream cascade support',async()=>{
 const {installCloseShadowOverlap}=await import('./close-shadow-overlap.js'),{SunShadowScheduler}=await import('./sun-shadow-scheduler.js');
 const d=createNearShadowDetail({maxTextures:18,maxTextureSize:4096,sharedOrmSampler:true,cloudArraySampler:true},'micro'),csm=make(d),restore=configureNearShadowDetail(csm,d),before=csm.frustums.map(f=>f.vertices.near.map(v=>v.toArray())),overlap=installCloseShadowOverlap(csm,{enabled:true});
 const scheduler=new SunShadowScheduler(csm.lights);
 try{assert.equal(csm.lights.length,5);for(let i=2;i<5;i++)assert.deepEqual(csm.frustums[i].vertices.near.map(v=>v.toArray()),before[i]);assert.equal(overlap.state.uniform.value.x,csm.breaks[0]);assert.equal(scheduler.dueCascades(.016,csm.camera).length,5);scheduler.update(.016,csm.camera);assert.equal(scheduler.stats.cascades.length,5);assert.ok(scheduler.stats.cascades.every(s=>s.updates===1));}finally{scheduler.dispose();overlap.dispose();restore();csm.dispose();}
});
test('five real Three shader loops retain overlap, footprint and zero-fade branches for every supported material',async()=>{
 const {installCSMPhysicalLighting}=await import('./csm-physical.js'),{installCSMZeroFadeSkip}=await import('./csm-zero-fade.js'),{installCloseShadowOverlapShader}=await import('./close-shadow-overlap.js'),{installShadowReceiverFootprint}=await import('./shadow-receiver-footprint.js');
 const source=readFileSync(new URL('../../node_modules/three/src/renderers/webgl/WebGLProgram.js',import.meta.url),'utf8'),unroll=new Function(source.slice(source.indexOf('const unrollLoopPattern'),source.indexOf('function generatePrecision'))+';return unrollLoops;')();
 for(const type of ['standard','physical','lambert','phong'])for(const footprint of [false,true]){
 const s={uniforms:{},fragmentShader:THREE.ShaderLib[type].fragmentShader};installCSMPhysicalLighting(s);installCSMZeroFadeSkip(s,{value:1});installCloseShadowOverlapShader(s,{state:{enabled:true,uniform:{value:new THREE.Vector3(.008,.007,.002)}}});if(footprint)installShadowReceiverFootprint(s,{value:1});
 const generated=unroll(s.fragmentShader.replaceAll('NUM_DIR_LIGHTS','5'));assert.equal((generated.match(/uCSMZeroFadeSkip < 0.5/g)||[]).length,5);assert.equal((generated.match(/bool shouldFadeLastCascade/g)||[]).length,5);assert.ok(generated.includes('4 == CSM_CASCADES - 1 && linearDepth > cascadeCenter && ratio <= 0.0'));if(footprint)assert.ok(generated.indexOf('vec3 worldReceiverDx=dFdx(worldReceiverCoord);')<generated.indexOf('uCSMZeroFadeSkip < 0.5'));
 }
});
test('close and cascade gate the complete mixed-wood material, including legacy two-texture clouds',()=>{
 const base={maxTextureSize:8192,sharedOrmSampler:true};
 for(const mode of ['close','cascade']){
  assert.equal(createNearShadowDetail({...base,maxTextures:16,cloudArraySampler:true},mode).mode,'resolution');
  assert.equal(createNearShadowDetail({...base,maxTextures:17,cloudArraySampler:true},mode).mode,mode);
  const legacy=createNearShadowDetail({...base,maxTextures:17,cloudArraySampler:false},mode);assert.equal(legacy.mode,'resolution');assert.match(legacy.reason,/18 fragment samplers/);
  assert.equal(createNearShadowDetail({...base,maxTextures:18,cloudArraySampler:false},mode).fragmentSamplers,18);
 }
 const wood=readFileSync(new URL('./lodge-wood.js',import.meta.url),'utf8');for(const sampler of ['uLodgeLegacyMap','uLodgeEndMap'])assert.ok(wood.includes('uniform sampler2D '+sampler));assert.ok(wood.includes('m.map=textures.color'));assert.ok(wood.includes('m.normalMap=textures.normal'));assert.ok(wood.includes('m.roughnessMap=textures.roughness'));
 const lodgeSurface=5,cloudArray=1,pbr=2,room=2,spot=3;assert.equal(lodgeSurface+cloudArray+pbr+room+spot+5,18);assert.equal(lodgeSurface+cloudArray+pbr+room+spot+3,16);
});

test('verified explicit atlas admits five full maps on 16 samplers without weakening standalone guard',()=>{
 const caps={maxTextures:16,maxTextureSize:16384,sharedOrmSampler:true,cloudArraySampler:true,nearShadowAtlas40:true},d=createNearShadowDetail(caps,'micro');
 assert.equal(d.mode,'micro');assert.equal(d.atlas40,true);assert.equal(d.cascades,5);assert.equal(d.shadowSamplers,3);assert.equal(d.fragmentSamplers,16);assert.deepEqual(d.mapSizes,[4096,4096,4096,2048,2048]);
 for(const change of [{nearShadowAtlas40:false},{maxTextureSize:8192},{cloudArraySampler:false}])assert.equal(createNearShadowDetail({...caps,...change},'micro').mode,'resolution');
 assert.equal(createNearShadowDetail(caps,'auto').atlas40,false);assert.equal(createNearShadowDetail(caps,'auto').mode,'resolution');
});
test('contact adds only the 4m map while preserving all default 60/180/500 coverage and precision',()=>{
 const caps={maxTextures:16,maxTextureSize:8192,cloudArraySampler:true,sharedOrmSampler:true,nearShadowAtlas40:true},d=createNearShadowDetail(caps,'contact'),base=createNearShadowDetail({...caps,nearShadowAtlas40:false});
 assert.equal(base.mode,'resolution');assert.deepEqual(d.splits,[4,60,180,500]);assert.deepEqual(d.mapSizes,[4096,4096,2048,2048]);assert.equal(d.cascades,4);assert.equal(d.shadowSamplers,3);assert.equal(d.fragmentSamplers,16);assert.equal(d.atlas40,true);
 assert.equal(createNearShadowDetail({...caps,nearShadowAtlas40:false},'contact').mode,'resolution');assert.equal(createNearShadowDetail({...caps,nearShadowAtlas40:false,maxTextures:17},'contact').mode,'contact');assert.equal(createNearShadowDetail({...caps,maxTextureSize:4096},'contact').mode,'resolution');
 for(const reverse of [false,true]){const old=make(base,reverse),next=make(d,reverse),ra=configureNearShadowDetail(old,base,{reversedDepth:reverse}),rb=configureNearShadowDetail(next,d,{reversedDepth:reverse});try{
 const pitch=s=>(s.camera.right-s.camera.left)/s.mapSize.x;assert.ok(pitch(next.lights[0].shadow)<pitch(old.lights[0].shadow)/14);
 for(let i=0;i<3;i++){const a=old.lights[i].shadow,b=next.lights[i+1].shadow;assert.equal(d.splits[i+1],base.splits[i]);assert.equal(a.mapSize.x,b.mapSize.x);assert.ok(pitch(b)<=pitch(a)+1e-9);assert.equal(a.radius,b.radius);assert.equal(a.bias,b.bias);assert.equal(a.normalBias,b.normalBias);assert.deepEqual(next.frustums[i+1].vertices.far.map(p=>p.toArray()),old.frustums[i].vertices.far.map(p=>p.toArray()));}
 }finally{ra();rb();old.dispose();next.dispose();}}
});
