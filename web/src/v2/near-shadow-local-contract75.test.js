import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {CSM} from 'three/addons/csm/CSM.js';
import {createNearShadowDetail,configureNearShadowDetail} from './near-shadow-detail.js';
import {localShadowWindow72Enabled} from './local-shadow-policy72.js';
import {nearShadowAtlas40Capability} from './shadow-atlas40.js';
import {configureCSMDepth} from './depth-mode.js';
import {ShadowWindowCoverage42} from './shadow-window-coverage42.js';

const modes=['auto','legacy','cascade','resolution','close','contact','micro'];
const caps={maxTextures:32,maxTextureSize:8192,maxSamples:4,cloudArraySampler:true,sharedOrmSampler:true};
const plain=detail=>JSON.parse(JSON.stringify(detail));
// Execute the actual environment selection statements, without constructing
// the unrelated GPU sky/PMREM. This catches a missing policy argument there.
const environmentSource=readFileSync(new URL('./environment.js',import.meta.url),'utf8');
const start=environmentSource.indexOf('    const requestedShadowMode='),end=environmentSource.indexOf('    this.csm=new CSM',start);
assert.ok(start>=0&&end>start);
assert.match(environmentSource,/import \{localShadowWindow72Enabled\} from '\.\/local-shadow-policy72\.js'/);
const selectEnvironment=new Function('renderer','nearShadowAtlas40Capability','createNearShadowDetail','localShadowWindow72Enabled',environmentSource.slice(start,end)+'return this.nearShadowDetail;');
function environmentDetail(capabilities,search=''){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,value:{search}});
  try{return selectEnvironment.call({clouds:{uCloudCacheArray:{}}},{capabilities,shadowMap:{type:T.PCFShadowMap}},nearShadowAtlas40Capability,createNearShadowDetail,localShadowWindow72Enabled);}
  finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
}
function makeCSM(detail,reversed=false){
  const camera=new T.PerspectiveCamera(52,1453/839,.25,150000);camera._reversedDepth=reversed;camera.updateProjectionMatrix();
  camera.position.set(-3611.9813,2329.1612,4805.3713);camera.rotation.set(-.1,.5,0);camera.updateMatrixWorld();
  const csm=new CSM({camera,parent:new T.Scene(),cascades:detail.cascades,maxFar:detail.maxFar,mode:'custom',customSplitsCallback:detail.customSplitsCallback,shadowMapSize:detail.shadowMapSize,lightDirection:new T.Vector3(-.3,-.9,.2).normalize(),lightNear:1,lightFar:8000,lightMargin:2000});
  csm.fade=true;configureCSMDepth(csm,camera);return csm;
}

test('environment default and explicit ON guarantee native 4096 without changing the auto cascade layout',()=>{
  for(const maxTextures of [16,32]){
    const capabilities={...caps,maxTextures},off=environmentDetail(capabilities,'?localShadowWindow42=0');
    assert.equal(off.mode,maxTextures===16?'resolution':'cascade');
    assert.deepEqual(off.splits,maxTextures===16?[60,180,500]:[20,60,180,500]);
    assert.deepEqual(off.mapSizes,maxTextures===16?[4096,2048,2048]:[2048,2048,2048,2048]);
    for(const query of ['', '?localShadowWindow42=1','?localShadowWindow42=1&localShadowWindow42=1']){
      const on=environmentDetail(capabilities,query);
      assert.equal(on.localShadowNativeSize,4096);assert.equal(on.mapSizes[0],4096);
      assert.deepEqual(on.splits,off.splits);assert.deepEqual(on.mapSizes.slice(1),off.mapSizes.slice(1));
      assert.equal(on.mode,off.mode);assert.equal(on.cascades,off.cascades);
      const delta=off.mapSizes[0]===4096?0:4096**2-2048**2;
      assert.equal(on.shadowPixels-off.shadowPixels,delta);assert.equal(on.extraDepthBytesLowerBound-off.extraDepthBytesLowerBound,delta*4);
    }
  }
});

