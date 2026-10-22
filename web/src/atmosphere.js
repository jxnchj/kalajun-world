import * as THREE from "three";
import { NOISE_GLSL } from "./glsl.js";

// Shared lighting / atmosphere state. All colours are linear RGB.
export const atmos = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSkyAmbient: { value: new THREE.Color() },
  uGroundAmbient: { value: new THREE.Color() },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() }, // horizon on the sun side
  uHorizonAnti: { value: new THREE.Color() }, // horizon opposite the sun
  uHorizonGlow: { value: new THREE.Color() }, // warm band hugging the horizon near the sun
  uSunGlow: { value: new THREE.Color() }, // aureole around the sun
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uCloudTime: { value: 0 },
  uFogDensity: { value: 1 / 14000 },
  uFogHeight: { value: 2500 }, // scale height (m)
  uFogBase: { value: 2000 }, // reference altitude (m)
  uMistDensity: { value: 1 / 2500 }, // low valley mist
  uMistBase: { value: 1880 },
  uMistScale: { value: 140 },
};

// Palette keyframes by sun elevation (degrees). Golden hour (2°–8°) is tuned against the
// reference paintings in ref/zelda: gold sun, lavender anti-sun horizon, peach cumulus with
// purple bases, violet-blue shadows.
const KEYS = [
  { el: -12, zenith: [0.004, 0.008, 0.03], hor: [0.02, 0.025, 0.06], anti: [0.015, 0.02, 0.05], hglow: [0, 0, 0], sglow: [0, 0, 0],
    sun: [0, 0, 0], skyAmb: [0.012, 0.016, 0.04], gndAmb: [0.008, 0.01, 0.008], cloudLit: [0.03, 0.035, 0.06], cloudShade: [0.015, 0.02, 0.04] },
  { el: -4, zenith: [0.04, 0.09, 0.34], hor: [0.75, 0.42, 0.3], anti: [0.3, 0.26, 0.45], hglow: [0.7, 0.26, 0.08], sglow: [0.3, 0.12, 0.05],
    sun: [0, 0, 0], skyAmb: [0.34, 0.34, 0.62], gndAmb: [0.1, 0.09, 0.12], cloudLit: [1.1, 0.5, 0.42], cloudShade: [0.26, 0.2, 0.38] },
  { el: 2, zenith: [0.03, 0.085, 0.42], hor: [0.95, 0.5, 0.2], anti: [0.36, 0.34, 0.6], hglow: [0.75, 0.3, 0.08], sglow: [0.75, 0.42, 0.18],
    sun: [3.0, 1.55, 0.62], skyAmb: [0.3, 0.29, 0.54], gndAmb: [0.14, 0.11, 0.06], cloudLit: [1.45, 0.58, 0.28], cloudShade: [0.32, 0.23, 0.42] },
  { el: 8, zenith: [0.035, 0.1, 0.46], hor: [0.85, 0.6, 0.36], anti: [0.38, 0.44, 0.7], hglow: [0.45, 0.22, 0.07], sglow: [0.6, 0.42, 0.24],
    sun: [3.0, 2.0, 1.1], skyAmb: [0.3, 0.33, 0.56], gndAmb: [0.14, 0.12, 0.07], cloudLit: [1.5, 0.82, 0.48], cloudShade: [0.36, 0.3, 0.5] },
  // daytime (photos 6-8, 09:35-14:55): a deep mountain blue overhead, paler only low down; white
  // cumulus with grey bases -- not the milky sky and cream clouds a golden-hour palette gives; and
  // a sun that does not make the meadow outshine the sky as it stands high
  { el: 20, zenith: [0.06, 0.18, 0.62], hor: [0.55, 0.68, 0.88], anti: [0.46, 0.6, 0.84], hglow: [0.05, 0.04, 0.02], sglow: [0.32, 0.29, 0.24],
    sun: [2.5, 2.25, 1.95], skyAmb: [0.3, 0.4, 0.62], gndAmb: [0.13, 0.13, 0.08], cloudLit: [1.45, 1.42, 1.36], cloudShade: [0.5, 0.55, 0.68] },
  { el: 70, zenith: [0.045, 0.15, 0.6], hor: [0.52, 0.66, 0.88], anti: [0.44, 0.58, 0.84], hglow: [0, 0, 0], sglow: [0.26, 0.25, 0.22],
    sun: [2.25, 2.12, 1.92], skyAmb: [0.3, 0.4, 0.62], gndAmb: [0.13, 0.13, 0.08], cloudLit: [1.4, 1.4, 1.38], cloudShade: [0.5, 0.55, 0.68] },
];
const FIELDS = { zenith: "uZenith", hor: "uHorizon", anti: "uHorizonAnti", hglow: "uHorizonGlow", sglow: "uSunGlow", sun: "uSunColor",
  skyAmb: "uSkyAmbient", gndAmb: "uGroundAmbient", cloudLit: "uCloudLit", cloudShade: "uCloudShade" };

