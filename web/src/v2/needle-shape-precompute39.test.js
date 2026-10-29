import test from 'node:test';import assert from 'node:assert/strict';
import {needleShapeLayout39,needleShapeBakeVertex39} from './needle-shape-precompute39.js';
import {STATION_GLSL} from './spruce-gpu-stations.js';
test('shape storage accounts for all five original needles without root copies',()=>{
 const l=needleShapeLayout39(288);assert.equal(l.needles,1440);assert.equal(l.logicalBytes,46080);assert.equal(l.attachmentBytes,65536);
 assert.throws(()=>needleShapeLayout39(0),/Invalid/);assert.throws(()=>needleShapeLayout39(100000000,1024),/exceeds/);
});
test('GPU bake retains exact authored delta/side arithmetic and branch variation addressing',()=>{
 const ordinary=needleShapeBakeVertex39(false),branch=needleShapeBakeVertex39(true);
 const delta=STATION_GLSL.match(/vec3 delta=.*?;/)[0],side=STATION_GLSL.match(/vec3 side=.*?;/)[0];
 assert.ok(ordinary.includes(delta));assert.ok(ordinary.includes(side));assert.ok(branch.includes(delta.replace('aNeedleFrame3.xyz','normalize(cross(aNeedleFrame2.xyz,aNeedleFrame1.xyz))')));
 assert.match(branch,/variationBrush\*1440\+station\*5\+needle/);assert.match(branch,/uBranchOriginalBrushes\+int\(mod\(aSprayLod.w-1.,16.\)\+.5\)/);
 assert.doesNotMatch(ordinary,/uWindTime|uWorldViewer|modelMatrix/);
});

test('bake restores caller target/layer/state on failure and retains borrowed source attributes',async()=>{
 const T=await import('three'),{bakeNeedleShape39}=await import('./needle-shape-precompute39.js');
 const source=new T.BufferGeometry(),frames=new T.InstancedInterleavedBuffer(new Float32Array(288*16),16,1),variation=new T.InstancedInterleavedBuffer(new Float32Array(288*12),12,1);
 for(let i=0;i<4;i++)source.setAttribute('aNeedleFrame'+i,new T.InterleavedBufferAttribute(frames,4,i*4));
 for(let i=0;i<3;i++)source.setAttribute('aNeedleVariation'+i,new T.InterleavedBufferAttribute(variation,4,i*4));
 source.userData.stationCount=288;
 const old={},r={target:old,face:3,mip:2,autoClear:true,xr:{enabled:true},extensions:{has:()=>true},capabilities:{maxTextureSize:4096},getContext:()=>({MAX_DRAW_BUFFERS:1,getParameter:()=>4}),getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.mip;},getClearColor:c=>c.setRGB(.1,.2,.3),getClearAlpha:()=>.6,getViewport:v=>v.set(2,3,4,5),getScissor:v=>v.set(6,7,8,9),getScissorTest:()=>true,setRenderTarget(t,f=0,m=0){this.target=t;this.face=f;this.mip=m;},setScissorTest(v){this.scissorTest=v;},setClearColor(){},setViewport(){},setScissor(){},clear(){},render(scene,camera){assert.ok(camera.isOrthographicCamera);camera._reversedDepth=true;camera.updateProjectionMatrix();assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));assert.equal(scene.children[0].geometry.instanceCount,288);assert.equal(this.target.textures.length,2);throw Error('GPU bake failed');}};
 assert.throws(()=>bakeNeedleShape39(r,{stationGeometry:source}),/GPU bake failed/);
 assert.equal(r.target,old);assert.equal(r.face,3);assert.equal(r.mip,2);assert.equal(r.autoClear,true);assert.equal(r.xr.enabled,true);assert.equal(r.scissorTest,true);
 assert.equal(source.attributes.aNeedleFrame0.data,frames);assert.equal(source.attributes.aNeedleVariation0.data,variation);assert.equal(Object.keys(source.attributes).length,7);source.dispose();
});
