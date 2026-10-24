import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ShaderLib,Vector3,Vector4} from 'three';
import {installCSMPhysicalLighting} from './csm-physical.js';
import {installCSMZeroFadeSkip,CSM_ZERO_FADE_PREDICATE} from './csm-zero-fade.js';
import {installCloseShadowOverlapShader} from './close-shadow-overlap.js';
import {installShadowReceiverFootprint} from './shadow-receiver-footprint.js';
import {installCloseSolarShadow} from './close-solar-shadow.js';
const source=readFileSync(new URL('../../node_modules/three/src/renderers/webgl/WebGLProgram.js',import.meta.url),'utf8');
const unroll=new Function(source.slice(source.indexOf('const unrollLoopPattern'),source.indexOf('function generatePrecision'))+';return unrollLoops;')();
const evaluate=new Function('uCSMZeroFadeSkip','UNROLLED_LOOP_INDEX','CSM_CASCADES','linearDepth','cascadeCenter','ratio','return '+CSM_ZERO_FADE_PREDICATE+';');
function make(type){const shader={uniforms:{},fragmentShader:ShaderLib[type].fragmentShader};installCSMPhysicalLighting(shader);return shader;}
test('only the fade shadow-call predicate changes; RE_Direct, sample arguments and all blending stay byte identical',()=>{
 for(const type of ['standard','physical','lambert','phong']){
  const s=make(type),before=s.fragmentShader,u={value:0};assert.equal(installCSMZeroFadeSkip(s,null),false);assert.equal(s.fragmentShader,before);assert.equal(installCSMZeroFadeSkip(s,u),true);assert.strictEqual(s.uniforms.uCSMZeroFadeSkip,u);assert.equal(installCSMZeroFadeSkip(s,u),false);
  assert.equal(s.fragmentShader.replace('uniform float uCSMZeroFadeSkip;\n','').replace(' && '+CSM_ZERO_FADE_PREDICATE,''),before);
  assert.equal((s.fragmentShader.match(/uCSMZeroFadeSkip < 0.5/g)||[]).length,1);
 }
});
test('real installed Three loop unrolling preserves 3/4 cascades with overlap, standard PCF, receiver footprint and solar paths',()=>{
 for(const count of [3,4])for(const overlap of [false,true])for(const filter of count===4?['pcf','footprint','solar']:['pcf','footprint'])for(const type of ['standard','physical','lambert','phong']){
  const s=make(type);installCSMZeroFadeSkip(s,{value:1});installCloseShadowOverlapShader(s,{state:{enabled:overlap,uniform:{value:new Vector3(.016,.015,.002)}}});
  if(filter==='footprint')installShadowReceiverFootprint(s,{value:1});
  if(filter==='solar')installCloseSolarShadow(s,{depth:{value:null},far:{value:[null,null,null]},metric:{value:new Vector4(15,15,-8000,.0046)},reuseDepth:true});
  const generated=unroll(s.fragmentShader.replaceAll('NUM_DIR_LIGHTS',String(count)));
  assert.equal((generated.match(/uCSMZeroFadeSkip < 0.5/g)||[]).length,count);
  assert.ok(generated.includes((count-1)+' == CSM_CASCADES - 1 && linearDepth > cascadeCenter && ratio <= 0.0'));
  assert.equal((generated.match(/bool shouldFadeLastCascade/g)||[]).length,count);
  assert.equal((generated.match(/float blendRatio = shouldBlend \? ratio : 1.0/g)||[]).length,count);
  const firstGuard=generated.indexOf('uCSMZeroFadeSkip < 0.5');
  if(filter==='footprint')assert.ok(generated.indexOf('vec3 worldReceiverDx=dFdx(worldReceiverCoord);')<firstGuard);
  if(filter==='solar')assert.ok(generated.indexOf('worldSolarDx=dFdx(worldSolarCoord)')<firstGuard);
 }
});
test('sampling changes exactly for final faded-to-zero shadow; original direct sun and every positive weighted result remain',()=>{
 for(const count of [3,4])for(let i=0;i<count;i++)for(const center of [.008,.3,.7])for(const depth of [center-.01,center,center+.01,1.125,1.5,100])for(const ratio of [0,Number.MIN_VALUE,1e-12,.001,.5,1]){
  const skip=i===count-1&&depth>center&&ratio<=0;
  assert.equal(evaluate(0,i,count,depth,center,ratio),true,'disabled always retains original call');
  assert.equal(evaluate(1,i,count,depth,center,ratio),!skip);
  for(const shadow of [0,.1,.7,1]){
   const before=2.3,fade=i===count-1&&depth>center?ratio:1;
   const old=before*(1-fade)+before*shadow*fade;
   const actual=before*(1-fade)+before*(skip?1:shadow)*fade;
   assert.equal(actual,old,'all direct-light results equal; zero shadow never deletes sunlight');
  }
 }
});
test('actual final fade support retains every in-support sample and skips only beyond far blend edge',()=>{
 for(const count of [3,4]){const cascade=[.45,1],center=(cascade[0]+cascade[1])/2,margin=.25*cascade[1]**2,lo=cascade[0]-margin/2,hi=cascade[1]+margin/2;
 for(const d of [hi-1e-9,hi,hi+1e-9,2,100]){const ratio=Math.max(0,Math.min(1,Math.min(d-lo,hi-d)/margin));assert.equal(evaluate(1,count-1,count,d,center,ratio),d<hi);}}
});
