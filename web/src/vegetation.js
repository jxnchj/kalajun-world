import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, LANDCOVER_GLSL, LOD_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { loadAsset } from "./assets.js";
import { windQ, windLeanAt, dirAt, turbAt } from "./windfield.js";

// Near-range meadow flora of Kalajun (July): 13 species, each with its own procedural
// plant structure, painted atlas parts (tools/paint_vegetation.py) and colour palette.
// Where each species grows comes from the baked habitat map (tools/veg_map.py), so the
// meadow is a mosaic driven by moisture, sun exposure, forest edges and the camps.
// Placement runs on the CPU in world-stable cells (rebuilt as the camera moves); drawing
// is one instanced draw per species; wind bending is done in the vertex shader.
//
// Geometry attributes: aPart 0 stem (solid), 1 leaf (atlas), 2 petal (atlas luminance x
// palette colour), 3 painted sprite (atlas colour x light tint), 4 disc (atlas as is);
// aHead 0..3 lets flower heads vary in colour and be hidden per instance.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

class Builder {
  constructor(rects, headScale = 1, heads = {}) { this.hs = headScale; this.r = rects; this.heads = heads; this.p = []; this.uv = []; this.part = []; this.head = []; this.swap = []; this.swapOn = 0; this.alt = []; this.altOn = 0; this.idx = []; }
  headR(slot) { return this.heads[slot]?.r ?? 0.42; }
  // s across 0..1, t along 0 (base, bottom of the slot) .. 1 (tip, top of the slot)
  uv_(slot, s, t) {
    if (!slot) return [0, 0];
    const [u0, v0, u1, v1] = this.r[slot];
    const e = 0.004;
    return [u0 + e + (u1 - u0 - 2 * e) * s, v1 - e - (v1 - v0 - 2 * e) * t];
  }
  grid(P, S, T, slot, part, head) {
    const rows = P.length, cols = P[0].length, o = this.part.length;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const q = P[i][j];
        this.p.push(q.x, q.y, q.z);
        this.uv.push(...this.uv_(slot, S[i][j], T[i][j]));
        this.part.push(part); this.head.push(head); this.swap.push(this.swapOn); this.alt.push(this.altOn);
      }
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < cols - 1; j++) {
        const a = o + i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
        this.idx.push(a, b, c, a, c, d);
      }
  }
  quad(c, ax, ay, slot, part, head) {  // centred quad spanning c +- ax, c +- ay; t along +ay
    const P = [[c.clone().sub(ax).sub(ay), c.clone().add(ax).sub(ay)], [c.clone().sub(ax).add(ay), c.clone().add(ax).add(ay)]];
    this.grid(P, [[0, 1], [0, 1]], [[0, 0], [1, 1]], slot, part, head);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute("aHead", new THREE.Float32BufferAttribute(this.head, 1));
    g.setAttribute("aSwap", new THREE.Float32BufferAttribute(this.swap, 1));
    g.setAttribute("aAlt", new THREE.Float32BufferAttribute(this.alt, 1));
    g.setIndex(this.idx);
    return g;
  }
}

function frame(n) {
  n = n.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? UP : V3(1, 0, 0)).normalize();
  return [n, t1, new THREE.Vector3().crossVectors(n, t1)];
}

// ---------------------------------------------------------------- parts
function stem(b, a, c, e, r, head, segs = 5) {
  const P = [], S = [], T = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(e.clone().multiplyScalar(t * t));
    const row = [];
    for (let j = 0; j <= 3; j++) {
      const ang = (j / 3) * Math.PI * 2;
      row.push(V3(p.x + Math.cos(ang) * r, p.y, p.z + Math.sin(ang) * r));
    }
    P.push(row); S.push([0, 0, 0, 0]); T.push([0, 0, 0, 0]);
  }
  b.grid(P, S, T, null, 0, head);
}

// radial petals around c facing n; cup >0 raises petal tips, droop <0
function rayHead(b, c, n, R, head, o) {
  R *= b.hs;  // stylised: flower heads a bit larger than life, as in the reference paintings
  const [nn, t1, t2] = frame(n);
  const count = o.count, w = o.width ?? 0.42;
  for (let k = 0; k < count; k++) {
    const a = (o.rot || 0) + (k / count) * Math.PI * 2 + (o.jitter ? Math.sin(k * 7.3) * o.jitter : 0);
    const dir = t1.clone().multiplyScalar(Math.cos(a)).add(t2.clone().multiplyScalar(Math.sin(a)));
    const side = new THREE.Vector3().crossVectors(nn, dir);
    const P = [], S = [], T = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const lift = (o.cup || 0) * t * t;
      const row = [], srow = [], trow = [];
      for (let j = 0; j <= 2; j++) {
        const s = j / 2 - 0.5;
        row.push(c.clone().addScaledVector(dir, R * ((o.inner ?? 0.15) + (1 - (o.inner ?? 0.15)) * t) * Math.cos(lift))
          .addScaledVector(side, s * R * w * 2).addScaledVector(nn, R * Math.sin(lift) - Math.abs(s) * 0.05 * R * (o.fold ?? 1)));
        srow.push(s + 0.5); trow.push(t);
      }
      P.push(row); S.push(srow); T.push(trow);
    }
    b.grid(P, S, T, o.slot, o.part ?? 2, head);
  }
  if (o.disc) {  // domed disc
    const cr = R * o.disc, P = [], S = [], T = [];
    for (let i = 0; i <= 2; i++) {
      const rr = cr * (1 - i / 2), hgt = 0.35 * cr * Math.sin((i / 2) * Math.PI * 0.5);
      const row = [], srow = [], trow = [];
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        row.push(c.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr).addScaledVector(nn, hgt + 0.002));
        srow.push(0.5 + 0.5 * Math.cos(a) * (1 - i / 2)); trow.push(0.5 + 0.5 * Math.sin(a) * (1 - i / 2));
      }
      P.push(row); S.push(srow); T.push(trow);
    }
    b.grid(P, S, T, "disc", 4, head);
  }
}

