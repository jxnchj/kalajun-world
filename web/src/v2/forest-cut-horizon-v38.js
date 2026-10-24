import * as THREE from 'three';

// Isolated, opt-in material study. No production import, geometry or GI binding
// changes. The source is the pre-incision DEM + authored detail already exposed
// by WorldData, never the final heightAt (which would lose the cut provenance).
export const FOREST_CUT38 = Object.freeze({x:-3611.9813305250705,z:4805.371282289286,span:128,spacing:.25,inner:36,outer:60});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function cutHorizon38({depth,shoreDistance,clearance,forest=1,naturalRock=0,distance=0}) {
  // Thicknesses are authored soil horizons, not a geological measurement.
  // Any existing natural-rock contribution is deliberately outside this study.
  const weight=naturalRock>0?0:(1-smooth(36,60,distance))*forest
    *smooth(.002,.012,depth)*smooth(-.005,.015,shoreDistance)*smooth(-.005,.005,clearance);
  return {weight,face:smooth(.015,.06,depth),mineral:smooth(.08,.22,depth)};
}
export async function buildForestCutField38(surface,{spec=FOREST_CUT38,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}) {
  if(typeof surface?.uncarvedHeightAt!=='function')throw new TypeError('uncarvedHeightAt is required; final terrain is not a substitute');
  if(!(spec.span>0&&spec.spacing>0)||!Number.isInteger(spec.span/spec.spacing))throw new RangeError('Invalid cut field grid');
  const origin={x:Math.floor((spec.x-spec.span/2)/spec.spacing)*spec.spacing,z:Math.floor((spec.z-spec.span/2)/spec.spacing)*spec.spacing};
  const n=spec.span/spec.spacing+1,base=surface.uncarvedHeightAt(spec.x,spec.z),data=new Float32Array(n*n);
  for(let j=0;j<n;j++){
    for(let i=0;i<n;i++){
      const h=surface.uncarvedHeightAt(origin.x+i*spec.spacing,origin.z+j*spec.spacing);
      if(!Number.isFinite(h))throw new RangeError('Nonfinite pre-incision height');
      data[j*n+i]=h-base;
    }
    if(j%16===15)await yieldTask();
  }
  if(!Number.isFinite(base))throw new RangeError('Nonfinite reference height');
  return {spec:{...spec},origin,n,base,data,bytes:data.byteLength};
}
export function sampleForestCutField38(field,x,z){
  const {spec,n,data,base,origin}=field,px=(x-origin.x)/spec.spacing,pz=(z-origin.z)/spec.spacing;
  if(px<0||pz<0||px>n-1||pz>n-1)throw new RangeError('Outside cut field');
  const i=Math.min(n-2,Math.floor(px)),j=Math.min(n-2,Math.floor(pz)),a=px-i,b=pz-j;
  return base+(data[j*n+i]*(1-a)+data[j*n+i+1]*a)*(1-b)+(data[(j+1)*n+i]*(1-a)+data[(j+1)*n+i+1]*a)*b;
}
function once(source,needle,replacement){
  if(source.split(needle).length!==2)throw new Error('Cut horizon shader contract changed: '+needle.slice(0,60));
  return source.replace(needle,replacement);
}
const DECL=`
uniform sampler2D forestCutField38;
uniform vec4 forestCutGrid38;
uniform vec3 forestCutCenter38;
uniform float forestCutEnabled38;
float forestUncarved38(vec2 xz){
 vec2 p=(xz-forestCutGrid38.xy)/forestCutGrid38.z;
 ivec2 i=ivec2(floor(p));vec2 f=fract(p);
 float a=texelFetch(forestCutField38,i,0).r,b=texelFetch(forestCutField38,i+ivec2(1,0),0).r;
 float c=texelFetch(forestCutField38,i+ivec2(0,1),0).r,d=texelFetch(forestCutField38,i+ivec2(1,1),0).r;
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y)+forestCutGrid38.w;
}
`;
const CLASSIFY=`
float forestCutWeight38=0.,forestCutFace38=0.,forestCutMineral38=0.;
float forestCutDistance38=distance(vTerrainWorldPosition.xz,forestCutCenter38.xy);
// The branch protects the texture domain and keeps disabled/outside work at zero.
if(forestCutEnabled38>.5 && forestCutDistance38<60. && terrainForest>0.
 && terrainRockFraction(terrainBare,terrainSlope,vTerrainWorldPosition.y)==0.){
 float cutDepth38=max(0.,forestUncarved38(vTerrainWorldPosition.xz)-vTerrainWorldPosition.y);
 forestCutWeight38=(1.-smoothstep(36.,60.,forestCutDistance38))*terrainForest*(1.-terrainSnow)
  *smoothstep(.002,.012,cutDepth38)*smoothstep(-.005,.015,vTerrainShoreDistance)*smoothstep(-.005,.005,vTerrainHydrology.w);
 forestCutFace38=smoothstep(.015,.06,cutDepth38);
 forestCutMineral38=smoothstep(.08,.22,cutDepth38);
}
// A single material hierarchy: intact litter -> exposed humus -> deeper soil.
// It follows the original surface, not an equal-height stripe along the water.
vec3 forestCutColor38=mix(mix(terrainForestColor,terrainOrganicSoil,forestCutFace38),terrainSoilColor,forestCutMineral38);
terrainLayeredColor=mix(terrainLayeredColor,forestCutColor38,forestCutWeight38);
`;
export function patchForestCutShader38(shader,uniforms){
  let fragment=shader.fragmentShader;
  fragment=once(fragment,'diffuseColor.rgb = mix(terrainLayeredColor,',CLASSIFY+'\ndiffuseColor.rgb = mix(terrainLayeredColor,');
  fragment=once(fragment,'vec3 terrainDX=dFdx(vTerrainWorldPosition),terrainDY=dFdy(vTerrainWorldPosition);',`
vec3 forestCutGradient38=mix(terrainForestGradient+terrainReferenceGradient,terrainSoilGradient,max(forestCutFace38,forestCutMineral38));
terrainGradient=mix(terrainGradient,forestCutGradient38,forestCutWeight38);
vec3 terrainDX=dFdx(vTerrainWorldPosition),terrainDY=dFdy(vTerrainWorldPosition);`);
  fragment=once(fragment,'roughnessFactor = mix(roughnessFactor, 0.84, terrainSnow);',`
float forestCutRoughness38=shoreOrganicRoughness(mix(.97-terrainNeedles*.09-terrainMoss*.04,.96,max(forestCutFace38,forestCutMineral38)),terrainWetness,terrainShoreGrain,vTerrainHydrology.w,vTerrainShoreDistance);
roughnessFactor=mix(roughnessFactor,forestCutRoughness38,forestCutWeight38);
roughnessFactor = mix(roughnessFactor, 0.84, terrainSnow);`);
  shader.fragmentShader=DECL+fragment;Object.assign(shader.uniforms,uniforms);
}
export function installForestCutHorizon38(material,field){
  if(material.userData.forestCutHorizon38)throw new Error('Cut horizon already installed');
  const {spec,n,base,data,origin}=field;
  if(spec.span!==128||spec.spacing!==.25||spec.x!==FOREST_CUT38.x||spec.z!==FOREST_CUT38.z||n!==513||data.length!==n*n)throw new RangeError('Candidate requires the exact representative 128m field');
  const texture=new THREE.DataTexture(data,n,n,THREE.RedFormat,THREE.FloatType);
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  const uniforms={forestCutField38:{value:texture},forestCutGrid38:{value:new THREE.Vector4(origin.x,origin.z,spec.spacing,base)},forestCutCenter38:{value:new THREE.Vector3(spec.x,spec.z,0)},forestCutEnabled38:{value:0}};
  const oldCompile=material.onBeforeCompile,oldKey=material.customProgramCacheKey;
  function compile(shader,renderer){oldCompile.call(this,shader,renderer);patchForestCutShader38(shader,uniforms);}
  function key(){return oldKey.call(this)+'-forest-cut-horizon38-v2';}
  material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;
  let disposed=false;
  const handle={field,uniforms,cost:{bytes:field.bytes,extraSamplers:1,heightFetchesPerEligibleFragment:4,extraDraws:0},setEnabled(value){if(disposed)throw new Error('Disposed cut horizon');if(typeof value!=='boolean')throw new TypeError('Boolean required');uniforms.forestCutEnabled38.value=value?1:0;return value;},dispose(){if(disposed)return;if(material.onBeforeCompile!==compile||material.customProgramCacheKey!==key)throw new Error('Another material hook replaced the candidate; cannot silently overwrite it');material.onBeforeCompile=oldCompile;material.customProgramCacheKey=oldKey;delete material.userData.forestCutHorizon38;material.needsUpdate=true;texture.dispose();disposed=true;}};
  material.userData.forestCutHorizon38=handle;return handle;
}