// How much of the day's light there is: 0 up to a sun 12 degrees high (golden hour and below, the
// look everything was tuned in), 1 from 40 degrees. The camera exposes for it (main.js) and the
// air clears: the haze and the valley mist that make the evening soft would make noon milky.
const FOG = atmos.uFogDensity.value, MIST = atmos.uMistDensity.value;
export function daylight(sunDir) {
  const el = Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1)) * THREE.MathUtils.RAD2DEG;
  return THREE.MathUtils.smoothstep(el, 12, 40);
}

export function updateAtmosphere(sunDir) {
  atmos.uSunDir.value.copy(sunDir);
  const day = daylight(sunDir);
  atmos.uFogDensity.value = FOG * (1 - 0.5 * day);
  atmos.uMistDensity.value = MIST * (1 - 0.65 * day);
  const el = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1)) * THREE.MathUtils.RAD2DEG, KEYS[0].el, KEYS.at(-1).el);
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let t = (el - a.el) / (b.el - a.el);
  t = t * t * (3 - 2 * t);
  for (const [k, u] of Object.entries(FIELDS)) {
    atmos[u].value.setRGB(a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t);
  }
}

// GLSL shared by sky and every lit material.
export const ATMOS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonAnti;
uniform vec3 uHorizonGlow;
uniform vec3 uSunGlow;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogBase;
uniform float uMistDensity;
uniform float uMistBase;
uniform float uMistScale;

// clear-sky colour (no sun disc, no clouds); also the aerial-perspective colour
vec3 skyBase(vec3 dir) {
  float y = max(dir.y, 0.0);
  vec2 fh = normalize(uSunDir.xz + 1e-5);
  float az = dot(normalize(dir.xz + 1e-5), fh) * 0.5 + 0.5;   // 1 toward the sun
  vec3 horizon = mix(uHorizonAnti, uHorizon, pow(az, 3.0));
  vec3 col = mix(horizon, uZenith, clamp(pow(y, 0.32) * 1.08, 0.0, 1.0));
  col += uHorizonGlow * pow(az, 6.0) * exp(-y * 16.0);
  float mu = max(dot(dir, uSunDir), 0.0);
  col += uSunGlow * (pow(mu, 48.0) * 0.9 + pow(mu, 8.0) * 0.18);
  return col;
}

// analytic integral of density d0*exp(-(h-base)/scale) along a ray
float heightFog(float d0, float base, float scale, vec3 camPos, vec3 v, float dist) {
  float b = 1.0 / scale;
  float camH = camPos.y - base;
  float ry = v.y;
  if (abs(ry) < 1e-4) return d0 * exp(-camH * b) * dist;
  return d0 * exp(-camH * b) * (1.0 - exp(-dist * ry * b)) / (ry * b);
}

