// Shared GLSL chunks. Uniform objects live in world.js; every material that includes
// these chunks spreads `worldUniforms` (and `atmos`) into its uniforms.

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
// integer-hash value noise: the same bits in JS (windfield.js), so CPU and GPU wind agree
float wnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  uvec2 c = uvec2(ivec2(i));
  uvec2 m = uvec2(1597334673u, 3812015801u);
  uvec2 a0 = c * m, a1 = (c + uvec2(1u, 0u)) * m, a2 = (c + uvec2(0u, 1u)) * m, a3 = (c + uvec2(1u, 1u)) * m;
  float h0 = float((a0.x ^ a0.y) * 1597334673u) / 4294967295.0;
  float h1 = float((a1.x ^ a1.y) * 1597334673u) / 4294967295.0;
  float h2 = float((a2.x ^ a2.y) * 1597334673u) / 4294967295.0;
  float h3 = float((a3.x ^ a3.y) * 1597334673u) / 4294967295.0;
  return mix(mix(h0, h1, u.x), mix(h2, h3, u.x), u.y);
}
// a smooth random signal in time (-1..1), never repeating: replaces sine "metronome" sway
float tnoise(float t, float seed) {
  return (wnoise(vec2(t, seed * 13.7)) * 0.7 + wnoise(vec2(t * 2.3 + 5.0, seed * 7.1)) * 0.3) * 2.0 - 1.0;
}
float fbm(vec2 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.3;
    a *= 0.5;
  }
  return s;
}
`;

// the pad map's step (metres per unit of its 8-bit texels): cuts up to 7.6 m into a slope
export const PAD_STEP = 0.03;

export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uCoreH;
uniform sampler2D uFarH;
uniform float uCoreHalf;
uniform float uCoreRes;
uniform float uFarHalf;
uniform float uFarRes;
uniform float uCoreN;
uniform float uFarN;

float sampleGrid(sampler2D tex, vec2 p, float half_, float res, float n) {
  vec2 u = (p + half_) / res - 0.5;
  vec2 i0 = floor(u);
  vec2 f = u - i0;
  ivec2 a = ivec2(clamp(i0, vec2(0.0), vec2(n - 1.0)));
  ivec2 b = ivec2(clamp(i0 + 1.0, vec2(0.0), vec2(n - 1.0)));
  float h00 = texelFetch(tex, ivec2(a.x, a.y), 0).r;
  float h10 = texelFetch(tex, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(tex, ivec2(a.x, b.y), 0).r;
  float h11 = texelFetch(tex, ivec2(b.x, b.y), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// weight of the core grid (1 inside, fading to 0 over the last 600 m)
float coreWeight(vec2 p) {
  vec2 d = uCoreHalf - abs(p);
  return smoothstep(0.0, 600.0, min(d.x, d.y));
}

// 1 m detail square around the camps (tools/detail_terrain.py): r = height delta,
// g = trail dirt, b = exposed earth on cut banks / gully walls, a = terracette mask.
uniform sampler2D uDetail;
uniform vec2 uDetailOrigin;
uniform float uDetailSize;
uniform float uDetailScale;   // (detail.json: metres per step of its height channel)
vec4 detailAt(vec2 p) {
  vec2 uv = (p - uDetailOrigin) / uDetailSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(128.0 / 255.0, 0.0, 0.0, 0.0);
  return textureLod(uDetail, uv, 0.0);
}

// Brooks and rivers (streams.js, tools/streams.py): the wetness mask, 1 in the channel, ~0.6..0
// over the wet banks. The channels are cut into the ground by it (~0.7 m), so the water runs
// below the grass between low banks; Terrain.heightAt mirrors this on the CPU.
uniform sampler2D uStreamMask;
uniform vec2 uStreamOrigin;
uniform float uStreamSize;
float streamWet(vec2 p) {
  vec2 uv = (p - uStreamOrigin) / uStreamSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return textureLod(uStreamMask, uv, 0.0).r;
}
// trails (trails.js, tools/trails.py): G channel, a soft band ~2 m wide round each trail
float trailMark(vec2 p) {
  vec2 uv = (p - uStreamOrigin) / uStreamSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return textureLod(uStreamMask, uv, 0.0).g;
}
// how much the trodden points push a plant at p away (a lean vector, radians)
uniform vec4 uTrail[24];
vec2 trailPush(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 24; i++) {
    vec4 t = uTrail[i];
    if (t.w <= 0.0) continue;
    vec2 d = p - t.xy;
    float r = length(d);
    if (r > 0.8) continue;
    float k = t.w * (1.0 - smoothstep(0.1, 0.75, r)) * exp(-t.z / 5.0);
    s += (r > 1e-3 ? d / r : vec2(1.0, 0.0)) * k;
  }
  float l = length(s);
  return l > 1.2 ? s / l * 1.2 : s;
}
// the same with its own reach: full push inside r0 of a trodden point, none beyond r1
vec2 trailPushAt(vec2 p, float r0, float r1) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 24; i++) {
    vec4 t = uTrail[i];
    if (t.w <= 0.0) continue;
    vec2 d = p - t.xy;
    float r = length(d);
    if (r > r1) continue;
    float k = t.w * (1.0 - smoothstep(r0, r1, r)) * exp(-t.z / 5.0);
    s += (r > 1e-3 ? d / r : vec2(1.0, 0.0)) * k;
  }
  float l = length(s);
  return l > 1.2 ? s / l * 1.2 : s;
}
const float STREAM_CUT = 0.7;
float streamCarve(vec2 p) { return STREAM_CUT * smoothstep(0.45, 0.95, streamWet(p)); }

// Backdrop exaggeration (agreed with the user): terrain within 15 km of the camps is real;
// beyond it, relief above 2100 m is scaled up to (1 + uExag)x by 27 km.
uniform vec2 uExagCentre;
uniform float uExag;
uniform sampler2D uPads;
uniform vec2 uPadOrigin;
uniform float uPadSize;
uniform vec3 uPadAtlas;       // the map's texture: width, height (texels), the main map's n
uniform vec4 uPadTiles[4];    // outlying sites' tiles (x0, z0, size, 0), 512 texels each, stacked in a
                              // column right of the main map; size 0: unused
// the ground lowered under the houses to just below their floors (slice.js buildPads)
float padLower(vec2 p) {
  float h = 0.0;
  vec2 uv = (p - uPadOrigin) / uPadSize;
  if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) h = textureLod(uPads, uv * uPadAtlas.z / uPadAtlas.xy, 0.0).r;
  for (int i = 0; i < 4; i++) {
    vec4 t = uPadTiles[i];
    if (t.z <= 0.0) continue;
    vec2 q = (p - t.xy) / t.z;
    if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(1.0)))) continue;
    q = clamp(q * 512.0, vec2(0.5), vec2(511.5));   // (no bleeding from the next tile)
    h = max(h, textureLod(uPads, (vec2(uPadAtlas.z, float(i) * 512.0) + q) / uPadAtlas.xy, 0.0).r);
  }
  return h * 255.0 * ${PAD_STEP.toFixed(3)};
}
float terrainHeight(vec2 p) {
  float w = coreWeight(p);
  float hf = w < 1.0 ? sampleGrid(uFarH, p, uFarHalf, uFarRes, uFarN) : 0.0;
  float hc = w > 0.0 ? sampleGrid(uCoreH, p, uCoreHalf, uCoreRes, uCoreN) : 0.0;
  float h = mix(hf, hc, w) + (detailAt(p).r * 255.0 - 128.0) * uDetailScale - streamCarve(p) - padLower(p);
  float k = uExag * smoothstep(15000.0, 27000.0, distance(p, uExagCentre));
  return h + max(h - 2100.0, 0.0) * k;
}

vec3 terrainNormal(vec2 p, float e) {
  float hl = terrainHeight(p - vec2(e, 0.0));
  float hr = terrainHeight(p + vec2(e, 0.0));
  float hd = terrainHeight(p - vec2(0.0, e));
  float hu = terrainHeight(p + vec2(0.0, e));
  return normalize(vec3(hl - hr, 2.0 * e, hd - hu));
}
`;

