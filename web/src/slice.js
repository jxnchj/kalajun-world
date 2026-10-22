import * as THREE from "three";
import { loadAsset, stylise, setLod, setSway, setIndoor } from "./assets.js";
import { Smoke, chimneyTop } from "./smoke.js";
import { Livestock } from "./livestock.js";
import { AnimalKind } from "./animals.js";
import { Raptors } from "./raptors.js";
import { Fairies } from "./fairies.js";
import { Collision, ShapeGrid, gridShape } from "./physics.js";
import { buildGrid } from "./buildgrid.js";
import { PAD_STEP } from "./glsl.js";

// The polished vertical slice: Blender-built buildings, yurts, fences, boardwalks, rocks,
// animated horses and near-range spruces, placed from objects.json (photo-derived + OSM)
// and the real forest map. Everything casts object shadows (layer 1).

const A = (n) => `./assets/${n}.glb`;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

function hash(x, z, k = 0) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + k * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

// Build instanced copies of every mesh in a GLB (geometry baked to the GLB root frame). The
// instances are binned in TILE-metre squares, one InstancedMesh per part and square, all a part's
// squares sharing its material: each has its own bounds, so the view and the shadow cascades skip
// the squares they don't see (one mesh spread over the valley is never culled -- every house was
// drawn at full detail into every shadow cascade). tile 0: one mesh per part, instance i at i.
const TILE = 256;
function instanced(gltf, matrices, { castShadow = true, tile = TILE } = {}) {
  const bins = new Map();
  for (const m of matrices) {
    const key = tile ? `${Math.floor(m.elements[12] / tile)},${Math.floor(m.elements[14] / tile)}` : "";
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(m);
  }
  if (!bins.size) bins.set("", []);
  const group = new THREE.Group(), lead = new THREE.Group(), rest = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.computeBoundingSphere();
    let first = null;
    for (const list of bins.values()) {
      const im = new THREE.InstancedMesh(geo, o.material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = o.material.name;
      if (first) rest.push([im, first]);
      else lead.add((first = im));
    }
  });
  stylise(lead, { castShadow });
  group.add(...lead.children);
  for (const [im, first] of rest) {
    im.material = first.material;
    Object.assign(im.userData, { shadowMaterial: first.userData.shadowMaterial, castShadow: first.userData.castShadow });
    im.frustumCulled = first.frustumCulled;
    im.layers.mask = first.layers.mask;
    group.add(im);
  }
  return group;
}

const mat = (x, y, z, ry = 0, s = 1, sy = s, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(s, sy, s));

function footprint(terrain, x, z, r) {
  let lo = Infinity, hi = -Infinity;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
    const h = terrain.heightAt(x + dx, z + dz);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi };
}

// walkable floors (porches/decks) so cameras can stand on them
export const floors = [];
export function floorAt(x, z) {
  let y = -Infinity;
  for (const f of floors) {
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= f.w / 2 && lz >= f.d0 && lz <= f.d1) y = Math.max(y, f.y);
  }
  return y;
}

// ------------------------------------------------------------------ polylines
function resample(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  out.push(pts.at(-1));
  return out;
}

// gates: points (a shed's open front, a house door) whose nearest span of a fence within 7 m is
// left open -- the pens and yards are entered through a gap between two posts
function fenceMatrices(terrain, lines, gates = []) {
  const posts = [], rails = [], spans = [];
  for (const line of lines) {
    const P = resample(line.pts, 2.9);
    const tops = P.map(([x, z], i) => {
      const y = terrain.heightAt(x, z);
      posts.push(mat(x, y, z, hash(x, z) * 6.28, 1, 0.9 + 0.2 * hash(z, x), (hash(x, z, 1) - 0.5) * 0.08, (hash(x, z, 2) - 0.5) * 0.08));
      return [x, y, z];
    });
    const open = new Set();
    for (const [gx, gz] of gates) {
      let best = -1, bd = 7;
      for (let i = 0; i < tops.length - 1; i++) {
        const d = Math.hypot((tops[i][0] + tops[i + 1][0]) / 2 - gx, (tops[i][2] + tops[i + 1][2]) / 2 - gz);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) open.add(best);
    }
    for (let i = 0; i < tops.length - 1; i++) {
      if (open.has(i)) continue;
      const [x0, y0, z0] = tops[i], [x1, y1, z1] = tops[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      const slope = Math.atan2(y1 - y0, L);
      spans.push([x0, y0, z0, x1, y1, z1, yaw, slope]);
      for (const h of [0.55, 1.02]) {
        const m = new THREE.Matrix4().compose(
          _p.set((x0 + x1) / 2, (y0 + y1) / 2 + h + (hash(x0, h * 10) - 0.5) * 0.06, (z0 + z1) / 2),
          _q.setFromEuler(_e.set(0, yaw, slope + (hash(z0, h * 10) - 0.5) * 0.05, "YXZ")),
          _s.set(L / 3.1 + 0.04, 1, 1)
        );
        rails.push(m);
      }
    }
  }
  return { posts, rails, spans };
}

// ------------------------------------------------------------------ household things
// Round each dwelling what its people use, where they would leave it (tools/blender/household.py):
// firewood stacked against a side wall of a house with the chopping block nearby, milk flasks and
// a pail by the door, a cart behind; an open-air hearth with a kettle a few steps from a yurt's
// door; felt rugs airing over the fences near the homes; and by the larger yurt camps a foal line
// with the foals tied along it (the mares are milked for kumis in summer).
function householdMatrices(terrain, dwell, spans) {
  const L = { woodpile: [], block: [], can_a: [], can_b: [], bucket: [], hearth: [], cart: [], rug: [], tether: [] };
  const foals = [];
  // nothing inside another building (rectangles of the houses, circles of the yurts)
  const R = { woodpile: 0.9, block: 0.5, can_a: 0.25, can_b: 0.25, bucket: 0.25, hearth: 0.9, cart: 2.4 };
  const inside = (x, z, r, self) => dwell.some((d) => {
    if (d === self) return false;
    if (d.kind === "yurt") return Math.hypot(x - d.x, z - d.z) < d.r + r;
    const dx = x - d.x, dz = z - d.z, c = Math.cos(d.rot), s = Math.sin(d.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < d.w / 2 + r && Math.abs(lz) < d.d / 2 + r;
  });
  let owner = null;
  const put = (name, x, z, rot, s = 1, dy = 0) => {
    if (inside(x, z, R[name] || 0.3, owner)) return;
    if (terrain.trailDist && terrain.trailDist(x, z) < (R[name] || 0.3) + 0.5) return;
    L[name].push(mat(x, terrain.heightAt(x, z) + dy, z, rot, s));
  };
  const COATS = ["bay", "chestnut", "black", "bay", "white", "chestnut"];
  for (const d of dwell) {
    owner = d;
    const h = (k) => hash(Math.round(d.x * 7), Math.round(d.z * 7), k);
    const fx = Math.sin(d.rot), fz = Math.cos(d.rot);     // the front (door) direction
    const sx = Math.cos(d.rot), sz = -Math.sin(d.rot);    // the local +x side
    if (d.kind === "yurt") {
      if (d.gh) continue;   // (a guesthouse's yurt: let to visitors, no hearth or milk cans)
      const R = d.r;
      if (h(1) < 0.35) {   // open-air hearth off to one side of the door
        const side = h(2) < 0.5 ? -1 : 1;
        put("hearth", d.x + fx * (R + 3.5) + sx * side * 2.5, d.z + fz * (R + 3.5) + sz * side * 2.5, h(3) * 6.28);
      }
      if (h(4) < 0.3) put(h(5) < 0.5 ? "can_a" : "can_b", d.x + fx * (R + 0.45) + sx * 0.95, d.z + fz * (R + 0.45) + sz * 0.95, h(6) * 6.28);
      if (h(7) < 0.25) put("bucket", d.x + fx * (R + 0.5) - sx * 1.0, d.z + fz * (R + 0.5) - sz * 1.0, h(8) * 6.28);
      if (h(9) < 0.2) { const a = d.rot + Math.PI + (h(10) - 0.5) * 1.5; put("block", d.x + Math.sin(a) * (R + 2.2), d.z + Math.cos(a) * (R + 2.2), h(11) * 6.28); }
      continue;
    }
    if (d.kind === "lodge" || d.kind === "guesthouse") continue;   // (no firewood or milk cans at the lodges and guesthouses)
    const w = d.w - 0.9, dp = d.d - 0.9;          // walls, inside the eaves
    if (h(1) < 0.65) {   // firewood against a side wall, its back to the wall
      const side = h(2) < 0.5 ? -1 : 1;
      const along = (h(3) - 0.5) * Math.max(dp - 2.6, 0);
      const x = d.x + sx * side * (w / 2 + 0.62) + fx * along, z = d.z + sz * side * (w / 2 + 0.62) + fz * along;
      put("woodpile", x, z, d.rot + side * Math.PI / 2, 1, -0.05);
      if (h(4) < 0.6) put("block", x + sx * side * 1.7 + fx * 0.8, z + sz * side * 1.7 + fz * 0.8, h(5) * 6.28);
    }
    const door = dp / 2 + 0.6;
    if (h(6) < 0.4) {
      put("can_a", d.x + fx * door + sx * w * 0.3, d.z + fz * door + sz * w * 0.3, h(7) * 6.28);
      if (h(8) < 0.5) put("can_b", d.x + fx * door + sx * (w * 0.3 + 0.45), d.z + fz * door + sz * (w * 0.3 + 0.45), h(9) * 6.28);
    }
    if (h(10) < 0.35) put("bucket", d.x + fx * door - sx * w * 0.28, d.z + fz * door - sz * w * 0.28, h(11) * 6.28);
    if (h(12) < 0.18) { const a = d.rot + Math.PI + (h(13) - 0.5) * 1.2, r = dp / 2 + 3 + h(14) * 3; put("cart", d.x + Math.sin(a) * r, d.z + Math.cos(a) * r, h(15) * 6.28, 1, -0.02); }
  }
  // rugs airing over the fence spans near the homes
  for (const [x0, y0, z0, x1, y1, z1, yaw, slope] of spans) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (hash(Math.round(mx * 3), Math.round(mz * 3), 71) > 0.035) continue;   // a few, here and there
    if (!dwell.some((d) => Math.hypot(d.x - mx, d.z - mz) < 35)) continue;
    L.rug.push(new THREE.Matrix4().compose(_p.set(mx, (y0 + y1) / 2 + 1.02 - 1.1 + 0.05, mz), _q.setFromEuler(_e.set(0, yaw, slope, "YXZ")), _s.set(1, 1, 1)));
  }
  // foal lines by the larger yurt camps
  const yurts = dwell.filter((d) => d.kind === "yurt");
  for (const y of yurts) {
    const near = yurts.filter((q) => Math.hypot(q.x - y.x, q.z - y.z) < 70).length;
    if (near < 5 || hash(Math.round(y.x), Math.round(y.z), 81) > 0.2) continue;
    // 25-35 m behind the yurt, along the contour
    const back = y.rot + Math.PI + (hash(Math.round(y.x), Math.round(y.z), 82) - 0.5);
    const cx = y.x + Math.sin(back) * 30, cz = y.z + Math.cos(back) * 30;
    if (inside(cx, cz, 8, null) || (terrain.trailDist && terrain.trailDist(cx, cz) < 9)) continue;
    const e = 4, gx = terrain.heightAt(cx + e, cz) - terrain.heightAt(cx - e, cz), gz = terrain.heightAt(cx, cz + e) - terrain.heightAt(cx, cz - e);
    const ax = Math.atan2(gx, -gz);                     // contour direction (perpendicular to the fall line)
    const dx = Math.cos(ax), dz = Math.sin(ax);
    const x0 = cx - dx * 7, z0 = cz - dz * 7;
    L.tether.push(mat(x0, terrain.heightAt(x0, z0), z0, Math.atan2(-dz, dx)));
    const n = 4 + Math.floor(hash(Math.round(cx), Math.round(cz), 83) * 4);
    for (let k = 0; k < n; k++) {
      const t = 1.5 + k * (11 / n) + hash(k, Math.round(cx), 84) * 0.8;
      const side = k % 2 ? 1 : -1;
      const px = x0 + dx * t + -dz * side * 1.0, pz = z0 + dz * t + dx * side * 1.0;
      // each foal faces away from the rope it is tied to, a little turned
      const rot = Math.atan2(-dz * side, dx * side) + (hash(k, Math.round(cz), 85) - 0.5) * 0.9;
      foals.push({ x: px, z: pz, rot, coat: COATS[(((k + Math.round(cx)) % COATS.length) + COATS.length) % COATS.length], scale: 0.92 + 0.14 * hash(k, 3, 86), foal: true });
    }
  }
  return { lists: L, foals };
}

function placeEggs(terrain, lc, dwell) {
  const out = { keep: [] };
  const lodge = dwell.find((d) => d.home) || dwell.find((d) => d.kind === "lodge") || dwell[0];   // (岚川's lodge, where the photos were taken)
  const lines = terrain.trailLines || [];
  let best = null;
  lines.forEach((L, li) => L.forEach(([x, z], i) => {
    if (i < 5 || i > L.length - 6 || i % 3) return;
    const d = Math.hypot(x - lodge.x, z - lodge.z);
    if (d < 1200 || d > 3500 || lc(x, z).r < 0.6) return;
    let wet = 0;
    for (let a = 0; a < 8; a++) wet = Math.max(wet, terrain.streamWet ? terrain.streamWet(x + Math.cos(a) * 18, z + Math.sin(a) * 18) : 0);
    if (wet < 0.5) return;
    const score = Math.abs(d - 2200) / 1000 - wet;
    if (!best || score < best.score) best = { score, li, i, x, z };
  }));
  if (best) {
    const L = lines[best.li], a = L[best.i - 1], c = L[best.i + 1];
    const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;                       // off to one side of the trail
    const x = best.x + nx * 4.5, z = best.z + nz * 4.5;
    const yaw = Math.atan2(-nx, -nz);                       // its carved face (+z) toward the trail
    out.monolith = mat(x, terrain.heightAt(x, z) - 0.15, z, yaw);
    out.keep.push({ x, z, r: 6 });
    out.monolithPos = [x, terrain.heightAt(x, z), z];
  }
  // Korok: a meadow spot near the forest edge, 350-900 m from the lodge
  for (let k = 0; k < 400; k++) {
    const a = hash(k, 3, 91) * 6.283, r = 350 + hash(k, 4, 91) * 550;
    const x = lodge.x + Math.cos(a) * r, z = lodge.z + Math.sin(a) * r;
    const f = lc(x, z).r;
    if (f > 0.05) continue;
    let edge = false;
    for (let b = 0; b < 8 && !edge; b++) edge = lc(x + Math.cos(b) * 25, z + Math.sin(b) * 25).r > 0.5;
    if (!edge || dwell.some((d) => Math.hypot(d.x - x, d.z - z) < 40)) continue;
    const toLodge = Math.atan2(lodge.x - x, lodge.z - z);
    out.korokRock = mat(x, terrain.heightAt(x, z) - 0.3, z, hash(k, 5, 91) * 6.28, 1.7);
    // peeking out at the rock's side, turned toward the lodge
    const kx = x + Math.sin(toLodge + 1.2) * 0.85, kz = z + Math.cos(toLodge + 1.2) * 0.85;
    out.korok = mat(kx, terrain.heightAt(kx, kz), kz, toLodge);
    out.korokPos = [kx, terrain.heightAt(kx, kz), kz];
    out.keep.push({ x, z, r: 3 });
    break;
  }
  return out;
}

// a boardwalk built as a stair (`stairs`, 岚川's up the slope between its two houses): level treads,
// a riser of STAIR_RISE at each step, climbing steadily from its low end -- over the ground smoothed a
// little, never below it (the treads long where the slope eases, short where it steepens)
const STAIR_RISE = 0.16;
function stairLevels(terrain, P) {
  const g = P.map(([x, z]) => terrain.heightAt(x, z));
  const n = g.length, sm = g.map((_, i) => {
    let a = 0, k = 0;
    for (let j = Math.max(0, i - 7); j <= Math.min(n - 1, i + 7); j++) { a += g[j]; k++; }
    return Math.max(g[i], a / k);
  });
  const up = g[n - 1] >= g[0];
  const e = sm.slice();
  if (up) for (let i = 1; i < n; i++) e[i] = Math.max(e[i], e[i - 1]);
  else for (let i = n - 2; i >= 0; i--) e[i] = Math.max(e[i], e[i + 1]);
  const lo = up ? e[0] : e[n - 1];
  const q = e.map((v) => lo + Math.ceil((v - lo) / STAIR_RISE - 1e-4) * STAIR_RISE);
  return { e, q };
}

function boardwalkMatrices(terrain, walks) {
  const boards = [], stringers = [];
  for (const w of walks) {
    if (w.stairs) {
      const P = resample(w.pts, 0.19);
      const { e, q } = stairLevels(terrain, P);
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const dir = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        const [x, z] = P[i];
        boards.push(mat(x, q[i] + 0.04, z, dir + Math.PI / 2).multiply(new THREE.Matrix4().makeScale(w.width / 1.5, 1, 1)));
        if (i === 0) continue;
        // a riser board for each step between this tread and the last, at the edge between them
        const [x0, z0] = P[i - 1], lo = Math.min(q[i], q[i - 1]), hi = Math.max(q[i], q[i - 1]);
        const xm = (x + x0) / 2, zm = (z + z0) / 2;
        for (let lev = lo + STAIR_RISE; lev <= hi + 1e-4; lev += STAIR_RISE)
          boards.push(mat(xm, lev - STAIR_RISE / 2 + 0.015, zm, dir + Math.PI / 2, 1, 1, Math.PI / 2).multiply(new THREE.Matrix4().makeScale(w.width / 1.5, 1, 1)));
      }
      // the two stringers under the treads, along the climb
      for (let i = 0; i + 14 < P.length; i += 14) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 14];
        const yaw = Math.atan2(x1 - x0, z1 - z0), L = Math.hypot(x1 - x0, z1 - z0);
        const pitch = Math.atan2(e[i + 14] - e[i], L);
        for (const off of [-0.45, 0.45]) {
          const ox = Math.cos(yaw) * off * w.width / 1.5, oz = -Math.sin(yaw) * off * w.width / 1.5;
          stringers.push(mat((x0 + x1) / 2 + ox, (e[i] + e[i + 14]) / 2 + 0.02, (z0 + z1) / 2 + oz, yaw, 1, 1, -pitch));
        }
      }
      continue;
    }
    const P = resample(w.pts, 0.21);
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const dir = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const [x, z] = P[i];
      const y = terrain.heightAt(x, z) + 0.28;
      boards.push(mat(x, y + (hash(x * 10, z * 10) - 0.5) * 0.015, z, dir + Math.PI / 2 + (hash(z * 10, x * 10) - 0.5) * 0.04, 1, 1, 0, 0).multiply(new THREE.Matrix4().makeScale(w.width / 1.5, 1, 1)));
    }
    const S = resample(w.pts, 2.8);
    for (let i = 0; i < S.length - 1; i++) {
      const [x0, z0] = S[i], [x1, z1] = S[i + 1];
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      for (const off of [-0.45, 0.45]) {
        const ox = Math.cos(yaw) * off * w.width / 1.5, oz = -Math.sin(yaw) * off * w.width / 1.5;
        const xm = (x0 + x1) / 2 + ox, zm = (z0 + z1) / 2 + oz;
        stringers.push(mat(xm, terrain.heightAt(xm, zm) + 0.28, zm, yaw, 1, 1));
      }
    }
  }
  return { boards, stringers };
}

