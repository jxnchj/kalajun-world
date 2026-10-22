import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Rigged, animated animals drawn by the hundred (tools/blender/animal.py: one model per species, three
// levels of detail on one skeleton, its clips as actions). At load every clip is sampled frame by frame
// (30 fps) into a texture of bone matrices; each level is one instanced mesh whose vertex shader skins
// every animal from that texture -- its clip and time, a second clip to blend into, its size, coat and
// heading per instance. The colour texture is recoloured per coat by region (head, bare legs; the
// hooves kept), keeping the texture's own shading.

export const FPS = 30;

// coats per species (linear albedo): [body, r, g, a] -- the colours of the regions the model marks
// (tools/blender/animal.py regions): sheep r head, g bare legs; cattle r face, g legs below knee and hock,
// a the underline. Each region is repainted by coat / the texture's own mean there, keeping its shading.
const S_ = (body, head, legs) => [body, head, legs, body];
export const COATS = {
  sheep: [
    { name: "棕", c: S_([0.3, 0.17, 0.08], [0.09, 0.055, 0.035], [0.13, 0.08, 0.05]) },
    { name: "米白黑头", c: S_([0.6, 0.54, 0.44], [0.07, 0.05, 0.04], [0.09, 0.065, 0.05]) },
    { name: "黑", c: S_([0.05, 0.045, 0.04], [0.04, 0.035, 0.03], [0.045, 0.04, 0.035]) },
    { name: "浅棕", c: S_([0.42, 0.28, 0.15], [0.2, 0.12, 0.07], [0.24, 0.15, 0.09]) },
    { name: "深棕", c: S_([0.24, 0.13, 0.06], [0.06, 0.04, 0.03], [0.08, 0.05, 0.035]) },
    { name: "米白", c: S_([0.56, 0.5, 0.41], [0.5, 0.41, 0.33], [0.46, 0.39, 0.31]) },
  ],
  // Kazakh whiteheads (red-brown, white face, underline and stockings) and Xinjiang browns
  cattle: [
    { name: "白头红", c: [[0.21, 0.065, 0.028], [0.62, 0.58, 0.52], [0.55, 0.51, 0.45], [0.58, 0.54, 0.48]] },
    { name: "白头深红", c: [[0.15, 0.048, 0.022], [0.6, 0.56, 0.5], [0.52, 0.48, 0.42], [0.55, 0.51, 0.45]] },
    { name: "白头浅红", c: [[0.28, 0.1, 0.042], [0.63, 0.59, 0.53], [0.56, 0.52, 0.46], [0.6, 0.56, 0.5]] },
    { name: "褐", c: [[0.27, 0.15, 0.07], [0.27, 0.15, 0.07], [0.24, 0.13, 0.06], [0.3, 0.18, 0.09]] },
    { name: "浅褐", c: [[0.4, 0.26, 0.13], [0.4, 0.26, 0.13], [0.36, 0.23, 0.11], [0.44, 0.3, 0.16]] },
    { name: "深褐", c: [[0.15, 0.08, 0.04], [0.15, 0.08, 0.04], [0.13, 0.07, 0.035], [0.18, 0.1, 0.05]] },
  ],
  // Ili horses: [body, mane and tail, lower legs, blaze]
  horse: [
    { name: "骝", c: [[0.14, 0.066, 0.036], [0.02, 0.016, 0.013], [0.022, 0.017, 0.014], [0.14, 0.066, 0.036]] },
    { name: "骝·白章", c: [[0.14, 0.066, 0.036], [0.02, 0.016, 0.013], [0.022, 0.017, 0.014], [0.6, 0.58, 0.54]] },
    { name: "栗", c: [[0.22, 0.11, 0.055], [0.3, 0.16, 0.07], [0.18, 0.09, 0.045], [0.6, 0.58, 0.54]] },
    { name: "黑", c: [[0.026, 0.023, 0.021], [0.012, 0.011, 0.01], [0.017, 0.015, 0.014], [0.026, 0.023, 0.021]] },
    { name: "青白", c: [[0.5, 0.48, 0.44], [0.56, 0.54, 0.49], [0.36, 0.34, 0.31], [0.5, 0.48, 0.44]] },
    { name: "深骝", c: [[0.075, 0.037, 0.022], [0.015, 0.012, 0.01], [0.018, 0.014, 0.012], [0.075, 0.037, 0.022]] },
  ],
  // Kazakh shepherd dogs: [body, saddle (the back), -, muzzle mask]
  dog: [
    { name: "奶黄", c: [[0.6, 0.5, 0.33], [0.6, 0.5, 0.33], [0.6, 0.5, 0.33], [0.48, 0.38, 0.25]] },
    { name: "白", c: [[0.66, 0.63, 0.56], [0.66, 0.63, 0.56], [0.66, 0.63, 0.56], [0.6, 0.55, 0.48]] },
    { name: "黄褐", c: [[0.42, 0.27, 0.12], [0.36, 0.22, 0.1], [0.42, 0.27, 0.12], [0.22, 0.13, 0.06]] },
    { name: "黄褐黑背", c: [[0.42, 0.27, 0.12], [0.05, 0.04, 0.035], [0.42, 0.27, 0.12], [0.06, 0.05, 0.04]] },
    { name: "灰褐", c: [[0.3, 0.25, 0.2], [0.2, 0.17, 0.14], [0.3, 0.25, 0.2], [0.14, 0.11, 0.09]] },
  ],
  // grey marmots: [body, back, -, face]
  marmot: [
    { name: "黄灰", c: [[0.44, 0.27, 0.11], [0.3, 0.2, 0.11], [0.44, 0.27, 0.11], [0.4, 0.3, 0.19]] },
    { name: "灰", c: [[0.34, 0.27, 0.19], [0.22, 0.18, 0.13], [0.34, 0.27, 0.19], [0.36, 0.3, 0.24]] },
    { name: "黄", c: [[0.52, 0.34, 0.13], [0.36, 0.24, 0.1], [0.52, 0.34, 0.13], [0.46, 0.35, 0.2]] },
    { name: "深", c: [[0.26, 0.18, 0.1], [0.15, 0.11, 0.07], [0.26, 0.18, 0.1], [0.3, 0.23, 0.16]] },
  ],
  // birds of prey: [body, crown and nape, -, -]; the black kite is the eagle model, smaller and darker
  eagle: [
    { name: "金雕", c: [[0.11, 0.055, 0.028], [0.4, 0.25, 0.09], [0.11, 0.055, 0.028], [0.11, 0.055, 0.028]] },
    { name: "金雕·深", c: [[0.075, 0.04, 0.022], [0.32, 0.2, 0.08], [0.075, 0.04, 0.022], [0.075, 0.04, 0.022]] },
    { name: "黑鸢", c: [[0.06, 0.042, 0.03], [0.13, 0.1, 0.075], [0.06, 0.042, 0.03], [0.06, 0.042, 0.03]] },
    { name: "黑鸢·浅", c: [[0.085, 0.06, 0.04], [0.16, 0.12, 0.085], [0.085, 0.06, 0.04], [0.085, 0.06, 0.04]] },
  ],
};
COATS.lamb = COATS.sheep;     // the young, re-proportioned adults (tools/blender/animal.py young_stage)
COATS.foal = COATS.horse;
// which species have wool (softer light wrap, glowing edges against the sun)
const WOOL = { sheep: 1, lamb: 1, cattle: 0 };

const VERT = /* glsl */ `
precision highp sampler2D;
uniform sampler2D uAnim;      // bone matrices: x = bone * 3 + row, y = frame row
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 color;         // regions r, g, a repainted (in that order); b kept as the texture has it
attribute vec4 iPos;          // x, y (ground), z, heading
attribute vec4 iMisc;         // size, coat, pitch (with the slope), roll
attribute vec4 iAnim;         // frame row of clip a, of clip b, blend a -> b, -
uniform float uCurvature;
uniform vec3 uEye;            // the viewer (also in the shadow pass)
uniform vec4 uLod;            // this level drawn from uLod.x..y m on, up to uLod.z..w m
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vRegion;
varying float vCoat;
varying float vVis;
varying vec2 vFade;
${NOISE_GLSL}
#ifdef TERRAIN
${HEIGHT_GLSL}
${SHADOW_GLSL}
#endif
#include <common>
#include <logdepthbuf_pars_vertex>
mat4 boneAt(int b, int row) {
  int x = b * 3;
  vec4 r0 = texelFetch(uAnim, ivec2(x, row), 0);
  vec4 r1 = texelFetch(uAnim, ivec2(x + 1, row), 0);
  vec4 r2 = texelFetch(uAnim, ivec2(x + 2, row), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
mat4 skinAt(float rowf) {
  int r = int(floor(rowf));
  float f = rowf - float(r);
  mat4 m = mat4(0.0);
  for (int i = 0; i < INFLUENCES; i++) {
    float w = skinWeight[i];
    if (w > 0.0) {
      int b = int(skinIndex[i] + 0.5);
      mat4 a = boneAt(b, r);
      m += w * (f > 0.001 ? a + (boneAt(b, r + 1) - a) * f : a);
    }
  }
  return m;
}
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void main() {
  mat4 S = skinAt(iAnim.x);
  if (iAnim.z > 0.001) S += (skinAt(iAnim.y) - S) * iAnim.z;
  vec3 p = (S * vec4(position, 1.0)).xyz * iMisc.x;
  vec3 n = mat3(S) * normal;
  mat3 R = rotX(-iMisc.z) * rotZ(iMisc.w);
  float cy = cos(iPos.w), sy = sin(iPos.w);
  mat3 Y = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  p = Y * (R * p);
  n = Y * (R * n);
  vec3 wp = iPos.xyz + p;
  vWorld = wp;
  vNormal = n;
  vUv = uv;
  vRegion = color;
  vCoat = iMisc.y;
  float d = distance(iPos.xyz, uEye);
  vFade = vec2(uLod.y > 0.0 ? smoothstep(uLod.x, uLod.y, d) : 1.0, uLod.w > 0.0 ? 1.0 - smoothstep(uLod.z, uLod.w, d) : 1.0);
  #ifdef TERRAIN
    vVis = sunVisibility(iPos.xz, 0.5);
  #else
    vVis = 1.0;
  #endif
  #if defined(TERRAIN) && !defined(SHADOW_PASS)
    vec2 dh = wp.xz - cameraPosition.xz;
    wp.y -= dot(dh, dh) * uCurvature;
  #endif
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform vec3 uBase[4];        // the texture's mean colour over the body and regions r, g, a (linear)
uniform vec3 uCoat[COATS * 4];
uniform float uWool;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vRegion;
varying float vCoat;
varying float vVis;
varying vec2 vFade;
${ATMOS_GLSL}
${NOISE_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>
vec3 perturb(vec3 pos, vec3 N, vec3 m, vec2 uv) {
  vec3 q0 = dFdx(pos), q1 = dFdy(pos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, N), q0p = cross(N, q0);
  vec3 T = q1p * st0.x + q0p * st1.x;
  vec3 B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (m.x * s) + B * (m.y * s) + N * m.z);
}
void main() {
  #include <logdepthbuf_fragment>
  // the hand-over between levels of detail, pixel by pixel (complementary on the two levels)
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dz < 1.0 - vFade.x || dz >= vFade.y) discard;
  #ifdef SHADOW_PASS
    gl_FragColor = vec4(shadowPassDepth(vWorld));
    return;
  #endif
  vec3 tex = texture2D(uMap, vUv).rgb;
  int c = int(vCoat + 0.5) * 4;
  vec4 g = vRegion;
  vec3 base = mix(mix(mix(uBase[0], uBase[1], g.r), uBase[2], g.g), uBase[3], g.a);
  vec3 coat = mix(mix(mix(uCoat[c], uCoat[c + 1], g.r), uCoat[c + 2], g.g), uCoat[c + 3], g.a);
  // the texture's own detail carried over: hue and all where the coat is near the texture's colour; only
  // its light and dark where the coat is far lighter or darker (else faint casts in a dark mane turn blue)
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  float lb = max(dot(base, LW), 1e-4);
  float far = clamp(abs(log(max(dot(coat, LW), 1e-4) / lb)) / 1.1, 0.0, 1.0);
  vec3 detail = min(mix(tex / max(base, vec3(1e-4)), vec3(dot(tex, LW) / lb), far), vec3(2.5));
  vec3 albedo = mix(coat * detail, tex, g.b);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  #ifdef NORMAL_MAP
    vec3 m = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    m.xy *= vec2(NORMAL_STRENGTH, -NORMAL_STRENGTH);   // (glTF's flipped v)
    n = perturb(vWorld, n, m, vUv);
  #endif
  float wool = uWool * (1.0 - g.r) * (1.0 - g.g) * (1.0 - g.b);
  float vis = vVis * objectShadow(vWorld, n);
  vec3 col = toonLight(albedo, n, vis, mix(0.12, 0.35, wool));
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * pow(max(dot(-v, uSunDir), 0.0), 1.5);
  col += uSunColor * albedo * rim * mix(0.6, 1.4, wool) * vis;   // wool glows at its edges against the sun
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const srgbToLinear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

export class AnimalKind {
  // url: the species' .glb; species: key of COATS; terrain: shaded with the terrain's sun shadow and the
  // earth's curvature (the scene) or not (a viewer on flat ground)
  static async load(url, species, opts = {}) {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new AnimalKind(gltf, species, opts);
  }

  // lod: per level [inA, inB, outA, outB] (m from the viewer; 0 = no limit)
  constructor(gltf, species, { terrain = true, normalStrength = 0.8, lod = [[0, 0, 32, 40], [32, 40, 110, 130], [110, 130, 0, 0]] } = {}) {
    this.lodRange = lod;
    this.eye = { value: new THREE.Vector3() };
    this.species = species;
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const meshes = [];
    let rig = null;
    root.traverse((o) => {
      if (o.isSkinnedMesh) meshes.push(o);
      if (o.userData && o.userData.clips) rig = o;
    });
    meshes.sort((a, b) => a.name.localeCompare(b.name));
    this.meta = JSON.parse(rig.userData.clips);
    const base = JSON.parse(rig.userData.coat_base);
    const bones = meshes[0].skeleton.bones;
    this.nBones = bones.length;
    this.bake(root, gltf.animations, meshes[0]);

    const coats = COATS[species];
    const coatArr = coats.flatMap((k) => k.c.map((v) => new THREE.Vector3(...v)));
    const baseArr = ["body", "r", "g", "a"].map((k) => new THREE.Vector3(...base[k].map(srgbToLinear)));
    this.group = new THREE.Group();
    this.lods = meshes.map((sm, li) => {
      const src = sm.geometry;
      const g = new THREE.InstancedBufferGeometry();
      g.index = src.index;
      for (const k of ["position", "normal", "uv", "color"]) g.setAttribute(k, src.attributes[k]);
      // skin indices into the first level's bone list (the levels' skins may list the joints differently)
      // and, for the coarser levels that use only the 3 or 2 largest weights, those first and summing to 1
      const map = sm.skeleton.bones.map((b) => bones.indexOf(b));
      const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
      const keep = li === 0 ? 4 : li === 1 ? 3 : 2;
      const idx = new Float32Array(si.count * 4), wts = new Float32Array(si.count * 4);
      for (let i = 0; i < si.count; i++) {
        const pairs = [0, 1, 2, 3].map((j) => [map[si.getComponent(i, j)], sw.getComponent(i, j)]).sort((a, b) => b[1] - a[1]);
        let sum = 0;
        for (let j = 0; j < keep; j++) sum += pairs[j][1];
        for (let j = 0; j < 4; j++) {
          idx[i * 4 + j] = pairs[j][0];
          wts[i * 4 + j] = j < keep && sum > 0 ? pairs[j][1] / sum : 0;
        }
      }
      g.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
      g.setAttribute("skinWeight", new THREE.BufferAttribute(wts, 4));
      const uniforms = {
        ...atmos, ...worldUniforms, ...shadowUniforms,
        uAnim: { value: this.animTex },
        uMap: { value: sm.material.map },
        uNormalMap: { value: sm.material.normalMap },
        uBase: { value: baseArr },
        uCoat: { value: coatArr },
        uWool: { value: WOOL[species] ?? 0 },
        uEye: this.eye,
        uLod: { value: new THREE.Vector4(...lod[li]) },
      };
      const defines = { COATS: coats.length, INFLUENCES: keep, NORMAL_STRENGTH: normalStrength.toFixed(2) };
      if (terrain) defines.TERRAIN = 1;
      if (li === 0 && sm.material.normalMap) defines.NORMAL_MAP = 1;
      const mat = new THREE.ShaderMaterial({ uniforms, defines, vertexShader: VERT, fragmentShader: FRAG });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.userData.shadowMaterial = new THREE.ShaderMaterial({ uniforms, defines: { ...defines, SHADOW_PASS: 1 }, vertexShader: VERT, fragmentShader: FRAG });
      mesh.layers.enable(1);
      g.instanceCount = 0;
      this.group.add(mesh);
      const L = { mesh, geo: g, cap: 0, tris: src.index.count / 3 };
      this.grow(L, 16);
      return L;
    });
  }

  grow(L, n) {
    L.cap = n;
    for (const k of ["iPos", "iMisc", "iAnim"]) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
      L.geo.setAttribute(k, a);
      L[k] = a;
    }
  }

  // every clip, frame by frame, into a float texture of skinning matrices (bone * 3 + row, frame row)
  bake(root, animations, mesh) {
    const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses, bind = mesh.bindMatrix;
    this.clips = {};
    let rows = 0;
    for (const [name, m] of Object.entries(this.meta)) {
      this.clips[name] = { ...m, start: rows };
      rows += m.frames + 1;
    }
    const W = this.nBones * 3;
    const data = new Float32Array(W * rows * 4);
    const mixer = new THREE.AnimationMixer(root);
    const M = new THREE.Matrix4();
    for (const [name, c] of Object.entries(this.clips)) {
      const clip = animations.find((a) => a.name === name);
      mixer.stopAllAction();
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      act.reset().play();
      for (let f = 0; f <= c.frames; f++) {
        mixer.setTime(Math.min(f / FPS, clip.duration));
        root.updateMatrixWorld(true);
        for (let b = 0; b < bones.length; b++) {
          M.multiplyMatrices(bones[b].matrixWorld, inv[b]).multiply(bind);
          const e = M.elements, o = ((c.start + f) * W + b * 3) * 4;
          data.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], o);
        }
      }
    }
    mixer.stopAllAction();
    root.updateMatrixWorld(true);
    const tex = new THREE.DataTexture(data, W, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.animTex = tex;
  }

  // the texture row of clip `name` at time t (s): looped, or held at its end
  row(name, t) {
    const c = this.clips[name];
    let f = t * FPS;
    f = c.loop ? ((f % c.frames) + c.frames) % c.frames : Math.min(Math.max(f, 0), c.frames);
    return c.start + f;
  }

  duration(name) {
    return this.clips[name].frames / FPS;
  }

  // the level an animal at distance d is drawn at (both, in a hand-over band): calls fn(li) for each
  levels(d, fn) {
    this.lodRange.forEach(([a, , , w], li) => {
      if (d >= a && (w === 0 || d < w)) fn(li);
    });
  }

  // the animals drawn at level `li`: records {x, y, z, yaw, size, coat, pitch, roll, clip, ct, prev, pt, bl}
  // (clip at time ct; while bl < 1 blending in from prev at time pt)
  draw(li, list) {
    const L = this.lods[li];
    const n = list.length;
    if (n > L.cap) this.grow(L, Math.max(n, Math.ceil(L.cap * 1.5)));
    const P = L.iPos.array, Q = L.iMisc.array, A = L.iAnim.array;
    for (let i = 0; i < n; i++) {
      const s = list[i], o = i * 4;
      P[o] = s.x; P[o + 1] = s.y; P[o + 2] = s.z; P[o + 3] = s.yaw;
      Q[o] = s.size ?? 1; Q[o + 1] = s.coat ?? 0; Q[o + 2] = s.pitch ?? 0; Q[o + 3] = s.roll ?? 0;
      const fading = s.prev && s.bl < 1;
      A[o] = this.row(fading ? s.prev : s.clip, fading ? s.pt : s.ct);
      A[o + 1] = fading ? this.row(s.clip, s.ct) : A[o];
      A[o + 2] = fading ? s.bl * s.bl * (3 - 2 * s.bl) : 0;
    }
    L.geo.instanceCount = n;
    L.iPos.needsUpdate = L.iMisc.needsUpdate = L.iAnim.needsUpdate = true;
  }
}