// land cover: r = spruce forest, g = bare rock / alpine sparse, b = snow & ice
export const LANDCOVER_GLSL = /* glsl */ `
uniform sampler2D uCoreLC;
uniform sampler2D uFarLC;
vec3 landcover(vec2 p) {
  float w = coreWeight(p);
  vec3 f = w < 1.0 ? textureLod(uFarLC, (p + uFarHalf) / (2.0 * uFarHalf), 0.0).rgb : vec3(0.0);
  vec3 c = w > 0.0 ? textureLod(uCoreLC, (p + uCoreHalf) / (2.0 * uCoreHalf), 0.0).rgb : vec3(0.0);
  return mix(f, c, w);
}
float forestDensity(vec2 p) { return smoothstep(0.3, 0.8, landcover(p).r); }
`;

// Sun shadow: textures store, per ground texel, the height above ground below which
// the sun is hidden (terrain + forest canopy occluders).
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uCoreShadow;
uniform sampler2D uFarShadow;
float shadowHeight(vec2 p) {
  float w = coreWeight(p);
  float f = w < 1.0 ? texture2D(uFarShadow, (p + uFarHalf) / (2.0 * uFarHalf)).r : 0.0;
  float c = w > 0.0 ? texture2D(uCoreShadow, (p + uCoreHalf) / (2.0 * uCoreHalf)).r : 0.0;
  return mix(f, c, w);
}
// the same without the canopy roof: shadow of the terrain alone
float shadowHeightT(vec2 p) {
  float w = coreWeight(p);
  float f = w < 1.0 ? texture2D(uFarShadow, (p + uFarHalf) / (2.0 * uFarHalf)).g : 0.0;
  float c = w > 0.0 ? texture2D(uCoreShadow, (p + uCoreHalf) / (2.0 * uCoreHalf)).g : 0.0;
  return mix(f, c, w);
}
// visibility of the sun for a point 'above' metres over the ground at p
float sunVisibility(vec2 p, float above) {
  float sh = shadowHeight(p);
  return 1.0 - smoothstep(above - 2.0, above + 4.0, sh);
}
// the same for things on the forest floor (share forestW of forest at p, dist from the camera).
// The height-field shadow counts the forest as a roof of canopy; within ~750 m of the camera
// every tree is drawn into the object shadow map (shadows.js, cascade 2), so there the floor
// takes only the terrain's shadow from the height field -- the trees' own shadows come from
// objectShadow() -- and beyond it the canopy roof stands in for them
float groundSunVis(vec2 p, float above, float forestW, float dist) {
  float v = sunVisibility(p, above);
  if (forestW <= 0.0) return v;
  float covered = 1.0 - smoothstep(650.0, 760.0, dist);
  float vT = 1.0 - smoothstep(above - 2.0, above + 4.0, shadowHeightT(p));
  return mix(v, vT, forestW * covered);
}
// gaps in the forest canopy (the same pattern for the floor's light and its plants)
float forestGaps(vec2 p) {
  return min(1.0, smoothstep(0.55, 0.8, vnoise(p * 0.06 + 7.0)) * 0.8 + smoothstep(0.62, 0.85, vnoise(p * 0.5)) * 0.35);
}
`;

// Soft cel lighting shared by terrain, trees and grass.
// Lit colour is warm (sun), shadow colour takes the sky tint.
export const TOON_GLSL = /* glsl */ `
vec3 toonLight(vec3 albedo, vec3 n, float vis, float wrap) {
  float ndl = dot(n, uSunDir);
  float band = smoothstep(-0.03 - wrap, 0.12 + wrap, ndl) * vis;
  vec3 skyAmb = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
  vec3 shade = albedo * (skyAmb * 1.45 + uSunColor * 0.04);
  vec3 lit = albedo * (uSunColor * (0.62 + 0.38 * clamp(ndl, 0.0, 1.0)) + skyAmb * 0.55);
  return mix(shade, lit, band);
}
`;

// Meadow palette and wind, shared by terrain and grass so they blend seamlessly.
// Needs NOISE_GLSL; uses uTime / uWindDir from worldUniforms.
export const MEADOW_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;     // mean wind direction (veers slowly, main.js)
uniform float uWindStr;    // wind of the moment / U_REF (4 m/s): ~0.35 in a lull, ~0.9 a breeze, ~1.3 fresh (main.js)
uniform vec2 uWindOff;     // integrated wind travel (m): gusts drift at the wind's own speed

uniform vec2 uWindOffPrev;  // uWindOff / uWindStr / uTime a third of a second ago (main.js),
uniform float uWindStrPrev; // for the spring-back of plants after a gust has passed
uniform float uTimePrev;

// The wind over the meadow as its pressure q (1 = a steady breeze of U_REF = 4 m/s; drag goes
// with the speed squared). Mirrored by windfield.js windQ (same integer-hash noise). Three scales, as in wind over
// a plant canopy:
//  - the wind of the moment, uWindStr = U / U_REF: spells of lull, breeze and fresher wind
//    (main.js updateWind)
//  - gusts: patches tens of metres across, longer along the wind than across it (the
//    streamwise streaks of the surface layer), drifting downwind at the wind's speed and
//    changing as they go (~40 s); about half the ground is in one at any moment
//  - canopy puffs: the coherent eddies that roll over a sward and bow it in travelling patches
//    (the "honami" of grass and crop fields; Finnigan 2000, Py et al. 2006): a few metres, wider
//    across the wind, racing downwind at ~1.3x the gusts, strongest inside a gust
float windQ(vec2 p, vec2 off, float t, float str) {
  vec2 d = uWindDir, c = vec2(-d.y, d.x);
  vec2 q = p - off;
  float ra = dot(q, d), rc = dot(q, c);
  float g = wnoise(vec2(ra / 45.0, rc / 25.0) + t * 0.025) * 0.65 + wnoise(vec2(ra / 17.0, rc / 10.0) - t * 0.05 + 3.1) * 0.35;
  g = smoothstep(0.2, 0.85, g);
  vec2 q2 = p - off * 1.3;
  float sa = dot(q2, d), sc = dot(q2, c);
  float h = wnoise(vec2(sa / 2.5, sc / 6.0) + t * 0.12 + 17.0) * 0.7 + wnoise(vec2(sa / 1.2, sc / 2.5) - t * 0.2 + 5.0) * 0.3;
  h = smoothstep(0.3, 0.85, h);
  // local speed / U_REF: at the canopy top the puffs carry 2-3x the speed of the air between them
  // (turbulence intensity ~0.5 there), so their pressure is several times higher -- a breeze
  // leaves the sward ~3 deg over between puffs and bows it 10-25 deg in them
  float u = str * (0.55 + 0.7 * g) * (0.6 + 1.1 * h * h * (0.6 + 0.6 * g));
  return u * u;
}
// how far a plant gives (0..1 of its full bend) under pressure q: stiff at first, then laid over
float windLeanAt(float q) { return 1.0 - exp(-q * 0.25); }
float windBend(vec2 p) { return windLeanAt(windQ(p, uWindOff, uTime, uWindStr)); }
// a spring-mounted plant: bent by the wind now, overshooting back as a puff passes (the current
// bend plus a share of its change over the last third of a second)
float windBendPush(vec2 p, float spring) {
  float b = windBend(p);
  float b0 = windLeanAt(windQ(p, uWindOffPrev, uTimePrev, uWindStrPrev));
  return max(b + spring * (b - b0), 0.0);
}
// small eddies (a metre or two) that jostle leaves and heads (-1..1), carried by the puffs
float windTurb(vec2 p) {
  vec2 q = p - uWindOff * 1.3;
  return (wnoise(q * 0.5 + uTime * 0.35) * 0.65 + wnoise(q * 1.3 - uTime * 0.6) * 0.35) * 2.0 - 1.0;
}
// the wind swirls round the terrain: local direction within about +-25 degrees of the mean
vec2 windDirAt(vec2 p) {
  float a = (wnoise(p * 0.012 - uWindOff * 0.008) - 0.5) * 0.9;
  float ca = cos(a), sa = sin(a);
  return vec2(uWindDir.x * ca - uWindDir.y * sa, uWindDir.x * sa + uWindDir.y * ca);
}
// (older names, for any shader still using them)
float windWave(vec2 p) { return windBend(p); }
float windPush(vec2 p, float spring) { return windBendPush(p, spring); }

vec3 meadowColor(vec2 p, float alt, float bare) {
  float v1 = fbm(p * 0.0035, 3);
  float v2 = fbm(p * 0.025, 3);
  vec3 fresh = vec3(0.17, 0.35, 0.05);
  vec3 warm = vec3(0.34, 0.37, 0.08);
  vec3 cool = vec3(0.07, 0.21, 0.08);
  vec3 g = mix(cool, fresh, smoothstep(0.3, 0.65, v1));
  g = mix(g, warm, smoothstep(0.5, 0.78, v2) * 0.55);
  g = mix(g, vec3(0.30, 0.28, 0.12), smoothstep(2700.0, 3300.0, alt) * 0.7);
  float highAlt = smoothstep(2900.0, 3300.0, alt);
  return mix(g, vec3(0.25, 0.25, 0.11), bare * (1.0 - highAlt) * 0.45);
}
`;

