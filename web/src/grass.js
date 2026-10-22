import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, PROPMASK_GLSL, VEGMAP_GLSL, FLORA_GLSL, STREAM_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Wind-swept meadow grass around the camera (GPU-procedural, world-stable cells).
// Grass types chosen per clump from the habitat map (tools/veg_map.py):
//   turf   – grazed short sward around camps and trails (with a few foxtails)
//   fescue – the default meadow grass, some with open panicles
//   stipa  – feather grass on dry sunny slopes, silky silver awns that glow against the sun
//   sedge  – broad, dark blue-green arching leaves in wet hollows
// A sward, not tufts: every blade has its own root somewhere in its cell, its own height, width,
// lean and colour, and a share of the blades in each patch belong to other grasses (fine fescue
// leaves, broad flat leaves that flop over, sedge). Per cell: nb blades + 1 seed-head card
// (collapsed when the type has none). Three density tiers; blades shrink away at each edge.

function clumpGeometry(nb, levels = 7) {
  const pos = [], blade = [], idx = [];
  for (let b = 0; b < nb; b++) {
    const o = pos.length / 3;
    for (let j = 0; j < levels; j++) {
      const y = j / (levels - 1);
      if (j < levels - 1) pos.push(-0.5, y, 0, 0.5, y, 0), blade.push(b, b);
      else pos.push(0, 1, 0), blade.push(b);
    }
    for (let j = 0; j < levels - 2; j++) {
      const a = o + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const t = o + (levels - 2) * 2;
    idx.push(t, t + 1, t + 2);
  }
  // two crossed seed-head cards: 2 x 4 strips, x -0.5..0.5, y 0..1
  for (let c = 0; c < 2; c++) {
    const o = pos.length / 3;
    for (let j = 0; j <= 3; j++) for (let i = 0; i <= 1; i++) pos.push(i - 0.5, j / 3, 0), blade.push(nb + c);
    for (let j = 0; j < 3; j++) { const a = o + j * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aBlade", new THREE.Float32BufferAttribute(blade, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
attribute float aBlade;
uniform vec2 uOrigin;
uniform float uCell;
uniform float uN;
uniform vec4 uFade;
uniform float uWidth;
uniform float uHeight;
uniform float uCurvature;
uniform float uSeeds;
uniform float uHifiR;    // modelled grass clumps (vegetation.js) take over inside this radius
uniform float uNB;       // blades per cell (aBlade == uNB is the seed-head card)
uniform vec4 uRectCard[6];   // seed heads: 1 fescue panicle, 2 stipa, 3 timothy, 4 brome, 5 bluegrass
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBase;
varying vec2 vUv;
varying float vY;
varying float vAcross;
varying float vVis;
varying float vGust;
varying float vType;     // grass: 0 turf 1 fescue 2 bluegrass 3 broad (cocksfoot/brome) 4 timothy 5 stipa 6 sedge
varying float vCard;     // seed-head card (uRectCard index), 0 = leaf blade
varying vec3 vSheath;
varying float vTip;      // share of the blade withered from the tip
varying float vSeed;
varying float vVein;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
${VEGMAP_GLSL}
${FLORA_GLSL}
${STREAM_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  float id = float(gl_InstanceID);
  float iz = floor(id / uN);
  float ix = id - iz * uN;
  vec2 cell = uOrigin + vec2(ix, iz);
  vec2 pos = (cell + hash22(cell)) * uCell;
  vec2 dh = pos - cameraPosition.xz;
  float d = length(dh);
  float fade = (uFade.y > 0.0 ? smoothstep(uFade.x, uFade.y, d) : 1.0) * (1.0 - smoothstep(uFade.z, uFade.w, d));
  if (fade < 0.01) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  vec3 lc = landcover(pos);
  float ground = terrainHeight(pos);
  float hx = terrainHeight(pos + vec2(1.0, 0.0));
  float hz = terrainHeight(pos + vec2(0.0, 1.0));
  vec3 tn = normalize(vec3(ground - hx, 1.0, ground - hz));
  // under the spruces: shade grass and sedge, sparse under the crowns, fuller in the gaps
  float fr = smoothstep(0.3, 0.7, lc.r);
  float gapF = forestGaps(pos);
  if (fr > 0.0 && hash12(cell + 83.1) > 1.0 - fr * mix(0.72, 0.3, gapF)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float meadow = mix(1.0, mix(0.7, 0.95, gapF), fr) * (1.0 - smoothstep(0.3, 0.8, lc.g) * 0.45) * (1.0 - lc.b)
               * (1.0 - smoothstep(0.45, 0.7, 1.0 - tn.y));
  vec2 pm = propMask(pos);
  meadow *= (1.0 - smoothstep(0.2, 0.7, pm.r)) * (1.0 - 0.55 * pm.g);
  // alpine belt (from ~2700 m, edge wandering with the terrain): the sward breaks up into short
  // patchy turf between stones and bare ground; bare ground thins it at any altitude
  float alpine = smoothstep(2650.0, 3100.0, ground + (vnoise(pos * 0.01) - 0.5) * 200.0);
  float tuft = smoothstep(0.3, 0.7, vnoise(pos * 0.15) * 0.7 + vnoise(pos * 0.6) * 0.3);
  float keepA = mix(1.0, mix(0.5, 1.0, tuft), alpine) * (1.0 - 0.5 * smoothstep(0.3, 0.8, lc.g));
  if (hash12(cell + 47.1) > keepA) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec4 det = detailAt(pos);
  meadow *= (1.0 - smoothstep(0.1, 0.5, det.g)) * (1.0 - 0.8 * smoothstep(0.2, 0.7, det.b));
  meadow *= 1.0 - smoothstep(0.55, 0.8, streamWet(pos));   // no grass in the brook
  meadow *= 1.0 - 0.9 * smoothstep(0.45, 0.85, trailMark(pos));   // trodden down on the trails

  // ---- grass type and flower cover from the flora maps (2 m square, 16 m core elsewhere)
  float fw[NFLORA];
  vec4 g3;                                                    // sedge, stipa, turf, fern
  vec2 shrubs;
  floraWeights(pos, fw, g3, shrubs);
  float cover = 0.0;
  for (int k = 0; k < NFLORA; k++) cover += min(fw[k] * uFloraMaxD[k] * uFlora, 1.0) * uFloraCov1[k];   // from above
  // where flowers are thick the sward is lower and thinner, so the flowers stand above it
  float flowers = smoothstep(0.02, 0.2, cover);
  float wTurf = max(g3.b, pm.g * 0.8), wStipa = g3.g, wSedge = g3.r;
  float rT = hash12(cell + 55.0);
  wTurf = max(wTurf, alpine * 0.9);
  float type = 1.0;
  if (rT < wTurf) type = 0.0;
  else if (rT < wTurf + wStipa * (1.0 - wTurf)) type = 2.0;
  else if (rT < wTurf + (wStipa + wSedge) * (1.0 - wTurf)) type = 3.0;

  // ---- where the blades stand: tussocks (one plant, blades splaying out from a tight base),
  // loose single blades between them, dense and thin patches -- all tied to the world, so the
  // three density tiers agree on where the tussocks are
  bool isCard = aBlade > uNB - 0.5;
  float ci_ = isCard ? aBlade - uNB : 0.0;              // which of the two crossed seed-head cards
  vec2 bc = cell + (isCard ? 0.0 : aBlade) * 17.31;
  vec2 bp0 = isCard ? pos : (cell + hash22(bc + 3.7)) * uCell;
  const float TL = 0.9;
  vec2 tcell = floor(bp0 / TL);
  float bunch = smoothstep(0.25, 0.75, vnoise(bp0 * 0.22 + 3.0) * 0.7 + vnoise(bp0 * 0.9 + 1.0) * 0.3);
  float hasT = step(hash12(tcell + 71.3), mix(0.12, 0.8, bunch));
  vec2 tcen = (tcell + 0.2 + 0.6 * hash22(tcell + 5.1)) * TL;
  float trad = mix(0.03, 0.12, hash12(tcell + 9.7));
  const float TINF = 0.36;
  vec2 dv = bp0 - tcen;
  float dT = length(dv);
  float inT = hasT * step(dT, TINF);
  vec2 bp = inT > 0.5 ? tcen + dv * (trad / TINF) : bp0;
  float dens = smoothstep(0.15, 0.85, vnoise(bp0 * 1.3 + 11.0) * 0.55 + vnoise(bp0 * 0.35 + 5.0) * 0.45);
  float keepB = inT > 0.5 ? 0.45 : mix(0.35, 1.0, dens) * mix(1.0, 0.65, bunch);
  if (!isCard && hash12(bc + 61.1) > keepB) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  // ---- which grass: a plant (tussock or loose blade) is one species
  const float HF[7] = float[7](0.3, 0.7, 0.6, 0.75, 0.8, 0.85, 0.72);      // leaf length
  const float WF[7] = float[7](0.8, 0.55, 1.1, 1.9, 1.25, 0.4, 1.8);       // leaf width
  const float ARCH[7] = float[7](0.35, 1.3, 0.9, 1.9, 0.7, 1.6, 1.7);      // how far the leaf curls over
  const float FLEX[7] = float[7](0.5, 1.0, 1.0, 1.25, 0.85, 1.3, 0.8);     // give in the wind
  const float PAR[7] = float[7](0.3, 0.0, 0.55, 0.75, 0.5, 0.0, 0.85);     // parallel-sided share
  const float FOLD[7] = float[7](0.3, 0.8, 0.35, 0.15, 0.25, 0.9, 0.5);    // keeled / inrolled
  const vec3 TINT[7] = vec3[7](vec3(1.05, 1.1, 0.85), vec3(0.92, 1.0, 1.02), vec3(1.05, 1.08, 0.86), vec3(0.95, 1.0, 0.95),
                               vec3(1.0, 1.04, 0.92), vec3(1.04, 1.04, 0.88), vec3(0.8, 0.94, 0.94));
  const vec3 SHEATH[7] = vec3[7](vec3(0.85, 0.8, 0.55), vec3(0.75, 0.72, 0.6), vec3(0.95, 0.95, 0.8), vec3(0.8, 0.6, 0.7),
                                 vec3(0.9, 0.85, 0.7), vec3(0.9, 0.85, 0.65), vec3(0.55, 0.45, 0.35));
  const int CARDK[7] = int[7](3, 1, 5, 4, 3, 0, 0);   // no feather-grass plumes
  const float VEIN[7] = float[7](4.0, 3.0, 6.0, 10.0, 7.0, 3.0, 9.0);
  vec2 pid = inT > 0.5 ? tcell * 3.1 + 0.7 : bc;
  float rp = hash12(pid + 13.7), rf = hash12(pid + 23.3);
  int sp = type < 0.5 ? 0 : type < 1.5 ? (rp < 0.35 ? 1 : rp < 0.6 ? 2 : rp < 0.8 ? 3 : 4) : type < 2.5 ? 5 : 6;
  if (rf < 0.2) { float r = hash12(pid + 31.1); sp = r < 0.35 ? 1 : r < 0.55 ? 0 : r < 0.7 ? 2 : r < 0.85 ? 6 : 5; }
  if (alpine > 0.5 && sp != 5) sp = hash12(pid + 3.3) < 0.7 ? 0 : 1;
  if (hash12(pid + 91.3) < fr) { float r = hash12(pid + 92.7); sp = r < 0.4 ? 6 : r < 0.7 ? 3 : 1; }   // forest: sedge, broad grass, fescue

  float r1 = hash12(bc + 7.7), r2 = hash12(bc + 2.3), rk = hash12(bc + 19.1);
  float plantH = mix(0.75, 1.2, hash12(pid + 41.0));      // plants differ in vigour
  float clump = vnoise(bp * 0.35) * 0.6 + vnoise(bp * 0.07) * 0.4;
  float h = uHeight * HF[sp] * plantH * mix(0.35, 1.0, r1 * r1) * mix(0.6, 1.25, clump) * meadow * fade * (1.0 - 0.45 * flowers) * mix(1.0, 0.65, alpine);

  // ---- flowering stems: mostly from tussocks, each grass with its own seed head
  float card = 0.0;
  if (isCard) {
    float rs = hash12(cell + 31.7);
    // flowering stems are an accent, not a crop: a few per square metre at most
    float pc = sp == 5 ? 0.07 : sp == 0 ? (det.g + pm.g > 0.05 ? 0.08 : 0.0) : (inT > 0.5 ? 0.06 : 0.008) * (sp == 3 ? 0.4 : 1.0);
    pc *= 1.0 - 0.7 * fr;
    if (CARDK[sp] == 0 || rs > pc || uSeeds < 0.5 || meadow * fade < 0.2) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    card = float(CARDK[sp]);
    h = uHeight * (card > 1.5 && card < 2.5 ? 0.95 : 1.1) * mix(0.8, 1.2, r1) * plantH * meadow * fade * mix(1.0, 0.5, alpine);
  }
  if (h < 0.03) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  // ---- shape: a leaf is an arc -- it leans at the base (by chance, splaying out of its tussock,
  // pushed by the wind) and curls further over toward the tip; it twists along its length
  // the wind (glsl.js windQ): bent by the pressure of the moment -- gusts, and the canopy puffs
  // that bow the sward in travelling patches -- springing back as a puff passes; each leaf also
  // flicks on its own, the more the harder it blows
  float bend = windBendPush(bp, 0.5);
  float turb = windTurb(bp + r1 * 3.0);
  vec2 wd = windDirAt(bp);
  float la = hash12(bc + 41.3) * 6.2831;
  vec2 S = vec2(cos(la), sin(la)) * mix(0.1, 0.55, r2);
  if (inT > 0.5) S = S * 0.4 + normalize(dv + 1e-4) * mix(0.25, 0.65, dT / TINF);
  float f = FLEX[sp] * mix(0.7, 1.3, rk) * (isCard ? 0.6 : 1.0);
  float osc = tnoise(uTime * mix(1.6, 3.0, r1) + r2 * 40.0, r1 * 11.0);   // each leaf moves on its own, never in step
  float sb = sqrt(bend);
  vec2 W = wd * (0.85 * bend + 0.05 * turb * sb + osc * 0.05 * sb) * f
         + vec2(-wd.y, wd.x) * osc * 0.035 * sb * f;
  vec2 T = S + W + trailPush(bp) * 1.1;       // trodden down and pushed aside where the walker went
  float th0 = min(length(T), 1.3);
  vec2 D = length(T) > 1e-4 ? normalize(T) : vec2(1.0, 0.0);
  float k = (isCard ? 0.25 : ARCH[sp] * mix(0.45, 1.3, rk)) * (0.85 + 0.3 * th0);
  float y = position.y;
  float a1 = th0 + k * y;
  float hor = k > 1e-3 ? (cos(th0) - cos(a1)) / k : sin(th0) * y;
  float ver = k > 1e-3 ? (sin(a1) - sin(th0)) / k : cos(th0) * y;
  vec3 Dv = vec3(D.x, 0.0, D.y);
  vec3 tang = normalize(Dv * sin(a1) + vec3(0.0, cos(a1), 0.0));
  vec3 across;
  float xs, w;
  if (isCard) {
    float yc = r2 * 6.2831 + ci_ * 1.5708;
    across = vec3(cos(yc), 0.0, sin(yc));
    xs = position.x;
    w = h * 0.5;                                       // slender: the painted heads are drawn wide in their slots
    if (card > 3.5) { h *= 0.7; w *= 0.8; }            // brome and bluegrass panicles are smaller
  } else {
    across = normalize(vec3(-D.y, 0.0, D.x));
    float tw = (hash12(bc + 57.1) - 0.5) * 1.8 * y;
    across = normalize(across * cos(tw) + cross(tang, across) * sin(tw));
    float par = PAR[sp];
    float prof = mix(pow(max(1.0 - y, 0.0), 0.75), pow(clamp((1.0 - y) / 0.28, 0.0, 1.0), 0.6), par);
    xs = sign(position.x) * 0.5 * prof;
    w = uWidth * WF[sp] * mix(0.7, 1.3, r2);
  }
  vec3 root = vec3(bp.x, ground + (hx - ground) * (bp.x - pos.x) + (hz - ground) * (bp.y - pos.y), bp.y);
  vec3 wp = root + Dv * hor * h + vec3(0.0, ver * h, 0.0) + across * xs * w;

  // normal: the leaf face, folded along the midrib (the two halves catch the light differently)
  vec3 nf = normalize(cross(across, tang));
  if (nf.y < 0.0) nf = -nf;
  if (!isCard) nf = normalize(nf + across * sign(position.x) * FOLD[sp]);
  vNormal = normalize(mix(nf, tn, 0.3));

  vWorld = wp;
  vY = y;
  vAcross = isCard ? position.x * 2.0 : sign(position.x);
  vGust = bend - 0.1;   // (the sheen of bowed blades, around the mean bend as the far ground has it)
  vType = float(sp);
  vCard = card;
  vec4 rect = uRectCard[int(card + 0.5)];
  vUv = vec2(mix(rect.x, rect.z, position.x + 0.5), mix(rect.w, rect.y, y));

  // ---- colour: the grass's own hue, the plant's, the leaf's; pale or purplish sheaths; some
  // leaves withered at the tip, a few old ones straw all over
  vec3 baseC = meadowColor(pos, ground, smoothstep(0.2, 0.7, lc.g)) * mix(vec3(1.0), vec3(0.78, 0.9, 0.82), fr);   // shade leaves: deeper, bluer
  vec3 plantTint = mix(vec3(0.94, 0.99, 1.03), vec3(1.06, 1.03, 0.92), hash12(pid + 4.1)) * mix(0.92, 1.06, hash12(pid + 8.8));
  float bright = mix(0.9, 1.08, hash12(bc + 8.8));
  vec3 c = baseC * TINT[sp] * plantTint * bright * mix(vec3(1.0), vec3(1.12, 1.0, 0.72), alpine * 0.7);
  float old = step(hash12(bc + 51.7), 0.02);
  vBase = mix(c, baseC * vec3(1.55, 1.2, 0.55) * bright, old);
  vSheath = mix(vec3(1.0), SHEATH[sp] * 1.3, 0.5) * baseC;
  vTip = old > 0.5 ? 1.0 : (hash12(bc + 63.1) < 0.08 ? mix(0.04, 0.15, hash12(bc + 64.2)) : 0.0);
  vSeed = hash12(bc + 77.7);
  vVein = VEIN[sp];
  vVis = groundSunVis(pos, y * h + 0.2, fr, d);
  vec2 dhc = wp.xz - cameraPosition.xz;
  wp.y -= dot(dhc, dhc) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vBase;
varying vec2 vUv;
varying float vY;
varying float vAcross;
varying float vVis;
varying float vGust;
varying float vType;
varying float vCard;
varying vec3 vSheath;
varying float vTip;
varying float vSeed;
varying float vVein;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vWorld - cameraPosition);
  float vis = vVis * objectShadow(vWorld, vec3(0.0, 1.0, 0.0));
  float back = pow(max(dot(v, uSunDir), 0.0), 3.0);
  vec3 col;
  if (vCard > 0.5) {
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.3) discard;
    vec3 albedo = t.rgb * vec3(0.78, 0.8, 0.66);
    col = toonLight(albedo, vec3(0.0, 1.0, 0.0), vis, 0.3);
    // awns and seed hairs light up against the low sun (the silvery sheen of feather grass)
    col += uSunColor * albedo * back * (vCard > 1.5 && vCard < 2.5 ? 0.35 : 0.15) * vis;
  } else {
    // parallel veins and a paler midrib across the leaf, mottling along it
    float ac = vAcross;
    vec3 albedo = vBase * 0.85;
    albedo *= 0.96 + 0.05 * (0.5 + 0.5 * cos(ac * vVein * 3.1416));
    albedo = mix(albedo, albedo * vec3(1.08, 1.1, 1.0), (1.0 - smoothstep(0.0, 0.15, abs(ac))) * 0.5);
    // the sheath at the base, the shade inside the sward
    albedo = mix(vSheath, albedo, smoothstep(0.02, 0.12, vY));
    albedo *= mix(0.45, 1.0, smoothstep(0.0, 0.7, vY));
    // sunlit tips (the bright yellow-green of the early sward); withered tips on a few leaves
    albedo = mix(albedo, albedo * vec3(1.35, 1.25, 0.65), smoothstep(0.55, 1.0, vY) * (vType > 5.5 ? 0.15 : 0.55));
    float dry = step(0.001, vTip) * smoothstep(1.0 - vTip - 0.04, 1.0 - vTip + 0.04, vY);
    albedo = mix(albedo, vec3(0.36, 0.28, 0.14) * (0.9 + 0.3 * vSeed), dry);
    albedo *= 1.0 + 0.7 * vGust * vY;   // bowed by a puff: the paler, glossier side shows (the honami sheen)
    col = toonLight(albedo, n, vis, 0.08);
    col += uSunColor * albedo * 0.8 * back * vY * vis;
  }
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Grass {
  constructor() {
    this.group = new THREE.Group();
    this.hifiR = { value: 0 };
    this.uniforms = { uAtlas: { value: null }, uRectCard: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } };
    // blade density falls with distance: ~150 / m2 near, ~25 / m2 at mid range, wide blades far
    this.tiers = [
      { cell: 0.2, nb: 6, radius: 16, fade: [0, 0, 12, 16], width: 0.013, height: 0.6, seeds: 1 },
      { cell: 0.4, nb: 4, radius: 36, fade: [12, 16, 28, 36], width: 0.032, height: 0.6, seeds: 1 },
      { cell: 0.8, nb: 3, radius: 85, fade: [28, 36, 60, 85], width: 0.08, height: 0.58, seeds: 0 },
    ];
    for (const t of this.tiers) {
      const blade = clumpGeometry(t.nb);
      t.n = Math.ceil((2 * t.radius) / t.cell);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = blade.index;
      geo.setAttribute("position", blade.attributes.position);
      geo.setAttribute("aBlade", blade.attributes.aBlade);
      geo.instanceCount = t.n * t.n;
      t.uniforms = {
        ...atmos, ...worldUniforms, ...shadowUniforms, ...this.uniforms,
        uOrigin: { value: new THREE.Vector2() },
        uCell: { value: t.cell },
        uN: { value: t.n },
        uFade: { value: new THREE.Vector4(...t.fade) },
        uWidth: { value: t.width },
        uHeight: { value: t.height },
        uSeeds: { value: t.seeds },
        uHifiR: this.hifiR,
        uNB: { value: t.nb },
      };
      const mat = new THREE.ShaderMaterial({ uniforms: t.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, alphaToCoverage: true });
      t.mesh = new THREE.Mesh(geo, mat);
      t.mesh.frustumCulled = false;
      this.group.add(t.mesh);
    }
  }

  // seed-head sprites live in the vegetation atlas
  setAtlas(atlas, rects) {
    this.uniforms.uAtlas.value = atlas;
    const names = [null, "panicle_v2", "stipa_v2", "timothy", "brome", "poa"];
    this.uniforms.uRectCard.value = names.map((k) => new THREE.Vector4(...(k && rects[k] ? rects[k] : [0, 0, 0, 0])));
  }

  update(camera) {
    const show = camera.userData.aboveGround === undefined || camera.userData.aboveGround < 120;
    this.group.visible = show;
    for (const t of this.tiers) {
      t.uniforms.uOrigin.value.set(Math.floor(camera.position.x / t.cell) - Math.floor(t.n / 2), Math.floor(camera.position.z / t.cell) - Math.floor(t.n / 2));
    }
  }
}
