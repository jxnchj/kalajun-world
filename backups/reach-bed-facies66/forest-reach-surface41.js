import {reachBankDesign50Enabled} from './reach-bank-design50.js';
import {ROOT_FACE50_GLSL,ROOT_FACE50_COLOR,ROOT_FACE50_NORMAL,ROOT_FACE50_ROUGH} from './reach-root-face50.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
import surfaceData from './generated/forest-reach-surface41.json' with {type:'json'};
export const REACH_SURFACE41_REVISION='root-organic-facies-v5';
// Authored depositional pockets, not a claim to surveyed sediment. Distances
// use the existing actual stream stations. All substrate outside them is exact.
export const REACH_SURFACE41_PATCHES=Object.freeze(surfaceData.patches.map(Object.freeze));
const num=n=>Number(n).toFixed(8),vec=v=>'vec2('+v.map(num).join(',')+')';
const index={sand:0,gravel:1,humus:2,root:3};
const reachZ=FOREST_REACH39_SOURCE.expected.map(q=>q.z),reachMinZ=Math.min(...reachZ),reachMaxZ=Math.max(...reachZ);
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function reachSurface41BedMask(x,z,clearance,wetness){return (1-smooth(19,22,Math.hypot(x+3611.98133053,z-4805.37128229)))*smooth(reachMinZ,reachMinZ+1.5,z)*(1-smooth(reachMaxZ-1.5,reachMaxZ,z))*(1-smooth(.035,.10,clearance))*smooth(.25,.7,wetness)*(1-smooth(0,.018,clearance));}

// The same authored root/pool footprints follow the actual v3 bank, rather
// than applying a uniform material strip at a fixed waterline elevation.
export function reachSurface41OrganicWeight(x,z,clearance,meso=.5){
 let root=0,humus=0;
 for(const p of REACH_SURFACE41_PATCHES){if(p.kind!=='root'&&p.kind!=='humus')continue;const dx=x-p.x,dz=z-p.z,radial=Math.hypot((dx*p.fx+dz*p.fz)/p.along,(-dx*p.fz+dz*p.fx)/p.across),w=1-smooth(.38+meso*.16,1,radial);if(p.kind==='root')root=Math.max(root,w);else humus=Math.max(humus,w);}
 const extent=(1-smooth(19,22,Math.hypot(x+3611.98133053,z-4805.37128229)))*smooth(reachMinZ,reachMinZ+1.5,z)*(1-smooth(reachMaxZ-1.5,reachMaxZ,z));
 return extent*Math.max(root,humus*.92)*smooth(-.11,-.025,clearance)*(1-smooth(.12,.32,clearance));
}

