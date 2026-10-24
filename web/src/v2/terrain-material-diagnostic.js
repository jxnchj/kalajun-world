// Browser-only isolation probe; deliberately not imported by production entry.
// Restores the exact original compile hook/key. Never use as a visual fix.
const states=new WeakMap();
export function setTerrainDiagnostic(material,mode='reference'){
  if(!['reference','base-normal','albedo','plain-lit','physical-canopy','neutral-field','neutral-field-r','neutral-field-g','neutral-field-b','neutral-field-a','neutral-vertex','neutral-habitat','neutral-cover','neutral-grass-texture'].includes(mode))throw new Error('Unknown terrain diagnostic');
  let state=states.get(material);
  if(!state){state={compile:material.onBeforeCompile,key:material.customProgramCacheKey};states.set(material,state);}
  if(mode==='reference'){material.onBeforeCompile=state.compile;material.customProgramCacheKey=state.key;}
  else{
    material.customProgramCacheKey=function(){return state.key.call(this)+'-diagnostic-'+mode;};
    material.onBeforeCompile=function(shader,...args){
      state.compile.call(this,shader,...args);
      const replace=(a,b)=>{if(!shader.fragmentShader.includes(a))throw new Error('Missing terrain diagnostic anchor '+a);shader.fragmentShader=shader.fragmentShader.replace(a,b);};
      if(mode==='physical-canopy')replace('terrainGrassColor*=mix(1.,mix(.88,1.06,smoothstep(.24,.76,terrainSward)),\n    terrainSwardWeight*meadowColourResolved(terrainFootprint));','');
      if(mode==='neutral-cover')replace('vec3 terrainBase = mix(', 'terrainRockWeight=0.; terrainSoilWeight=0.;\nvec3 terrainBase = mix(');
      if(mode==='neutral-grass-texture')replace('vec4 terrainSoilValue = terrainSample(', 'terrainGrassValue.r=.5; terrainGrassValue.a=.08;\nvec4 terrainSoilValue = terrainSample(');
      if(mode.startsWith('neutral-field-')){
        const channel=mode.at(-1),value={r:'.4696247624',g:'.5112955131',b:'.5171759512',a:'.4716194153'}[channel];
        const anchor='vec4 terrainMeadowFeatures=meadowCommunityFeatures(meadowFieldAt(terrainXZ),vTerrainCommunity);';
        replace(anchor,anchor+' terrainMeadowFeatures.'+channel+'='+value+';');
      }
      if(mode==='neutral-field')replace('vec4 terrainMeadowFeatures=meadowCommunityFeatures(meadowFieldAt(terrainXZ),vTerrainCommunity);','vec4 terrainMeadowFeatures=vec4(.4696247624,.5112955131,.5171759512,.4716194153);');
      if(mode==='neutral-vertex')replace('vec3 terrainN = normalize(vTerrainWorldNormal);','diffuseColor.rgb=vec3(.122,.188,.063);\nvec3 terrainN = normalize(vTerrainWorldNormal);');
      if(mode==='neutral-habitat')replace('terrainGrassColor*=meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity);','terrainGrassColor*=vec3(1.);');
      if(mode==='base-normal')replace('normal = normalize(mat3(viewMatrix) * terrainPerturbed);','normal = normalize(mat3(viewMatrix) * terrainN);');
      if(mode==='albedo')replace('#include <opaque_fragment>','outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
      if(mode==='plain-lit')replace('#include <roughnessmap_fragment>','diffuseColor.rgb=vec3(.3);\n#include <roughnessmap_fragment>');
    };
  }
  material.needsUpdate=true;material.userData.terrainDiagnostic=mode;return mode;
}