test('all explicit modes retain their existing capability decisions and only the first native map may grow',()=>{
  for(const maxTextures of [16,32])for(const cloudArraySampler of [false,true])for(const nearShadowAtlas40 of [false,true])for(const requested of modes){
    const capabilities={...caps,maxTextures,maxTextureSize:16384,cloudArraySampler,nearShadowAtlas40};
    const off=createNearShadowDetail(capabilities,requested),on=createNearShadowDetail(capabilities,requested,{localShadowWindow42:true});
    const expected=plain(off),delta=4096**2-off.mapSizes[0]**2;
    expected.mapSizes[0]=4096;expected.shadowPixels+=delta;expected.extraShadowPixels+=delta;expected.extraDepthBytesLowerBound+=delta*4;expected.localShadowNativeSize=4096;
    assert.deepEqual(plain(on),expected,JSON.stringify({maxTextures,cloudArraySampler,nearShadowAtlas40,requested}));
    const before=[],after=[];off.customSplitsCallback(off.cascades,.25,500,before);on.customSplitsCallback(on.cascades,.25,500,after);assert.deepEqual(after,before);
  }
  for(const requested of modes){
    const off=environmentDetail(caps,'?nearShadowDetail='+requested+'&localShadowWindow42=0');
    for(const suffix of ['', '&localShadowWindow42=1']){
      const on=environmentDetail(caps,'?nearShadowDetail='+requested+suffix);
      assert.equal(on.mode,off.mode);assert.equal(on.requested,requested);assert.deepEqual(on.splits,off.splits);assert.equal(on.mapSizes[0],4096);
    }
  }
});

test('OFF preserves the complete pre-fix policy output for 896 capability/mode combinations',()=>{
  // SHA captured from the pre-fix production function, including every JSON
  // diagnostic field and actual customSplitsCallback output. Not a new policy.
  const rows=[];
  for(const maxTextures of [16,17,18,32])for(const maxTextureSize of [2048,4096,8192,16384])for(const cloudArraySampler of [false,true])for(const sharedOrmSampler of [false,true])for(const nearShadowAtlas40 of [false,true])for(const mode of modes){
    const capabilities={maxTextures,maxTextureSize,cloudArraySampler,sharedOrmSampler,nearShadowAtlas40},detail=createNearShadowDetail(capabilities,mode,{localShadowWindow42:false}),callback=[];
    detail.customSplitsCallback(detail.cascades,.25,500,callback);rows.push({caps:capabilities,mode,detail,callback});
    assert.deepEqual(plain(detail),plain(createNearShadowDetail(capabilities,mode)));
  }
  assert.equal(rows.length,896);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'6fb4eca2d18308dcebc7be00aa1c5d9317a2d9f4a976d858b692f37752e2af2f');
});

test('unsupported ON fails explicitly instead of disabling coverage or clamping a required map',()=>{
  for(const requested of modes)for(const suffix of ['', '&localShadowWindow42=1']){
    const query='?nearShadowDetail='+requested+suffix;
    for(const maxTextureSize of [0,2048,4095])assert.throws(()=>environmentDetail({...caps,maxTextureSize},query),/Local shadow window requires a 4096 native near map/);
    for(const maxSamples of [undefined,0,2])assert.throws(()=>environmentDetail({...caps,maxSamples},query),/Local shadow window requires 4x MSAA/);
    assert.equal(environmentDetail({...caps,maxTextureSize:4096,maxSamples:4},query).mapSizes[0],4096);
    for(const capabilities of [{...caps,maxTextureSize:2048},{...caps,maxSamples:0}])assert.doesNotThrow(()=>environmentDetail(capabilities,query+'&localShadowWindow42=0'));
  }
});