// Painted flower head (second texture batch, top views): the painting is cut petal by petal
// onto petals that curl up individually (curl rate `cup`, random `tilt` per petal), so the head
// has depth while each petal keeps its painted colour, veins and outline (alpha). The painting's
// first petal points to the top of its slot; petals = 0 gives one domed disc (umbels, clusters,
// flower balls). alt: the head may use the painting in the next slot (colour variant).
function paintedHead3D(b, c, n, R, slot, head, o = {}) {
  R *= b.hs;
  const [nn, t1, t2] = frame(n);
  const rI = b.headR(slot);
  const np = o.petals ?? 0;
  const rnd = (k) => { const x = Math.sin((o.seed ?? 0) * 91.7 + head * 17.3 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const spin = rnd(99) * Math.PI * 2;
  b.altOn = o.alt ? 1 : 0;
  for (let k = 0; k < (np || 1); k++) {
    const a0 = np ? (k - 0.5) * 2 * Math.PI / np : 0, a1 = np ? (k + 0.5) * 2 * Math.PI / np : 2 * Math.PI;
    const phi = (o.cup ?? 0.3) * (0.8 + 0.4 * rnd(k)) + (rnd(k + 50) - 0.5) * (o.tilt ?? 0.3);
    const cols = np ? 4 : 24, rows = np ? 4 : 5;
    const P = [], S = [], T = [];
    for (let i = 0; i <= rows; i++) {
      const r = 0.02 + (0.98 * i) / rows;
      const horiz = Math.abs(phi) < 1e-3 ? r : Math.sin(phi * r) / phi;
      const vert = (Math.abs(phi) < 1e-3 ? 0 : (1 - Math.cos(phi * r)) / phi) + (o.dome ?? 0) * (1 - r * r);
      const row = [], srow = [], trow = [];
      for (let j = 0; j <= cols; j++) {
        const a = a0 + ((a1 - a0) * j) / cols;
        const dir = t2.clone().multiplyScalar(Math.cos(a + spin)).addScaledVector(t1, Math.sin(a + spin));
        row.push(c.clone().addScaledVector(dir, R * horiz).addScaledVector(nn, R * vert));
        srow.push(0.5 + rI * r * Math.sin(a)); trow.push(0.5 + rI * r * Math.cos(a));
      }
      P.push(row); S.push(srow); T.push(trow);
    }
    b.grid(P, S, T, slot, 3, head);
  }
  b.altOn = 0;
}

// top-view leaf painting (second batch) at the end of a petiole: centre at base + dist along
// yaw, lifted by `lift`, tilted up by `tilt` (0 = lying flat), its top pointing outward
function flatLeaf(b, base, yaw, dist, lift, size, tilt, slot, head = 0) {
  const d = V3(Math.cos(yaw), 0, Math.sin(yaw));
  const side = V3(-Math.sin(yaw), 0, Math.cos(yaw));
  const up = d.clone().multiplyScalar(Math.cos(tilt)).add(V3(0, Math.sin(tilt), 0));
  const c = base.clone().addScaledVector(d, dist).add(V3(0, lift, 0));
  if (dist > 0 || lift > 0.02) stem(b, base, base.clone().addScaledVector(d, dist * 0.3).add(V3(0, lift * 0.9, 0)), c, 0.0025, head, 3);
  b.quad(c, side.multiplyScalar(size / 2), up.multiplyScalar(size / 2), slot, 1, head);
}

// flat sprite facing n (top-view flowers), `up` hint orients the sprite
function spriteFacing(b, c, n, size, slot, head, part = 3) {
  if (part !== 1) size *= b.hs;
  const [, t1, t2] = frame(n);
  b.quad(c, t1.clone().multiplyScalar(size), t2.clone().multiplyScalar(size), slot, part, head);
}

// two crossed vertical sprites (side-view heads: clover, bells, puffs), base at c
function spriteCross(b, c, w, h, slot, head, yaw = 0, part = 3, hang = false) {
  w *= b.hs; h *= b.hs;
  for (let k = 0; k < 2; k++) {
    const a = yaw + (k * Math.PI) / 2;
    const ax = V3(Math.cos(a) * w, 0, Math.sin(a) * w);
    const ay = V3(0, (hang ? -h : h) / 2, 0);
    const cc = c.clone().add(ay);
    if (hang) {  // hanging sprites: tip (t=1) at the attachment point, open end downwards
      const P = [[cc.clone().sub(ax).add(ay), cc.clone().add(ax).add(ay)], [cc.clone().sub(ax).sub(ay), cc.clone().add(ax).sub(ay)]];
      b.grid(P, [[0, 1], [0, 1]], [[0, 0], [1, 1]], slot, part, head);
    } else b.quad(cc, ax, ay, slot, part, head);
  }
}

function leaf(b, base, yaw, len, tilt, slot, width = 0.5, head = 0) {
  const d = V3(Math.cos(yaw), 0, Math.sin(yaw));
  const up = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(d, Math.sin(tilt));
  const side = new THREE.Vector3().crossVectors(up, d).normalize().multiplyScalar(len * width);
  const mid = base.clone().addScaledVector(up, len * 0.5);
  // slight arch: bend the tip back down
  const P = [], S = [], T = [];
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    const p = base.clone().addScaledVector(up, len * t).addScaledVector(d, len * 0.18 * t * t).add(V3(0, -len * 0.12 * t * t, 0));
    P.push([p.clone().sub(side), p.clone().add(side)]); S.push([0, 1]); T.push([t, t]);
  }
  void mid;
  b.grid(P, S, T, slot, 1, head);
}

function rosette(b, n, len, tilt, slot, width = 0.5, y = 0.01) {
  for (let k = 0; k < n; k++) leaf(b, V3(0, y, 0), (k / n) * Math.PI * 2 + Math.sin(k * 3.7) * 0.3, len * (0.8 + 0.4 * ((k * 0.618) % 1)), tilt, slot, width);
}

// ---------------------------------------------------------------- method 1 (AI-painted sprites)
// painted flower head on a cupped disc facing n; polar UVs into the head slot
function paintedHead(b, c, n, R, slot, head, cup = 0.25) {
  const [nn, t1, t2] = frame(n);
  const P = [], S = [], T = [];
  for (let i = 0; i <= 4; i++) {
    const r = i / 4, row = [], srow = [], trow = [];
    for (let j = 0; j <= 16; j++) {
      const a = (j / 16) * Math.PI * 2;
      row.push(c.clone().addScaledVector(t1, Math.cos(a) * r * R).addScaledVector(t2, Math.sin(a) * r * R).addScaledVector(nn, cup * R * r * r));
      srow.push(0.5 + 0.5 * r * Math.cos(a)); trow.push(0.5 + 0.5 * r * Math.sin(a));
    }
    P.push(row); S.push(srow); T.push(trow);
  }
  b.swapOn = 1;
  b.grid(P, S, T, slot, 3, head);
  b.swapOn = 0;
}

export function cosmosPainted(b) {
  const heads = [[V3(0, 1, 0), V3(0.02, 0.55, 0.01), V3(0.25, 1, 0.15), 0.1], [V3(0.17, 0.86, 0.08), V3(0.07, 0.6, 0.03), V3(0.7, 1, 0.3), 0.09],
    [V3(-0.13, 0.76, -0.11), V3(-0.05, 0.5, -0.04), V3(-0.6, 1, -0.5), 0.085]];
  heads.forEach(([p, c, n, r], i) => {
    stem(b, i === 0 ? V3(0, 0, 0) : V3(0, 0.35 + i * 0.04, 0), c, p, 0.0035, i);
    paintedHead(b, p.clone().addScaledVector(n.clone().normalize(), 0.004), n, r, "head_pink", i, 0.28);
  });
  // bud on a side shoot (the sprite includes its own stem)
  stem(b, V3(0, 0.4, 0), V3(0.02, 0.5, -0.08), V3(0.05, 0.56, -0.16), 0.0025, 3);
  spriteCross(b, V3(0.05, 0.53, -0.16), 0.045, 0.09, "bud", 3, 0.4);
  for (const [y, yaw, len, tilt] of [[0.05, 0.3, 0.34, 0.75], [0.07, 2.4, 0.32, 0.8], [0.09, 4.3, 0.33, 0.7], [0.3, 1.2, 0.26, 0.7], [0.33, 3.6, 0.26, 0.75], [0.52, 5.0, 0.2, 0.6]])
    leaf(b, V3(0, y, 0), yaw, len, tilt, "sprig", 0.42);
}

export function cosmosBillboard(b) { spriteCross(b, V3(0, 0, 0), 0.5, 1.0, "plant", 0, 0.3, 3); }

export function grassPainted(b) {
  spriteCross(b, V3(0, 0, 0), 0.3, 0.55, "grass", 0, 0.0, 3);
  spriteCross(b, V3(0, 0, 0), 0.3, 0.55, "grass", 0, 0.8, 3);
}

// ---------------------------------------------------------------- species
// Plants are built at unit height (~1) and scaled per instance by `height`.
// build(b, v): v = posture variant (0 upright with more flowers, 1 leaning with fewer flowers and
// a bud) -- each placed plant draws one of `variants` by hash, then random height, yaw and wind.
const SPECIES = [
  {
    name: "cosmos", map: [0, 0], headScale: 1.3, cell: 0.5, radius: 14, maxDens: 1.4, height: [0.75, 1.2], hide: 0.35, variants: 2,
    palette: [[0.8, 0.14, 0.5], [0.95, 0.52, 0.74], [0.82, 0.8, 0.78], [0.72, 0.46, 0.88], [0.62, 0.08, 0.34], [0.97, 0.7, 0.82]],
    build(b, v = 0) {
      const heads = v === 0
        ? [[V3(0, 1, 0), V3(0.02, 0.55, 0.01), V3(0.25, 1, 0.15), 0.066], [V3(0.17, 0.86, 0.08), V3(0.07, 0.6, 0.03), V3(0.7, 1, 0.3), 0.058],
          [V3(-0.13, 0.76, -0.11), V3(-0.05, 0.5, -0.04), V3(-0.6, 1, -0.5), 0.052], [V3(0.05, 0.62, -0.16), V3(0.02, 0.45, -0.06), V3(0.2, 1, -0.8), 0.022]]
        : [[V3(0.2, 0.93, 0.06), V3(0.05, 0.55, 0.02), V3(0.8, 1, 0.3), 0.064], [V3(-0.1, 0.7, 0.12), V3(-0.03, 0.45, 0.05), V3(-0.5, 1, 0.6), 0.055],
          [V3(0.1, 0.58, -0.14), V3(0.03, 0.42, -0.06), V3(0.3, 1, -0.7), 0.022]];
      heads.forEach(([p, c, n, r], i) => {
        stem(b, i === 0 ? V3(0, 0, 0) : V3(0, 0.35 + i * 0.04, 0), c, p, 0.0035, i);
        if (r > 0.03) rayHead(b, p, n, r, i, { count: 8, slot: "cosmos_petal", cup: 0.22, disc: 0.22, rot: i * 0.7 });
        else spriteFacing(b, p, n, 0.022, "bud", i);  // a bud
      });
      for (const [y, yaw, len, tilt] of [[0.08, 0.3, 0.26, 0.9], [0.1, 2.4, 0.24, 0.95], [0.12, 4.3, 0.25, 0.9], [0.32, 1.2, 0.2, 0.8], [0.34, 3.6, 0.2, 0.85], [0.55, 5.0, 0.15, 0.7]])
        leaf(b, V3(0, y, 0), yaw + v, len, tilt, "leaf_cosmos", 0.45);
    },
  },
  {
    name: "daisy", map: [0, 1], headScale: 1.15, cell: 0.32, radius: 14, maxDens: 1.6, height: [0.35, 0.6], hide: 0.35, variants: 2,
    palette: [[1, 1, 1], [1.0, 0.98, 0.94]],
    build(b, v = 0) {
      const heads = v === 0
        ? [[V3(0, 1, 0), V3(0.03, 0.5, 0), V3(0.15, 1, 0.05), 0.05], [V3(0.12, 0.82, 0.07), V3(0.05, 0.4, 0.02), V3(0.5, 1, 0.3), 0.044],
          [V3(-0.14, 0.9, -0.06), V3(-0.05, 0.45, -0.02), V3(-0.4, 1, -0.2), 0.047], [V3(0.03, 0.72, -0.15), V3(0.01, 0.38, -0.05), V3(0.1, 1, -0.5), 0.04]]
        : [[V3(0.2, 0.92, 0.05), V3(0.03, 0.55, 0), V3(0.7, 1, 0.2), 0.05], [V3(-0.09, 0.66, 0.1), V3(-0.03, 0.35, 0.04), V3(-0.3, 1, 0.5), 0.042]];
      heads.forEach(([p, c, n, r], i) => {
        stem(b, V3(0, 0, 0), c, p, 0.003, i);
        paintedHead3D(b, p, n, r, v === 1 && i === 1 ? "head_H07" : "head_C07", i, { petals: 20, cup: 0.45, tilt: 0.5, seed: v });   // v1: one fading head
      });
      if (v === 1) { stem(b, V3(0, 0, 0), V3(0.02, 0.4, -0.05), V3(0.05, 0.55, -0.12), 0.0025, 3); spriteFacing(b, V3(0.05, 0.55, -0.12), V3(0.2, 1, -0.4), 0.018, "bud", 3); }
      rosette(b, 6, 0.2, 1.2, "leaf_H01", 0.5);                          // spoon-shaped basal leaves
    },
  },
  {
    name: "poppy", map: [0, 2], headScale: 1.15, cell: 0.4, radius: 14, maxDens: 2.2, height: [0.3, 0.5], hide: 0.4, variants: 2,
    palette: [[1, 1, 1], [1.0, 0.97, 0.92]], alt: { step: 0.125, p: 0.35 },   // C01 yellow, 35% C02 apricot
    build(b, v = 0) {
      const heads = v === 0
        ? [[V3(0, 1, 0), V3(0.06, 0.5, 0.02), V3(0.2, 1, 0.1), 0.07], [V3(-0.12, 0.8, 0.08), V3(-0.08, 0.4, 0.04), V3(-0.5, 1, 0.3), 0.06]]
        : [[V3(0.24, 0.86, 0.06), V3(0.05, 0.55, 0), V3(0.9, 0.7, 0.2), 0.068]];
      heads.forEach(([p, c, n, r], i) => {
        stem(b, V3(0, 0, 0), c, p, 0.004, i);
        paintedHead3D(b, p, n, r, "head_C01", i, { petals: 4, cup: 1.2, tilt: 0.4, alt: true, seed: v });
      });
      // a nodding bud on its own hairy stalk
      const bh = v === 0 ? 0.62 : 0.72;
      spriteCross(b, V3(v === 0 ? 0.06 : -0.06, 0, -0.04), bh / 2, bh, "bud_H04", 3, 0.6 + v, 3);
      rosette(b, 6, 0.2, 1.2, "leaf_dandelion", 0.3);
    },
  },
  {
    name: "globeflower", map: [0, 3], headScale: 1.25, cell: 0.6, radius: 14, maxDens: 1.8, height: [0.4, 0.65], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.0, 0.95, 0.88]],
    build(b, v = 0) {
      const heads = v === 0
        ? [[V3(0, 1, 0), V3(0.03, 0.5, 0), 0.075], [V3(0.14, 0.85, -0.05), V3(0.06, 0.45, 0), 0.065], [V3(-0.1, 0.72, 0.1), V3(-0.04, 0.4, 0.04), 0.06]]
        : [[V3(0.12, 0.95, 0.05), V3(0.03, 0.5, 0), 0.075], [V3(-0.08, 0.66, -0.1), V3(-0.03, 0.4, -0.04), 0.04]];
      heads.forEach(([p, c, r], i) => {
        stem(b, V3(0, 0, 0), c, p, 0.004, i);
        // the painting is a closed ball seen from the side (third batch C03): three crossed
        // sprites read as a ball from any direction; small heads are buds (H05, with a bit of stem)
        const bud = r < 0.05, w = bud ? r * 1.6 : r * 1.25;
        for (let q = 0; q < 3; q++) spriteCross(b, p.clone().add(V3(0, bud ? -w * 1.6 : -w * 0.9, 0)), w, bud ? w * 2.2 : w * 1.8, bud ? "bud_H05" : "head_C03", i, q * 1.047 + i, 3);
      });
      for (let k = 0; k < 4; k++) flatLeaf(b, V3(0, 0.02, 0), k * 1.6 + v, 0.1, 0.18 + (k % 2) * 0.12, 0.26, 0.35, "leaf_E03");
    },
  },
  {
    name: "forgetmenot", map: [1, 0], headScale: 1.1, cell: 0.35, radius: 14, maxDens: 2.5, height: [0.25, 0.42], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [0.95, 0.98, 1.05]],
    build(b, v = 0) {
      const tips = v === 0 ? 4 : 3;
      for (let i = 0; i < tips; i++) {
        const a = i * 1.7 + v, tip = V3(Math.cos(a) * 0.18, 0.85 + (i % 2) * 0.15 - v * 0.1, Math.sin(a) * 0.18);
        stem(b, V3(0, 0, 0), V3(Math.cos(a) * 0.05, 0.45, Math.sin(a) * 0.05), tip, 0.004, i);
        paintedHead3D(b, tip, V3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), 0.075, "head_C05", i, { dome: 0.25, cup: 0, seed: v });
      }
      rosette(b, 6, 0.2, 1.05, "leaf_H01", 0.5);
    },
  },
  {
    name: "geranium", map: [1, 1], headScale: 1.15, cell: 0.42, radius: 14, maxDens: 2.0, height: [0.35, 0.55], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.04, 0.92, 1.04], [0.92, 0.94, 1.05]],
    build(b, v = 0) {
      const heads = v === 0
        ? [[V3(0, 1, 0), V3(0.2, 1, 0.1)], [V3(0.15, 0.85, 0.1), V3(0.6, 1, 0.3)], [V3(-0.14, 0.9, -0.05), V3(-0.5, 1, -0.2)], [V3(0.02, 0.78, -0.15), V3(0.1, 1, -0.6)]]
        : [[V3(0.18, 0.9, 0.05), V3(0.7, 1, 0.2)], [V3(-0.1, 0.74, 0.1), V3(-0.4, 1, 0.5)], [V3(0.05, 0.66, -0.14), V3(0.2, 1, -0.6)]];
      heads.forEach(([p, n], i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.3, 0.5, p.z * 0.3), p, 0.003, i);
        paintedHead3D(b, p, n, 0.05, "head_C04", i, { petals: 5, cup: 0.45, tilt: 0.4, seed: v });
      });
      if (v === 1) spriteCross(b, V3(-0.05, 0, 0.06), 0.3, 0.6, "fruit_H06", 3, 2.2, 3);
      for (let k = 0; k < 6; k++) flatLeaf(b, V3(0, 0.02, 0), k * 1.05 + v * 0.5, 0.12 + (k % 2) * 0.06, 0.22 + (k % 3) * 0.1, 0.24, 0.3, "leaf_E03");
    },
  },
  {
    name: "delphinium", map: [1, 2], headScale: 1.05, cell: 0.8, radius: 14, maxDens: 2.2, height: [0.7, 1.15], hide: 0.0, variants: 2,
    palette: [[1, 1, 1], [1.15, 0.9, 1.0], [0.8, 0.9, 1.15]],
    build(b, v = 0) {
      const lean = v * 0.12, top = V3(0.03 + lean, 1.0 - v * 0.08, 0.01);
      stem(b, V3(0, 0, 0), V3(0.02 + lean * 0.3, 0.5, 0), top, 0.006, 0, 6);
      const n = v === 0 ? 16 : 11;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1), y = 0.5 + (top.y - 0.52) * t, a = k * 2.4;
        const out = V3(Math.cos(a), 0.25, Math.sin(a));
        const c = V3(top.x * t * t + Math.cos(a) * 0.04, y, Math.sin(a) * 0.04);
        spriteFacing(b, c, out, 0.05 * (1 - 0.45 * t), "floret_G04", k % 3);
      }
      for (let k = 0; k < 5; k++) flatLeaf(b, V3(0, 0.02, 0), k * 1.4 + v, 0.1, 0.08 + k * 0.05, 0.22, 0.45, "leaf_E03");
    },
  },
  {
    name: "campanula", map: [1, 3], headScale: 1.3, cell: 0.55, radius: 14, maxDens: 2.5, height: [0.35, 0.6], hide: 0.2, variants: 2,
    palette: [[1, 1, 1], [1.1, 0.95, 1.05], [0.9, 0.9, 1.1]],
    build(b, v = 0) {
      for (let i = 0; i < 3 - v; i++) {
        const a = i * 2.1 + v, top = V3(Math.cos(a) * 0.2, 1.0 - i * 0.1, Math.sin(a) * 0.2);
        stem(b, V3(0, 0, 0), V3(Math.cos(a) * 0.02, 0.7, Math.sin(a) * 0.02), top, 0.003, i);
        for (let k = 0; k < 3 + v; k++) {
          const t = 0.55 + 0.15 * k;
          const p = V3(Math.cos(a) * 0.2 * t * t, (1.0 - i * 0.1) * (0.65 + 0.35 * t), Math.sin(a) * 0.2 * t * t);
          spriteCross(b, p, 0.05, 0.11, "floret_G05", i, a + k, 3, true);
        }
      }
      for (let k = 0; k < 5; k++) flatLeaf(b, V3(0, 0.02, 0), k * 1.26 + v, 0.06, 0.03 + (k % 2) * 0.03, 0.13, 0.25, "leaf_E01");   // round basal leaves
    },
  },
  {
    name: "yarrow", map: [2, 0], headScale: 1.15, cell: 0.4, radius: 14, maxDens: 2.0, height: [0.4, 0.62], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.02, 0.96, 0.97], [1.0, 0.98, 0.93]],
    build(b, v = 0) {
      const heads = v === 0 ? [[V3(0, 1, 0), 0.075], [V3(0.12, 0.88, 0.06), 0.062]] : [[V3(0.1, 0.96, -0.04), 0.075]];
      heads.forEach(([p, r], i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.3, 0.5, p.z * 0.3), p, 0.004, i);
        paintedHead3D(b, p, V3(0.05, 1, 0.02), r, "head_C10", i, { dome: 0.12, cup: 0, seed: v });
      });
      for (let k = 0; k < 6; k++) leaf(b, V3(0, 0.05 + (k % 3) * 0.12, 0), k * 1.1 + v, 0.2, 1.0, "leaf_cosmos", 0.3);
    },
  },
  {
    name: "dandelion", map: [2, 1], headScale: 1.1, cell: 0.38, radius: 14, maxDens: 2.2, height: [0.3, 0.55], hide: 0.4, variants: 2,
    palette: [[1, 1, 1]],
    build(b, v = 0) {
      stem(b, V3(0, 0, 0), V3(0.05, 0.5, 0), V3(0.08, 1, 0.02), 0.01, 0);
      paintedHead3D(b, V3(0.08, 1, 0.02), V3(0.2, 1, 0.1), 0.065, "head_C08", 0, { dome: 0.1, cup: 0.3, seed: v });
      if (v === 0) {  // a seed clock
        stem(b, V3(0, 0, 0), V3(-0.05, 0.6, 0.02), V3(-0.1, 1.25, 0.05), 0.009, 1);
        spriteCross(b, V3(-0.1, 1.12, 0.05), 0.14, 0.28, "puff", 1);
      } else {
        stem(b, V3(0, 0, 0), V3(-0.04, 0.4, 0.06), V3(-0.12, 0.75, 0.1), 0.009, 1);
        paintedHead3D(b, V3(-0.12, 0.75, 0.1), V3(-0.4, 1, 0.3), 0.06, "head_C08", 1, { dome: 0.1, cup: 0.3, seed: 3 });
      }
      flatLeaf(b, V3(0, 0.02, 0), v * 1.3, 0, 0.02, 0.75, 0, "leaf_E04");
    },
  },
  {
    name: "clover", map: [2, 2], headScale: 1.2, cell: 0.25, radius: 14, maxDens: 2.5, height: [0.15, 0.28], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.0, 0.94, 0.97], [1.03, 1.0, 1.03]],
    build(b, v = 0) {
      for (let k = 0; k < 7 - v * 2; k++) {
        const a = k * 0.9 + v, r = 0.12 + (k % 3) * 0.1;
        flatLeaf(b, V3(Math.cos(a) * r * 0.3, 0, Math.sin(a) * r * 0.3), a, r * 0.7, 0.08 + (k % 2) * 0.14, 0.26, 0.25, "leaf_E02");
      }
      const heads = v === 0 ? [V3(0.05, 1, 0), V3(-0.12, 0.85, 0.1)] : [V3(0.08, 0.9, -0.04)];
      heads.forEach((p, i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.4, 0.5, p.z * 0.4), p, 0.006, i);
        paintedHead3D(b, p, V3(p.x, 1, p.z), 0.065, "head_C11", i, { dome: 0.65, cup: 0, seed: v });
      });
    },
  },
  {
    name: "mantle", map: [2, 3], cell: 0.45, radius: 14, maxDens: 1.6, height: [0.14, 0.24], hide: 0, variants: 2,
    palette: [[1, 1, 1]],
    build(b, v = 0) {
      const n = 7 - v * 2;
      for (let k = 0; k < n; k++) flatLeaf(b, V3(0, 0, 0), (k / n) * 6.28 + v, 0.18 + (k % 2) * 0.1, 0.35 + (k % 3) * 0.2, 0.5, 0.3 + (k % 2) * 0.2, "leaf_E01");
    },
  },
  {
    name: "buttercup", map: [4, 0], headScale: 1.1, cell: 0.3, radius: 14, maxDens: 2.2, height: [0.3, 0.6], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.0, 0.97, 0.9]],
    build(b, v = 0) {
      const tips = v === 0
        ? [V3(0, 1, 0), V3(0.14, 0.86, 0.06), V3(-0.12, 0.9, -0.05), V3(0.05, 0.75, -0.14), V3(-0.08, 0.7, 0.12)]
        : [V3(0.16, 0.95, 0.04), V3(-0.06, 0.8, 0.1), V3(0.1, 0.66, -0.12)];
      tips.forEach((p, i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.2, 0.5, p.z * 0.2), p, 0.0025, i);
        paintedHead3D(b, p, V3(p.x * 0.8, 1, p.z * 0.8), 0.03, "head_C06", i, { petals: 5, cup: 0.6, tilt: 0.4, seed: v });
      });
      for (let k = 0; k < 4; k++) flatLeaf(b, V3(0, 0.02, 0), k * 1.57 + v, 0.08, 0.06 + (k % 2) * 0.05, 0.2, 0.3, "leaf_H02");
    },
  },
  {
    name: "fireweed", map: [4, 1], headScale: 1.0, cell: 0.7, radius: 14, maxDens: 2.0, height: [0.8, 1.4], hide: 0, variants: 2,
    palette: [[1, 1, 1], [1.04, 0.95, 1.0]],
    build(b, v = 0) {
      const lean = v * 0.1, top = V3(lean, 1, 0);
      stem(b, V3(0, 0, 0), V3(lean * 0.3, 0.5, 0), top, 0.006, 0, 6);
      for (let k = 0; k < 10; k++) { const y = 0.08 + k * 0.055; leaf(b, V3(lean * y * y, y, 0), k * 2.4, 0.18 - k * 0.007, 1.0, "leaf_H01", 0.5); }
      const n = v === 0 ? 12 : 8;
      for (let k = 0; k < n; k++) {   // open flowers low on the spike, buds above
        const t = k / (n - 1), y = 0.62 + 0.3 * t, a = k * 2.4;
        const c = V3(lean * y * y + Math.cos(a) * 0.035, y, Math.sin(a) * 0.035);
        paintedHead3D(b, c, V3(Math.cos(a), 0.5, Math.sin(a)), 0.028 * (1 - 0.3 * t), "head_G01", k % 4, { petals: 4, cup: 0.3, tilt: 0.3, seed: k + v * 7 });
      }
      spriteCross(b, V3(lean, 0.9, 0), 0.07, 0.14, "spike_G02", 0, 0, 3);
    },
  },
  {
    name: "dragonhead", map: [4, 2], headScale: 1.0, cell: 0.45, radius: 14, maxDens: 2.0, height: [0.25, 0.45], hide: 0.2, variants: 2,
    palette: [[1, 1, 1], [0.95, 0.95, 1.05]],
    build(b, v = 0) {
      for (let i = 0; i < 3 - v; i++) {
        const a = i * 2.1 + v, tip = V3(Math.cos(a) * 0.08, 1 - i * 0.12, Math.sin(a) * 0.08);
        stem(b, V3(0, 0, 0), V3(tip.x * 0.3, 0.5, tip.z * 0.3), tip, 0.004, i);
        for (let w = 0; w < 3; w++) {   // whorls of lipped flowers near the top
          const y = tip.y * (0.62 + 0.13 * w), f = y / tip.y;
          for (let q = 0; q < 4; q++) {
            const aa = q * 1.57 + w * 0.7;
            spriteFacing(b, V3(tip.x * f + Math.cos(aa) * 0.03, y, tip.z * f + Math.sin(aa) * 0.03), V3(Math.cos(aa), 0.3, Math.sin(aa)), 0.035, "floret_G03", i);
          }
        }
        for (let k = 0; k < 4; k++) leaf(b, V3(tip.x * 0.2, 0.15 + k * 0.1, tip.z * 0.2), a + k * 1.57, 0.13, 1.15, "leaf_H01", 0.5);
      }
    },
  },
  {
    name: "gentian", map: [4, 3], headScale: 1.1, cell: 0.3, radius: 14, maxDens: 2.2, height: [0.08, 0.2], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [0.95, 0.97, 1.05]],
    build(b, v = 0) {
      const heads = v === 0 ? [V3(0, 1, 0), V3(0.18, 0.8, 0.08), V3(-0.15, 0.85, -0.1)] : [V3(0.05, 1, 0.03)];
      heads.forEach((p, i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.3, 0.5, p.z * 0.3), p, 0.012, i);
        paintedHead3D(b, p, V3(p.x, 1, p.z), 0.2, "head_C13", i, { petals: 5, cup: 1.5, tilt: 0.3, seed: v });   // trumpet
      });
      rosette(b, 6, 0.3, 1.3, "leaf_H01", 0.5);
    },
  },
  {
    name: "edelweiss", map: [5, 0], headScale: 1.0, cell: 0.3, radius: 14, maxDens: 2.0, height: [0.08, 0.18], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [0.97, 0.97, 0.95]],
    build(b, v = 0) {
      const heads = v === 0 ? [V3(0, 1, 0), V3(0.2, 0.8, 0.1)] : [V3(0.06, 1, 0.02)];
      heads.forEach((p, i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.3, 0.5, p.z * 0.3), p, 0.015, i);
        paintedHead3D(b, p, UP, 0.18, "head_C14", i, { petals: 8, cup: 0.25, tilt: 0.3, seed: v });
      });
      flatLeaf(b, V3(0, 0.02, 0), v, 0, 0.03, 0.9, 0.1, "leaf_H03");
    },
  },
  {
    name: "chive", map: [5, 1], headScale: 1.0, cell: 0.3, radius: 14, maxDens: 2.2, height: [0.25, 0.45], hide: 0.3, variants: 2,
    palette: [[1, 1, 1], [1.03, 0.96, 1.03]],
    build(b, v = 0) {
      for (let k = 0; k < 6; k++) leaf(b, V3(0, 0, 0), k * 1.05 + v, 0.55 + (k % 3) * 0.1, 0.2 + (k % 2) * 0.25, "leaf_lance", 0.09);   // thin tubular leaves
      const heads = v === 0 ? [V3(0, 1, 0), V3(0.1, 0.9, 0.05)] : [V3(0.08, 1, -0.03)];
      heads.forEach((p, i) => {
        stem(b, V3(0, 0, 0), V3(p.x * 0.3, 0.5, p.z * 0.3), p, 0.005, i);
        paintedHead3D(b, p, UP, 0.055, "head_C15", i, { dome: 0.9, cup: 0, seed: v });   // round umbel
      });
    },
  },
  {
    // modelled grass clump (method 2 sample); only placed explicitly, its geometry comes from addHifi
    name: "grassclump", map: null, cell: 0.3, radius: 6.5, maxDens: 1, height: [0.75, 1.15], hide: 0,
    palette: [[1, 1, 1]],
    build(b) { leaf(b, V3(0, 0, 0), 0, 0.01, 0, "leaf_lance", 0.1); },
  },
  {
    name: "fern", map: [3, 3], cell: 0.9, radius: 14, maxDens: 0.7, height: [0.4, 0.75], hide: 0, variants: 2,
    palette: [[1, 1, 1]],
    build(b, v = 0) { for (let k = 0; k < 7 - v * 2; k++) leaf(b, V3(0, 0, 0), k * 0.9 + v, 1.0, 0.45 + (k % 2) * 0.2 + v * 0.1, "frond", 0.45); },
  },
];

