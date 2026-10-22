import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, PROPMASK_GLSL, VEGMAP_GLSL, FLORA_GLSL, STREAM_GLSL, LOD_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Flowers between the plants' pictures (midplants.js, to 38-45 m) and the far meadow colour
// (terrain.js, beyond ~80 m): a GPU ring of world-stable cells, life-size heads on stems in
// clusters of 6 per cell (heads grow only if a cell cannot otherwise hold the cover). It takes
// over from the pictures pixel by pixel (world.js uPlantLod). (A finer ring of the same heads
// used to cover 10-34 m: a delphinium there was a few round dots until it turned into a plant
// at 12 m -- the pictures show the plant itself instead.)
// Species and amount come from floraCovers() -- the same maps and the same petal cover per
// plant that the modelled plants have -- so a patch shows the same flowers, in the same
// share, whatever the distance. Each head is a small quad with the species' petal outline
// drawn in the fragment shader.

const HEADS = 6;

// cluster geometry: per head a stem quad (aPart 0) and a head quad (aPart 1); aHead = index
function clusterGeometry() {
  const pos = [], uv = [], part = [], head = [], idx = [];
  for (let h = 0; h < HEADS; h++) {
    for (const p of [0, 1]) {
      const o = part.length;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(u, v, 0); uv.push(u, v); part.push(p); head.push(h); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute("aHead", new THREE.Float32BufferAttribute(head, 1));
  g.setIndex(idx);
  return g;
}

// per species (index as in the maps): life-size head radius (m), plant height range (m),
// petal count for the outline (0 = round ball / umbel)
const SPEC = /* glsl */ `
const float HEAD_R[18] = float[18](0.075, 0.03, 0.03, 0.035, 0.03, 0.03, 0.035, 0.035, 0.04, 0.025, 0.02, 0.0,
  0.012, 0.02, 0.02, 0.025, 0.02, 0.02);
const vec2 HEIGHT[18] = vec2[18](vec2(0.75, 1.2), vec2(0.35, 0.6), vec2(0.3, 0.5), vec2(0.4, 0.65), vec2(0.25, 0.42), vec2(0.35, 0.55),
  vec2(0.7, 1.15), vec2(0.35, 0.6), vec2(0.4, 0.62), vec2(0.3, 0.55), vec2(0.15, 0.28), vec2(0.14, 0.24),
  vec2(0.3, 0.6), vec2(0.8, 1.4), vec2(0.25, 0.45), vec2(0.08, 0.2), vec2(0.08, 0.18), vec2(0.25, 0.45));
const float PETALS[18] = float[18](8.0, 18.0, 4.0, 10.0, 5.0, 5.0, 5.0, 5.0, 0.0, 16.0, 0.0, 0.0,
  5.0, 4.0, 0.0, 5.0, 8.0, 0.0);
`;

const VERT = /* glsl */ `
attribute float aPart;
attribute float aHead;
uniform vec2 uOrigin;
uniform float uCell;
uniform float uN;
uniform vec4 uFade;
uniform float uCurvature;
uniform vec4 uPlantLod;
varying vec3 vWorld;
varying vec3 vColor;
varying vec2 vUv;
varying float vPart;
varying float vPetals;
varying float vVis;
varying float vLodD;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
${VEGMAP_GLSL}
${FLORA_GLSL}
${STREAM_GLSL}
${SPEC}
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  float id = float(gl_InstanceID);
  float iz = floor(id / uN);
  float ix = id - iz * uN;
  vec2 cell = uOrigin + vec2(ix, iz);
  vec2 c0 = (cell + 0.5) * uCell;
  float dcam = length(c0 - cameraPosition.xz);
  // 3D distances (seen from above the ring thins out as the ground's own flower colour comes in,
  // terrain.js): the far edge by cell, the near edge per pixel, handed over from the plants'
  // pictures (fragment shader)
  vLodD = length(vec3(c0.x, terrainHeight(c0), c0.y) - cameraPosition);
  float fade = 1.0 - smoothstep(uFade.z, uFade.w, vLodD);
  if (hash12(cell + 91.3) > fade || vLodD < uPlantLod.z - 0.3) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  // open meadow only (no forest, scree, buildings, trails, cut banks)
  vec3 lc = landcover(c0);
  vec2 pm = propMask(c0);
  vec4 det = detailAt(c0);
  // (the forest floor has its own flowers in the maps now: no forest term here)
  float meadow = (1.0 - smoothstep(0.3, 0.8, lc.g)) * (1.0 - lc.b)
               * (1.0 - smoothstep(0.1, 0.5, pm.r)) * (1.0 - smoothstep(0.05, 0.4, det.g)) * (1.0 - smoothstep(0.2, 0.6, det.b))
               * (1.0 - smoothstep(0.5, 0.8, streamWet(c0))) * (1.0 - smoothstep(0.4, 0.75, trailMark(c0)));
  // view elevation of this cell: the heads are drawn facing up, so they must carry the whole
  // cover the modelled plants show at this angle (upright petals included)
  float ground0 = terrainHeight(c0);
  float sinE = (cameraPosition.y - ground0) / max(length(cameraPosition - vec3(c0.x, ground0, c0.y)), 1e-3);
  float cv[NFLORA];
  float Craw = floraCovers(c0, sinE, cv);
  float C = floraSeen(Craw) * meadow;
  // one species per cell, drawn in proportion to its cover
  float pick = hash12(cell + 71.0) * Craw;
  int si = 0; float acc = 0.0;
  for (int k = 0; k < NFLORA; k++) { acc += cv[k]; if (pick < acc) { si = k; break; } }
  // heads of life size; a cell holds HEADS of them. If that is not enough for the cover
  // (coarse far ring), the heads grow instead of the cell over-filling.
  // heads turn toward the viewer (below), so their area doesn't shrink with the view angle
  // while the ground's does (x sin e): to show the cover C they need C sin e of the ground
  float need = C * clamp(sinE, 0.05, 1.0);
  // clumps like the modelled plants' (vegetation.js CLUMP): each species gathers in groups of
  // about a metre with bare grass between -- a mean-1 field per species, so the cover stays
  need *= smoothstep(0.4, 0.75, wnoise(c0 / 1.15 + float(si) * 37.1)) / 0.384;
  float r = HEAD_R[si];
  float cap = ${HEADS}.0 * 0.7 * 3.14159 * r * r / (uCell * uCell);   // head area of a full cell
  if (need > cap) { r *= sqrt(need / cap); cap = need; }
  float P = need / max(cap, 1e-5);
  if (r <= 0.0 || hash12(cell * 1.9 + 3.3) > P) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  float hh = aHead;
  vec2 hs = vec2(hash12(cell + hh * 7.1 + 1.3), hash12(cell + hh * 3.7 + 9.1));
  vec2 pos = (cell + hs) * uCell;
  float r1 = hash12(cell + hh * 5.3 + 11.3), r2 = hash12(cell + hh * 2.9 + 5.9);
  float h = mix(HEIGHT[si].x, HEIGHT[si].y, r1);
  float ground = terrainHeight(pos);
  // pushed by the gust and springing back as it passes, jostled by eddies: no two stems alike
  float gust = windBendPush(pos, 0.6);
  vec2 wdl = windDirAt(pos);
  vec2 jig = vec2(tnoise(uTime * mix(0.9, 1.6, r1) + r2 * 50.0, r1 * 9.0), tnoise(uTime * mix(0.8, 1.5, r2) + r1 * 40.0, r2 * 9.0 + 3.0));
  vec3 lean = normalize(vec3(wdl.x, 0.0, wdl.y) * (0.2 + 1.5 * gust) + vec3(r1 - 0.5 + jig.x * 0.25 * min(1.0, 0.1 + 2.0 * gust), 0.0, r2 - 0.5 + jig.y * 0.25 * min(1.0, 0.1 + 2.0 * gust)) * 0.6);
  float bend = 0.06 + 0.8 * gust + windTurb(pos + r2 * 5.0) * 0.06 * sqrt(gust);
  vec3 top = vec3(pos.x, ground + h, pos.y) + lean * bend * h * 0.6;
  vec2 tp = uTrail[0].w > 0.0 && distance(pos, uTrail[0].xy) < 13.0 ? trailPush(pos) : vec2(0.0);   // parted by the walker (zoomed-out camera)
  top += vec3(tp.x, -length(tp) * 0.4, tp.y) * h * 0.7;
  vec3 wp;
  if (aPart < 0.5) {
    // stem: thin quad from the ground to the head, turned to face the camera
    vec3 base = vec3(pos.x, ground, pos.y);
    vec3 side = normalize(cross(top - base, top - cameraPosition)) * 0.006 * max(1.0, dcam / 25.0);
    wp = mix(base, top, position.y * 0.5 + 0.5) + side * position.x;
    vColor = vec3(0.07, 0.17, 0.035);
  } else {
    // head: faces up, tilted toward the wind and a random side
    vec3 up = normalize(vec3(0.0, 1.0, 0.0) + lean * (0.4 + bend) + vec3(r2 - 0.5, 0.0, r1 - 0.5) * 0.7);
    up = normalize(mix(up, normalize(cameraPosition - top), 0.75));   // flowers seen face-on
    vec3 t1 = normalize(cross(up, vec3(0.0, 0.0, 1.0)));
    vec3 t2 = cross(t1, up);
    float spin = r2 * 6.2831;
    vec2 q = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * position.xy;
    wp = top + (t1 * q.x + t2 * q.y) * r;
    vColor = uFloraCol[si] * mix(0.88, 1.08, hash12(cell + hh * 13.1));
  }
  vUv = uv;
  vPart = aPart;
  vPetals = PETALS[si];
  vWorld = wp;
  vVis = groundSunVis(pos, h, smoothstep(0.3, 0.7, lc.r), dcam);
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vColor;
varying vec2 vUv;
varying float vPart;
varying float vPetals;
varying float vVis;
varying float vLodD;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
${LOD_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  if (lodDither() < lodMid(vLodD)) discard;   // the plants' pictures draw this pixel (midplants.js)
  vec3 albedo = vColor;
  if (vPart > 0.5) {
    // petal outline: n rounded lobes (or a round umbel/ball), a darker eye in the middle;
    // area of the outline ~0.7 of the circle, as assumed for the cover
    float rr = length(vUv), a = atan(vUv.y, vUv.x);
    float edge = vPetals > 0.5 ? 0.62 + 0.38 * pow(abs(cos(a * vPetals * 0.5)), 0.6) : 0.84;
    if (rr > edge) discard;
    float eye = vPetals > 0.5 && vPetals < 15.0 ? smoothstep(0.26, 0.18, rr) : vPetals > 15.0 ? smoothstep(0.34, 0.26, rr) : 0.0;
    albedo = mix(albedo * mix(0.82, 1.05, rr / edge), vec3(0.85, 0.6, 0.05), eye * 0.8);
  }
  vec3 n = vec3(0.0, 1.0, 0.0);
  float vis = vVis * objectShadow(vWorld, n);
  vec3 col = toonLight(albedo, n, vis, 0.3);
  vec3 v = normalize(vWorld - cameraPosition);
  col += uSunColor * albedo * pow(max(dot(v, uSunDir), 0.0), 2.0) * 0.2 * vis * step(0.5, vPart);  // thin petals glow backlit
  col = min(col, vec3(1.6));
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Flowers {
  constructor() {
    this.mesh = new THREE.Group();
    const geo0 = clusterGeometry();
    this.rings = [
      { cell: 0.8, radius: 90, fade: [0, 0, 78, 90] },
    ].map((R) => {
      const n = Math.ceil((2 * R.radius) / R.cell);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = geo0.index;
      for (const k of ["position", "uv", "aPart", "aHead"]) geo.setAttribute(k, geo0.attributes[k]);
      geo.instanceCount = n * n;
      const uniforms = {
        ...atmos, ...worldUniforms, ...shadowUniforms,
        uOrigin: { value: new THREE.Vector2() },
        uCell: { value: R.cell },
        uN: { value: n },
        uFade: { value: new THREE.Vector4(...R.fade) },
      };
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
      mesh.frustumCulled = false;
      this.mesh.add(mesh);
      return { ...R, n, uniforms, mesh };
    });
  }

  update(camera) {
    this.mesh.visible = camera.userData.aboveGround === undefined || camera.userData.aboveGround < 90;
    for (const R of this.rings)
      R.uniforms.uOrigin.value.set(Math.floor(camera.position.x / R.cell) - Math.floor(R.n / 2), Math.floor(camera.position.z / R.cell) - Math.floor(R.n / 2));
  }
}