// rope railing on both sides of the boardwalks + lantern posts every ~11 m (right side)
function railingMatrices(terrain, walks, skipNear) {
  const posts = [], ropes = [], lanterns = [], spans = [];
  for (const w of walks) {
    if (w.rail === false) continue;   // (a plain boardwalk: 岚川's)
    const P = resample(w.pts, 2.4);
    for (const side of [-1, 1]) {
      const tops = [];
      P.forEach(([x, z], i) => {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const off = w.width / 2 + 0.22;
        const px = x - (dz / L) * off * side, pz = z + (dx / L) * off * side;
        if (skipNear && Math.hypot(px - skipNear.x, pz - skipNear.z) < 4) { tops.push(null); return; }
        const y = terrain.heightAt(px, pz);
        posts.push(mat(px, y, pz, hash(px, pz) * 6.28, 1, 0.95 + 0.1 * hash(pz, px)));
        tops.push([px, y + 0.98, pz]);
        // lantern arm (local +x) reaches back over the boardwalk
        if (side > 0 && i % 5 === 2) lanterns.push(mat(px - (dz / L) * 0.25, y, pz + (dx / L) * 0.25, Math.atan2(dx, dz), 1));
      });
      for (let i = 0; i < tops.length - 1; i++) {
        const A = tops[i], B = tops[i + 1];
        if (!A || !B) continue;
        const L = Math.hypot(B[0] - A[0], B[2] - A[2]);
        const yaw = Math.atan2(-(B[2] - A[2]), B[0] - A[0]);
        const pitch = Math.atan2(B[1] - A[1], L);
        ropes.push(new THREE.Matrix4().compose(_p.set(...A), _q.setFromEuler(_e.set(0, yaw, pitch, "YXZ")), _s.set(Math.hypot(L, B[1] - A[1]), 1, 1)));
        spans.push([...A, ...B]);
      }
    }
  }
  return { posts, ropes, lanterns, spans };
}

// ------------------------------------------------------------------ rocks
function rockMatrices(terrain, landcoverAt, maskAt, centre, radius, types) {
  const out = Array.from({ length: types }, () => []);
  const cell = 4.5;
  const n = Math.ceil(radius / cell);
  const cx = Math.floor(centre.x / cell), cz = Math.floor(centre.z / cell);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const gx = cx + i, gz = cz + j;
      const x = (gx + hash(gx, gz, 1)) * cell, z = (gz + hash(gx, gz, 2)) * cell;
      if (Math.hypot(x - centre.x, z - centre.z) > radius) continue;
      // clustered fields of boulders: low-frequency field x per-cell chance
      const field = 0.5 + 0.5 * Math.sin(x * 0.021 + Math.sin(z * 0.013) * 3) * Math.sin(z * 0.017 + Math.cos(x * 0.011) * 2);
      const e = 3;
      const slope = Math.hypot(terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z), terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
      const p = 0.008 + 0.07 * Math.max(0, field - 0.62) * 3 + 0.06 * Math.min(1, Math.max(0, slope - 0.25) * 3);
      if (hash(gx, gz, 3) > p) continue;
      const lc = landcoverAt(x, z);
      if (lc.r > 0.45 || maskAt(x, z) > 0.1) continue;
      const big = hash(gx, gz, 4);
      const s = big > 0.85 ? 2.2 + 1.6 * hash(gx, gz, 5) : 0.7 + 1.3 * big;
      const y = terrain.heightAt(x, z) - s * (0.08 + 0.1 * hash(gx, gz, 6));
      const t = Math.floor(hash(gx, gz, 7) * types);
      out[t].push(mat(x, y, z, hash(gx, gz, 8) * 6.28, s, s * (1.0 + 0.6 * hash(gx, gz, 9)), (hash(gx, gz, 10) - 0.5) * 0.3, (hash(gx, gz, 11) - 0.5) * 0.3));
    }
  return out;
}