// Props mask: r = no vegetation (buildings, boardwalks, paths), g = trampled ground.
export const PROPMASK_GLSL = /* glsl */ `
uniform sampler2D uPropMask;
uniform vec2 uMaskOrigin;
uniform float uMaskSize;
vec2 propMask(vec2 p) {
  vec2 uv = (p - uMaskOrigin) / uMaskSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  return textureLod(uPropMask, uv, 0.0).rg;
}
`;

// Fragment shaders of the meadow plants' levels of detail (world.js uPlantLod): a fixed
// per-pixel threshold, so a pixel a nearer level leaves is the one the next level draws
export const LOD_GLSL = /* glsl */ `
uniform vec4 uPlantLod;
float lodDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
float lodNear(float d) { return 1.0 - smoothstep(uPlantLod.x, uPlantLod.y, d); }   // share of the modelled plants
float lodMid(float d) { return 1.0 - smoothstep(uPlantLod.z, uPlantLod.w, d); }    // share of models + pictures
`;

// Habitat maps around the camps (see world.js); zero outside the mapped square.
export const VEGMAP_GLSL = /* glsl */ `
uniform sampler2D uVegAtlas;   // 2 m flora maps: six RGBA layers, layer k at tile (k % 3, k / 3)
uniform vec2 uVegOrigin;
uniform float uVegSize;
float vegInside(vec2 p) {
  vec2 uv = (p - uVegOrigin) / uVegSize;
  return step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
}
vec2 vegUV(vec2 p) { return (p - uVegOrigin) / uVegSize; }
// layer k of a 3x2 layer atlas at uv (0..1 over the mapped square); clamped half a texel inside
// the tile so neighbouring layers don't bleed in
vec4 layerAt(sampler2D atlas, vec2 uv, int k) {
  vec2 ts = vec2(textureSize(atlas, 0)) / vec2(3.0, 2.0);
  uv = clamp(uv, 0.5 / ts, 1.0 - 0.5 / ts);
  return texture(atlas, (uv + vec2(float(k % 3), float(k / 3))) / vec2(3.0, 2.0));
}
`;