// Aerial perspective (tall height fog) + low valley mist, both lit by the sky/sun.
vec3 applyAtmosphere(vec3 col, vec3 camPos, vec3 wPos) {
  vec3 d = wPos - camPos;
  float dist = length(d);
  vec3 v = d / max(dist, 1e-3);
  float f = 1.0 - exp(-heightFog(uFogDensity, uFogBase, uFogHeight, camPos, v, dist));
  vec3 fogCol = skyBase(normalize(vec3(v.x, 0.03, v.z)));
  col = mix(col, fogCol, clamp(f * 1.1, 0.0, 1.0));
  float m = 1.0 - exp(-heightFog(uMistDensity, uMistBase, uMistScale, camPos, v, dist));
  float toSun = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
  vec3 mistCol = mix(uHorizonAnti * 1.05, uHorizon * 1.1 + uSunGlow * 0.3, toSun) + uSkyAmbient * 0.2;
  return mix(col, mistCol, clamp(m, 0.0, 0.85));
}
`;

// rounded cumulus cells (inverted Worley, smooth-min of distances)
const CLOUD_GLSL = /* glsl */ `
float worleyPuff(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      vec2 r = g + o - f;
      float rr = dot(r, r) * (0.7 + 0.6 * hash12(i + g + 3.1));
      d = min(d, rr);
    }
  return 1.0 - sqrt(d);
}
float cumulus(vec2 q) {
  float w = worleyPuff(q * 1.4) * 0.55 + worleyPuff(q * 3.1 + 1.7) * 0.28 + worleyPuff(q * 7.0 + 4.2) * 0.12;
  return w + (fbm(q * 1.6, 3) - 0.5) * 0.35;
}
`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...atmos },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform float uCloudTime;
      ${ATMOS_GLSL}
      ${NOISE_GLSL}
      ${CLOUD_GLSL}
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 dir = normalize(vDir);
        vec3 col = skyBase(dir);
        float mu = dot(dir, uSunDir);
        // sun disc (dimmer as it climbs: high up its bloom would whiten half the sky)
        col += uSunColor * smoothstep(0.99986, 0.99993, mu) * mix(10.0, 5.0, smoothstep(0.2, 0.64, uSunDir.y));
        if (dir.y > 0.0) {
          vec2 wind = vec2(uCloudTime * 0.004, uCloudTime * 0.0015);
          vec2 sdir = normalize(uSunDir.xz + 1e-5);
          float near = pow(max(mu, 0.0), 5.0);
          float fade = smoothstep(0.006, 0.07, dir.y);
          // ---- high altocumulus flocks: small cells in bands, strongly tinted by the low sun
          vec2 uvA = dir.xz / (dir.y + 0.3) * 1.3 + wind * 1.6 + 20.0;
          float band = smoothstep(0.42, 0.66, fbm(uvA * 0.35, 3));
          float cellsA = worleyPuff(uvA * 5.5) * 0.75 + worleyPuff(uvA * 11.0 + 3.0) * 0.25;
          float covA = smoothstep(0.62, 0.7, cellsA * band + band * 0.22) * smoothstep(0.05, 0.3, dir.y);
          vec3 colA = mix(uCloudShade * 1.1, uCloudLit * 1.05, 0.55 + 0.45 * cellsA);
          colA += uSunGlow * near * 1.2;
          col = mix(col, colA, covA * 0.85);
          // ---- cumulus: domes over a flat base, self-shadowed toward the sun
          vec2 uv = dir.xz / (dir.y + 0.08) * 0.5 + wind;
          float fieldN = fbm(uv * 0.25 + 7.3, 2);
          float thr = mix(0.62, 0.44, smoothstep(0.3, 0.7, fieldN));
          #define CL(q) cumulus((q) * 1.1)
          float c0 = CL(uv);
          float e = 0.025;
          float cx = CL(uv + vec2(e, 0.0));
          float cz = CL(uv + vec2(0.0, e));
          float cov = smoothstep(thr, thr + 0.03, c0);
          float hgt = smoothstep(thr, thr + 0.3, c0);
          vec3 nrm = normalize(vec3(-(cx - c0) / e * 0.8, 1.0, -(cz - c0) / e * 0.8));
          vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.0) + 0.2, uSunDir.z));
          float ndl = dot(nrm, L) * 0.5 + 0.5;
          float selfSh = smoothstep(0.0, 0.25, CL(uv + sdir * 0.07) - c0);      // denser toward the sun = shadowed
          float lit = smoothstep(0.35, 0.8, ndl) * (1.0 - 0.6 * selfSh) * (0.4 + 0.6 * hgt);
          vec3 base = mix(uCloudShade * 0.8, uCloudShade, hgt);                   // violet bases
          vec3 cc = mix(base, uCloudLit, lit);
          cc = mix(cc, uCloudShade * 0.85, near * hgt * 0.5);                      // backlit bodies
          cc += uSunGlow * (near * 1.4 + pow(max(mu, 0.0), 2.0) * 0.25) * (1.0 - hgt);  // glowing rims
          col = mix(col, cc, cov * fade * 0.97);
        } else {
          col = mix(col, uHorizonAnti * 0.9, clamp(-dir.y * 6.0, 0.0, 1.0));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1; // caller keeps it centred on the camera
  return sky;
}