// ------------------------------------------------------------------ near forest (CPU instancing)
// Five spruce forms (tools/blender/spruce2.py), picked per tree from where it stands: the stand
// is mostly columnar and slender trees with some old ragged ones; at edges and clearings the
// lopsided "edge" form turns its long side to the open, and young trees come up in front.
const FORMS = ["column", "pencil", "young", "old", "edge"];
const MIX = {
  inside: { column: 0.45, pencil: 0.36, old: 0.15, young: 0.04, edge: 0 },
  edge: { column: 0.3, pencil: 0.08, old: 0.2, young: 0.2, edge: 0.22 },
};

function pickForm(u, mix) {
  let acc = 0;
  for (const f of FORMS) { acc += mix[f]; if (u < acc) return f; }
  return "column";
}

// the objects of one form (named <form>_<part>) as a glTF-like scene for instanced()
function formScene(gltf, form) {
  const scene = new THREE.Group();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.name.startsWith(form + "_")) {
      const c = new THREE.Mesh(o.geometry, o.material);
      c.applyMatrix4(o.matrixWorld);
      scene.add(c);
    }
  });
  return { scene };
}

const LOD_HI = [52, 64], LOD_FAR = [205, 240];
const FOREST_STEP = 8;   // re-placed when the camera has moved this far (m)

export class NearForest {
  constructor(hi, mid, terrain, landcoverAt, radius = 260) {
    this.terrain = terrain;
    this.lc = landcoverAt;
    this.radius = radius;
    this.cell = 6.5;
    this.max = 3000;
    this.group = new THREE.Group();
    const make = (gltf, form) => instanced(formScene(gltf, form), new Array(this.max).fill(new THREE.Matrix4()));
    this.hi = {}; this.mid = {};
    for (const f of FORMS) {
      this.hi[f] = make(hi, f);
      this.mid[f] = make(mid, f);
      // the detailed trees hand over to the mid ones at 52-64 m, and those to the GPU forest
      // (trees.js, growing in over the same distances) at 205-240 m -- per pixel, no pop
      setLod(this.hi[f], 0, 0, LOD_HI[0], LOD_HI[1]);
      setLod(this.mid[f], LOD_HI[0], LOD_HI[1], LOD_FAR[0], LOD_FAR[1]);
      setSway(this.hi[f]); setSway(this.mid[f]);
      // mid-range trees (85 m and beyond) cast only into the wider shadow cascades
      this.mid[f].traverse((o) => { if (o.isMesh) { o.layers.disable(1); o.layers.enable(3); } });
      this.group.add(this.hi[f], this.mid[f]);
    }
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this.shapes = new ShapeGrid(8);   // trunks and lower branches, for the walker (physics.js)
  }

  update(camera) {
    const c = camera.position;
    if (Math.hypot(c.x - this.last.x, c.z - this.last.z) < FOREST_STEP) return;
    this.last.copy(c);
    this.shapes.clear();
    const cell = this.cell, R = this.radius;
    const n = Math.ceil(R / cell);
    const gx0 = Math.floor(c.x / cell), gz0 = Math.floor(c.z / cell);
    const lists = { hi: {}, mid: {} };
    for (const f of FORMS) { lists.hi[f] = []; lists.mid[f] = []; }
    this.trunks = [];
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const gx = gx0 + i, gz = gz0 + j;
        const x = (gx + 0.15 + 0.7 * hash(gx, gz, 21)) * cell, z = (gz + 0.15 + 0.7 * hash(gx, gz, 22)) * cell;
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > R) continue;
        const f = this.lc(x, z).r;
        const dens = Math.min(1, Math.max(0, (f - 0.3) / 0.45));
        // lone trees scattered near forest edges (as in the reference paintings)
        const edge = f > 0.06 && f < 0.3 ? 0.12 : f <= 0.06 ? 0.0035 : 0;
        if (hash(gx, gz, 23) > Math.max(dens * 0.88, edge)) continue;
        if (this.terrain.trailDist && this.terrain.trailDist(x, z) < 2.8) continue;      // the trails are clear
        if (this.terrain.eggs && this.terrain.eggs.some((e) => Math.hypot(e.x - x, e.z - z) < e.r)) continue;
        if (this.terrain.streamWet && this.terrain.streamWet(x, z) > 0.3) continue;
        // how open the surroundings are: the forest thins toward -grad
        const gxF = this.lc(x + 12, z).r - this.lc(x - 12, z).r, gzF = this.lc(x, z + 12).r - this.lc(x, z - 12).r;
        const open = dens < 0.7 || Math.hypot(gxF, gzF) > 0.15;
        const form = pickForm(hash(gx, gz, 27), open ? MIX.edge : MIX.inside);
        const r1 = hash(gx, gz, 24);
        let h = (0.75 + 0.9 * r1 * r1) * (edge && dens === 0 ? 0.8 : 1);
        if (form === "young") h = 0.22 + 0.3 * r1;
        if (form === "old") h *= 1.12;
        const w = h * (0.85 + 0.3 * hash(gx, gz, 25));
        const y = this.terrain.heightAt(x, z) - 0.3;
        // the edge form's long side (+x) faces the open ground
        const rot = form === "edge" && Math.hypot(gxF, gzF) > 1e-3 ? Math.atan2(gzF, -gxF) : hash(gx, gz, 26) * 6.28;
        // (in the hand-over band a tree is in both lists; the step it may go before the next
        // placement is added on either side)
        const m = mat(x, y, z, rot, w, h);
        if (d < LOD_HI[1] + FOREST_STEP) lists.hi[form].push(m);
        if (d > LOD_HI[0] - FOREST_STEP) lists.mid[form].push(m);
        this.trunks.push(x, z);
        // the trunk (the old and pencil forms flare at the foot), and the lower branches, which
        // sweep the ground: pushing in among them is slow, a young tree's are dense to the stem
        const tr = (form === "old" || form === "pencil" ? 0.5 : 0.33) * w;
        if (d < 120) {
          this.shapes.add({ k: "cyl", x, z, r: tr, y0: y, top: y + 30 });
          this.shapes.add(form === "young" ? { k: "bush", x, z, r: 2.2 * w, core: 0.9 * w, y0: y, top: y + 16 * h }
            : { k: "bush", x, z, r: 1.4 * w, core: 0, y0: y, top: y + 30, slow: 0.4 });
        }
      }
    const fill = (group, list) => {
      for (const im of group.children) {
        const k = Math.min(list.length, this.max);
        for (let i = 0; i < k; i++) im.setMatrixAt(i, list[i]);
        im.count = k;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    };
    this.count = 0;
    for (const f of FORMS) {
      fill(this.hi[f], lists.hi[f]);
      fill(this.mid[f], lists.mid[f]);
      this.count += lists.hi[f].length + lists.mid[f].length;
    }
  }
}

// ------------------------------------------------------------------ forest floor (CPU instancing)
// Fallen trunks (one with its root plate torn up), broken snags, stumps and mossy rocks under the
// near forest and along its edges (tools/blender/deadwood.py). Logs lie on the slope, mostly
// fallen downhill; nothing is put through a standing trunk.
const LOGS = [["log_a", 7], ["log_b", 10], ["log_c", 13], ["log_root", 11]];

export class ForestFloor {
  constructor(gltf, terrain, landcoverAt, forest, radius = 220) {
    this.terrain = terrain;
    this.lc = landcoverAt;
    this.forest = forest;
    this.radius = radius;
    this.cell = 8;
    this.max = 1500;
    this.group = new THREE.Group();
    const names = new Set();
    gltf.scene.traverse((o) => o.isMesh && names.add(o.name.replace(/_(deadbark|logend|earth)$/, "").replace(/_\d+$/, "")));
    const part = (name) => {
      const sc = new THREE.Group();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (o.isMesh && (o.name === name || o.name.startsWith(name + "_"))) { const c = new THREE.Mesh(o.geometry, o.material); c.applyMatrix4(o.matrixWorld); sc.add(c); }
      });
      if (name.startsWith("rock")) {   // (the export lays the rocks out side by side: centre each)
        const b = new THREE.Box3().setFromObject(sc), cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        for (const c of sc.children) { c.position.x -= cx; c.position.z -= cz; }
        this.dims[name] = { hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, h: b.max.y };
      }
      return { scene: sc };
    };
    this.kinds = {};
    this.dims = {};
    this.shapes = new ShapeGrid(8);   // what the walker bumps into, steps or climbs onto (physics.js)
    this.rocks = [...names].filter((n) => n.startsWith("rock")).sort();
    for (const n of [...LOGS.map((l) => l[0]), "snag", "stump", ...this.rocks]) {
      this.kinds[n] = instanced(part(n), new Array(this.max).fill(new THREE.Matrix4()));
      setLod(this.kinds[n], 0, 0, radius - 55, radius - 22);   // (dissolves before the rim, which moves in 20 m steps)
      this.group.add(this.kinds[n]);
    }
    this.last = new THREE.Vector3(1e9, 0, 1e9);
  }

  update(camera) {
    const c = camera.position;
    if (Math.hypot(c.x - this.last.x, c.z - this.last.z) < 20) return;
    this.last.copy(c);
    // trunks of the near forest, binned for the clearance test
    const bins = new Map(), B = 4;
    const tr = this.forest.trunks || [];
    for (let i = 0; i < tr.length; i += 2) {
      const k = Math.floor(tr[i] / B) + "," + Math.floor(tr[i + 1] / B);
      (bins.get(k) || bins.set(k, []).get(k)).push(tr[i], tr[i + 1]);
    }
    const T = this.terrain;
    const clear = (x, z, r) => {
      if (T.trailDist && T.trailDist(x, z) < r + 0.8) return false;
      if (T.eggs && T.eggs.some((e) => Math.hypot(e.x - x, e.z - z) < e.r + r)) return false;
      if (T.streamWet && T.streamWet(x, z) > 0.4) return false;
      for (let i = Math.floor((x - r) / B); i <= Math.floor((x + r) / B); i++)
        for (let j = Math.floor((z - r) / B); j <= Math.floor((z + r) / B); j++) {
          const b = bins.get(i + "," + j);
          if (b) for (let k = 0; k < b.length; k += 2) if (Math.hypot(b[k] - x, b[k + 1] - z) < r) return false;
        }
      return true;
    };
    const cell = this.cell, R = this.radius;
    const lists = {};
    for (const n of Object.keys(this.kinds)) lists[n] = [];
    const S = this.shapes;
    S.clear();
    const near = (x, z) => Math.hypot(x - c.x, z - c.z) < 120;
    const rockShape = (name, x, y, z, yaw, s, sy) => {
      const d = this.dims[name];
      if (d && near(x, z)) S.add({ k: "dome", x, z, rot: yaw, rx: d.hx * s, rz: d.hz * s, y0: y, h: d.h * sy });
    };
    const n = Math.ceil(R / cell);
    const gx0 = Math.floor(c.x / cell), gz0 = Math.floor(c.z / cell);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const gx = gx0 + i, gz = gz0 + j;
        const x = (gx + hash(gx, gz, 41)) * cell, z = (gz + hash(gx, gz, 42)) * cell;
        if (Math.hypot(x - c.x, z - c.z) > R) continue;
        const f = this.lc(x, z).r;
        if (f < 0.12) continue;
        const u = hash(gx, gz, 43), edge = f < 0.5 ? 1 : 0;
        const pLog = 0.13 * f, pSnag = 0.025 * f, pStump = 0.05 * f + 0.04 * edge, pRock = 0.06 * f;
        const y = T.heightAt(x, z);
        if (u < pLog) {
          const [name, L] = LOGS[Math.floor(hash(gx, gz, 44) * LOGS.length)];
          const s = 0.8 + 0.4 * hash(gx, gz, 45);
          // fallen downhill more often than not
          const e = 3, gxs = T.heightAt(x + e, z) - T.heightAt(x - e, z), gzs = T.heightAt(x, z + e) - T.heightAt(x, z - e);
          let a = hash(gx, gz, 46) * 6.283;
          if (hash(gx, gz, 47) < 0.6 && Math.hypot(gxs, gzs) > 0.3) a = Math.atan2(-gzs, -gxs) + (hash(gx, gz, 48) - 0.5) * 1.2;
          const dx = Math.cos(a), dz = Math.sin(a), len = L * s;
          let ok = true;
          for (let t = 0; t <= 1.001 && ok; t += 0.25) ok = clear(x + dx * len * t, z + dz * len * t, 1.0);
          if (!ok) continue;
          const y1 = T.heightAt(x + dx * len, z + dz * len);
          const pitch = Math.atan2(y1 - y, len);
          lists[name].push(mat(x, y - 0.12 * s, z, Math.atan2(-dz, dx), s, s, 0, pitch));
          if (near(x, z)) {
            // lying on the ground: the centre line a radius up, ~0.3 m at the butt, ~0.2 at the top
            const r0 = 0.3 * s, r1 = 0.2 * s;
            S.add({ k: "log", x0: x, z0: z, y0: y - 0.12 * s + r0, x1: x + dx * len, z1: z + dz * len, y1: y1 - 0.12 * s + r1, r0, r1 });
            if (name === "log_root") {   // the torn-up root plate across the butt
              const bx = x - dx * 0.35 * s - dz * 0.26 * s, bz = z - dz * 0.35 * s + dx * 0.26 * s, hl = 1.7 * s;
              S.add({ k: "wall", x0: bx + dz * hl, z0: bz - dx * hl, x1: bx - dz * hl, z1: bz + dx * hl, r: 0.35 * s, y0: y - 0.5, top: y + 2.3 * s, noStand: true });
            }
          }
        } else if (u < pLog + pSnag) {
          if (clear(x, z, 2)) {
            const s = 0.8 + 0.5 * hash(gx, gz, 50);
            lists.snag.push(mat(x, y, z, hash(gx, gz, 49) * 6.283, s));
            if (near(x, z)) S.add({ k: "cyl", x, z, r: 0.3 * s, y0: y, top: y + 3.1 * s, noStand: true });
          }
        } else if (u < pLog + pSnag + pStump) {
          if (clear(x, z, 2)) {
            const s = 0.7 + 0.5 * hash(gx, gz, 52);
            lists.stump.push(mat(x, y - 0.08, z, hash(gx, gz, 51) * 6.283, s));
            if (near(x, z)) S.add({ k: "cyl", x, z, r: 0.45 * s, y0: y, top: y - 0.08 + 0.57 * s });
          }
        } else if (u < pLog + pSnag + pStump + pRock && this.rocks.length) {
          const s = 0.35 + 0.8 * hash(gx, gz, 53) ** 2;
          if (clear(x, z, 1.5 * s + 0.5)) {
            const name = this.rocks[Math.floor(hash(gx, gz, 54) * this.rocks.length)], yaw = hash(gx, gz, 55) * 6.283;
            lists[name].push(mat(x, y - 0.25 * s, z, yaw, s));
            rockShape(name, x, y - 0.25 * s, z, yaw, s, s);
          }
        }
      }
    // stones along and in the brooks
    if (this.streams && this.rocks.length) {
      for (const [x, z, s, yaw, inWater, level] of this.streams.stonesNear(c.x, c.z, R)) {
        const g = T.heightAt(x, z);
        const y = inWater ? Math.min(g, level - 0.12) - 0.15 * s : g - 0.25 * s;
        const k = Math.floor(hash(Math.round(x * 3), Math.round(z * 3), 56) * this.rocks.length);
        lists[this.rocks[k]].push(mat(x, y, z, yaw, s, s * 0.8));
        rockShape(this.rocks[k], x, y, z, yaw, s, s * 0.8);   // (stepping stones)
      }
    }
    this.count = 0;
    for (const [name, list] of Object.entries(lists)) {
      for (const im of this.kinds[name].children) {
        const k = Math.min(list.length, this.max);
        for (let q = 0; q < k; q++) im.setMatrixAt(q, list[q]);
        im.count = k;
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
      this.count += list.length;
    }
  }
}

