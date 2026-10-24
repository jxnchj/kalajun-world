import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEcologySources} from './ecology-loading.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function defaults(overrides={}){return{hi:()=>({scene:{traverse(){}}}),mid:()=>({scene:{traverse(){}}}),local:()=>({local:true}),core:()=>({core:true}),far:()=>null,needle:hi=>hi,flowerModule:()=>({loadFlowerLODAssets:()=>({dispose(){}}),loadFlowerAssets:()=>({dispose(){}})}),...overrides};}
test('needle setup starts as soon as its source is ready, while far textures and flowers load independently',async()=>{
  const hi=deferred(),far=deferred(),flowers=deferred(),calls=[];
  const expectedHi={scene:{traverse(){}}},expectedNeedle={scene:{traverse(){}}};let settled=false;
  const result=loadEcologySources(defaults({hi:()=>hi.promise,far:()=>far.promise,needle:value=>{assert.equal(value,expectedHi);calls.push('needle');return expectedNeedle;},flowerModule:()=>({loadFlowerLODAssets:()=>{calls.push('flowers-low');return flowers.promise;},loadFlowerAssets:()=>{calls.push('flowers-near');return flowers.promise;}})})).then(value=>{settled=true;return value;});
  await tick();assert.deepEqual(calls,['flowers-low','flowers-near']);assert.equal(settled,false);
  hi.resolve(expectedHi);await tick();assert.ok(calls.includes('needle'));assert.equal(settled,false);
  far.resolve({dispose(){throw Error('successful ownership must not be released');}});flowers.resolve({dispose(){throw Error('successful ownership must not be released');}});
  const loaded=await result;assert.equal(loaded.hi,expectedHi);assert.equal(loaded.needle,expectedNeedle);assert.equal(loaded.flowerLOD,loaded.flowerNear);
});
test('a failed branch aborts once and releases late sources and shared tree resources exactly once',async()=>{
  const far=deferred(),needle=deferred(),failed=new Error('far texture corrupt'),counts={geometry:0,material:0,texture:0,image:0,flowers:0,abort:0};
  const image={close(){counts.image++;}},texture={isTexture:true,image,dispose(){counts.texture++;}},material={map:texture,dispose(){counts.material++;}},geometry={dispose(){counts.geometry++;}},tree={scene:{traverse(fn){fn({isMesh:true,geometry,material});}}};
  const controller=new AbortController(),phases={};
  const result=loadEcologySources(defaults({hi:()=>tree,mid:()=>tree,far:()=>far.promise,needle:()=>needle.promise,flowerModule:()=>({loadFlowerLODAssets:()=>({dispose(){counts.flowers++;}}),loadFlowerAssets:()=>({dispose(){counts.flowers++;}})})}),{signal:controller.signal,onFailure:error=>{counts.abort++;controller.abort(error);},phases});
  let finished=false;result.catch(()=>{finished=true;});await tick();far.reject(failed);await tick();assert.equal(controller.signal.aborted,true);assert.equal(finished,false);
  needle.resolve(tree);await assert.rejects(result,error=>error===failed);
  assert.deepEqual(counts,{geometry:1,material:1,texture:1,image:1,flowers:2,abort:1});assert.equal(phases.far.status,'failed');assert.equal(phases.needle.status,'complete');
});
test('cancellation cannot publish a complete set of otherwise unabortable asset requests',async()=>{
  const controller=new AbortController(),far=deferred();let disposed=0;
  const result=loadEcologySources(defaults({far:()=>far.promise}),{signal:controller.signal});await tick();controller.abort();far.resolve({dispose(){disposed++;}});
  await assert.rejects(result,error=>error.name==='AbortError');assert.equal(disposed,1);
});


test('source-ready and publication failures retain transaction cleanup rather than publishing partial assets',async()=>{
 for(const stage of ['source','publish']){
  const failure=new Error(stage+' hook failed');let released=0,aborted=0;
  const mesh={isMesh:true,geometry:{dispose(){released++;}},material:{dispose(){released++;}}};
  const value={scene:{traverse(fn){fn(mesh);}}};
  const result=loadEcologySources(defaults({hi:()=>value}),{
   onReady:name=>{if(stage==='source'&&name==='hi')throw failure;},
   beforePublish:()=>{if(stage==='publish')return Promise.reject(failure);},
   onFailure:error=>{assert.equal(error,failure);aborted++;},
  });
  await assert.rejects(result,error=>error===failure);assert.equal(released,2);assert.equal(aborted,1);
 }
});
