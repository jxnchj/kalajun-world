import test from 'node:test';import assert from 'node:assert/strict';
import {GPUDrawRuns49,collectGPUDrawRuns49} from './gpu-draw-runs49.js';
function fixture(){
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};let active=null,id=0;const events=[],draws=[],deleted=[];
 const gl={CURRENT_QUERY:3,QUERY_RESULT_AVAILABLE:4,QUERY_RESULT:5,ready:true,disjoint:false,getExtension:()=>ext,getQuery:()=>active,getParameter:()=>gl.disjoint,createQuery:()=>({id:++id}),beginQuery(t,q){assert.equal(active,null);active=q;events.push(['begin',q.id]);},endQuery(){assert.ok(active);events.push(['end',active.id]);active=null;},deleteQuery(q){deleted.push(q.id);},getQueryParameter(q,k){return k===4?gl.ready:1000000;}};
 const scene={},camera={},shadowCamera={},geometry={id:10,index:{count:12},drawRange:{start:0,count:Infinity},attributes:{}},material={id:20,alphaTest:.45};
 const objects=[0,1,2,3].map(i=>({id:i+1,name:'tree'+i,isMesh:true,isInstancedMesh:true,count:2,geometry,material,family:i===2?'other':'photo-1'}));
 const r={getContext:()=>gl,clear(){events.push(['clear']);},setRenderTarget(){events.push(['target']);},renderBufferDirect(c,s,g,m,o,group){draws.push(o.id);if(o.fail)throw Error('draw failure');},shadowMap:{render(){for(const o of objects)r.renderBufferDirect(shadowCamera,scene,geometry,material,o,null);}},render(s,c){r.shadowMap.render();for(const o of objects)r.renderBufferDirect(c,s,geometry,material,o,null);}};
 const original={render:r.render,shadow:r.shadowMap.render,draw:r.renderBufferDirect,clear:r.clear,target:r.setRenderTarget};
 const install=(options={})=>new GPUDrawRuns49(r,{scene,camera,shadowCameras:[shadowCamera],classify:o=>o.family,...options});
 const debug={renderer:r,scene,camera,environment:{csm:{lights:[{shadow:{camera:shadowCamera}}]}},ecology:{nearTreeBatches:new Map(objects.filter(o=>o.family==='photo-1').map(o=>[o.id,{mesh:o,mode:1}]))},terrain:{},structures:{},water:{}};
 return{r,gl,ext,scene,camera,objects,draws,events,deleted,original,install,debug,get active(){return active;},foreign(){active={id:999};}};
}
test('one selected consecutive run query preserves every original draw and exact run count',()=>{
 const f=fixture(),p=f.install();p.target='main.color.photo-1#0';p.beginFrame();f.r.render(f.scene,f.camera);p.endFrame();
 assert.deepEqual(f.draws,[1,2,3,4,1,2,3,4]);assert.equal(f.events.filter(e=>e[0]==='begin').length,1);assert.equal(f.active,null);
 const runs=p.frames49[0].runs;assert.equal(runs.length,6);assert.equal(runs[3].draws,2);assert.equal(runs[3].triangles,16);assert.equal(runs[3].instances,4);
 assert.deepEqual(p.snapshot().samples[0].passes,{'main.color.photo-1#0':1});p.dispose();assert.equal(f.r.render,f.original.render);assert.equal(f.r.shadowMap.render,f.original.shadow);assert.equal(f.r.renderBufferDirect,f.original.draw);
});
test('no target inventory produces zero queries and clear/target boundaries split runs',()=>{
 const f=fixture(),p=f.install();p.beginFrame();f.r.render(f.scene,f.camera);p.endFrame();assert.equal(f.events.filter(e=>e[0]==='begin').length,0);
 p.originalRender=function(s,c){for(const o of [f.objects[0],f.objects[1]]){f.r.renderBufferDirect(c,s,o.geometry,o.material,o,null);f.r.clear();}};
 p.target='main.color.photo-1#0';p.beginFrame();f.r.render(f.scene,f.camera);p.endFrame();assert.equal(p.frames49[1].runs.length,2);assert.equal(p.frames49[1].issued,1);assert.equal(f.events.filter(e=>e[0]==='begin').length,1);p.dispose();assert.equal(f.r.clear,f.original.clear);assert.equal(f.r.setRenderTarget,f.original.target);
});
test('bounded pending queries, foreign owner and disjoint never suppress original draws',()=>{
 const f=fixture(),p=f.install({maxPending:2});f.gl.ready=false;p.target='main.color.photo-1#0';for(let i=0;i<10;i++){p.beginFrame();f.r.render(f.scene,f.camera);p.endFrame();}assert.equal(p.pending.length,2);assert.equal(f.draws.length,80);
 f.gl.disjoint=true;p.collect();assert.equal(p.pending.length,0);assert.equal(p.snapshot().samples.length,0);f.gl.disjoint=false;f.foreign();p.beginFrame();f.r.render(f.scene,f.camera);p.endFrame();assert.equal(f.active.id,999);assert.equal(p.counters.foreignQuery,1);p.dispose();assert.equal(f.active.id,999);
});
test('draw failure closes own query and restores hooks without replacing a later owner',()=>{
 const f=fixture(),p=f.install();p.target='main.shadow0.photo-1#0';f.objects[0].fail=true;p.beginFrame();assert.throws(()=>f.r.render(f.scene,f.camera),/draw failure/);p.endFrame({failed:true});assert.equal(f.active,null);assert.equal(p.snapshot().samples.length,0);const newer=()=>{};f.r.renderBufferDirect=newer;p.dispose();assert.equal(f.r.renderBufferDirect,newer);assert.equal(f.r.render,f.original.render);
});
test('async collector retains complete sequence and restores all hooks on normal and interrupted RAF',async()=>{
 for(const fail of [false,true]){const f=fixture();let n=0;const nextFrame=async()=>{if(fail&&++n===3)throw Error('RAF failure');f.r.render(f.scene,f.camera);return n++;};
  if(fail)await assert.rejects(collectGPUDrawRuns49(f.debug,{inventoryFrames:2,sampleFrames:4,nextFrame}),/RAF failure/);
  else{const result=await collectGPUDrawRuns49(f.debug,{inventoryFrames:2,sampleFrames:4,maxTargets:2,nextFrame});assert.equal(result.restored,true);assert.equal(result.frames.length,6);assert.ok(result.frames.every(f=>f.issued<=1));assert.ok(result.gpu.samples.every(s=>s.baselineSame));}
  assert.equal(f.r.render,f.original.render);assert.equal(f.r.shadowMap.render,f.original.shadow);assert.equal(f.r.renderBufferDirect,f.original.draw);assert.equal(f.r.clear,f.original.clear);assert.equal(f.r.setRenderTarget,f.original.target);assert.equal(f.active,null);
 }
});
