import test from 'node:test';import assert from 'node:assert/strict';import {ShaderChunk,ShaderLib} from 'three';
import {installCSMPhysicalLighting} from './csm-physical.js';
import {installShadowReceiverFootprint,RECEIVER_PIXEL_OFFSETS,receiverFootprintHelper} from './shadow-receiver-footprint.js';
function fixture(type='standard'){const shader={uniforms:{},fragmentShader:ShaderLib[type].fragmentShader};installCSMPhysicalLighting(shader);return shader;}
test('footprint is optional and keeps original PCF, CSM fade, bias and non-CSM lights',()=>{
 const off=fixture(),before=off.fragmentShader,chunk=ShaderChunk.shadowmap_pars_fragment;
 assert.equal(installShadowReceiverFootprint(off,null),false);assert.equal(off.fragmentShader,before);
 const u={value:1};assert.equal(installShadowReceiverFootprint(off,u),true);assert.equal(off.uniforms.uCloseShadowFootprint,u);assert.equal(installShadowReceiverFootprint(off,u),false);
 assert.equal(ShaderChunk.shadowmap_pars_fragment,chunk);assert.match(off.fragmentShader,/index == 0 && uCloseShadowFootprint > \.5/);
 const marker='#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM )';
 assert.equal(off.fragmentShader.slice(off.fragmentShader.indexOf(marker)),before.slice(before.indexOf(marker)));
 for(const keep of ['margin = 0.25 * pow( closestEdge, 2.0 );','float ratio = clamp( dist / margin, 0.0, 1.0 );','shouldFadeLastCascade ? ratio : 1.0'])assert.ok(off.fragmentShader.includes(keep));
 assert.match(receiverFootprintHelper,/p.z \+= bias;/);assert.match(receiverFootprintHelper,/mix\(1.0,visibility,intensity\)/);
});
test('all derivatives precede alpha/clipping/cascade branches and supported material lighting',()=>{
 for(const type of ['standard','physical','lambert','phong']){
  const shader=fixture(type);installShadowReceiverFootprint(shader,{value:1});const source=shader.fragmentShader,main=source.indexOf('void main()'),dx=source.indexOf('dFdx(',main),dy=source.indexOf('dFdy(',main);
  assert.ok(dx>main&&dy>dx);assert.ok(dy<source.indexOf('#include <clipping_planes_fragment>',main));assert.ok(dy<source.indexOf('#include <alphatest_fragment>',main));assert.ok(dy<source.indexOf('if( linearDepth',main));
  assert.equal((source.match(/dFdx\(/g)||[]).length,1);assert.equal((source.match(/dFdy\(/g)||[]).length,1);
  assert.ok(!source.slice(main,dy).includes('if('));
 }
});
test('four quadrant offsets preserve direction, center, constant depth and receiver plane depth',()=>{
 assert.deepEqual(RECEIVER_PIXEL_OFFSETS,[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]);
 assert.equal((receiverFootprintHelper.match(/texture\(shadowMap,/g)||[]).length,4);assert.match(receiverFootprintHelper,/16 weighted compares/);
 // UV and compare-depth coordinates must come from the same signed footprint.
 for(const [x,y] of RECEIVER_PIXEL_OFFSETS)assert.ok(receiverFootprintHelper.includes(`p + dx * ${x} + dy * ${y}`));
 const sample=(p,dx,dy)=>RECEIVER_PIXEL_OFFSETS.map(([x,y])=>p.map((v,i)=>v+dx[i]*x+dy[i]*y));
 const p=[.4,.6,.7],flat=sample(p,[.02,.003,0],[-.004,.04,0]);for(const v of flat)assert.equal(v[2],p[2]);
 const dx=[.02,.003,.005],dy=[-.004,.04,-.01],tilted=sample(p,dx,dy);
 for(let k=0;k<3;k++)assert.ok(Math.abs(tilted.reduce((s,v)=>s+v[k],0)/4-p[k])<1e-15);
 assert.ok(tilted[1][2]>tilted[0][2]);assert.ok(tilted[2][2]<tilted[0][2]);
 // A receiver lying exactly on a planar caster remains lit at every subpixel;
 // changing UV without z would falsely self-shadow on one side of the pixel.
 const a=.3,b=-.2,dxPlane=[.02,.003,a*.02+b*.003],dyPlane=[-.004,.04,a*-.004+b*.04],pPlane=[.4,.6,a*.4+b*.6+.5];
 for(const v of sample(pPlane,dxPlane,dyPlane))assert.ok(Math.abs(v[2]-(a*v[0]+b*v[1]+.5))<1e-15);
});
