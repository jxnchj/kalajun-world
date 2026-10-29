import source from './generated/forest-reach-surface41.json' with {type:'json'};
const installed=new WeakMap(),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// Same authored v3 root tongues / quiet-bank groups; no per-root spots or noise.
export const REACH_BANK_GROUPS42=Object.freeze(source.patches.filter(p=>p.kind==='root'||p.kind==='humus').map(p=>Object.freeze({...p,along:p.along*(p.kind==='root'?1.8:2.2),across:p.across*1.75})));
export function reachBankCompositionWeight42(x,z,height,{extent=1,snow=0,mineral=0}={}){let cover=0;for(const p of REACH_BANK_GROUPS42){const dx=x-p.x,dz=z-p.z,r=Math.hypot((dx*p.fx+dz*p.fz)/p.along,(-dx*p.fz+dz*p.fx)/p.across);cover=Math.max(cover,1-smooth(.30,1,r));}return extent*(1-snow)*cover*smooth(-.08,-.015,height)*(1-smooth(.12,.32,height))*(1-smooth(.12,.65,mineral));}
const n=v=>Number(v).toFixed(8),fn=`float reachBankGroupCoverage42(vec2 world){float cover=0.;vec2 d;float radial;
${REACH_BANK_GROUPS42.map(p=>`d=world-vec2(${n(p.x)},${n(p.z)});radial=length(vec2(dot(d,vec2(${n(p.fx)},${n(p.fz)}))/${n(p.along)},dot(d,vec2(${n(-p.fz)},${n(p.fx)}))/${n(p.across)}));cover=max(cover,1.-smoothstep(.30,1.,radial));`).join('\n')}
return cover;}`;
export function installReachBankComposition42(material,{enabled=false}={}){
 if(installed.has(material)){const owner=installed.get(material);owner.setEnabled(enabled);return owner;}
 if(material.userData.reachSurface41!=='root-organic-facies-v5')throw Error('Reach composition requires adopted v3/v5 source');
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:enabled?1:0},diagnostic={value:0};let disposed=false;
 function hook(shader,...args){previous.call(this,shader,...args);const anchor='float reachTotal41=max(reachBed41,reachRoots41);';if(!shader.fragmentShader.includes(anchor)||!shader.fragmentShader.includes('terrainGradient=mix(terrainGradient,terrainForestGradient+terrainReferenceGradient,reachRoots41);'))throw Error('Reach composition source contract changed');
 shader.uniforms.uReachBankComposition42=uniform;shader.uniforms.uReachBankDiagnostic42=diagnostic;
 shader.fragmentShader='uniform float uReachBankComposition42;uniform float uReachBankDiagnostic42;\n'+fn+'\n'+shader.fragmentShader.replace(anchor,`
 float reachBankAdded42=reachExtent41*(1.-terrainSnow)*reachBankGroupCoverage42(terrainXZ)
  *smoothstep(-.08,-.015,vTerrainHydrology.w)*(1.-smoothstep(.12,.32,vTerrainHydrology.w))
  *(1.-smoothstep(.12,.65,max(reachPockets41.x,reachPockets41.y)));
 // Organic material continues from living root shoulders into shallow toes.
 // Preserve the existing two sediment bars and the deep mineral flow bed.
 // The SAME weight feeds existing colour, micro-normal and roughness below.
 if(uReachBankComposition42>.5)reachRoots41=max(reachRoots41,reachBankAdded42);
 ${anchor}`).replace('#include <opaque_fragment>',`if(uReachBankDiagnostic42>.5)outgoingLight=vec3(reachBankAdded42,reachRoots41,reachBed41);\n#include <opaque_fragment>`);
 }
 const cache=function(){return key.call(this)+'-reach-bank-composition42';};material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;
 const owner={uniform,diagnostic,setEnabled(value){if(typeof value!=='boolean')throw TypeError('Expected boolean');if(disposed)throw Error('Disposed composition');uniform.value=+value;return value;},setDiagnostic(value){if(typeof value!=='boolean')throw TypeError('Expected boolean');diagnostic.value=+value;},dispose(){if(disposed)return;disposed=true;if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;material.needsUpdate=true;installed.delete(material);}};installed.set(material,owner);return owner;
}
