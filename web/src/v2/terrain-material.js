import * as THREE from "three";
import { forestScanMean, FOREST_SCAN_GLSL } from "./terrain-forest-scan.js";
import { shoreMaterialVariation, SHORE_MATERIAL_GLSL, SHORE_ELEVATION } from "./shore-material.js";
import { surfaceTransitionVariation, SURFACE_TRANSITION_GLSL } from "./surface-transition.js";
import { bindMeadowField, MEADOW_SURFACE_GLSL, MEADOW_GROUND_REFERENCE_GLSL, MEADOW_FIELD_GLSL, meadowWorldVariation, MEADOW_LANDFORM_GLSL, meadowLandformVariation, meadowCommunityVariation, MEADOW_COMMUNITY_GLSL } from "./meadow-surface.js";

// Metres per tile. The material is sampled in world space, independently of
// terrain meshes, so a LOD transition cannot move a patch of grass or rock.
const RESOLUTION = 512;
const PERIODS = { grass: 2, soil: 2, rock: 4, forest: 2 };
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
let cachedPixels;
// Surface cover is independent of the moisture/root exclusion envelope. A wet
// meadow shoulder is not automatically exposed mud. Reload A/B retains v22.
// Physical-height coverage evaluated after interpolation; v24 restores the exact
// vertex-covered field. No water, wetness, root footprint or geometry is changed.
export const TERRAIN_SHORE_SAMPLING=new URLSearchParams(globalThis.location?.search||"").get("shoreSampling")==="v24"||SHORE_ELEVATION==="v18"?"v24":"fragment";
export function terrainFragmentBedCoverage(radialBed,clearance,mode=TERRAIN_SHORE_SAMPLING){
  return mode==="v24"?radialBed:radialBed*(1-smooth(.02,.12,clearance));
}
export const TERRAIN_SHORE_COVER=new URLSearchParams(globalThis.location?.search||"").get("shoreCover")==="v22"?"v22":"v23";
export function terrainBankExposure(bank,bed,slope,community,canopy,profile=TERRAIN_SHORE_COVER){
  if(profile==="v22")return bank;
  const living=(1-smooth(.12,.74,bed))*(1-smooth(.22,.52,slope))
    *smooth(.12,.76,community*.72+canopy*.28);
  return bank*(1-living*.92);
}


// Source G merges bare ground and sparse vegetation. It is not a measured
// rock mask: low gentle ground remains soil/grass, while slopes and alpine
// terrain increase mineral exposure. Keep this derivation shared with CPU tint.
export function terrainRockFraction(bare, slope, altitude) {
  const cliff = smooth(0.66, 0.9, slope) * (0.12 + 0.38 * bare);
  return clamp01(bare * (0.04 + 0.56 * smooth(0.10, 0.42, slope)
    + 0.40 * smooth(2800, 3500, altitude)) + cliff * (1 - bare));
}

// A/B control only changes zero-weight texture work, not visible material math.
// Keep the uniform accessible from an existing WorldTerrain.material in devtools.
// Whole-candidate A/B: restores legacy patch switching and four scan reads.
export function setTerrainForestContinuity(material, enabled) {
  if(typeof enabled!=="boolean")throw new TypeError("Forest continuity expects a boolean");
  const uniform=material.userData.terrainForestContinuity;
  if(!uniform)throw new TypeError("Material has no forest continuity control");
  uniform.value=enabled?1:0;return enabled;
}

export function setTerrainRockSamplingOptimization(material, enabled) {
  if(typeof enabled!=="boolean")throw new TypeError("Rock sampling control expects a boolean");
  const uniform=material.userData.terrainSkipZeroRockSamples;
  if(!uniform)throw new TypeError("Material has no terrain rock sampling control");
  uniform.value=enabled?1:0;
  return enabled;
}

// r186 declares vColor as vec4 even for RGB geometry, while its RGB morph
// chunk still adds vec3 to the whole varying. Repair only this material's
// expanded chunk; leave Three.js and every other material unchanged.
export function terrainMorphColorChunk() {
  const source = THREE.ShaderChunk.morphcolor_vertex;
  return source.replace(/vColor(\s*\+=\s*getMorph\([^;]*?\)\.rgb\s*\*\s*morphTargetInfluences\[\s*i\s*\]\s*;)/g, "vColor.rgb$1");
}