// ------------------------------------------------------------------ horses
// The Ili horse of tools/blender/animal.py (web/src/animals.js: instanced, skinned from its clips). The
// photo-placed horses (objects.json): the walkers go to and fro along their line on the ridge (photo 6),
// grazing a while at each end; the grazers graze, look up, stand, step to a fresh patch, now and then lie
// down; the foals tied along the line by the yurts stay where they are. A child too close is stepped
// away from. Coats: animals.js COATS.horse (bay, bay with a blaze, chestnut, black, grey, dark bay).
const HORSE_COAT = { bay: [0, 0, 1, 5], chestnut: [2], black: [3], white: [4] };
const HORSE_LOD = [[0, 0, 45, 55], [45, 55, 150, 170], [150, 170, 0, 0]];

class Herd {
  constructor(list, gltf, terrain, foalGltf) {
    this.terrain = terrain;
    this.anim = new AnimalKind(gltf, "horse", { lod: HORSE_LOD });
    this.foalAnim = new AnimalKind(foalGltf, "foal", { lod: HORSE_LOD });   // the foal's own proportions
    this.group = new THREE.Group();
    this.group.add(this.anim.group, this.foalAnim.group);
    this.lists = [[], [], []];
    this.foalLists = [[], [], []];
    this.horses = list.map((h, i) => {
      const yaw = h.rot + Math.PI / 2;                 // (rot: local +x toward the heading; the model faces +z)
      const cs = HORSE_COAT[h.coat] || HORSE_COAT.bay;
      const an = { ...h, A: h.foal ? this.foalAnim : this.anim, home: { x: h.x, z: h.z }, y: terrain.heightAt(h.x, h.z), yaw, pitch: 0, size: h.scale || 1,
        coat: cs[i % cs.length], clip: h.walk ? "walk" : ["graze", "graze", "look", "idle"][i % 4], ct: i * 1.37, prev: null, pt: 0, bl: 1,
        state: h.walk ? "walk" : "graze", t: 6 + (i % 5) * 3 };
      if (h.walk) {   // to and fro along 30 m of its line
        const dx = Math.sin(yaw), dz = Math.cos(yaw);
        an.ends = [{ x: h.x - dx * 15, z: h.z - dz * 15 }, { x: h.x + dx * 15, z: h.z + dz * 15 }];
        an.leg = 1; an.tx = an.ends[1].x; an.tz = an.ends[1].z;
      }
      return an;
    });
    for (const h of this.horses) this.tilt(h);
  }

  tilt(h) {
    const T = this.terrain, e = 0.9, dx = Math.sin(h.yaw), dz = Math.cos(h.yaw);
    h.y = T.heightAt(h.x, h.z);
    h.pitch = Math.atan2(T.heightAt(h.x + dx * e, h.z + dz * e) - T.heightAt(h.x - dx * e, h.z - dz * e), 2 * e);
  }

  // collision capsules of the horses near (x, z) (physics.js): the body along the heading, lower lying
  shapesNear(x, z, r, out) {
    for (const h of this.horses) {
      if (Math.abs(h.x - x) > r + 3 || Math.abs(h.z - z) > r + 3) continue;
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), k = h.size;
      const low = h.clip === "lie" || h.clip === "lie_down" ? 0.55 : 1;
      out.push({ k: "wall", x0: h.x - fx * 0.6 * k, z0: h.z - fz * 0.6 * k, x1: h.x + fx * 0.7 * k, z1: h.z + fz * 0.7 * k, r: 0.34 * k,
        y0: h.y, top: h.y + 1.5 * k * low, noStand: true });
    }
  }

  setClip(h, name, t0 = 0) {
    if (h.clip === name) return;
    h.prev = h.clip; h.pt = h.ct; h.clip = name; h.ct = t0; h.bl = 0;
  }

  update(t, dt, camera) {
    for (const l of [...this.lists, ...this.foalLists]) l.length = 0;
    for (const h of this.horses) {
      this.step(h, dt);
      if (camera) {
        const c = camera.position, L = h.foal ? this.foalLists : this.lists;
        h.A.levels(Math.hypot(h.x - c.x, h.z - c.z, h.y - c.y), (li) => L[li].push(h));
      }
    }
    this.lists.forEach((l, li) => this.anim.draw(li, l));
    this.foalLists.forEach((l, li) => this.foalAnim.draw(li, l));
    if (camera) { this.anim.eye.value.copy(camera.position); this.foalAnim.eye.value.copy(camera.position); }
  }

  step(h, dt) {
    const A = h.A;
    h.t -= dt;
    let rate = 1;
    // a child too close: a few steps away (not the tied foals)
    if (!h.foal && h.state !== "walk" && h.state !== "lie" && h.state !== "rise") {
      for (const W of this.walkers || []) {
        if (!W.present) continue;
        const wx = h.x - W.pos.x, wz = h.z - W.pos.z, wd = Math.hypot(wx, wz);
        if (wd < 2.6 * h.size) {
          h.tx = h.x + (wx / (wd + 1e-3)) * 4; h.tz = h.z + (wz / (wd + 1e-3)) * 4;
          h.state = "walk"; h.away = true;
          break;
        }
      }
    }
    if (h.state === "walk") {
      const gait = h.nibble ? "walk_graze" : "walk";
      this.setClip(h, gait);
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
      if (d < 0.3 * h.size) {
        h.state = "graze"; h.away = false; h.nibble = false;
        h.t = h.walk ? 5 + Math.random() * 10 : 6 + Math.random() * 12;
        this.setClip(h, "graze", Math.random() * 6);
        if (h.walk) { h.leg = 1 - h.leg; h.tx = h.ends[h.leg].x; h.tz = h.ends[h.leg].z; }
      } else {
        const want = Math.atan2(dx, dz);
        const dy = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw));
        h.yaw += dy * Math.min(1, dt * 1.5);
        rate = Math.max(0.25, Math.cos(dy));
        const sp = A.clips[gait].speed * h.size * rate;
        h.x += Math.sin(h.yaw) * sp * dt;
        h.z += Math.cos(h.yaw) * sp * dt;
        this.tilt(h);
      }
    } else if (h.state === "lie") {
      if (h.clip === "lie_down" && h.ct >= A.duration("lie_down")) this.setClip(h, "lie", Math.random() * 6);
      if (h.t < 0) { h.state = "rise"; this.setClip(h, "get_up"); }
    } else if (h.state === "rise") {
      if (h.ct >= A.duration("get_up")) { h.state = "graze"; h.t = 5 + Math.random() * 10; this.setClip(h, "graze", Math.random() * 6); }
    } else if (h.t < 0) {
      const u = Math.random();
      if (h.walk) { h.state = "walk"; }                            // on along the line
      else if (!h.foal && u < 0.3) {                               // a fresh patch nearby, kept near its place
        const a = Math.random() * 6.283, r = 1 + Math.random() * 2.5;
        let tx = h.x + Math.cos(a) * r, tz = h.z + Math.sin(a) * r;
        if (Math.hypot(tx - h.home.x, tz - h.home.z) > 8) { tx = h.home.x + Math.cos(a) * 2; tz = h.home.z + Math.sin(a) * 2; }
        h.tx = tx; h.tz = tz; h.nibble = true; h.state = "walk";
      } else if (u < 0.5) { h.state = "look"; h.t = 3 + Math.random() * 5; this.setClip(h, "look"); }
      else if (u < 0.62) { h.state = "idle"; h.t = 4 + Math.random() * 6; this.setClip(h, "idle", Math.random() * 4); }
      else if (u < 0.68) { h.state = "lie"; h.t = 30 + Math.random() * 60; this.setClip(h, "lie_down"); }
      else { h.state = "graze"; h.t = 6 + Math.random() * 14; this.setClip(h, "graze", Math.random() * 6); }
    }
    h.ct += dt * rate;
    h.pt += dt;
    if (h.bl < 1) h.bl = Math.min(1, h.bl + dt / 0.5);
  }
}

