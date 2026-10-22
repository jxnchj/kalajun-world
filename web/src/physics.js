// Collision world of the walker (character.js): everything solid near it as a simple shape with
// its real height, so that the walker is stopped by what stands higher than a step, steps up onto
// low rocks, logs and stumps, can jump onto what it can reach, and pushes slowly into thickets.
//
// Shape kinds (heights absolute; y0 = the foot of the thing):
//   cyl   x z r y0 top               upright cylinder: trunks, stumps, snags, cans, yurts
//   box   x z rot hw hd y0 top [top1] oriented box (local x = (cos rot, -sin rot), the frame of
//                                    slice.js mat()); top1: the top rises linearly from -hw to
//                                    +hw (boardwalk runs)
//   dome  x z rot rx rz y0 h          boulder: a flattened elliptic dome
//   log   x0 z0 y0 x1 z1 y1 r0 r1     lying trunk: tapered cylinder, centre-line heights y0..y1
//   wall  x0 z0 x1 z1 r y0 top        thin upright wall / capsule: fences, rails, ropes, animals
//   grid  x y z rot sx sy sz g bb     a building as modelled (buildgrid.js): the vertical spans of its
//                                    solid over 10 cm cells, in its own frame (placed at x y z, turned
//                                    by rot, scaled by sx sy sz); bb its world bounds
//   bush  x z r core y0 top [slow]    thicket: slows the walker inside r (by up to slow, default
//                                    0.6, at the core), blocks inside core
// Optional per shape: step (how high a thing can be stepped over or onto, default STEP), noStand
// (never stood on: rails, ropes, cans).

import { cellSpans } from "./buildgrid.js";

export const STEP = 0.36;      // what the walker steps up onto without climbing (a child)
const AIR_STEP = 0.15;         // in the air: what it still gets a foot onto
const FOOT = 0.1;              // foot radius, for standing on things
const PROF = 2.5;              // boulder profile exponent (2 = ellipsoid, higher = flatter top)
const HEAD = 1.35;             // things whose foot is higher than this above the feet pass overhead
const BODY = 1.25;             // in a building: the walker's height that must be clear (under a lintel)

const domeK = (u) => (u <= 0 ? 1 : u >= 1 ? 0 : Math.pow(1 - Math.pow(u, PROF), 1 / PROF));

function bounds(s) {
  if (s.bb) return s.bb;
  switch (s.k) {
    case "cyl": case "bush": return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
    case "box": { const e = Math.hypot(s.hw, s.hd); return [s.x - e, s.z - e, s.x + e, s.z + e]; }
    case "dome": { const e = Math.max(s.rx, s.rz); return [s.x - e, s.z - e, s.x + e, s.z + e]; }
    case "log": { const e = Math.max(s.r0, s.r1); return [Math.min(s.x0, s.x1) - e, Math.min(s.z0, s.z1) - e, Math.max(s.x0, s.x1) + e, Math.max(s.z0, s.z1) + e]; }
    case "wall": return [Math.min(s.x0, s.x1) - s.r, Math.min(s.z0, s.z1) - s.r, Math.max(s.x0, s.x1) + s.r, Math.max(s.z0, s.z1) + s.r];
  }
  return [s.x, s.z, s.x, s.z];
}

// shapes binned on a square grid; a query returns each shape once
export class ShapeGrid {
  constructor(cell = 8) { this.B = cell; this.map = new Map(); this.n = 0; }
  clear() { this.map.clear(); this.n = 0; }
  add(s) {
    const [x0, z0, x1, z1] = bounds(s), B = this.B;
    for (let i = Math.floor(x0 / B); i <= Math.floor(x1 / B); i++)
      for (let j = Math.floor(z0 / B); j <= Math.floor(z1 / B); j++) {
        const k = i * 131072 + j;
        const l = this.map.get(k);
        if (l) l.push(s); else this.map.set(k, [s]);
      }
    this.n++;
    return s;
  }
  query(x, z, r, out, stamp) {
    const B = this.B;
    for (let i = Math.floor((x - r) / B); i <= Math.floor((x + r) / B); i++)
      for (let j = Math.floor((z - r) / B); j <= Math.floor((z + r) / B); j++) {
        const l = this.map.get(i * 131072 + j);
        if (l) for (const s of l) if (s._q !== stamp) { s._q = stamp; out.push(s); }
      }
    return out;
  }
}

