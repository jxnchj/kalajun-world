import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";

// Local architecture and objects: Kazakh yurts, sod-roof log cabins and the long lodge,
// boardwalks, gravel paths, rail fences and the swing. Everything is built procedurally,
// baked into world space and merged into one mesh with a shared toon material.
// Material ids (aMat): 0 plain, 1 log wall, 2 sod roof, 3 window glass, 4 planks,
// 5 light strip, 6 felt.

const M = { plain: 0, log: 1, sod: 2, glass: 3, plank: 4, light: 5, felt: 6 };

// linear-space palette
const C = {
  felt: [0.5, 0.47, 0.4],
  feltShade: [0.4, 0.37, 0.32],
  stone: [0.09, 0.085, 0.075],
  bank: [0.08, 0.15, 0.035],
  bandRed: [0.42, 0.05, 0.03],
  bandBlue: [0.04, 0.1, 0.3],
  door: [0.45, 0.1, 0.03],
  wood: [0.2, 0.11, 0.05],
  woodDark: [0.1, 0.055, 0.03],
  logWall: [0.26, 0.15, 0.07],
  weathered: [0.3, 0.26, 0.21],
  sod: [0.09, 0.16, 0.04],
  railRed: [0.33, 0.08, 0.04],
  plank: [0.34, 0.27, 0.2],
  gravel: [0.42, 0.37, 0.28],
  glass: [0.02, 0.03, 0.04],
  light: [1.0, 0.62, 0.28],
};

class Builder {
  constructor() {
    this.parts = [];
  }
  add(geo, matrix, color, mat = M.plain) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(color, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aMat", new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
    this.parts.push(g);
  }
  build() {
    return this.parts.length ? mergeGeometries(this.parts) : new THREE.BufferGeometry();
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function T(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz));
}
// base transform of a prop placed at (x, y, z) rotated by rot about +y
function place(x, y, z, rot) {
  return T(x, y, z, rot);
}

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = (seg) => new THREE.CylinderGeometry(1, 1, 1, seg, 1, false);

// ---------------------------------------------------------------- yurt
function yurt(b, base, r, deck) {
  const hw = 1.65, hr = 1.45;
  const add = (g, m, c, mat) => b.add(g, base.clone().multiply(m), c, mat);
  // wall with a slight outward lean
  add(new THREE.CylinderGeometry(r, r * 0.97, hw, 24, 1, true), T(0, hw / 2, 0), C.felt, M.felt);
  // decorative band (alternating red / blue segments)
  const seg = 24;
  for (let i = 0; i < seg; i++) {
    const g = new THREE.CylinderGeometry(r * 1.012, r * 1.012, 0.28, 1, 1, true, (i / seg) * Math.PI * 2, (Math.PI * 2) / seg);
    add(g, T(0, hw * 0.82, 0), i % 3 === 2 ? C.bandBlue : C.bandRed, M.plain);
  }
  // domed roof: two stacked frusta
  add(new THREE.CylinderGeometry(r * 0.62, r * 1.06, hr * 0.62, 24, 1, true), T(0, hw + hr * 0.31, 0), C.felt, M.felt);
  add(new THREE.CylinderGeometry(r * 0.2, r * 0.62, hr * 0.38, 24, 1, true), T(0, hw + hr * 0.62 + hr * 0.19, 0), C.felt, M.felt);
  // roof hem and crown ring
  add(new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.12, 24, 1, true), T(0, hw + 0.04, 0), C.feltShade, M.plain);
  add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.18, 12, 1, false), T(0, hw + hr + 0.05, 0), C.wood, M.plain);
  // door (faces local +z)
  add(box, T(0, 0.72, r * 0.99, 0, 0.95, 1.42, 0.12), C.door, M.plank);
  add(box, T(0, 1.48, r * 0.99, 0, 1.15, 0.1, 0.16), C.wood, M.plain);
  if (deck) {
    add(box, T(0, 0.18, r + 1.0, 0, r * 1.3, 0.3, 2.0), C.plank, M.plank);
    add(box, T(0, 0.06, r + 2.3, 0, 1.4, 0.14, 0.6), C.plank, M.plank);
    // panoramic windows of the glamping yurts in photo 8
    for (const a of [-0.55, -0.25, 0.25, 0.55]) {
      add(box, T(Math.sin(a) * r * 1.0, 1.0, Math.cos(a) * r * 1.0, a, 0.55, 0.9, 0.05), C.glass, M.glass);
    }
  }
}