const VERT = /* glsl */ `
attribute float aPart;
attribute float aHead;
#ifdef HIFI
attribute vec3 aCol;
varying vec3 vN;
#endif
#ifdef HEAD_PETAL
varying float vSwap;
#endif
#ifdef PAINTED
attribute float aSwap;
uniform vec3 uPaintTint;
#endif
attribute float aAlt;
uniform vec2 uAlt;     // (u offset of the variant painting, share of heads using it)
attribute vec4 iPos;   // x, y, z, yaw
attribute vec4 iPar;   // height, seed, -, -
attribute vec4 iSway;  // stem tilt (xy, rad, toward the direction it leans) and head wobble (zw), from the spring simulation (sway())
uniform vec3 uPalette[6];
uniform float uPaletteN;
uniform float uHide;
uniform float uCurvature;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vColor;
varying float vPart;
varying float vVis;
varying float vY;
varying float vLodD;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

// turn v about the base: up tilts toward th's direction by |th| (Rodrigues)
vec3 swayRot(vec3 v, vec2 th) {
  float a = length(th);
  if (a < 1e-5) return v;
  vec3 k = vec3(th.y, 0.0, -th.x) / a;
  return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
}

void main() {
  float seed = iPar.y;
  if (aHead > 0.5 && hash12(vec2(seed * 17.3, aHead)) < uHide) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float H = iPar.x;
  float c = cos(iPos.w), s = sin(iPos.w);
  vec3 p = position;
  p.xz = mat2(c, -s, s, c) * p.xz;
  // The stem bends as a curve: each point turns about the base by an angle growing with its
  // height, so heads tilt and nod with the stem instead of sliding. The upper part carries the
  // faster head wobble, each head of a plant in its own direction; leaves flutter on their own.
  float y = max(p.y, 0.0);
  vec2 hw = aHead < 0.5 ? iSway.zw : aHead < 1.5 ? vec2(-iSway.w, iSway.z) : aHead < 2.5 ? -iSway.zw : vec2(iSway.w, -iSway.z);
  vec2 th = iSway.xy * y + hw * smoothstep(0.45, 1.0, y);
  if (aPart > 0.5 && aPart < 1.5)
    th += vec2(tnoise(uTime * 2.2 + seed * 31.0, seed + aHead), tnoise(uTime * 1.9 + seed * 17.0, seed + 5.0)) * 0.05 * (0.3 + y) * clamp(0.05 + 0.9 * uWindStr, 0.0, 1.0);   // (still in still air)
  vec3 wp = swayRot(p * H, th) + iPos.xyz;
  int ci = int(min(uPaletteN - 1.0, floor(hash12(vec2(seed * 5.1, aHead + 1.0)) * uPaletteN)));
  vec3 pal = uPalette[0];
  for (int k = 1; k < 6; k++) if (k == ci) pal = uPalette[k];
  float jitter = 0.9 + 0.2 * hash12(vec2(seed, 2.0));
  vColor = aPart < 0.5 ? vec3(0.1, 0.22, 0.05) * jitter
         : aPart < 1.5 ? mix(vec3(0.9, 1.0, 0.85), vec3(1.1, 1.05, 0.8), fract(seed * 13.0)) * jitter
         : pal;
#ifdef HEAD_PETAL
  // which of the four paintings this head uses: mostly pale pink and white, a few lilac/magenta
  float pc = hash12(vec2(seed * 9.7, aHead + 3.0));
  vSwap = pc < 0.36 ? 0.0 : pc < 0.72 ? 2.0 : pc < 0.86 ? 3.0 : 1.0;
#endif
#ifdef HIFI
  // modelled plant: real normals, material colour x baked AO; petals tinted by the palette
  vec3 nn = normal;
  nn.xz = mat2(c, -s, s, c) * nn.xz;
  vN = swayRot(nn, th);
  if (aPart < 1.5 || aPart > 4.5) vColor = aCol * jitter;
  else if (aPart > 1.5 && aPart < 2.5) vColor = pal * mix(0.7, 1.0, aCol.r);
  #ifdef HEAD_PETAL
  if (aPart > 1.5 && aPart < 2.5) vColor = vec3(mix(0.78, 1.0, aCol.r));
  #endif
#endif
  vPart = aPart;
  vUv = uv;
  vUv.x += aAlt * step(hash12(vec2(seed * 3.7, aHead + 9.0)), uAlt.y) * uAlt.x;
#ifdef PAINTED
  // four head colours sit side by side in the atlas (pink, magenta, white, lilac)
  float pick = hash12(vec2(seed * 9.7, aHead + 3.0));
  vUv.x += aSwap * floor(pick * 3.999) * 0.25;
  vColor = aPart < 0.5 ? vColor : uPaintTint * mix(0.85, 1.1, fract(seed * 17.0));
#endif
  vY = y;
  vWorld = wp;
  vLodD = length(iPos.xyz - cameraPosition);
  vVis = groundSunVis(iPos.xz, y * H + 0.05, smoothstep(0.3, 0.7, landcover(iPos.xz).r), length(iPos.xz - cameraPosition.xz));
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
#ifdef HIFI
varying vec3 vN;
#endif
#ifdef HEAD_PETAL
varying float vSwap;
uniform vec4 uHeadRect;
#endif
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vColor;
varying float vPart;
varying float vVis;
varying float vY;
varying float vLodD;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
${LOD_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
#ifndef CAPTURE
  if (lodDither() >= lodNear(vLodD)) discard;   // dissolving into its own picture (midplants.js)
#endif
  vec3 albedo = vColor;
#ifdef HIFI
  #ifdef HEAD_PETAL
    // the painted flower heads (method 1) mapped petal by petal onto the modelled petals:
    // colour, gradient, veins, dark eye and outline all come from the painting
    if (vPart > 1.5 && vPart < 2.5) {
      vec2 auv = uHeadRect.xy + clamp(vUv, 0.002, 0.998) * (uHeadRect.zw - uHeadRect.xy) + vec2(vSwap * 0.25, 0.0);
      vec4 t = texture2D(uAtlas, auv);
      if (t.a < 0.5) discard;
      albedo = t.rgb * vColor;
    }
  #elif defined(PAINTED_PETAL)
    // hand-painted petal (AI texture, luminance) on the modelled petal: brush strokes and veins,
    // a deeper eye zone at the base (v -> 1), paler toward the rim
    if (vPart > 1.5 && vPart < 2.5) {
      float lum = texture2D(uAtlas, vUv).r;
      albedo = vColor * (0.3 + 0.8 * lum);
      albedo = mix(albedo, albedo * vec3(0.78, 0.55, 0.72), smoothstep(0.72, 1.0, vUv.y) * 0.6);
      albedo = mix(albedo, vec3(1.0), smoothstep(0.25, 0.0, vUv.y) * 0.12);
    }
  #else
  if (vPart > 1.5 && vPart < 2.5) albedo = vColor * (0.55 + 0.5 * texture2D(uAtlas, vUv).r);
  #endif

  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), vPart > 4.5 ? 0.6 : 0.25));   // grass shades more like the sward
#else
  if (vPart > 0.5) {
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.5) discard;
    float lum = dot(t.rgb, vec3(0.33));
    albedo = vPart > 1.5 && vPart < 2.5 ? vColor * (0.72 + 0.35 * lum) : t.rgb * vColor;
  }
  vec3 n = vec3(0.0, 1.0, 0.0);
#endif
  // stems and leaves darker near the ground (self-shading inside the sward)
  albedo *= mix(0.6, 1.0, smoothstep(0.0, 0.5, vY));
#ifdef CAPTURE
  // the plant's picture for midplants.js: albedo (square-root encoded for the 8-bit atlas), lit there
  gl_FragColor = vec4(sqrt(max(albedo, vec3(0.0))), 1.0);
  return;
#endif
  float vis = vVis * objectShadow(vWorld, n);
  vec3 col = toonLight(albedo, n, vis, 0.45);
  vec3 v = normalize(vWorld - cameraPosition);
  float back = pow(max(dot(v, uSunDir), 0.0), 2.0);
  col += uSunColor * albedo * back * (vPart > 1.5 ? 0.22 : 0.12) * vis;   // thin petals / leaves glow when backlit
#ifdef PAINTED_PETAL
  // petals: soft translucent glow (light through thin petals + sky fill); bright enough for
  // the bloom to wrap them in a halo
  if (vPart > 1.5 && vPart < 2.5) {
    // light shining through the petal only when it is between the viewer and the sun
    float wrap = pow(max(dot(v, uSunDir), 0.0), 2.0);
    col += albedo * uSunColor * 0.18 * wrap * vis;
    col = min(col, vec3(1.15));   // a soft glow, not a white blaze
  } else col = min(col, vec3(1.15));
#else
  col = min(col, vec3(1.15));
#endif
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// flora order shared with the shaders (NFLORA in glsl.js): map [layer, channel] of each
const FLORA_MAPS = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3],
  [4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1]];
const floraIndex = (m) => FLORA_MAPS.findIndex((q) => q[0] === m[0] && q[1] === m[1]);

const BARY = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10 - i; j++) BARY.push([(i + 1 / 3) / 10, (j + 1 / 3) / 10]);

// appearance seeds of the modelled plants come in EXEMPLARS steps: each one is photographed at
// start-up (midplants.js), so a plant's picture is the plant itself
export const EXEMPLARS = 6;
export const exemplarSeed = (r) => (Math.floor(r * EXEMPLARS) + 0.5) / EXEMPLARS;

export function hash2(x, z, k) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + k * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000003) / 1000003;
}

// Clumping of each species near the camera: [mean plants per clump, clump radius (m)].
// Sown cosmos and clonal plants (clover runners, fireweed and chive rootstocks) form thick
// groups; tall loners (delphinium, dandelion) come in twos and threes.
const CLUMP = { cosmos: [6, 0.4], daisy: [7, 0.3], poppy: [4, 0.3], globeflower: [4, 0.35], forgetmenot: [8, 0.25], geranium: [4, 0.35],
  delphinium: [3, 0.45], campanula: [5, 0.3], yarrow: [6, 0.4], dandelion: [3, 0.5], clover: [10, 0.4], mantle: [3, 0.5],
  buttercup: [7, 0.35], fireweed: [6, 0.6], dragonhead: [4, 0.3], gentian: [5, 0.2], edelweiss: [5, 0.2], chive: [6, 0.2], fern: [4, 0.8] };

// Per-instance wind response: each plant is a damped spring (stem tilt) with a faster second
// spring (head wobble); state survives the re-placement of instances as the camera moves.
const STIFF = { cosmos: 1.15, daisy: 1.0, poppy: 1.1, globeflower: 0.9, forgetmenot: 0.8, geranium: 0.85, delphinium: 0.55, campanula: 1.0,
  yarrow: 0.8, dandelion: 0.9, clover: 0.45, mantle: 0.3, buttercup: 1.0, fireweed: 0.6, dragonhead: 0.7, gentian: 0.4, edelweiss: 0.4,
  chive: 0.9, fern: 0.6, grassclump: 1.0 };
function swayRec(rec, sp) {
  rec.iSway = new THREE.InstancedBufferAttribute(new Float32Array(rec.max * 4), 4);
  rec.iSway.setUsage(THREE.DynamicDrawUsage);
  rec.geo.setAttribute("iSway", rec.iSway);
  rec.stiff = STIFF[sp.name] ?? 0.8;
  rec.keys = new Float64Array(rec.max);
  rec.state = new Float32Array(rec.max * 8);   // tilt xy, velocity xy, head xy, head velocity xy
  rec.par = new Float32Array(rec.max * 6);     // x, z, omega, compliance, omega2, compliance2
  rec.count = 0;
  return rec;
}
function swayBegin(rec) {
  const map = new Map();
  for (let i = 0; i < rec.count; i++) map.set(rec.keys[i], i);
  rec.old = { map, state: rec.state };
  rec.keys = new Float64Array(rec.max);
  rec.state = new Float32Array(rec.max * 8);
}
function swayPut(rec, q, key, x, z, h, r) {
  rec.keys[q] = key;
  const f = (1.2 / Math.sqrt(Math.max(h, 0.12))) * (0.8 + 0.45 * ((r * 7.13) % 1));      // Hz: tall stems swing slower (1 m: ~1.2 Hz)
  const k = 0.5 * Math.sqrt(Math.max(h, 0.05)) * rec.stiff * (0.8 + 0.4 * ((r * 3.71) % 1));
  rec.par.set([x, z, 2 * Math.PI * f, k, 2 * Math.PI * f * 2.6, k * 0.3], q * 6);
  const o = rec.old && rec.old.map.get(key);
  if (o !== undefined) rec.state.set(rec.old.state.subarray(o * 8, o * 8 + 8), q * 8);
}

// raw RGBA bytes (gzip): the habitat maps are data, not images -- a canvas would premultiply
// alpha and wipe the species kept in RGB wherever the one kept in A is absent
async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let buf = await res.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b)
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return new Uint8Array(buf);
}

function dataTexture(bytes, w, h = w) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = false; t.colorSpace = THREE.NoColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// bilinear lookup of channel ch in an n x n RGBA byte grid covering [ox, ox+size) (texel centres
// at +0.5, clamped at the edges -- the same as the GPU sampler)
function bilinear(data, n, stride, ox, oz, res, x, z, ch) {
  const fx = Math.min(Math.max((x - ox) / res - 0.5, 0), n - 1), fz = Math.min(Math.max((z - oz) / res - 0.5, 0), n - 1);
  const i0 = Math.floor(fx), j0 = Math.floor(fz), i1 = Math.min(i0 + 1, n - 1), j1 = Math.min(j0 + 1, n - 1);
  const tx = fx - i0, tz = fz - j0;
  const v = (i, j) => data[(j * stride + i) * 4 + ch];
  return ((v(i0, j0) * (1 - tx) + v(i1, j0) * tx) * (1 - tz) + (v(i0, j1) * (1 - tx) + v(i1, j1) * tx) * tz) / 255;
}

export { CLUMP };

export class Vegetation {
  static async create(terrain) {
    const [meta, atlasMeta, bytes, coreMeta, coreBytes] = await Promise.all([
      fetch("./data/vegmap.json").then((r) => r.json()),
      fetch("./assets/flora_v2.json").then((r) => r.json()),   // tools/build_flora_atlas.py
      fetchBytes("./data/vegmap.bin.gz"),
      fetch("./data/vegcore.json").then((r) => r.json()),
      fetchBytes("./data/vegcore.bin.gz"),
    ]);
    // 2 m map of the 2 km square and the core-wide 16 m map: six RGBA layers each, layer k at
    // tile (k % 3, k / 3) (tools/veg_map.py, tools/veg_core.py). The core map is the single
    // source of the flora outside the square and of the distant meadow colour.
    const n = Math.round(meta.size / meta.res);
    const maps = { data: bytes, n };
    const nc = Math.round(coreMeta.size / coreMeta.res);
    worldUniforms.uVegCore.value = dataTexture(coreBytes, 3 * nc, 2 * nc);
    worldUniforms.uVegCoreOrigin.value.set(coreMeta.origin[0], coreMeta.origin[1]);
    worldUniforms.uVegCoreSize.value = coreMeta.size;
    const core = { data: coreBytes, n: nc, meta: coreMeta };
    const atlas = await new THREE.TextureLoader().loadAsync("./assets/flora_v2.png");
    atlas.flipY = false;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 8;
    atlas.needsUpdate = true;
    const v = new Vegetation(terrain, meta, atlasMeta, maps, atlas, core);
    await v.floraStats();
    return v;
  }

  constructor(terrain, meta, atlasMeta, maps, atlas, core) {
    const rects = atlasMeta.rects;
    this.terrain = terrain;
    this.meta = meta;
    this.maps = maps;
    this.core = core;
    this.group = new THREE.Group();
    this.last = new THREE.Vector2(1e9, 1e9);
    // GPU copies of the habitat maps for grass / mid-range flowers / terrain tint
    worldUniforms.uVegAtlas.value = dataTexture(maps.data, 3 * maps.n, 2 * maps.n);
    worldUniforms.uVegOrigin.value.set(meta.origin[0], meta.origin[1]);
    worldUniforms.uVegSize.value = meta.size;
    this.atlas = atlas;
    this.rects = rects;
    this.species = SPECIES.map((sp, idx) => {
      const pal = sp.palette.map((c) => new THREE.Vector3(...c));
      while (pal.length < 6) pal.push(pal[0].clone());
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...atmos, ...worldUniforms, ...shadowUniforms, uAtlas: { value: atlas }, uPalette: { value: pal }, uPaletteN: { value: sp.palette.length }, uHide: { value: sp.hide },
          uAlt: { value: new THREE.Vector2(sp.alt?.step ?? 0, sp.alt?.p ?? 0) } },
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, alphaToCoverage: true,
      });
      // one instanced mesh per posture variant; a placed plant draws one of them by hash
      const nv = sp.variants ?? 1;
      const max = Math.ceil((Math.PI * sp.radius * sp.radius / (sp.cell * sp.cell) * sp.maxDens) / nv * 1.3) + 64;
      const vars = [];
      for (let v = 0; v < nv; v++) {
        const b = new Builder(rects, sp.headScale ?? 1, atlasMeta.heads);
        sp.build(b, v);
        const g0 = b.build();
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = g0.index;
        for (const k of ["position", "uv", "aPart", "aHead", "aAlt"]) geo.setAttribute(k, g0.attributes[k]);
        const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
        const iPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
        iPos.setUsage(THREE.DynamicDrawUsage); iPar.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("iPos", iPos); geo.setAttribute("iPar", iPar);
        geo.instanceCount = 0;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.name = sp.name + (v ? "_" + v : "");
        this.group.add(mesh);
        vars.push(swayRec({ geo, iPos, iPar, max, mesh, tris: g0.index.count / 3 }, sp));
      }
      return { ...sp, idx, vars, ...vars[0] };
    });
  }

  // Near LOD from a Blender-modelled plant (method 2 sample). Parts by material name.
  async addHifi(name, url, texUrl, radius = 6, { mode = "m2", palette = null, density, painted = false, headAtlas = false } = {}) {
    const sp = this.species.find((q) => q.name === name);
    const gltf = await loadAsset(url);
    let tex;
    if (headAtlas) { await this.loadAIAtlas(); tex = this.aiAtlas; }
    else { tex = await new THREE.TextureLoader().loadAsync(texUrl); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }
    const PART = { petal: 2, receptacle: 5, floret_out: 5, floret_in: 5, bract: 0, stem: 0, leaf: 1, bud: 5, g_fresh: 5, g_deep: 5, g_yellow: 5, g_dry: 5, g_seed: 5 };
    const heads = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.17, 0.86, -0.08), new THREE.Vector3(-0.13, 0.76, 0.11)];
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const n = g.attributes.position.count;
      const mname = o.material.name.replace(/\.\d+$/, "");
      const part = PART[mname] ?? 0;
      const col = o.material.color.clone();
      const ao = g.attributes.color;
      const aCol = new Float32Array(n * 3), aPart = new Float32Array(n).fill(part), aHead = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = ao ? ao.getX(i) : 1;  // petals: AO alone (the palette supplies the colour)
        aCol[i * 3] = part === 2 ? a : col.r * a; aCol[i * 3 + 1] = part === 2 ? a : col.g * a; aCol[i * 3 + 2] = part === 2 ? a : col.b * a;
      }
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute("aCol", new THREE.BufferAttribute(aCol, 3));
      g.setAttribute("aPart", new THREE.BufferAttribute(aPart, 1));
      g.setAttribute("aHead", new THREE.BufferAttribute(aHead.fill(mname === "g_seed" ? 1 : 0), 1));
      parts.push(g);
    });
    const g0 = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const seedTris = new Set();
    for (let t = 0; t < g0.attributes.aHead.count; t += 3) if (g0.attributes.aHead.getX(t) > 0.5) seedTris.add(t);
    // head id per whole triangle (so hiding a head never tears a triangle apart); cosmos only
    {
      const pos = g0.attributes.position, part = g0.attributes.aPart, hd = g0.attributes.aHead;
      const c = new THREE.Vector3(), q = new THREE.Vector3();
      for (let t = 0; t < pos.count; t += 3) {
        let id = 0;
        if (name === "grassclump" && seedTris.has(t)) id = 1;   // seed stalks: shown on some clumps only
        if (name === "cosmos" && part.getX(t) !== 0 && part.getX(t) !== 1) {
          c.set(0, 0, 0);
          for (let k = 0; k < 3; k++) c.add(q.fromBufferAttribute(pos, t + k));
          c.multiplyScalar(1 / 3);
          let bd = 1e9;
          heads.forEach((h, j) => { const d = h.distanceToSquared(c); if (d < bd) { bd = d; id = j; } });
        }
        for (let k = 0; k < 3; k++) hd.setX(t + k, id);
      }
    }
    const max = 4000;
    const geo = new THREE.InstancedBufferGeometry();
    for (const k of ["position", "normal", "uv", "aCol", "aPart", "aHead"]) geo.setAttribute(k, g0.attributes[k]);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    const iPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    iPos.setUsage(THREE.DynamicDrawUsage); iPar.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", iPos); geo.setAttribute("iPar", iPar);
    geo.instanceCount = 0;
    const mat = sp.mesh.material.clone();
    mat.defines = { HIFI: 1, ...(painted ? { PAINTED_PETAL: 1 } : {}), ...(headAtlas ? { HEAD_PETAL: 1, PAINTED_PETAL: 1 } : {}) };
    mat.uniforms = { ...sp.mesh.material.uniforms, uAtlas: { value: tex }, uHide: { value: name === "grassclump" ? 0.8 : 0.2 } };
    if (headAtlas) mat.uniforms.uHeadRect = { value: new THREE.Vector4(...this.aiRects.head_pink) };
    if (palette) {
      const pal = palette.map((c) => new THREE.Vector3(...c));
      while (pal.length < 6) pal.push(pal[0].clone());
      mat.uniforms.uPalette = { value: pal };
      mat.uniforms.uPaletteN = { value: palette.length };
    }
    mat.alphaToCoverage = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = name + "_hifi";
    this.group.add(mesh);
    const rec = swayRec({ geo, iPos, iPar, max, mesh, r0: 0, r1: radius, density, tris: g0.attributes.position.count / 3 }, sp);
    this.addAlt(sp, mode, rec);
    return rec;
  }

  addAlt(sp, mode, rec) {
    sp.alts = sp.alts || {};
    (sp.alts[mode] = sp.alts[mode] || []).push(rec);
    rec.mesh.visible = this.mode === mode;
    this.last.set(1e9, 1e9);
  }

  async loadAIAtlas(atlasUrl = "./assets/ai_atlas.png", rectsUrl = "./assets/ai_atlas.json") {
    if (this.aiAtlas) return;
    this.aiRects = await fetch(rectsUrl).then((r) => r.json());
    this.aiAtlas = await new THREE.TextureLoader().loadAsync(atlasUrl);
    this.aiAtlas.flipY = false; this.aiAtlas.colorSpace = THREE.SRGBColorSpace; this.aiAtlas.anisotropy = 8; this.aiAtlas.needsUpdate = true;
  }

  // Method 1: species drawn with AI-painted sprites (ai_atlas.png) between r0 and r1 metres
  async addPainted(name, build, r0, r1, { tint = [1, 1, 1], density = 1 } = {}) {
    await this.loadAIAtlas();
    const sp = this.species.find((q) => q.name === name);
    const b = new Builder(this.aiRects, 1);
    build(b);
    const g0 = b.build();
    const max = 6000;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = g0.index;
    for (const k of ["position", "uv", "aPart", "aHead", "aSwap"]) geo.setAttribute(k, g0.attributes[k]);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    const iPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    iPos.setUsage(THREE.DynamicDrawUsage); iPar.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", iPos); geo.setAttribute("iPar", iPar);
    geo.instanceCount = 0;
    const mat = sp.mesh.material.clone();
    mat.defines = { PAINTED: 1 };
    mat.uniforms = { ...sp.mesh.material.uniforms, uAtlas: { value: this.aiAtlas }, uHide: { value: name === "cosmos" ? 0.2 : 0 }, uPaintTint: { value: new THREE.Vector3(...tint) } };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = name + "_painted";
    this.group.add(mesh);
    const rec = swayRec({ geo, iPos, iPar, max, mesh, r0, r1, density, tris: g0.index.count / 3 }, sp);
    this.addAlt(sp, "m1", rec);
    return rec;
  }

  // open meadow 0..1 (no forest, trails, cut banks); used by the modelled grass clumps
  meadowAt(x, z) {
    if (!this.lc) this.lc = this.terrain.landcoverSampler ? this.terrain.landcoverSampler() : () => ({ r: 0, g: 0, b: 0 });
    const f = this.lc(x, z).r;
    const t = this.terrain.detailAt ? this.terrain.detailAt(x, z, 1) + this.terrain.detailAt(x, z, 2) : 0;
    // alpine belt: the modelled clumps thin out with the sward (grass.js)
    const y = this.terrain.heightAt(x, z);
    const alp = Math.min(1, Math.max(0, (y - 2650) / 450));
    return Math.max(0, 1 - Math.max(0, (f - 0.3) / 0.4)) * Math.max(0, 1 - t * 2.5) * (1 - 0.85 * alp * alp * (3 - 2 * alp));
  }

  // habitat value 0..1 of map channel [map, ch] at world (x, z): the 2 m map inside the square,
  // the core map elsewhere -- exactly what the shaders read (floraWeights in glsl.js)
  sample(mc, x, z) {
    const tx = mc[0] % 3, ty = Math.floor(mc[0] / 3);
    const m = this.maps, M = this.meta;
    if (x > M.origin[0] && z > M.origin[1] && x < M.origin[0] + M.size && z < M.origin[1] + M.size)
      return bilinear(m.data.subarray((ty * m.n * 3 * m.n + tx * m.n) * 4), m.n, 3 * m.n, M.origin[0], M.origin[1], M.res, x, z, mc[1]);
    const C = this.core, cm = C.meta;
    if (x < cm.origin[0] || z < cm.origin[1] || x > cm.origin[0] + cm.size || z > cm.origin[1] + cm.size) return 0;
    return bilinear(C.data.subarray((ty * C.n * 3 * C.n + tx * C.n) * 4), C.n, 3 * C.n, cm.origin[0], cm.origin[1], cm.res, x, z, mc[1]);
  }

  // Wind on the near plants, every frame: forcing (gust along the local wind direction plus
  // eddies, sampled on a 1 m grid from the shared wind field) drives each plant's springs.
  sway(dt, U) {
    dt = Math.min(dt, 0.05);
    if (!(dt > 0)) return;
    const t = U.uTime.value, dx = U.uWindDir.value.x, dz = U.uWindDir.value.y;
    const ox = U.uWindOff.value.x, oz = U.uWindOff.value.y, str = U.uWindStr.value;
    const G = 40, gx0 = Math.floor(this.last.x) - 20, gz0 = Math.floor(this.last.y) - 20;
    if (!isFinite(gx0)) return;
    const F = this.swayGrid || (this.swayGrid = new Float32Array(G * G * 7));
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const x = gx0 + i, z = gz0 + j, o = (j * G + i) * 7;
        const g = windLeanAt(windQ(x, z, dx, dz, ox, oz, t, str));   // (how far a plant gives, 0..1)
        const d = dirAt(x, z, dx, dz, ox, oz);
        const tu = turbAt(x, z, ox, oz, t, 0), tv = turbAt(x, z, ox, oz, t * 1.6, 1);
        F[o] = d[0] * g; F[o + 1] = d[1] * g; F[o + 2] = g;
        F[o + 3] = tu[0]; F[o + 4] = tu[1]; F[o + 5] = tv[0]; F[o + 6] = tv[1];
      }
    const ZETA = 0.2, ZETA2 = 0.3;   // leafy stems in air: damped enough not to ring like a metronome
    // trodden points (character.js via uTrail): plants near them are pushed aside
    const TR = U.uTrail ? U.uTrail.value.filter((v) => v.w > 0 && v.z < 20) : [];
    const f = [0, 0, 0, 0, 0, 0, 0];
    for (const sp of this.species) {
      const recs = [...sp.vars, ...((sp.alts && sp.alts[this.mode]) || [])];
      for (const rec of recs) {
        const n = rec.count;
        if (!n || !rec.iSway) continue;
        const P = rec.par, S = rec.state, A = rec.iSway.array;
        for (let q = 0; q < n; q++) {
          const pi = q * 6, si = q * 8;
          // bilinear forcing at the plant
          let u = P[pi] - gx0, v = P[pi + 1] - gz0;
          u = Math.min(G - 1.001, Math.max(0, u)); v = Math.min(G - 1.001, Math.max(0, v));
          const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv;
          const o00 = (iv * G + iu) * 7, o10 = o00 + 7, o01 = o00 + G * 7, o11 = o01 + 7;
          for (let c = 0; c < 7; c++) f[c] = (F[o00 + c] * (1 - fu) + F[o10 + c] * fu) * (1 - fv) + (F[o01 + c] * (1 - fu) + F[o11 + c] * fu) * fv;
          const w = P[pi + 2], k = P[pi + 3], w2 = P[pi + 4], k2 = P[pi + 5];
          const ta = k * (0.008 + 0.45 * f[2]);   // (still air: still)
          let ex = f[0] * k * 2.2 + f[3] * ta, ez = f[1] * k * 2.2 + f[4] * ta;  // stem: leans with the gusts and puffs
          for (const t of TR) {
            const ddx = P[pi] - t.x, ddz = P[pi + 1] - t.y, r = Math.hypot(ddx, ddz);
            if (r > 0.85) continue;
            const kk = t.w * (1 - Math.min(1, Math.max(0, (r - 0.1) / 0.7))) * Math.exp(-t.z / 5) * 1.1;
            ex += (r > 1e-3 ? ddx / r : 1) * kk; ez += (r > 1e-3 ? ddz / r : 0) * kk;
          }
          const hx = f[5] * k2 * (0.025 + 1.5 * f[2]), hz = f[6] * k2 * (0.025 + 1.5 * f[2]);    // head: wobbles in the eddies
          const steps = Math.min(6, Math.ceil((dt * w2) / 0.3));
          const h = dt / steps;
          let tx = S[si], tz = S[si + 1], vx = S[si + 2], vz = S[si + 3];
          let px = S[si + 4], pz = S[si + 5], qx = S[si + 6], qz = S[si + 7];
          for (let s = 0; s < steps; s++) {
            vx += (-w * w * (tx - ex) - 2 * ZETA * w * vx) * h; vz += (-w * w * (tz - ez) - 2 * ZETA * w * vz) * h;
            tx += vx * h; tz += vz * h;
            qx += (-w2 * w2 * (px - hx) - 2 * ZETA2 * w2 * qx) * h; qz += (-w2 * w2 * (pz - hz) - 2 * ZETA2 * w2 * qz) * h;
            px += qx * h; pz += qz * h;
          }
          S[si] = tx; S[si + 1] = tz; S[si + 2] = vx; S[si + 3] = vz; S[si + 4] = px; S[si + 5] = pz; S[si + 6] = qx; S[si + 7] = qz;
          A[q * 4] = tx; A[q * 4 + 1] = tz; A[q * 4 + 2] = px; A[q * 4 + 3] = pz;
        }
        rec.iSway.needsUpdate = true;
        rec.iSway.clearUpdateRanges();
        rec.iSway.addUpdateRange(0, n * 4);
      }
    }
  }

  // petal cover at (x, z), the same sum the shaders form (floraCovers in glsl.js)
  coverAt(x, z) {
    if (!this.flora) return 0;
    let c = 0;
    FLORA_MAPS.forEach((m, k) => {
      const f = this.flora[k];
      if (f) c += Math.min(this.sample(m, x, z) * f.maxDens * worldUniforms.uFlora.value, 1) * f.cov1;
    });
    return c;
  }

  // Measure each species as the modelled plants draw it (BARY: 55 sample points per triangle): petal area seen from a typical
  // oblique view (35 deg, averaged over azimuth; hidden heads and transparent texels
  // excluded) and its mean albedo. Every other level of detail -- mid-range flowers, the
  // distant meadow colour -- uses these numbers, so a patch keeps its colour and amount
  // of flowers at any distance.
  async floraStats() {
    const img = this.atlas.image;
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, cv.width, cv.height).data;
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const tex = (u, v) => {
      const i = Math.min(cv.width - 1, Math.max(0, Math.floor(u * cv.width))), j = Math.min(cv.height - 1, Math.max(0, Math.floor(v * cv.height)));
      const o = (j * cv.width + i) * 4;
      return [lin(px[o]), lin(px[o + 1]), lin(px[o + 2]), px[o + 3] / 255];
    };
    // projected petal area splits into a part that scales like the ground (seen from above, H)
    // and one that doesn't shrink at grazing views (upright petals, bells, spikes; V):
    // cover at view elevation e = (H sin e + V cos e) / sin e of the cell
    const side = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; side.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), nrm = new THREE.Vector3();
    this.flora = [];
    this.floraMaps = FLORA_MAPS;
    for (const sp of this.species.filter((q) => q.map && floraIndex(q.map) >= 0)) {
      const pal = sp.palette.reduce((a, c) => [a[0] + c[0] / sp.palette.length, a[1] + c[1] / sp.palette.length, a[2] + c[2] / sp.palette.length], [0, 0, 0]);
      let area = 0, areaH = 0, areaV = 0; const col = [0, 0, 0];
      // petals below the sward (~0.28 m where flowers are thick, grass.js) are hidden from the
      // side and half hidden from above; only what stands above it shows from afar
      const hMean = Math.sqrt((sp.height[0] ** 2 + sp.height[0] * sp.height[1] + sp.height[1] ** 2) / 3);
      const SWARD = 0.28;
      for (const V of sp.vars) {
      const geo = V.geo, pos = geo.attributes.position, uv = geo.attributes.uv, part = geo.attributes.aPart, head = geo.attributes.aHead, alt = geo.attributes.aAlt, idx = geo.index.array;
      const altStep = sp.alt?.step ?? 0, altP = sp.alt?.p ?? 0;
      for (let t = 0; t < idx.length; t += 3) {
        const p = part.getX(idx[t]);
        if (p < 1.5) continue;                              // stems and leaves
        A.fromBufferAttribute(pos, idx[t]); B.fromBufferAttribute(pos, idx[t + 1]); Cc.fromBufferAttribute(pos, idx[t + 2]);
        nrm.subVectors(B, A).cross(Cc.clone().sub(A));
        const a2 = nrm.length() / 2;
        if (a2 < 1e-9) continue;
        nrm.normalize();
        const seenH = Math.abs(nrm.y), seenV = side.reduce((s, v) => s + Math.abs(nrm.dot(v)), 0) / side.length;
        const seen = (seenH * 0.57 + seenV * 0.82) / 0.57;    // at 35 deg, for the colour weighting
        // texture coverage and colour over the triangle (barycentric samples)
        let al = 0; const c = [0, 0, 0]; let ns = 0;
        for (const [wa, wb] of BARY) {
          const wc = 1 - wa - wb;
          const u = uv.getX(idx[t]) * wa + uv.getX(idx[t + 1]) * wb + uv.getX(idx[t + 2]) * wc;
          const v = uv.getY(idx[t]) * wa + uv.getY(idx[t + 1]) * wb + uv.getY(idx[t + 2]) * wc;
          let q = tex(u, v);
          if (altStep && alt.getX(idx[t]) > 0.5) {   // colour variant painting on a share of the heads
            const q2 = tex(u + altStep, v);
            q = q.map((x, i) => x * (1 - altP) + q2[i] * altP);
          }
          ns++;
          if (q[3] < 0.5) continue;                         // discarded texels
          if (p > 2.5 && q[1] > q[0] * 1.05 && q[1] > q[2] * 1.05) continue;   // green stems/leaves painted into sprites
          al++;
          const lum = (q[0] + q[1] + q[2]) / 3;
          const albedo = p < 2.5 ? pal.map((x) => x * (0.72 + 0.35 * lum)) : [q[0] * pal[0], q[1] * pal[1], q[2] * pal[2]];
          c[0] += albedo[0]; c[1] += albedo[1]; c[2] += albedo[2];
        }
        if (!al) continue;
        const keep = head.getX(idx[t]) > 0.5 ? 1 - sp.hide : 1;
        const yW = ((A.y + B.y + Cc.y) / 3) * hMean;
        const above = Math.min(1, Math.max(0, (yW - (SWARD - 0.05)) / 0.15));
        const w = a2 * seen * (al / ns) * keep;
        area += w;
        areaH += a2 * seenH * (al / ns) * keep * (0.5 + 0.5 * above);
        areaV += a2 * seenV * (al / ns) * keep * above;
        for (let k = 0; k < 3; k++) col[k] += (c[k] / al) * w;
      }
      }
      // per plant: the posture variants are drawn equally often
      const nv = sp.vars.length;
      area /= nv; areaH /= nv; areaV /= nv; for (let k = 0; k < 3; k++) col[k] /= nv;
      const h2 = (sp.height[0] ** 2 + sp.height[0] * sp.height[1] + sp.height[1] ** 2) / 3;   // mean of h^2
      const k = floraIndex(sp.map);
      const covH = (areaH * h2) / (sp.cell * sp.cell), covV = (areaV * h2) / (sp.cell * sp.cell);
      this.flora[k] = { name: sp.name, cov1: covH, covV, maxDens: sp.maxDens, col: col.map((x) => x / Math.max(area, 1e-9)), plantArea: area * h2 };
      worldUniforms.uFloraCol.value[k].set(...this.flora[k].col);
      worldUniforms.uFloraMaxD.value[k] = sp.maxDens;
      worldUniforms.uFloraCov1.value[k] = covH;
      worldUniforms.uFloraCovV.value[k] = covV;
    }
    console.table(this.flora.map((f) => ({ name: f.name, "petal m2/plant": f.plantArea.toFixed(4), "cover H": f.cov1.toFixed(3), "cover V": f.covV.toFixed(3), col: f.col.map((x) => x.toFixed(2)).join(",") })));
  }

  // explicit placement (specimen viewer): list of [speciesName, x, z, height, yaw]
  plant(list) {
    this.fixed = true;
    const targets = [];
    for (const sp of this.species) {
      targets.push([sp, sp.name]);
      for (const [mode, list] of Object.entries(sp.alts || {}))
        list.forEach((rec, i) => targets.push([{ ...rec, height: sp.height }, sp.name + ({ m1: "_painted", m2: "_hifi", m3: "_hybrid" }[mode] || "_" + mode) + (i ? i : "")]));
    }
    for (const [sp, key] of targets) {
      const items = list.filter((e) => e[0] === key);
      items.forEach(([, x, z, h, yaw], k) => {
        sp.iPos.array.set([x, this.terrain.heightAt(x, z), z, yaw ?? 0], k * 4);
        sp.iPar.array.set([h ?? (sp.height[0] + sp.height[1]) / 2, 0.137 * (k + 1), 0, 0], k * 4);
      });
      sp.geo.instanceCount = items.length;
      sp.iPos.needsUpdate = sp.iPar.needsUpdate = true;
      sp.iPos.clearUpdateRanges(); sp.iPar.clearUpdateRanges();
    }
  }

  // render mode for the near-range flora: "base" (procedural), "m1" (AI-painted), "m2" (modelled)
  setMode(mode) {
    this.mode = mode;
    for (const sp of this.species)
      for (const [m, list] of Object.entries(sp.alts || {})) for (const rec of list) { rec.mesh.visible = m === mode; rec.geo.instanceCount = 0; }
    this.last.set(1e9, 1e9);
  }

  // clump grid of a species (m): a clump cell holds on average as many plants as `size` plant cells
  clumpGrid(sp) { return sp.cell * Math.sqrt((CLUMP[sp.name] || [1, 0])[0]); }

  // The plants of clump cell (gx, gz) of species sp, whatever the distance: put(x, y, z, height,
  // seed, key, posture variant, px, gz) for each. Plants come in clumps (a parent and its
  // seedlings, one rootstock's shoots): a clump holds on average as many plants as `size` plant
  // cells would, all within ~sigma of its centre -- so the mean density is the map's, but plants
  // gather. The modelled plants (update()) and their pictures (midplants.js) both come from here.
  clumpPlants(sp, gx, gz, put) {
    const [size, sigma] = CLUMP[sp.name] || [1, 0];
    const G = this.clumpGrid(sp), kf = sp.idx * 3;
    const x0 = (gx + hash2(gx, gz, kf + 1)) * G, z0 = (gz + hash2(gx, gz, kf + 2)) * G;
    const dens = sp.map ? this.sample(sp.map, x0, z0) * sp.maxDens * (floraIndex(sp.map) >= 0 ? worldUniforms.uFlora.value : 1)
      : this.meadowAt(x0, z0) * (1 - 0.5 * Math.min(1, Math.max(0, (this.coverAt(x0, z0) - 0.02) / 0.18)));
    if (dens <= 0 || hash2(gx, gz, kf + 4) > dens) return;
    // clumps of very different sizes: a lone stem, a few, a dozen
    const u = hash2(gx, gz, kf + 8);
    const count = size <= 1 ? 1 : Math.max(1, Math.round(size * (0.25 + 2 * u * u * (1.5 - 0.5 * u))));   // mean = size
    const hClump = hash2(gx, gz, kf + 6);
    for (let p = 0; p < count; p++) {
      const px = gx * 64 + p;   // per-plant hash coordinate
      let x = x0, z = z0;
      if (sigma > 0) {
        const rr = Math.min(2.5, Math.sqrt(-2 * Math.log(Math.max(hash2(px, gz, kf + 9), 1e-4)))) * sigma;
        const a = hash2(px, gz, kf + 10) * 6.2832;
        x += Math.cos(a) * rr; z += Math.sin(a) * rr;
      }
      if (this.terrain.streamWet && this.terrain.streamWet(x, z) > 0.3) continue;   // not in the brook
      if (this.excludeAt && this.excludeAt(x, z) > 0.1) continue;                    // nor in a house, a yurt, a shed
      if (this.terrain.trailDist && this.terrain.trailDist(x, z) < 0.55) continue;   // nor on a trail
      const r = hash2(px, gz, kf + 5);
      const y = this.terrain.heightAt(x, z) - 0.02;
      // modelled grass clumps are short turf in the alpine belt (grass.js does the same)
      const alpG = sp.map === null ? Math.min(1, Math.max(0, (y - 2650) / 450)) : 0;
      // the plants of a clump are kin: similar height, a little spread
      const hq = Math.min(1, Math.max(0, hClump + (hash2(px, gz, kf + 11) - 0.5) * 0.5));
      const hh = (sp.height[0] + (sp.height[1] - sp.height[0]) * hq) * (1 - 0.6 * alpG);
      const key = (gx * 1e6 + gz) * 64 + p;
      const vi = Math.min(sp.vars.length - 1, Math.floor(hash2(px, gz, kf + 7) * sp.vars.length));
      put(x, y, z, hh, r, key, vi, px, gz);
    }
  }

  update(camera) {
    if (this.fixed) return;
    const above = camera.userData.aboveGround ?? 0;
    this.group.visible = above < 30;
    if (!this.group.visible) return;
    const cx = camera.position.x, cz = camera.position.z;
    if (Math.hypot(cx - this.last.x, cz - this.last.y) < 2.0) return;
    this.last.set(cx, cz);
    const t0 = performance.now();
    let total = 0;
    for (const sp of this.species) {
      for (const V of sp.vars) swayBegin(V);
      for (const a of (sp.alts && sp.alts[this.mode]) || []) swayBegin(a);
    }
    for (const sp of this.species) {
      const { radius } = sp;
      const [, sigma] = CLUMP[sp.name] || [1, 0];
      const G = this.clumpGrid(sp), reach = radius + 2.5 * sigma;
      const n = Math.ceil(reach / G);
      const gx0 = Math.floor(cx / G), gz0 = Math.floor(cz / G);
      const alts = (sp.alts && sp.alts[this.mode]) || [];
      const kk = alts.map(() => 0);
      const kv = sp.vars.map(() => 0);
      const kf = sp.idx * 3;
      // (no thinning toward the rim: the plants dissolve into their pictures in the shader,
      // world.js uPlantLod, well inside the placement radius)
      const put = (x, y, z, hh, r, key, vi, px, gz) => {
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) return;
        const ai = alts.findIndex((q) => d >= q.r0 && d < q.r1);
        if (ai >= 0) {
          const a = alts[ai], q = kk[ai];
          if (a.density !== undefined && hash2(px, gz, 97) > a.density) return;
          if (q < a.max) { a.iPos.array.set([x, y, z, r * 6.2832], q * 4); a.iPar.array.set([hh, r, 0, 0], q * 4); swayPut(a, q, key, x, z, hh, r); kk[ai]++; }
          return;
        }
        if (sp.map === null) return;   // species that only exist as alternatives (grass clumps)
        const V = sp.vars[vi], k = kv[vi];
        if (k >= V.max) return;
        V.iPos.array.set([x, y, z, r * 6.2832], k * 4);
        swayPut(V, k, key, x, z, hh, r);
        V.iPar.array.set([hh, exemplarSeed(r), 0, 0], k * 4);
        kv[vi]++;
      };
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) {
          const gx = gx0 + i, gz = gz0 + j;
          const x0 = (gx + hash2(gx, gz, kf + 1)) * G, z0 = (gz + hash2(gx, gz, kf + 2)) * G;
          if (Math.hypot(x0 - cx, z0 - cz) > reach) continue;
          this.clumpPlants(sp, gx, gz, put);
        }
      sp.count = 0;
      sp.vars.forEach((V, vi) => {
        const k = kv[vi];
        V.count = k; V.old = null;
        V.geo.instanceCount = k;
        V.iPos.needsUpdate = true; V.iPar.needsUpdate = true;
        V.iPos.clearUpdateRanges(); V.iPar.clearUpdateRanges();
        V.iPos.addUpdateRange(0, k * 4); V.iPar.addUpdateRange(0, k * 4);
        sp.count += k;
      });
      total += sp.count;
      alts.forEach((a, i) => {
        a.geo.instanceCount = kk[i];
        a.iPos.needsUpdate = a.iPar.needsUpdate = true;
        a.iPos.clearUpdateRanges(); a.iPar.clearUpdateRanges();
        a.count = kk[i]; a.old = null;
        total += kk[i];
      });
    }
    this.stats = { ms: performance.now() - t0, instances: total };
  }
}
