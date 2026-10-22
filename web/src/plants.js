import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, PROPMASK_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Near-range flowering plants (< ~14 m): real cosmos plants with branching stems, 1–3 heads,
// cupped petals and feathery leaves, plus small white daisies. Same world-stable GPU cell
// scheme as the grass; beyond this range the simple star flowers of flowers.js take over.
// Attributes: aPart 0 stem, 1 leaf, 2 petal, 3 centre; aHead 0..2; uv into flower_atlas.png.

const PETAL_U = [0.0, 0.25], DAISY_U = [0.25, 0.5], LEAF_U = [0.5, 1.0];

class G {
  constructor() { this.p = []; this.uv = []; this.part = []; this.head = []; this.idx = []; }
  v(p, uv, part, head) { this.p.push(p.x, p.y, p.z); this.uv.push(uv[0], uv[1]); this.part.push(part); this.head.push(head); return this.part.length - 1; }
  grid(P, UV, part, head) {  // rows x cols
    const rows = P.length, cols = P[0].length, o = this.part.length;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) this.v(P[i][j], UV[i][j], part, head);
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < cols - 1; j++) {
        const a = o + i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
        this.idx.push(a, b, c, a, c, d);
      }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute("aHead", new THREE.Float32BufferAttribute(this.head, 1));
    g.setIndex(this.idx);
    return g;
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// thin 3-sided stem along a quadratic curve
function stem(g, a, c, b, r, head) {
  const segs = 5, sides = 3, P = [], UV = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(b.clone().multiplyScalar(t * t));
    const row = [], urow = [];
    for (let j = 0; j <= sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      row.push(V3(p.x + Math.cos(ang) * r, p.y, p.z + Math.sin(ang) * r));
      urow.push([0.9, 0.5]);
    }
    P.push(row); UV.push(urow);
  }
  g.grid(P, UV, 0, head);
}

// flower head at `c`, facing `n`; cosmos: 8 broad cupped petals; daisy: 16 thin flat petals
function flowerHead(g, c, n, R, head, daisy, rot) {
  n = n.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const count = daisy ? 16 : 8;
  const [u0, u1] = daisy ? DAISY_U : PETAL_U;
  for (let k = 0; k < count; k++) {
    const a = rot + (k / count) * Math.PI * 2;
    const dir = t1.clone().multiplyScalar(Math.cos(a)).add(t2.clone().multiplyScalar(Math.sin(a)));
    const side = new THREE.Vector3().crossVectors(n, dir);
    const w = daisy ? R * 0.16 : R * 0.42;
    const P = [], UV = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const cup = daisy ? 0.02 * t : 0.22 * t * t - 0.05 * t;  // cosmos petals cup up then droop a touch
      const row = [], urow = [];
      for (let j = 0; j <= 2; j++) {
        const s = j / 2 - 0.5;
        const fold = daisy ? 0 : -Math.abs(s) * 0.06 * R;
        row.push(c.clone().addScaledVector(dir, R * (0.18 + 0.82 * t)).addScaledVector(side, s * w * 2).addScaledVector(n, (cup * R) + fold));
        urow.push([u0 + (u1 - u0) * (s + 0.5), t]);
      }
      P.push(row); UV.push(urow);
    }
    g.grid(P, UV, 2, head);
  }
  // centre: domed disc
  const cr = daisy ? R * 0.28 : R * 0.22, P = [], UV = [];
  for (let i = 0; i <= 2; i++) {
    const rr = cr * (1 - i / 2), h = (daisy ? 0.25 : 0.35) * cr * Math.sin((i / 2) * Math.PI * 0.5);
    const row = [], urow = [];
    for (let j = 0; j <= 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      row.push(c.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).addScaledVector(n, h + 0.002));
      urow.push([0.9, 0.5]);
    }
    P.push(row); UV.push(urow);
  }
  g.grid(P, UV, 3, head);
}

// feathery leaf card at a stem node
function leafCard(g, base, yaw, len, tilt) {
  const d = V3(Math.cos(yaw), 0, Math.sin(yaw));
  const up = V3(0, 1, 0).multiplyScalar(Math.cos(tilt)).addScaledVector(d, Math.sin(tilt));
  const side = new THREE.Vector3().crossVectors(up, d).normalize().multiplyScalar(len * 0.5);
  const top = base.clone().addScaledVector(up, len);
  g.grid([[base.clone().sub(side), base.clone().add(side)], [top.clone().sub(side), top.clone().add(side)]],
    [[[LEAF_U[0], 1], [LEAF_U[1], 1]], [[LEAF_U[0], 0], [LEAF_U[1], 0]]], 1, 0);
}

