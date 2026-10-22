import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, PROPMASK_GLSL, VEGMAP_GLSL, FLORA_GLSL, SHRUB_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";
import { ShapeGrid } from "./physics.js";

// Shrubs: wild rose, spiraea, honeysuckle thickets and creeping juniper mats, painted (third
// texture batch, sheets E/F; tools/build_shrub_atlas.py). Placement is shrubAt() in glsl.js,
// the same function the ground uses for contact shadows and the far tint, on two GPU rings of
// world-stable 4 m cells:
//   near ring (0-130 m): the whole-shrub painting on three crossed cards, wrapped in painted
//                        sprig cards that stand out of the crown (volume, parallax)
//   far ring (100-800 m): the painting on one card turned toward the camera
// Beyond, the ground carries the shrubs' colour (terrain.js, shrubCover).

const SPRIGS = 16;

function nearGeometry() {
  const pos = [], uv = [], part = [], card = [], idx = [];
  const quad = (p, u, c) => {
    const o = part.length;
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(s - 0.5, t, 0); uv.push(s, t); part.push(p); card.push(...c); }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  for (let k = 0; k < 3; k++) quad(0, 0, [(k * Math.PI) / 3, 0, 0, 0]);          // core: crossed whole-shrub cards
  for (let k = 0; k < SPRIGS; k++) {                                                // sprigs round the crown
    const a = k * 2.39996 + 0.3, r = 0.45 + 0.5 * ((k * 0.618) % 1), y = 0.15 + 0.7 * ((k * 0.382 + 0.2) % 1);
    quad(1, 0, [a, r, y, (k % 5) / 5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute("aCard", new THREE.Float32BufferAttribute(card, 4));
  g.setIndex(idx);
  return g;
}

function farGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute([0, 0, 0, 0], 1));
  g.setAttribute("aCard", new THREE.Float32BufferAttribute(new Array(16).fill(0), 4));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const VERT = /* glsl */ `
attribute float aPart;
attribute vec4 aCard;     // core: (yaw); sprig: (angle, radial, height, variant)
uniform vec2 uOrigin;
uniform float uN;
uniform vec4 uFade;
uniform float uFar;       // 1: single camera-facing card
uniform float uCurvature;
uniform vec4 uRectWhole[4];
uniform vec4 uRectSprig[4];
uniform float uHFrac[4];  // shrub height / slot size of the whole-shrub painting
uniform vec4 uSprig[4];   // per type: sprig length / height, tilt from vertical, crown radius share, -
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vVis;
varying float vShade;
varying float vType;
varying vec2 vFade;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
${VEGMAP_GLSL}
${FLORA_GLSL}
${SHRUB_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  float id = float(gl_InstanceID);
  float iz = floor(id / uN);
  vec2 cell = uOrigin + vec2(id - iz * uN, iz);
  vec2 c0 = (cell + 0.5) * SHRUB_CELL;
  float dcam = length(c0 - cameraPosition.xz);
  // the two rings hand each shrub over pixel by pixel (fragment shader): the near ring keeps
  // the pixels the far ring leaves -- the same shrub, crossed cards near, one card far
  vec2 fade = vec2(uFade.y > 0.0 ? smoothstep(uFade.x, uFade.y, dcam) : 1.0, 1.0 - smoothstep(uFade.z, uFade.w, dcam));
  if (fade.x * fade.y < 0.002) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float w, seed;
  vec4 s = shrubAt(cell, w, seed);
  if (s.w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  int t = int(s.z + 0.5);
  float h = s.w;
  vec2 pos = s.xy;
  float ground = terrainHeight(pos) - 0.05;
  vec3 base = vec3(pos.x, ground, pos.y);
  // a woody shrub gives little: its crown leans a few centimetres with the wind and the twigs
  // stir in the eddies
  float gust = windBendPush(pos, 0.4), sg = sqrt(gust);
  vec2 wdl = windDirAt(pos);
  vec2 wind = wdl * (0.12 * gust + windTurb(pos) * 0.02 * sg) + vec2(tnoise(uTime * 1.4 + seed * 30.0, seed), tnoise(uTime * 1.2 + seed * 20.0, seed + 4.0)) * 0.03 * sg;
  float slot = h / uHFrac[t];                       // world size of the painting's square slot
  vec3 wp;
  vec3 n;
  if (aPart < 0.5) {
    // whole-shrub painting: crossed cards (near) or one card facing the camera (far)
    float yaw = uFar > 0.5 ? atan(cameraPosition.x - pos.x, cameraPosition.z - pos.y) : aCard.x + seed * 6.2831;
    vec3 across = vec3(cos(yaw), 0.0, -sin(yaw));
    float sx = slot * (w / (h * uShrubAspect[t]));   // keep the painting's aspect, width jitter
    wp = base + across * position.x * sx + vec3(0.0, position.y * slot, 0.0);
    vec4 r = uRectWhole[t];
    vUv = vec2(mix(r.x, r.z, uv.x), mix(r.w, r.y, uv.y));
    n = normalize(vec3(0.0, 1.0, 0.0) + (wp - (base + vec3(0.0, h * 0.5, 0.0))) / max(w, 0.3));
    vShade = position.y;
  } else {
    // painted sprig standing out of the crown: base inside, tip outward and up
    vec4 sp = uSprig[t];
    float a = aCard.x + seed * 6.2831;
    vec3 outw = vec3(cos(a), 0.0, sin(a));
    float tilt = sp.y * (0.8 + 0.4 * fract(aCard.w * 7.1 + seed));
    vec3 up = normalize(outw * sin(tilt) + vec3(0.0, cos(tilt), 0.0));
    vec3 side = vec3(-outw.z, 0.0, outw.x);
    float len = (t == 3 ? w * 0.42 : h * sp.x) * mix(0.8, 1.2, fract(seed * 13.0 + aCard.w));   // juniper: sprays span the mat
    vec3 root = base + outw * aCard.y * w * 0.5 * sp.z + vec3(0.0, aCard.z * h * 0.75, 0.0);
    wp = root + side * position.x * len + up * position.y * len;
    vec4 r = uRectSprig[t];
    vUv = vec2(mix(r.x, r.z, uv.x), mix(r.w, r.y, uv.y));
    n = normalize(outw * 0.7 + vec3(0.0, 0.7, 0.0));
    vShade = aCard.z + 0.3 * position.y;
  }
  // wind: tops sway, bases stay
  float sway = clamp((wp.y - ground) / max(h, 0.2), 0.0, 1.2);
  wp.xz += wind * sway * sway * h;
  // the walker pushing in: twigs near the body bend off it (and a little down)
  vec2 tp = uTrail[0].w > 0.0 && distance(pos, uTrail[0].xy) < 15.0 ? trailPushAt(wp.xz, 0.25, 0.95) : vec2(0.0);
  wp.xz += tp * 0.32 * sway;
  wp.y -= length(tp) * 0.1 * sway * h;
  vNormal = n;
  vWorld = wp;
  vType = float(t);
  vFade = fade;
  vVis = sunVisibility(pos, h * 0.6);
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vVis;
varying float vShade;
varying float vType;
varying vec2 vFade;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < 0.5) discard;
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dz < 1.0 - vFade.x || dz >= vFade.y) discard;                       // ring hand-over (vertex shader)
  if (dz >= smoothstep(0.4, 1.5, distance(vWorld, cameraPosition))) discard;   // (thinned right at the camera)
  vec3 albedo = tex.rgb;
  // inner, lower foliage is shaded by the crown
  albedo *= mix(0.55, 1.0, smoothstep(0.0, 0.8, vShade));
  vec3 n = normalize(vNormal);
  float vis = vVis * objectShadow(vWorld, n);
  vec3 col = toonLight(albedo, n, vis, 0.35);
  vec3 v = normalize(vWorld - cameraPosition);
  col += uSunColor * albedo * pow(max(dot(v, uSunDir), 0.0), 3.0) * 0.35 * vis;   // leaves glow backlit
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The shrubs round the walker for its collisions (physics.js): the same shrubAt() evaluated for
// the cells round it in a small float target and read back, so the CPU knows exactly the shrubs
// the GPU draws. Re-read when the walker has gone a quarter of the square from its centre.
const PROBE_N = 24;   // cells a side (96 m)
const PROBE_FRAG = /* glsl */ `
uniform vec2 uOrigin;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
${VEGMAP_GLSL}
${FLORA_GLSL}
${SHRUB_GLSL}
void main() {
  vec2 cell = uOrigin + floor(gl_FragCoord.xy);
  float w, seed;
  vec4 s = shrubAt(cell, w, seed);
  gl_FragColor = vec4(s.x, s.y, s.w, s.w > 0.0 ? s.z * 16.0 + w : 0.0);   // x, z, height, type * 16 + width
}
`;
// per type (rose, spiraea, honeysuckle, juniper): the stems' core that stops the walker (share of
// the crown width) and how much pushing through the crown slows it
const BUSH = [{ core: 0.22, slow: 0.6 }, { core: 0.18, slow: 0.55 }, { core: 0.22, slow: 0.6 }, { core: 0, slow: 0.65 }];

class ShrubProbe {
  constructor(terrain) {
    this.terrain = terrain;
    this.rt = new THREE.WebGLRenderTarget(PROBE_N, PROBE_N, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.uniforms = { ...atmos, ...worldUniforms, ...shadowUniforms, uOrigin: { value: new THREE.Vector2() } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: PROBE_FRAG, depthTest: false, depthWrite: false });
    this.scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.buf = new Float32Array(PROBE_N * PROBE_N * 4);
    this.centre = new THREE.Vector2(1e9, 1e9);
    this.shapes = new ShapeGrid(8);
    this.query = (x, z, r, out, st) => this.shapes.query(x, z, r, out, st);
  }

  update(renderer, x, z) {
    if (Math.abs(x - this.centre.x) < PROBE_N && Math.abs(z - this.centre.y) < PROBE_N) return;
    const ox = Math.floor(x / 4) - PROBE_N / 2, oz = Math.floor(z / 4) - PROBE_N / 2;
    this.uniforms.uOrigin.value.set(ox, oz);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
    renderer.readRenderTargetPixels(this.rt, 0, 0, PROBE_N, PROBE_N, this.buf);
    renderer.setRenderTarget(prev);
    this.centre.set(x, z);
    this.shapes.clear();
    const b = this.buf;
    for (let i = 0; i < PROBE_N * PROBE_N; i++) {
      const h = b[i * 4 + 2];
      if (!(h > 0)) continue;
      const t = Math.min(3, Math.floor(b[i * 4 + 3] / 16)), w = b[i * 4 + 3] - t * 16;
      const sx = b[i * 4], sz = b[i * 4 + 1], y = this.terrain.heightAt(sx, sz) - 0.05;
      this.shapes.add({ k: "bush", x: sx, z: sz, r: 0.5 * w, core: BUSH[t].core * w, slow: BUSH[t].slow, y0: y, top: y + h });
    }
  }
}

export class Shrubs {
  static async create() {
    const [meta, tex] = await Promise.all([
      fetch("./assets/shrubs.json").then((r) => r.json()),
      new THREE.TextureLoader().loadAsync("./assets/shrubs.png"),
    ]);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return new Shrubs(meta, tex);
  }

  constructor(meta, tex) {
    const names = ["rose", "spiraea", "honeysuckle", "juniper"];
    worldUniforms.uShrubAspect.value = names.map((n) => meta[n].aspect);
    worldUniforms.uShrubCol.value = names.map((n) => new THREE.Vector3(...meta[n].col));
    worldUniforms.uShrubFill.value = names.map((n) => meta[n].fill);
    const common = {
      uAtlas: { value: tex },
      uRectWhole: { value: names.map((n) => new THREE.Vector4(...meta[n].whole)) },
      uRectSprig: { value: names.map((n) => new THREE.Vector4(...meta[n].sprig)) },
      uHFrac: { value: names.map((n) => meta[n].hFrac) },
      // sprig length / shrub height, tilt from vertical (rad), how far out the sprig roots sit
      uSprig: { value: [new THREE.Vector4(0.5, 0.9, 0.8, 0), new THREE.Vector4(0.45, 0.6, 0.8, 0), new THREE.Vector4(0.5, 0.45, 0.7, 0), new THREE.Vector4(0.9, 1.25, 0.7, 0)] },
    };
    this.mesh = new THREE.Group();
    this.rings = [
      { geo: nearGeometry(), radius: 130, fade: [0, 0, 100, 130], far: 0 },
      { geo: farGeometry(), radius: 800, fade: [100, 130, 650, 800], far: 1 },
    ].map((R) => {
      const n = Math.ceil((2 * R.radius) / 4);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = R.geo.index;
      for (const k of ["position", "uv", "aPart", "aCard"]) geo.setAttribute(k, R.geo.attributes[k]);
      geo.instanceCount = n * n;
      const uniforms = { ...atmos, ...worldUniforms, ...shadowUniforms, ...common, uOrigin: { value: new THREE.Vector2() }, uN: { value: n },
        uFade: { value: new THREE.Vector4(...R.fade) }, uFar: { value: R.far } };
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
      mesh.frustumCulled = false;
      this.mesh.add(mesh);
      return { ...R, n, uniforms, mesh };
    });
  }

  // the shrubs round the walker as collision shapes (a provider for physics.js Collision)
  probe(terrain) {
    if (!this._probe) this._probe = new ShrubProbe(terrain);
    return this._probe;
  }

  update(camera) {
    const above = camera.userData.aboveGround ?? 0;
    this.rings[0].mesh.visible = above < 120;
    for (const R of this.rings)
      // (whole cells: the same shrubs in both rings, the probe and the ground's contact shadows)
      R.uniforms.uOrigin.value.set(Math.floor(camera.position.x / 4) - Math.floor(R.n / 2), Math.floor(camera.position.z / 4) - Math.floor(R.n / 2));
  }
}