// Flower colour of the meadow at p: the dominant species (detailed map near the camps,
// core map elsewhere) and its abundance. Needs VEGMAP_GLSL. Colours are linear RGB.
export const FLORA_GLSL = /* glsl */ `
uniform sampler2D uVegCore;
uniform vec2 uVegCoreOrigin;
uniform float uVegCoreSize;
uniform float uFarRef;         // calibration mode (world.js)
uniform float uFlora;          // flower abundance, scales the plants per cell at every distance alike
// per species, measured from the modelled plants at start-up (vegetation.js floraStats):
uniform vec3 uFloraCol[18];    // mean petal colour (linear albedo) as the plants render it
uniform float uFloraMaxD[18];  // plants per placement cell at weight 1 (capped at one per cell)
uniform float uFloraCov1[18];  // share of a full cell hidden by petals, seen from above
uniform float uFloraCovV[18];  // the upright part of the petals, seen edge-on (same units)
// species weights at p: the 2 m map inside the 2 km square, the 16 m core map elsewhere
// (the same maps the modelled plants are placed from). Flora order (NFLORA):
//  0 cosmos 1 daisy 2 poppy 3 globeflower 4 forget-me-not 5 geranium 6 delphinium 7 campanula
//  8 yarrow 9 dandelion 10 clover 11 mantle 12 buttercup 13 fireweed 14 dragonhead 15 gentian
//  16 edelweiss 17 chive.  g = grass types sedge/stipa/turf/fern; s = shrubs rose/other
const int NFLORA = 18;
void floraWeights(vec2 p, out float w[NFLORA], out vec4 g, out vec2 s) {
  vec4 L[6];
  if (vegInside(p) > 0.5) {
    vec2 uv = vegUV(p);
    for (int k = 0; k < 6; k++) L[k] = layerAt(uVegAtlas, uv, k);
  } else {
    vec2 uv = (p - uVegCoreOrigin) / uVegCoreSize;
    bool out_ = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)));
    for (int k = 0; k < 6; k++) L[k] = out_ ? vec4(0.0) : layerAt(uVegCore, uv, k);
  }
  w = float[NFLORA](L[0].x, L[0].y, L[0].z, L[0].w, L[1].x, L[1].y, L[1].z, L[1].w, L[2].x, L[2].y, L[2].z, L[2].w,
                    L[4].x, L[4].y, L[4].z, L[4].w, L[5].x, L[5].y);
  g = L[3];
  s = L[5].zw;
}
// petal cover of each species at p, by the same rule as the modelled plants:
// min(weight x maxDens, 1) plants per cell. Seen at elevation e (sinE; 1 = straight down) a
// plant shows H sin e + V cos e of petal, while the ground shows sin e and the upright grass
// blades G cos e -- so toward grazing views the share tends to V / G, not to infinity.
const float FLORA_GRASS_V = 0.15;   // upright grass area per unit ground, seen edge-on
float floraCovers(vec2 p, float sinE, out float cv[NFLORA]) {
  float w[NFLORA];
  vec4 g;
  vec2 sh;
  floraWeights(p, w, g, sh);
  float tot = 0.0;
  float se = clamp(sinE, 0.02, 1.0), ce = sqrt(1.0 - se * se), den = se + FLORA_GRASS_V * ce;
  for (int k = 0; k < NFLORA; k++) {
    cv[k] = min(w[k] * uFloraMaxD[k] * uFlora, 1.0) * (uFloraCov1[k] * se + uFloraCovV[k] * ce) / den;
    tot += cv[k];
  }
  return tot;
}
// share of the view that is petals for a summed cover (overlapping flowers hide each other)
float floraSeen(float cover) { return 1.0 - exp(-cover); }
// colour of one flower drawn at random in proportion to the covers (r in 0..1)
vec3 floraPick(float cv[NFLORA], float tot, float r) {
  float acc = 0.0, t = r * tot;
  vec3 col = uFloraCol[0];
  for (int k = 0; k < NFLORA; k++) { acc += cv[k]; if (t < acc) { col = uFloraCol[k]; break; } }
  return col;
}
// cover-weighted mean petal colour
vec3 floraMean(float cv[NFLORA], float tot) {
  vec3 m = vec3(0.0);
  for (int k = 0; k < NFLORA; k++) m += uFloraCol[k] * cv[k];
  return m / max(tot, 1e-5);
}
// The output tone curve (three.js ACESFilmicToneMapping, applied by the OutputPass) and its
// inverse. Up close every flower is its own pixel and is tone-mapped on its own; a far pixel
// that stands for flowers and grass together must blend them AFTER the curve, or bright
// petals push the mix toward a muddy tan (pink + green) instead of green with pale dots.
uniform float uToneExposure;
vec3 acesRRT(vec3 v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
vec3 tone(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(OUT * acesRRT(IN * (c * uToneExposure / 0.6)), 0.0, 1.0);
}
vec3 untone(vec3 y) {
  const mat3 IIN = mat3(vec3(1.764741, -0.147028, -0.036337), vec3(-0.675778, 1.160252, -0.162436), vec3(-0.088963, -0.013224, 1.198773));
  const mat3 IOUT = mat3(vec3(0.643038, 0.059269, 0.005962), vec3(0.311187, 0.931436, 0.063929), vec3(0.045775, 0.009295, 0.930118));
  vec3 r = clamp(IOUT * min(y, vec3(0.999)), vec3(1e-6), vec3(0.999));
  vec3 A = 0.983729 * r - 1.0, B = 0.432951 * r - 0.0245786, Cq = 0.238081 * r + 0.000090537;
  vec3 v = (-B - sqrt(B * B - 4.0 * A * Cq)) / (2.0 * A);
  return max(IIN * v, 0.0) / (uToneExposure / 0.6);
}
`;

