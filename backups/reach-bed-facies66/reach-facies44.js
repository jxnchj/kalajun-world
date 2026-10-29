import {FOREST_REACH39_SOURCE as source} from './forest-reach39-source.js';
import {REACH_SURFACE41_PATCHES} from './forest-reach-surface41.js';
const installed=new WeakMap(),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const zs=source.expected.map(p=>p.z),lo=Math.min(...zs),hi=Math.max(...zs);
export function reachFaciesRecovery44(x,z,shore,clearance,meso=.5,wetness=1){
 let mineral=0;for(const p of REACH_SURFACE41_PATCHES){if(p.kind!=='sand'&&p.kind!=='gravel')continue;const dx=x-p.x,dz=z-p.z,r=Math.hypot((dx*p.fx+dz*p.fz)/p.along,(-dx*p.fz+dz*p.fx)/p.across);mineral=Math.max(mineral,1-smooth(.38+meso*.16,1,r));}
 return (1-smooth(19,22,Math.hypot(x+3611.98133053,z-4805.37128229)))*smooth(lo,lo+1.5,z)*(1-smooth(hi-1.5,hi,z))*smooth(-.04,.015,shore)*(1-smooth(.5,.8,shore))*smooth(.25,.7,wetness)*smooth(-.06,-.015,clearance)*(1-smooth(.12,.32,clearance))*(1-mineral);
}
export function installReachFacies44(material,{enabled=false}={}){
 if(installed.has(material))throw Error('Reach facies already installed');
 if(material.userData.reachSurface41!=='root-organic-facies-v5')throw Error('Adopted v3/v5 source required');
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:+enabled},diagnostic={value:0};let disposed=false;
 const physical='terrainPhysicalBed*=1.-terrainLipRoots;',total='float reachTotal41=max(reachBed41,reachRoots41);';
 function hook(shader,...args){previous.call(this,shader,...args);
  for(const anchor of [physical,total,'terrainGradient=mix(terrainGradient,terrainForestGradient+terrainReferenceGradient,reachRoots41);'])if(!shader.fragmentShader.includes(anchor))throw Error('Reach facies source contract changed');
  shader.uniforms.uReachFacies44=uniform;shader.uniforms.uReachFaciesDiagnostic44=diagnostic;
  shader.fragmentShader='uniform float uReachFacies44;uniform float uReachFaciesDiagnostic44;\n'+shader.fragmentShader
   .replace(physical,physical+`
float reachExposure44=(1.-smoothstep(19.,22.,distance(terrainXZ,vec2(-3611.98133053,4805.37128229))))
 *smoothstep(${lo.toFixed(8)},${(lo+1.5).toFixed(8)},terrainXZ.y)*(1.-smoothstep(${(hi-1.5).toFixed(8)},${hi.toFixed(8)},terrainXZ.y))
 *smoothstep(-.04,.015,vTerrainShoreDistance)*(1.-smoothstep(.5,.8,vTerrainShoreDistance))*smoothstep(.25,.7,terrainWetness)*smoothstep(-.06,-.015,vTerrainHydrology.w)
 *(1.-smoothstep(.12,.32,vTerrainHydrology.w))*(1.-terrainSnow);
vec4 reachFaciesPockets44=reachSedimentPockets41(terrainXZ,terrainMeso);
float reachRecovery44=uReachFacies44*reachExposure44*(1.-max(reachFaciesPockets44.x,reachFaciesPockets44.y));
terrainPhysicalBed*=1.-reachRecovery44;
`).replace(total,`
// Recover the actual forest substrate, not a full-length dark humus overlay.
// Existing authored root/humus groups retain their original material response.
reachBed41*=1.-reachRecovery44;
reachOrganic41=mix(reachOrganic41,terrainForestColor,reachRecovery44*(1.-max(reachPockets41.z,reachPockets41.w)));
reachRoots41=max(reachRoots41,reachRecovery44);
`+total).replace('#include <opaque_fragment>','if(uReachFaciesDiagnostic44>.5)outgoingLight=vec3(reachRecovery44,reachBed41,reachRoots41);\n#include <opaque_fragment>');
 }
 const cache=function(){return key.call(this)+'-reach-facies44';};material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;
 const owner={uniform,diagnostic,setEnabled(v){if(disposed||typeof v!=='boolean')throw Error('Expected live boolean');uniform.value=+v;},setDiagnostic(v){if(disposed||typeof v!=='boolean')throw Error('Expected live boolean');diagnostic.value=+v;},dispose(){if(disposed)return;disposed=true;if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;material.needsUpdate=true;installed.delete(material);}};
 installed.set(material,owner);return owner;
}