function cosmosPlant() {
  const g = new G();
  const heads = [
    { p: V3(0, 1.0, 0), c: V3(0.02, 0.55, 0.01), n: V3(0.25, 1, 0.15), r: 0.066 },
    { p: V3(0.17, 0.86, 0.08), c: V3(0.07, 0.6, 0.03), n: V3(0.7, 1, 0.3), r: 0.058 },
    { p: V3(-0.13, 0.76, -0.11), c: V3(-0.05, 0.5, -0.04), n: V3(-0.6, 1, -0.5), r: 0.052 },
  ];
  heads.forEach((h, i) => {
    stem(g, i === 0 ? V3(0, 0, 0) : V3(0, 0.38 + i * 0.05, 0), h.c, h.p, 0.0035, i);
    flowerHead(g, h.p, h.n, h.r, i, false, i * 0.7);
  });
  for (const [y, yaw, len, tilt] of [[0.08, 0.3, 0.26, 0.9], [0.1, 2.4, 0.24, 0.95], [0.12, 4.3, 0.25, 0.9], [0.32, 1.2, 0.2, 0.8], [0.34, 3.6, 0.2, 0.85], [0.55, 5.0, 0.15, 0.7]])
    leafCard(g, V3(0, y, 0), yaw, len, tilt);
  return g.build();
}

function daisyPlant() {
  const g = new G();
  const heads = [{ p: V3(0, 1.0, 0), c: V3(0.03, 0.5, 0), n: V3(0.1, 1, 0.05), r: 0.032 }, { p: V3(0.1, 0.8, 0.06), c: V3(0.05, 0.4, 0.02), n: V3(0.4, 1, 0.3), r: 0.028 }];
  heads.forEach((h, i) => { stem(g, V3(0, 0, 0), h.c, h.p, 0.0028, i); flowerHead(g, h.p, h.n, h.r, i, true, i); });
  for (const [yaw, tilt] of [[0.4, 1.2], [2.5, 1.25], [4.4, 1.2]]) leafCard(g, V3(0, 0.02, 0), yaw, 0.14, tilt);
  return g.build();
}

