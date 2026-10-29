// Art handoff only: actual existing meadow fields, no new noise/texture/shadow.
import {MEADOW_PALETTE} from './meadow-surface.js';
const installed=new WeakMap(),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function meadowGroundStructureWeights42(field,footprint,eligible=1){
 const resolved=smooth(.04,.18,footprint)*(1-smooth(1.3,3.,footprint)),maturity=smooth(.50,.78,field[2])*(1-smooth(.60,.86,field[0])),interstice=1-smooth(.30,.58,field[1]*.7+field[3]*.3);
 return{dry:.18*eligible*resolved*maturity*smooth(.28,.70,field[3]),gap:.10*eligible*resolved*interstice*(.35+.65*maturity)};
}

export function meadowFreshStructureWeights42(field,footprint,eligible=1){
 const active=eligible*smooth(.04,.18,footprint)*(1-smooth(1.3,3.,footprint)),fresh=1-smooth(.50,.78,field[2]),cluster=smooth(.28,.68,field[3]*.7+field[0]*.3);
 return{fresh:.32*active*fresh*cluster,gap:.16*active*fresh*(1-cluster),height:.12*active*fresh*(cluster-.5)};
}
export function installMeadowGroundStructure42(material,{enabled=false}={}){
 if(installed.has(material)){const s=installed.get(material);s.setEnabled(enabled);return s;}
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:enabled?1:0},diagnostic={value:0},revision={value:2};
 const anchor='terrainGrassColor*=meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity);',rough='roughnessFactor = clamp(mix(mix(terrainCanopyRoughness,.96,terrainSoilWeight)';
 function hook(shader,...args){previous.call(this,shader,...args);if(!shader.fragmentShader.includes(anchor)||!shader.fragmentShader.includes(rough))throw Error('Meadow ground structure source anchors missing');shader.uniforms.uMeadowGroundStructure42=uniform;shader.uniforms.uMeadowGroundDiagnostic42=diagnostic;shader.uniforms.uMeadowGroundRevision42=revision;
 shader.fragmentShader='uniform float uMeadowGroundStructure42;uniform float uMeadowGroundDiagnostic42;uniform float uMeadowGroundRevision42;\n'+shader.fragmentShader.replace(anchor,anchor+`
// R/B: source moisture/maturity. G/A: source tuft/texture occupancy, NOT shadow.
// Tiny footprints retain the authored near material; unresolved patches filter
// toward the old ground. No camera-centred distance ring is introduced.
float groundStructureDry42=0.,groundStructureGapWeight42=0.;
float groundStructureFresh42=0.,groundStructureHeight42=0.;
float groundStructureEligible42=0.,groundStructureResolved42=0.;
if(uMeadowGroundStructure42>.5||uMeadowGroundDiagnostic42>.5){
 groundStructureEligible42=(1.-terrainForest)*(1.-terrainSnow)*(1.-terrainRockWeight)
  *(1.-terrainBank)*(1.-terrainRiverBed)*(1.-terrainBare)*(1.-terrainOrganicCover);
 groundStructureResolved42=smoothstep(.04,.18,terrainFootprint)*(1.-smoothstep(1.3,3.,terrainFootprint));
 float groundStructureMaturity42=smoothstep(.50,.78,terrainMeadowFeatures.b)*(1.-smoothstep(.60,.86,terrainMeadowFeatures.r));
 float groundStructureGap42=1.-smoothstep(.30,.58,terrainMeadowFeatures.g*.7+terrainMeadowFeatures.a*.3);
 groundStructureDry42=.18*groundStructureEligible42*groundStructureResolved42*groundStructureMaturity42*smoothstep(.28,.70,terrainMeadowFeatures.a);
 vec3 groundDryMaterial42=vec3(${MEADOW_PALETTE.dry.join(',')})*terrainGeographicTint
  *meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity);
 if(uMeadowGroundStructure42>.5)terrainGrassColor=mix(terrainGrassColor,groundDryMaterial42,groundStructureDry42);
 // A small amount of the EXISTING soil material fills source tuft interstices;
 // the same material weight subsequently controls albedo, normal and roughness.
 groundStructureGapWeight42=.10*groundStructureEligible42*groundStructureResolved42*groundStructureGap42*(.35+.65*groundStructureMaturity42)*(1.-terrainSoilWeight);
 if(uMeadowGroundRevision42>1.5){
  // A is the existing roughly 7m material field, modulated by broad moisture.
  // Fresh swards do not require a mature/dry threshold to acquire structure.
  float freshCommunity42=1.-smoothstep(.50,.78,terrainMeadowFeatures.b);
  float freshCluster42=smoothstep(.28,.68,terrainMeadowFeatures.a*.7+terrainMeadowFeatures.r*.3);
  float freshActive42=groundStructureEligible42*groundStructureResolved42*freshCommunity42;
  groundStructureFresh42=.32*freshActive42*freshCluster42;
  groundStructureGapWeight42=mix(groundStructureGapWeight42,.16*groundStructureEligible42*groundStructureResolved42*(1.-freshCluster42)*(1.-terrainSoilWeight),freshCommunity42);
  groundStructureHeight42=.12*freshActive42*(freshCluster42-.5);
  if(uMeadowGroundStructure42>.5)terrainGrassColor=mix(terrainGrassColor,terrainCanopyColor*meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity),groundStructureFresh42);
 }
 if(uMeadowGroundStructure42>.5)terrainSoilWeight+=groundStructureGapWeight42;
}
`).replace(rough,'if(uMeadowGroundStructure42>.5)terrainCanopyRoughness+=groundStructureDry42*.025-groundStructureFresh42*.04;\n'+rough).replace('terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);',`terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);
// Mesoscale material relief uses the already filtered source A/R field, not
// extra noise or a painted lighting term. Real terrain slope remains intact.
vec3 freshGradient42=vec3(0.);
if(abs(terrainDet)>1e-8)freshGradient42=(dFdx(groundStructureHeight42)*terrainR1+dFdy(groundStructureHeight42)*terrainR2)/terrainDet;
if(uMeadowGroundStructure42>.5 && uMeadowGroundRevision42>1.5)terrainGradient+=freshGradient42;`).replace('#include <opaque_fragment>',`
if(uMeadowGroundDiagnostic42>.5){
 if(uMeadowGroundDiagnostic42<1.5)outgoingLight=vec3(groundStructureDry42*16.,groundStructureGapWeight42*16.,groundStructureFresh42*4.);
 else if(uMeadowGroundDiagnostic42<2.5)outgoingLight=terrainMeadowFeatures.rba;
 else outgoingLight=vec3(groundStructureEligible42,groundStructureResolved42,meadowCanopyResolved(terrainFootprint)*(1.-smoothstep(.25,1.7,terrainFootprint)));
}
#include <opaque_fragment>`);
 }
 const state={uniform,diagnostic,revision,setRevision(value){if(value!==1&&value!==2)throw Error('Expected revision 1 or 2');revision.value=value;return value;},setDiagnostic(name){const modes={off:0,weights:1,field:2,filters:3};if(!(name in modes))throw Error('Unknown ground diagnostic');diagnostic.value=modes[name];return name;},setEnabled(value){if(typeof value!=='boolean')throw TypeError('Expected boolean meadow ground structure');uniform.value=value?1:0;return value;},dispose(){if(material.onBeforeCompile===hook){material.onBeforeCompile=previous;material.customProgramCacheKey=key;material.needsUpdate=true;}installed.delete(material);delete material.userData.meadowGroundStructure42;material.removeEventListener('dispose',state.dispose);}};
 material.onBeforeCompile=hook;material.customProgramCacheKey=()=>key.call(material)+'-meadow-ground-structure42-v2';material.userData.meadowGroundStructure42=state;material.addEventListener('dispose',state.dispose);material.needsUpdate=true;installed.set(material,state);return state;
}