// ------------------------------------------------------------------ doors
// The door leaves of the houses (tools/blender/cabin.py: nodes <model>_door<i> at the hinges, the
// leaf built round its hinge): taken out of the house models and drawn instanced on their own, so
// each turns on its hinge -- inward, ~100 degrees, when the walker opens it (character.js, E).
// A leaf is also a thin box for the walker's collisions, wherever it has swung to.
// (a yurt's two painted leaves, <model>_door<i>_out, swing outward, each from its own jamb)
const DOOR_OPEN = 1.75;

function takeDoors(gltf) {
  const out = [];
  for (const n of [...gltf.scene.children]) {
    const m = /_door\d+(_out)?$/.exec(n.name);
    if (!m) continue;
    const g = new THREE.Group();
    n.traverse((o) => { if (o.isMesh) g.add(new THREE.Mesh(o.geometry, o.material)); });   // (the parts sit at the hinge)
    const b = new THREE.Box3().setFromObject(g);
    const w = b.min.x + b.max.x;                       // the leaf's width, signed: + toward its local +x
    // the angle it opens to: inward, or out (rotating y: local +x goes toward -z, the inside)
    const open = (m[1] ? -1 : 1) * Math.sign(w) * DOOR_OPEN;
    out.push({ hinge: n.position.clone(), scene: g, w, h: b.max.y, open });
    gltf.scene.remove(n);
  }
  return out;
}

// where a model wants the ground lowered under it (an empty <model>_pad scaled to half sizes, or
// <model>_padc to a radius): taken out of the model
// the feet of a model's flights of steps (empties <model>_step<i>, at the bottom tread's level): taken
// out of the model -- the floor is set so that each reaches the ground
function takeSteps(gltf) {
  const out = [];
  for (const n of [...gltf.scene.children]) {
    if (!/_step\d+$/.test(n.name)) continue;
    out.push(n.position.clone());
    gltf.scene.remove(n);
  }
  return out;
}

function takePad(gltf) {
  for (const n of [...gltf.scene.children]) {
    const m = /_pad(c?)$/.exec(n.name);
    if (!m) continue;
    gltf.scene.remove(n);
    return { cx: n.position.x, cz: n.position.z, hx: Math.abs(n.scale.x), hz: Math.abs(n.scale.z), circle: !!m[1] };
  }
  return null;
}

class Doors {
  constructor() {
    this.group = new THREE.Group();
    this.list = [];
    this._m = new THREE.Matrix4();
    this._r = new THREE.Matrix4();
  }

  // the doors of a house model at its instances (matrices: the houses' own)
  add(doors, matrices) {
    for (const d of doors) {
      const base = matrices.map((m) => m.clone().multiply(new THREE.Matrix4().makeTranslation(d.hinge.x, d.hinge.y, d.hinge.z)));
      const ig = instanced({ scene: d.scene }, base, { tile: 0 });   // (leaf k at index k: update moves it)
      this.group.add(ig);
      const ims = ig.children.filter((o) => o.isInstancedMesh);
      base.forEach((B, k) => {
        B.decompose(_p, _q, _s);
        _e.setFromQuaternion(_q, "YXZ");
        this.list.push({ ims, k, base: B, x: _p.x, y: _p.y, z: _p.z, rot: _e.y, sc: _s.x, w: d.w * _s.x, h: d.h * _s.y, open: d.open, angle: 0, target: 0 });
      });
    }
  }

  // the leaf's middle (world x, z), as it hangs now (the doorway's part it closes, if angle 0)
  centre(d, angle = d.angle) {
    const a = d.rot + angle, h = d.w / 2;
    return [d.x + Math.cos(a) * h, d.z - Math.sin(a) * h];
  }

  // the door nearest (x, z) within r (by the middle of the doorway it closes)
  nearest(x, z, r) {
    let best = null, bd = r;
    for (const d of this.list) {
      const [cx, cz] = this.centre(d, 0);
      const dd = Math.hypot(cx - x, cz - z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // open or shut it -- and the other leaf of a double door with it
  toggle(d) {
    const shut = d.target !== 0;
    const [cx, cz] = this.centre(d, 0);
    for (const e of this.list) {
      const [ex, ez] = this.centre(e, 0);
      if (e === d || (Math.abs(ex - cx) < 1.2 && Math.abs(ez - cz) < 1.2 && Math.hypot(ex - cx, ez - cz) < 1.0)) e.target = shut ? 0 : e.open;
    }
  }

  update(dt) {
    for (const d of this.list) {
      if (d.angle === d.target) continue;
      const step = dt * 2.4 * (0.35 + Math.sin(Math.min(1, Math.abs(d.angle - d.target) / Math.abs(d.open)) * Math.PI) * 0.9);
      d.angle = Math.abs(d.target - d.angle) <= step ? d.target : d.angle + Math.sign(d.target - d.angle) * step;
      this._m.copy(d.base).multiply(this._r.makeRotationY(d.angle));
      for (const im of d.ims) { im.setMatrixAt(d.k, this._m); im.instanceMatrix.needsUpdate = true; }
    }
  }

  // the leaves near (x, z) as thin boxes (physics.js)
  shapesNear(x, z, r, out) {
    for (const d of this.list) {
      if (Math.abs(d.x - x) > r + 2 || Math.abs(d.z - z) > r + 2) continue;
      const [cx, cz] = this.centre(d);
      out.push({ k: "box", x: cx, z: cz, rot: d.rot + d.angle, hw: Math.abs(d.w) / 2 - 0.02, hd: 0.05, y0: d.y, top: d.y + d.h, step: 0.05, noStand: true, door: d });
    }
  }
}

// ------------------------------------------------------------------ layout
// Push overlapping footprints apart: items { o: {x, z}, rot, cx, cz, hx, hz } (a rectangle, its
// centre offset and half sizes in its own frame, +z its front) or { o, r } (a circle), each grown
// by `margin`; a pair is parted along the shortest way out (separating axes), split between them
// when both may move. Returns how many moved.
function settle(items, margin, iters = 16) {
  const shape = (it) => {
    if (it.r !== undefined) return { x: it.o.x, z: it.o.z, r: it.r + margin, R: it.r + margin };
    const c = Math.cos(it.rot), sn = Math.sin(it.rot);
    const ux = [c, -sn], uz = [sn, c], hx = it.hx + margin, hz = it.hz + margin;
    return { x: it.o.x + ux[0] * it.cx + uz[0] * it.cz, z: it.o.z + ux[1] * it.cx + uz[1] * it.cz, ux, uz, hx, hz, R: Math.hypot(hx, hz) };
  };
  // the way b must go to clear a: [nx, nz, depth] or null
  const part = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= a.R + b.R) return null;
    if (a.r !== undefined && b.r !== undefined) return d < a.r + b.r ? (d > 1e-6 ? [dx / d, dz / d, a.r + b.r - d] : [1, 0, a.r + b.r]) : null;
    if (a.r !== undefined) { const m = part(b, a); return m && [-m[0], -m[1], m[2]]; }
    if (b.r !== undefined) {   // circle b against box a: from the nearest point of the box
      const lx = dx * a.ux[0] + dz * a.ux[1], lz = dx * a.uz[0] + dz * a.uz[1];
      const qx = Math.max(-a.hx, Math.min(a.hx, lx)), qz = Math.max(-a.hz, Math.min(a.hz, lz));
      let ex = lx - qx, ez = lz - qz, e = Math.hypot(ex, ez), depth;
      if (e > 1e-6) { if (e >= b.r) return null; depth = b.r - e; ex /= e; ez /= e; }
      else if (a.hx - Math.abs(lx) < a.hz - Math.abs(lz)) { ex = Math.sign(lx) || 1; ez = 0; depth = a.hx - Math.abs(lx) + b.r; }
      else { ex = 0; ez = Math.sign(lz) || 1; depth = a.hz - Math.abs(lz) + b.r; }
      return [ex * a.ux[0] + ez * a.uz[0], ex * a.ux[1] + ez * a.uz[1], depth];
    }
    let best = null;
    for (const n of [a.ux, a.uz, b.ux, b.uz]) {
      const ra = a.hx * Math.abs(a.ux[0] * n[0] + a.ux[1] * n[1]) + a.hz * Math.abs(a.uz[0] * n[0] + a.uz[1] * n[1]);
      const rb = b.hx * Math.abs(b.ux[0] * n[0] + b.ux[1] * n[1]) + b.hz * Math.abs(b.uz[0] * n[0] + b.uz[1] * n[1]);
      const s = dx * n[0] + dz * n[1], depth = ra + rb - Math.abs(s);
      if (depth <= 0) return null;
      if (!best || depth < best[2]) best = [n[0] * (Math.sign(s) || 1), n[1] * (Math.sign(s) || 1), depth];
    }
    return best;
  };
  const moved = new Set();
  for (let k = 0; k < iters; k++) {
    let any = false;
    const sh = items.map(shape);
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (!A.move && !B.move) continue;
        const m = part(sh[i], sh[j]);
        if (!m) continue;
        const fa = A.move ? (B.move ? 0.5 : 1) : 0, fb = B.move ? (A.move ? 0.5 : 1) : 0, step = m[2] + 0.01;
        A.o.x -= m[0] * step * fa; A.o.z -= m[1] * step * fa;
        B.o.x += m[0] * step * fb; B.o.z += m[1] * step * fb;
        sh[i] = shape(A); sh[j] = shape(B);
        if (fa) moved.add(A.o);
        if (fb) moved.add(B.o);
        any = true;
      }
    if (!any) break;
  }
  return moved.size;
}