test('per-map snapping covers cascade and legacy, matches native 4096, and leaves every far pose and bias unchanged',()=>{
  for(const requested of modes)for(const reversed of [false,true]){
    const before=createNearShadowDetail(caps,requested),after=createNearShadowDetail(caps,requested,{localShadowWindow42:true});
    const off=makeCSM(before,reversed),on=makeCSM(after,reversed),fine=makeCSM(after,reversed),originalUpdate=on.update,originalOffUpdate=off.update;
    fine.shadowMapSize=4096;
    const restoreOff=configureNearShadowDetail(off,before,{reversedDepth:reversed}),restoreOn=configureNearShadowDetail(on,after,{reversedDepth:reversed});
    try{
      assert.notStrictEqual(on.update,originalUpdate);
      if(['cascade','legacy'].includes(before.mode))assert.strictEqual(off.update,originalOffUpdate);
      for(let i=0;i<after.cascades;i++){
        const a=off.lights[i].shadow,b=on.lights[i].shadow;
        assert.equal(b.radius,a.radius);assert.equal(b.normalBias,a.normalBias);assert.equal(b.bias,a.bias);
        assert.deepEqual(b.camera.projectionMatrix.elements,a.camera.projectionMatrix.elements);
        if(i>0)assert.deepEqual(b.mapSize.toArray(),a.mapSize.toArray());
      }
      for(let frame=0;frame<12;frame++){
        for(const csm of [off,on,fine]){csm.camera.position.x+=.0073;csm.camera.position.z+=.0119;csm.camera.updateMatrixWorld();csm.update();}
        assert.deepEqual(on.lights[0].position.toArray(),fine.lights[0].position.toArray());
        assert.deepEqual(on.lights[0].target.position.toArray(),fine.lights[0].target.position.toArray());
        if(before.mapSizes[0]===4096){assert.deepEqual(on.lights[0].position.toArray(),off.lights[0].position.toArray());assert.deepEqual(on.lights[0].target.position.toArray(),off.lights[0].target.position.toArray());}
        for(let i=1;i<after.cascades;i++){
          assert.deepEqual(on.lights[i].position.toArray(),off.lights[i].position.toArray());
          assert.deepEqual(on.lights[i].target.position.toArray(),off.lights[i].target.position.toArray());
        }
      }
      restoreOn();assert.strictEqual(on.update,originalUpdate);
    }finally{restoreOff();restoreOn();for(const csm of [off,on,fine]){csm.dispose();csm.remove();}}
  }
});

test('actual coverage owner accepts the repaired default map and retains its original 4096/4x guards',()=>{
  const source=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());source.customDepthMaterial=new T.MeshDepthMaterial();source.updateMatrixWorld();
  const budget={anchor:[0,0,0],sizes:[4.5],sourceProvider:{revision:1,sources:()=>[source]}};
  try{for(const query of ['', '?localShadowWindow42=1','?localShadowWindow42=0']){
    const detail=environmentDetail(caps,query),csm=makeCSM(detail),restore=configureNearShadowDetail(csm,detail);
    const api={debug:{renderer:{capabilities:caps},environment:{csm,sun:new T.Vector3(0,1,0)},terrain:{materials:[]}}};let owner;
    try{
      if(query.endsWith('=0'))assert.throws(()=>new ShadowWindowCoverage42(api,budget,{deferViews:true}),/Original 4096 shadow required/);
      else{
        owner=new ShadowWindowCoverage42(api,budget,{deferViews:true});assert.equal(owner.stats.nativeSize,4096);assert.equal(owner.stats.samples,4);assert.equal(owner.viewsReady,false);
        const lowSamples={debug:{...api.debug,renderer:{capabilities:{...caps,maxSamples:2}}}};
        assert.throws(()=>new ShadowWindowCoverage42(lowSamples,budget,{deferViews:true}),/4x MSAA required/);
      }
    }finally{owner?.dispose();restore();csm.dispose();csm.remove();}
  }}finally{source.geometry.dispose();source.material.dispose();source.customDepthMaterial.dispose();}
});
