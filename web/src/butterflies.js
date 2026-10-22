import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";

// A few butterflies about the flowers near the viewer: they flutter from flower to flower on
// erratic paths, land, bask with their wings opening and closing, and fly off again (or when
// the viewer comes too close). Three species of the Tianshan meadows, painted top-down
// (tools/build_butterfly_atlas.py): the Apollo (big, slow wing beats with glides), the common
// blue (small, quick) and the small tortoiseshell. Each is two wing cards hinged on the body;
// the flight is simulated on the CPU, the wing pose is set per instance.

const SPECIES = [
  // wingspan (m, a little over life size so they read), wing beats / s, cruise speed (m/s), glide share, share
  { span: 0.095, flap: 5.5, speed: 1.0, glide: 0.35, share: 0.3 },   // Apollo
  { span: 0.056, flap: 11, speed: 1.3, glide: 0.05, share: 0.4 },    // common blue
  { span: 0.075, flap: 8, speed: 1.6, glide: 0.2, share: 0.3 },      // small tortoiseshell
];
const N = 14;          // at most this many about the viewer
const RANGE = 22;      // m: left further behind than this, one comes up again in the flowers ahead

const VERT = /* glsl */ `
attribute float aWing;     // -1 left wing, +1 right wing
attribute vec4 iPos;       // x, y, z, yaw
attribute vec4 iWing;      // wing lift (rad), species, span (m), pitch (rad)
uniform float uCurvature;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vVis;
${NOISE_GLSL}
${HEIGHT_GLSL}
${SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  // local frame: x across the wings, y up, z forward (head)
  vec3 p = position * iWing.z;
  float a = iWing.x;
  float ax = abs(p.x);
  p = vec3(sign(p.x) * ax * cos(a), ax * sin(a), p.z);          // both wings rise with a
  vec3 n = vec3(-aWing * sin(a), cos(a), 0.0);
  float cp = cos(iWing.w), sp = sin(iWing.w);                     // nose up
  p = vec3(p.x, p.y * cp + p.z * sp, -p.y * sp + p.z * cp);
  n = vec3(n.x, n.y * cp + n.z * sp, -n.y * sp + n.z * cp);
  float cy = cos(iPos.w), sy = sin(iPos.w);                       // heading
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vec3 wp = iPos.xyz + p;
  vN = n;
  vWorld = wp;
  vUv = vec2((iWing.y + uv.x) / 3.0, uv.y);
  vVis = sunVisibility(iPos.xz, max(iPos.y - terrainHeight(iPos.xz), 0.0));
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
varying float vVis;
${ATMOS_GLSL}
${TOON_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.5) discard;
  vec3 albedo = tex.rgb;
  // thin wings: lit on whichever side faces the sun (the far side a little less)
  vec3 n = normalize(vN);
  float back = step(dot(n, uSunDir), 0.0);
  n = mix(n, -n, back);
  vec3 col = toonLight(albedo, n, vVis, 0.3) * mix(1.0, 0.8, back);
  // thin wings glow with the sun behind them
  vec3 v = normalize(vWorld - cameraPosition);
  col += uSunColor * albedo * pow(max(dot(v, uSunDir), 0.0), 2.0) * 0.5 * vVis;
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function wingGeometry() {
  // two quads meeting on the body line (x = 0); uv across the species' slot
  const pos = [], uv = [], wing = [], idx = [];
  for (const s of [-1, 1]) {
    const o = pos.length / 3;
    const xs = s < 0 ? [-0.5, 0] : [0, 0.5];
    for (const [x, z] of [[xs[0], -0.5], [xs[1], -0.5], [xs[1], 0.5], [xs[0], 0.5]]) {
      pos.push(x, 0, z);
      uv.push(x + 0.5, z + 0.5);
      wing.push(s);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  return g;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Butterflies {
  constructor(plants, terrain) {
    this.plants = plants;
    this.terrain = terrain;
    const g = wingGeometry();
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    this.iWing = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iWing.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.iPos);
    g.setAttribute("iWing", this.iWing);
    g.instanceCount = 0;
    this.geo = g;
    const map = new THREE.TextureLoader().load("./assets/butterflies.png");
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const uniforms = { ...atmos, ...worldUniforms, uMap: { value: map } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.flies = [];
    for (let i = 0; i < N; i++) {
      let u = Math.random(), sp = 0;
      while (sp < SPECIES.length - 1 && u > SPECIES[sp].share) { u -= SPECIES[sp].share; sp++; }
      this.flies.push({ sp, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(), state: "fly",
        timer: 0, phase: Math.random() * 6.28, yaw: 0, wing: 0.3, glide: 0, seed: Math.random() * 100, restH: 0.5 });
    }
  }

  // a flowery spot near (x, z): the best of a few random tries, or null if there are no flowers
  flowerSpot(x, z, r0, r1) {
    let best = null, bc = 0.004;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.283, r = rand(r0, r1);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.blockedAt?.(px, pz)) continue;
      const c = this.plants.coverAt(px, pz) * rand(0.6, 1.4);
      if (c > bc) { bc = c; best = [px, pz]; }
    }
    return best;
  }

  seed(f, camera) {
    // in the flowers ahead of the viewer, 11-21 m out, where they will be met (not in plain
    // sight close by: they come into the view from afar and grow in over a second, see update)
    const c = camera.position, d = new THREE.Vector3();
    camera.getWorldDirection(d);
    d.y = 0;
    d.normalize();
    const s = this.flowerSpot(c.x + d.x * 16, c.z + d.z * 16, 0.5, 5);
    if (!s) { f.active = false; return; }
    f.active = true;
    const g = this.terrain.heightAt(s[0], s[1]);
    f.pos.set(s[0], g + rand(0.4, 1.4), s[1]);
    f.vel.set(rand(-1, 1), 0, rand(-1, 1)).setLength(SPECIES[f.sp].speed);
    f.state = "fly";
    f.timer = rand(2, 6);
    f.age = 0;
    this.retarget(f);
  }

  retarget(f) {
    const s = this.flowerSpot(f.pos.x, f.pos.z, 1.5, 8) || [f.pos.x + rand(-5, 5), f.pos.z + rand(-5, 5)];
    f.target.set(s[0], 0, s[1]);
    f.restH = rand(0.3, 0.75);
  }

  update(camera, dt, t) {
    const above = camera.userData.aboveGround ?? 0;
    this.mesh.visible = above < 40;
    if (!this.mesh.visible || dt <= 0) return;
    const cam = camera.position;
    const wd = worldUniforms.uWindDir.value, ws = worldUniforms.uWindStr.value;
    let k = 0;
    for (const f of this.flies) {
      if (!f.active || Math.hypot(f.pos.x - cam.x, f.pos.z - cam.z) > RANGE) {
        if (Math.random() < dt * 1.5) this.seed(f, camera);   // stagger the arrivals
        else f.active = false;
        if (!f.active) continue;
      }
      const S = SPECIES[f.sp];
      const ground = this.terrain.heightAt(f.pos.x, f.pos.z);
      const dCam = f.pos.distanceTo(cam);
      if (f.state === "rest") {
        f.timer -= dt;
        // basking: wings held up, opened now and then
        const bask = 0.5 + 0.5 * Math.sin(t * 0.9 + f.seed);
        f.wing = 1.25 - 1.05 * Math.pow(bask, 3);
        f.vel.set(0, 0, 0);
        if (f.timer < 0 || dCam < 1.6) {   // off again (or scared up)
          f.state = "fly";
          f.timer = rand(3, 9);
          this.retarget(f);
          f.vel.set(rand(-0.5, 0.5), 1.2, rand(-0.5, 0.5));
        }
      } else {
        f.timer -= dt;
        const tx = f.target.x - f.pos.x, tz = f.target.z - f.pos.z;
        const dT = Math.hypot(tx, tz);
        // erratic: heading jitter from a few incommensurate sines, bobbing up and down
        const q = t * 1.7 + f.seed;
        const jx = Math.sin(q * 1.3) + 0.6 * Math.sin(q * 2.9 + 1.7) + 0.4 * Math.sin(q * 5.3 + 0.4);
        const jz = Math.cos(q * 1.1 + 2.2) + 0.6 * Math.sin(q * 3.1 + 0.9) + 0.4 * Math.cos(q * 4.7 + 1.3);
        const want = new THREE.Vector3(tx / (dT + 1e-3), 0, tz / (dT + 1e-3)).multiplyScalar(S.speed * Math.min(1, dT / 1.5 + 0.3));
        want.x += jx * S.speed * 0.55;
        want.z += jz * S.speed * 0.55;
        const hWant = f.timer < 0 && dT < 0.8 ? f.restH : 0.8 + 0.35 * Math.sin(q * 0.7) + 0.2 * Math.sin(q * 2.3);
        want.y = (ground + hWant - f.pos.y) * 2.2 + 0.5 * Math.sin(q * 4.1);
        f.vel.lerp(want, 1 - Math.exp(-dt * 3.5));
        if (f.timer < 0 && dT < 0.5 && Math.abs(f.pos.y - ground - f.restH) < 0.12) {
          f.state = "rest";
          f.timer = rand(2, 8);
        } else if (dT < 0.5 && f.timer >= 0) {
          this.retarget(f);
        }
        // wing beats, with glides for the Apollo
        if (f.glide > 0) { f.glide -= dt; f.wing += (0.12 - f.wing) * Math.min(1, dt * 10); }
        else {
          f.phase += dt * 6.283 * S.flap * rand(0.9, 1.1);
          f.wing = 0.35 + 0.9 * Math.sin(f.phase);
          if (Math.random() < dt * S.glide * 1.5) f.glide = rand(0.3, 0.7);
        }
      }
      // a light drift with the wind; a house or yurt is flown round (main.js blockedAt: its
      // footprint, below the eaves): turned back from its wall, a new flower picked
      const nx = f.pos.x + (f.vel.x + wd.x * ws * 0.16 * (f.state === "fly" ? 1 : 0)) * dt;
      const nz = f.pos.z + (f.vel.z + wd.y * ws * 0.16 * (f.state === "fly" ? 1 : 0)) * dt;
      if (this.blockedAt && f.pos.y - ground < 4 && this.blockedAt(nx, nz) && !this.blockedAt(f.pos.x, f.pos.z)) {
        f.vel.x *= -1; f.vel.z *= -1;
        this.retarget(f);
      } else { f.pos.x = nx; f.pos.z = nz; }
      f.pos.y += f.vel.y * dt;
      f.pos.y = Math.max(f.pos.y, ground + 0.15);
      if (f.state === "fly" && Math.hypot(f.vel.x, f.vel.z) > 0.05) {
        const yaw = Math.atan2(f.vel.x, f.vel.z);
        let dy = yaw - f.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.yaw += dy * Math.min(1, dt * 8);
      }
      const pitch = f.state === "fly" ? 0.25 + 0.15 * Math.sin(f.phase * 0.5) : 0.1;
      this.iPos.array.set([f.pos.x, f.pos.y, f.pos.z, f.yaw], k * 4);
      f.age = (f.age ?? 1) + dt;
      this.iWing.array.set([f.wing, f.sp, S.span * Math.min(1, f.age / 1.2), pitch], k * 4);   // (grows in)
      k++;
    }
    this.geo.instanceCount = k;
    this.iPos.needsUpdate = this.iWing.needsUpdate = true;
  }
}
