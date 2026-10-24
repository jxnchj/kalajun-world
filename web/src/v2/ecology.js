import {ReachBankCover39} from './forest-reach-cover39.js';
import {createForestReachCommunity39} from './forest-reach-community39.js';
import {brookGrassIntersectsWater} from './brook-shoulder-grass.js';
import {BoardwalkPlantContact39} from './boardwalk-plant-contact39.js';
import {seatForestShoulderRoot} from "./forest-bank-shoulder.js";
import {TreeRootOrder} from './tree-root-order.js';
import {EarlyTreeTextures} from './early-tree-textures.js';
import {riverSectionAt} from './river-section.js';
import {valleyBankContext} from './valley-bank-roots.js';
import {SpruceSharedImages} from "./spruce-shared-images.js";
import {MeadowRootCache} from "./meadow-root-cache.js";
import {SpruceMiddleBatched} from "./spruce-middle-batched.js";
import {CrownRootMask} from "./crown-root-mask.js";
import {visualDelta} from './visual-time.js';
import {createBrookWetAsset,forestCurvatureNeedsBladeSeat,createBrookWetBatch,installBrookWetBatchMaterial,refreshBrookWetContact} from "./brook-wetgrass.js";
import {brookShoulderSuitable,valleyShoulderSuitable,valleySourceExcluded,grassStemFeet,seatBrookShoulderGrass} from "./brook-shoulder-grass.js";
import {cellRandom,createForestExclusionIndex,rootExcluded,originalForestRoot} from "./forest-root-source.js";
export {cellRandom};
import {installTreeWorldFrustum} from "./tree-world-frustum.js";
import {createTreeShadowIndex,installTreeShadowIndex} from "./tree-shadow-index.js";
import {WorldBoundsCache,worldBoundsCacheControl} from "./world-bounds-cache.js";
import {ThresholdPlantField} from "./threshold-plants.js";
import {prepareTreeWindCoefficients,installTreeWindCoefficients,updateTreeWindCoefficientPhase} from "./tree-wind-coefficients.js";
import {installTreeViewBatch} from "./tree-view-batches.js";
import {installTreeFrustumCull} from "./tree-frustum-cull.js";
import {loadWorldGLB} from "./glb-transport.js";
import {loadEcologySources} from "./ecology-loading.js";
import {loadSpruceCanopyCache,canopyFallback} from "./spruce-canopy-cache.js";
import {canopyCacheMode,loadLocalSpruceCanopyCache,LocalCanopyCapture} from "./spruce-canopy-local.js";
import {installSpruceBranchPhotos} from "./spruce-branch-detail.js";
import * as THREE from "three";
import { bindMeadowField, MEADOW_SURFACE_GLSL, MEADOW_FIELD_GLSL, meadowWorldVariation, meadowLandformVariation, MEADOW_LANDFORM_GLSL, meadowCommunityVariation, MEADOW_COMMUNITY_GLSL } from "./meadow-surface.js";
import { GrassRootField, createGrassFieldGeometry, disposeGrassFieldGeometry, markGrassFieldRendered } from "./grass-root-field.js";
import { createSpruceLoader, SpruceGeometryPool, spruceGeometryContainer } from "./spruce-loading.js";
import { treeVertexLayoutEnabled, interleaveTreeVertices } from "./tree-vertex-layout.js";
import { loadSpruceRecipe } from "./spruce-recipe.js";
import {loadGpuSpruceRecipe,loadGpuSpruceRecipeData} from "./spruce-gpu-loading.js";
import {createStationGeometry,installGpuNeedleStations,SpruceGpuStationBrushes} from "./spruce-gpu-stations.js";
import {createGpuBrushTables,createGpuBrushTemplate,installGpuBrush,SpruceGpuBrushes} from "./spruce-gpu-brush.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {loadHabitatMap} from "./habitat-loading.js";
export {decodeHabitatMap} from "./habitat-data.js";
import { MeadowWindField } from "./wind-field.js";
import { SpruceRootWind, disposeTreeWindGeometry } from "./spruce-wind.js";
import { configureSpruceMaterial, installNeedleSurface } from "./spruce-material.js";
import { reuseNeedleTextures } from "./spruce-textures.js";
import { applySpruceVolume, createFarSpruceVolumeGeometry, spruceVolumeEnabled } from "./spruce-volume.js";
import { createFarTreeBatch, disposeFarTreeBatch } from "./far-tree-batches.js";
import { loadFarSpruceAssets, createFarSpruceImpostorGeometry, setFarSpruceImpostorAttributes, installFarSpruceImpostor } from "./spruce-far-impostor.js";
import { installFarSpruceShape, installCrownOcclusion } from "./spruce-geometry.js";
import { ForestFloor } from "./forest-floor.js";
import { ForestRootLayout, forestLayoutMode } from "./forest-root-layout.js";
import { ForestRootCache } from "./forest-root-cache.js";
import {createPlantEnvelope,getShoreStoneField,relocateShorePlant,releaseShoreStoneField,SHORE_PLANT_MAX_SHIFT} from "./shore-contact.js";


const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };
export const MEADOW = Object.freeze({ tile: 24, cell: .8, nearStart: 23, nearEnd: 33, farStart: 62, farEnd: 78, nearPrefetch: 58, flowerRange: 42, flowerNearStart: 11, flowerNearEnd: 17, flowerNearPrefetch: 23 });
// Explicit reference candidate; only ordinary middle grass uses this range.
export function meadowSourceRange39(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('meadowSourceRange39')==='1'?{enabled:true,farStart:120,farEnd:140}:{enabled:false,farStart:62,farEnd:78};
}
export function installMeadowSourceRange39(material,range){
  if(!range.enabled)return material;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    const early='vPlantDistance<=23. || vPlantDistance>=78.',fade='smoothstep(62.,78.,vPlantDistance)';
    if(!shader.vertexShader.includes(early)||!shader.fragmentShader.includes(fade))throw new Error('Middle grass source range hook changed');
    shader.vertexShader=shader.vertexShader.replace(early,'vPlantDistance<=23. || vPlantDistance>=140.');
    shader.fragmentShader=shader.fragmentShader.replace(fade,'smoothstep(120.,140.,vPlantDistance)');
  };
  material.customProgramCacheKey=()=>key()+'-source-range39-120-140';
  return material;
}

const NAMES = ["column", "edge", "old", "pencil", "young"];
export const TREE_NEEDLES=Object.freeze({mode:12,start:9,end:15,prefetch:28});
// Spatial submission only: this does not change resident roots or visual LODs.
export const TREE_BATCH_SIZE=96;
export const treeBatchKey=(x,z,size=TREE_BATCH_SIZE)=>Math.floor(x/size)+","+Math.floor(z/size);
const treeBatchSizeFromURL=()=>new URLSearchParams(globalThis.location?.search||"").get("treeBatchSize")==="64"?64:TREE_BATCH_SIZE;
// CPU submission follows the SAME main-viewer LOD as the colour/depth shaders.
// Quantize roots/viewer as uniforms and instance matrices do. A 0.1 mm guard
// retains the few borderline float32 cases; it does not move the visual fades.
export function treeLodMayContribute(mode,root,viewer) {
  const d=Math.hypot(Math.fround(root.x)-Math.fround(viewer.x),Math.fround(root.z)-Math.fround(viewer.z));
  if(mode===TREE_NEEDLES.mode)return d<TREE_NEEDLES.end+.0001;
  if(mode===5)return d>TREE_NEEDLES.start-.0001&&d<62.0001;
  if(mode===1)return d>41.9999&&d<235.0001;
  throw new RangeError("Only needle/high/middle tree LODs have resident batches");
}

const WIND = `
uniform float uWindTime;
#ifdef ECO_ROOT_WIND
attribute vec4 aTreeRootWind;attribute float aTreeRootEddy;
#endif
uniform vec3 uWorldViewer;
uniform float uPlantRange;
varying float vPlantDistance;
#if defined(ECO_HERB) || defined(ECO_TREE)
attribute vec3 aPlantWind;
#endif
uniform sampler2D uWindPrevious;
uniform sampler2D uWindCurrent;
uniform vec2 uWindFieldOrigin;
uniform float uWindFieldSpan;
uniform float uWindFieldBlend;
float ecoHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
vec4 ecoField(vec2 p, float t) {
  vec2 uv=(p-uWindFieldOrigin)/uWindFieldSpan;
  // Outside the local texture, retain a cheap WORLD-position-dependent field.
  // An edge blend keeps far trees moving independently instead of clamping them to one border texel.
  float phase=dot(p,vec2(.023,.017))-t*.4;
  vec4 distant=vec4(.38+.12*sin(phase),.38+.12*sin(phase+.168),.5+.25*sin(phase*.7),.5);
  float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
  if(edge<=0.) return distant;
  vec4 local=mix(texture2D(uWindPrevious,uv),texture2D(uWindCurrent,uv),uWindFieldBlend);
  return mix(distant,local,smoothstep(0.,.08,edge));
}
vec3 ecoRoot() {
  #ifdef USE_INSTANCING
    return instanceMatrix[3].xyz;
  #else
    return vec3(0);
  #endif
}
vec2 ecoBend(float y, vec3 weights, vec3 root) {
  if(uPlantMode>9.5 && uPlantMode<11.5)return vec2(0.);
  float seed=ecoHash(floor(root.xz*.71)+13.);
  float flex=mix(.68,1.25,seed);
  float t=uWindTime;
#ifdef ECO_ROOT_WIND
  vec4 field=vec4(aTreeRootWind.zw,aTreeRootEddy+.5,.5);
  vec2 direction=aTreeRootWind.xy;
#else
  vec4 field=ecoField(root.xz,t);
  vec2 direction=normalize(vec2(.82,.36)+vec2(-.36,.82)*(field.a-.5)*.5);
#ifdef USE_INSTANCING
  direction=vec2(dot(direction,normalize(instanceMatrix[0].xz)),dot(direction,normalize(instanceMatrix[2].xz)));
#endif
#endif
  float current=mix(field.r,field.g,weights.x*.48);
  float previous=field.g;
  float returning=(current-previous)*.32;
  float eddy=field.b-.5;
  if(uPlantMode<1.5 || (uPlantMode>4.5 && uPlantMode<5.5) || uPlantMode>11.5) {
    float h=min(max(y,0.),20.);
    vec2 trunk=direction*(current+returning)*h*h*.0014;
#ifdef ECO_TREE
    float branch=weights.y*(sin(t*.85+weights.z)*.018+(previous-current)*.12);
    trunk+=direction*branch+vec2(-direction.y,direction.x)*eddy*weights.y*.018;
#endif
    return trunk;
  }
  float local=sin(t*(.7+seed*.7)+fract(weights.z)*4.+seed*10.)*.5;
  float weight=weights.x*weights.x;
  // Shared gust; blade/flower flexibility and delayed upper response differ per individual.
  float lean=(current+returning)*.23*flex;
  if(uPlantMode>7.5 && uPlantMode<8.5)lean*=.50;
  float head=((field.g-current)*.10+local*.012*sqrt(current))*weights.y;
  return direction*(lean*weight+head)+vec2(-direction.y,direction.x)*eddy*.045*weight*flex;
}
`;
function windCode() {
  return `
transformed.xz += ecoOffset;
if(uPlantMode>1.5 && uPlantMode<11.5 && (uPlantMode<4.5 || uPlantMode>5.5)) transformed.y-=dot(ecoOffset,ecoOffset)*.55;
#ifdef ECO_HERB
// Sparse seed stalks use the same fixed root selection in colour and shadow passes.
if((uPlantMode>1.5 && uPlantMode<2.5 || uPlantMode>3.5 && uPlantMode<4.5) && aPlantWind.z>1. && ecoHash(floor(ecoRoot().xz*.71)+13.)>.14) transformed=vec3(0.);
#endif
`;
}
// Only reject roots for which the existing dither rejects EVERY threshold n in [0,1).
// Far trees deliberately retain the legacy n>fade outer endpoint: n=0 can survive there.
const PLANT_EARLY_CULL=Object.freeze([
  "vPlantDistance<=165.",
  "vPlantDistance<=42. || vPlantDistance>=235.",
  "vPlantDistance>=33.",
  "vPlantDistance>=17.",
  "vPlantDistance<=23. || vPlantDistance>=78.",
  `vPlantDistance<=${TREE_NEEDLES.start.toFixed(1)} || vPlantDistance>=62.`,
  "vPlantDistance<=11. || vPlantDistance>=42.",
  "vPlantDistance>=25.",
  "vPlantDistance>=110.",
  "vPlantDistance>=78.",
  "vPlantDistance>=110.",
  "vPlantDistance>=65.",
  `vPlantDistance>=${TREE_NEEDLES.end.toFixed(1)}`,
]);
export function attachEcologyWind(material, uniforms, mode, herb = false, tree = false) {
  if(!Number.isInteger(mode)||mode<0||mode>=PLANT_EARLY_CULL.length)throw new RangeError("Unknown plant LOD mode");
  const modeConstant="const float uPlantMode="+mode.toFixed(1)+";\n";
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = (herb ? "#define ECO_HERB\n" : "") + (tree ? "#define ECO_TREE\n" : "") + modeConstant + WIND + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("void main() {", `void main() {
vPlantDistance=distance(ecoRoot().xz,uWorldViewer.xz);
// ECO_LOD_EARLY_BEGIN
if (${PLANT_EARLY_CULL[mode]}) {
  // Every vertex in this instance shares the root distance; no visible varying is skipped.
  gl_Position=vec4(2.,2.,2.,1.);
  return;
}
// ECO_LOD_EARLY_END
vec3 ecoWeights=vec3(clamp(position.y,0.,1.),0.,0.);
#if defined(ECO_HERB) || defined(ECO_TREE)
ecoWeights=aPlantWind;
#endif
// Compute the force once: colour normals and shadow geometry share the same offset.
vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());
`);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n"+windCode());
    // Carry bending into PBR normals as well as the shadow silhouette.
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
vec2 ecoSlope=ecoOffset*2./max(.15,position.y);
objectNormal=normalize(vec3(objectNormal.x,objectNormal.y-dot(ecoSlope,objectNormal.xz),objectNormal.z));
`);
    shader.fragmentShader = modeConstant + "uniform float uPlantRange; varying float vPlantDistance;\n"+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
float n=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
float needleTree=1.-smoothstep(${TREE_NEEDLES.start.toFixed(1)},${TREE_NEEDLES.end.toFixed(1)},vPlantDistance);
float nearTree=1.-smoothstep(42.,62.,vPlantDistance);
float middleTree=1.-smoothstep(165.,235.,vPlantDistance);
float nearGrass=1.-smoothstep(23.,33.,vPlantDistance);
float nearFlower=1.-smoothstep(11.,17.,vPlantDistance);
// Each tree/grass transition partitions one threshold; overlapping LODs never double coverage.
if(uPlantMode<.5) { if(n<middleTree || n>1.-smoothstep(uPlantRange-220.,uPlantRange,vPlantDistance)) discard; }
else if(uPlantMode<1.5) { if(n<nearTree || n>=middleTree) discard; }
else if(uPlantMode<2.5) { if(n>=nearGrass) discard; }
else if(uPlantMode<3.5) { if(n>=nearFlower) discard; }
else if(uPlantMode<4.5) { if(n<nearGrass || n>=1.-smoothstep(62.,78.,vPlantDistance)) discard; }
else if(uPlantMode<5.5) { if(n<needleTree || n>=nearTree) discard; }
else if(uPlantMode<6.5) { if(n<nearFlower || n>=1.-smoothstep(31.,42.,vPlantDistance)) discard; }
else if(uPlantMode<7.5) { if(n>=1.-smoothstep(17.,25.,vPlantDistance)) discard; }
else if(uPlantMode<8.5) { if(n>=1.-smoothstep(75.,110.,vPlantDistance)) discard; }
else if(uPlantMode<9.5) { if(n>=1.-smoothstep(50.,78.,vPlantDistance)) discard; }
else if(uPlantMode<10.5) { if(n>=1.-smoothstep(80.,110.,vPlantDistance)) discard; }
else if(uPlantMode<11.5) { if(n>=1.-smoothstep(42.,65.,vPlantDistance)) discard; }
else { if(n>=needleTree) discard; }`);
  };
  material.customProgramCacheKey = () => "kalajun-ecology-wind-6-needle-"+mode+"-"+herb+"-"+tree;
  return material;
}
function depthFor(material, uniforms, mode, herb = false, tree = false) {
  const depth=new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tree&&material.alphaTest===0?null:material.map,
    alphaMap: tree&&material.alphaTest===0?null:material.alphaMap,
    alphaTest: material.alphaTest, side: material.side,
  });
  if(tree&&material.defines?.ECO_ROOT_WIND!==undefined)depth.defines={...depth.defines,ECO_ROOT_WIND:""};
  return attachEcologyWind(depth, uniforms, mode, herb, tree);
}