// ------------------------------------------------------------------ building pads
// Houses sit on slopes, the floor at 55% between the lowest and highest ground under them (on a
// steep site no higher than the steps reach); inside, the ground on the uphill side would stand
// above the floor. The terrain is lowered under each house and its porch to just below the floor,
// a bank rising from there into the slope (a map of how far, world.js uPads, applied in glsl.js
// terrainHeight and in terrain.heightAt alike).
const PAD_BANK = 6;
// one pad painted into an n x n block of `data` (row stride w, at ox, oy) covering x0, z0 .. + size
function paintPad(terrain, q, data, w, ox, oy, n, x0, z0, size) {
  const res = size / n;
  // (a pad is held level a texel past its edge, so the filtered texture keeps all of it level, and
  // where it is cut into a slope the bank rises at 45 degrees from there -- no cliff the coarse
  // terrain mesh would smear over the floor)
  const e = Math.hypot(q.hx, q.hz) + 0.5 + (q.bank ? PAD_BANK + res : 0), c = Math.cos(q.rot), sn = Math.sin(q.rot);
  for (let j = Math.max(0, Math.floor((q.z - e - z0) / res)); j <= Math.min(n - 1, Math.ceil((q.z + e - z0) / res)); j++)
    for (let i = Math.max(0, Math.floor((q.x - e - x0) / res)); i <= Math.min(n - 1, Math.ceil((q.x + e - x0) / res)); i++) {
      const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res, dx = x - q.x, dz = z - q.z;
      const lx = dx * c - dz * sn - q.cx, lz = dx * sn + dz * c - q.cz;
      let out = q.circle ? Math.max(0, Math.hypot(lx, lz) - q.hx) : Math.hypot(Math.max(0, Math.abs(lx) - q.hx), Math.max(0, Math.abs(lz) - q.hz));
      if (q.bank) out = Math.max(0, out - res);
      if (out > (q.bank ? PAD_BANK : 0)) continue;
      const lower = Math.max(0, terrain.heightAt(x, z) - q.floor - out);
      const k = (oy + j) * w + ox + i;
      data[k] = Math.max(data[k], Math.min(255, Math.ceil(lower / PAD_STEP)));
    }
}
function buildPads(terrain, pads) {
  if (!pads.length) return;
  // the main map over the valley's houses (about a metre a texel); a guesthouse site far out of it
  // (听岚 5 km west, 青空冀翼 2 km east) gets a tile of its own (a few dm a texel) -- stretching the
  // one map over them would coarsen every house's terrace
  const ext = (q) => Math.hypot(q.hx, q.hz) + 2 + (q.bank ? PAD_BANK + 2 : 0);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const q of pads.filter((q) => !q.gh)) { const e = ext(q); x0 = Math.min(x0, q.x - e); x1 = Math.max(x1, q.x + e); z0 = Math.min(z0, q.z - e); z1 = Math.max(z1, q.z + e); }
  const inMain = (q) => q.x > x0 - 300 && q.x < x1 + 300 && q.z > z0 - 300 && q.z < z1 + 300;
  const main = pads.filter((q) => !q.gh || inMain(q)), far = pads.filter((q) => q.gh && !inMain(q));
  for (const q of main) { const e = ext(q); x0 = Math.min(x0, q.x - e); x1 = Math.max(x1, q.x + e); z0 = Math.min(z0, q.z - e); z1 = Math.max(z1, q.z + e); }
  const size = Math.max(x1 - x0, z1 - z0);
  const n = Math.min(4096, Math.ceil(size / 0.5));
  // the far ones in clusters (within 300 m of one another), a 512-texel tile each, in a column right
  // of the main map in the same texture (the terrain's shader has no texture unit to spare)
  const clusters = [];
  for (const q of far) {
    const c = clusters.find((c) => c.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 300));
    if (c) c.push(q); else clusters.push([q]);
  }
  if (clusters.length > 4) console.warn("buildPads: more than four outlying sites, the rest not levelled");
  const nt = Math.min(4, clusters.length);
  const W = n + (nt ? 512 : 0), H = Math.max(n, nt * 512);
  const data = new Uint8Array(W * H);
  for (const q of main) paintPad(terrain, q, data, W, 0, 0, n, x0, z0, size);
  const tiles = [];
  clusters.slice(0, 4).forEach((c, k) => {
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (const q of c) { const e = ext(q); a0 = Math.min(a0, q.x - e); a1 = Math.max(a1, q.x + e); b0 = Math.min(b0, q.z - e); b1 = Math.max(b1, q.z + e); }
    const t = { x0: a0, z0: b0, size: Math.max(a1 - a0, b1 - b0) };
    for (const q of c) paintPad(terrain, q, data, W, n, k * 512, 512, t.x0, t.z0, t.size);
    tiles.push(t);
  });
  terrain.setPads({ data, n, W, H, x0, z0, size, tiles });
}

// ------------------------------------------------------------------ build
// Composition boulders near the photo viewpoints (the reference paintings frame their views
// with mossy boulders); bearings are relative to each photo's heading.
function heroRocks(terrain, viewpoints, swing) {
  const list = [];
  const add = (x0, z0, yawDeg, rel, dist, size) => {
    const a = ((yawDeg + rel) * Math.PI) / 180;
    const x = x0 + Math.sin(a) * dist, z = z0 - Math.cos(a) * dist;
    list.push(mat(x, terrain.heightAt(x, z) - size * 0.1, z, rel * 0.37, size, size * 1.35));
  };
  const v2 = viewpoints[1], v1 = viewpoints[0];
  add(v2.x, v2.z, v2.yaw, -32, 7.5, 1.3); add(v2.x, v2.z, v2.yaw, -44, 11, 0.8); add(v2.x, v2.z, v2.yaw, 38, 16, 1.6);
  add(v1.x, v1.z, v1.yaw, 34, 9, 1.7); add(v1.x, v1.z, v1.yaw, 48, 13, 0.9);
  if (swing) { add(swing.x, swing.z, 0, 150, 3.5, 1.1); add(swing.x, swing.z, 0, 110, 7, 1.6); add(swing.x, swing.z, 0, 250, 5, 0.8); }
  return list;
}