// ---------------------------------------------------------------- cabin / lodge
function cabin(b, base, w, d, opts) {
  const add = (g, m, c, mat) => b.add(g, base.clone().multiply(m), c, mat);
  const hw = opts.kind === "lodge" ? 3.0 : 2.7;
  const found = opts.foundation; // extra depth below local 0 to reach the lowest ground
  const porch = opts.porch || 0;
  // stone plinth down to the lowest ground, log walls above (front = local +z)
  // turf bank the building sits on (as in photo 4)
  add(box, T(0, -found / 2 + 0.15, 0, 0, w + 0.1, found + 0.3, d + 0.1), C.bank, M.sod);
  add(box, T(0, hw / 2 + 0.15, 0, 0, w, hw - 0.3, d), C.logWall, M.log);
  // gable roof, low pitch, overhanging; extends over the porch
  const pitch = 0.28, over = 0.5;
  const depth = d + porch + over * 2;
  const zc = porch / 2;
  const half = depth / 2;
  const rise = Math.tan(pitch) * half;
  for (const side of [-1, 1]) {
    const slab = Math.hypot(half, rise);
    const m = T(0, hw + rise / 2, zc + (side * half) / 2, 0, w + over * 2, 0.22, slab, -side * pitch);
    add(box, m, C.sod, M.sod);
    // fascia board under the sod
    add(box, T(0, hw + rise / 2 - 0.16, zc + (side * half) / 2, 0, w + over * 2 + 0.02, 0.1, slab + 0.02, -side * pitch), C.woodDark, M.plain);
  }
  // gable triangles
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -half + over, 0, 0, half - over, 0, rise, 0], 3));
  tri.computeVertexNormals();
  for (const side of [-1, 1]) add(tri, T((side * w) / 2, hw, zc, 0, 1, 1, 1), C.logWall, M.log);
  // windows and door on the front facade
  const nWin = Math.max(1, Math.round(w / 4.5));
  for (let i = 0; i < nWin; i++) {
    const x = -w / 2 + (w / nWin) * (i + 0.5);
    if (i === Math.floor(nWin / 2) && opts.kind !== "lodge") {
      add(box, T(x, 1.05, d / 2 + 0.02, 0, 1.0, 2.0, 0.08), C.wood, M.plank);
    } else {
      add(box, T(x, 1.45, d / 2 + 0.02, 0, opts.kind === "lodge" ? 1.6 : 1.1, opts.kind === "lodge" ? 1.9 : 1.1, 0.06), C.glass, M.glass);
      add(box, T(x, 1.45, d / 2 + 0.01, 0, (opts.kind === "lodge" ? 1.6 : 1.1) + 0.2, (opts.kind === "lodge" ? 1.9 : 1.1) + 0.2, 0.04), C.wood, M.plain);
    }
  }
  // a window on each gable end
  for (const side of [-1, 1]) add(box, T((side * w) / 2 + side * 0.02, 1.5, 0, Math.PI / 2, 0.9, 0.9, 0.06), C.glass, M.glass);
  if (porch > 0) {
    // deck, posts, red railing, light strip along the eave
    add(box, T(0, -found / 2, d / 2 + porch / 2, 0, w + 0.4, found, porch), C.bank, M.sod);
    add(box, T(0, 0.15, d / 2 + porch / 2, 0, w + 0.4, 0.3, porch), C.plank, M.plank);
    const nPost = Math.max(2, Math.round(w / 3.2) + 1);
    for (let i = 0; i < nPost; i++) {
      const x = -w / 2 + (w / (nPost - 1)) * i;
      add(cyl(6), T(x, hw / 2 + 0.15, d / 2 + porch - 0.15, 0, 0.13, hw, 0.13), C.wood, M.plain);
      if (i < nPost - 1) {
        const xm = x + w / (nPost - 1) / 2;
        add(box, T(xm, 1.2, d / 2 + porch - 0.1, 0, w / (nPost - 1), 0.08, 0.08), C.railRed, M.plain);
        for (let k = 1; k < 6; k++) add(box, T(x + (w / (nPost - 1)) * (k / 6), 0.75, d / 2 + porch - 0.1, 0, 0.06, 0.9, 0.06), C.railRed, M.plain);
      }
    }
    add(box, T(0, hw - 0.12, d / 2 + porch + over - 0.05, 0, w + over * 2, 0.05, 0.05), C.light, opts.lights ? M.light : M.plain);
  } else if (opts.lights) {
    add(box, T(0, hw + 0.02, d / 2 + over - 0.05, 0, w + over * 2, 0.05, 0.05), C.light, M.light);
  }
}

