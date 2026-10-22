import * as THREE from "three";
import { AnimalKind } from "./animals.js";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Flocks of fat-tailed sheep, each kept by a shepherd dog or two, and small herds of cattle (Kazakh
// whiteheads, Xinjiang browns) on the open pastures round the camps. A flock drifts slowly over its pasture as it grazes; each animal mostly
// grazes with its head down, now and then lifts it to look round, walks a few steps to keep up with the
// others (head up) or to a fresh patch (nibbling as it goes), lies down a while to chew the cud, and
// trots off from a child who comes too close (getting up first if lying).
// The animals are the rigged models of tools/blender/animal.py with their clips (web/src/animals.js:
// skinned on the GPU from a texture of the clips, three levels of detail handed over pixel by pixel,
// coats repainted per animal); each plays a clip, cross-fading into the next when its state changes,
// its gaits at the rate its speed needs (no sliding feet). Hundreds cost little; they cast shadows.
// Grey marmots live in colonies on the open slopes away from the camps, round a few burrow mounds: they
// graze near home, wander between the burrows, sun themselves, and now and then sit bolt upright on
// sentry; a child within 30 m sets them all on sentry, within 12 m they dash to the nearest burrow and
// are gone, to come out again a while after the child has left.

// per species: flock spread (m per sqrt(member)), a child's distance that sends one off (m), coats by
// frequency (animals.js COATS), size range, share lying at the start, collision capsule along the heading
// (from, to, radius, top; m)
const SPEC = {
  sheep: { spread: 1.6, shy: 2.6, coats: [0, 0, 0, 1, 1, 2, 3, 4, 5], size: [0.9, 0.2], lie: 0.15, body: [-0.38, 0.42, 0.23, 0.88] },
  // a quarter of each flock this year's lambs (the lamb model's own proportions, at 0.52 m withers)
  lamb: { spread: 1.6, shy: 2.2, coats: [0, 0, 0, 1, 1, 2, 3, 4, 5], size: [0.88, 0.24], lie: 0.2, body: [-0.26, 0.3, 0.16, 0.62] },
  cattle: { spread: 3.2, shy: 3.4, coats: [0, 0, 1, 2, 3, 3, 4, 5], size: [0.92, 0.16], lie: 0.2, body: [-0.7, 0.95, 0.38, 1.45] },
  // the dogs lie about the flock's edge, move round it, sniff, look about; a child near is watched, tail going
  dog: { coats: [0, 0, 1, 2, 3, 3, 4], size: [0.92, 0.16], lie: 0.7, body: [-0.3, 0.35, 0.15, 0.75] },
  marmot: { coats: [0, 0, 0, 1, 2, 3], size: [0.88, 0.24], lie: 0.15, body: null,
    lod: [[0, 0, 18, 24], [18, 24, 60, 75], [60, 75, 600, 700]] },
};
const MARMOT = { sentry: 30, flee: 12, back: 20 };   // m: a child this near sets them on sentry / sends them in; out again beyond

// a burrow's mound of dug-out earth with the hole in it (local: y up, the hole toward +z); the rim dithers away
function moundGeometry() {
  const R = 0.6, rings = 7, segs = 18, pos = [], col = [], idx = [];
  pos.push(0, 0.08, 0); col.push(0.12);
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * R;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const n = Math.sin(a * 3 + i) * 0.012 + Math.sin(a * 7 - i * 2) * 0.008;
      let y = 0.13 * Math.pow(Math.max(0, 1 - (r / R) ** 2), 1.3) + n * (1 - r / R);
      const dh = Math.hypot(x, z - 0.12);                    // the hole, off centre toward +z
      let shade = 1;
      if (dh < 0.11) { y -= 0.12 * (1 - dh / 0.11); shade = 0.15 + 0.85 * (dh / 0.11) ** 2; }
      pos.push(x, y, z); col.push(shade * (i === rings ? 0 : 1));
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a1 + j, a1 + j1, a0 + j, a1 + j1, a0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aShade", new THREE.Float32BufferAttribute(col, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const MOUND_VERT = /* glsl */ `
attribute float aShade;
uniform float uCurvature;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
varying float vRim;
varying float vVis;
${NOISE_GLSL}
${HEIGHT_GLSL}
${SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vShade = aShade;
  vRim = length(position.xz) / 0.6;
  vVis = sunVisibility(w.xz, 0.3);
  #ifndef SHADOW_PASS
    vec2 dh = w.xz - cameraPosition.xz;
    w.y -= dot(dh, dh) * uCurvature;
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;
const MOUND_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vShade;
varying float vRim;
varying float vVis;
${ATMOS_GLSL}
${NOISE_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dz > 1.0 - smoothstep(0.7, 1.0, vRim)) discard;      // the rim thins into the turf
  #ifdef SHADOW_PASS
    gl_FragColor = vec4(shadowPassDepth(vWorld));
    return;
  #endif
  vec3 earth = mix(vec3(0.16, 0.11, 0.07), vec3(0.24, 0.17, 0.1), vnoise(vWorld.xz * 9.0));
  earth = mix(earth, vec3(0.1, 0.13, 0.05), smoothstep(0.5, 0.95, vRim) * 0.6);   // turf creeping over the edge
  vec3 n = normalize(vNormal);
  vec3 col = toonLight(earth * vShade, n, vVis * objectShadow(vWorld, n), 0.1);
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function hash(a, b, k = 0) {
  let h = Math.imul((a | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((b | 0) + k * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export class Livestock {
  // gltfs: { sheep, cattle } -- the models of tools/blender/animal.py
  constructor(gltfs, terrain, landcoverAt, dwell) {
    this.terrain = terrain;
    this.lc = landcoverAt;
    this.dwell = dwell;
    this.group = new THREE.Group();
    this.kinds = {};
    const off = typeof location !== "undefined" && new URLSearchParams(location.search).has("noanimals");   // (dev: compare without)
    for (const [name, g] of Object.entries(gltfs)) {
      const anim = new AnimalKind(g, name, SPEC[name].lod ? { lod: SPEC[name].lod } : {});
      const K = { name, S: SPEC[name], anim, animals: [], lists: [[], [], []], off };
      this.kinds[name] = K;
      if (!off) this.group.add(anim.group);
    }
    this.flocks = [];
    this.place();
    for (const K of Object.values(this.kinds)) for (const an of K.animals) this.tilt(an);
    this.frame = 0;
  }

  // open pasture: no forest, scree, water, steep ground, buildings
  good(x, z) {
    const L = this.lc(x, z);
    if (L.r > 0.12 || L.g > 0.3 || L.b > 0.1) return false;
    const T = this.terrain, e = 4;
    const s = Math.hypot(T.heightAt(x + e, z) - T.heightAt(x - e, z), T.heightAt(x, z + e) - T.heightAt(x, z - e)) / (2 * e);
    if (s > 0.32) return false;
    if (T.streamWet && T.streamWet(x, z) > 0.2) return false;
    return !this.dwell.some((d) => Math.hypot(d.x - x, d.z - z) < (d.kind === "yurt" ? 12 : 18));
  }

  place() {
    const lodge = this.dwell.find((d) => d.home) || this.dwell.find((d) => d.kind === "lodge") || this.dwell[0];
    const sites = [];
    for (let k = 0; k < 400 && sites.length < 8; k++) {
      const a = hash(k, 1, 1) * 6.283, r = 350 + hash(k, 2, 1) * 3000;
      const x = lodge.x + Math.cos(a) * r, z = lodge.z + Math.sin(a) * r;
      if (!this.good(x, z) || sites.some((s) => Math.hypot(s.x - x, s.z - z) < 550)) continue;
      sites.push({ x, z });
    }
    sites.forEach((s, i) => {
      const n = 60 + Math.floor(hash(i, 3, 2) * 150);
      this.addFlock("sheep", s.x, s.z, n, i);
    });
    // a dog or two with each flock
    if (this.kinds.dog) for (const [i, f] of this.flocks.entries()) {
      const n = 1 + (hash(i, 21, 7) < 0.45 ? 1 : 0);
      for (let j = 0; j < n; j++) this.addDog(f, i * 7 + j);
    }
    // cattle: small herds within a few hundred metres of the homes
    let made = 0;
    for (let k = 0; k < 300 && made < 7; k++) {
      const d = this.dwell[Math.floor(hash(k, 5, 3) * this.dwell.length)];
      const a = hash(k, 6, 3) * 6.283, r = 120 + hash(k, 7, 3) * 450;
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      if (!this.good(x, z) || this.flocks.some((f) => Math.hypot(f.cx - x, f.cz - z) < 200)) continue;
      this.addFlock("cattle", x, z, 4 + Math.floor(hash(k, 8, 3) * 11), 100 + k);
      made++;
    }
    if (this.kinds.marmot) this.placeMarmots(lodge);
  }

  // marmot colonies: open slopes away from the camps, flocks and herds; a few burrows each
  placeMarmots(lodge) {
    const K = this.kinds.marmot, S = K.S, T = this.terrain;
    this.burrows = [];
    let made = 0;
    for (let k = 0; k < 600 && made < 6; k++) {
      const a = hash(k, 31, 9) * 6.283, r = 400 + hash(k, 32, 9) * 2600;
      const cx = lodge.x + Math.cos(a) * r, cz = lodge.z + Math.sin(a) * r;
      if (!this.good(cx, cz) || this.dwell.some((d) => Math.hypot(d.x - cx, d.z - cz) < 200)) continue;
      if (this.flocks.some((f) => Math.hypot(f.cx - cx, f.cz - cz) < f.R + 120)) continue;
      const holes = [];
      const nb = 3 + Math.floor(hash(k, 33, 9) * 4);
      for (let j = 0; j < nb * 3 && holes.length < nb; j++) {
        const b = hash(k, 40 + j, 9) * 6.283, rr = Math.sqrt(hash(k, 60 + j, 9)) * 12;
        const x = cx + Math.cos(b) * rr, z = cz + Math.sin(b) * rr;
        if (!this.good(x, z) || holes.some((h) => Math.hypot(h.x - x, h.z - z) < 3)) continue;
        holes.push({ x, z, y: T.heightAt(x, z), yaw: hash(k, 80 + j, 9) * 6.283 });
      }
      if (holes.length < 2) continue;
      this.burrows.push(...holes);
      const n = 4 + Math.floor(hash(k, 34, 9) * 6);
      for (let i = 0; i < n; i++) {
        const home = holes[i % holes.length];
        const b = hash(k, 100 + i, 9) * 6.283, rr = 0.8 + hash(k, 120 + i, 9) * 4;
        const x = home.x + Math.cos(b) * rr, z = home.z + Math.sin(b) * rr;
        const lying = hash(k, 140 + i, 9) < S.lie;
        K.animals.push({
          x, z, y: T.heightAt(x, z), gy: T.heightAt(x, z), sink: 0, yaw: hash(k, 160 + i, 9) * 6.283, pitch: 0, tx: x, tz: z,
          home, holes, marmot: true, coat: S.coats[Math.floor(hash(k, 180 + i, 9) * S.coats.length)],
          size: S.size[0] + hash(k, 200 + i, 9) * S.size[1], state: lying ? "lie" : "graze", t: 3 + hash(k, 220 + i, 9) * 20,
          clip: lying ? "lie" : "graze", ct: hash(k, 240 + i, 9) * 6, prev: null, pt: 0, bl: 1,
        });
      }
      made++;
    }
    // the mounds
    const geo = moundGeometry();
    const uniforms = { ...atmos, ...worldUniforms, ...shadowUniforms };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: MOUND_VERT, fragmentShader: MOUND_FRAG });
    const mesh = new THREE.InstancedMesh(geo, mat, this.burrows.length);
    mesh.userData.shadowMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: MOUND_VERT, fragmentShader: MOUND_FRAG, defines: { SHADOW_PASS: 1 } });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    this.burrows.forEach((b, i) => {
      const e = 0.5;
      n.set(T.heightAt(b.x - e, b.z) - T.heightAt(b.x + e, b.z), 2 * e, T.heightAt(b.x, b.z - e) - T.heightAt(b.x, b.z + e)).normalize();
      Q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, b.yaw));
      M.compose(new THREE.Vector3(b.x, b.y - 0.02, b.z), Q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + hash(i, 1, 41) * 0.3));
      mesh.setMatrixAt(i, M);
    });
    mesh.frustumCulled = false;
    mesh.layers.enable(1);
    this.group.add(mesh);
    this.mounds = mesh;
  }

  addFlock(kind, x, z, n, seed) {
    const R = Math.sqrt(n) * this.kinds[kind].S.spread;
    const f = { kind, cx: x, cz: z, dir: hash(seed, 9, 4) * 6.283, R, members: [] };
    for (let i = 0; i < n; i++) {
      // (a sheep flock's lambs, among the ewes)
      const K = kind === "sheep" && this.kinds.lamb && hash(seed, i, 15) < 0.26 ? this.kinds.lamb : this.kinds[kind], S = K.S;
      const a = hash(seed, i, 5) * 6.283, r = Math.sqrt(hash(seed, i, 6)) * R;
      const ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
      const lying = hash(seed, i, 12) < S.lie;     // some already lying, chewing the cud
      const an = {
        x: ax, z: az, y: this.terrain.heightAt(ax, az), yaw: hash(seed, i, 8) * 6.283, pitch: 0, tx: ax, tz: az, flock: f,
        coat: S.coats[Math.floor(hash(seed, i, 7) * S.coats.length)], size: S.size[0] + hash(seed, i, 11) * S.size[1],
        state: lying ? "lie" : "graze", t: lying ? 10 + hash(seed, i, 14) * 60 : hash(seed, i, 9) * 8,
        clip: lying ? "lie" : "graze", ct: hash(seed, i, 13) * 6, prev: null, pt: 0, bl: 1,
      };
      K.animals.push(an);
      f.members.push(an);
    }
    this.flocks.push(f);
  }

  addDog(f, seed) {
    const K = this.kinds.dog, S = K.S;
    const a = hash(seed, 1, 22) * 6.283, r = f.R * (1 + hash(seed, 2, 22) * 0.3);
    const x = f.cx + Math.cos(a) * r, z = f.cz + Math.sin(a) * r;
    const lying = hash(seed, 3, 22) < S.lie;
    const an = {
      x, z, y: this.terrain.heightAt(x, z), yaw: hash(seed, 4, 22) * 6.283, pitch: 0, tx: x, tz: z, flock: f, dog: true,
      coat: S.coats[Math.floor(hash(seed, 5, 22) * S.coats.length)], size: S.size[0] + hash(seed, 6, 22) * S.size[1],
      state: lying ? "lie" : "idle", t: lying ? 20 + hash(seed, 7, 22) * 60 : 3 + hash(seed, 8, 22) * 5,
      clip: lying ? "lie" : "idle", ct: hash(seed, 9, 22) * 4, prev: null, pt: 0, bl: 1,
    };
    K.animals.push(an);
  }

  tilt(an) {
    const T = this.terrain, e = 0.6, dx = Math.sin(an.yaw), dz = Math.cos(an.yaw);
    an.y = T.heightAt(an.x, an.z);
    an.pitch = Math.atan2(T.heightAt(an.x + dx * e, an.z + dz * e) - T.heightAt(an.x - dx * e, an.z - dz * e), 2 * e);
  }

  // collision capsules of the animals near (x, z) (physics.js): the body along the heading, lower lying
  shapesNear(x, z, r, out) {
    for (const K of Object.values(this.kinds)) {
      if (!K.S.body) continue;
      const [b0, b1, rr, top] = K.S.body;
      for (const an of K.animals) {
        if (Math.abs(an.x - x) > r + 3 || Math.abs(an.z - z) > r + 3) continue;
        const fx = Math.sin(an.yaw), fz = Math.cos(an.yaw), k = an.size;
        const low = an.clip === "lie" || an.clip === "lie_down" ? 0.65 : 1;
        out.push({ k: "wall", x0: an.x + fx * b0 * k, z0: an.z + fz * b0 * k, x1: an.x + fx * b1 * k, z1: an.z + fz * b1 * k, r: rr * k,
          y0: an.y, top: an.y + top * k * low, noStand: true });
      }
    }
  }

  update(camera, dt) {
    if (dt <= 0) return;
    this.frame++;
    const c = camera.position;
    // flocks drift over their pastures, turning away from unsuitable ground
    for (const f of this.flocks) {
      f.dir += (Math.random() - 0.5) * 0.3 * dt;
      const v = (f.kind === "cattle" ? 0.05 : 0.035) * dt;
      const nx = f.cx + Math.cos(f.dir) * v, nz = f.cz + Math.sin(f.dir) * v;
      if (this.frame % 30 === 0 && !this.good(nx + Math.cos(f.dir) * f.R, nz + Math.sin(f.dir) * f.R)) f.dir += Math.PI * (0.5 + Math.random());
      else { f.cx = nx; f.cz = nz; }
    }
    for (const K of Object.values(this.kinds)) {
      if (K.off) continue;
      const A = K.anim;
      for (const l of K.lists) l.length = 0;
      K.animals.forEach((an, i) => {
        const d = Math.hypot(an.x - c.x, an.z - c.z, an.y - c.y);
        const far = d > 1200;   // far off: stepped every 12th frame
        if (!far || (this.frame + i) % 12 === 0) (an.dog ? this.stepDog : an.marmot ? this.stepMarmot : this.step).call(this, K, an, far ? dt * 12 : dt, far);
        if (an.sink > 0.45) return;   // (down its burrow)
        A.levels(d, (li) => K.lists[li].push(an));
      });
      K.lists.forEach((l, li) => A.draw(li, l));
      A.eye.value.copy(c);
    }
  }

  setClip(an, name, t0 = 0) {
    if (an.clip === name) return;
    an.prev = an.clip; an.pt = an.ct; an.clip = name; an.ct = t0; an.bl = 0;
  }

  // one animal's state, and the clip that shows it
  step(K, an, dt, far) {
    const A = K.anim, f = an.flock;
    an.t -= dt;
    let rate = 1;
    const lying = an.state === "lie";
    // a child comes too close: off at a trot, a few metres away from them (up first if lying)
    for (const W of far ? [] : this.walkers || []) {
      if (!W.present) continue;
      const wx = an.x - W.pos.x, wz = an.z - W.pos.z, wd = Math.hypot(wx, wz);
      if (wd < K.S.shy * an.size && !an.flee) {
        const go = K.S.shy * 1.8;
        an.flee = true;
        an.tx = an.x + (wx / (wd + 1e-3)) * go + (Math.random() - 0.5) * 2;
        an.tz = an.z + (wz / (wd + 1e-3)) * go + (Math.random() - 0.5) * 2;
        an.state = lying ? "rise" : "walk";
        if (lying) this.setClip(an, "get_up");
        break;
      }
    }
    if (an.state === "walk") {
      const dx = an.tx - an.x, dz = an.tz - an.z, dd = Math.hypot(dx, dz);
      const gait = an.flee ? "trot" : an.nibble ? "walk_graze" : "walk";
      this.setClip(an, gait);
      if (dd < 0.25 * an.size) {
        an.state = an.flee ? "look" : "graze"; an.t = an.flee ? 2 + Math.random() * 3 : 3 + Math.random() * 12; an.flee = false;
        this.setClip(an, an.state, an.state === "graze" ? Math.random() * 6 : 0);
      } else {
        const want = Math.atan2(dx, dz);
        const dy = Math.atan2(Math.sin(want - an.yaw), Math.cos(want - an.yaw));
        an.yaw += dy * Math.min(1, dt * 3);
        rate = Math.max(0.2, Math.cos(dy));        // slower while turning, the clip with it
        const sp = A.clips[gait].speed * an.size * rate;
        an.x += Math.sin(an.yaw) * sp * dt;
        an.z += Math.cos(an.yaw) * sp * dt;
        this.tilt(an);
      }
    } else if (an.state === "lie") {
      if (an.clip === "lie_down" && an.ct >= A.duration("lie_down")) this.setClip(an, "lie", Math.random() * 6);
      if (an.t < 0) { an.state = "rise"; this.setClip(an, "get_up"); }
    } else if (an.state === "rise") {
      if (an.ct >= A.duration("get_up")) {
        if (an.flee) an.state = "walk";
        else { an.state = "graze"; an.t = 4 + Math.random() * 10; this.setClip(an, "graze", Math.random() * 6); }
      }
    } else if (an.t < 0) {
      const off = Math.hypot(an.x - f.cx, an.z - f.cz) > f.R * 1.3;
      const u = Math.random();
      if (off || u < 0.5) {   // a few steps: back toward the flock (walking) or to a fresh patch nearby (nibbling)
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * f.R, s = an.size * K.S.spread / 1.6;
        an.tx = off ? f.cx + Math.cos(a) * r : an.x + Math.cos(a) * (1 + Math.random() * 3) * s;
        an.tz = off ? f.cz + Math.sin(a) * r : an.z + Math.sin(a) * (1 + Math.random() * 3) * s;
        an.nibble = !off;
        an.state = "walk";
      } else if (u < 0.68) { an.state = "look"; an.t = 2 + Math.random() * 4; this.setClip(an, "look"); }
      else if (u < 0.76) { an.state = "lie"; an.t = 25 + Math.random() * 80; this.setClip(an, "lie_down"); }
      else { an.state = "graze"; an.t = 4 + Math.random() * 14; this.setClip(an, "graze", Math.random() * 6); }
    }
    an.ct += dt * rate;
    an.pt += dt;
    if (an.bl < 1) an.bl = Math.min(1, an.bl + dt / 0.4);
  }

  // a shepherd dog: about the flock's edge
  stepDog(K, an, dt, far) {
    const A = K.anim, f = an.flock;
    an.t -= dt;
    let rate = 1;
    // a child near: up and watching them (turned to them, the tail going)
    let child = null;
    for (const W of far ? [] : this.walkers || []) {
      if (W.present && Math.hypot(an.x - W.pos.x, an.z - W.pos.z) < 6) { child = W; break; }
    }
    if (child && an.state !== "watch" && an.state !== "rise") {
      if (an.state === "lie") { an.state = "rise"; this.setClip(an, "get_up"); }
      else { an.state = "watch"; this.setClip(an, "look"); }
    }
    const turnTo = (x, z, k) => {
      const want = Math.atan2(x - an.x, z - an.z);
      const dy = Math.atan2(Math.sin(want - an.yaw), Math.cos(want - an.yaw));
      an.yaw += dy * Math.min(1, dt * k);
      return dy;
    };
    if (an.state === "watch") {
      if (child) { turnTo(child.pos.x, child.pos.z, 2.5); an.t = 3; }
      else if (an.t < 0) { an.state = "idle"; an.t = 2 + Math.random() * 4; this.setClip(an, "idle"); }
    } else if (an.state === "walk") {
      const gait = an.run ? "trot" : an.nibble ? "walk_graze" : "walk";
      this.setClip(an, gait);
      if (Math.hypot(an.tx - an.x, an.tz - an.z) < 0.3) {
        an.state = "idle"; an.t = 2 + Math.random() * 4; this.setClip(an, "idle");
      } else {
        const dy = turnTo(an.tx, an.tz, 3);
        rate = Math.max(0.2, Math.cos(dy));
        const sp = A.clips[gait].speed * an.size * rate;
        an.x += Math.sin(an.yaw) * sp * dt;
        an.z += Math.cos(an.yaw) * sp * dt;
        this.tilt(an);
      }
    } else if (an.state === "lie") {
      if (an.clip === "lie_down" && an.ct >= A.duration("lie_down")) this.setClip(an, "lie", Math.random() * 6);
      if (an.t < 0) { an.state = "rise"; this.setClip(an, "get_up"); }
    } else if (an.state === "rise") {
      if (an.ct >= A.duration("get_up")) { an.state = child ? "watch" : "idle"; an.t = 2 + Math.random() * 3; this.setClip(an, child ? "look" : "idle"); }
    } else if (an.t < 0) {
      const u = Math.random();
      if (u < 0.35) { an.state = "lie"; an.t = 20 + Math.random() * 70; this.setClip(an, "lie_down"); }
      else if (u < 0.65) {   // to another spot on the flock's edge (a trot if it is far)
        const a = Math.atan2(an.z - f.cz, an.x - f.cx) + (Math.random() - 0.5) * 2.2, r = f.R * (1 + Math.random() * 0.3);
        an.tx = f.cx + Math.cos(a) * r; an.tz = f.cz + Math.sin(a) * r;
        const d = Math.hypot(an.tx - an.x, an.tz - an.z);
        an.run = d > 15; an.nibble = !an.run && Math.random() < 0.4;
        an.state = "walk";
      } else if (u < 0.82) { an.state = "sniff"; an.t = 4 + Math.random() * 6; this.setClip(an, "graze", Math.random() * 6); }
      else { an.state = "look"; an.t = 3 + Math.random() * 4; this.setClip(an, "look"); }
    }
    an.ct += dt * rate;
    an.pt += dt;
    if (an.bl < 1) an.bl = Math.min(1, an.bl + dt / 0.35);
  }

  // a marmot: near its burrows
  stepMarmot(K, an, dt, far) {
    const A = K.anim;
    an.t -= dt;
    let rate = 1;
    let near = Infinity;
    for (const W of far ? [] : this.walkers || []) if (W.present) near = Math.min(near, Math.hypot(an.x - W.pos.x, an.z - W.pos.z));
    const turnTo = (x, z, k) => {
      const want = Math.atan2(x - an.x, z - an.z);
      const dy = Math.atan2(Math.sin(want - an.yaw), Math.cos(want - an.yaw));
      an.yaw += dy * Math.min(1, dt * k);
      return dy;
    };
    const nearest = () => an.holes.reduce((b, h) => (Math.hypot(h.x - an.x, h.z - an.z) < Math.hypot(b.x - an.x, b.z - an.z) ? h : b), an.holes[0]);
    // alarm: down the nearest burrow
    if (near < MARMOT.flee && an.state !== "dash" && an.state !== "hide") {
      const h = nearest();
      an.tx = h.x; an.tz = h.z; an.hole = h; an.state = "dash";
    } else if (near < MARMOT.sentry && ["graze", "walk", "look", "idle"].includes(an.state)) {
      an.state = "sentry"; an.t = 4 + Math.random() * 4; this.setClip(an, "stand_up");
    }
    if (an.state === "dash") {
      this.setClip(an, "run");
      const dx = an.tx - an.x, dz = an.tz - an.z, dd = Math.hypot(dx, dz);
      if (dd < 0.15) { an.state = "hide"; an.t = 15 + Math.random() * 20; }
      else {
        const dy = turnTo(an.tx, an.tz, 8);
        rate = Math.max(0.3, Math.cos(dy));
        const sp = Math.min(A.clips.run.speed * an.size * rate, dd / Math.max(dt, 1e-3));
        an.x += Math.sin(an.yaw) * sp * dt; an.z += Math.cos(an.yaw) * sp * dt;
        this.tilt(an); an.gy = an.y;
      }
    } else if (an.state === "hide") {
      an.sink = Math.min(0.5, an.sink + dt * 1.6);
      if (near < MARMOT.back) an.t = Math.max(an.t, 8);
      if (an.t < 0) { an.state = "emerge"; this.setClip(an, "stand", Math.random() * 4); }
    } else if (an.state === "emerge") {
      an.sink = Math.max(0, an.sink - dt * 0.8);
      if (an.sink === 0) { an.state = "sentry"; an.t = 3 + Math.random() * 5; }
    } else if (an.state === "sentry") {
      if (an.clip === "stand_up" && an.ct >= A.duration("stand_up")) this.setClip(an, "stand", Math.random() * 4);
      if (an.clip === "stand" && near < MARMOT.sentry) an.t = Math.max(an.t, 2);
      if (an.t < 0 && an.clip === "stand") this.setClip(an, "stand_down");
      if (an.clip === "stand_down" && an.ct >= A.duration("stand_down")) { an.state = "graze"; an.t = 4 + Math.random() * 10; this.setClip(an, "graze", Math.random() * 6); }
    } else if (an.state === "walk") {
      const gait = an.nibble ? "walk_graze" : "walk";
      this.setClip(an, gait);
      if (Math.hypot(an.tx - an.x, an.tz - an.z) < 0.1) { an.state = "graze"; an.t = 4 + Math.random() * 10; this.setClip(an, "graze", Math.random() * 6); }
      else {
        const dy = turnTo(an.tx, an.tz, 4);
        rate = Math.max(0.2, Math.cos(dy));
        const sp = A.clips[gait].speed * an.size * rate;
        an.x += Math.sin(an.yaw) * sp * dt; an.z += Math.cos(an.yaw) * sp * dt;
        this.tilt(an); an.gy = an.y;
      }
    } else if (an.state === "lie") {
      if (an.clip === "lie_down" && an.ct >= A.duration("lie_down")) this.setClip(an, "lie", Math.random() * 6);
      if (an.t < 0) { an.state = "rise"; this.setClip(an, "get_up"); }
    } else if (an.state === "rise") {
      if (an.ct >= A.duration("get_up")) { an.state = "graze"; an.t = 4 + Math.random() * 8; this.setClip(an, "graze", Math.random() * 6); }
    } else if (an.t < 0) {
      const u = Math.random();
      if (u < 0.35) {   // a few steps: grazing on, or over to another burrow
        const to = u < 0.1 ? an.holes[Math.floor(Math.random() * an.holes.length)] : an.home;
        const b = Math.random() * 6.283, rr = 0.6 + Math.random() * 3;
        an.tx = to.x + Math.cos(b) * rr; an.tz = to.z + Math.sin(b) * rr; an.nibble = u >= 0.1; an.state = "walk";
      } else if (u < 0.5) { an.state = "sentry"; an.t = 3 + Math.random() * 6; this.setClip(an, "stand_up"); }
      else if (u < 0.6) { an.state = "lie"; an.t = 15 + Math.random() * 40; this.setClip(an, "lie_down"); }
      else if (u < 0.7) { an.state = "look"; an.t = 2 + Math.random() * 3; this.setClip(an, "look"); }
      else { an.state = "graze"; an.t = 4 + Math.random() * 10; this.setClip(an, "graze", Math.random() * 6); }
    }
    an.y = an.gy - an.sink;
    an.ct += dt * rate;
    an.pt += dt;
    if (an.bl < 1) an.bl = Math.min(1, an.bl + dt / 0.25);
  }
}
