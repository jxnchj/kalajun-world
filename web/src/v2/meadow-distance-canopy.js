// Isolated material A/B. Not imported by production until explicitly installed.
// Existing textureGrad/mip/anisotropic filtering remains authoritative. The
// candidate only removes the second, scalar worst-axis fade of meadow canopy
// slope; pigment, cover, geometry, grass roots and all non-meadow relief stay.
const installed=new WeakMap();
export function installMeadowDistanceCanopy(material,{enabled=false}={}){
 if(installed.has(material)){const state=installed.get(material);state.uniform.value=enabled?1:0;return state;}
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:enabled?1:0};
 const state={uniform,setEnabled(value){if(typeof value!=='boolean')throw new TypeError('Meadow canopy toggle expects boolean');uniform.value=value?1:0;return value;},dispose(){if(material.onBeforeCompile===hook){material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;}delete material.userData.meadowDistanceCanopy;installed.delete(material);material.removeEventListener('dispose',state.dispose);}};
 function hook(shader,...args){
  compile.call(this,shader,...args);
  const anchor='terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);';
  if(!shader.fragmentShader.includes(anchor))throw new Error('Meadow canopy source anchor missing');
  shader.uniforms.uMeadowDistanceCanopy=uniform;
  shader.fragmentShader='uniform float uMeadowDistanceCanopy;\n'+shader.fragmentShader.replace(anchor,anchor+`
// Keep old normal exactly at zero; do not reintroduce G as albedo stripes.
if(uMeadowDistanceCanopy>.5 && abs(terrainDet)>1e-8){
 float meadowCanopyRaw=(terrainSward-.5)*.16*terrainSwardWeight;
 float meadowCanopyOld=meadowCanopyRaw*terrainSwardResolved;
 vec3 meadowRawSlope=(dFdx(meadowCanopyRaw)*terrainR1+dFdy(meadowCanopyRaw)*terrainR2)/terrainDet;
 vec3 meadowOldSlope=(dFdx(meadowCanopyOld)*terrainR1+dFdy(meadowCanopyOld)*terrainR2)/terrainDet;
 // Bound shading slope at degenerate grazing pixels. This changes no height.
 meadowRawSlope*=min(1.,.35/max(.000001,length(meadowRawSlope)));
 float meadowLegacyFade=1.-smoothstep(.25,1.7,terrainFootprint);
 float meadowLive=(1.-terrainRiverBed)*(1.-terrainBank)*(1.-terrainSoilWeight);
 terrainGradient+=(meadowRawSlope-meadowOldSlope*meadowLegacyFade)*meadowLive;
}`);
 }
 material.onBeforeCompile=hook;material.customProgramCacheKey=function(){return key.call(this)+'-meadow-distance-canopy-38';};
 material.userData.meadowDistanceCanopy=state;material.addEventListener('dispose',state.dispose);material.needsUpdate=true;installed.set(material,state);return state;
}