function hash(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(u, v, period, seed = 0) {
  const x = Math.floor(u), y = Math.floor(v);
  let a = u - x, b = v - y;
  a = a * a * a * (a * (a * 6 - 15) + 10);
  b = b * b * b * (b * (b * 6 - 15) + 10);
  const h = (i, j) => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const p = h(x, y), q = h(x + 1, y), r = h(x, y + 1), s = h(x + 1, y + 1);
  return (p + (q - p) * a) * (1 - b) + (r + (s - r) * a) * b;
}
function field() {
  const n = RESOLUTION * RESOLUTION;
  return { height: new Float32Array(n), tone: new Float32Array(n), variant: new Float32Array(n) };
}
function grassField() {
  const f = field(), n = RESOLUTION;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, u = i / n, v = j / n;
    const tuft = noise(u * 12, v * 12, 12, 4), grain = noise(u * 96, v * 96, 96, 7);
    f.height[k] = tuft * 0.25 + grain * 0.08;
    f.tone[k] = 0.22 + tuft * 0.3 + grain * 0.1;
    f.variant[k] = 0.08;
  }
  // Overlapping, tapered leaf ribbons, with a small amount of dry litter.
  // No directional light or cast shadow is baked into the colour.
  for (let b = 0; b < 3800; b++) {
    const x = hash(b, 0, 12) * n, y = hash(b, 1, 12) * n;
    const angle = hash(b, 2, 12) * TAU, dx = Math.cos(angle), dy = Math.sin(angle);
    const length = 7 + hash(b, 3, 12) * 26, width = 0.7 + hash(b, 4, 12) * 0.85;
    const bend = (hash(b, 5, 12) - 0.5) * 9, dry = hash(b, 6, 12) > 0.89;
    const tone = 0.38 + hash(b, 7, 12) * 0.38, samples = Math.ceil(length * 1.5);
    for (let s = 0; s <= samples; s++) {
      const t = s / samples, radius = width * (0.3 + 0.7 * Math.sin(Math.PI * t));
      const px = x + dx * length * t - dy * bend * t * t, py = y + dy * length * t + dx * bend * t * t;
      for (let j = Math.floor(py - radius - 1); j <= Math.ceil(py + radius + 1); j++) {
        for (let i = Math.floor(px - radius - 1); i <= Math.ceil(px + radius + 1); i++) {
          const d = Math.hypot(i - px, j - py), a = 1 - smooth(radius * 0.2, radius + 0.65, d);
          if (a <= 0) continue;
          const k = ((j % n + n) % n) * n + ((i % n + n) % n);
          const lift = (0.4 + 0.3 * Math.sin(Math.PI * t)) * a;
          f.height[k] = Math.max(f.height[k], lift);
          f.tone[k] += (tone - f.tone[k]) * a * 0.8;
          f.variant[k] += ((dry ? 0.95 : 0.05) - f.variant[k]) * a;
        }
      }
    }
  }
  return f;
}
function soilField() {
  const f = field(), n = RESOLUTION;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, u = i / n, v = j / n;
    const clod = noise(u * 18, v * 18, 18, 21), fine = noise(u * 96, v * 96, 96, 22);
    const grain = hash(i, j, 23);
    f.height[k] = 0.56 * clod + 0.2 * fine + grain * 0.055;
    f.tone[k] = 0.25 + 0.32 * clod + 0.16 * fine + (grain - 0.5) * 0.075;
    f.variant[k] = fine;
  }
  // Small rounded mineral grains are sparse; this remains soil, not gravel.
  for (let p = 0; p < 1150; p++) {
    const x = hash(p, 1, 25) * n, y = hash(p, 2, 25) * n;
    const radius = 0.7 + hash(p, 3, 25) ** 2 * 3.4, aspect = 0.6 + hash(p, 4, 25) * 0.6;
    const tone = 0.42 + hash(p, 5, 25) * 0.25;
    for (let j = Math.floor(y - radius - 1); j <= Math.ceil(y + radius + 1); j++) {
      for (let i = Math.floor(x - radius - 1); i <= Math.ceil(x + radius + 1); i++) {
        const d = Math.hypot((i - x) / radius, (j - y) / (radius * aspect));
        const a = 1 - smooth(0.65, 1.15, d);
        if (a <= 0) continue;
        const k = ((j % n + n) % n) * n + ((i % n + n) % n);
        f.height[k] = Math.max(f.height[k], 0.6 + a * 0.25);
        f.tone[k] += (tone - f.tone[k]) * a;
        f.variant[k] += (0.85 - f.variant[k]) * a;
      }
    }
  }
  return f;
}

function forestField() {
  const f=field(),n=RESOLUTION;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,u=i/n,v=j/n;
    const clod=noise(u*16,v*16,16,61),grain=noise(u*96,v*96,96,62);
    const moss=smooth(.50,.72,noise(u*5,v*5,5,63));
    f.height[k]=.18+clod*.24+grain*.08+moss*(.10+grain*.13);
    f.tone[k]=.16+clod*.28+grain*.09+moss*.07;
    // A<.3 is small moss cushions; A~.5 is humus; A>.7 is dry needle litter.
    f.variant[k]=.50-moss*.37;
  }
  // Needles are 1.5–4.5 cm long at the 2 m physical texture period.
  // This is albedo/height detail, with no directional shadow baked into the map.
  for(let needle=0;needle<11000;needle++){
    const x=hash(needle,0,64)*n,y=hash(needle,1,64)*n,angle=hash(needle,2,64)*TAU;
    const dx=Math.cos(angle),dy=Math.sin(angle),length=4+hash(needle,3,64)*8;
    const width=.32+hash(needle,4,64)*.28,tone=.34+hash(needle,5,64)*.13,samples=Math.ceil(length*1.2);
    for(let s=0;s<=samples;s++){
      const t=s/samples,px=x+dx*length*t,py=y+dy*length*t,radius=width*(.35+.65*Math.sin(Math.PI*t));
      for(let j=Math.floor(py-1);j<=Math.ceil(py+1);j++)for(let i=Math.floor(px-1);i<=Math.ceil(px+1);i++){
        const coverage=1-smooth(radius*.15,radius+.55,Math.hypot(i-px,j-py));if(coverage<=0)continue;
        const k=((j%n+n)%n)*n+((i%n+n)%n);
        f.height[k]=Math.max(f.height[k],.42+.18*coverage);
        f.tone[k]+=(tone-f.tone[k])*coverage;
        f.variant[k]+=(.94-f.variant[k])*coverage;
      }
    }
  }
  return f;
}

