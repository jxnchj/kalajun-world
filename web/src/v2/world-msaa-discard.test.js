import test from 'node:test';import assert from 'node:assert/strict';
import {discardResolvedWorldMSAA} from './world-msaa-discard.js';
function fixture(){
 const read={},draw={},ms={},resolved={},events=[];let rb=read,db=draw;
 const gl={READ_FRAMEBUFFER:1,DRAW_FRAMEBUFFER:2,READ_FRAMEBUFFER_BINDING:3,DRAW_FRAMEBUFFER_BINDING:4,COLOR_ATTACHMENT0:10,DEPTH_ATTACHMENT:20,DEPTH_STENCIL_ATTACHMENT:21,getParameter:p=>p===3?rb:db,invalidateFramebuffer(t,a){events.push({t,a,fb:db});if(this.fail)throw Error('discard failed');}};
 const target={samples:4,textures:[{}],depthBuffer:true,stencilBuffer:false,scissorTest:false};
 const props={__webglMultisampledFramebuffer:ms,__webglFramebuffer:resolved};
 const renderer={autoClear:true,autoClearColor:true,autoClearDepth:true,getContext:()=>gl,getRenderTarget:()=>target,properties:{get:()=>props},state:{bindFramebuffer(t,f){if(t===1)rb=f;else db=f;}}};
 return {renderer,target,props,gl,ms,resolved,events,check(){assert.equal(rb,read);assert.equal(db,draw);}};
}
test('discard only separate resolved MS color/depth and restore both caller bindings',()=>{const f=fixture();assert.equal(discardResolvedWorldMSAA(f.renderer,f.target),'discarded');assert.deepEqual(f.events,[{t:2,a:[10,20],fb:f.ms}]);f.check();});
test('failed discard restores GL bindings and propagates error',()=>{const f=fixture();f.gl.fail=true;assert.throws(()=>discardResolvedWorldMSAA(f.renderer,f.target),/discard failed/);f.check();});
test('partial clears, scissor, no samples and direct multisample texture never discard persistent data',()=>{
 for(const setup of [f=>f.renderer.autoClear=false,f=>f.renderer.autoClearColor=false,f=>f.renderer.autoClearDepth=false,f=>f.target.scissorTest=true,f=>f.target.samples=0,f=>delete f.props.__webglMultisampledFramebuffer,f=>f.props.__webglMultisampledFramebuffer=f.resolved]){const f=fixture();setup(f);assert.notEqual(discardResolvedWorldMSAA(f.renderer,f.target),'discarded');assert.equal(f.events.length,0);f.check();}
});