// closest point of segment a-b to p: parameter t, distance, direction from the segment to p
function segClosest(x0, z0, x1, z1, px, pz) {
  const ex = x1 - x0, ez = z1 - z0;
  const t = Math.max(0, Math.min(1, ((px - x0) * ex + (pz - z0) * ez) / (ex * ex + ez * ez + 1e-9)));
  const dx = px - (x0 + ex * t), dz = pz - (z0 + ez * t), d = Math.hypot(dx, dz);
  return { t, d, nx: d > 1e-6 ? dx / d : -ez, nz: d > 1e-6 ? dz / d : ex };
}

function boxTop(s, lx) {
  return s.top1 === undefined ? s.top : s.top + (s.top1 - s.top) * Math.min(1, Math.max(0, (lx / s.hw + 1) / 2));
}

// the walker's point in a grid shape's frame
function gridLocal(s, x, z) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
  return [(dx * c - dz * sn) / s.sx, (dx * sn + dz * c) / s.sz];
}
// is the cell at local (x, z) solid anywhere between local heights a and b
function gridSolid(G, x, z, a, b) {
  let hit = false;
  cellSpans(G, x, z, (lo, hi) => { if (lo < b && hi > a) hit = true; });
  return hit;
}
// does the cell stop a walker with its feet at f (local heights): anything between the feet and
// the top of its body, except a step -- solid from about the feet up to no higher than s (a
// stair, the porch deck, a threshold). A slab with air under it (a table top) is no step.
const STEP_FOOT = 0.12;
function gridBlocks(G, x, z, f, s, top, k) {
  const c = gridCell(G, x, z);
  if (c < 0) return false;
  const o = c * G.K * 2;
  for (let i = 0; i < G.count[c]; i++) {
    const lo = G.spans[o + i * 2], hi = G.spans[o + i * 2 + 1];
    if (lo >= top || hi <= f + 0.05 * k) continue;
    if (hi <= s && based(G, c, lo, f, k)) continue;
    return true;
  }
  return false;
}
// the cell under local (x, z), -1 off the grid
function gridCell(G, x, z) {
  const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell);
  return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? -1 : j * G.nx + i;
}
// does a span from lo stand on something: solid from about the feet, or with another span just
// under it -- a step modelled as a hollow box (a stone block) is its tread over its own base, a
// table top has open air under it
const STEP_GAP = 0.2;
function based(G, c, lo, f, k) {
  if (lo <= f + STEP_FOOT * k) return true;
  const o = c * G.K * 2;
  for (let i = 0; i < G.count[c]; i++) {
    const h = G.spans[o + i * 2 + 1];
    if (h < lo && h >= lo - STEP_GAP * k) return true;
  }
  return false;
}