function rockField() {
  const f = field(), n = RESOLUTION, cells = 8;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, u = i / n, v = j / n;
    const x = u * cells + (noise(u * 12, v * 12, 12, 36) - 0.5) * 0.9;
    const y = v * cells + (noise(u * 12, v * 12, 12, 37) - 0.5) * 0.9;
    const ix = Math.floor(x), iy = Math.floor(y);
    let first = 10, second = 10;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const cx = ix + a, cy = iy + b, hx = (cx + cells) % cells, hy = (cy + cells) % cells;
      const d = Math.hypot(cx + hash(hx, hy, 30) - x, cy + hash(hx, hy, 31) - y);
      if (d < first) { second = first; first = d; } else if (d < second) second = d;
    }
    const seam = (1 - smooth(0.012, 0.065, second - first))
      * (1 - smooth(0.42, 0.78, noise(u * 13, v * 13, 13, 38)));
    const broad = noise(u * 8, v * 8, 8, 33), grain = noise(u * 100, v * 100, 100, 34);
    const band = Math.sin((v * 17 + noise(u * 6, v * 6, 6, 35) * 0.75) * TAU) * 0.5 + 0.5;
    f.height[k] = 0.33 + broad * 0.27 + band * 0.12 + grain * 0.1 - seam * 0.14;
    f.tone[k] = 0.33 + broad * 0.21 + band * 0.09 + grain * 0.12 - seam * 0.09;
    f.variant[k] = grain * 0.7 + broad * 0.3;
  }
  return f;
}
function pack(f, period, amplitude) {
  const n = RESOLUTION, data = new Uint8Array(n * n * 4);
  const scale = amplitude * n / (period * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, o = k * 4;
    const dx = (f.height[j * n + (i + 1) % n] - f.height[j * n + (i + n - 1) % n]) * scale;
    const dz = (f.height[((j + 1) % n) * n + i] - f.height[((j + n - 1) % n) * n + i]) * scale;
    data[o] = Math.round(clamp01(f.tone[k]) * 255);
    data[o + 1] = Math.round(clamp01(dx * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round(clamp01(dz * 0.5 + 0.5) * 255);
    data[o + 3] = Math.round(clamp01(f.variant[k]) * 255);
  }
  return data;
}
function makeTextures() {
  if(!cachedPixels){
    const layers=[
      pack(grassField(), PERIODS.grass, 0.025),
      pack(soilField(), PERIODS.soil, 0.022),
      pack(rockField(), PERIODS.rock, 0.065),
      pack(forestField(), PERIODS.forest, 0.018),
    ];
    cachedPixels=new Uint8Array(RESOLUTION*RESOLUTION*4*layers.length);
    layers.forEach((pixels,layer)=>cachedPixels.set(pixels,layer*RESOLUTION*RESOLUTION*4));
  }
  // All four fields have identical dimensions and linear channels. Independent
  // array layers retain their original pixels, wrap edges and mipmaps, while
  // reserving sampler units for morph targets, room shadows and scan detail.
  const texture=new THREE.DataArrayTexture(cachedPixels,RESOLUTION,RESOLUTION,4);
  texture.name="Terrain grass soil rock forest packed layers";
  texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
  return {packed:texture};
}

const VERTEX_DECLARATIONS = /* glsl */`
attribute vec3 terrainCover;
attribute vec4 terrainHydrology;
attribute float terrainShoreDistance;
attribute vec4 terrainLandform;
attribute vec4 terrainCommunity;
#ifdef USE_MORPHTARGETS
attribute vec4 terrainLandformDelta;
attribute vec4 terrainCommunityDelta;
attribute float terrainShoreDistanceDelta;
#endif
varying vec4 vTerrainLandform;
varying vec4 vTerrainCommunity;
varying vec3 vTerrainWorldPosition;
varying vec3 vTerrainWorldNormal;
varying vec3 vTerrainCover;
varying vec4 vTerrainHydrology;
varying float vTerrainShoreDistance;
`;
const FRAGMENT_DECLARATIONS = "#define MEADOW_FRAGMENT\n" + MEADOW_FIELD_GLSL + MEADOW_SURFACE_GLSL + MEADOW_LANDFORM_GLSL + MEADOW_COMMUNITY_GLSL + SHORE_MATERIAL_GLSL + SURFACE_TRANSITION_GLSL + /* glsl */`
varying vec4 vTerrainLandform;
varying vec4 vTerrainCommunity;
uniform float terrainSkipZeroRockSamples;
uniform float terrainShoreRoots;
uniform float terrainShoreEcotone;
uniform float terrainOrganicBank;
uniform float terrainShoreFootprint;
uniform float terrainOrganicContinuity;
uniform float terrainRootHorizon;
uniform float terrainPoreFilm;
uniform highp sampler2DArray terrainPackedFields;
uniform highp sampler2DArray terrainScanColors;
uniform highp sampler2DArray terrainScanNormals;
uniform float terrainReferencesReady;
varying vec3 vTerrainWorldPosition;
varying vec3 vTerrainWorldNormal;
varying vec3 vTerrainCover;
varying vec4 vTerrainHydrology;
varying float vTerrainShoreDistance;
${FOREST_SCAN_GLSL}

float terrainRockFraction(float bare, float slope, float altitude) {
  float cliff = smoothstep(0.66, 0.9, slope) * (0.12 + 0.38 * bare);
  return clamp(bare * (0.04 + 0.56 * smoothstep(0.10, 0.42, slope)
    + 0.40 * smoothstep(2800.0, 3500.0, altitude)) + cliff * (1.0 - bare), 0.0, 1.0);
}
float terrainHash(vec2 p) {
  vec3 a = fract(vec3(p.xyx) * 0.1031);
  a += dot(a, a.yzx + 33.33);
  return fract((a.x + a.y) * a.z);
}
float terrainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(terrainHash(i), terrainHash(i + vec2(1, 0)), f.x),
             mix(terrainHash(i + vec2(0, 1)), terrainHash(i + vec2(1, 1)), f.x), f.y);
}
// Two differently oriented, incommensurate projections suppress visible tiling.
// Gradients are rotated back into the physical plane before being blended.
vec4 terrainSample(float layer, vec2 p, float blend) {
  mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
  mat2 inverseRotation = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 a = texture(terrainPackedFields, vec3(p + vec2(0.137, 0.619),layer));
  vec4 b = texture(terrainPackedFields, vec3(rotation * p * 1.371 + vec2(0.735, 0.284),layer));
  a.gb = a.gb * 2.0 - 1.0;
  b.gb = inverseRotation * (b.gb * 2.0 - 1.0) * 1.371;
  return mix(a, b, blend);
}

// Explicit world-plane gradients are calculated before any per-fragment guard.
// Both projections retain their original scale/orientation and anisotropic
// footprint, even at a quad where only some fragments need rock.
vec4 terrainSampleGrad(float layer, vec2 p, float blend, vec2 dx, vec2 dy) {
  mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
  mat2 inverseRotation = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 a = textureGrad(terrainPackedFields, vec3(p + vec2(0.137, 0.619),layer),dx,dy);
  vec4 b = textureGrad(terrainPackedFields, vec3(rotation * p * 1.371 + vec2(0.735, 0.284),layer),
      rotation*dx*1.371,rotation*dy*1.371);
  a.gb = a.gb * 2.0 - 1.0;
  b.gb = inverseRotation * (b.gb * 2.0 - 1.0) * 1.371;
  return mix(a, b, blend);
}

`;

const SURFACE_FRAGMENT = /* glsl */`
vec3 terrainN = normalize(vTerrainWorldNormal);
vec2 terrainXZ = vTerrainWorldPosition.xz;
vec2 terrainXZDX=dFdx(terrainXZ),terrainXZDY=dFdy(terrainXZ);
float terrainFootprint = max(length(terrainXZDX), length(terrainXZDY));
// Shared fixed-world features survive geometry LODs. Mip filtering removes only
// unresolved variation, while the leaf shader reads the same field at its root.
vec4 terrainMeadowFeatures=meadowCommunityFeatures(meadowFieldAt(terrainXZ),vTerrainCommunity);
float terrainMeso = 0.5 + (terrainMeadowFeatures.r - 0.5) * (1.0 - smoothstep(8.0, 30.0, terrainFootprint));
float terrainBlend = 0.3 + terrainMeadowFeatures.a * 0.4;
float terrainSurfaceStructure=surfaceTransitionStructure(terrainMeadowFeatures.r,terrainMeadowFeatures.g,terrainFootprint);
float terrainForest = smoothstep(0.12, 0.9, vTerrainCover.r);
// Keep the exact grass-root field on both sides of a forest boundary. The old
// branch jumped to a second square-lattice field at forest>.001, even where
// the forest material weight was almost zero. Retain it only for live A/B.
if(terrainForestContinuity<.5 && terrainForest>.001){
  vec2 terrainWarp=vec2(terrainNoise(terrainXZ/81.),terrainNoise(terrainXZ/81.+29.7));
  float terrainPatch=terrainNoise(terrainXZ/13.+terrainWarp*1.8);
  terrainMeso=.5+(terrainPatch-.5)*(1.-smoothstep(8.,30.,terrainFootprint));
  terrainBlend=.3+terrainNoise(terrainXZ/7.3)*.4;
}
vec4 terrainGrassValue = terrainSample(0., terrainXZ / 2.0, terrainBlend);
vec4 terrainSoilValue = terrainSample(1., terrainXZ / 2.0 + 0.38, 0.64 - terrainBlend * 0.3);
float terrainSnow = smoothstep(0.1, 0.9, vTerrainCover.b);
// Shared sward structure interrupts mixed soil/grass boundaries. Pure source
// classes and the source geography remain unchanged; this is surface layering.
float terrainBare = surfaceTransitionCoverage(clamp(vTerrainCover.g, 0.0, 1.0),
    -terrainSurfaceStructure,uSurfaceTransitionVariation*.65);

// All patch structure reuses the existing world field. No extra per-pixel noise.
vec4 terrainForestValue=vec4(.35,0.,0.,.5);
if(terrainForest>.001){
  if(terrainForestContinuity>.5) terrainForestValue=terrainSampleGrad(3.,terrainXZ/2.+vec2(.17,.43),terrainBlend,terrainXZDX/2.,terrainXZDY/2.);
  else terrainForestValue=terrainSample(3.,terrainXZ/2.0+vec2(.17,.43),terrainBlend);
}
float terrainSlope = 1.0 - max(terrainN.y, 0.0);
float terrainWetness = clamp(vTerrainHydrology.x, 0.0, 1.0);
// Only the channel and its immediate stony edge get river gravel. The
// wider low-strength hydrology margin is damp vegetation, not a bare beach.
// Vertex coverage alone linearly smears a low-water sample up an elevated
// triangle. The interpolated physical clearance rejects that impossible mud.
float terrainPhysicalBed=vTerrainHydrology.y*${TERRAIN_SHORE_SAMPLING==="v24"?"1.":"(1.-smoothstep(.02,.12,vTerrainHydrology.w))"};
// Rooted lip coverage must also remove its mineral classification; otherwise
// the later green blend hides a grey bed's base/normal rather than restoring
// the same physical meadow/forest material. Immersed bed remains exact.
// Use the existing physical bank horizon for root mats as well as humus.
// Otherwise the mineral, living and roughness chains disagree on the exposed
// millimetre-low triangle, producing a continuous bare rim beside rooted soil.
float terrainLipRoots=terrainShoreEcotone*terrainShoreRoots*mix(
    shoreEcotoneCover(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainSurfaceStructure),
    shoreEcotoneBankCover(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainSurfaceStructure,vTerrainShoreDistance),terrainRootHorizon);
terrainPhysicalBed*=1.-terrainLipRoots;
float terrainRiverBed = surfaceTransitionCoverage(smoothstep(0.55, 0.95, terrainPhysicalBed),
    -terrainSurfaceStructure,uSurfaceTransitionVariation*.9);
float terrainBank = surfaceTransitionCoverage(clamp(vTerrainHydrology.z, 0.0, 1.0),
    -terrainSurfaceStructure,uSurfaceTransitionVariation*.9);
// Existing metre-scale soil/grass fields break material boundaries; the actual
// hydrology mask still limits their footprint, without new stones or noise.
// Material exposure only: the physical bank and soil water content stay intact.
// Shared broad communities reconnect damp turf to the meadow, with small open
// sediment pockets. Steep cuts and the actual riverbed keep their bare surface.
float terrainRootCover=max(terrainLipRoots,terrainShoreRoots*shoreRootCover(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainSurfaceStructure));
float terrainBankLiving=(1.-smoothstep(.12,.74,terrainRiverBed))*(1.-smoothstep(.22,.52,terrainSlope))
    *smoothstep(.12,.76,terrainMeadowFeatures.r*.72+terrainMeadowFeatures.g*.28);
terrainBank*=1.-terrainBankLiving*${TERRAIN_SHORE_COVER==="v22"?"0.":".92"};
terrainBank*=1.-terrainRootCover;
float terrainShoreGrain=clamp(terrainSoilValue.a*.7+terrainMeadowFeatures.a*.3,0.,1.);
vec3 terrainShoreZones=shoreZones(terrainWetness,terrainPhysicalBed,terrainSlope,terrainMeadowFeatures.g);
// Saturated ground is not automatically mineral. Exposed forest shoulders
// retain organic soil horizons even where the slope excludes living turf.
// This changes soil eligibility, not geometric or physical height. Organic
// soil continues into the shallow wet fringe; deep/central bed remains mineral.
float terrainOrganicCover=terrainOrganicBank*mix(
    shoreOrganicCover(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainForest,terrainSurfaceStructure),
    shoreOrganicBankCover(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainForest,terrainSurfaceStructure,vTerrainShoreDistance),
    terrainShoreFootprint)*(1.-terrainSnow);
float terrainRockWeight = max(terrainRockFraction(terrainBare, terrainSlope, vTerrainWorldPosition.y), terrainRiverBed * 0.85) * (1.0 - terrainSnow);
// Fine sediment interrupts the mineral shoulder near the waterline. The bed
// centre and unrelated cliffs retain their existing mineral weight.
float terrainShoreMineral=terrainRiverBed*mix(.54,.84,terrainShoreGrain);
terrainRockWeight=mix(terrainRockWeight,max(terrainRockFraction(terrainBare,terrainSlope,vTerrainWorldPosition.y),terrainShoreMineral)*(1.-terrainSnow),uShoreMaterialVariation*terrainBank);
terrainRockWeight*=1.-terrainOrganicCover;
// Every nonzero blend, including tiny boundary weights, keeps the full surface.
// The disabled control performs the identical explicit-gradient work everywhere.
vec3 terrainRockDX=dFdx(vTerrainWorldPosition)/4.,terrainRockDY=dFdy(vTerrainWorldPosition)/4.;
vec3 terrainAxes = pow(abs(terrainN), vec3(4.0));
terrainAxes /= max(dot(terrainAxes, vec3(1.0)), 0.00001);
vec4 terrainRockX=vec4(0.),terrainRockY=vec4(0.),terrainRockZ=vec4(0.);
if(terrainSkipZeroRockSamples<.5 || terrainRockWeight!=0.){
  terrainRockX=terrainSampleGrad(2.,vTerrainWorldPosition.yz/4.,.43,terrainRockDX.yz,terrainRockDY.yz);
  terrainRockY=terrainSampleGrad(2.,terrainXZ/4.,.43,terrainRockDX.xz,terrainRockDY.xz);
  terrainRockZ=terrainSampleGrad(2.,vTerrainWorldPosition.xy/4.,.43,terrainRockDX.xy,terrainRockDY.xy);
}
vec4 terrainRockValue=terrainRockX*terrainAxes.x+terrainRockY*terrainAxes.y+terrainRockZ*terrainAxes.z;
float terrainSoilWeight = clamp(terrainBare * 0.42 + terrainForest * 0.56 + terrainBank * 0.32
    + smoothstep(0.72, 0.94, terrainMeso) * 0.12, 0.0, 0.8) * (1.0 - terrainSnow);
// Soil colour, its normal and roughness all consume this same weight below.
// Damp pores retain their physical wetness; no new bright or dark shore ring.
terrainSoilWeight=surfaceTransitionCoverage(terrainSoilWeight,-terrainSurfaceStructure,
    uSurfaceTransitionVariation*.6*(1.-terrainRiverBed)*(1.-terrainSnow));
vec3 terrainBase = mix(diffuseColor.rgb, vec3(0.11, 0.10, 0.075), terrainRiverBed * 0.78);
vec3 terrainMeadowTint = mix(vec3(0.96, 0.99, 0.97), vec3(1.04, 1.02, 0.96),
    smoothstep(0.18, 0.84, terrainMeso));
vec3 terrainGrassColor = terrainBase * terrainMeadowTint * (0.64 + terrainGrassValue.r * 0.64);
terrainGrassColor *= mix(vec3(1.0), vec3(1.23, 1.09, 0.81), terrainGrassValue.a * 0.42);
vec3 terrainSoilColor = mix(terrainBase, vec3(0.215, 0.168, 0.119), 0.7)
    * (0.7 + terrainSoilValue.r * 0.68);
vec3 terrainRockColor = mix(terrainBase, vec3(0.16, 0.15, 0.13), 0.45)
    * (0.68 + terrainRockValue.r * 0.66);
terrainRockColor *= mix(vec3(0.98, 1.0, 1.02), vec3(1.04, 1.01, 0.96), terrainRockValue.a);
// The leaf canopy and exposed ground now share the same ecological palette.
// Geographic exposure remains a bounded multiplier; forest, rock and snow keep
// their own surfaces. This is albedo, not a baked light/shadow correction.
float terrainSwardWeight=(1.-terrainForest)*(1.-terrainSnow)*(1.-terrainRockWeight)
    *(1.-terrainSoilWeight*.6)*smoothstep(.68,.9,terrainN.y);
vec3 terrainGeographicTint=clamp(terrainBase/${MEADOW_GROUND_REFERENCE_GLSL},vec3(.78),vec3(1.22));
// The shared response replaces part of the old ground-only macro tint, so
// exposure is not counted twice. Uniform zero restores the entire old path.
terrainGeographicTint=mix(terrainGeographicTint,vec3(1.),uMeadowLandformVariation*.45*(1.-terrainForest)*(1.-terrainSnow));
vec3 terrainCanopyColor=meadowCanopyColor(terrainMeadowFeatures)*terrainGeographicTint
    *(.74+terrainGrassValue.r*.40);
terrainGrassColor=mix(terrainGrassColor,terrainCanopyColor,terrainSwardWeight*.78);
terrainGrassColor*=meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity);
float terrainSward=terrainMeadowFeatures.g;
float terrainSwardResolved=meadowCanopyResolved(terrainFootprint);
float terrainSwardHeight=(terrainSward-.5)*.16*terrainSwardWeight*terrainSwardResolved;
// The low rooted mat has its own shallow relief, even under forest cover where
// the meadow sward weight is zero. It shares the exact existing tuft field and
// footprint, so the near material resolves continuously into its distant mean.
// This is at most 1.75 cm of shading relief, not raised collision geometry.
terrainSwardHeight+=(terrainSward-.5)*.035*terrainLipRoots*terrainSwardResolved;
terrainGrassColor*=mix(1.,mix(.88,1.06,smoothstep(.24,.76,terrainSward)),
    terrainSwardWeight*meadowColourResolved(terrainFootprint));
vec3 terrainLayeredColor = mix(mix(terrainGrassColor, terrainSoilColor, terrainSoilWeight),
    terrainRockColor, terrainRockWeight);
float terrainForestCover=terrainForest*(1.-terrainRockWeight)*(1.-terrainSnow)*(1.-terrainRiverBed);
float terrainNeedles=smoothstep(.64,.86,terrainForestValue.a);
float terrainMoss=(1.-smoothstep(.25,.43,terrainForestValue.a))
    *clamp(.4+terrainWetness*.55+(.5-terrainMeso)*.6,0.,1.)
    *(1.-smoothstep(.28,.56,terrainSlope));
float terrainLowGrass=smoothstep(.24,.72,terrainMeso)*(.32+.58*(1.-terrainForest));
float terrainLivingCover=smoothstep(.20,.66,terrainMeso+terrainWetness*.22)*(1.-terrainRiverBed)*(1.-smoothstep(.28,.56,terrainSlope));
vec3 terrainHumus=mix(vec3(.045,.046,.027),vec3(.081,.076,.044),terrainMeso);
vec3 terrainNeedleColor=mix(vec3(.080,.062,.033),vec3(.14,.111,.059),terrainForestValue.r);
vec3 terrainMossColor=mix(vec3(.053,.086,.028),vec3(.11,.155,.048),terrainForestValue.r);
vec3 terrainForestColor=mix(terrainHumus,terrainNeedleColor,terrainNeedles)*(.72+terrainForestValue.r*.60);
terrainForestColor=mix(terrainForestColor,terrainMossColor,max(terrainMoss,terrainLivingCover*.86));
terrainForestColor=mix(terrainForestColor,terrainGrassColor,terrainLowGrass);
// Existing CC0 scan detail enriches nearby forest material at its real metre scale.
// Sampling stays in world space; the fading only removes subpixel information.
float terrainOrganicFace=smoothstep(.12,.5,terrainSlope);
// Mineral classification no longer erases the scans beneath an organic skin.
// The same union controls retained DC and near residuals, so both waterline and
// the 32--90 m scan fade keep the same material identity.
float terrainForestSurface=mix(terrainForestCover,
    shoreForestSurfaceCover(terrainForestCover,terrainOrganicCover,terrainOrganicFace),terrainOrganicContinuity);
float terrainReferenceWeight=terrainReferencesReady*terrainForestSurface*(1.-smoothstep(32.,90.,distance(cameraPosition,vTerrainWorldPosition)));
float terrainScanLiving=clamp(terrainLivingCover*.88+terrainMoss*.12,0.,1.);
vec3 terrainScanMeanColor=mix(terrainScanMean[0]*vec3(.72,.81,.66),terrainScanMean[1]*vec3(.62,.82,.55),terrainScanLiving);
// Retain the scan DC component at every distance. Its fine residual and normal
// still use the original fade and original full-resolution image samples.
vec3 terrainProceduralForestColor=terrainForestColor;
terrainForestColor=mix(terrainForestColor,terrainScanMeanColor,
  .76*terrainReferencesReady*terrainForestSurface*terrainForestMeanContinuity);
vec3 terrainReferenceGradient=vec3(0.);
if(terrainReferenceWeight>.001){
  vec2 forestUV=terrainXZ/3.2,leafUV=mat2(.8,.6,-.6,.8)*terrainXZ/2.;
  vec3 litterScan,leafScan;vec2 litterSlope,leafSlope;
  if(terrainForestContinuity>.5){
    float scanBlend=.28+.44*terrainMeadowFeatures.a;
    terrainForestScan(0.,forestUV,terrainXZDX/3.2,terrainXZDY/3.2,scanBlend,litterScan,litterSlope);
    terrainForestScan(1.,leafUV,mat2(.8,.6,-.6,.8)*terrainXZDX/2.,mat2(.8,.6,-.6,.8)*terrainXZDY/2.,scanBlend,leafScan,leafSlope);
    leafSlope=mat2(.8,-.6,.6,.8)*leafSlope;
  }else{
    litterScan=texture(terrainScanColors,vec3(forestUV,0.)).rgb;
    leafScan=texture(terrainScanColors,vec3(leafUV,1.)).rgb;
    vec3 litterNormal=texture(terrainScanNormals,vec3(forestUV,0.)).xyz*2.-1.;
    vec3 leafNormal=texture(terrainScanNormals,vec3(leafUV,1.)).xyz*2.-1.;
    litterSlope=-litterNormal.xy/max(.35,litterNormal.z);
    leafSlope=mat2(.8,-.6,.6,.8)*(-leafNormal.xy/max(.35,leafNormal.z));
  }
  float living=clamp(terrainLivingCover*.88+terrainMoss*.12,0.,1.);
  vec3 scanColor=mix(litterScan*vec3(.72,.81,.66),leafScan*vec3(.62,.82,.55),living);
  vec3 legacyScanColor=mix(terrainProceduralForestColor,scanColor,.76*terrainReferenceWeight);
  vec3 continuousScanColor=terrainForestColor+(scanColor-terrainScanMeanColor)*.76*terrainReferenceWeight;
  terrainForestColor=mix(legacyScanColor,continuousScanColor,terrainForestMeanContinuity);
  terrainReferenceGradient=vec3(mix(litterSlope,leafSlope,living).x,0.,mix(litterSlope,leafSlope,living).y)*.32*terrainReferenceWeight;
}
terrainLayeredColor=mix(terrainLayeredColor,terrainForestColor,terrainForestCover);
vec3 terrainShoreSediment=mix(terrainSoilColor*vec3(.93,.98,1.02),terrainRockColor,terrainShoreGrain*.55);
float terrainShoreSoil=uShoreMaterialVariation*terrainBank*(1.-terrainRiverBed*.65)*(.20+.22*terrainShoreGrain);
terrainLayeredColor=mix(terrainLayeredColor,terrainShoreSediment,terrainShoreSoil);
vec3 terrainShoreLiving=mix(terrainMossColor,terrainGrassColor,smoothstep(.28,.7,terrainSward));
terrainLayeredColor=mix(terrainLayeredColor,terrainShoreLiving,uShoreMaterialVariation*terrainShoreZones.z*.55);
// A cut face exposes humus/soil; a shallow shoulder retains the same forest
// litter and moss as the surrounding floor. Existing mip-filtered fields keep
// this horizon continuous at distance, without a new thin noise stripe.
vec3 terrainOrganicSoil=mix(terrainHumus,terrainNeedleColor,.35+.35*terrainShoreGrain);
vec3 terrainOrganicColor=mix(terrainForestColor,terrainOrganicSoil,terrainOrganicFace);
terrainLayeredColor=mix(terrainLayeredColor,terrainOrganicColor,terrainOrganicCover);
// Roots reconnect the bank to the same meadow/forest patch, with matching
// normal and roughness below; this is not an extra line of stones or plants.
terrainLayeredColor=mix(terrainLayeredColor,terrainShoreLiving,terrainRootCover);
diffuseColor.rgb = mix(terrainLayeredColor, terrainBase * (0.96 + terrainGrassValue.r * 0.08), terrainSnow);
float terrainLegacyDamp=mix(1.0,0.66,terrainWetness*(0.35+0.65*terrainRiverBed));
// A merely damp margin stays porous; a saturated bed darkens without crushing
// all mineral/soil differences into the same black ribbon.
float terrainShoreDamp=shoreWetAlbedo(terrainWetness*(.45+.55*terrainRiverBed),terrainShoreGrain);
diffuseColor.rgb*=mix(terrainLegacyDamp,terrainShoreDamp,uShoreMaterialVariation);
float terrainGrassMicro=meadowMicroResolved(terrainFootprint);
vec3 terrainGrassGradient = vec3(terrainGrassValue.g, 0.0, terrainGrassValue.b) * 0.46 * terrainGrassMicro;
vec3 terrainSoilGradient = vec3(terrainSoilValue.g, 0.0, terrainSoilValue.b) * 0.62;
vec3 terrainRockGradient = vec3(0.0, terrainRockX.g, terrainRockX.b) * terrainAxes.x
    + vec3(terrainRockY.g, 0.0, terrainRockY.b) * terrainAxes.y
    + vec3(terrainRockZ.g, terrainRockZ.b, 0.0) * terrainAxes.z;
vec3 terrainGradient = mix(mix(terrainGrassGradient, terrainSoilGradient, terrainSoilWeight),
    terrainRockGradient * 0.72, terrainRockWeight) * (1.0 - terrainSnow * 0.8);
vec3 terrainForestGradient=mix(vec3(terrainForestValue.g,0.,terrainForestValue.b)*.55,terrainGrassGradient,terrainLowGrass);
terrainGradient=mix(terrainGradient,terrainForestGradient,terrainForestCover);
// Organic replacement used to erase the previously added scan normal.
// Carry it with the same horizontal organic horizon as its colour instead.
terrainGradient+=terrainReferenceGradient;
terrainGradient=mix(terrainGradient,mix(terrainForestGradient,terrainSoilGradient,terrainOrganicFace),terrainOrganicCover);
terrainGradient+=terrainReferenceGradient*terrainOrganicCover*(1.-terrainOrganicFace)*terrainOrganicContinuity;
terrainGradient=mix(terrainGradient,terrainGrassGradient,terrainRootCover);
// Convert screen derivatives of this shallow fixed-world height into a tangent
// gradient. It retains the true terrain slope and is filtered before subpixel aliasing.
vec3 terrainDX=dFdx(vTerrainWorldPosition),terrainDY=dFdy(vTerrainWorldPosition);
vec3 terrainR1=cross(terrainDY,terrainN),terrainR2=cross(terrainN,terrainDX);
float terrainDet=dot(terrainDX,terrainR1);
if(abs(terrainDet)>1e-8) terrainGradient+=(dFdx(terrainSwardHeight)*terrainR1+dFdy(terrainSwardHeight)*terrainR2)/terrainDet;
terrainGradient *= 1.0 - smoothstep(0.25, 1.7, terrainFootprint);
`;

export function createTerrainMaterial() {
  const textures = makeTextures();
  const referenceUniforms={terrainReferencesReady:{value:0},terrainScanColors:{value:null},terrainScanNormals:{value:null},terrainScanMean:{value:[new THREE.Vector3(),new THREE.Vector3()]}};
  const loadReferences=async()=>{
    // Arrays preserve each original 1K image and its independent mip borders.
    // Two fragment samplers leave room for all 3 portal + 3 CSM shadow maps
    // on WebGL2's guaranteed 16-unit fragment limit. No atlas-edge bleed.
    const loader=new THREE.ImageLoader();
    const names=["forest_ground_04_diff","leafy_grass_diff","forest_ground_04_nor_gl","leafy_grass_nor_gl"];
    const images=await Promise.all(names.map(name=>loader.loadAsync("./assets/v2/ground/"+name+"_1k.jpg")));
    const width=images[0].width,height=images[0].height;
    if(images.some(image=>image.width!==width||image.height!==height))throw new Error("Ground scan layers must share dimensions");
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("Cannot decode ground surface pixels");
    for(let group=0;group<2;group++){
      const data=new Uint8Array(width*height*4*2);
      for(let layer=0;layer<2;layer++){
        context.clearRect(0,0,width,height);context.drawImage(images[group*2+layer],0,0);
        const pixels=context.getImageData(0,0,width,height).data,rowBytes=width*4;
        if(group===0)referenceUniforms.terrainScanMean.value[layer].fromArray(forestScanMean(pixels));
        // DataArrayTexture uploads typed rows without TextureLoader's image
        // flip. Keep the original OpenGL normal-map orientation with its colour.
        for(let row=0;row<height;row++) data.set(
          pixels.subarray((height-1-row)*rowBytes,(height-row)*rowBytes),
          layer*width*height*4+row*rowBytes);
      }
      const texture=new THREE.DataArrayTexture(data,width,height,2);
      texture.name=group?"Forest normal scans":"Forest colour scans";
      texture.colorSpace=group?THREE.NoColorSpace:THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;
      const name=group?"terrainScanNormals":"terrainScanColors";
      textures[name]=texture;referenceUniforms[name].value=texture;
    }
    referenceUniforms.terrainReferencesReady.value=1;
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 });
  const meadowField=bindMeadowField(material);
  material.userData.shoreMaterialVariation=shoreMaterialVariation;
  material.userData.surfaceTransitionVariation=surfaceTransitionVariation;
  const rockSampling={value:1};material.userData.terrainSkipZeroRockSamples=rockSampling;
  const forestContinuity={value:1};material.userData.terrainForestContinuity=forestContinuity;
  const shoreRoots={value:new URLSearchParams(globalThis.location?.search||"").get("shoreRoots")==="v25"?0:1};
  const shoreEcotone={value:new URLSearchParams(globalThis.location?.search||"").get("shoreEcotone")==="v27"?0:1};
  material.userData.terrainShoreEcotone=shoreEcotone;
  const organicBank={value:new URLSearchParams(globalThis.location?.search||"").get("shoreOrganic")==="v28"?0:1};
  material.userData.terrainOrganicBank=organicBank;
  const shoreFootprint={value:new URLSearchParams(globalThis.location?.search||"").get("shoreFootprint")==="v28"?0:1};
  material.userData.terrainShoreFootprint=shoreFootprint;
  const organicContinuity={value:new URLSearchParams(globalThis.location?.search||"").get("organicContinuity")==="v29"?0:1};
  material.userData.terrainOrganicContinuity=organicContinuity;
  const rootHorizon={value:new URLSearchParams(globalThis.location?.search||"").get("rootHorizon")==="v30"?0:1};
  material.userData.terrainRootHorizon=rootHorizon;
  const poreFilm={value:new URLSearchParams(globalThis.location?.search||"").get("poreFilm")==="v31"?0:1};
  material.userData.terrainPoreFilm=poreFilm;
  const forestMean={value:new URLSearchParams(globalThis.location?.search||"").get("forestMean")==="v25"?0:1};
  material.userData.terrainShoreRoots=shoreRoots;
  material.userData.terrainForestMeanContinuity=forestMean;
  material.name = "GeographicTerrainPBR";
  material.customProgramCacheKey = () => "kalajun-terrain-root-horizon-v31-"+TERRAIN_SHORE_COVER+"-"+TERRAIN_SHORE_SAMPLING;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms,referenceUniforms);
    shader.uniforms.meadowSurfaceField=meadowField;
    shader.uniforms.uMeadowWorldVariation=meadowWorldVariation;
    shader.uniforms.uMeadowLandformVariation=meadowLandformVariation;
    shader.uniforms.uMeadowCommunityVariation=meadowCommunityVariation;
    shader.uniforms.uShoreMaterialVariation=shoreMaterialVariation;
    shader.uniforms.uSurfaceTransitionVariation=surfaceTransitionVariation;
    shader.uniforms.terrainSkipZeroRockSamples=rockSampling;
    shader.uniforms.terrainForestContinuity=forestContinuity;
    shader.uniforms.terrainShoreRoots=shoreRoots;
    shader.uniforms.terrainShoreEcotone=shoreEcotone;
    shader.uniforms.terrainOrganicBank=organicBank;
    shader.uniforms.terrainShoreFootprint=shoreFootprint;
    shader.uniforms.terrainOrganicContinuity=organicContinuity;
    shader.uniforms.terrainRootHorizon=rootHorizon;
    shader.uniforms.terrainPoreFilm=poreFilm;
    shader.uniforms.terrainForestMeanContinuity=forestMean;
    shader.uniforms.terrainPackedFields = { value: textures.packed };
    shader.vertexShader = VERTEX_DECLARATIONS + shader.vertexShader.replace("#include <worldpos_vertex>", `
#include <worldpos_vertex>
vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vTerrainCover = terrainCover;
vTerrainHydrology = terrainHydrology;
vTerrainShoreDistance = terrainShoreDistance;
vTerrainLandform = terrainLandform;
vTerrainCommunity = terrainCommunity;
#ifdef USE_MORPHTARGETS
vTerrainLandform += terrainLandformDelta * morphTargetInfluences[0];
vTerrainCommunity += terrainCommunityDelta * morphTargetInfluences[0];
vTerrainShoreDistance += terrainShoreDistanceDelta * morphTargetInfluences[0];
#endif
`);
    shader.vertexShader = shader.vertexShader.replace("#include <morphcolor_vertex>", terrainMorphColorChunk());
    shader.fragmentShader = FRAGMENT_DECLARATIONS + shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + SURFACE_FRAGMENT)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