// ---------------------------------------------------------------- strips following the ground
function strip(b, terrain, pts, width, lift, color, mat, beams) {
  // resample every ~0.8 m
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(L / 0.8));
    for (let k = 0; k < n; k++) P.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  P.push(pts.at(-1));
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i > 0) along += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const s of [-1, 1]) {
      const x = P[i][0] - tz * s * width / 2, z = P[i][1] + tx * s * width / 2;
      pos.push(x, terrain.heightAt(x, z) + lift, z);
      uv.push(along, s * 0.5 + 0.5);
    }
    if (i > 0) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add(g, new THREE.Matrix4(), color, mat);
  if (beams) {
    // support posts under the boardwalk every ~3 m
    for (let i = 0; i < P.length; i += 4) {
      const [x, z] = P[i];
      const y = terrain.heightAt(x, z);
      b.add(box, T(x, y + lift / 2 - 0.1, z, 0, 0.12, lift + 0.2, 0.12), C.woodDark, M.plain);
    }
  }
}

function fence(b, terrain, pts, rnd) {
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / 2.6));
    for (let k = 0; k < n; k++) P.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  P.push(pts.at(-1));
  const tops = P.map(([x, z]) => {
    const y = terrain.heightAt(x, z);
    const lean = (rnd() - 0.5) * 0.12;
    b.add(cyl(5), T(x, y + 0.6, z, 0, 0.06, 1.25, 0.06, lean, (rnd() - 0.5) * 0.12), C.weathered, M.plain);
    return [x, y, z];
  });
  for (let i = 0; i < tops.length - 1; i++) {
    const [x0, y0, z0] = tops[i], [x1, y1, z1] = tops[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const slope = Math.atan2(y1 - y0, L);
    for (const h of [0.45, 0.85, 1.12]) {
      b.add(cyl(5), T((x0 + x1) / 2, (y0 + y1) / 2 + h + (rnd() - 0.5) * 0.06, (z0 + z1) / 2, ang, 0.035, L + 0.3, 0.035, 0, Math.PI / 2 + slope), C.weathered, M.plain);
    }
  }
}

function swing(b, base) {
  const add = (g, m, c, mat) => b.add(g, base.clone().multiply(m), c, mat);
  for (const s of [-1, 1]) add(cyl(7), T(s * 1.6, 1.8, 0, 0, 0.13, 3.6, 0.13), C.plank, M.plain);
  add(cyl(7), T(0, 3.55, 0, 0, 0.13, 3.9, 0.13, 0, Math.PI / 2), C.plank, M.plain);
  for (const s of [-1, 1]) add(box, T(s * 0.3, 2.45, 0, 0, 0.03, 2.2, 0.03), C.woodDark, M.plain);
  add(box, T(0, 1.35, 0, 0, 0.75, 0.06, 0.28), C.wood, M.plank);
}