// Every leaf retains its root, tip, colour and wind identity at both levels.
// Middle distance reduces curve tessellation, never the tuft's blade coverage.
export function meadowGeometry(near = true) {
  const positions=[], colours=[], uv=[], weights=[], indices=[];
  const count=24;
  for(let b=0;b<count;b++) {
    const segments=near?5:b<8?2:1;
    const seed=cellRandom(b,63,2),angle=b*2.399963, dry=cellRandom(b,45,6)>.94;
    const h=(b<8?.42:.22)+cellRandom(b,8,2)*(b<8?.40:.32),width=.012+cellRandom(b,9,2)*.023;
    const arch=.23+cellRandom(b,17,4)*.39,rx=(cellRandom(b,81,2)-.5)*.62,rz=(cellRandom(b,83,2)-.5)*.62;
    const tint=new THREE.Color(dry?"#928754":b%3===0?"#63853c":b%3===1?"#507638":"#738e42");
    const base=positions.length/3;
    for(let j=0;j<=segments;j++) {
      const t=j/segments,profile=Math.pow(Math.max(0,1-t),.68),w=width*profile*.5;
      const twist=angle+Math.PI/2+Math.sin(t*2.7+seed*3)*t*.55,drop=.13+seed*.18;
      const x=rx+Math.cos(angle)*arch*t*t,z=rz+Math.sin(angle)*arch*t*t;
      for(const side of [-1,1]) {
        positions.push(x+Math.cos(twist)*w*side,h*(t-drop*t*t*t)+Math.sin(twist-angle)*w*side*.16,z+Math.sin(twist)*w*side);
        uv.push(side*.5+.5,t);
        const shade=.58+.42*Math.pow(t,.52);colours.push(tint.r*shade,tint.g*shade,tint.b*shade);
        weights.push(t*(dry?.65:1),b<8?.18:.05,seed);
      }
      if(j<segments){const k=base+j*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
  }
  // Fourteen percent of roots keep this geometric stalk and three-sided seed head.
  // The same seed and geometry are present at both LODs; other roots collapse it in the shader.
  const stem=positions.length/3;
  for(const [x,y,z] of [[-.002,0,0],[.002,0,0],[-.006,.9,.02],[.006,.9,.02]]) {
    positions.push(x,y,z);uv.push(0,y);const c=new THREE.Color("#9d9963");colours.push(c.r,c.g,c.b);weights.push(y,.16,1.61);
  }
  indices.push(stem,stem+1,stem+2,stem+1,stem+3,stem+2);
  for(let q=0;q<3;q++) {
    const angle=q*Math.PI*2/3,base=positions.length/3,h=.99;
    for(const [r,y] of [[.003,h-.14],[.018,h-.06],[.002,h+.02]]) {
      positions.push(Math.cos(angle)*r,y,.02+Math.sin(angle)*r);uv.push(0,0);
      const c=new THREE.Color("#aea275");colours.push(c.r,c.g,c.b);weights.push(y,.45,1.61);
    }
    indices.push(base,base+1,base+2);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(colours,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute("aPlantWind",new THREE.Float32BufferAttribute(weights,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
// A separate low canopy closes gaps between tall stems without multiplying the distant meadow.
export function basalGrassGeometry() {
  const pos=[],col=[],wind=[],uv=[],indices=[];
  for(let b=0;b<40;b++){
    const a=b*2.399963,height=.15+cellRandom(b,71,2)*.25,arch=.25+cellRandom(b,72,2)*.36;
    const rx=(cellRandom(b,73,2)-.5)*.78,rz=(cellRandom(b,74,2)-.5)*.78,width=.018+cellRandom(b,75,2)*.029;
    const dry=cellRandom(b,76,2)>.92,color=new THREE.Color(dry?"#81794e":b%2?"#426e32":"#5c7e39"),base=pos.length/3;
    for(let j=0;j<=3;j++){
      const t=j/3,w=width*Math.pow(1-t*.98,.8)*.5,x=rx+Math.cos(a)*arch*t*t,z=rz+Math.sin(a)*arch*t*t,y=height*Math.sin(t*Math.PI*.68);
      for(const side of [-1,1]){
        pos.push(x-Math.sin(a)*w*side,y,z+Math.cos(a)*w*side);uv.push(side*.5+.5,t);
        const shade=.58+.42*Math.pow(t,.5);col.push(color.r*shade,color.g*shade,color.b*shade);wind.push(t*.60,.08,cellRandom(b,77,2));
      }
      if(j<3){const k=base+j*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setAttribute("aPlantWind",new THREE.Float32BufferAttribute(wind,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function installGrassSurface(material,rootFieldUniform={value:1}) {
  material.defines={...material.defines,USE_UV:""};
  const meadowField=bindMeadowField(material);
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.meadowSurfaceField=meadowField;
    shader.uniforms.uMeadowWorldVariation=meadowWorldVariation;
    shader.uniforms.uGrassRootField=rootFieldUniform;shader.uniforms.uMeadowLandformVariation=meadowLandformVariation;shader.uniforms.uMeadowCommunityVariation=meadowCommunityVariation;
    // Reuse the same static root field across all vertices/LODs. Keep the old
    // texture path behind a uniform for same-scene A/B without recompilation.
    shader.vertexShader=MEADOW_FIELD_GLSL+"uniform float uGrassRootField; attribute vec4 aMeadowRootField; varying vec4 vMeadowFeatures; attribute vec4 aMeadowLandform; varying vec4 vMeadowLandform; attribute vec4 aMeadowCommunity; varying vec4 vMeadowCommunity;\n"+shader.vertexShader
      .replace("#include <begin_vertex>",`#include <begin_vertex>
if(uGrassRootField>.5 && uMeadowWorldVariation>.5)vMeadowFeatures=aMeadowRootField;
else vMeadowFeatures=meadowFieldAt((modelMatrix*vec4(ecoRoot(),1.)).xz);
vMeadowLandform=aMeadowLandform;vMeadowCommunity=aMeadowCommunity;`);
    shader.fragmentShader="varying vec4 vMeadowFeatures; varying vec4 vMeadowLandform; varying vec4 vMeadowCommunity;\n"+MEADOW_SURFACE_GLSL+MEADOW_LANDFORM_GLSL+MEADOW_COMMUNITY_GLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader
      .replace("#include <color_fragment>",`#include <color_fragment>
// Preserve the authored dry blades, root shading and inter-leaf colour spread.
float grassDry=smoothstep(.78,1.08,diffuseColor.r/max(.001,diffuseColor.g));
float grassTone=clamp(diffuseColor.g/.20,.52,1.25);
diffuseColor.rgb=mix(diffuseColor.rgb,meadowCanopyColor(meadowCommunityFeatures(vMeadowFeatures,vMeadowCommunity))*grassTone,.66*(1.-grassDry));
diffuseColor.rgb*=meadowLandformTint(vMeadowLandform)*meadowCommunityTint(vMeadowCommunity);
// The rib only exists while it spans pixels. It is not a permanent bright stripe.
float grassDetail=1.-smoothstep(.12,.6,fwidth(vUv.x));
float grassRib=1.-smoothstep(.025,.13,abs(vUv.x-.5));
float grassEdge=smoothstep(.34,.5,abs(vUv.x-.5));
diffuseColor.rgb*=1.+(grassRib*.06-grassEdge*.08)*grassDetail;`)
      .replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
roughnessFactor=.93+(1.-grassDetail)*.025+(vMeadowFeatures.g-.5)*.02+meadowLandformRoughness(vMeadowLandform)+meadowCommunityRoughness(vMeadowCommunity);`)
      .replace("#include <aomap_fragment>",`#include <aomap_fragment>
reflectedLight.indirectDiffuse*=mix(.82,1.,smoothstep(0.,.52,vUv.y));`);
  };
  material.customProgramCacheKey=()=>key+"-grass-surface-world-field-6-community";
  return material;
}
export function farTreeGeometry() { return createFarSpruceVolumeGeometry(); }
export function sampleHabitat(map,x,z,ch) {
  if(!map)return 0;
  const {meta,n,data}=map;
  if(x<meta.origin[0]||z<meta.origin[1]||x>=meta.origin[0]+meta.size||z>=meta.origin[1]+meta.size)return 0;
  const u=Math.max(0,Math.min(n-1,(x-meta.origin[0])/meta.res-.5)),v=Math.max(0,Math.min(n-1,(z-meta.origin[1])/meta.res-.5));
  const i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j,i1=Math.min(i+1,n-1),j1=Math.min(j+1,n-1),at=(a,b)=>data[(b*n+a)*4+ch]/255;
  return (at(i,j)*(1-fx)+at(i1,j)*fx)*(1-fz)+(at(i,j1)*(1-fx)+at(i1,j1)*fx)*fz;
}
// Conservative bounds for roots that can actually survive the existing LOD shader.
// The six-metre margin covers any motion inside the four-metre streaming anchor.
// Include the complete rotated plant, wind displacement and downward bending.
export function refreshPlantBounds(mesh,records,viewer,range,movementMargin=6) {
  const geometry=mesh.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
  const g=geometry.boundingBox,footprint=Math.hypot(Math.max(Math.abs(g.min.x),Math.abs(g.max.x)),Math.max(Math.abs(g.min.z),Math.abs(g.max.z)));
  const box=mesh.boundingBox||(mesh.boundingBox=new THREE.Box3());box.makeEmpty();
  const limit=(range+movementMargin)**2;
  for(const p of records){
    if((p.x-viewer.x)**2+(p.z-viewer.z)**2>limit)continue;
    const sy=p.sy??p.s,r=footprint*p.s+.75,lo=p.y+g.min.y*sy-.35,hi=p.y+g.max.y*sy+.10;
    box.min.x=Math.min(box.min.x,p.x-r);box.min.y=Math.min(box.min.y,lo);box.min.z=Math.min(box.min.z,p.z-r);
    box.max.x=Math.max(box.max.x,p.x+r);box.max.y=Math.max(box.max.y,hi);box.max.z=Math.max(box.max.z,p.z+r);
  }
  box.getBoundingSphere(mesh.boundingSphere||(mesh.boundingSphere=new THREE.Sphere()));
  mesh.frustumCulled=true;
  if(!mesh.userData.ecologyBoundsInstalled){
    mesh.userData.ecologyBoundsInstalled=true;const worldBounds=new WorldBoundsCache();
    mesh.userData.worldBoundsCache=worldBounds;mesh.userData.worldBoundsCacheControl=worldBoundsCacheControl;
    // Three uses this same hook for the camera and separately for every shadow camera.
    // The box avoids the extra empty volume of a large sphere around a sloping meadow.
    mesh.intersectsFrustum=function(frustum){
      if(this.count===0||this.boundingBox.isEmpty())return false;
      const worldBox=worldBounds.get(this.boundingBox,this.matrixWorld);
      return frustum.intersectsBox?frustum.intersectsBox(worldBox):frustum.intersectsObject(this);
    };
  }
  return box;
}
export class WorldEcology {
  constructor(world,{forestLayout=forestLayoutMode(),treeBatchSize=treeBatchSizeFromURL()}={}) {
    if(![64,96].includes(treeBatchSize))throw new RangeError("Tree submission blocks must be 64 or 96 metres");
    this.treeBatchSize=treeBatchSize;
    this.treeRootOrder=new TreeRootOrder({enabled:new URLSearchParams(globalThis.location?.search||"").get("treeRootOrder")==="1"});
    this.treeWindCoefficientsStatic=new URLSearchParams(globalThis.location?.search||"").get("treeWindCoefficientsStatic")==="1";
    this.treeWindCoefficients={value:new URLSearchParams(globalThis.location?.search||"").get("treeWindCoefficients")==="1"?1:0};
    this.treeWindPhase={value:new THREE.Vector2(0,1)};
    this.shadowVertexReuse={value:new URLSearchParams(globalThis.location?.search||"").get("shadowVertexReuse")==="1"};
    this.treeViewCull={value:new URLSearchParams(globalThis.location?.search||"").get("treeViewCull")==="1"?1:0};
    this.treeWorldFrustum=!this.treeViewCull.value&&new URLSearchParams(globalThis.location?.search||"").get("treeFrustumCull")==="world";
    this.treeFrustumCull={value:this.treeWorldFrustum||new URLSearchParams(globalThis.location?.search||"").get("treeFrustumCull")==="1"?1:0};
    this.world=world;this.group=new THREE.Group();this.group.name="world-ecology";
    this.crownRootMask=new URLSearchParams(globalThis.location?.search||"").get("crownRootMask")==="1"?new CrownRootMask():null;
    if(this.crownRootMask)this.group.addEventListener("added",()=>{let scene=this.group.parent;while(scene&&!scene.isScene)scene=scene.parent;if(scene)this.crownRootMask.attachScene(scene);});
    this.materials=[];this.tiles=new Map();this.queue=[];this.range=2200;
    this.last=new THREE.Vector2(Infinity,Infinity);this.nearLast=new THREE.Vector2(Infinity,Infinity);
    this.windField=new MeadowWindField();this.treeRootWind=new SpruceRootWind();
    this.uniforms={...this.windField.uniforms,uWindTime:{value:0},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:this.range}};
    this.farGeometry=farTreeGeometry();
    this.farMaterial=attachEcologyWind(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide}),this.uniforms,0);
    installFarSpruceShape(this.farMaterial);this.materials.push(this.farMaterial);
    this.meadowSourceRange39=meadowSourceRange39();
    this.grassGeometries=[meadowGeometry(true),meadowGeometry(false)];
    this.grassMaterials=[2,4].map(mode=>attachEcologyWind(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,side:THREE.DoubleSide}),this.uniforms,mode,true));
    installMeadowSourceRange39(this.grassMaterials[1],this.meadowSourceRange39);
    this.grassRootField=new GrassRootField(this.world);this.meadowRootCache=new MeadowRootCache(this);this.uniforms.uGrassRootField={value:1};
    this.grassMaterials.forEach(m=>installGrassSurface(m,this.uniforms.uGrassRootField));
    this.grassDepth=depthFor(this.grassMaterials[0],this.uniforms,2,true);this.materials.push(...this.grassMaterials);
    this.baseGrassGeometry=basalGrassGeometry();this.shoreGrassEnvelope=createPlantEnvelope([this.grassGeometries[0],this.baseGrassGeometry]);this.baseGrassMaterial=attachEcologyWind(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,side:THREE.DoubleSide}),this.uniforms,7,true);installGrassSurface(this.baseGrassMaterial,this.uniforms.uGrassRootField);this.materials.push(this.baseGrassMaterial);
    const baseMesh=new THREE.InstancedMesh(createGrassFieldGeometry(this.baseGrassGeometry,8000,true),this.baseGrassMaterial,8000);baseMesh.onBeforeRender=baseMesh.onBeforeShadow=markGrassFieldRendered;baseMesh.count=0;baseMesh.castShadow=true;baseMesh.receiveShadow=true;baseMesh.frustumCulled=true;baseMesh.customDepthMaterial=depthFor(this.baseGrassMaterial,this.uniforms,7,true);this.group.add(baseMesh);
    this.baseGrass={mesh:baseMesh,meadowField:baseMesh.geometry.attributes.aMeadowRootField,meadowLandform:baseMesh.geometry.attributes.aMeadowLandform,meadowCommunity:baseMesh.geometry.attributes.aMeadowCommunity,records:[],dirtyMin:Infinity,dirtyMax:0};this.baseGrassAnchor="";this.grassRootsChanged=false;
    // Materials must exist before main registers the ecology lighting chain.
    this.valleyBanks=valleyBankContext(this.world);
    this.riverValleyWet=new URLSearchParams(globalThis.location?.search||'').get('riverValleyWet')==='1'||Boolean(this.world.hydrology?.stats?.valleyDeposits?.nodes);
    if(this.world.hydrology?.stats?.brookBendBanks?.nodes||this.riverValleyWet)this.prepareBrookWetMaterials();
    this.grassGroup=new THREE.Group();this.group.add(this.grassGroup);this.grassTiles=new Map();this.grassQueue=[];this.grassWanted=new Set();this.grassAnchor="";
    this.nearGroup=new THREE.Group();this.group.add(this.nearGroup);this.nearParts=[];this.nearTreeBatches=new Map();this.treeBatchRevision=0;
    this.flowerPools=[];this.flowerNearPools=[];this.flowerTiles=new Map();this.flowerRootsChanged=false;this.flowerNearAnchor="";
    this.stats={trees:0,treeChunks:0,grassTufts:0,grassChunks:0,flowerPlants:0,pending:0,grassPending:0,grassBuiltThisFrame:0,flowerNearPlants:0,basalGrassTufts:0};
    Object.defineProperty(this.stats,"shadowVertexReuse",{enumerable:true,get:()=>{
      const records=this.nearParts.map(p=>p.shadowIndex).filter(Boolean),total={enabled:!!this.shadowVertexReuse.value,parts:records.filter(r=>r.index).length};
      for(const key of ["beforeVertices","afterVertices","remappedVertices","triangles","bytes","buildMs","uploads","liveBuffers","draws"])total[key]=records.reduce((n,r)=>n+(r.stats[key]||0),0);
      return total;
    }});
    Object.defineProperty(this.stats,"treeViews",{enumerable:true,get:()=>{
      const total={enabled:!!this.treeViewCull.value,batches:0,bytes:0,viewGeometries:0,queries:0,tested:0,selected:0,rejected:0,draws:0,drawnInstances:0};
      for(const b of this.nearTreeBatches.values())if(b.view){total.batches++;for(const k of Object.keys(total))if(k!=="enabled"&&k!=="batches")total[k]+=b.view.stats[k]||0;}
      return total;
    }});
    this.thresholdPlants=new ThresholdPlantField(world);this.boardwalkPlantContact39=new BoardwalkPlantContact39(world);
    Object.assign(this,createForestExclusionIndex(world));
    this.forestLayout=new ForestRootLayout(world,{mode:forestLayout,originalAt:(ix,iz)=>this.originalTreeAt(ix,iz),excluded:(x,z,pad)=>this.excluded(x,z,pad),random:cellRandom});
    this.stats.forestLayout=this.forestLayout.stats;
    this.stats.meadowRootCache=this.meadowRootCache.stats;
    this.rootCache=new ForestRootCache(world,{mode:forestLayout});this.stats.forestRootCache=this.rootCache.stats;
    this.transform=new THREE.Object3D();
    this.forestFloor=new ForestFloor(world,{excluded:(x,z,pad)=>this.excluded(x,z,pad,true),wind:(m,mode,herb)=>attachEcologyWind(m,this.uniforms,mode,herb),depth:(m,mode,herb)=>depthFor(m,this.uniforms,mode,herb),bounds:refreshPlantBounds});
    this.group.add(this.forestFloor.group);this.materials.push(...this.forestFloor.materials);
    this.reachBankCover39=new ReachBankCover39(world,{rootField:this.grassRootField,excluded:(x,z,p)=>this.excluded(x,z,p,true),wind:(m,mode,herb)=>attachEcologyWind(m,this.uniforms,mode,herb),depth:(m,mode,herb)=>depthFor(m,this.uniforms,mode,herb)});this.group.add(this.reachBankCover39.group);this.materials.push(...this.reachBankCover39.materials);
  }
  excluded(x,z,padding=2,allowWetBank=false) {return rootExcluded(this,x,z,padding,allowWetBank);}
  async load({canopyLookup=null,textureRenderer=null}={}) {
    const loader=createSpruceLoader();this.spruceGeometryPool=new SpruceGeometryPool();this.treeLoadController=new AbortController();
    const useFarImpostor=new URLSearchParams(globalThis.location?.search||"").get("farImpostor")!=="0";
    const gpuMode=typeof location==='undefined'?'stations':(new URLSearchParams(location.search).get('needleGpu')||'stations');
    const useGpu=gpuMode!=='0',useStations=gpuMode==='stations',usePacked=gpuMode!=='stations'&&gpuMode!=='tex';
    const signal=this.treeLoadController.signal;
    this.earlyTreeTextures=textureRenderer?new EarlyTreeTextures(textureRenderer,{signal,onFailure:error=>this.treeLoadController.abort(error)}):null;
    this.stats.earlyTreeTextures=this.earlyTreeTextures?.stats??{enabled:false,status:"disabled"};
    this.spruceSharedImages=new SpruceSharedImages({signal});this.stats.spruceSharedImages=this.spruceSharedImages.stats;
    // Optional source-identical cache never blocks asset readiness. A late result
    // serves subsequent cells; existing cells retain their exact root values.
    this.rootCache.prepare({signal});this.meadowRootCache.prefetch({signal});
    this.stats.assetLoads={mode:'dependency-parallel',phases:{}};
    const crown=typeof location==='undefined'||new URLSearchParams(location.search).get('needleCrown')!=='0';
    const branches=useStations&&(typeof location==='undefined'||new URLSearchParams(location.search).get('needleBranches')!=='0');
    const requestedCanopyMode=canopyCacheMode(),canopyMode=spruceVolumeEnabled()&&(requestedCanopyMode!=="local"||(useStations&&crown&&branches))?requestedCanopyMode:"off";
    const useCanopy=canopyMode!=="off";
    const preparedCanopy=canopyMode==="local"?canopyLookup:null;
    this.stats.canopyPreparation=preparedCanopy?.stats??{enabled:useCanopy,mode:canopyMode,status:useCanopy?'loading':'runtime'};
    if(preparedCanopy){
      const cancel=()=>preparedCanopy.cancel(signal.reason);signal.addEventListener('abort',cancel,{once:true});
      preparedCanopy.ready.finally(()=>signal.removeEventListener('abort',cancel)).catch(()=>{});
      this.stats.canopyPreparation.prefetchLeadMs=performance.now()-this.stats.canopyPreparation.prefetchStartedMs;
    }
    this.canopyCapture=canopyMode==="local"?new LocalCanopyCapture({signal,stats:this.stats.canopyPreparation}):null;
    const canopyReady=(preparedCanopy?.ready??(useCanopy?(canopyMode==="local"?loadLocalSpruceCanopyCache:loadSpruceCanopyCache)({signal,stats:this.stats.canopyPreparation}):Promise.resolve(null))).catch(error=>{
      if(signal.aborted||error?.name==="AbortError")throw error;
      canopyFallback(this.stats.canopyPreparation,error);return null;
    });
    canopyReady.catch(()=>{});
    const recipePrefetch=useGpu&&new URLSearchParams(globalThis.location?.search||'').get('needleRecipePrefetch')!=='0';
    const recipeData=recipePrefetch?loadGpuSpruceRecipeData(undefined,{signal}):null;
    // Fail fast through the shared transaction, and handle rejection even if
    // the hi dependency fails before it can consume this promise.
    recipeData?.catch(error=>this.treeLoadController.abort(error));
    let sources;
    try {
      sources=await loadEcologySources({
        hi:()=>this.spruceSharedImages.load("hi",loader),
        mid:()=>this.spruceSharedImages.load("mid",loader),
        local:()=>loadHabitatMap("vegmap",{signal}),core:()=>loadHabitatMap("vegcore",{signal}),
        flowerModule:()=>import("./flower-assets.js"),
        far:()=>useFarImpostor?loadFarSpruceAssets({signal}):null,
        needle:async hi=>{
          this.canopyCapture?.captureSource('hi',hi);
          return (useGpu?loadGpuSpruceRecipe:loadSpruceRecipe)(hi,undefined,{signal,recipeData,canopyCache:await canopyReady,onCanopyRecipe:(bytes,contract)=>this.canopyCapture?.captureRecipe(bytes,contract),packing:usePacked,branches,crown});
        }
      },{signal,onFailure:error=>this.treeLoadController.abort(error),onReady:(name,value)=>this.earlyTreeTextures?.enqueue(name,value),beforePublish:()=>this.earlyTreeTextures?.finish(),phases:this.stats.assetLoads.phases});
    } catch(error){await recipeData?.catch(()=>{});this.spruceSharedImages.dispose();this.canopyCapture?.dispose();this.spruceGeometryPool.dispose();throw error;}
    const postSourcesStarted=performance.now(),{hi,mid,local,core,needle,far:farAssets,flowerLOD,flowerNear}=sources;
    this.canopyCapture?.captureSource('mid',mid);
    let canopyCache=await canopyReady;
    if(canopyCache&&!canopyCache.disabled){
      try{await Promise.all([canopyCache.verifySource('hi',hi),canopyCache.verifySource('mid',mid)]);if(signal.aborted)throw signal.reason??new DOMException('Ecology loading aborted','AbortError');}
      catch(error){if(signal.aborted)throw error;canopyCache.disable(error);}
    }
    this.stats.needleTextureReuse=await reuseNeedleTextures(hi,needle);this.stats.needlePayload=needle.userData;this.stats.treeGeometryReuse=this.spruceGeometryPool.stats;
    this.stats.spruceVolume=canopyCache&&!canopyCache.disabled?canopyCache.applyVolume(hi,mid):applySpruceVolume(hi,mid);
    if(this.canopyCapture){
      if(canopyCache&&!canopyCache.disabled){this.canopyCapture.dispose();this.canopyCapture=null;this.stats.canopyPreparation.persistStatus="not-needed";}
      else{if(canopyCache?.disabled)this.stats.canopyPreparation.localStatus="invalid";for(const[lod,gltf]of[["hi",hi],["mid",mid],["near",needle]])this.canopyCapture.captureParts(lod,gltf);this.stats.canopyPreparation.persistStatus="pending-first-frame";}
    }
    if(farAssets){
      this.farAssets=farAssets;this.farGeometry.dispose();this.farGeometry=createFarSpruceImpostorGeometry(farAssets);
      const previous=this.farMaterial;
      this.farMaterial=attachEcologyWind(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:false,roughness:.94,side:THREE.DoubleSide,alphaTest:.003,alphaToCoverage:true}),this.uniforms,0);
      installFarSpruceImpostor(this.farMaterial,farAssets);
      this.materials[this.materials.indexOf(previous)]=this.farMaterial;previous.dispose();
      this.farAttributeWriter=setFarSpruceImpostorAttributes;
      this.stats.farTrees={...farAssets.stats,templateTriangles:this.farGeometry.index.count/3,forms:5,azimuths:8,elevations:3};
    } else this.stats.farTrees={representation:"v13 opaque crown A/B",templateTriangles:104};
    this.floraLocal=local;this.floraCore=core;this.meadowRootCache.prepare({signal});this.stats.habitatTransport={local:local.transport,core:core.transport};this.treeSourceTextures=new Set();
    const gpuForms=[];
    this.stats.treeVertexLayout={enabled:treeVertexLayoutEnabled(),parts:0,bytes:0,buffersBefore:0,buffersAfter:0,prepareMs:0};
    for(const [gltf,mode] of [[hi,5],[mid,1],[needle,TREE_NEEDLES.mode]]) {
      gltf.scene.updateMatrixWorld(true);const buckets=new Map();
      gltf.scene.traverse(o=>{
        if(!o.isMesh)return;const variant=NAMES.findIndex(n=>o.name.startsWith(n+"_"));if(variant<0)return;
        const key=variant+":"+o.material.uuid;
        if(!buckets.has(key))buckets.set(key,{variant,material:o.material,geometries:[]});
        const g=spruceGeometryContainer(o.geometry,o.matrixWorld);g.deleteAttribute("color");
        for(const [source,target] of [["_plant_wind","aPlantWind"],["_crown_occlusion","aCrownOcclusion"]]){
          const attr=g.getAttribute(source);if(!attr)throw new Error("Missing spruce attribute: "+source);
          g.setAttribute(target,attr);g.deleteAttribute(source);
        }
        buckets.get(key).geometries.push(g);
        for(const v of Object.values(o.material))if(v?.isTexture)this.treeSourceTextures.add(v);
      });
      if(new Set([...buckets.values()].map(b=>b.variant)).size!==NAMES.length)throw new Error("Spruce LOD "+mode+" must retain all five forms");
      const materials=new Map();
      for(const bucket of buckets.values()){
        let geometry=bucket.geometries.length===1?bucket.geometries[0]:mergeGeometries(bucket.geometries);
        if(bucket.geometries.length>1)bucket.geometries.forEach(g=>g.dispose());
        if(!geometry)throw new Error("Cannot merge spruce geometry");
        geometry=this.spruceGeometryPool.adopt(bucket.variant,bucket.material.name,geometry);
        if(this.stats.treeVertexLayout.enabled&&bucket.material.alphaTest>0){
          const start=performance.now(),r=interleaveTreeVertices(geometry),stats=this.stats.treeVertexLayout;
          stats.parts++;stats.bytes+=r.bytes;stats.buffersBefore+=r.beforeBuffers;stats.buffersAfter+=r.afterBuffers;stats.prepareMs+=performance.now()-start;
        }
        let material=materials.get(bucket.material);
        if(!material){material=configureSpruceMaterial(bucket.material.clone());attachEcologyWind(material,this.uniforms,mode,false,true);installCrownOcclusion(material);installNeedleSurface(material);materials.set(bucket.material,material);this.materials.push(material);}
        const mesh=new THREE.InstancedMesh(geometry,material,mode===TREE_NEEDLES.mode?64:1600);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;
        mesh.customDepthMaterial=depthFor(material,this.uniforms,mode,false,true);
        if(geometry.hasAttribute("aSprayLod")){installSpruceBranchPhotos(material);installSpruceBranchPhotos(mesh.customDepthMaterial);}
        // Keep one resource template; only fixed-world spatial batches enter the scene.
        this.nearParts.push({variant:bucket.variant,mode,mesh});
        if(needle.gpuPackets&&mode===TREE_NEEDLES.mode&&geometry.userData.gpuBrushShell){
          material.userData.gpuBrushSource=true;
          const tables=createGpuBrushTables(needle.gpuPackets[bucket.variant],useStations);
          const gpuMaterial=configureSpruceMaterial(bucket.material.clone());attachEcologyWind(gpuMaterial,this.uniforms,mode,false,true);installCrownOcclusion(gpuMaterial);installNeedleSurface(gpuMaterial);if(useStations)installGpuNeedleStations(gpuMaterial);else installGpuBrush(gpuMaterial,tables,{packed:usePacked});this.materials.push(gpuMaterial);
          const depth=depthFor(gpuMaterial,this.uniforms,mode,false,true);if(useStations)installGpuNeedleStations(depth,{branches:!!gpuMaterial.userData.spruceBranchDetails});else installGpuBrush(depth,tables,{packed:usePacked});
          const form={tables,material:gpuMaterial,depth};
          if(useStations){
            form.stationGeometry=createStationGeometry(needle.gpuPackets[bucket.variant]);
            form.twigMaterial=configureSpruceMaterial(bucket.material.clone());attachEcologyWind(form.twigMaterial,this.uniforms,mode,false,true);installCrownOcclusion(form.twigMaterial);installNeedleSurface(form.twigMaterial);installGpuBrush(form.twigMaterial,tables,{twigOnly:true});this.materials.push(form.twigMaterial);
            form.twigDepth=depthFor(form.twigMaterial,this.uniforms,mode,false,true);installGpuBrush(form.twigDepth,tables,{twigOnly:true});
          }
          gpuForms[bucket.variant]=form;
        }
      }
      gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    }
    if(this.treeWindCoefficients.value||this.treeWindCoefficientsStatic){
      let bytes=0,parts=0;
      for(const part of this.nearParts)if((part.mode===1||part.mode===5)&&part.mesh.material.alphaTest>0){
        bytes+=prepareTreeWindCoefficients(part.mesh.geometry).allocatedBytes;parts++;
        for(const material of [part.mesh.material,part.mesh.customDepthMaterial])installTreeWindCoefficients(material,{phase:this.treeWindPhase,enabled:this.treeWindCoefficients,compileTimeOnly:this.treeWindCoefficientsStatic});
      }
      this.stats.treeWindCoefficients={bytes,parts,compileTimeOnly:this.treeWindCoefficientsStatic,activeWindBytesPerVertex:this.treeWindCoefficientsStatic?20:32,originalWindBytesPerVertex:12};
    }
    if(this.shadowVertexReuse.value&&!this.treeViewCull.value)for(const part of this.nearParts)if(part.mode===5&&part.mesh.material.alphaTest>0)part.shadowIndex=createTreeShadowIndex(part.mesh.geometry);
    if(new URLSearchParams(globalThis.location?.search||"").get("middleTreeBatched")==="1"){
      this.middleBatched=new SpruceMiddleBatched(this.nearParts,this.nearGroup,{onChange:()=>{this.treeBatchRevision++;}});
      this.stats.middleTreeBatched=this.middleBatched.stats;
    }
    if(needle.gpuPackets){
      if(gpuForms.filter(Boolean).length!==5)throw new Error('Missing GPU spruce form material');
      this.gpuBrushes=new (useStations?SpruceGpuStationBrushes:SpruceGpuBrushes)(gpuForms,createGpuBrushTemplate(needle.gpuPackets[0].topology));this.group.add(this.gpuBrushes.group);
      Object.assign(this.stats.needlePayload,{representation:this.gpuBrushes.stats.representation,gpuMode,gpuTableBytes:this.gpuBrushes.stats.tableBytes,templateBytes:this.gpuBrushes.stats.templateBytes,needleTemplateTriangles:useStations?5:1440,twigTemplateTriangles:156});
      needle.gpuPackets=null;
    }
    this.flowerAssets=flowerLOD;this.flowerNearAssets=flowerNear;
    for(const [assets,mode,pools,capacity] of [[this.flowerAssets,6,this.flowerPools,2400],[this.flowerNearAssets,3,this.flowerNearPools,1200]]){
      const materials=new Map();
      for(const variant of assets.variants)for(const part of variant.parts){
        if(!materials.has(part.material)){attachEcologyWind(part.material,this.uniforms,mode,true);this.materials.push(part.material);materials.set(part.material,depthFor(part.material,this.uniforms,mode,true));}
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,capacity);mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;mesh.customDepthMaterial=materials.get(part.material);
        this.group.add(mesh);pools.push({variant,mesh,records:[],dirtyMin:Infinity,dirtyMax:0});
      }
    }
    this.stats.assetLoads.postSourceMs=performance.now()-postSourcesStarted;
    return this;
  }
  persistCanopyCache() {return this.canopyCapture?.persist()??Promise.resolve(false);}
  habitat(x,z,ch) {
    const m=this.floraLocal;
    return m&&x>=m.meta.origin[0]&&z>=m.meta.origin[1]&&x<m.meta.origin[0]+m.meta.size&&z<m.meta.origin[1]+m.meta.size?sampleHabitat(m,x,z,ch):sampleHabitat(this.floraCore,x,z,ch);
  }
  treeAt(ix,iz) {const cached=this.rootCache.at(ix,iz);return cached===undefined?this.forestLayout.at(ix,iz):cached;}
  originalTreeAt(ix,iz) {return originalForestRoot(this,ix,iz);}
  matrix(p) {
    const t=this.transform;t.position.set(p.x,p.y,p.z);t.rotation.set(0,p.rot,0);
    t.scale.set(p.s,p.sy??p.s,p.s);t.updateMatrix();return t.matrix;
  }
  buildTile(tx,tz) {
    const started=performance.now(),list=[];
    for(let iz=tz*32;iz<(tz+1)*32;iz++)for(let ix=tx*32;ix<(tx+1)*32;ix++){const t=this.treeAt(ix,iz);if(t)list.push(t);}
    const rootsDone=performance.now();let mesh=null;
    if(list.length){
      mesh=createFarTreeBatch(this.farGeometry,this.farMaterial,list,p=>this.matrix(p),{setAttributes:this.farAttributeWriter});
      this.group.add(mesh);
    }
    this.tiles.set(tx+","+tz,{mesh,tx,tz,count:list.length});
    const timing=this.stats.farTileBuild??={tiles:0,rootsMs:0,batchesMs:0};timing.tiles++;timing.rootsMs+=rootsDone-started;timing.batchesMs+=performance.now()-rootsDone;
  }
  rebuildNearTrees(camera) {
    const p=camera.position,byVariant=Array.from({length:5},()=>[]),sourceRange=252+this.forestLayout.maxShift;
    // Source IDs retain their 12 m cells; relocated roots can enter from the halo.
    // Every final prefetch/LOD test below still uses the original exact distance.
    for(let iz=Math.floor((p.z-sourceRange)/12);iz<=Math.floor((p.z+sourceRange)/12);iz++)for(let ix=Math.floor((p.x-sourceRange)/12);ix<=Math.floor((p.x+sourceRange)/12);ix++){
      const t=this.treeAt(ix,iz);if(t&&Math.hypot(t.x-p.x,t.z-p.z)<252)byVariant[t.variant].push(t);
    }
    const wanted=new Set();let instanceCount=0;
    for(let partIndex=0;partIndex<this.nearParts.length;partIndex++){
      const part=this.nearParts[partIndex],{variant,mode,mesh:template}=part;
      // Keep every resident identity and the original prefetch distances.
      const list=byVariant[variant].filter(t=>{const d=Math.hypot(t.x-p.x,t.z-p.z);return mode===TREE_NEEDLES.mode?d<TREE_NEEDLES.prefetch:mode===5?d<82:d>24;}).slice(0,template.instanceMatrix.count);
      const chunks=new Map();
      for(const root of list){const chunk=treeBatchKey(root.x,root.z,this.treeBatchSize);if(!chunks.has(chunk))chunks.set(chunk,[]);chunks.get(chunk).push(root);}
      for(const [chunk,records]of chunks){
        const key=partIndex+":"+chunk;wanted.add(key);let batch=this.nearTreeBatches.get(key);
        if(!batch){
          // The fixed-world block/resource stays resident; only its active prefix is drawn.
          const capacity=Math.max(64,records.length),geometry=this.treeRootWind.createGeometry(template.geometry,capacity,mode+":"+variant+":"+chunk);
          const mesh=new THREE.InstancedMesh(geometry,template.material,capacity);
          mesh.name="spruce-"+mode+"-"+variant+"-"+chunk+"-"+partIndex;mesh.count=0;mesh.visible=false;
          mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;
          mesh.customDepthMaterial=template.customDepthMaterial;
          if(mode===1||mode===5)(this.treeWorldFrustum?installTreeWorldFrustum:installTreeFrustumCull)(mesh,this.treeFrustumCull);
          // Foliage dominates submitted vertices. Keep cheap bark/core batches on
          // their existing path: compacting them costs more CPU than it saves.
          const view=this.treeViewCull.value&&(mode===1||mode===5)&&template.material.alphaTest>0?installTreeViewBatch(mesh,{enabled:this.treeViewCull}):null;
          if(!view&&part.shadowIndex?.index)installTreeShadowIndex(mesh,part.shadowIndex,{enabled:this.shadowVertexReuse});
          if(this.crownRootMask&&!view&&(mode===1||mode===5)&&template.material.alphaTest>0)this.crownRootMask.add(mesh);
          this.nearGroup.add(view?.proxy||mesh);
          batch={mesh,view,partIndex,variant,mode,chunk,records:[],ids:"",activeRecords:[],activeIndex:new Map()};
          this.nearTreeBatches.set(key,batch);this.treeBatchRevision++;
        }
        batch.ids=records.map(r=>r.id).join("|");batch.records=records;instanceCount+=records.length;
      }
    }
    for(const [key,batch]of this.nearTreeBatches)if(!wanted.has(key)){
      batch.view?.dispose();this.nearGroup.remove(batch.mesh);disposeTreeWindGeometry(batch.mesh.geometry);batch.mesh.dispose();this.nearTreeBatches.delete(key);this.treeBatchRevision++;
    }
    Object.assign(this.stats,{treeBatchSize:this.treeBatchSize,treeDrawBatches:this.nearTreeBatches.size,treeBatchInstances:instanceCount,
      needleTreeRoots:byVariant.flat().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<TREE_NEEDLES.prefetch).length,
      highTreeRoots:byVariant.flat().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<82).length,
      midTreeRoots:byVariant.flat().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)>24).length});
    this.syncActiveTrees(camera,true);
  }
  syncActiveTrees(camera,force=false) {
    const viewer=camera.position;
    if(!force&&viewer.x===this.treeActiveX&&viewer.z===this.treeActiveZ)return false;
    this.treeActiveX=viewer.x;this.treeActiveZ=viewer.z;
    let needleResident=0,needleActive=0,needleTriangles=0,highResident=0,midResident=0,highActive=0,midActive=0,activeBatches=0,changedAny=false;
    const needleRoots=new Set();
    for(const batch of this.nearTreeBatches.values()){
      const {mesh,records,activeRecords:active,activeIndex:index}=batch;
      const wanted=new Map();
      for(const root of records)if(treeLodMayContribute(batch.mode,root,viewer))wanted.set(root.id,root);
      let dirtyMin=Infinity,dirtyMax=0,changed=false;
      const write=(slot,root)=>{mesh.setMatrixAt(slot,this.matrix(root));dirtyMin=Math.min(dirtyMin,slot);dirtyMax=Math.max(dirtyMax,slot+1);};
      // Swap removal keeps the other resident matrices/slots stable.
      for(let i=active.length-1;i>=0;i--){
        const root=active[i];if(wanted.has(root.id)){wanted.delete(root.id);continue;}
        const last=active.pop();index.delete(root.id);
        if(last!==root){active[i]=last;index.set(last.id,i);write(i,last);}
        changed=true;
      }
      for(const root of wanted.values()){
        index.set(root.id,active.length);write(active.length,root);active.push(root);changed=true;
      }
      if(changed||!mesh.userData.ecologyBoundsInstalled){
        mesh.count=active.length;mesh.visible=active.length>0;
        // The prefix contains only current contributors. Its absolute bounds remain
        // valid between membership changes, for main, mirrored and all shadow views.
        refreshPlantBounds(mesh,active,viewer,Infinity,0);
        if(!mesh.boundingBox.isEmpty())mesh.boundingBox.expandByVector(new THREE.Vector3(1.25,.4,1.25));
        mesh.boundingBox.getBoundingSphere(mesh.boundingSphere);
        if(dirtyMin<Infinity){
          // Preparation can run several times before rendering; Three consumes these ranges after upload.
          mesh.instanceMatrix.addUpdateRange(dirtyMin*16,(dirtyMax-dirtyMin)*16);
          mesh.instanceMatrix.needsUpdate=true;
        }
        // Casters observe count/visibility/matrix version; keep the public revision
        // too, so zero -> nonzero and count-only removals invalidate cached shadows.
        this.treeBatchRevision++;changedAny=true;
      }
      if(batch.mode===TREE_NEEDLES.mode){needleResident+=records.length;needleActive+=active.length;needleTriangles+=active.length*(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;for(const root of active)needleRoots.add(root.id);}
      else if(batch.mode===5){highResident+=records.length;highActive+=active.length;}else{midResident+=records.length;midActive+=active.length;}
      if(active.length)activeBatches++;
    }
    // Instance totals count mesh parts (bark/core/frond), not unique tree roots.
    Object.assign(this.stats,{treeNeedleResidentInstances:needleResident,treeNeedleActiveInstances:needleActive,treeNeedleActiveRoots:needleRoots.size,treeNeedleTriangles:needleTriangles,treeNeedleShellTriangles:needleTriangles,
      treeHighResidentInstances:highResident,treeHighActiveInstances:highActive,
      treeMidResidentInstances:midResident,treeMidActiveInstances:midActive,
      treeActiveInstances:needleActive+highActive+midActive,treeActiveBatches:activeBatches,treeBatchRevision:this.treeBatchRevision});
    return changedAny;
  }
  grassAt(ix,iz) {
    const context=this.valleyBanks;if(!context)return this._grassAt(ix,iz);
    const x=(ix+.15+.7*cellRandom(ix,iz,11))*MEADOW.cell,z=(iz+.15+.7*cellRandom(ix,iz,12))*MEADOW.cell;
    if(!context.locate(x,z))return this._grassAt(ix,iz);
    if(!this.valleySourceEcology){this.valleySourceEcology=Object.create(this);this.valleySourceEcology.world=context.sourceWorld;this.valleySourceEcology.valleyBanks=null;}
    const source=this.valleySourceEcology._grassAt(ix,iz);if(!source)return null;
    let placed=context.map(source);const suitable=(x,z)=>!this.excluded(x,z,.3,!!source.brookAsset)&&!this.world.hydrology.sampleAt(x,z,{includeDepth:false}).insideWater;
    placed=relocateShorePlant(this.world,placed,this.shoreGrassEnvelope,suitable);
    if(!source.brookAsset)return placed;
    source.brookAsset.dispose();delete placed.brookAsset;
    const geometries=[this.grassGeometries[0],this.grassGeometries[1],this.baseGrassGeometry],q=this.world.hydrology.sampleAt(placed.x,placed.z,{includeDepth:false});
    const segment=q.id===null?null:this.world.hydrology.nearSegments(placed.x,placed.z,q.distance+.1).find(s=>s.id===q.id),section=segment?riverSectionAt(segment,.5):null;
    const side=section?Math.sign(-section.fz*(placed.x-section.x)+section.fx*(placed.z-section.z)):1;
    for(const offset of [0,.18,.36,.6,.9,1.3,1.8,2.4,3.2]){
      const x=placed.x-(section?.fz??0)*side*offset,z=placed.z+(section?.fx??0)*side*offset;if(!suitable(x,z))continue;
      const r={...placed,x,z,y:this.world.surface.heightAt(x,z)-.035},asset=createBrookWetAsset(this.world,r,geometries,{physicalOnly:true});if(asset)return{...r,brookShoulder:true,brookAsset:asset};
    }
    throw new Error('Valley bend could not support original wet root '+source.id+' '+JSON.stringify({x:placed.x,y:placed.y,z:placed.z,water:q,section,side}));
  }
  _grassAt(ix,iz) {
    if(this.world.forestShoulderSourceWorld){
      if(!this.forestShoulderSourceEcology){this.forestShoulderSourceEcology=Object.create(this);this.forestShoulderSourceEcology.world=this.world.forestShoulderSourceWorld;}
      let root=seatForestShoulderRoot(this.world,this.forestShoulderSourceEcology._grassAt(ix,iz));
      const reach=this.world.hydrology.forestReach39;
      if(root&&reach&&Math.hypot(root.x+3611.9813305250705,root.z-4805.371282289286)<30){
        const sources=[this.grassGeometries[0],this.grassGeometries[1],this.baseGrassGeometry];
        if(!this.forestReachCommunity39){
          const local=reach.waterSamples?this.world.hydrology.segments.filter(reach.activeSegment):[],xs=local.flatMap(s=>[s.a.x,s.b.x]),zs=local.flatMap(s=>[s.a.z,s.b.z]),records=[];
          for(let z=Math.floor((Math.min(...zs)-4)/MEADOW.cell);z<=Math.ceil((Math.max(...zs)+4)/MEADOW.cell);z++)for(let x=Math.floor((Math.min(...xs)-4)/MEADOW.cell);x<=Math.ceil((Math.max(...xs)+4)/MEADOW.cell);x++){
            const original=this.forestShoulderSourceEcology._grassAt(x,z);if(original){const {brookAsset,...record}=original;records.push(record);brookAsset?.dispose();}
          }
          this.forestReachCommunity39=createForestReachCommunity39(this.world,records,{accept:r=>{
            if(this.excluded(r.x,r.z,.3,true))return false;
            const asset=createBrookWetAsset(this.world,r,sources,{physicalOnly:true,preserveFootprint:true});if(!asset)return false;
            const valid=!brookGrassIntersectsWater(this.world,r,asset.envelope);asset.dispose();return valid;
          }});
        }
        const moved=this.forestReachCommunity39.placed.get(root.id);
        if(moved){root.brookAsset?.dispose();const asset=createBrookWetAsset(this.world,moved,sources,{physicalOnly:true,preserveFootprint:true});if(!asset)throw new Error('Reach community lost validated footprint '+root.id);return{...moved,forestReachMove:Math.hypot(moved.x-root.x,moved.z-root.z),brookAsset:asset};}
      }
      if(root){
        const sources=[this.grassGeometries[0],this.grassGeometries[1],this.baseGrassGeometry];
        if(forestCurvatureNeedsBladeSeat(this.world,root,sources)){
          const asset=createBrookWetAsset(this.world,root,sources,{physicalOnly:true,preserveFootprint:true});
          if(!asset)throw new Error('Forest curvature cannot support original full-footprint root '+root.id);
          return {...root,brookAsset:asset};
        }
      }
      return root;
    }
    const cell=MEADOW.cell,x=(ix+.15+.7*cellRandom(ix,iz,11))*cell,z=(iz+.15+.7*cellRandom(ix,iz,12))*cell;
    const oldExcluded=this.excluded(x,z,.3)||(this.riverValleyWet&&valleySourceExcluded(this.world,x,z,.3)),brookShoulder=oldExcluded&&(brookShoulderSuitable(this.world,x,z)||(this.riverValleyWet&&valleyShoulderSuitable(this.world,x,z)))&&!this.excluded(x,z,.3,true);
    if(oldExcluded&&!brookShoulder)return null;
    const lc=this.world.landcoverAt(x,z);
    // These source-cell hashes are stateless. Reject the same doomed cells
    // before normalAt's four height queries; accepted roots and seating stay exact.
    if(lc.b>.12||(!brookShoulder&&cellRandom(ix,iz,13)<lc.g*.85+lc.r*.52))return null;
    const patch=cellRandom(Math.floor(x/5),Math.floor(z/5),79),vigor=.78+.35*patch;
    if(cellRandom(ix,iz,81)>.72+.22*patch)return null;
    if(this.world.surface.normalAt(x,z,2).y<.72)return null;
    const flowers=this.habitat(x,z,0),s=.80+cellRandom(ix,iz,14)*.50;
    const root={id:"grass:"+ix+":"+iz,x,y:this.world.surface.heightAt(x,z)-.035,z,s,sy:s*vigor*(1-flowers*.23),rot:cellRandom(ix,iz,15)*Math.PI*2};
    // Added wet-bank tufts keep every leaf and full stem height, with a
    // narrower rooted footprint suited to a shoulder instead of meadow sod.
    // New wet-bank sources retain full leaf dimensions; per-blade feet adapt below.
    const suitable=(px,pz)=>{
      if(brookShoulder?(!(brookShoulderSuitable(this.world,px,pz)||(this.riverValleyWet&&valleyShoulderSuitable(this.world,px,pz)))||this.excluded(px,pz,.3,true)):this.excluded(px,pz,.3))return false;
      const cover=this.world.landcoverAt(px,pz);return cover.b<=.12&&Math.abs(cover.r-lc.r)<.25&&Math.abs(cover.g-lc.g)<.35&&this.world.surface.normalAt(px,pz,2).y>=.72;
    };
    // Preserve every previously validated narrow-base shoulder tuft exactly;
    // the richer per-blade asset only adds further admissible source roots.
    if(brookShoulder&&brookShoulderSuitable(this.world,x,z)&&cellRandom(ix,iz,13)>=lc.g*.85+lc.r*.52){
      const compact={...root,s:root.s*.48},shifted=relocateShorePlant(this.world,compact,this.shoreGrassEnvelope,suitable);
      const fitted=this.thresholdPlants.relocate(shifted,this.shoreGrassEnvelope,p=>suitable(p.x,p.z)&&!getShoreStoneField(this.world).intersects(p,this.shoreGrassEnvelope),compact);
      const retained=seatBrookShoulderGrass(this.world,fitted,grassStemFeet([this.grassGeometries[0],this.baseGrassGeometry]),this.shoreGrassEnvelope);
      if(retained&&!getShoreStoneField(this.world).intersects(retained,this.shoreGrassEnvelope))return retained;
    }
    const shoreRoot=relocateShorePlant(this.world,root,this.shoreGrassEnvelope,suitable);
    const placed=this.thresholdPlants.relocate(shoreRoot,this.shoreGrassEnvelope,p=>suitable(p.x,p.z)&&!getShoreStoneField(this.world).intersects(p,this.shoreGrassEnvelope),root);
    if(!brookShoulder)return this.boardwalkPlantContact39.relocate(placed,this.shoreGrassEnvelope,p=>suitable(p.x,p.z)&&!this.thresholdPlants.intersects(p,this.shoreGrassEnvelope)&&!getShoreStoneField(this.world).intersects(p,this.shoreGrassEnvelope));
    const asset=createBrookWetAsset(this.world,placed,[this.grassGeometries[0],this.grassGeometries[1],this.baseGrassGeometry],{physicalOnly:this.riverValleyWet&&valleyShoulderSuitable(this.world,x,z)});
    return asset?{...placed,brookShoulder:true,brookAsset:asset}:null;
  }
  generateGrassTileRoots(tx,tz) {
    const cached=this.meadowRootCache?.readTile(tx,tz);if(cached!==undefined)return cached;
    const size=MEADOW.tile,list=[];
    for(let iz=Math.floor(tz*size/MEADOW.cell);iz<Math.ceil((tz+1)*size/MEADOW.cell);iz++)
      for(let ix=Math.floor(tx*size/MEADOW.cell);ix<Math.ceil((tx+1)*size/MEADOW.cell);ix++){
        const p=this.grassAt(ix,iz);if(p)list.push(p); // Ownership stays with the source cell even when a rock moves the root across a tile edge.
      }
    return list;
  }
  buildGrassTile(tx,tz,camera) {
    const key=tx+","+tz,size=MEADOW.tile,list=this.generateGrassTileRoots(tx,tz);
    const tile={tx,tz,list,regular:list.filter(p=>!p.brookAsset),wet:list.filter(p=>p.brookAsset),meshes:[],wetMeshes:[]};this.grassTiles.set(key,tile);this.grassRootsChanged=true;this.shoreStatsDirty=true;
    this.addGrassMesh(tile,1);
    const wetRange=MEADOW.farEnd+MEADOW.tile*.72+SHORE_PLANT_MAX_SHIFT;
    if(!this.meadowSourceRange39.enabled||Math.hypot((tx+.5)*size-camera.position.x,(tz+.5)*size-camera.position.z)<=wetRange){this.addBrookWetMeshes(tile);tile.wetPrepared=true;}
    if(Math.hypot((tx+.5)*size-camera.position.x,(tz+.5)*size-camera.position.z)<MEADOW.nearPrefetch)this.addGrassMesh(tile,0);
    if(Math.hypot((tx+.5)*size-camera.position.x,(tz+.5)*size-camera.position.z)<MEADOW.flowerRange+size*.72+6)this.addFlowers(tx,tz);return tile;
  }
  addGrassMesh(tile,lod) {
    if(tile.meshes[lod]||!tile.regular.length)return;
    const mesh=new THREE.InstancedMesh(createGrassFieldGeometry(this.grassGeometries[lod],tile.regular.length),this.grassMaterials[lod],tile.regular.length);
    mesh.onBeforeRender=mesh.onBeforeShadow=markGrassFieldRendered;
    tile.regular.forEach((p,i)=>{mesh.setMatrixAt(i,this.matrix(p));this.grassRootField.write(mesh.geometry.attributes.aMeadowRootField,i,p,mesh.geometry.attributes.aMeadowLandform,mesh.geometry.attributes.aMeadowCommunity);});mesh.instanceMatrix.needsUpdate=true;
    mesh.receiveShadow=true;mesh.castShadow=lod===0;
    if(lod===0){
      // Preserve geometry metadata, but do not merge every instance sphere:
      // refreshPlantBounds immediately replaces that result with the wind box.
      if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
      mesh.customDepthMaterial=this.grassDepth;refreshPlantBounds(mesh,tile.regular,this.uniforms.uWorldViewer.value,MEADOW.nearEnd);
    }else{mesh.computeBoundingSphere();mesh.boundingSphere.radius+=1;}
    tile.meshes[lod]=mesh;this.grassGroup.add(mesh);
  }
  setTerrainSurfaceContact(contact){this.terrainSurfaceContact=contact;}
  prepareBrookWetMaterials(){
    if(!this.brookWetMaterials){
      this.brookWetMaterials=[2,4,7].map(mode=>installBrookWetBatchMaterial(installGrassSurface(attachEcologyWind(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,side:THREE.DoubleSide}),this.uniforms,mode,true),this.uniforms.uGrassRootField)));
      this.brookWetDepth=[2,4,7].map((mode,i)=>installBrookWetBatchMaterial(depthFor(this.brookWetMaterials[i],this.uniforms,mode,true)));
      this.materials.push(...this.brookWetMaterials);
    }
  }
  addBrookWetMeshes(tile){
    if(!tile.wet.length)return;
    this.prepareBrookWetMaterials();
    tile.wetMeshes=[0,1,2].map(kind=>{
      const mesh=new THREE.Mesh(createBrookWetBatch(tile.wet,kind,this.grassRootField),this.brookWetMaterials[kind]);mesh.name='brook-root-mat-'+kind;
      mesh.castShadow=kind!==1;mesh.receiveShadow=true;mesh.customDepthMaterial=this.brookWetDepth[kind];this.grassGroup.add(mesh);return mesh;
    });
    refreshBrookWetContact(this.world,tile,this.terrainSurfaceContact);
  }
  disposeBrookWetTile(tile){for(const mesh of tile.wetMeshes||[]){this.grassGroup.remove(mesh);mesh.geometry.dispose();}for(const root of tile.wet||[])root.brookAsset.dispose();}
  flowerChoice(x,z,seed) {
    const cosmos=this.habitat(x,z,0),daisy=this.habitat(x,z,1),blue=this.habitat(x,z,2);
    if(cosmos>.035&&seed<Math.min(.91,cosmos*1.35))return{kind:"cosmos",pick:cellRandom(Math.floor(x*9),Math.floor(z*9),41)};
    const wild=Math.max(daisy,blue);
    if(seed<Math.min(.24,wild*.48))return{kind:"wildflower",pick:blue>daisy?.18:.72};
    return null;
  }
  addFlowers(tx,tz) {
    if(!this.flowerPools.length)return;
    const key=tx+","+tz;if(this.flowerTiles.has(key))return;
    const world=this.world.forestShoulderSourceWorld||this.world;
    const records=[],cell=.8,size=MEADOW.tile;
    for(let iz=Math.floor(tz*size/cell);iz<Math.ceil((tz+1)*size/cell);iz++)for(let ix=Math.floor(tx*size/cell);ix<Math.ceil((tx+1)*size/cell);ix++){
      const x=(ix+.2+.6*cellRandom(ix,iz,31))*cell,z=(iz+.2+.6*cellRandom(ix,iz,32))*cell;
      const valley=this.valleyBanks?.locate(x,z)?this.valleyBanks:null;
      const sourceExcluded=valley?rootExcluded({...this,world:valley.sourceWorld},x,z,.12):this.excluded(x,z,.12);
      if(Math.floor(x/size)!==tx||Math.floor(z/size)!==tz||sourceExcluded)continue;
      const choice=this.flowerChoice(x,z,cellRandom(ix,iz,33));if(!choice)continue;
      const options=this.flowerPools.filter(p=>p.variant.kind===choice.kind&&!/seed/.test(p.variant.id)).sort((a,b)=>a.variant.id.localeCompare(b.variant.id));
      const pool=options[Math.min(options.length-1,Math.floor(choice.pick*options.length))];if(!pool||pool.records.length>=pool.mesh.instanceMatrix.count)continue;
      const scale=.8+.38*cellRandom(ix,iz,35),source={pool,slot:pool.records.length,tile:key,id:"flower:"+ix+":"+iz,x,y:world.surface.heightAt(x,z)-.025,z,s:scale,rot:cellRandom(ix,iz,34)*Math.PI*2};
      if(!pool.shoreEnvelope){const high=this.flowerNearAssets?.variants.find(v=>v.id===pool.variant.id);pool.shoreEnvelope=createPlantEnvelope([...pool.variant.parts,...(high?.parts||[])].map(p=>p.geometry));}
      const suitable=(px,pz)=>!this.excluded(px,pz,.12)&&this.flowerChoice(px,pz,cellRandom(ix,iz,33))?.kind===choice.kind&&world.surface.normalAt(px,pz,1).y>.72;
      const bankSource=valley?valley.map({...source,y:valley.sourceWorld.surface.heightAt(x,z)-.025}):source;
      const shoreRecord=relocateShorePlant(world,bankSource,pool.shoreEnvelope,suitable);
      // The new authored yard circulation moves existing flowers into matching
      // adjacent habitat, just as grass roots do. Do not delete or resow them,
      // and do not extend this change to unrelated historical doorway layouts.
      const selected=(this.thresholdPlants.intersectsYard(shoreRecord,pool.shoreEnvelope)||this.thresholdPlants.intersectsLodge(shoreRecord,pool.shoreEnvelope)||this.thresholdPlants.intersectsGuest(shoreRecord,pool.shoreEnvelope))?this.thresholdPlants.relocate(shoreRecord,pool.shoreEnvelope,p=>suitable(p.x,p.z)&&!getShoreStoneField(this.world).intersects(p,pool.shoreEnvelope),source):shoreRecord;
      const boardwalkSelected=this.boardwalkPlantContact39.relocate(selected,pool.shoreEnvelope,p=>suitable(p.x,p.z)&&!this.thresholdPlants.intersects(p,pool.shoreEnvelope)&&!getShoreStoneField(this.world).intersects(p,pool.shoreEnvelope));
      const record=seatForestShoulderRoot(this.world,boardwalkSelected);
      pool.records.push(record);pool.mesh.setMatrixAt(record.slot,this.matrix(record));pool.dirtyMin=Math.min(pool.dirtyMin,record.slot);pool.dirtyMax=Math.max(pool.dirtyMax,record.slot+1);records.push(record);
    }
    this.flowerTiles.set(key,records);this.flowerRootsChanged=true;this.shoreStatsDirty=true;
  }
  removeFlowers(key) {
    for(const record of this.flowerTiles.get(key)||[]){
      const pool=record.pool,last=pool.records.pop();
      if(last!==record){pool.records[record.slot]=last;last.slot=record.slot;pool.mesh.setMatrixAt(last.slot,this.matrix(last));pool.dirtyMin=Math.min(pool.dirtyMin,last.slot);pool.dirtyMax=Math.max(pool.dirtyMax,last.slot+1);}
    }
    this.flowerTiles.delete(key);this.flowerRootsChanged=true;this.shoreStatsDirty=true;
  }
  syncPool(pool,wanted) {
    for(let i=pool.records.length-1;i>=0;i--){
      const record=pool.records[i];if(wanted.has(record.id)){wanted.delete(record.id);continue;}
      const last=pool.records.pop();
      if(last!==record){pool.records[i]=last;last.slot=i;pool.mesh.setMatrixAt(i,this.matrix(last));if(pool.meadowField)pool.meadowField.copyAt(i,pool.meadowField,pool.records.length);if(pool.meadowLandform)pool.meadowLandform.copyAt(i,pool.meadowLandform,pool.records.length);if(pool.meadowCommunity)pool.meadowCommunity.copyAt(i,pool.meadowCommunity,pool.records.length);pool.dirtyMin=Math.min(pool.dirtyMin,i);pool.dirtyMax=Math.max(pool.dirtyMax,i+1);}
    }
    for(const source of wanted.values()){
      if(pool.records.length>=pool.mesh.instanceMatrix.count)break;
      const record={...source,pool,slot:pool.records.length};pool.records.push(record);pool.mesh.setMatrixAt(record.slot,this.matrix(record));if(pool.meadowField)this.grassRootField.write(pool.meadowField,record.slot,source,pool.meadowLandform,pool.meadowCommunity);pool.dirtyMin=Math.min(pool.dirtyMin,record.slot);pool.dirtyMax=Math.max(pool.dirtyMax,record.slot+1);
    }
  }
  syncNearFlowers(camera) {
    const p=camera.position,anchor=Math.floor(p.x/4)+","+Math.floor(p.z/4);
    if(!this.flowerRootsChanged&&anchor===this.flowerNearAnchor)return;
    this.flowerNearAnchor=anchor;this.flowerRootsChanged=false;
    for(const near of this.flowerNearPools){
      const low=this.flowerPools.find(pool=>pool.variant.id===near.variant.id),wanted=new Map();
      for(const record of low?.records||[])if(Math.hypot(record.x-p.x,record.z-p.z)<MEADOW.flowerNearPrefetch)wanted.set(record.id,record);
      this.syncPool(near,wanted);
    }
  }
  syncBasalGrass(camera) {
    const p=camera.position,anchor=Math.floor(p.x/4)+","+Math.floor(p.z/4);
    if(!this.grassRootsChanged&&anchor===this.baseGrassAnchor)return;
    this.baseGrassAnchor=anchor;this.grassRootsChanged=false;const wanted=new Map();
    for(const tile of this.grassTiles.values())for(const root of (tile.regular||tile.list))if(Math.hypot(root.x-p.x,root.z-p.z)<31)wanted.set(root.id,root);
    this.syncPool(this.baseGrass,wanted);
  }
  publishMeadowPools(camera) {
    const p=camera.position,anchor=Math.floor(p.x/4)+","+Math.floor(p.z/4);
    for(const pool of [...this.flowerPools,...this.flowerNearPools,this.baseGrass]){
      const changed=pool.mesh.count!==pool.records.length||pool.dirtyMin<Infinity||pool.boundsAnchor!==anchor;
      pool.mesh.count=pool.records.length;
      if(changed){
        const range=pool===this.baseGrass?25:this.flowerNearPools.includes(pool)?MEADOW.flowerNearEnd:MEADOW.flowerRange;
        refreshPlantBounds(pool.mesh,pool.records,p,range);pool.boundsAnchor=anchor;
      }
      if(pool.dirtyMin<Infinity){
        // Keep earlier preparation batches dirty until Three has uploaded them.
        pool.mesh.instanceMatrix.addUpdateRange(pool.dirtyMin*16,(pool.dirtyMax-pool.dirtyMin)*16);pool.mesh.instanceMatrix.needsUpdate=true;
        if(pool.meadowField){pool.meadowField.addUpdateRange(pool.dirtyMin*4,(pool.dirtyMax-pool.dirtyMin)*4);pool.meadowField.needsUpdate=true;}
        if(pool.meadowLandform){pool.meadowLandform.addUpdateRange(pool.dirtyMin*4,(pool.dirtyMax-pool.dirtyMin)*4);pool.meadowLandform.needsUpdate=true;}
        if(pool.meadowCommunity){pool.meadowCommunity.addUpdateRange(pool.dirtyMin*4,(pool.dirtyMax-pool.dirtyMin)*4);pool.meadowCommunity.needsUpdate=true;}
        pool.dirtyMin=Infinity;pool.dirtyMax=0;
      }
    }
  }
  updateMeadow(camera,{deferPools=false}={}) {
    const p=camera.position,above=p.y-this.world.surface.heightAt(p.x,p.z),visible=above<95;
    this.grassGroup.visible=visible;this.baseGrass.mesh.visible=visible;for(const pool of [...this.flowerPools,...this.flowerNearPools])pool.mesh.visible=visible;
    if(!visible){this.grassAnchor="";this.grassQueue=[];return;}
    const tx=Math.floor(p.x/MEADOW.tile),tz=Math.floor(p.z/MEADOW.tile),anchor=Math.floor(p.x/4)+","+Math.floor(p.z/4);
    if(anchor!==this.grassAnchor){
      this.grassAnchor=anchor;const wanted=[],keep=new Set(),radius=(this.meadowSourceRange39?.farEnd??MEADOW.farEnd)+MEADOW.tile*.72+SHORE_PLANT_MAX_SHIFT,n=Math.ceil(radius/MEADOW.tile);
      for(let z=tz-n;z<=tz+n;z++)for(let x=tx-n;x<=tx+n;x++){
        const d=Math.hypot((x+.5)*MEADOW.tile-p.x,(z+.5)*MEADOW.tile-p.z);
        if(d>radius)continue;const key=x+","+z;keep.add(key);
        if(!this.grassTiles.has(key))wanted.push({x,z,d});
        else {
          const tile=this.grassTiles.get(key),needsNear=d<MEADOW.nearPrefetch&&!tile.meshes[0]&&tile.regular.length;
          const needsFlowers=d<MEADOW.flowerRange+MEADOW.tile*.72+6&&!this.flowerTiles.has(key);
          const needsWet=this.meadowSourceRange39?.enabled&&!tile.wetPrepared&&tile.wet.length&&d<=MEADOW.farEnd+MEADOW.tile*.72+SHORE_PLANT_MAX_SHIFT;
          if(needsNear||needsFlowers||needsWet)wanted.push({x,z,d,existing:true});
        }
      }
      this.grassWanted=keep;this.grassQueue=wanted.sort((a,b)=>a.d-b.d);
      for(const [key,tile] of this.grassTiles){
        const d=Math.hypot((tile.tx+.5)*MEADOW.tile-p.x,(tile.tz+.5)*MEADOW.tile-p.z);
        if(d>radius+MEADOW.tile*1.8){for(const mesh of tile.meshes)if(mesh){this.grassGroup.remove(mesh);disposeGrassFieldGeometry(mesh.geometry);mesh.dispose();}this.disposeBrookWetTile(tile);this.removeFlowers(key);this.grassTiles.delete(key);this.grassRootsChanged=true;}
        else {if(d>MEADOW.nearPrefetch+MEADOW.tile&&tile.meshes[0]){this.grassGroup.remove(tile.meshes[0]);disposeGrassFieldGeometry(tile.meshes[0].geometry);tile.meshes[0].dispose();tile.meshes[0]=null;}if(d>MEADOW.flowerRange+MEADOW.tile*1.4)this.removeFlowers(key);if(tile.meshes[0])refreshPlantBounds(tile.meshes[0],tile.regular,p,MEADOW.nearEnd);}
      }
    }
    const start=performance.now();let built=0;
    while(this.grassQueue.length&&built<2){
      const q=this.grassQueue.shift(),tile=this.grassTiles.get(q.x+","+q.z);
      if(tile){
        if(this.meadowSourceRange39?.enabled&&!tile.wetPrepared&&q.d<=MEADOW.farEnd+MEADOW.tile*.72+SHORE_PLANT_MAX_SHIFT){this.addBrookWetMeshes(tile);tile.wetPrepared=true;}
        if(q.d<MEADOW.nearPrefetch)this.addGrassMesh(tile,0);
        if(q.d<MEADOW.flowerRange+MEADOW.tile*.72+6)this.addFlowers(q.x,q.z);
      } else this.buildGrassTile(q.x,q.z,camera);
      built++;if(performance.now()-start>2.5)break;
    }
    let wetContactPending=0,wetContactUpdated=0;
    for(const tile of this.grassTiles.values())if(tile.wet?.some(r=>r.brookAsset.physicalOnly)){const result=refreshBrookWetContact(this.world,tile,this.terrainSurfaceContact);wetContactPending+=result.pending;wetContactUpdated+=result.updated;}
    this.stats.wetContactPending=wetContactPending;this.stats.wetContactUpdated=wetContactUpdated;
    for(const tile of this.grassTiles.values())for(let i=0;i<(tile.wetMeshes?.length||0);i++)tile.wetMeshes[i].visible=tile.wet.some(r=>Math.hypot(r.x-p.x,r.z-p.z)<[35,80,27][i]);
    this.syncNearFlowers(camera);this.syncBasalGrass(camera);
    if(!deferPools)this.publishMeadowPools(camera);
    this.stats.basalGrassTufts=this.baseGrass.records.length;this.stats.grassBuiltThisFrame=built;this.stats.grassPending=this.grassQueue.length;this.stats.grassChunks=this.grassTiles.size;
    this.stats.grassTufts=[...this.grassTiles.values()].reduce((n,t)=>n+t.list.length,0);
    this.stats.grassFieldSamples=this.grassRootField.samples;
    this.stats.grassFieldBytes=this.baseGrass.meadowField.array.byteLength+[...this.grassTiles.values()].reduce((n,t)=>n+t.meshes.reduce((bytes,m)=>bytes+(m?.geometry.attributes.aMeadowRootField.array.byteLength||0),0),0);
    this.stats.grassLandformBytes=this.baseGrass.meadowLandform.array.byteLength+[...this.grassTiles.values()].reduce((n,t)=>n+t.meshes.reduce((bytes,m)=>bytes+(m?.geometry.attributes.aMeadowLandform.array.byteLength||0),0),0);
    this.stats.grassCommunityBytes=this.baseGrass.meadowCommunity.array.byteLength+[...this.grassTiles.values()].reduce((n,t)=>n+t.meshes.reduce((bytes,m)=>bytes+(m?.geometry.attributes.aMeadowCommunity.array.byteLength||0),0),0);
    if(this.shoreStatsDirty){
      let moved=0,unresolved=0,thresholdMoved=0,thresholdUnresolved=0;for(const list of [...[...this.grassTiles.values()].map(t=>t.list),...this.flowerTiles.values()])for(const p of list){moved+=p.shoreMove?1:0;unresolved+=p.shoreUnresolved?1:0;thresholdMoved+=p.thresholdMove?1:0;thresholdUnresolved+=p.thresholdUnresolved?1:0;}
      this.stats.thresholdPlants={enabled:this.thresholdPlants.enabled,entries:this.thresholdPlants.entries.length,moved:thresholdMoved,unresolved:thresholdUnresolved};
      this.stats.shorePlantsMoved=moved;this.stats.shorePlantsUnresolved=unresolved;this.shoreStatsDirty=false;
    }
    this.stats.flowerPlants=this.flowerPools.reduce((n,pool)=>n+pool.records.length,0);this.stats.flowerNearPlants=this.flowerNearPools.reduce((n,pool)=>n+pool.records.length,0);
  }
  syncTreeDynamics(camera,{roots=true}={}) {
    if(this.treeRootOrder?.sync(this.nearTreeBatches,camera,this.treeBatchRevision)){this.treeBatchRevision++;roots=true;}
    if(this.treeRootOrder){this.stats.treeRootOrder=this.treeRootOrder.stats;this.stats.treeBatchRevision=this.treeBatchRevision;}
    if(roots)this.treeRootWind.update(this.nearTreeBatches,this.windField,this.uniforms.uWindTime.value,this.treeBatchRevision);
    this.middleBatched?.sync(this.nearTreeBatches,this.treeBatchRevision);
    if(this.gpuBrushes){this.gpuBrushes.sync(this.nearTreeBatches,camera.position);this.stats.needleGPU=this.gpuBrushes.stats;this.stats.treeNeedleTriangles=this.stats.treeNeedleShellTriangles+this.gpuBrushes.stats.triangles;}
    Object.assign(this.stats,{treeRootWindRoots:this.treeRootWind.stats.roots,treeRootWindCPUms:this.treeRootWind.stats.cpuMs,treeRootWindUploadBytes:this.treeRootWind.stats.bytes,treeRootWindBatches:this.treeRootWind.stats.batches});
  }
  finishPreparation(camera) {
    // No extra simulation tick or queue item. Publish the exact final wind state
    // and every completed lazy branch before shaders or the first scene render.
    this.publishMeadowPools(camera);this.syncTreeDynamics(camera);this.preparationTreeState=null;
    if(this.stats.preparation)this.stats.preparation.finalSyncs++;
  }
  update(camera,dt,{preparing=false}={}) {
    this.uniforms.uWindTime.value+=visualDelta(dt);if(this.treeWindCoefficients.value||this.treeWindCoefficientsStatic)updateTreeWindCoefficientPhase(this.treeWindPhase,this.uniforms.uWindTime.value);this.uniforms.uWorldViewer.value.copy(camera.position);const p=camera.position;
    this.windField.update(this.uniforms.uWindTime.value,p);this.stats.windFieldUpdates=this.windField.revisions;this.stats.windFieldCPUms=this.windField.lastRefreshMs;
    this.stats.windSampling={mode:"absolute-time-bracket-33",time:this.uniforms.uWindTime.value,start:this.windField.lastUpdate,end:(this.windField.sampleIndex+1)*this.windField.interval,blend:this.windField.uniforms.uWindFieldBlend.value};
    if(Math.hypot(p.x-this.last.x,p.z-this.last.y)>120){
      this.last.set(p.x,p.z);const wanted=[];
      for(let z=Math.floor((p.z-this.range)/384);z<=Math.floor((p.z+this.range)/384);z++)for(let x=Math.floor((p.x-this.range)/384);x<=Math.floor((p.x+this.range)/384);x++){
        const d=Math.hypot((x+.5)*384-p.x,(z+.5)*384-p.z);if(d<this.range+280&&!this.tiles.has(x+","+z))wanted.push({x,z,d});
      }
      this.queue=wanted.sort((a,b)=>a.d-b.d);
      for(const [key,t] of this.tiles)if(Math.hypot((t.tx+.5)*384-p.x,(t.tz+.5)*384-p.z)>this.range+650){if(t.mesh){this.group.remove(t.mesh);disposeFarTreeBatch(t.mesh);}this.tiles.delete(key);}
    }
    if(this.queue.length){const tile=this.queue.shift();this.buildTile(tile.x,tile.z);}
    if(Math.hypot(p.x-this.nearLast.x,p.z-this.nearLast.y)>12||Math.abs(p.y-(this.nearY??Infinity))>20){this.nearLast.set(p.x,p.z);this.nearY=p.y;this.rebuildNearTrees(camera);}
    this.syncActiveTrees(camera);
    if(preparing){
      const previous=this.preparationTreeState,branches=this.gpuBrushes?.branchCache?.stats;
      const rootsChanged=!previous||previous.revision!==this.treeBatchRevision||previous.x!==p.x||previous.y!==p.y||previous.z!==p.z;
      const branchesChanged=!previous||previous.built!==branches?.builtGroups||Boolean(branches?.error);
      const stats=this.stats.preparation??={iterations:0,dynamicSyncs:0,skippedDynamicSyncs:0,finalSyncs:0};stats.iterations++;
      // The first pass starts the lazy branch worker. Its cache pumps subsequent
      // groups independently, so unchanged invisible intermediate wind uploads
      // need not rescan every needle batch while static tiles are being built.
      if(rootsChanged||branchesChanged){this.syncTreeDynamics(camera,{roots:rootsChanged});stats.dynamicSyncs++;}
      else stats.skippedDynamicSyncs++;
      this.preparationTreeState={revision:this.treeBatchRevision,x:p.x,y:p.y,z:p.z,built:branches?.builtGroups};
    }else{this.syncTreeDynamics(camera);this.preparationTreeState=null;}
    this.updateMeadow(camera,{deferPools:preparing});this.forestFloor.update(camera);this.reachBankCover39.update(camera,this.terrainSurfaceContact);this.stats.reachBankCover39=this.reachBankCover39.stats;Object.assign(this.stats,{forestShrubs:this.forestFloor.stats.shrubs,forestFerns:this.forestFloor.stats.ferns,wetBankSedges:this.forestFloor.stats.sedges,forestDeadwood:this.forestFloor.stats.deadwood,forestStones:this.forestFloor.stats.stones,forestFloorTriangles:this.forestFloor.stats.triangles,forestFloorPending:this.forestFloor.stats.pending,forestFloorRevision:this.forestFloor.stats.revision,forestFloorChunks:this.forestFloor.stats.chunks,forestFloorBuiltThisFrame:this.forestFloor.stats.builtThisFrame,forestFloorBatches:this.forestFloor.submission.stats});
    this.stats.treeChunks=this.tiles.size;this.stats.trees=[...this.tiles.values()].reduce((n,t)=>n+t.count,0);this.stats.pending=this.queue.length+this.grassQueue.length+this.forestFloor.stats.pending+this.reachBankCover39.stats.pending;
  }
  dispose() {
    this.middleBatched?.dispose();this.crownRootMask?.dispose();this.treeLoadController?.abort();this.earlyTreeTextures?.dispose();this.canopyCapture?.dispose();this.rootCache.dispose();this.forestLayout.dispose();
    if(this.gpuBrushes){this.group.remove(this.gpuBrushes.group);this.gpuBrushes.dispose();this.gpuBrushes=null;}
    for(const tile of this.grassTiles.values())this.disposeBrookWetTile(tile);
    this.brookWetDepth?.forEach(m=>m.dispose());
    this.reachBankCover39.dispose();this.group.remove(this.reachBankCover39.group);releaseShoreStoneField(this.world);this.windField.dispose();this.forestFloor.dispose();this.group.remove(this.forestFloor.group);
    for(const tile of this.tiles.values())disposeFarTreeBatch(tile.mesh);
    const depths=new Set([this.grassDepth,...this.nearParts.map(p=>p.mesh.customDepthMaterial)]);
    this.group.traverse(o=>{if(o.isInstancedMesh){disposeGrassFieldGeometry(o.geometry);o.dispose();}if(o.customDepthMaterial)depths.add(o.customDepthMaterial);});
    depths.forEach(m=>m.dispose());this.farGeometry.dispose();this.grassGeometries.forEach(g=>g.dispose());this.baseGrassGeometry.dispose();
    this.nearParts.forEach(({mesh})=>mesh.dispose());
    for(const batch of this.nearTreeBatches.values()){batch.view?.dispose();disposeTreeWindGeometry(batch.mesh.geometry);if(batch.view)batch.mesh.dispose();}
    this.nearTreeBatches.clear();this.treeRootWind.dispose();
    if(this.spruceGeometryPool)this.spruceGeometryPool.dispose();else new Set(this.nearParts.map(p=>p.mesh.geometry)).forEach(g=>g.dispose());
    // Flower assets own their materials and geometries.
    const flowerMaterials=new Set([...(this.flowerAssets?.materials||[]),...(this.flowerNearAssets?.materials||[])]);
    for(const m of new Set(this.materials))if(!flowerMaterials.has(m)&&!this.forestFloor.materials.includes(m)&&!this.reachBankCover39.materials.includes(m))m.dispose();
    this.farAssets?.dispose();this.flowerAssets?.dispose();this.flowerNearAssets?.dispose();this.treeSourceTextures?.forEach(t=>t.dispose());this.spruceSharedImages?.dispose();this.group.clear();
    this.meadowRootCache.dispose();this.grassRootField.dispose();this.grassTiles.clear();this.tiles.clear();this.flowerTiles.clear();this.floraLocal=null;this.floraCore=null;
  }
}
