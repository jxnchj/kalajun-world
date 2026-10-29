import {FOREST_REACH39_SOURCE as source} from './forest-reach39-source.js';
import surface from './generated/forest-reach-surface41.json' with {type:'json'};

// A material-only review of the existing 36 m reach. These are authored sediment
// associations, not measured grain sizes or a hydraulic transport simulation.
// No world/geometry/plant API is imported or mutated by this module.
export const REACH_BED_FACIES64_REVISION='reach-bed-facies64-1';
const installed=new WeakMap();
const center=Object.freeze([-3611.98133053,4805.37128229]);
const zs=source.expected.map(p=>p.z),lo=Math.min(...zs),hi=Math.max(...zs);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=x=>Math.max(0,Math.min(1,x));
const scales={sand:[1.50,1.55],humus:[1.45,1.50],root:[1.10,1.05],gravel:[1,1]};
const kinds={sand:0,gravel:1,humus:2,root:3};
export const REACH_BED_FACIES64_PATCHES=Object.freeze(surface.patches.map(p=>Object.freeze({
 ...p,along:p.along*scales[p.kind][0],across:p.across*scales[p.kind][1],
 sourceAlong:p.along,sourceAcross:p.across,
})));
export function reachBedFacies64Pockets(x,z,meso=.5,target=[0,0,0,0]){
 target.fill(0);for(const p of REACH_BED_FACIES64_PATCHES){
  const dx=x-p.x,dz=z-p.z,radial=Math.hypot((dx*p.fx+dz*p.fz)/p.along,(-dx*p.fz+dz*p.fx)/p.across);
  const w=1-smooth(.40+(meso-.5)*.08,1,radial),i=kinds[p.kind];target[i]=Math.max(target[i],w);
 }return target;
}
// [unchanged original substrate, fine mineral deposition, fine organic deposit].
// Exact gravel cores keep the original scan; new layers have their own grain
// normals and roughness, rather than tinting/blur-filtering the old stone normal.
export function reachBedFacies64Mix(pockets,shallow,shelf,domain,target=[1,0,0]){
 const fine=Math.min(.96,Math.max(0,.16+.25*shallow*shelf+.68*pockets[0]+.50*pockets[2]+.18*pockets[3]*shallow));
 const deposit=fine*(1-smooth(.42,.88,pockets[1]))*domain;
 const organic=Math.min(.48,Math.max(0,.36*pockets[2]+.42*pockets[3]*shallow));
 target[0]=1-deposit;target[1]=deposit*(1-organic);target[2]=deposit*organic;return target;
}
export function reachBedFacies64Weights({x,z,clearance,shoreDistance,wetness=1,slope=0,meso=.5,snow=0},target=[1,0,0]){
 for(const value of [x,z,clearance,shoreDistance,wetness,slope,meso,snow])if(!Number.isFinite(value))throw new TypeError('Finite reach substrate inputs required');
 const extent=(1-smooth(19,22,Math.hypot(x-center[0],z-center[1])))*smooth(lo,lo+1.5,z)*(1-smooth(hi-1.5,hi,z));
 // Remain inside actual rendered water. The accepted facies44 outside-bank
 // recovery, top cap, root surface and dry deposits are deliberately unchanged.
 const domain=extent*(1-smooth(-.06,0,shoreDistance))*(1-smooth(0,.018,clearance))*smooth(.25,.7,wetness)*(1-clamp(snow));
 if(domain===0){target[0]=1;target[1]=target[2]=0;return target;}
 const shallow=1-smooth(.035,.155,Math.max(0,-clearance)),shelf=1-smooth(.02,.18,slope);
 return reachBedFacies64Mix(reachBedFacies64Pockets(x,z,meso),shallow,shelf,domain,target);
}
const num=x=>Number(x).toFixed(10),vec=(x,z)=>'vec2('+num(x)+','+num(z)+')';
export const REACH_BED_FACIES64_MIX_GLSL=`
vec3 reachFaciesMix64(vec4 pockets,float shallow,float shelf,float domain){
 float fine=clamp(.16+.25*shallow*shelf+.68*pockets.x+.50*pockets.z+.18*pockets.w*shallow,0.,.96);
 float deposit=fine*(1.-smoothstep(.42,.88,pockets.y))*domain;
 float organic=clamp(.36*pockets.z+.42*pockets.w*shallow,0.,.48);
 return vec3(1.-deposit,deposit*(1.-organic),deposit*organic);
}
`;
export const REACH_BED_FACIES64_GLSL=`
uniform float uReachBedFacies64;
uniform float uReachBedFaciesDiagnostic64;
${REACH_BED_FACIES64_MIX_GLSL}
vec3 reachBedWeights64(vec2 world,float clearance,float shoreDistance,float wetness,float slope,float meso,float snow){
 float extent=(1.-smoothstep(19.,22.,distance(world,${vec(...center)})))*smoothstep(${num(lo)},${num(lo+1.5)},world.y)*(1.-smoothstep(${num(hi-1.5)},${num(hi)},world.y));
 float domain=extent*(1.-smoothstep(-.06,0.,shoreDistance))*(1.-smoothstep(0.,.018,clearance))*smoothstep(.25,.7,wetness)*(1.-clamp(snow,0.,1.));
 if(domain<=0.)return vec3(1.,0.,0.);
 vec4 pockets=vec4(0.);vec2 d;float radial,weight;
 ${REACH_BED_FACIES64_PATCHES.map(p=>'d=world-'+vec(p.x,p.z)+';radial=length(vec2(dot(d,'+vec(p.fx,p.fz)+')/'+num(p.along)+',dot(d,'+vec(-p.fz,p.fx)+')/'+num(p.across)+'));weight=1.-smoothstep(.40+(meso-.5)*.08,1.,radial);pockets['+kinds[p.kind]+']=max(pockets['+kinds[p.kind]+'],weight);').join('\n')}
 float shallow=1.-smoothstep(.035,.155,max(0.,-clearance));
 float shelf=1.-smoothstep(.02,.18,slope);
 return reachFaciesMix64(pockets,shallow,shelf,domain);
}
`;
const COLOR='terrainLayeredColor=mix(terrainLayeredColor,reachBedColor41,reachBed41);';
const NORMAL='terrainGradient=mix(terrainGradient,reachGradient41,reachBed41);';
const ROUGH='roughnessFactor=mix(roughnessFactor,mix(terrainReferencesReady>.5?reachScanRough41:.82+reachPebble41.a*.13,.96,reachRoots41),reachTotal41*.7);';
const OPAQUE='#include <opaque_fragment>';
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('Reach bed64 source contract changed: '+anchor);return text.replace(anchor,replacement);}
// Install after createTerrainMaterial()/facies44 and before the first compile.
// Default OFF is dormant: no hook/uniform/key mutation until explicitly enabled.
// After activation, the uniform allows same-compiled-program A/B. dispose restores
// the exact previous hook/key without disposing any borrowed material or texture.
export function installReachBedFacies64(material,{enabled=false}={}){
 if(typeof enabled!=='boolean')throw new TypeError('Expected boolean reach bed64 switch');
 if(installed.has(material))throw Error('Reach bed64 already installed');
 if(material?.userData?.reachSurface41!=='root-organic-facies-v5')throw Error('Adopted surface41 v5 required for reach bed64');
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey;
 const uniform={value:0},diagnostic={value:0};let active=false,disposed=false;
 function hook(shader,...args){
  previous.call(this,shader,...args);
  let text=shader.fragmentShader;
  text=once(text,COLOR,`
vec3 reachMix64=vec3(1.,0.,0.);
float reachBedRough64=terrainReferencesReady>.5?reachScanRough41:.82+reachPebble41.a*.13;
if(uReachBedFacies64>.0 && reachBed41>.0){
 reachMix64=mix(vec3(1.,0.,0.),reachBedWeights64(terrainXZ,vTerrainHydrology.w,vTerrainShoreDistance,terrainWetness,terrainSlope,terrainMeso,terrainSnow),uReachBedFacies64);
 if(reachMix64.y+reachMix64.z>0.){
  // Full original colour and 2.9 m scan remain where coarse substrate is exposed.
  // These new fine surfaces reuse already-filtered physical soil samples.
  vec3 fineMineral64=mix(reachSand41,reachHumus41,.08);
  vec3 fineOrganic64=reachHumus41*(.88+.24*reachGrain41.r);
  reachBedColor41=reachBedColor41*reachMix64.x+fineMineral64*reachMix64.y+fineOrganic64*reachMix64.z;
  reachBedRough64=reachBedRough64*reachMix64.x+(.92+.04*reachGrain41.a)*reachMix64.y+(.95+.03*terrainForestValue.a)*reachMix64.z;
 }
}
${COLOR}`);
  text=once(text,NORMAL,`
if(reachMix64.y+reachMix64.z>0.){
 vec3 fineMineralGradient64=reachSandGradient41;
 vec3 fineOrganicGradient64=vec3(reachGrain41.g,0.,reachGrain41.b)*.12;
 reachGradient41=reachGradient41*reachMix64.x+fineMineralGradient64*reachMix64.y+fineOrganicGradient64*reachMix64.z;
}
${NORMAL}`);
  text=once(text,ROUGH,'roughnessFactor=mix(roughnessFactor,mix(reachBedRough64,.96,reachRoots41),reachTotal41*.7);');
  text=once(text,OPAQUE,'if(uReachBedFacies64>.5 && uReachBedFaciesDiagnostic64>.5 && reachBed41>0.)outgoingLight=reachMix64;\n'+OPAQUE);
  shader.fragmentShader=REACH_BED_FACIES64_GLSL+text;
  shader.uniforms.uReachBedFacies64=uniform;shader.uniforms.uReachBedFaciesDiagnostic64=diagnostic;
 }
 const cache=function(){return key.call(this)+'-'+REACH_BED_FACIES64_REVISION;};
 const owner={uniform,diagnostic,revision:REACH_BED_FACIES64_REVISION,
  setEnabled(value){
   if(disposed||typeof value!=='boolean')throw Error('Expected live boolean reach bed64 switch');
   if(value&&!active){material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;active=true;}
   uniform.value=+value;
  },
  setDiagnostic(value){if(disposed||typeof value!=='boolean')throw Error('Expected live boolean diagnostic switch');diagnostic.value=+value;},
  dispose(){if(disposed)return;disposed=true;uniform.value=diagnostic.value=0;if(active){if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;material.needsUpdate=true;}installed.delete(material);},
 };
 installed.set(material,owner);owner.setEnabled(enabled);return owner;
}