export async function buildSlice({ scene, terrain, objects, landcoverAt, maskAt, centre, viewpoints, maskTexture }) {
  const [cabinSmall, lodge, lodge24, yurt, yurtDeck, fence, walk, rocks, swing, horse, sHi, sMid, railing, houseA, houseB, barn, hay, deadwood, household, eggsG, sheepG, cattleG, dogG, marmotG, eagleG, lambG, foalG] = await Promise.all(
    ["cabin_small", "lodge", "lodge24", "yurt", "yurt_deck", "fence", "boardwalk", "rocks", "swing", "horse", "spruce2_hi", "spruce2_mid", "railing",
     "house_a", "house_b", "barn", "haystack", "deadwood", "household", "eggs", "sheep", "cattle", "dog", "marmot", "eagle", "lamb", "foal"].map((n) => loadAsset(A(n)))
  );
  // today's guesthouses (tools/blender/guesthouses.py, data/layout/guesthouses.json)
  const GH = [...new Set((objects.guesthouses || []).map((g) => g.model))];
  const ghModels = Object.fromEntries(await Promise.all(GH.map(async (n) => [n, await loadAsset(A(n))])));
  const root = new THREE.Group();
  root.name = "slice";

  // buildings: floor at 55% between the lowest and highest ground under the footprint
  const piece = (gltf, name) => {
    const s = new THREE.Group();
    gltf.scene.traverse((o) => o.isMesh && o.parent && (o.name.startsWith(name) || o.parent.name.startsWith(name)) && s.add(o.clone()));
    return { scene: s };
  };
  const cabinM = [], lodgeM = [], lodge24M = [], houseAM = [], houseBM = [];
  const dwell = [];
  // the houses' doors come out of the models (they turn on their own); each model's solid, for
  // the walker, from its geometry as it stands (buildgrid.js)
  const HOUSES = { cabin: cabinSmall, lodge, lodge24, house_a: houseA, house_b: houseB, yurt, yurt_deck: yurtDeck, ...ghModels };
  const DOORS = {}, GRIDS = {}, PAD = {}, SOD = {}, STEPS = {};
  const tg = performance.now();
  for (const [k, g] of Object.entries(HOUSES)) {
    DOORS[k] = takeDoors(g);
    STEPS[k] = takeSteps(g);
    PAD[k] = takePad(g);
    GRIDS[k] = buildGrid(g.scene);
  }
  GRIDS.barn = buildGrid(barn.scene);
  console.info("building grids", Math.round(performance.now() - tg), "ms");
  // the models' real footprints (x across the front, z front to back, roof overhang included)
  const size = (g) => new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
  const SZ = { lodge: size(lodge), lodge24: size(lodge24), house_a: size(houseA), house_b: size(houseB), cabin: size(cabinSmall) };
  for (const n of GH) SZ[n] = size(ghModels[n]);
  const houseModel = (c) => {
    const model = c.kind === "lodge" ? (c.w >= 30 ? "lodge" : "lodge24") : c.kind === "house_a" || c.kind === "house_b" ? c.kind : "cabin";
    return { model, sc: model === "cabin" ? Math.min(1.25, Math.max(0.75, c.w / 8.4)) : model.startsWith("house") ? c.scale || 1 : 1 };
  };
  // nothing standing in anything else: the houses (porch and steps included), the sheds and the
  // yurts as placed from the photos and the 2013 tracing overlap here and there (a yurt on a
  // cabin's steps, a house run into its shed); the traced ones and the yurts are moved apart
  {
    const bb = new THREE.Box3().setFromObject(barn.scene), bc = bb.getCenter(new THREE.Vector3()), bs = bb.getSize(new THREE.Vector3());
    const items = [];
    for (const c of objects.cabins) {
      const { model, sc } = houseModel(c), P = PAD[model];
      items.push({ o: c, rot: c.rot, cx: P.cx * sc, cz: (P.cz + 0.8) * sc, hx: P.hx * sc, hz: (P.hz + 0.8) * sc, move: c.src === "2013" });
    }
    for (const b of objects.barns || []) {
      const sx = b.w / 16;
      items.push({ o: b, rot: b.rot, cx: bc.x * sx, cz: bc.z, hx: (bs.x / 2) * sx, hz: bs.z / 2, move: b.src === "2013" });
    }
    for (const g of objects.guesthouses || []) {   // (as they stand today: fixed)
      const P = PAD[g.model];
      items.push({ o: g, rot: g.rot, cx: P.cx, cz: P.cz + 0.8, hx: P.hx, hz: P.hz + 0.8, move: false });
    }
    for (const y of objects.yurts) items.push({ o: y, r: y.r * (y.deck ? 1.35 : 1.05) + 0.3, move: true });
    const moved = settle(items, 0.5);
    console.info("layout: moved", moved, "buildings clear of each other");
  }
  objects.cabins.forEach((c, i) => {
    const g = footprint(terrain, c.x, c.z, Math.max(c.w, c.d) * 0.5);
    const { model, sc } = houseModel(c);
    // (on a steep site the floor is held at most 0.9 m over the ground at the foot of the steps --
    // the bottom tread there -- and the back cut into the slope, buildPads: a house on a terrace,
    // not its front standing on air above the plinth and the porch piers)
    const P = PAD[model], fx = Math.sin(c.rot), fz = Math.cos(c.rot), ax = Math.cos(c.rot), az = -Math.sin(c.rot);
    const fr = (P.cz + P.hz) * sc + 1.3;
    let fg = Infinity;
    for (const t of [-0.6, 0, 0.6]) fg = Math.min(fg, terrain.heightAt(c.x + fx * fr + ax * t * P.hx * sc, c.z + fz * fr + az * t * P.hx * sc));
    const y = Math.min(g.lo + (g.hi - g.lo) * 0.55, fg + 0.9);
    // (a smaller house is smaller on the ground, not lower: its doors, eaves, steps and furniture
    // keep the height people use them at)
    dwell.push({ x: c.x, z: c.z, rot: c.rot, w: SZ[model].x * sc, d: SZ[model].z * sc, kind: c.kind || "cabin", y, model, sc, sy: 1 });
    if (c.kind === "lodge" && c.w >= 30) {
      lodgeM.push(mat(c.x, y, c.z, c.rot));
    } else if (c.kind === "lodge") {
      lodge24M.push(mat(c.x, y, c.z, c.rot, 1));
    } else if (c.kind === "house_a" || c.kind === "house_b") {
      // herder houses of the pre-tourism layout (2013 imagery)
      (c.kind === "house_a" ? houseAM : houseBM).push(mat(c.x, y, c.z, c.rot, c.scale || 1, 1));
      return;
    } else {
      const s = Math.min(1.25, Math.max(0.75, c.w / 8.4));
      cabinM.push(mat(c.x, y, c.z, c.rot, s, 1));
    }
  });
  // the guesthouses: set on their sites like the houses (the floor at most 0.9 m over the ground
  // before the front, the back dug in)
  // (a building next to another may have its steps come down into the other's levelled terrace --
  // buildPads cuts it to that floor, a 45-degree bank beyond -- so each reads the ground as the
  // others' terraces will leave it; three passes, the floors only ever coming down)
  const GL = (objects.guesthouses || []).map((c) => {
    const P = PAD[c.model], fx = Math.sin(c.rot), fz = Math.cos(c.rot), ax = Math.cos(c.rot), az = -Math.sin(c.rot);
    return { c, P, fx, fz, ax, az, y: Infinity };
  });
  const ground = (x, z, self) => {
    let h = terrain.heightAt(x, z);
    for (const o of GL) {
      if (o === self || o.y === Infinity) continue;
      const dx = x - o.c.x, dz = z - o.c.z, c = Math.cos(o.c.rot), s_ = Math.sin(o.c.rot);
      const lx = dx * c - dz * s_ - o.P.cx, lz = dx * s_ + dz * c - o.P.cz;
      const out = Math.hypot(Math.max(0, Math.abs(lx) - o.P.hx - 0.2), Math.max(0, Math.abs(lz) - o.P.hz - 0.2));
      if (out < 7.5) h = Math.min(h, o.y - 0.2 + Math.max(0, out - 1.6));   // (the map's texel and its filtering widen the level a little)
    }
    return h;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const o of GL) {
      const { c, P, fx, fz, ax, az } = o;
      const g = footprint(terrain, c.x + ax * P.cx + fx * P.cz, c.z + az * P.cx + fz * P.cz, Math.max(P.hx, P.hz));
      const fr = P.cz + P.hz + 1.3;
      let fg = Infinity;
      for (const t of [-0.6, 0, 0.6]) fg = Math.min(fg, ground(c.x + fx * fr + ax * (P.cx + t * P.hx), c.z + fz * fr + az * (P.cx + t * P.hx), o));
      let y = Math.min(g.lo + (g.hi - g.lo) * 0.55, fg + 0.9);
      if (c.floor === "back") {   // (level with the ground at its back wall, the front over a bank: 岚川's public building)
        const lzb = P.cz - P.hz + 0.6;
        y = 0;
        for (const t of [-0.8, -0.4, 0, 0.4, 0.8]) y += ground(c.x + ax * (P.cx + t * P.hx) + fx * lzb, c.z + az * (P.cx + t * P.hx) + fz * lzb, o) / 5;
      }
      // (and every flight of steps down from its decks reaches the ground: the bottom tread no
      // higher than a step over the grass at its foot)
      for (const st of STEPS[c.model]) y = Math.min(y, ground(c.x + ax * st.x + fx * st.z, c.z + az * st.x + fz * st.z, o) - st.y + 0.18);
      o.y = Math.min(o.y, y);
    }
  }
  const ghM = Object.fromEntries(GH.map((n) => [n, []]));
  for (const { c, y } of GL) {
    dwell.push({ x: c.x, z: c.z, rot: c.rot, w: SZ[c.model].x, d: SZ[c.model].z, kind: "guesthouse", y, model: c.model, sc: 1, sy: 1, site: c.site, home: !!c.home });
    ghM[c.model].push(mat(c.x, y, c.z, c.rot));
  }
  const houses = [instanced(cabinSmall, cabinM), instanced(lodge, lodgeM), instanced(lodge24, lodge24M), instanced(houseA, houseAM), instanced(houseB, houseBM),
    ...GH.map((n) => instanced(ghModels[n], ghM[n]))];
  for (const h of houses) setIndoor(h);
  root.add(...houses);
  const doors = new Doors();
  doors.add(DOORS.cabin, cabinM); doors.add(DOORS.lodge, lodgeM); doors.add(DOORS.lodge24, lodge24M);
  doors.add(DOORS.house_a, houseAM); doors.add(DOORS.house_b, houseBM);
  for (const n of GH) doors.add(DOORS[n], ghM[n]);
  setIndoor(doors.group);
  root.add(doors.group);
  // sheep sheds (16 m model stretched to the traced length) and haystacks
  // a shed on a slope is dug into it, its open front (+z) on the ground in front: the floor there,
  // the slope cut away behind (buildPads), the back wall holding it
  const barnSites = (objects.barns || []).map((b) => {
    const sx = b.w / 16, fx = Math.sin(b.rot), fz = Math.cos(b.rot), ax = Math.cos(b.rot), az = -Math.sin(b.rot);
    let y = 0;
    for (const t of [-0.35, 0, 0.35]) y += terrain.heightAt(b.x + ax * t * b.w + fx * 3.6, b.z + az * t * b.w + fz * 3.6) / 3;
    return { x: b.x, y: y + 0.03, z: b.z, rot: b.rot, sx };
  });
  const barnM = barnSites.map((o) => new THREE.Matrix4().compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(_e.set(0, o.rot, 0, "YXZ")), _s.set(o.sx, 1, 1)));
  root.add(instanced(barn, barnM));
  {
    const b = new THREE.Box3();
    barn.scene.traverse((o) => { if (o.isMesh && /sod/.test(o.material?.name || "")) b.expandByObject(o); });
    SOD.barn = b;
  }
  // yurts: door downhill (as before), deck yurts on platforms
  const yM = [], ydM = [];
  for (const y of objects.yurts) {
    const e = 4;
    const gx = terrain.heightAt(y.x + e, y.z) - terrain.heightAt(y.x - e, y.z);
    const gz = terrain.heightAt(y.x, y.z + e) - terrain.heightAt(y.x, y.z - e);
    let rot = Math.atan2(-gx, -gz) + (hash(y.x, y.z) - 0.5) * 0.6;
    // (nor at the back of a neighbour a few metres downhill: the door turned aside, its steps clear)
    for (const o of objects.yurts) {
      const dx = o.x - y.x, dz = o.z - y.z;
      if (o === y || Math.hypot(dx, dz) > 12) continue;
      const to = Math.atan2(dx, dz), th = Math.atan2(Math.sin(rot - to), Math.cos(rot - to));
      if (Math.abs(th) < 0.9) rot = to + (th < 0 ? -0.9 : 0.9);
    }
    const g = footprint(terrain, y.x, y.z, y.r * 0.8);
    // (a smaller yurt is narrower, not lower: its lattice and door stay the height people walk in by)
    const s = y.r / (y.deck ? 3.6 : 3.2), sy = Math.max(s, 1);
    // (a pad levelled for it: dug in uphill -- buildPads -- and built up a little downhill, the
    // door end at most half a metre over the ground before it, a few stone steps up)
    const R = y.r * 1.05, fg = terrain.heightAt(y.x + Math.sin(rot) * (R + 0.9), y.z + Math.cos(rot) * (R + 0.9));
    const yy = y.deck ? g.hi + 0.1 : Math.min(g.lo + (g.hi - g.lo) * 0.3, fg + 0.5);
    dwell.push({ x: y.x, z: y.z, rot, r: y.r * (y.deck ? 1.35 : 1.05), kind: "yurt", y: yy, sc: s, sy, deck: !!y.deck, model: y.deck ? "yurt_deck" : "yurt", gh: !!y.gh });
    (y.deck ? ydM : yM).push(mat(y.x, yy, y.z, rot, s, sy));
  }
  const yurtsG = [instanced(yurt, yM), instanced(yurtDeck, ydM)];
  for (const h of yurtsG) setIndoor(h);
  root.add(...yurtsG);
  doors.add(DOORS.yurt, yM); doors.add(DOORS.yurt_deck, ydM);

  // the ground under the houses and yurts lowered to just below their floors (before anything else
  // is set on it): where each model's pad says (deck yurts stand above it)
  const pads = dwell.filter((d) => d.model && PAD[d.model] && !d.deck).map((d) => {
    const P = PAD[d.model];
    return { x: d.x, z: d.z, rot: d.rot, cx: P.cx * d.sc, cz: P.cz * d.sc, hx: P.hx * d.sc + (P.circle ? 0.5 : 0.2), hz: P.hz * d.sc + 0.2,
      circle: P.circle, floor: d.y - (d.kind === "yurt" ? 0.1 : 0.2), bank: true, gh: d.kind === "guesthouse" || !!d.gh };
  });
  for (const o of barnSites) {   // the sheds: the slope cut away inside down to their earth floor
    const b = SOD.barn;
    pads.push({ x: o.x, z: o.z, rot: o.rot, cx: (b.min.x + b.max.x) / 2 * o.sx, cz: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2 * o.sx - 0.1, hz: (b.max.z - b.min.z) / 2 - 0.1, floor: o.y - 0.08 });
  }
  buildPads(terrain, pads);
  // and no grass, flowers or shrubs on that footprint, porch and steps included (prop mask R)
  if (maskTexture) {
    const cv = maskTexture.image, g = cv.getContext("2d"), size = cv.width;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgb(255,0,0)";
    for (const q of pads) {
      g.setTransform(1, 0, 0, 1, q.x - centre.x + size / 2, q.z - centre.z + size / 2);
      g.rotate(-q.rot);
      if (q.circle) { g.beginPath(); g.arc(q.cx, q.cz, q.hx + 0.3, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(q.cx - q.hx, q.cz - q.hz, 2 * q.hx, 2 * q.hz);
    }
    g.restore();
    maskTexture.needsUpdate = true;
  }


  const stackM = [], loafM = [];
  for (const h of objects.hay || []) {
    const g = footprint(terrain, h.x, h.z, h.type === "loaf" ? 3 : 1.5);
    (h.type === "loaf" ? loafM : stackM).push(mat(h.x, g.lo + 0.05, h.z, h.rot, h.s, h.s * (0.9 + 0.2 * hash(h.z, h.x))));
  }
  root.add(instanced(piece(hay, "stack"), stackM), instanced(piece(hay, "loaf"), loafM));

  // fences and boardwalks from the photo-traced polylines
  const gates = [
    ...barnSites.map((o) => [o.x + Math.sin(o.rot) * 3.6, o.z + Math.cos(o.rot) * 3.6]),
    ...doors.list.map((d) => doors.centre(d).map((v, k) => v + (k ? Math.cos(d.rot) : Math.sin(d.rot)) * 1.5)),
  ];
  const fm = fenceMatrices(terrain, objects.fences, gates);
  root.add(instanced(piece(fence, "post"), fm.posts), instanced(piece(fence, "rail"), fm.rails));
  const hh = householdMatrices(terrain, dwell, fm.spans);
  for (const [name, list] of Object.entries(hh.lists)) if (list.length) root.add(instanced(piece(household, name), list));
  const bm = boardwalkMatrices(terrain, objects.boardwalks);
  root.add(instanced(piece(walk, "board"), bm.boards), instanced(piece(walk, "stringer"), bm.stringers));
  const v2 = viewpoints[1];
  const rl = railingMatrices(terrain, objects.boardwalks, { x: v2.x, z: v2.z });
  root.add(instanced(piece(railing, "rpost"), rl.posts), instanced(piece(railing, "rope"), rl.ropes), instanced(piece(railing, "lpost"), rl.lanterns));

  // swing(s)
  root.add(instanced(swing, objects.swings.map((s) => mat(s.x, terrain.heightAt(s.x, s.z), s.z, s.rot))));

  // boulders scattered over the meadows around the slice
  const rockTypes = [];
  rocks.scene.traverse((o) => o.isMesh && rockTypes.push(o));
  const rm = rockMatrices(terrain, landcoverAt, maskAt, centre, 900, rockTypes.length);
  rm[0].push(...heroRocks(terrain, viewpoints, objects.swings[0]));
  // keep grass and flowers from growing through boulders
  if (maskTexture) {
    const cv = maskTexture.image, g = cv.getContext("2d");
    const size = cv.width;
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgb(255,0,0)";
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const list of rm)
      for (const m of list) {
        m.decompose(p, q, sc);
        g.beginPath();
        g.arc(p.x - centre.x + size / 2, p.z - centre.z + size / 2, sc.x * 0.42, 0, Math.PI * 2);
        g.fill();
      }
    maskTexture.needsUpdate = true;
  }
  rockTypes.forEach((mesh, i) => {
    const g = new THREE.Group();
    g.add(mesh.clone());
    root.add(instanced({ scene: g }, rm[i]));
  });

  // horses (tools/blender/animal.py, from Aholo's model)
  const herd = new Herd([...objects.horses, ...hh.foals], horse, terrain, foalG);
  root.add(herd.group);

  // smoke from some of the chimneys and stovepipes (a fire lit for the evening meal)
  const sources = [];
  const addSmoke = (gltf, mat, list, share) => {
    const top = gltf && chimneyTop(gltf, mat);
    if (!top) return;
    for (const m of list) {
      const p = top.clone().applyMatrix4(m);
      const u = hash(Math.round(p.x), Math.round(p.z), 61);
      if (u < share) sources.push([p.x, p.y + 0.05, p.z, u * 13.7 % 1]);
    }
  };
  addSmoke(cabinSmall, "stone", cabinM, 0.25);
  addSmoke(lodge, "stone", lodgeM, 0.5);
  addSmoke(lodge24, "stone", lodge24M, 0.35);
  addSmoke(houseA, "stone", houseAM, 0.35);
  addSmoke(houseB, "stone", houseBM, 0.35);
  addSmoke(yurt, "iron", yM, 0.22);
  addSmoke(yurtDeck, "iron", ydM, 0.22);
  const smoke = new Smoke(sources);
  root.add(smoke.mesh);

  // the quiet easter eggs: an old Sheikah standing stone by a forest trail near a brook, and a
  // Korok peeking out from behind a boulder at the forest edge, looking toward the camp
  const eggs = placeEggs(terrain, landcoverAt, dwell);
  terrain.eggs = eggs.keep;   // (the near forest and the dead wood keep clear of them)
  if (eggs.monolith) {
    root.add(instanced(piece(eggsG, "monolith"), [eggs.monolith]));
    root.add(new Fairies(eggs.monolithPos).mesh);
  }
  if (eggs.korok) {
    root.add(instanced(piece(eggsG, "korok"), [eggs.korok]));
    root.add(instanced({ scene: (() => { const g = new THREE.Group(); g.add(rockTypes[1 % rockTypes.length].clone()); return g; })() }, [eggs.korokRock]));
  }

  // sheep flocks and cattle on the pastures
  const livestock = new Livestock({ sheep: sheepG, lamb: lambG, cattle: cattleG, dog: dogG, marmot: marmotG }, terrain, landcoverAt, dwell);
  root.add(livestock.group);
  // golden eagles and black kites overhead
  const raptors = new Raptors(eagleG, terrain, dwell.find((d) => d.home) || dwell.find((d) => d.kind === "lodge") || dwell[0]);
  root.add(raptors.group);

  // near-range spruces
  const forest = new NearForest(sHi, sMid, terrain, landcoverAt);
  root.add(forest.group);
  const floor = new ForestFloor(deadwood, terrain, landcoverAt, forest);
  root.add(floor.group);

  // ---------------------------------------------------------------- collision shapes (physics.js)
  const col = new Collision();
  const add = (sh) => col.statics.add(sh);
  const at = (m) => { m.decompose(_p, _q, _s); _e.setFromQuaternion(_q, "YXZ"); return { x: _p.x, y: _p.y, z: _p.z, rot: _e.y, sx: _s.x, sy: _s.y, sz: _s.z }; };
  // local (lx, lz) of a thing turned by rot (the frame of mat()) to world
  const W = (o, lx, lz) => [o.x + lx * Math.cos(o.rot) + lz * Math.sin(o.rot), o.z - lx * Math.sin(o.rot) + lz * Math.cos(o.rot)];
  const boxOf = (o, b, extra = {}) => {   // b: model-frame box {x0, x1, z0, z1, top}
    const [x, z] = W(o, (b.x0 + b.x1) / 2 * o.sx, (b.z0 + b.z1) / 2 * o.sz);
    return add({ k: "box", x, z, rot: o.rot, hw: (b.x1 - b.x0) / 2 * o.sx, hd: (b.z1 - b.z0) / 2 * o.sz, y0: o.y - 0.3, top: o.y + b.top * o.sy, ...extra });
  };
  // houses and sheds: as modelled (buildgrid.js), walls, porches, steps, doorways, the rooms inside
  for (const d of dwell) {
    if (d.model) add(gridShape(GRIDS[d.model], d.x, d.y, d.z, d.rot, d.sc, d.sy ?? d.sc, d.sc));
  }
  for (const m of barnM) { const o = at(m); add(gridShape(GRIDS.barn, o.x, o.y, o.z, o.rot, o.sx, o.sy, o.sz)); }
  for (const m of loafM) boxOf(at(m), { x0: -3.37, x1: 3.68, z0: -1.4, z1: 1.31, top: 2.45 });
  for (const m of stackM) { const o = at(m); add({ k: "cyl", x: o.x, z: o.z, r: 1.72 * o.sx, y0: o.y - 0.35, top: o.y + 3.4 * o.sy }); }
  // fences (rails at 0.55 and 1 m, posts 1.35), the boardwalks' rope railings, the foal lines
  for (const [x0, y0, z0, x1, y1, z1] of fm.spans) add({ k: "wall", x0, z0, x1, z1, r: 0.08, y0: Math.min(y0, y1) - 0.3, top: Math.max(y0, y1) + 1.3, noStand: true });
  for (const [x0, y0, z0, x1, y1, z1] of rl.spans) add({ k: "wall", x0, z0, x1, z1, r: 0.08, y0: Math.min(y0, y1) - 1.2, top: Math.max(y0, y1) + 0.06, noStand: true });
  // boardwalk runs: walked on, 0.28 m over the ground; a stair: on the slope through its treads' middles
  for (const w of objects.boardwalks) {
    if (w.stairs) {
      const P = resample(w.pts, 0.19), { e } = stairLevels(terrain, P);
      for (let i = 0; i + 6 < P.length; i += 6) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 6], L = Math.hypot(x1 - x0, z1 - z0);
        const t0 = e[i] + 0.04 + STAIR_RISE / 2, t1 = e[i + 6] + 0.04 + STAIR_RISE / 2;
        add({ k: "box", x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: Math.atan2(-(z1 - z0), x1 - x0), hw: L / 2 + 0.05, hd: w.width / 2, y0: Math.min(t0, t1) - 0.6, top: t0, top1: t1 });
      }
      continue;
    }
    const P = resample(w.pts, 2.8);
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.05) continue;
      const t0 = terrain.heightAt(x0, z0) + 0.28, t1 = terrain.heightAt(x1, z1) + 0.28;
      add({ k: "box", x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: Math.atan2(-(z1 - z0), x1 - x0), hw: L / 2 + 0.05, hd: w.width / 2, y0: Math.min(t0, t1) - 0.6, top: t0, top1: t1 });
    }
  }
  // household things (tools/blender/household.py measures)
  const HH = {
    woodpile: (o) => boxOf(o, { x0: -1.28, x1: 1.28, z0: -0.38, z1: 0.46, top: 1.46 }),
    block: (o) => add({ k: "cyl", x: o.x, z: o.z, r: 0.32, y0: o.y, top: o.y + 0.52 }),
    can_a: (o) => add({ k: "cyl", x: o.x, z: o.z, r: 0.21, y0: o.y, top: o.y + 0.62, step: 0.05, noStand: true }),
    can_b: (o) => add({ k: "cyl", x: o.x, z: o.z, r: 0.16, y0: o.y, top: o.y + 0.48, step: 0.05, noStand: true }),
    bucket: (o) => add({ k: "cyl", x: o.x, z: o.z, r: 0.16, y0: o.y, top: o.y + 0.3, step: 0.05, noStand: true }),
    hearth: (o) => add({ k: "cyl", x: o.x, z: o.z, r: 0.62, y0: o.y, top: o.y + 1.56, step: 0.05, noStand: true }),   // (not into the fire)
    cart: (o) => boxOf(o, { x0: -2.62, x1: 1.22, z0: -0.95, z1: 0.95, top: 1.3 }),
    tether: (o) => { const [x1, z1] = W(o, 14.05, 0); add({ k: "wall", x0: o.x, z0: o.z, x1, z1, r: 0.06, y0: o.y - 0.2, top: o.y + 0.55, step: 0.6, noStand: true }); },
  };
  for (const [k, list] of Object.entries(hh.lists)) if (HH[k]) for (const m of list) HH[k](at(m));
  // the swing: its two A-frames, and the seat hanging between
  for (const sw of objects.swings) {
    const o = { x: sw.x, y: terrain.heightAt(sw.x, sw.z), z: sw.z, rot: sw.rot || 0 };
    for (const sx of [-2.0, 2.0]) {
      const [x0, z0] = W(o, sx, -0.97), [x1, z1] = W(o, sx, 0.97);
      add({ k: "wall", x0, z0, x1, z1, r: 0.12, y0: o.y - 0.4, top: o.y + 3.6, noStand: true });
    }
    add({ k: "box", x: o.x, z: o.z, rot: o.rot, hw: 0.43, hd: 0.14, y0: o.y + 0.65, top: o.y + 0.71, step: 0.05, noStand: true });
  }
  // boulders: each rock's own footprint and height, turned and scaled as placed
  const rockDims = rockTypes.map((mesh) => { mesh.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(mesh); return { hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, h: b.max.y }; });
  const boulder = (m, t) => { const o = at(m), d = rockDims[t]; add({ k: "dome", x: o.x, z: o.z, rot: o.rot, rx: d.hx * o.sx, rz: d.hz * o.sz, y0: o.y, h: d.h * o.sy }); };
  rm.forEach((list, t) => list.forEach((m) => boulder(m, t)));
  if (eggs.monolith) boxOf(at(eggs.monolith), { x0: -0.46, x1: 0.49, z0: -0.21, z1: 0.21, top: 1.9 });
  if (eggs.korokRock) boulder(eggs.korokRock, 1 % rockTypes.length);
  // live things: the near forest and its floor (re-placed as the camera moves), horses, flocks
  col.addProvider((x, z, r, out, st) => forest.shapes.query(x, z, r, out, st));
  col.addProvider((x, z, r, out, st) => floor.shapes.query(x, z, r, out, st));
  col.addProvider((x, z, r, out, st) => herd.shapesNear(x, z, r, out));
  col.addProvider((x, z, r, out, st) => livestock.shapesNear(x, z, r, out));
  col.addProvider((x, z, r, out, st) => doors.shapesNear(x, z, r, out));

  // no grass or flowers on the steps either: from each door out as far as its steps go
  if (maskTexture) {
    const cv = maskTexture.image, g = cv.getContext("2d"), size = cv.width;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgb(255,0,0)";
    for (const d of doors.list) {
      const [cx, cz] = doors.centre(d), fx = Math.sin(d.rot), fz = Math.cos(d.rot);
      let end = 0;
      for (let t = 0.2; t < 6; t += 0.1) if (col.occupied(cx + fx * t, cz + fz * t)) end = t;
      g.setTransform(1, 0, 0, 1, cx - centre.x + size / 2, cz - centre.z + size / 2);
      g.rotate(-d.rot);
      g.fillRect(-1.0 * d.sc, 0, 2.0 * d.sc, end + 0.4);
    }
    g.restore();
    maskTexture.needsUpdate = true;
  }

  scene.add(root);
  return {
    root,
    collision: col,
    doors,
    forest,
    floor,
    smoke,
    household: hh,   // (placed matrices per kind)
    dwell,
    livestock,
    raptors,
    eggs,
    herd,
    rockCount: rm.reduce((a, b) => a + b.length, 0),
    update(camera, t, dt) {
      forest.update(camera);
      floor.update(camera);   // after the forest: it keeps clear of the trunks
      herd.update(t, dt, camera);
      livestock.update(camera, dt);
      raptors.update(dt, camera);
      doors.update(dt);
    },
  };
}