// Shrubs (thickets of wild rose / spiraea / honeysuckle, creeping juniper), one per 4 m cell at
// most, from flora layer 5 (.z deciduous, .w juniper). The single definition of where a shrub
// stands, shared by the shrub meshes (shrubs.js) and the ground (contact shadow, far tint).
// Needs NOISE, HEIGHT, LANDCOVER, PROPMASK, VEGMAP and FLORA.
export const SHRUB_GLSL = /* glsl */ `
const float SHRUB_CELL = 4.0;
uniform float uShrubDens;          // shrubs per cell at weight 1
uniform vec2 uShrubH[4];           // height range (m): rose, spiraea, honeysuckle, juniper
uniform float uShrubAspect[4];     // crown width / height of the painting
uniform vec3 uShrubCol[4];         // mean linear foliage colour
uniform float uShrubFill[4];       // share of the crown's box the painting fills
vec2 shrubWeights(vec2 p) {
  if (vegInside(p) > 0.5) return layerAt(uVegAtlas, vegUV(p), 5).zw;
  vec2 uv = (p - uVegCoreOrigin) / uVegCoreSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  return layerAt(uVegCore, uv, 5).zw;
}
// shrub of a cell: x, z position, type (0 rose 1 spiraea 2 honeysuckle 3 juniper), height (m);
// height 0 = no shrub. w = crown width (m), seed in 0..1
vec4 shrubAt(vec2 cell, out float w, out float seed) {
  vec2 pc = (cell + 0.2 + 0.6 * hash22(cell + 13.1)) * SHRUB_CELL;
  vec2 sw = shrubWeights(pc);
  float tot = sw.x + sw.y;
  seed = hash12(cell + 29.7);
  w = 0.0;
  // creeping juniper grows in mats: denser than the thickets
  if (tot < 0.004 || hash12(cell + 7.3) > min((sw.x + sw.y * 1.8) * uShrubDens, 1.0)) return vec4(pc, 0.0, 0.0);
  // not on paths, cut banks, buildings or dense forest
  vec2 pm = propMask(pc);
  vec4 det = detailAt(pc);
  vec3 lc = landcover(pc);
  if (pm.r > 0.1 || det.g > 0.25 || det.b > 0.5 || lc.r > 0.7 || lc.b > 0.3) return vec4(pc, 0.0, 0.0);
  float r = hash12(cell + 3.1);
  int t = r < sw.y / tot ? 3 : (hash12(cell + 5.7) < 0.4 ? 0 : hash12(cell + 8.9) < 0.5 ? 2 : 1);
  float h = mix(uShrubH[t].x, uShrubH[t].y, hash12(cell + 11.3));
  w = h * uShrubAspect[t] * mix(0.85, 1.15, hash12(cell + 17.9));
  return vec4(pc, float(t), h);
}
// expected share of the ground hidden by shrub crowns at p (for the far view)
float shrubCover(vec2 p, out vec3 col) {
  vec2 sw = shrubWeights(p);
  float tot = sw.x + sw.y;
  col = vec3(0.0);
  if (tot < 0.004) return 0.0;
  float P = min((sw.x + sw.y * 1.8) * uShrubDens, 1.0);
  float fj = sw.y / tot;
  // mean crown area x fill per type, deciduous types weighted 0.4 rose / 0.3 / 0.3
  float cover = 0.0;
  vec3 c = vec3(0.0);
  float wt[4] = float[4]((1.0 - fj) * 0.4, (1.0 - fj) * 0.3, (1.0 - fj) * 0.3, fj);
  for (int k = 0; k < 4; k++) {
    float hm = 0.5 * (uShrubH[k].x + uShrubH[k].y);
    float wm = hm * uShrubAspect[k];
    float a = 0.785 * wm * wm * mix(0.6, 1.0, uShrubFill[k]) * wt[k];
    cover += a;
    c += uShrubCol[k] * a;
  }
  col = c / max(cover, 1e-5);
  return min(P * cover / (SHRUB_CELL * SHRUB_CELL), 0.9);
}
`;

// (the stream mask and streamWet() live in HEIGHT_GLSL, which carves the channels)
export const STREAM_GLSL = "";