// ---------------------------------------------------------------- material
const VERT = /* glsl */ `
attribute vec3 color;
attribute float aMat;
uniform float uCurvature;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vMat;
varying float vVis;
${NOISE_GLSL}
${HEIGHT_GLSL}
${SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vUv = uv;
  vMat = aMat;
  vVis = sunVisibility(wp.xz, max(wp.y - terrainHeight(wp.xz), 0.0));
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uNight;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vMat;
varying float vVis;
${ATMOS_GLSL}
${NOISE_GLSL}
${TOON_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = vColor;
  float m = floor(vMat + 0.5);
  vec3 emit = vec3(0.0);
  if (m == 1.0) {            // log courses
    float c = fract(vWorld.y / 0.3);
    albedo *= mix(0.62, 1.05, smoothstep(0.0, 0.18, c) * smoothstep(1.0, 0.8, c)) * mix(0.9, 1.1, vnoise(vWorld.xz * 2.0 + vWorld.y));
  } else if (m == 2.0) {     // sod roof with grass tufts
    albedo *= mix(0.7, 1.35, vnoise(vWorld.xz * 1.7)) * mix(0.85, 1.1, vnoise(vWorld.xz * 9.0));
  } else if (m == 3.0) {     // glass: dark by day, warm light at night
    albedo = vec3(0.03, 0.035, 0.045);
    emit = vec3(1.0, 0.62, 0.28) * 2.6 * uNight;
  } else if (m == 4.0) {     // planks
    float c = fract(vUv.x / 0.22 + vWorld.y * 0.0);
    albedo *= mix(0.72, 1.05, smoothstep(0.0, 0.12, c)) * mix(0.88, 1.08, vnoise(vec2(floor(vUv.x / 0.22), 0.0) * 3.1));
  } else if (m == 5.0) {     // eave light strip
    emit = vec3(1.0, 0.6, 0.25) * 4.0 * uNight;
  } else if (m == 6.0) {     // felt: soft mottling
    albedo *= mix(0.94, 1.04, vnoise(vWorld.xz * 3.0 + vWorld.y * 2.0));
  }
  vec3 col = toonLight(albedo, n, vVis, 0.1);
  col += emit;
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const propUniforms = { uNight: { value: 0 } };

export function propMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...atmos, ...worldUniforms, ...propUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// walkable floors (porches/decks) so cameras can stand on them: {x, z, rot, w, d0, d1, y}
export const floors = [];
export function floorAt(x, z) {
  let y = -Infinity;
  for (const f of floors) {
    const dx = x - f.x, dz = z - f.z;
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // world -> local (inverse of rotation about +y)
    if (Math.abs(lx) <= f.w / 2 && lz >= f.d0 && lz <= f.d1) y = Math.max(y, f.y);
  }
  return y;
}

export function buildProps(objects, terrain) {
  const b = new Builder();
  const rnd = mulberry32(7);
  const ground = (x, z, r) => {
    // lowest ground under a footprint, so buildings on slopes get a foundation
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const h = terrain.heightAt(x + dx, z + dz);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return { lo, hi };
  };
  for (const y of objects.yurts) {
    const g = ground(y.x, y.z, y.r * 0.7);
    // door faces downhill
    const e = 4;
    const gx = terrain.heightAt(y.x + e, y.z) - terrain.heightAt(y.x - e, y.z);
    const gz = terrain.heightAt(y.x, y.z + e) - terrain.heightAt(y.x, y.z - e);
    const rot = Math.atan2(-gx, -gz) + (rnd() - 0.5) * 0.6;
    // on slopes the yurt stands on a wooden platform level with the uphill ground
    const lift = g.hi - g.lo > 0.15 ? 0.25 : 0.05;
    const base = place(y.x, g.hi + lift, y.z, rot);
    yurt(b, base, y.r, !!y.deck);
    if (lift > 0.05) b.add(new THREE.CylinderGeometry(y.r * 1.14, y.r * 1.14, g.hi - g.lo + lift, 20, 1, false), base.clone().multiply(T(0, -(g.hi - g.lo + lift) / 2, 0)), C.wood, M.plank);
  }
  for (const c of objects.cabins) {
    const g = ground(c.x, c.z, Math.max(c.w, c.d) * 0.5);
    const floorY = g.lo + (g.hi - g.lo) * 0.55;
    const base = place(c.x, floorY, c.z, c.rot);
    cabin(b, base, c.w, c.d, { kind: c.kind, porch: c.porch, lights: c.lights, foundation: floorY - g.lo + 0.3 });
    if (c.porch) floors.push({ x: c.x, z: c.z, rot: c.rot, w: c.w + 0.4, d0: c.d / 2, d1: c.d / 2 + c.porch, y: floorY + 0.3 });
  }
  for (const w of objects.boardwalks) strip(b, terrain, w.pts, w.width, 0.3, C.plank, M.plank, true);
  for (const p of objects.paths) strip(b, terrain, p.pts, p.width, 0.06, C.gravel, M.plain, false);
  for (const f of objects.fences) fence(b, terrain, f.pts, rnd);
  for (const s of objects.swings) swing(b, place(s.x, terrain.heightAt(s.x, s.z), s.z, s.rot));
  const mesh = new THREE.Mesh(b.build(), propMaterial());
  mesh.frustumCulled = false;
  return mesh;
}

// Canvas mask around the lodge: R = no grass/flowers (buildings, boardwalks, paths),
// G = trampled ground (tints the terrain). 1 px = 1 m.
export function buildPropMask(objects, centre, size = 2048) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const X = (x) => x - centre.x + size / 2, Z = (z) => z - centre.z + size / 2;
  g.globalCompositeOperation = "lighter";
  g.lineCap = g.lineJoin = "round";
  for (const y of objects.yurts) {
    g.fillStyle = "rgb(255,0,0)";
    g.beginPath(); g.arc(X(y.x), Z(y.z), y.r + 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgb(0,110,0)";
    g.beginPath(); g.arc(X(y.x), Z(y.z), y.r + 2.5, 0, Math.PI * 2); g.fill();
  }
  for (const c of objects.cabins) {
    g.save();
    g.translate(X(c.x), Z(c.z));
    g.rotate(-c.rot);
    g.fillStyle = "rgb(255,0,0)";
    g.fillRect(-c.w / 2 - 0.5, -c.d / 2 - 0.5, c.w + 1, c.d + (c.porch || 0) + 1);
    g.fillStyle = "rgb(0,90,0)";
    g.fillRect(-c.w / 2 - 2, -c.d / 2 - 2, c.w + 4, c.d + (c.porch || 0) + 4);
    g.restore();
  }
  for (const c of objects.guesthouses || []) {   // (their level pads, decks in them, and decks reaching out over a bank)
    if (!c.pad) continue;
    g.save();
    g.translate(X(c.x), Z(c.z));
    g.rotate(-c.rot);
    for (const [cx, cz, hx, hz] of [c.pad, ...(c.masks || [])]) {
      g.fillStyle = "rgb(255,0,0)";
      g.fillRect(cx - hx, cz - hz, 2 * hx, 2 * hz);   // (flowers grow up to the decks' edge)
      g.fillStyle = "rgb(0,60,0)";
      g.fillRect(cx - hx - 0.8, cz - hz - 0.8, 2 * hx + 1.6, 2 * hz + 1.6);
    }
    g.restore();
  }
  for (const b of objects.barns || []) {
    g.save();
    g.translate(X(b.x), Z(b.z));
    g.rotate(-b.rot);
    g.fillStyle = "rgb(255,0,0)";
    g.fillRect(-b.w / 2 - 0.6, -3.8, b.w + 1.2, 7.4);
    g.fillStyle = "rgb(0,120,0)";                 // sheep trample the ground in front
    g.fillRect(-b.w / 2 - 3, -9, b.w + 6, 12);
    g.restore();
  }
  for (const h of objects.hay || []) {
    g.save();
    g.translate(X(h.x), Z(h.z));
    g.rotate(-h.rot);
    g.fillStyle = "rgb(255,0,0)";
    g.beginPath();
    g.ellipse(0, 0, (h.type === "loaf" ? 3.4 : 1.7) * h.s, 1.5 * h.s, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const pl = (pts, width, color) => {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke();
  };
  for (const w of objects.boardwalks) { pl(w.pts, w.width + 0.6, "rgb(255,0,0)"); pl(w.pts, w.width + 3, "rgb(0,70,0)"); }
  for (const p of objects.paths) { pl(p.pts, p.width + 0.4, "rgb(255,0,0)"); pl(p.pts, p.width + 2.5, "rgb(0,120,0)"); }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
