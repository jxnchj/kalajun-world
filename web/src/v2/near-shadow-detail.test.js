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
 const a=createNearShadowDetail({maxTextures:16,maxTextureSize:8192});assert.equal(a.mode,'resolution');assert.equal(a.fragmentSamplers,16);assert.deepEqual(a.splits,[60,180,500]);assert.deepEqual(a.mapSizes,[4096,2048,2048]);
 const b=createNearShadowDetail({maxTextures:32,maxTextureSize:8192});assert.equal(b.mode,'cascade');assert.equal(b.fragmentSamplers,17);assert.deepEqual(b.splits,[20,60,180,500]);assert.deepEqual(b.mapSizes,[2048,2048,2048,2048]);
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:2048},'cascade').mode,'legacy');
 assert.match(createNearShadowDetail({maxTextures:16,maxTextureSize:4096},'cascade').reason,/17 fragment/);
 assert.equal(createNearShadowDetail({maxTextures:32,maxTextureSize:8192},'legacy').extraShadowPixels,0);
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
 const old=make(createNearShadowDetail({},'legacy')),d=createNearShadowDetail({maxTextures:32,maxTextureSize:8192}),next=make(d);configureNearShadowDetail(next,d);
 try{
  for(let i=0;i<3;i++){const before=old.lights[i].shadow,after=next.lights[i+1].shadow;assert.ok(after.camera.right-after.camera.left<=before.camera.right-before.camera.left+1e-9);assert.equal(after.mapSize.x,2048);assert.equal(after.radius,2);assert.equal(after.normalBias,.04);}
  assert.ok((next.lights[0].shadow.camera.right-next.lights[0].shadow.camera.left)/(old.lights[0].shadow.camera.right-old.lights[0].shadow.camera.left)<.34);
  assert.equal(next.lights[0].shadow.normalBias,.008);assert.equal(next.lights[0].shadow.radius,.5);
 }finally{old.dispose();next.dispose();}
});
test('mixed map resolutions snap near light exactly like native 4096 CSM and leave all far light poses unchanged',()=>{
 for(const reversed of [false,true]){
  const legacy=make(createNearShadowDetail({},'legacy'),reversed),detail=createNearShadowDetail({maxTextures:16,maxTextureSize:8192}),mixed=make(detail,reversed),fine=make(detail,reversed);
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
  const detail=createNearShadowDetail({maxTextures:16,maxTextureSize:8192}),corrected=make(detail,reversed),legacy=make(detail,reversed);
  const restores=[configureNearShadowDetail(corrected,detail,{reversedDepth:reversed}),configureNearShadowDetail(legacy,detail,{reversedDepth:reversed,receiverBias:'legacy'})];
  try {for(let i=0;i<detail.cascades;i++){
   const a=corrected.lights[i].shadow,b=legacy.lights[i].shadow;
   assert.equal(a.bias,-b.bias);assert.equal(a.normalBias,b.normalBias);assert.equal(a.radius,b.radius);
   assert.deepEqual(a.mapSize.toArray(),b.mapSize.toArray());assert.deepEqual(a.camera.projectionMatrix.elements,b.camera.projectionMatrix.elements);
  }}finally{for(const restore of restores)restore();corrected.dispose();legacy.dispose();}
 }
});

test('opt-in close cascade improves grass pitch while preserving every original map precision',()=>{
 const d=createNearShadowDetail({maxTextures:16,maxTextureSize:8192,sharedOrmSampler:true},'close');
 assert.equal(d.mode,'close');assert.equal(d.fragmentSamplers,16);assert.deepEqual(d.splits,[8,60,180,500]);assert.deepEqual(d.mapSizes,[4096,4096,2048,2048]);
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:8192},'close').mode,'resolution');
 assert.equal(createNearShadowDetail({maxTextures:16,maxTextureSize:8192,sharedOrmSampler:true}).mode,'resolution');
 const old=make(createNearShadowDetail({maxTextures:16,maxTextureSize:8192})),next=make(d);
 const restores=[configureNearShadowDetail(old,createNearShadowDetail({maxTextures:16,maxTextureSize:8192})),configureNearShadowDetail(next,d)];
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
