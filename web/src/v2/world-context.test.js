import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldContext} from './world-context.js';
function gl({clip=true,float=true,color=[4,2],depth=[4,2],cap=4,release=true,lost=false,queryThrows=false}={}){
 return {MAX_SAMPLES:1,RENDERBUFFER:2,RGBA16F:3,DEPTH_COMPONENT32F:4,SAMPLES:5,releases:0,
  getExtension(name){return name==='EXT_clip_control'?clip:name==='EXT_color_buffer_float'?float:name==='WEBGL_lose_context'&&release?{loseContext:()=>this.releases++}:null},
  getParameter(){if(queryThrows)throw Error('query failed');return cap},
  getInternalformatParameter(target,format){return format===this.RGBA16F?color:depth},isContextLost(){return lost},getContextAttributes(){return {antialias:this.options.antialias}}};
}
function canvas(context,{replacement=null,fail=false}={}){
 return {width:100,height:80,id:'world',className:'main',calls:[],getContext(type,options){this.calls.push({type,options});if(fail)throw Error('getContext failed');if(context)context.options=options;return context},cloneNode(deep){assert.equal(deep,false);return replacement},replaceWith(next){this.replaced=next}};
}
function fixture(probeOptions={},actualOptions={}){
 const probeGL=gl(probeOptions),actualGL=gl(actualOptions),probe=canvas(probeGL),actual=canvas(actualGL),created=[];
 const createCanvas=()=>{created.push(probe);return probe};return{probeGL,actualGL,probe,actual,created,createCanvas};
}
test('eligible HDR target retains world samples while removing only redundant canvas MSAA',()=>{
 const f=fixture(),r=createWorldContext(f.actual,{createCanvas:f.createCanvas});
 assert.equal(r.canvas,f.actual);assert.equal(r.context,f.actualGL);assert.equal(r.reversedDepth,true);assert.equal(r.stats.worldTargetSamples,4);assert.equal(r.stats.screenAntialias,false);
 assert.equal(f.probeGL.releases,1);assert.equal(f.probe.width,0);assert.equal(f.probe.height,0);assert.equal(f.actualGL.releases,0);
 assert.deepEqual(f.actual.calls[0].options,{alpha:false,depth:true,stencil:false,powerPreference:'high-performance',antialias:false});
});
test('explicit screenMSAA reference and logarithmic depth skip probing and preserve screen AA',()=>{
 for(const search of ['?screenMSAA=1','?depth=log','?depth=log&screenMSAA=0']){
  const f=fixture(),r=createWorldContext(f.actual,{search,createCanvas:f.createCanvas});assert.equal(f.created.length,0);assert.equal(r.stats.screenAntialias,true);assert.equal(r.reversedDepth,!search.includes('depth=log'));
 }
});
test('unsupported, single-sample and mismatched attachment formats keep original canvas AA',()=>{
 for(const options of [{clip:false},{float:false},{color:[]},{color:[4],depth:[2]},{cap:1},{depth:[1],color:[1]},{queryThrows:true},{release:false}]){
  const f=fixture(options),r=createWorldContext(f.actual,{createCanvas:f.createCanvas});assert.equal(r.stats.screenAntialias,true);assert.equal(f.probeGL.releases,options.release===false?0:1);assert.equal(f.actualGL.releases,0);
 }
});
test('probe creation or context failure safely takes original path',()=>{
 for(const make of [()=>{throw Error('no document')},()=>canvas(null),()=>canvas(null,{fail:true})]){
  const actual=canvas(gl()),r=createWorldContext(actual,{createCanvas:make});assert.equal(r.stats.screenAntialias,true);assert.equal(r.canvas,actual);
 }
});
test('real context mismatch recreates AA canvas, preserving cloned DOM attributes before use',()=>{
 for(const options of [{clip:false},{float:false},{depth:[1],color:[1]},{lost:true},{queryThrows:true}]){
  const f=fixture({},options),replacement=canvas(gl());f.actual.cloneNode=deep=>{assert.equal(deep,false);replacement.id=f.actual.id;replacement.className=f.actual.className;return replacement};
  const r=createWorldContext(f.actual,{createCanvas:f.createCanvas});assert.equal(r.canvas,replacement);assert.equal(f.actual.replaced,replacement);assert.equal(r.stats.screenAntialias,true);assert.equal(r.stats.fallback,true);assert.equal(f.actualGL.releases,1);assert.equal(replacement.id,'world');assert.equal(replacement.className,'main');
 }
});
test('failed real context creation can recover; failed conservative creation rejects',()=>{
 for(const fail of [false,true]){
  const f=fixture(),replacement=canvas(fail?null:gl());f.actual.getContext=()=>{throw Error('actual failed')};f.actual.cloneNode=()=>replacement;
  if(fail)assert.throws(()=>createWorldContext(f.actual,{createCanvas:f.createCanvas}),/unavailable after AA fallback/);
  else assert.equal(createWorldContext(f.actual,{createCanvas:f.createCanvas}).stats.fallback,true);
 }
 const actual=canvas(null);assert.throws(()=>createWorldContext(actual,{search:'?screenMSAA=1'}),/WebGL2 context unavailable/);
});