export function reachSurface41Enabled(){const p=new URLSearchParams(globalThis.location?.search||'');return p.get('forestReach39')!=='0'&&p.get('forestReachForm41')!=='0'&&p.get('forestReachSurface41')!=='0';}
export const REACH_SURFACE41_GLSL=`
vec4 reachSedimentPockets41(vec2 world,float meso){
 vec4 cover=vec4(0.);if(distance(world,vec2(-3611.98133053,4805.37128229))>22.)return cover;
 vec2 d;float radial,weight;
 ${REACH_SURFACE41_PATCHES.map(p=>`d=world-${vec([p.x,p.z])};radial=length(vec2(dot(d,${vec([p.fx,p.fz])})/${num(p.along)},dot(d,${vec([-p.fz,p.fx])})/${num(p.across)}));weight=1.-smoothstep(.38+meso*.16,1.,radial);cover[${index[p.kind]}]=max(cover[${index[p.kind]}],weight);`).join('\n')}
 return cover;
}
`;
export function installReachSurface41(material,{enabled=reachSurface41Enabled()}={}){
 if(!enabled)return material;
 const face50=reachBankDesign50Enabled();
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,...args){compile.call(this,shader,...args);shader.fragmentShader=(face50?ROOT_FACE50_GLSL:'')+REACH_SURFACE41_GLSL+shader.fragmentShader;
 const color='diffuseColor.rgb = mix(terrainLayeredColor, terrainBase * (0.96 + terrainGrassValue.r * 0.08), terrainSnow);';
 if(!shader.fragmentShader.includes(color))throw Error('Reach surface41 terrain contract changed');
 shader.fragmentShader=shader.fragmentShader.replace(color,`
 vec4 reachPockets41=reachSedimentPockets41(terrainXZ,terrainMeso);
 // Replace the continuous bed itself, not just isolated coloured islands.
 // Eligibility stays at the real wetted bed and very low adjoining soil.
 vec2 reachLocal41=terrainXZ-vec2(-3611.98133053,4805.37128229);
 float reachExtent41=(1.-smoothstep(19.,22.,length(reachLocal41)))*smoothstep(${num(reachMinZ)},${num(reachMinZ+1.5)},terrainXZ.y)*(1.-smoothstep(${num(reachMaxZ-1.5)},${num(reachMaxZ)},terrainXZ.y));
 float reachDomain41=reachExtent41*(1.-smoothstep(.035,.10,vTerrainHydrology.w))*smoothstep(.25,.7,terrainWetness)*(1.-terrainSnow);
 float reachBed41=reachDomain41*(1.-smoothstep(0.,.018,vTerrainHydrology.w));
 // Mineral deposits continue onto local low bars; the waterline itself is not
 // a universal material seam. Rooted lobes retain organic ground between bars.
 float reachDryDeposit41=reachExtent41*max(reachPockets41.x,reachPockets41.y)*(1.-smoothstep(.04,.14,vTerrainHydrology.w))*smoothstep(.02,.35,terrainWetness)*(1.-terrainSnow);
 reachBed41=max(reachBed41,reachDryDeposit41);
 float reachDeposit41=.5;
 if(reachDomain41>0.)reachDeposit41=terrainNoise(reachLocal41*.43+vec2(terrainMeso*.6,0.));
 // Metre-scale facies share a filtered source. Their boundaries are not a
 // second bank stripe, and no sun direction or baked dark spot enters albedo.
 float reachSandShare41=clamp(.25+.70*reachDeposit41+reachPockets41.x*.35-reachPockets41.y*.3,0.,1.);
 float reachHumusShare41=reachPockets41.z*.12;
 // Root tongues and quiet organic banks reach through the shallow waterline.
 // A steep living root face must not disappear through a flat-slope gate.
 // Deep flowing gravel and the distinct sand bars remain mineral substrates.
 float reachRoots41=reachExtent41*max(reachPockets41.w,reachPockets41.z*.92)
   *smoothstep(-.11,-.025,vTerrainHydrology.w)*(1.-smoothstep(.12,.32,vTerrainHydrology.w))*(1.-terrainSnow);
 vec4 reachGrain41=terrainSoilValue;
 // Explicit derivatives were computed above the divergent domain branch.
 if(reachDomain41>0.)reachGrain41=terrainSampleGrad(1.,terrainXZ/.85+vec2(.27,.61),.43,terrainXZDX/.85,terrainXZDY/.85);
 // Reuse the packed physical rock source at sediment scale instead of
 // the surrounding four-metre bedrock scale. Normal/roughness use the same
 // filtered grains, so particles have relief under the actual moving light.
 vec4 reachPebble41=terrainRockValue;
 if(reachDomain41>0.)reachPebble41=terrainSampleGrad(2.,terrainXZ/.32+vec2(.13,.71),.43,terrainXZDX/.32,terrainXZDY/.32);
 vec3 reachSand41=mix(vec3(.13,.101,.062),vec3(.25,.198,.124),reachGrain41.r);
 vec3 reachGravel41=mix(vec3(.075,.087,.071),vec3(.22,.207,.163),reachPebble41.r);
 vec3 reachHumus41=mix(vec3(.080,.057,.032),vec3(.13,.102,.057),terrainForestValue.r);
 vec3 reachBedColor41=mix(mix(reachGravel41,reachSand41,reachSandShare41),reachHumus41,reachHumusShare41);
 vec3 reachScanSlope41=vec3(0.);float reachScanRough41=.9;
 if(reachBed41>0.&&terrainReferencesReady>.5){
  // Photograph-derived CC0 sediment, calibrated to its 2.9 m scan extent.
  // Reuse existing texture-array samplers; no additional shadow sampler cost.
  vec2 scanUV41=reachLocal41/2.9+vec2(.173,.481);
  vec3 scanColor41=textureGrad(terrainScanColors,vec3(scanUV41,2.),terrainXZDX/2.9,terrainXZDY/2.9).rgb;
  vec4 scanNormalRough41=textureGrad(terrainScanNormals,vec3(scanUV41,2.),terrainXZDX/2.9,terrainXZDY/2.9);
  vec3 scanNormal41=scanNormalRough41.rgb*2.-1.;
  float silt41=smoothstep(.68,.98,reachSandShare41)*.72;
  reachBedColor41=mix(scanColor41,reachSand41,silt41);
  reachBedColor41=mix(reachBedColor41,reachHumus41,reachHumusShare41);
  reachScanSlope41=vec3(-scanNormal41.x,0.,-scanNormal41.y)/max(.35,scanNormal41.z)*(1.-silt41);
  reachScanRough41=mix(scanNormalRough41.a,.94,silt41);
 }
 // Use the surrounding photographed forest soil and its real micro-normal,
 // not a dark colour overlay on the unchanged mineral normal map.
 float reachOrganicDry41=smoothstep(-.025,.065,vTerrainHydrology.w);
 vec3 reachOrganic41=mix(reachHumus41,terrainForestColor,reachOrganicDry41);
 reachOrganic41=mix(reachOrganic41,terrainMossColor,reachPockets41.w*reachOrganicDry41*.16);
 ${face50?ROOT_FACE50_COLOR:''}
 float reachTotal41=max(reachBed41,reachRoots41);
 terrainLayeredColor=mix(terrainLayeredColor,reachBedColor41,reachBed41);
 terrainLayeredColor=mix(terrainLayeredColor,reachOrganic41,reachRoots41);
 ${color}`);
 const gradient='terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);';
 shader.fragmentShader=shader.fragmentShader.replace(gradient,`
 vec3 reachSandGradient41=vec3(reachGrain41.g,0.,reachGrain41.b)*.24;
 vec3 reachGradient41=mix(vec3(reachPebble41.g,0.,reachPebble41.b)*.75,reachSandGradient41,reachSandShare41);
 reachGradient41=mix(reachGradient41,terrainForestGradient*.45,reachHumusShare41);
 if(terrainReferencesReady>.5)reachGradient41=reachScanSlope41;
 terrainGradient=mix(terrainGradient,reachGradient41,reachBed41);
 terrainGradient=mix(terrainGradient,terrainForestGradient+terrainReferenceGradient,reachRoots41);
 ${face50?ROOT_FACE50_NORMAL:''}
 ${gradient}`);
 const rough='roughnessFactor = mix(roughnessFactor, 0.84, terrainSnow);';
 shader.fragmentShader=shader.fragmentShader.replace(rough,`roughnessFactor=mix(roughnessFactor,mix(terrainReferencesReady>.5?reachScanRough41:.82+reachPebble41.a*.13,.96,reachRoots41),reachTotal41*.7);\n${face50?ROOT_FACE50_ROUGH:''}\n${rough}`);
 };
 material.customProgramCacheKey=function(){return key.call(this)+'-'+REACH_SURFACE41_REVISION+(face50?'-root-face50':'');};material.userData.reachSurface41=REACH_SURFACE41_REVISION;if(face50)material.userData.reachRootFace50=true;return material;
}