float terrainCanopyRoughness=.93+(1.-terrainGrassMicro)*.025+(terrainMeadowFeatures.g-.5)*.02+meadowLandformRoughness(vTerrainLandform)+meadowCommunityRoughness(vTerrainCommunity);
roughnessFactor = clamp(mix(mix(terrainCanopyRoughness,.96,terrainSoilWeight), 0.87, terrainRockWeight)
    + (terrainSoilValue.r - 0.5) * 0.06*terrainSoilWeight, 0.8, 1.0);
roughnessFactor = mix(roughnessFactor, .97-terrainNeedles*.09-terrainMoss*.04, terrainForestCover);
float terrainLegacyWetRoughness=mix(roughnessFactor,.55,terrainWetness*max(terrainSoilWeight,terrainRiverBed)*.75);
// Exposed wet soil retains pores; saturation alone must not polish a ribbon.
// Preserve the earlier free-water response on genuinely submerged substrate.
float terrainSoilWetResponse=mix(
    shoreWetRoughness(roughnessFactor,terrainWetness,terrainShoreGrain),
    shorePorousRoughness(roughnessFactor,terrainWetness,terrainShoreGrain,vTerrainHydrology.w,vTerrainShoreDistance),terrainPoreFilm);
float terrainShoreRoughness=mix(roughnessFactor,terrainSoilWetResponse,max(terrainSoilWeight,terrainRiverBed)*(1.-terrainShoreZones.z*.7));
roughnessFactor=mix(terrainLegacyWetRoughness,terrainShoreRoughness,uShoreMaterialVariation);
float terrainOrganicDryRoughness=mix(terrainCanopyRoughness,.94,terrainOrganicFace);
float terrainOrganicWetRoughness=mix(
    shoreWetRoughness(terrainOrganicDryRoughness,terrainWetness,terrainShoreGrain),
    shoreOrganicRoughness(terrainOrganicDryRoughness,terrainWetness,terrainShoreGrain,vTerrainHydrology.w,vTerrainShoreDistance),terrainOrganicContinuity);
roughnessFactor=mix(roughnessFactor,terrainOrganicWetRoughness,terrainOrganicCover);
roughnessFactor=mix(roughnessFactor,terrainCanopyRoughness,terrainRootCover);
roughnessFactor = mix(roughnessFactor, 0.84, terrainSnow);
`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec3 terrainPerturbed = normalize(terrainN - terrainGradient + terrainN * dot(terrainGradient, terrainN));
normal = normalize(mat3(viewMatrix) * terrainPerturbed);
`);
  };
  return { material, textures, loadReferences };
}
