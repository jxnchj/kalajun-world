import * as THREE from 'three';
import {FOREST_REACH39_SOURCE as reach} from './forest-reach39-source.js';

// Independent material candidate. The grain source is a photographed analogue,
// not surveyed Kalajun sediment. No geometry, roots, water or height API is changed.
export const REACH_BED_FACIES66_REVISION='reach-bed-facies66-scan-2-signed-constants';
export const REACH_BED_FACIES66_SCAN=Object.freeze({
 id:'gravelly_sand',metres:2.4800000190734863,width:1024,height:1024,
 source:'https://polyhaven.com/a/gravelly_sand',license:'CC0-1.0',
 color:'gravelly_sand_diff_1k.jpg',normalRough:'gravelly_sand_normal_rough_1k.png',
});
const installed=new WeakMap(),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const center=[-3611.98133053,4805.37128229],zs=reach.expected.map(p=>p.z),lo=Math.min(...zs),hi=Math.max(...zs);
// Deliberately not a full-length thalweg stripe. Existing -3 m coarse exposure
// remains exact; the other exposures occupy the inlet, constriction and outlet.
// Sparse root/organic bank overlays continue AFTER this substrate operation.
export const REACH_BED_FACIES66_SCOURS=Object.freeze([
 {id:'inlet-scour',offset:-16,x:-3624.3776550261623,z:4819.001075606458,fx:.6849135879831576,fz:-.728624304423094,along:2.25,across:.62,shift:-.12,curve:.10},
 {id:'retained-gravel',offset:-3,x:-3617.7870346735344,z:4808.221265081592,fx:.30600424558422706,fz:-.9520301474661546,along:2.45,across:.70,shift:0,curve:0},
 {id:'neck-scour',offset:4,x:-3616.5019128874505,z:4801.614799733901,fx:-.21346105705419877,fz:-.976951573580443,along:1.75,across:.48,shift:-.13,curve:-.08},
 {id:'outlet-scour',offset:15.7,x:-3622.3624643086287,z:4791.8661815533305,fx:-.6721302420260135,fz:-.7404329394037334,along:2.30,across:.53,shift:.04,curve:.10},
].map(Object.freeze));
// Actual retained original bank anchors, including identity and physical extent.
// These preserve coarse material near their seat if the existing bed mask reaches
// them; they never create a new material patch on otherwise forest-covered banks.
export const REACH_BED_FACIES66_STONES=Object.freeze([
 {id:'river-41711e76-99c57ca2:859:1',x:-3619.7683489153546,z:4815.091475695066,rot:3.585814623092174,rx:1.1171,rz:.4838},
 {id:'river-41711e76-99c57ca2:862:1',x:-3613.196973900597,z:4803.476410674315,rot:3.5610551529951477,rx:1.0918,rz:.7305},
].map(Object.freeze));
export function reachBedFacies66Coarse(x,z,meso=.5){
 let coarse=0;
 for(const p of REACH_BED_FACIES66_SCOURS){
  const dx=x-p.x,dz=z-p.z,t=(dx*p.fx+dz*p.fz)/p.along;
  const width=p.across*(.36+.64*Math.max(0,1-t*t));
  const across=(-dx*p.fz+dz*p.fx-p.shift-p.curve*t*t-(meso-.5)*.06)/width;
  const w=smooth(-1,-.68,t)*(1-smooth(.68,1,t))*(1-smooth(.42,1,Math.abs(across)));
  coarse=Math.max(coarse,w);
 }
 for(const p of REACH_BED_FACIES66_STONES){
  const dx=x-p.x,dz=z-p.z,c=Math.cos(p.rot),s=Math.sin(p.rot);
  const r=Math.hypot((dx*c-dz*s)/(p.rx+.20),(dx*s+dz*c)/(p.rz+.20));
  coarse=Math.max(coarse,1-smooth(.75,1.30,r));
 }
 return coarse;
}
// Returns [original exposed coarse substrate, new fine mineral scan].
// The same scalar feeds albedo, normal gradient and roughness. No depth cutoff
// turns a quiet deep pool back into a default coarse pavement.
export function reachBedFacies66Mix(coarse,domain,target=[1,0]){
 const fine=(1-Math.max(0,Math.min(1,coarse)))*Math.max(0,Math.min(1,domain));
 target[0]=1-fine;target[1]=fine;return target;
}
export function reachBedFacies66Weights({x,z,clearance,shoreDistance,wetness=1,meso=.5,snow=0},target=[1,0]){
 for(const v of [x,z,clearance,shoreDistance,wetness,meso,snow])if(!Number.isFinite(v))throw TypeError('Finite reach66 inputs required');
 const extent=(1-smooth(19,22,Math.hypot(x-center[0],z-center[1])))*smooth(lo,lo+1.5,z)*(1-smooth(hi-1.5,hi,z));
 // Match the real bed eligibility. Fade just OUTSIDE the shoreline so there is
 // no mandatory coarse ring along both edges. Existing roots/facies44 still win.
 const domain=extent*(1-smooth(0,.08,shoreDistance))*(1-smooth(0,.018,clearance))*smooth(.25,.7,wetness)*(1-Math.max(0,Math.min(1,snow)));
 return reachBedFacies66Mix(reachBedFacies66Coarse(x,z,meso),domain,target);
}
const num=n=>"("+Number(n).toFixed(10)+")",vec=(x,z)=>'vec2('+num(x)+','+num(z)+')';
export const REACH_BED_FACIES66_MIX_GLSL=`
vec2 reachFaciesMix66(float coarse,float domain){
 float fine=(1.-clamp(coarse,0.,1.))*clamp(domain,0.,1.);
 return vec2(1.-fine,fine);
}`;
export const REACH_BED_FACIES66_GLSL=`
uniform float uReachBedFacies66;
uniform float uReachBedDiagnostic66;
uniform float uReachFineLayer66;
${REACH_BED_FACIES66_MIX_GLSL}
vec2 reachBedWeights66(vec2 world,float clearance,float shore,float wetness,float meso,float snow){
 float extent=(1.-smoothstep(19.,22.,distance(world,${vec(...center)})))*smoothstep(${num(lo)},${num(lo+1.5)},world.y)*(1.-smoothstep(${num(hi-1.5)},${num(hi)},world.y));
 float domain=extent*(1.-smoothstep(0.,.08,shore))*(1.-smoothstep(0.,.018,clearance))*smoothstep(.25,.7,wetness)*(1.-clamp(snow,0.,1.));
 if(domain<=0.)return vec2(1.,0.);
 float coarse=0.;vec2 d;float t,width,across,w;
 ${REACH_BED_FACIES66_SCOURS.map(p=>`d=world-${vec(p.x,p.z)};t=dot(d,${vec(p.fx,p.fz)})/${num(p.along)};width=${num(p.across)}*(.36+.64*max(0.,1.-t*t));across=(dot(d,${vec(-p.fz,p.fx)})-${num(p.shift)}-${num(p.curve)}*t*t-(meso-.5)*.06)/width;w=smoothstep(-1.,-.68,t)*(1.-smoothstep(.68,1.,t))*(1.-smoothstep(.42,1.,abs(across)));coarse=max(coarse,w);`).join('\n')}
 ${REACH_BED_FACIES66_STONES.map(p=>`d=world-${vec(p.x,p.z)};w=length(vec2(dot(d,${vec(Math.cos(p.rot),-Math.sin(p.rot))})/${num(p.rx+.20)},dot(d,${vec(Math.sin(p.rot),Math.cos(p.rot))})/${num(p.rz+.20)}));coarse=max(coarse,1.-smoothstep(.75,1.30,w));`).join('\n')}
 return reachFaciesMix66(coarse,domain);
}`;
async function decodePixels(blob){
 const bitmap=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'});
 try{
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(bitmap.width,bitmap.height):Object.assign(document.createElement('canvas'),{width:bitmap.width,height:bitmap.height});
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Reach66 image decoder unavailable');
  context.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,data:new Uint8Array(context.getImageData(0,0,bitmap.width,bitmap.height).data)};
 }finally{bitmap.close();}
}
function aborted(signal){if(signal?.aborted)throw signal.reason??new DOMException('Reach66 aborted','AbortError');}
export async function loadReachBedFacies66Assets({baseURL='./assets/v2/reach-bed-facies66/',signal,fetchImpl=(...args)=>globalThis.fetch(...args),decodeImpl=decodePixels}={}){
 aborted(signal);const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
 const stats={responseBodyBytes:0,decodeMs:0,elapsedMs:0},start=performance.now();
 try{
  const layers=await Promise.all([REACH_BED_FACIES66_SCAN.color,REACH_BED_FACIES66_SCAN.normalRough].map(async name=>{
   const response=await fetchImpl(baseURL+name,{signal:controller.signal});if(!response.ok)throw Error('Reach66 asset HTTP '+response.status+': '+name);
   const blob=await response.blob();stats.responseBodyBytes+=blob.size;const t=performance.now(),p=await decodeImpl(blob);stats.decodeMs+=performance.now()-t;aborted(controller.signal);
   const {width,height}=REACH_BED_FACIES66_SCAN;if(p.width!==width||p.height!==height||p.data?.length!==width*height*4)throw Error('Reach66 scan dimensions mismatch');
   const flipped=new Uint8Array(p.data.length),stride=width*4;
   for(let y=0;y<height;y++)flipped.set(p.data.subarray(y*stride,(y+1)*stride),(height-1-y)*stride);
   return flipped;
  }));
  aborted(signal);stats.elapsedMs=performance.now()-start;
  const asset={width:1024,height:1024,colorPixels:layers[0],normalRoughPixels:layers[1],stats,disposed:false,
   dispose(){if(this.disposed)return;this.disposed=true;this.colorPixels=this.normalRoughPixels=null;}};
  return asset;
 }catch(error){controller.abort(error);throw error;}finally{signal?.removeEventListener('abort',abort);}
}
export function extendReachBedFacies66Scans(color,normal,assets){
 if(assets?.disposed||!assets?.colorPixels||!assets?.normalRoughPixels)throw Error('Live reach66 scan assets required');
 const originals=[color,normal],extras=[assets.colorPixels,assets.normalRoughPixels],textures=[];
 try{
  for(let i=0;i<2;i++){
   const o=originals[i],p=o?.image;
   if(!o?.isDataArrayTexture||p.width!==assets.width||p.height!==assets.height||p.depth!==3||p.data?.length!==assets.width*assets.height*4*3||o.type!==THREE.UnsignedByteType||o.format!==THREE.RGBAFormat)throw Error('Reach66 requires ready original three-layer RGBA8 terrain scans');
   if(extras[i].length!==assets.width*assets.height*4)throw Error('Reach66 pixels mismatch');
   const data=new Uint8Array(p.data.length+extras[i].length);data.set(p.data);data.set(extras[i],p.data.length);
   const t=new THREE.DataArrayTexture(data,p.width,p.height,4);
   for(const k of ['type','format','colorSpace','wrapS','wrapT','minFilter','magFilter','generateMipmaps','anisotropy','flipY','unpackAlignment'])t[k]=o[k];
   t.name=o.name+' + private reach66 mineral scan';t.needsUpdate=true;textures.push(t);
  }
 }catch(error){textures.forEach(t=>t.dispose());throw error;}
 let disposed=false;return {color:textures[0],normal:textures[1],layer:3,
  pixelBytes:textures.reduce((n,t)=>n+t.image.data.byteLength,0),
  dispose(){if(disposed)return;disposed=true;for(const t of textures){t.dispose();t.image.data=null;}}};
}
const COLOR='terrainLayeredColor=mix(terrainLayeredColor,reachBedColor41,reachBed41);';
const NORMAL='terrainGradient=mix(terrainGradient,reachGradient41,reachBed41);';
const ROUGH='roughnessFactor=mix(roughnessFactor,mix(terrainReferencesReady>.5?reachScanRough41:.82+reachPebble41.a*.13,.96,reachRoots41),reachTotal41*.7);';
function once(text,anchor,replacement){if(text.split(anchor).length!==2)throw Error('Reach66 source contract changed: '+anchor);return text.replace(anchor,replacement);}
export function installReachBedFacies66(material,{assets,enabled=false}={}){
 if(typeof enabled!=='boolean')throw TypeError('Expected boolean reach66 switch');
 if(installed.has(material))throw Error('Reach66 already installed');
 if(material?.userData?.reachSurface41!=='root-organic-facies-v5')throw Error('Adopted surface41 v5 required for reach66');
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:0},diagnostic={value:0},layer={value:3};
 let active=false,disposed=false,pair=null,sourceColor=null,sourceNormal=null;
 const stats={revision:REACH_BED_FACIES66_REVISION,privateTextureBytes:0,extraSamplers:0,extraDraws:0};
 function hook(shader,...args){
  previous.call(this,shader,...args);
  const c=shader.uniforms.terrainScanColors?.value,n=shader.uniforms.terrainScanNormals?.value;
  if(shader.uniforms.terrainReferencesReady?.value!==1)throw Error('Await terrain.loadReferences before enabling reach66');
  if(!pair||sourceColor!==c||sourceNormal!==n){
   const next=extendReachBedFacies66Scans(c,n,assets);pair?.dispose();pair=next;sourceColor=c;sourceNormal=n;stats.privateTextureBytes=pair.pixelBytes;
  }
  // These are private uniform objects, not edits of the terrain owner's handles.
  shader.uniforms.terrainScanColors={value:pair.color};shader.uniforms.terrainScanNormals={value:pair.normal};
  shader.uniforms.uReachBedFacies66=uniform;shader.uniforms.uReachBedDiagnostic66=diagnostic;shader.uniforms.uReachFineLayer66=layer;
  let text=shader.fragmentShader;
  text=once(text,COLOR,`
vec2 reachMix66=vec2(1.,0.);
vec3 reachFineGradient66=vec3(0.);
float reachFineRough66=.9;
float reachBedRough66=terrainReferencesReady>.5?reachScanRough41:.82+reachPebble41.a*.13;
if(uReachBedFacies66>.0 && reachBed41>.0){
 reachMix66=mix(vec2(1.,0.),reachBedWeights66(terrainXZ,vTerrainHydrology.w,vTerrainShoreDistance,terrainWetness,terrainMeso,terrainSnow),uReachBedFacies66);
 if(reachMix66.y>0.){
  // A real fine mineral source at its measured scale. Albedo and micro-surface
  // use identical coordinates/derivatives; coarse source keeps its original UV.
  vec2 fineUV66=reachLocal41/${num(REACH_BED_FACIES66_SCAN.metres)}+vec2(.317,.179);
  vec3 fineColor66=textureGrad(terrainScanColors,vec3(fineUV66,uReachFineLayer66),terrainXZDX/${num(REACH_BED_FACIES66_SCAN.metres)},terrainXZDY/${num(REACH_BED_FACIES66_SCAN.metres)}).rgb;
  vec4 fineNR66=textureGrad(terrainScanNormals,vec3(fineUV66,uReachFineLayer66),terrainXZDX/${num(REACH_BED_FACIES66_SCAN.metres)},terrainXZDY/${num(REACH_BED_FACIES66_SCAN.metres)});
  vec3 fineN66=fineNR66.rgb*2.-1.;
  reachFineGradient66=vec3(-fineN66.x,0.,-fineN66.y)/max(.35,fineN66.z);
  reachFineRough66=fineNR66.a;
  reachBedColor41=reachBedColor41*reachMix66.x+fineColor66*reachMix66.y;
  reachBedRough66=reachBedRough66*reachMix66.x+reachFineRough66*reachMix66.y;
 }
}
${COLOR}`);
  text=once(text,NORMAL,'reachGradient41=reachGradient41*reachMix66.x+reachFineGradient66*reachMix66.y;\n'+NORMAL);
  text=once(text,ROUGH,'roughnessFactor=mix(roughnessFactor,mix(reachBedRough66,.96,reachRoots41),reachTotal41*.7);');
  text=once(text,'#include <opaque_fragment>','if(uReachBedFacies66>.5 && uReachBedDiagnostic66>.5 && reachBed41>0.)outgoingLight=vec3(reachMix66.x,reachMix66.y,0.);\n#include <opaque_fragment>');
  shader.fragmentShader=REACH_BED_FACIES66_GLSL+text;
 }
 const cache=function(){return key.call(this)+'-'+REACH_BED_FACIES66_REVISION;};
 const owner={uniform,diagnostic,stats,
  setEnabled(value){
   if(disposed||typeof value!=='boolean')throw Error('Expected live boolean reach66 switch');
   if(value&&!active){if(assets?.disposed||!assets?.colorPixels||!assets?.normalRoughPixels)throw Error('Load live reach66 assets first');material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;active=true;}
   uniform.value=+value;
  },
  setDiagnostic(value){if(disposed||typeof value!=='boolean')throw Error('Expected live boolean diagnostic');diagnostic.value=+value;},
  dispose(){if(disposed)return;disposed=true;uniform.value=diagnostic.value=0;if(active){if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;material.needsUpdate=true;}pair?.dispose();pair=null;stats.privateTextureBytes=0;installed.delete(material);}
 };
 installed.set(material,owner);try{owner.setEnabled(enabled);}catch(error){installed.delete(material);throw error;}return owner;
}