// a building as a walkable, solid thing: in its own frame
export function gridShape(G, x, y, z, rot, sx, sy = sx, sz = sx) {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const xs = [], zs = [];
  for (const lx of [G.x0, G.x0 + G.nx * G.cell])
    for (const lz of [G.z0, G.z0 + G.nz * G.cell]) { xs.push(x + lx * sx * c + lz * sz * sn); zs.push(z - lx * sx * sn + lz * sz * c); }
  return { k: "grid", g: G, x, y, z, rot, sx, sy, sz, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
}

export class Collision {
  constructor() {
    this.statics = new ShapeGrid(8);
    this.providers = [];      // (x, z, r, out, stamp) => void: live things (forest, floor, shrubs, animals)
    this.stamp = 0;
    this.list = [];
  }

  addProvider(fn) { this.providers.push(fn); }

  near(x, z, r) {
    const out = this.list;
    out.length = 0;
    const st = ++this.stamp;
    this.statics.query(x, z, r, out, st);
    for (const p of this.providers) p(x, z, r, out, st);
    return out;
  }

  // push the body (a circle of radius R round p, feet at p.y) out of everything standing higher
  // than it can step onto; returns how much thickets slow it here (0..1)
  resolve(p, R, grounded, list = this.list) {
    let thick = 0, hitMv = 0;
    this.hit = null;          // what stopped the walker most (character.js: leaning into it)
    const feet = p.y;
    for (let pass = 0; pass < 3; pass++)
      for (const s of list) {
        if (s.y0 > feet + HEAD) continue;                          // overhead
        const L = feet + (grounded ? (s.step ?? STEP) : Math.min(s.step ?? STEP, AIR_STEP));
        const bx = p.x, bz = p.z;
        switch (s.k) {
          case "cyl": {
            if (L >= s.top) break;
            const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), m = s.r + R;
            if (d < m) { const k = d > 1e-6 ? (m - d) / d : 0; p.x += dx * k; p.z += dz * k; }
            break;
          }
          case "box": {
            if (L >= Math.max(s.top, s.top1 ?? -Infinity)) break;
            const c = Math.cos(s.rot), sn = Math.sin(s.rot);
            const dx = p.x - s.x, dz = p.z - s.z;
            const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
            if (L >= boxTop(s, lx)) break;
            const ox = Math.abs(lx) - s.hw, oz = Math.abs(lz) - s.hd;
            let px = 0, pz = 0;
            if (ox > 0 || oz > 0) {                                   // outside: from the nearest point
              const qx = Math.max(ox, 0) * Math.sign(lx), qz = Math.max(oz, 0) * Math.sign(lz);
              const d = Math.hypot(qx, qz);
              if (d >= R) break;
              px = (qx / d) * (R - d); pz = (qz / d) * (R - d);
            } else if (ox > oz) px = Math.sign(lx) * (R - ox); else pz = Math.sign(lz) * (R - oz);
            p.x += px * c + pz * sn; p.z += -px * sn + pz * c;
            break;
          }
          case "dome": {
            const k = domeK((L - s.y0) / s.h);
            if (k <= 0) break;
            const c = Math.cos(s.rot), sn = Math.sin(s.rot);
            const dx = p.x - s.x, dz = p.z - s.z;
            const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
            const a = s.rx * k + R, b = s.rz * k + R;
            const q = Math.hypot(lx / a, lz / b);
            if (q >= 1) break;
            if (q < 1e-6) { p.x += a; break; }
            const mx = lx / q - lx, mz = lz / q - lz;                 // out to the rim, radially
            p.x += mx * c + mz * sn; p.z += -mx * sn + mz * c;
            break;
          }
          case "log": {
            const g = segClosest(s.x0, s.z0, s.x1, s.z1, p.x, p.z);
            const yc = s.y0 + (s.y1 - s.y0) * g.t, r = s.r0 + (s.r1 - s.r0) * g.t;
            if (L >= yc + r) break;
            const w = L <= yc ? r : Math.sqrt(r * r - (L - yc) * (L - yc));
            if (g.d < w + R) { p.x += g.nx * (w + R - g.d); p.z += g.nz * (w + R - g.d); }
            break;
          }
          case "wall": {
            if (L >= s.top) break;
            const g = segClosest(s.x0, s.z0, s.x1, s.z1, p.x, p.z);
            if (g.d < s.r + R) { p.x += g.nx * (s.r + R - g.d); p.z += g.nz * (s.r + R - g.d); }
            break;
          }
          case "grid": {
            // push out of the nearest solid cell (the cells taken as squares), a few times over
            const G = s.g, c = Math.cos(s.rot), sn = Math.sin(s.rot), h = G.cell;
            const fl = (feet - s.y) / s.sy, a = (L - s.y) / s.sy, b = (feet + BODY - s.y) / s.sy, k = 1 / s.sy;
            const ni = Math.ceil(R / (s.sx * h)) + 1, nj = Math.ceil(R / (s.sz * h)) + 1;
            for (let it = 0; it < 4; it++) {
              const [lx, lz] = gridLocal(s, p.x, p.z);
              let best = R, bx = 0, bz = 0;
              const ci = Math.floor((lx - G.x0) / h), cj = Math.floor((lz - G.z0) / h);
              for (let j = cj - nj; j <= cj + nj; j++)
                for (let i = ci - ni; i <= ci + ni; i++) {
                  const qx = G.x0 + (i + 0.5) * h, qz = G.z0 + (j + 0.5) * h;
                  // from the cell's nearest point to the walker, in metres
                  let ex = Math.max(Math.abs(lx - qx) - h / 2, 0) * Math.sign(lx - qx) * s.sx;
                  let ez = Math.max(Math.abs(lz - qz) - h / 2, 0) * Math.sign(lz - qz) * s.sz;
                  let d = Math.hypot(ex, ez);
                  if (d >= best || !gridBlocks(G, qx, qz, fl, a, b, k)) continue;
                  best = d;
                  if (d < 1e-6) { ex = (lx - qx) * s.sx; ez = (lz - qz) * s.sz; d = Math.hypot(ex, ez) || 1; }
                  bx = ex / d; bz = ez / d;
                }
              if (best >= R) break;
              const m = R - best + 0.002;
              p.x += (bx * c + bz * sn) * m; p.z += (-bx * sn + bz * c) * m;
            }
            break;
          }
          case "bush": {
            if (feet > s.top - 0.25) break;                             // (standing above it)
            const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
            if (pass === 0 && d < s.r + R * 0.5) thick = Math.max(thick, (s.slow ?? 0.6) * Math.min(1, (s.r + R * 0.5 - d) / Math.max(0.2, s.r + R * 0.5 - s.core)));
            const m = s.core + R;
            if (s.core > 0 && d < m) { const k = d > 1e-6 ? (m - d) / d : 0; p.x += dx * k; p.z += dz * k; }
            break;
          }
        }
        if (pass === 0) { const mv = Math.hypot(p.x - bx, p.z - bz); if (mv > hitMv) { hitMv = mv; this.hit = s; } }
      }
    return thick;
  }

  // highest surface under the feet at (x, z) no higher than maxY (-Infinity: none); feet: where
  // the feet are now (a building's step must rise from about there)
  support(x, z, maxY, list = this.list, feet = maxY - STEP) {
    let best = -Infinity;
    for (const s of list) {
      if (s.noStand) continue;
      let t = -Infinity;
      switch (s.k) {
        case "cyl": if (Math.hypot(x - s.x, z - s.z) <= s.r + FOOT) t = s.top; break;
        case "box": {
          const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
          const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
          if (Math.abs(lx) <= s.hw + FOOT && Math.abs(lz) <= s.hd + FOOT) t = boxTop(s, lx);
          break;
        }
        case "dome": {
          const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
          const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
          const q = Math.hypot(lx / (s.rx + FOOT), lz / (s.rz + FOOT));
          if (q < 1) t = s.y0 + s.h * Math.pow(1 - Math.pow(q, PROF), 1 / PROF);
          break;
        }
        case "log": {
          const g = segClosest(s.x0, s.z0, s.x1, s.z1, x, z);
          const r = s.r0 + (s.r1 - s.r0) * g.t, d = Math.max(0, g.d - FOOT);
          if (d < r) t = s.y0 + (s.y1 - s.y0) * g.t + Math.sqrt(r * r - d * d);
          break;
        }
        case "grid": {   // the highest step within reach under the foot (its centre and four points round it)
          const [lx, lz] = gridLocal(s, x, z), top = (maxY - s.y) / s.sy, fx = FOOT / s.sx, fz = FOOT / s.sz;
          const fl = (feet - s.y) / s.sy, k = 1 / s.sy;
          let tt = -Infinity;
          for (const [ox, oz] of [[0, 0], [fx, 0], [-fx, 0], [0, fz], [0, -fz]]) {
            const c = gridCell(s.g, lx + ox, lz + oz);
            if (c >= 0) cellSpans(s.g, lx + ox, lz + oz, (lo, hi) => { if (hi <= top && hi > tt && (hi <= fl + 0.05 * k || based(s.g, c, lo, fl, k))) tt = hi; });
          }
          if (tt > -Infinity) t = s.y + tt * s.sy;
          break;
        }
      }
      if (t <= maxY && t > best) best = t;
    }
    return best;
  }

  // is (x, z) taken by a building at ground level (its floor, porch, steps): no plants there
  occupied(x, z) {
    const B = this.statics.B, l = this.statics.map.get(Math.floor(x / B) * 131072 + Math.floor(z / B));
    if (!l) return false;
    for (const s of l) {
      if (s.k !== "grid") continue;
      const [lx, lz] = gridLocal(s, x, z);
      if (gridSolid(s.g, lx, lz, -1.3, 0.6)) return true;   // (the floor down to the lowest step: not under the eaves)
    }
    return false;
  }

  // how far the walker at (x, feet y, z) is indoors (0..1): a roof over its head and walls round
  // about at chest height (eight directions out to 7 m) -- under a porch roof it is still outdoors
  indoorAt(x, y, z, list = this.list) {
    for (const s of list) {
      if (s.k !== "grid") continue;
      const [lx, lz] = gridLocal(s, x, z), f = (y - s.y) / s.sy;
      if (!gridSolid(s.g, lx, lz, f + 1.5 / s.sy, f + 9 / s.sy)) continue;     // no roof
      let walls = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        for (let r = 0.3; r <= 7.0; r += 0.15) {
          const [qx, qz] = gridLocal(s, x + dx * r, z + dz * r);
          if (gridSolid(s.g, qx, qz, f + 0.9 / s.sy, f + 1.1 / s.sy)) { walls++; break; }
        }
      }
      return Math.min(1, Math.max(0, (walls / 8 - 0.45) / 0.4));
    }
    return 0;
  }

  // is anything solid at (x, z) between heights y0 and y1 (no margin: a ledge to sit on, character.js)
  solidAt(x, y0, y1, z, list = this.list) {
    for (const s of list) {
      switch (s.k) {
        case "grid": {
          const [lx, lz] = gridLocal(s, x, z);
          if (gridSolid(s.g, lx, lz, (y0 - s.y) / s.sy, (y1 - s.y) / s.sy)) return true;
          break;
        }
        case "box": {
          const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
          const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
          if (Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd && y0 < boxTop(s, lx) && y1 > s.y0) return true;
          break;
        }
        case "cyl":
          if (Math.hypot(x - s.x, z - s.z) < s.r && y0 < s.top && y1 > s.y0) return true;
          break;
      }
    }
    return false;
  }

  // is the point inside something solid (for the camera)
  inside(q, list) {
    for (const s of list) {
      switch (s.k) {
        case "cyl":
          if (s.r > 0.15 && q.y < s.top + 0.2 && q.y > s.y0 - 0.5 && Math.hypot(q.x - s.x, q.z - s.z) < s.r + 0.2) return true;
          break;
        case "box": {
          if (q.y > Math.max(s.top, s.top1 ?? -Infinity) + 0.3 || s.hw < 0.3) break;
          const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = q.x - s.x, dz = q.z - s.z;
          if (Math.abs(dx * c - dz * sn) < s.hw + 0.25 && Math.abs(dx * sn + dz * c) < s.hd + 0.25 && q.y < boxTop(s, dx * c - dz * sn) + 0.3) return true;
          break;
        }
        case "dome": {
          const c = Math.cos(s.rot), sn = Math.sin(s.rot), dx = q.x - s.x, dz = q.z - s.z;
          const qq = Math.hypot((dx * c - dz * sn) / (s.rx + 0.15), (dx * sn + dz * c) / (s.rz + 0.15));
          if (qq < 1 && q.y < s.y0 + (s.h + 0.15) * domeK(qq)) return true;
          break;
        }
        case "log": {
          const g = segClosest(s.x0, s.z0, s.x1, s.z1, q.x, q.z);
          const r = s.r0 + (s.r1 - s.r0) * g.t + 0.12;
          if (g.d < r && Math.abs(q.y - (s.y0 + (s.y1 - s.y0) * g.t)) < r) return true;
          break;
        }
        case "grid": {   // the camera keeps 12 cm off walls, floors and roofs
          const [lx, lz] = gridLocal(s, q.x, q.z), y = (q.y - s.y) / s.sy, mx = 0.12 / s.sx, mz = 0.12 / s.sz, my = 0.12 / s.sy;
          for (const [ox, oz] of [[0, 0], [mx, 0], [-mx, 0], [0, mz], [0, -mz]])
            if (gridSolid(s.g, lx + ox, lz + oz, y - my, y + my)) return true;
          break;
        }
      }
    }
    return false;
  }
}
