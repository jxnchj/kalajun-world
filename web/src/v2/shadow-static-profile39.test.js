import test from 'node:test';import assert from 'node:assert/strict';
import {ShadowStaticProfile39} from './shadow-static-profile39.js';
import {GPUPassProfile} from './gpu-pass-profile.js';
function fixture(){
 const events=[],ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};let active=null,id=0;
 const gl={CURRENT_QUERY:3,QUERY_RESULT_AVAILABLE:4,QUERY_RESULT:5,getExtension:()=>ext,getQuery:()=>active,getParameter:()=>false,createQuery:()=>({id:++id}),beginQuery(t,q){assert.equal(active,null);active=q;events.push('begin');},endQuery(){assert.ok(active);active=null;events.push('end');},deleteQuery(){},getQueryParameter(q,key){return key===4?true:1000000;}};
 const scene={},camera={},drawn=[];
 const r={getContext:()=>gl,clear(){events.push('clear');},renderBufferDirect(...args){drawn.push(args[4]);if(args[4].fail)throw Error('draw');},shadowMap:{render(){for(const object of r.objects)r.renderBufferDirect(camera,scene,{}, {},object,null);}},render(){this.shadowMap.render();this.renderBufferDirect(camera,scene,{}, {},{color:true},null);},objects:[{candidate:true},{candidate:true},{candidate:false},{candidate:true}]};
 const p=new GPUPassProfile(r,{scene,camera,enabled:true});const d=new ShadowStaticProfile39(r,p,{enabled:true,classify:o=>o.candidate});return{r,p,d,scene,camera,drawn,events};
}
test('shadow segmentation uses one GPU query owner and preserves every draw in original order',()=>{
 const f=fixture();f.p.beginFrame();f.r.render(f.scene,f.camera);f.p.endFrame();const s=f.p.snapshot();
 assert.deepEqual(f.drawn.slice(0,4),f.r.objects);assert.equal(f.drawn.length,5);assert.equal(f.d.stats.segments,3);assert.equal(s.foreignQuery,0);
 assert.equal(s.samples.length,1);assert.equal(s.samples[0].passes['main.shadow.standardCandidate'],2);assert.equal(s.samples[0].passes['main.shadow.animatedOrCustom'],1);
 assert.equal(f.events.filter(x=>x==='begin').length,f.events.filter(x=>x==='end').length);f.d.dispose();f.p.dispose();
});
test('disabled, exception, and query-capacity paths do not omit drawing or publish partial timings',()=>{
 const f=fixture();f.p.maxPending=2;f.p.beginFrame();f.r.render(f.scene,f.camera);f.p.endFrame();assert.equal(f.drawn.length,5);assert.equal(f.p.snapshot().samples.length,0);
 f.p.maxPending=48;f.r.objects=[{candidate:true,fail:true}];f.p.beginFrame();assert.throws(()=>f.r.render(f.scene,f.camera),/draw/);f.p.endFrame({failed:true});assert.equal(f.d.depth,0);assert.equal(f.p.snapshot().samples.length,0);
 f.d.dispose();f.p.dispose();const previous=f.r.renderBufferDirect;const off=new ShadowStaticProfile39(f.r,null);assert.equal(f.r.renderBufferDirect,previous);off.dispose();
});

test('next cascade clear leaves preceding object category and restores original clear hook',()=>{
 const f=fixture(),clear=f.d.oldClear;f.r.objects=[{candidate:true}];
 f.p.originalShadow=function(){f.r.renderBufferDirect(f.camera,f.scene,{}, {},f.r.objects[0],null);f.r.clear();f.r.renderBufferDirect(f.camera,f.scene,{}, {},f.r.objects[0],null);};
 f.p.beginFrame();f.r.render(f.scene,f.camera);f.p.endFrame();
 const s=f.p.snapshot();assert.equal(s.samples.length,1);assert.equal(s.samples[0].passes['main.shadow.standardCandidate'],2);assert.ok(s.samples[0].passes['main.shadow']>=2);
 f.d.dispose();assert.equal(f.r.clear,clear);f.p.dispose();
});