const VERT = /* glsl */ `
attribute float aPart;
attribute float aHead;
uniform vec2 uOrigin;
uniform float uCell;
uniform float uN;
uniform vec4 uFade;
uniform vec2 uLodge;
uniform float uDaisy;
uniform float uCurvature;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vPart;
varying float vVis;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

vec3 pick(float r, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
  return r < 0.28 ? a : r < 0.5 ? b : r < 0.68 ? c : r < 0.86 ? d : e;
}

void main() {
  float id = float(gl_InstanceID);
  float iz = floor(id / uN);
  float ix = id - iz * uN;
  vec2 cell = uOrigin + vec2(ix, iz);
  vec2 pos = (cell + hash22(cell + uDaisy * 7.1)) * uCell;
  vec2 dh = pos - cameraPosition.xz;
  float dist = length(dh);
  float fade = 1.0 - smoothstep(uFade.z, uFade.w, dist);
  vec3 lc = landcover(pos);
  vec2 pm = propMask(pos);
  vec4 det = detailAt(pos);
  float meadow = (1.0 - smoothstep(0.3, 0.7, lc.r)) * (1.0 - smoothstep(0.3, 0.8, lc.g)) * (1.0 - lc.b)
               * (1.0 - smoothstep(0.1, 0.5, pm.r)) * (1.0 - 0.7 * pm.g)
               * (1.0 - smoothstep(0.05, 0.4, det.g)) * (1.0 - smoothstep(0.2, 0.6, det.b));
  float lodge = 1.0 - smoothstep(170.0, 380.0, distance(pos, uLodge));
  float bed = lodge * smoothstep(0.3, 0.58, vnoise(pos * 0.09) * 0.7 + vnoise(pos * 0.5) * 0.3);
  float wild = smoothstep(0.58, 0.74, fbm(pos * 0.012, 3)) * 0.3 * smoothstep(0.4, 0.7, vnoise(pos * 0.3));
  float dens = uDaisy > 0.5 ? 0.3 * max(bed * 0.6, wild * 1.5) + 0.05 : min(1.0, bed * 1.3) + wild * 0.25;
  float keep = step(hash12(cell * 1.7 + 11.0 + uDaisy), dens * meadow) * step(hash12(cell + 91.3), fade);
  if (keep < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  float r1 = hash12(cell + 3.1), r2 = hash12(cell + 8.3), r3 = hash12(cell + 5.7);
  float H = uDaisy > 0.5 ? mix(0.35, 0.55, r1) : mix(0.75, 1.2, r1);
  float yaw = r2 * 6.2831;
  vec3 p = position;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  vec3 nrm = aPart > 1.5 ? normalize(vec3(p.x, 0.0, p.z) + vec3(0.0, 0.8, 0.0)) : vec3(0.0, 1.0, 0.0);
  float ground = terrainHeight(pos);
  // wind: same gusts as the grass, bending grows with height
  float gust = windWave(pos);
  vec3 lean = normalize(vec3(uWindDir.x, 0.0, uWindDir.y) * (0.35 + gust) + vec3(r1 - 0.5, 0.0, r3 - 0.5) * 0.5);
  float bend = 0.1 + 0.3 * gust + (windTurb(pos + r2 * 5.0) * 0.03 + tnoise(uTime * 1.2 + r2 * 20.0 + aHead * 1.7, r2) * 0.03) * (0.08 + gust);
  float y = p.y;
  vec3 wp = vec3(pos.x, ground - 0.02, pos.y) + p * H + lean * bend * y * y * H;
  wp.y -= bend * bend * 0.3 * y * y * H;

  // cosmos palette from the references: magenta, pink, white, lilac, a little deep rose
  vec3 cosmosCol = pick(hash12(cell + aHead * 13.0 + 1.0), vec3(0.8, 0.14, 0.5), vec3(0.95, 0.52, 0.74), vec3(0.94, 0.92, 0.9),
                        vec3(0.72, 0.46, 0.88), vec3(0.62, 0.08, 0.34));
  vec3 petal = uDaisy > 0.5 ? vec3(0.94, 0.93, 0.9) : cosmosCol;
  vec3 centre = uDaisy > 0.5 ? vec3(0.95, 0.72, 0.1) : vec3(0.92, 0.66, 0.08);
  vColor = aPart < 0.5 ? vec3(0.1, 0.22, 0.05) : aPart < 1.5 ? vec3(0.62, 0.78, 0.5) : aPart < 2.5 ? petal : centre;
  vPart = aPart;
  vUv = uv;
  vNormal = nrm;
  vWorld = wp;
  vVis = sunVisibility(pos, y * H);
  dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vPart;
varying float vVis;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec3 albedo = vColor;
  if (vPart > 0.5 && vPart < 2.5) {
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.5) discard;
    if (vPart > 1.5) {
      // petal: brightness from the atlas, deeper tone in the eye zone around the centre
      albedo = vColor * (0.9 + 0.2 * t.r);
      albedo = mix(albedo, albedo * vec3(0.8, 0.55, 0.7), t.g * 0.45);
    } else {
      albedo = t.rgb * vColor * 1.2;
    }
  }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float vis = vVis * objectShadow(vWorld, vec3(0.0, 1.0, 0.0));
  vec3 col = toonLight(albedo, n, vis, 0.45) * (vPart > 1.5 ? 1.15 : 1.0);
  vec3 v = normalize(vWorld - cameraPosition);
  float back = pow(max(dot(v, uSunDir), 0.0), 2.0);
  col += uSunColor * albedo * back * (vPart > 1.5 ? 0.22 : 0.12) * vis;   // translucent petals
  col = min(col, vec3(1.6));
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class NearPlants {
  constructor(lodge) {
    this.group = new THREE.Group();
    const atlas = new THREE.TextureLoader().load("./assets/flower_atlas.png");
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 8;
    this.layers = [
      { geo: cosmosPlant(), cell: 0.5, radius: 15, daisy: 0 },
      { geo: daisyPlant(), cell: 0.45, radius: 10, daisy: 1 },
    ].map((L) => {
      L.n = Math.ceil((2 * L.radius) / L.cell);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = L.geo.index;
      for (const k of ["position", "uv", "aPart", "aHead"]) geo.setAttribute(k, L.geo.attributes[k]);
      geo.instanceCount = L.n * L.n;
      L.uniforms = {
        ...atmos, ...worldUniforms, ...shadowUniforms,
        uAtlas: { value: atlas },
        uOrigin: { value: new THREE.Vector2() },
        uCell: { value: L.cell },
        uN: { value: L.n },
        uFade: { value: new THREE.Vector4(0, 0, L.daisy ? 7 : 10, L.daisy ? 10 : 14) },
        uLodge: { value: new THREE.Vector2(lodge.x, lodge.z) },
        uDaisy: { value: L.daisy },
      };
      L.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: L.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
      L.mesh.frustumCulled = false;
      this.group.add(L.mesh);
      return L;
    });
    this.fadeStart = 11; // star flowers in flowers.js fade in from here
  }

  update(camera) {
    this.group.visible = camera.userData.aboveGround === undefined || camera.userData.aboveGround < 25;
    for (const L of this.layers)
      L.uniforms.uOrigin.value.set(Math.floor(camera.position.x / L.cell) - L.n / 2, Math.floor(camera.position.z / L.cell) - L.n / 2);
  }
}
