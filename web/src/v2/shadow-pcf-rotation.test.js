import test from 'node:test';
import assert from 'node:assert/strict';
import {ShaderChunk,ShaderLib} from 'three';
import {PCF_GOLDEN_ANGLE,PCF_VOGEL_BASE,sharedPCFRotationChunk,installSharedPCFRotation} from './shadow-pcf-rotation.js';

test('five 2D hardware PCF samples retain radius, weights, compare depth and all other shader paths',()=>{
 const before=ShaderChunk.shadowmap_pars_fragment,after=sharedPCFRotationChunk();
 const start=before.indexOf('float getShadow( sampler2DShadow shadowMap,'),end=before.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',start),newEnd=after.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',start);
 assert.equal(after.slice(0,start),before.slice(0,start));assert.equal(after.slice(newEnd),before.slice(end));
 const body=after.slice(start,newEnd);
 assert.equal((body.match(/texture\( shadowMap,/g)||[]).length,5);
 assert.equal((body.match(/worldPCFRotation \* vec2/g)||[]).length,5);
 assert.equal((body.match(/cos\( phi \)/g)||[]).length,1);assert.equal((body.match(/sin\( phi \)/g)||[]).length,1);
 for(const text of ['shadowCoord.xyz /= shadowCoord.w;','shadowCoord.z += shadowBias;','float radius = shadowRadius * texelSize.x;',') * 0.2;','return mix( 1.0, shadow, shadowIntensity );'])assert.ok(body.includes(text));
 assert.equal(ShaderChunk.shadowmap_pars_fragment,before);
});

test('shader patch is scoped, idempotent and rejects unsupported source changes',()=>{
 const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
 assert.equal(installSharedPCFRotation(shader),true);const once=shader.fragmentShader;
 assert.equal(installSharedPCFRotation(shader),false);assert.equal(shader.fragmentShader,once);
 assert.equal(shader.vertexShader,ShaderLib.standard.vertexShader);
 assert.throws(()=>sharedPCFRotationChunk(''),/Unsupported/);
 assert.throws(()=>sharedPCFRotationChunk(ShaderChunk.shadowmap_pars_fragment.replace('vogelDiskSample( 4, 5, phi )','vogelDiskSample( 4, 6, phi )')),/sample 4/);
 assert.throws(()=>installSharedPCFRotation({fragmentShader:'#include <shadowmap_pars_fragment>\n#include <shadowmap_pars_fragment>'}),/Duplicate/);
});

test('rotating the full Vogel disk preserves radii and 500005 float32 sample coordinates within rounding error',t=>{
 const f=Math.fround,mul=(a,b)=>f(f(a)*f(b)),add=(a,b)=>f(f(a)+f(b)),sub=(a,b)=>f(f(a)-f(b));
 let maxCoordinateError=0,maxRadiusError=0,maxDoubleError=0;
 for(let n=0;n<=100000;n++){
  const phase=n/100000*Math.PI*2,phi=f(phase),c=f(Math.cos(phi)),s=f(Math.sin(phi));
  for(let i=0;i<5;i++){
   const radius=f(Math.sqrt(f((i+.5)/5))),angle=add(mul(i,PCF_GOLDEN_ANGLE),phi);
   const old=[mul(Math.cos(angle),radius),mul(Math.sin(angle),radius)],base=PCF_VOGEL_BASE[i].map(f);
   const next=[sub(mul(c,base[0]),mul(s,base[1])),add(mul(s,base[0]),mul(c,base[1]))];
   maxCoordinateError=Math.max(maxCoordinateError,...old.map((v,k)=>Math.abs(v-next[k])));
   maxRadiusError=Math.max(maxRadiusError,Math.abs(Math.hypot(...next)-Math.sqrt((i+.5)/5)));
   const exact=PCF_VOGEL_BASE[i],rotated=[Math.cos(phase)*exact[0]-Math.sin(phase)*exact[1],Math.sin(phase)*exact[0]+Math.cos(phase)*exact[1]],angle64=i*PCF_GOLDEN_ANGLE+phase;
   maxDoubleError=Math.max(maxDoubleError,Math.abs(rotated[0]-Math.cos(angle64)*Math.sqrt((i+.5)/5)),Math.abs(rotated[1]-Math.sin(angle64)*Math.sqrt((i+.5)/5)));
  }
 }
 assert.ok(maxCoordinateError<1.5e-6);assert.ok(maxRadiusError<1.5e-7);assert.ok(maxDoubleError<3e-15);
 t.diagnostic(JSON.stringify({samples:500005,maxCoordinateError,maxRadiusError,maxDoubleError,shadowTexelErrorAtRadius2:maxCoordinateError*2,scope:'CPU float32 arithmetic model; GLSL trig precision and frozen pixels require browser validation'}));
});
