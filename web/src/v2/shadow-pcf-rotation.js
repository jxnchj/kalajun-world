import {ShaderChunk} from 'three';

export const PCF_GOLDEN_ANGLE=2.399963229728653;
// Keep the same five Vogel radii and fixed angles. These constants are rounded
// by the GLSL compiler to its highp precision; the original shader also rounds
// its angle/radius arithmetic. This algebraic rewrite is NOT bit-identical.
export const PCF_VOGEL_BASE=Object.freeze(Array.from({length:5},(_,i)=>{
 const angle=i*PCF_GOLDEN_ANGLE,radius=Math.sqrt((i+.5)/5);
 return Object.freeze([Math.cos(angle)*radius,Math.sin(angle)*radius]);
}));
const literal=x=>x===0?'0.0':x.toPrecision(17);

// Scoped expansion: do not mutate Three's shared shader chunks. Directional/spot
// 2D PCF changes only; point, basic, VSM, frustum, bias and weights stay intact.
export function sharedPCFRotationChunk(source=ShaderChunk.shadowmap_pars_fragment){
 const start=source.indexOf('float getShadow( sampler2DShadow shadowMap,'),end=source.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',start);
 if(start<0||end<0)throw new Error('Unsupported PCF shadow chunk: missing r186 2D PCF boundary');
 let body=source.slice(start,end);
 const phase='float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;';
 if(body.split(phase).length!==2||!body.includes('float radius = shadowRadius * texelSize.x;')||!body.includes(') * 0.2;'))throw new Error('Unsupported PCF shadow phase/radius/weight');
 body=body.replace(phase,phase+'\n\t\t\t\tfloat worldPCFCos = cos( phi );\n\t\t\t\tfloat worldPCFSin = sin( phi );\n\t\t\t\tmat2 worldPCFRotation = mat2( worldPCFCos, worldPCFSin, -worldPCFSin, worldPCFCos );');
 for(let i=0;i<5;i++){
  const old=`vogelDiskSample( ${i}, 5, phi )`;
  if(body.split(old).length!==2)throw new Error('Unsupported PCF shadow sample '+i);
  body=body.replace(old,`( worldPCFRotation * vec2( ${PCF_VOGEL_BASE[i].map(literal).join(', ')} ) )`);
 }
 return source.slice(0,start)+body+source.slice(end);
}

let cachedSource,cachedChunk;
export function installSharedPCFRotation(shader){
 const include='#include <shadowmap_pars_fragment>';
 if(!shader.fragmentShader.includes(include))return false;
 if(shader.fragmentShader.split(include).length!==2)throw new Error('Duplicate PCF shadow chunk include');
 if(cachedSource!==ShaderChunk.shadowmap_pars_fragment){cachedSource=ShaderChunk.shadowmap_pars_fragment;cachedChunk=sharedPCFRotationChunk(cachedSource);}
 shader.fragmentShader=shader.fragmentShader.replace(include,cachedChunk);
 return true;
}

// Opt-in experiment: caller owns the shader cache-key / needsUpdate change.
// No default installation and no mutation of any renderer/material are made here.
