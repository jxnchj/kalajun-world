import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { PAD_STEP, NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, PROPMASK_GLSL, VEGMAP_GLSL, FLORA_GLSL, SHRUB_GLSL, STREAM_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// CDLOD terrain: one instanced grid patch, quadtree-selected nodes, vertex morphing between
// levels. Heights come from two float textures (10 m core, 80 m far ring).
// Distance metric (CPU selection and GPU morph) = sqrt(horizontal² + camera-height-above-ground²),
// which keeps neighbouring levels crack-free.

const GRID = 64; // quads per node side (even)
const LEAF = 64; // leaf node size (m) -> 1 m vertex spacing (matches the 1 m detail)
const RANGE_K = 3.2; // ranges[0] = RANGE_K * LEAF
const MORPH_START = 0.7; // morph begins at 70% between previous and current range
const MAX_NODES = 4096;

async function fetchHeights(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let buf = await res.arrayBuffer();
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    // gzip magic: server delivered the raw .gz, decompress here
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  return new Uint16Array(buf);
}

function heightTexture(u16, n, scale) {
  const f = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) f[i] = u16[i] * scale;
  const t = new THREE.DataTexture(f, n, n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return { tex: t, data: f };
}

function loadImageTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.flipY = false; // row 0 = north edge = v 0
        t.colorSpace = THREE.NoColorSpace;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = 8;
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      reject
    );
  });
}

export class Terrain {
  constructor() {
    this.ready = false;
  }

  async load(meta, base = "./data/") {
    const [coreU16, farU16, coreLC, farLC, detailMeta, detailBuf] = await Promise.all([
      fetchHeights(base + "core_height.bin.gz"),
      fetchHeights(base + "far_height.bin.gz"),
      loadImageTexture(base + "core_landcover.png"),
      loadImageTexture(base + "far_landcover.png"),
      fetch(base + "detail.json").then((r) => r.json()),
      fetchHeights(base + "detail.bin.gz"),
    ]);
    // 1 m detail (RGBA8): shared with the shaders and mirrored for CPU height queries
    const dn = detailMeta.size;
    const dbytes = new Uint8Array(detailBuf.buffer, detailBuf.byteOffset, dn * dn * 4);
    const dtex = new THREE.DataTexture(dbytes, dn, dn, THREE.RGBAFormat, THREE.UnsignedByteType);
    dtex.minFilter = dtex.magFilter = THREE.LinearFilter;
    dtex.generateMipmaps = false;
    dtex.needsUpdate = true;
    worldUniforms.uDetail.value = dtex;
    worldUniforms.uDetailOrigin.value.set(detailMeta.origin[0], detailMeta.origin[1]);
    worldUniforms.uDetailSize.value = dn * detailMeta.res;
    worldUniforms.uDetailScale.value = detailMeta.scale;
    this.detail = { data: dbytes, n: dn, x0: detailMeta.origin[0], z0: detailMeta.origin[1], res: detailMeta.res, scale: detailMeta.scale };
    this.meta = meta;
    const core = heightTexture(coreU16, meta.core.n, meta.height_scale);
    const far = heightTexture(farU16, meta.far.n, meta.height_scale);
    this.core = { ...meta.core, half: meta.core.size / 2, data: core.data };
    this.far = { ...meta.far, half: meta.far.size / 2, data: far.data };
    let lo = Infinity, hi = -Infinity;
    for (const d of [core.data, far.data]) for (let i = 0; i < d.length; i += 7) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
    this.minH = lo - 50;
    this.maxH = hi + Math.max(hi - 2100, 0) * worldUniforms.uExag.value + 50; // incl. backdrop exaggeration

    // LOD ranges
    this.levels = Math.round(Math.log2(meta.far.size / LEAF)) + 1;
    this.rootSize = LEAF * 2 ** (this.levels - 1);
    this.ranges = [];
    const morphStart = [], morphEnd = [];
    for (let l = 0; l < this.levels; l++) {
      const r = RANGE_K * LEAF * 2 ** l;
      const prev = l === 0 ? 0 : this.ranges[l - 1];
      this.ranges.push(r);
      morphStart.push(prev + (r - prev) * MORPH_START);
      morphEnd.push(r);
    }
    this.ranges[this.levels - 1] = 1e9; // root always selectable

    // geometry: GRID x GRID quads, positions in grid units
    const verts = new Float32Array((GRID + 1) * (GRID + 1) * 3);
    let k = 0;
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) { verts[k++] = i; verts[k++] = 0; verts[k++] = j; }
    const idx = [];
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const a = j * (GRID + 1) + i, b = a + 1, c = a + GRID + 1, d = c + 1;
        // alternate diagonals for nicer shading
        if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, c, d, a, d, b);
      }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    this.nodeAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4);
    this.nodeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aNode", this.nodeAttr);
    geo.instanceCount = 0;
    this.geometry = geo;

    worldUniforms.uCoreH.value = core.tex;
    worldUniforms.uFarH.value = far.tex;
    worldUniforms.uCoreLC.value = coreLC;
    worldUniforms.uFarLC.value = farLC;
    worldUniforms.uCoreHalf.value = this.core.half;
    worldUniforms.uCoreRes.value = this.core.res;
    worldUniforms.uCoreN.value = this.core.n;
    worldUniforms.uFarHalf.value = this.far.half;
    worldUniforms.uFarRes.value = this.far.res;
    worldUniforms.uFarN.value = this.far.n;
    this.uniforms = {
      ...atmos,
      ...worldUniforms,
      ...shadowUniforms,
      ...shadowUniforms,
      uMorphStart: { value: morphStart },
      uMorphEnd: { value: morphEnd },
      uCamAboveGround: { value: 0 },
      uGrid: { value: GRID },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      defines: { LEVELS: this.levels },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.ready = true;
    return this;
  }

  // CPU land-cover lookup (r forest, g bare, b snow) for placing things on the CPU side
  landcoverSampler() {
    const read = (tex) => {
      const img = tex.image;
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return { data: g.getImageData(0, 0, img.width, img.height).data, n: img.width };
    };
    const core = read(worldUniforms.uCoreLC.value), far = read(worldUniforms.uFarLC.value);
    const out = { r: 0, g: 0, b: 0 };
    return (x, z) => {
      const inCore = Math.abs(x) < this.core.half && Math.abs(z) < this.core.half;
      const src = inCore ? core : far, half = inCore ? this.core.half : this.far.half;
      const i = Math.min(src.n - 1, Math.max(0, Math.floor(((x + half) / (2 * half)) * src.n)));
      const j = Math.min(src.n - 1, Math.max(0, Math.floor(((z + half) / (2 * half)) * src.n)));
      const k = (j * src.n + i) * 4;
      out.r = src.data[k] / 255; out.g = src.data[k + 1] / 255; out.b = src.data[k + 2] / 255;
      return out;
    };
  }

  // --- CPU height query (mirror of the shader) ---
  _grid(g, x, z) {
    let u = (x + g.half) / g.res - 0.5, v = (z + g.half) / g.res - 0.5;
    const n = g.n;
    let i0 = Math.floor(u), j0 = Math.floor(v);
    const fx = u - i0, fz = v - j0;
    const c = (a) => Math.min(n - 1, Math.max(0, a));
    const i1 = c(i0 + 1), j1 = c(j0 + 1);
    i0 = c(i0); j0 = c(j0);
    const d = g.data;
    const h00 = d[j0 * n + i0], h10 = d[j0 * n + i1], h01 = d[j1 * n + i0], h11 = d[j1 * n + i1];
    return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
  }

  // bilinear sample of one detail channel (0: height delta in m, 1..3: masks 0..1)
  detailAt(x, z, ch) {
    const d = this.detail;
    const u = (x - d.x0) / d.res - 0.5, v = (z - d.z0) / d.res - 0.5;
    if (u < 0 || v < 0 || u >= d.n - 1 || v >= d.n - 1) return 0;
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const g = (a, b) => d.data[(b * d.n + a) * 4 + ch];
    const val = (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fz) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fz;
    return ch === 0 ? (val - 128) * d.scale : val / 255;
  }

  // the ground lowered under the houses (slice.js buildPads): data n x n bytes over [x0, x0+size)
  // from (z0); the GPU reads the same through world.js uPads, bilinear like this
  setPads(P) {
    const t = new THREE.DataTexture(P.data, P.W, P.H, THREE.RedFormat, THREE.UnsignedByteType);
    t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.needsUpdate = true;
    worldUniforms.uPads.value = t;
    worldUniforms.uPadOrigin.value.set(P.x0, P.z0);
    worldUniforms.uPadSize.value = P.size;
    worldUniforms.uPadAtlas.value.set(P.W, P.H, P.n);
    P.tiles.forEach((t, i) => worldUniforms.uPadTiles.value[i].set(t.x0, t.z0, t.size, 0));
    this.pads = P;
  }

  padLower(x, z) {
    const P = this.pads;
    if (!P) return 0;
    // bilinear in an n x n block of `d` (row stride `w`, at column ox, row oy) at block coords (u, v) in 0..1
    const bil = (d, w, ox, oy, n, u, v) => {
      const fx = Math.min(Math.max(u * n - 0.5, 0), n - 1), fz = Math.min(Math.max(v * n - 0.5, 0), n - 1);
      const i = Math.floor(fx), j = Math.floor(fz), i1 = Math.min(i + 1, n - 1), j1 = Math.min(j + 1, n - 1), tx = fx - i, tz = fz - j;
      const at = (a, b) => d[(oy + b) * w + ox + a];
      return (at(i, j) * (1 - tx) + at(i1, j) * tx) * (1 - tz) + (at(i, j1) * (1 - tx) + at(i1, j1) * tx) * tz;
    };
    let h = 0;
    const u = (x - P.x0) / P.size, v = (z - P.z0) / P.size;
    if (u >= 0 && v >= 0 && u <= 1 && v <= 1) h = bil(P.data, P.W, 0, 0, P.n, u, v);
    P.tiles.forEach((t, k) => {
      const a = (x - t.x0) / t.size, b = (z - t.z0) / t.size;
      if (a < 0 || b < 0 || a > 1 || b > 1) return;
      h = Math.max(h, bil(P.data, P.W, P.n, k * 512, 512, a, b));
    });
    return h * PAD_STEP;
  }

  heightAt(x, z) {
    const dx = this.core.half - Math.abs(x), dz = this.core.half - Math.abs(z);
    let w = Math.min(1, Math.max(0, Math.min(dx, dz) / 600));
    w = w * w * (3 - 2 * w);
    const hf = w < 1 ? this._grid(this.far, x, z) : 0;
    const hc = w > 0 ? this._grid(this.core, x, z) : 0;
    const h = hf + (hc - hf) * w + this.detailAt(x, z, 0) - (this.carve ? this.carve(x, z) : 0) - (this.pads ? this.padLower(x, z) : 0);
    const c = worldUniforms.uExagCentre.value;
    let t = Math.min(1, Math.max(0, (Math.hypot(x - c.x, z - c.y) - 15000) / 12000));
    t = t * t * (3 - 2 * t);
    return h + Math.max(h - 2100, 0) * worldUniforms.uExag.value * t;
  }

  // --- quadtree selection ---
  update(camera) {
    const cam = camera.position;
    const above = Math.max(0, cam.y - this.heightAt(cam.x, cam.z));
    this.uniforms.uCamAboveGround.value = above;
    this._frustum = this._frustum || new THREE.Frustum();
    this._m = this._m || new THREE.Matrix4();
    this._box = this._box || new THREE.Box3();
    this._frustum.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this._count = 0;
    this._above2 = above * above;
    this._cx = cam.x; this._cz = cam.z;
    const h = this.rootSize / 2;
    this._select(-h, -h, this.rootSize, this.levels - 1);
    this.geometry.instanceCount = this._count;
    this.nodeAttr.needsUpdate = true;
    this.nodeAttr.addUpdateRange(0, this._count * 4);
    return this._count;
  }

  _dist(x, z, size) {
    const dx = Math.max(x - this._cx, 0, this._cx - (x + size));
    const dz = Math.max(z - this._cz, 0, this._cz - (z + size));
    return Math.sqrt(dx * dx + dz * dz + this._above2);
  }

  _push(x, z, size, level) {
    if (this._count >= MAX_NODES) return;
    const a = this.nodeAttr.array, o = this._count * 4;
    a[o] = x; a[o + 1] = z; a[o + 2] = size; a[o + 3] = level;
    this._count++;
  }

  _select(x, z, size, level) {
    const d = this._dist(x, z, size);
    if (d > this.ranges[level]) return false;
    this._box.min.set(x, this.minH - 800, z); // slack for earth-curvature drop
    this._box.max.set(x + size, this.maxH, z + size);
    if (!this._frustum.intersectsBox(this._box)) return true;
    if (level === 0 || d > this.ranges[level - 1]) {
      this._push(x, z, size, level);
      return true;
    }
    const s = size / 2;
    for (const [ox, oz] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      if (!this._select(x + ox, z + oz, s, level - 1)) this._push(x + ox, z + oz, s, level - 1);
    }
    return true;
  }
}

const VERT = /* glsl */ `
attribute vec4 aNode;           // origin x, origin z, size, level
uniform float uMorphStart[LEVELS];
uniform float uMorphEnd[LEVELS];
uniform float uCamAboveGround;
uniform float uGrid;
uniform float uCurvature;
varying vec3 vWorld;
varying float vDist;
${HEIGHT_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  float scale = aNode.z / uGrid;
  vec2 g = position.xz;
  vec2 wp = aNode.xy + g * scale;
  vec2 dh = wp - cameraPosition.xz;
  float dist = sqrt(dot(dh, dh) + uCamAboveGround * uCamAboveGround);
  int lvl = int(aNode.w + 0.5);
  float k = clamp((dist - uMorphStart[lvl]) / (uMorphEnd[lvl] - uMorphStart[lvl]), 0.0, 1.0);
  g -= fract(g * 0.5) * 2.0 * k;   // odd vertices slide onto even ones
  wp = aNode.xy + g * scale;
  float h = terrainHeight(wp);
  vWorld = vec3(wp.x, h, wp.y);
  dh = wp - cameraPosition.xz;
  vDist = length(dh);
  vec3 p = vWorld;
  p.y -= dot(dh, dh) * uCurvature;   // earth curvature + refraction
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec3 vWorld;
varying float vDist;
${ATMOS_GLSL}
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
${MEADOW_GLSL}
${PROPMASK_GLSL}
${VEGMAP_GLSL}
${FLORA_GLSL}
${SHRUB_GLSL}
${STREAM_GLSL}
uniform sampler2D uSward;
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vWorld.xz;
  float cw = coreWeight(p);
  vec4 det = detailAt(p);
  bool inDetail = det.a + det.g + det.b > 0.0 || abs(det.r - 128.0 / 255.0) > 0.001;
  float e = max(mix(80.0, inDetail ? mix(1.0, 5.0, smoothstep(40.0, 400.0, vDist)) : 5.0, cw), vDist * 0.002);
  vec3 n = terrainNormal(p, e);

  // painterly micro relief near the camera (shading only)
  float near = 1.0 - smoothstep(200.0, 1400.0, vDist);
  if (near > 0.0) {
    vec2 q = p * 0.045;
    float c0 = fbm(q, 2);
    float gx = fbm(q + vec2(0.35, 0.0), 2) - c0;
    float gz = fbm(q + vec2(0.0, 0.35), 2) - c0;
    n = normalize(n + vec3(-gx, 0.0, -gz) * 0.6 * near);
  }

  vec3 lc = landcover(p);
  float forest = smoothstep(0.25, 0.75, lc.r);
  float slope = 1.0 - n.y;
  float bare = smoothstep(0.2, 0.7, lc.g);
  float steep = smoothstep(0.55, 0.85, slope);
  float alt = vWorld.y;
  float highAlt = smoothstep(2900.0, 3300.0, alt);
  // Tianshan alpine zone (as in photos 4 and 8): above ~2800 m the meadow thins into scree and
  // rock ribs; north-facing gullies hold snow patches above ~3200 m; permanent snow above ~3900 m.
  float rock = steep, tundra = bare * highAlt * (1.0 - steep), ribs = 0.0;
  float snow = smoothstep(0.2, 0.6, lc.b);
  if (alt > 2600.0) {
    // gully/rib pattern: ridged noise stretched down-slope
    vec2 dn = normalize(n.xz + 1e-4);
    vec2 q = vec2(dot(p, vec2(-dn.y, dn.x)) * 0.012, dot(p, dn) * 0.0035);
    ribs = 1.0 - abs(vnoise(q) * 2.0 - 1.0);
    ribs = ribs * ribs;
    // the fall line (and so the rib direction) wanders on gentle ground: fade the ribs out there,
    // or they draw swirls
    float ribsRaw = ribs;
    float ribsS = ribs * smoothstep(0.12, 0.4, slope);
    float alpine = smoothstep(2750.0, 3150.0, alt + (vnoise(p * 0.003) - 0.5) * 250.0);
    // the land cover says where the belt is bare: 95 % of 2800-3000 m and 77 % of 3000-3200 m is
    // alpine turf, half of 3200-3400 m, little above. Rock ribs and gravel only where it is bare
    // (or very high); on the turf the meadow just turns sere (meadowColor)
    float barren = max(bare, smoothstep(3350.0, 3650.0, alt + (vnoise(p * 0.004) - 0.5) * 200.0));
    rock = max(steep, alpine * barren * smoothstep(0.3, 0.75, ribsS + slope * 0.9) * 0.9);
    ribs = ribsS;
    tundra = max(bare * highAlt, alpine * mix(0.2, 1.0, barren)) * (1.0 - rock);
    float north = smoothstep(0.1, 0.6, -n.z / max(length(n.xz), 1e-3) * min(1.0, slope * 4.0));  // faces north (-z)
    float gully = smoothstep(0.45, 0.15, ribsRaw);
    float patches = smoothstep(3150.0, 3450.0, alt) * north * gully * (1.0 - smoothstep(0.75, 0.95, slope));
    float snowLine = 3850.0 + (vnoise(p * 0.002) - 0.5) * 300.0;
    float cap = smoothstep(snowLine, snowLine + 150.0, alt) * (1.0 - 0.55 * smoothstep(0.7, 0.95, slope) * ribs);
    snow = max(max(snow, cap), patches * 0.95);
  }

  vec3 grass = meadowColor(p, vWorld.y, bare);
  // under the blades near the camera the ground is the lower layer of the sward: short leaves
  // lying every which way (painted, tools/paint_sward.py), two samplings at different scales and
  // turns so the 0.8 m tile doesn't repeat, tinted by the local meadow colour
  float underS = 1.0 - smoothstep(30.0, 70.0, vDist);
  if (underS > 0.0) {
    const vec3 SWARD_MEAN = vec3(0.0734, 0.1583, 0.0277);
    vec3 t1 = texture2D(uSward, p / 0.8).rgb;
    vec3 t2 = texture2D(uSward, mat2(0.6, -0.8, 0.8, 0.6) * p / 1.1 + 0.37).rgb;
    vec3 t = mix(t1, t2, smoothstep(0.3, 0.7, vnoise(p * 0.45 + 2.0)));
    // quiet: a soft hint of leaves, not a busy pattern
    vec3 low = mix(vec3(1.0), t / SWARD_MEAN, 0.45) * grass * mix(0.72, 0.88, vnoise(p * 0.3 + 5.0));
    grass = mix(grass, low, underS);
  }
  // beyond the grass blades (grass.js fades out 60-85 m) the ground stands for the whole sward:
  // blades shade each other, so the sward is darker and less yellow than its blade colour.
  // Measured by rendering the same views with and without the plants (tools/farcal.py).
  const vec3 CANOPY = vec3(0.88, 0.82, 1.0);
  grass *= mix(vec3(1.0), CANOPY, max(smoothstep(60.0, 85.0, vDist), uFarRef));
  // the gusts and canopy puffs sweeping the meadow show from afar as a sheen: bowed blades
  // show more of their paler, glossier sides (around the mean bend, so the colour holds)
  float gust = (windBend(p) - 0.1) * (1.0 - smoothstep(1500.0, 4000.0, vDist));
  grass *= 1.0 + 0.45 * gust;
  // trampled earth around camps, under buildings and along paths
  vec2 pm = propMask(p);
  grass = mix(grass, vec3(0.2, 0.17, 0.09), clamp(pm.g * 0.75 + pm.r * 0.6, 0.0, 0.85) * (0.8 + 0.2 * vnoise(p * 0.8)));
  // terracettes: livestock paths along the contours (1 per metre of rise), lighter treads
  // with a darker riser below; drawn per pixel so they stay crisp
  if (det.a > 0.01 && vDist < 1500.0) {
    float hc = vWorld.y + (vnoise(p * 0.08) - 0.5) * 0.9;
    float ph = fract(hc / 1.05);
    float tread = smoothstep(0.08, 0.02, abs(ph - 0.5)) ;
    float riser = smoothstep(0.1, 0.0, abs(ph - 0.62));
    float fadeT = det.a * (1.0 - smoothstep(600.0, 1500.0, vDist)) * smoothstep(0.35, 0.6, vnoise(p * 0.05 + 3.0) + 0.3);
    grass = mix(grass, grass * vec3(1.25, 1.15, 0.8) + vec3(0.03, 0.02, 0.0), tread * fadeT * 0.8);
    grass *= 1.0 - riser * fadeT * 0.25;
  }
  // hollows (gullies, dips) read as lusher darker green, bumps as sun-dried: makes the 1 m
  // relief legible from a distance, as painters do
  float dd = (det.r * 255.0 - 128.0) * uDetailScale;
  grass *= mix(vec3(1.0), vec3(0.72, 0.85, 0.8), clamp(-dd * 1.4, 0.0, 1.0));
  grass = mix(grass, grass * vec3(1.18, 1.1, 0.8), clamp(dd * 1.2, 0.0, 0.6));
  // The meadow's flowers beyond the grass ring (~80 m), where no plant is drawn: the same
  // petal cover the modelled plants and the flower rings have at this spot (floraCovers).
  // Out to ~380 m they are painted as flower-coloured dabs sized to the pixel footprint (on
  // with probability cover / DAB_A; cover beyond what the dabs hold is an even share); farther
  // out a dab would be bigger than a flower, so the share is spread evenly. The result is a
  // flower colour flAlb and the share flW of this pixel it takes; flowers are lit and blended
  // with the sward below, after the tone curve, as they are when drawn one by one.
  vec3 flAlb = vec3(0.0);
  float flW = 0.0;
  float sinE = dot(normalize(cameraPosition - vWorld), n);   // view elevation over the slope
  {
    // open sward only, as for the flower rings (forest, scree and snow are blended over later)
    float meadowOpen = (1.0 - smoothstep(0.05, 0.4, det.g)) * (1.0 - smoothstep(0.2, 0.6, det.b)) * (1.0 - smoothstep(0.1, 0.5, pm.r));
    float cv[NFLORA];
    float Craw = floraCovers(p, sinE, cv);
    float C = floraSeen(Craw) * meadowOpen;
    float show = max(smoothstep(72.0, 90.0, length(vWorld - cameraPosition)), uFarRef);   // (3D: as flowers.js fades, from above too)
    if (C > 0.001 && show > 0.0) {
      const float DAB_A = 0.21;
      float fw = max(length(fwidth(p)), 1e-4);
      float lv = log2(max(fw * 2.2 / 0.7, 1.0));
      float l0 = floor(lv), tl = lv - l0;
      vec3 dcol = vec3(0.0);
      float dab = 0.0;
      float Pon = min(C / DAB_A, 1.0);
      for (int o = 0; o < 2; o++) {
        float sz = 0.7 * exp2(l0 + float(o));
        vec2 cp = p / sz;
        vec2 ci = floor(cp);
        vec2 f = fract(cp) - (0.27 + 0.46 * hash22(ci + sz));
        float r = 0.22 + 0.04 * hash12(ci + 3.0 + sz);                 // mean area ~ DAB_A
        float on = step(hash12(ci + 7.0 + sz), Pon) * (1.0 - smoothstep(r * 0.75, r, length(f)));
        float wgt = on * (o == 0 ? 1.0 - tl : tl);
        dcol += floraPick(cv, Craw, hash12(ci + 11.0 + sz)) * wgt;
        dab += wgt;
      }
      dcol /= max(dab, 1e-4);
      vec3 mean = floraMean(cv, Craw);
      float rest = max(C - DAB_A, 0.0) / (1.0 - DAB_A);
      float wD = clamp(dab, 0.0, 1.0);
      float wDab = wD + (1.0 - wD) * rest;
      vec3 cDab = (dcol * wD + mean * (1.0 - wD) * rest) / max(wDab, 1e-4);
      float nearDabs = (1.0 - smoothstep(160.0, 380.0, vDist)) * (1.0 - uFarRef);
      // seen from above, more of each flower hides in the grass than the cover model allows:
      // measured against the flower rings at 8, 30 and 65 degrees (tools/farcal.py)
      float gain = mix(1.0, 0.65, smoothstep(0.15, 0.5, sinE));
      flW = mix(C, wDab, nearDabs) * show * gain;
      flAlb = mix(mean, cDab, nearDabs);
    }
  }
  // dirt tracks and exposed earth on cut banks / gully walls
  vec3 dirt = mix(vec3(0.27, 0.21, 0.13), vec3(0.36, 0.3, 0.2), vnoise(p * 0.7));
  float ruts = smoothstep(0.3, 0.7, vnoise(p * vec2(1.3, 1.3)));
  grass = mix(grass, dirt * (0.9 + 0.15 * ruts), smoothstep(0.15, 0.7, det.g));
  vec3 earth = mix(vec3(0.24, 0.17, 0.1), vec3(0.33, 0.25, 0.16), vnoise(p * 1.7 + 9.0));
  grass = mix(grass, earth, smoothstep(0.2, 0.75, det.b) * 0.85);

  // forest floor: Schrenk spruce stands are open, the ground is a moss carpet with needle
  // litter under the crowns and herbs and grass in the gaps; needles, twigs and cones up close
  float fm = fbm(p * 0.09, 3);
  float herbP = smoothstep(0.5, 0.72, vnoise(p * 0.07 + 11.0) * 0.7 + vnoise(p * 0.4) * 0.3);
  vec3 moss = mix(vec3(0.05, 0.085, 0.025), vec3(0.1, 0.14, 0.035), vnoise(p * 0.6 + 4.0));
  vec3 litter = mix(vec3(0.068, 0.058, 0.03), vec3(0.1, 0.085, 0.045), vnoise(p * 1.1 + 2.0));   // olive-brown needles
  vec3 forestFloor = mix(litter, moss, smoothstep(0.3, 0.55, fm));
  forestFloor = mix(forestFloor, vec3(0.07, 0.115, 0.04), herbP * 0.7);
  if (vDist < 60.0) {
    float sp = vnoise(p * 14.0) * 0.6 + vnoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 4.0 + 3.0) * 0.4;
    forestFloor *= mix(1.0, mix(0.78, 1.15, sp), 1.0 - smoothstep(30.0, 60.0, vDist));
  }
  vec3 canopy = vec3(0.018, 0.055, 0.045);
  vec3 forestCol = mix(forestFloor, canopy, smoothstep(300.0, 2000.0, vDist));
  // painted rock: warm grey with faint horizontal strata
  // strata follow the contours: only on steep rock faces (on gentle ground they would draw swirls)
  float strata = sin(vWorld.y * 0.12 + vnoise(p * 0.004) * 4.0) * smoothstep(0.35, 0.7, slope);
  vec3 rockCol = mix(vec3(0.2, 0.19, 0.2), vec3(0.3, 0.27, 0.24), ribs) * (1.0 + 0.1 * strata) * mix(0.9, 1.1, vnoise(p * 0.02));
  // (the rib pattern follows the fall line, so it only reads on real slopes -- on gentle ground
  // its direction wanders and would draw swirls)
  vec3 tundraCol = mix(vec3(0.2, 0.2, 0.15), vec3(0.31, 0.28, 0.23), vnoise(p * 0.008) * 0.6 + ribs * 0.4 * smoothstep(0.15, 0.45, slope));
  // near the camera bare alpine ground is gravel: small stones (4-20 cm), each a little darker
  // or lighter than the ground and lit across its face; faded out by 150 m
  if (vDist < 150.0 && tundra + rock > 0.05) {
    float gv = 0.0;
    vec3 gc = vec3(0.0);
    for (int o = 0; o < 2; o++) {
      float sz = o == 0 ? 0.08 : 0.2;
      vec2 cp = p / sz, ci = floor(cp);
      vec2 f = fract(cp) - (0.3 + 0.4 * hash22(ci + float(o) * 7.0));
      float r = 0.18 + 0.16 * hash12(ci + 3.0 + float(o));
      float d = length(f) / r;
      float on = step(hash12(ci + 5.0 + float(o)), o == 0 ? 0.55 : 0.18) * (1.0 - smoothstep(0.7, 1.0, d));
      float lit = 0.95 + 0.12 * dot(f / r, vec2(-0.55, -0.83));         // lit from the upper left
      vec3 c = tundraCol * mix(0.78, 1.06, hash12(ci + 11.0)) * mix(vec3(1.0), vec3(0.95, 0.97, 1.02), hash12(ci + 13.0)) * lit;
      gc = mix(gc, c, on);
      gv = max(gv, on);
    }
    float near = 1.0 - smoothstep(80.0, 150.0, vDist);
    tundraCol = mix(tundraCol, gc, gv * near * 0.8);
    rockCol = mix(rockCol, gc * 0.9, gv * near * 0.4);
  }
  vec3 snowCol = vec3(0.78, 0.82, 0.9);

  vec3 albedo = mix(grass, forestCol, forest);
  albedo = mix(albedo, tundraCol, tundra * (1.0 - forest));
  albedo = mix(albedo, rockCol, rock * (1.0 - forest));
  albedo = mix(albedo, snowCol, snow);
  // brooks (streams.js): lush, darker wet banks; the bed under the water is stony -- pebbles and
  // wet stones, darker and cooler than the dry gravel
  // trails beyond their near strips (trails.js draws them within ~420 m): a thin line of earth
  float trl = trailMark(p) * smoothstep(330.0, 420.0, vDist) * (1.0 - snow);
  albedo = mix(albedo, mix(vec3(0.24, 0.18, 0.11), vec3(0.12, 0.09, 0.06), forest), smoothstep(0.25, 0.8, trl) * 0.75);
  float wet = streamWet(p);
  if (wet > 0.004) {
    float bank = smoothstep(0.0, 0.55, wet) * (1.0 - snow);
    albedo *= mix(vec3(1.0), vec3(0.8, 0.9, 0.8), bank);
    vec3 bed = mix(vec3(0.055, 0.055, 0.04), vec3(0.12, 0.115, 0.085), vnoise(p * 2.3));   // wet, dark, a little moss
    if (vDist < 120.0) {
      for (int o = 0; o < 2; o++) {
        float sz = o == 0 ? 0.12 : 0.3;
        vec2 cp = p / sz, ci = floor(cp);
        vec2 f = fract(cp) - (0.3 + 0.4 * hash22(ci + float(o) * 5.0));
        float r = 0.2 + 0.18 * hash12(ci + 2.0 + float(o));
        float on = step(hash12(ci + 9.0 + float(o)), o == 0 ? 0.6 : 0.3) * (1.0 - smoothstep(0.7, 1.0, length(f) / r));
        float lit = 0.92 + 0.15 * dot(f / r, vec2(-0.55, -0.83));
        bed = mix(bed, vec3(0.12, 0.115, 0.1) * mix(0.6, 1.25, hash12(ci + 13.0)) * lit, on * (1.0 - smoothstep(60.0, 120.0, vDist)));
      }
    }
    // (the mask has 4 m texels: only its core is the bed, just wider than the water)
    albedo = mix(albedo, bed, smoothstep(0.86, 0.99, wet) * 0.5);   // (the water ribbon draws the bed itself)
  }
  // shrubs (shrubs.js, same placement): soft contact shadow under each crown near the camera;
  // beyond the shrub cards (650-800 m, where they fade out) the ground takes their colour
  if (vDist < 220.0) {
    vec2 sw0 = shrubWeights(p);
    if (sw0.x + sw0.y > 0.004) {
      vec2 c = floor(p / SHRUB_CELL);
      float occ = 0.0;
      for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++) {
          float sw_, sd_;
          vec4 sh = shrubAt(c + vec2(float(dx), float(dy)), sw_, sd_);
          if (sh.w > 0.0) occ = max(occ, 1.0 - smoothstep(0.3, 1.05, length(p - sh.xy) / (sw_ * 0.5)));
        }
      albedo *= 1.0 - 0.6 * occ * (1.0 - smoothstep(160.0, 220.0, vDist));
    }
  }
  {
    float fs = max(smoothstep(650.0, 800.0, vDist), uFarRef);
    if (fs > 0.0) {
      vec3 scol;
      float sc = shrubCover(p, scol);
      albedo = mix(albedo, scol * 0.85, sc * fs * (1.0 - forest) * (1.0 - snow));
    }
  }

  float vis = groundSunVis(p, 0.3, forest, vDist) * objectShadow(vWorld, n);
  vec3 col = toonLight(albedo, n, vis, 0.08);
  // meadows seen against the sun show the shaded side of the blades
  vec3 viewDir = normalize(vWorld - cameraPosition);
  float meadow = (1.0 - forest) * (1.0 - rock) * (1.0 - tundra) * (1.0 - snow);
  float against = pow(max(dot(viewDir, uSunDir), 0.0), 2.0) * meadow * vis;
  col *= 1.0 - 0.45 * against;
  col = applyAtmosphere(col, cameraPosition, vWorld);
  // where the grass blades are gone (beyond 60-85 m) the ground stands for the sward. From
  // above a real sward shows more lit blade tops and less shade than the flat ground does:
  // matched to renders of the blades (tools/farcal.py, no flowers) at 8, 30 and 65 degrees,
  // as a factor on the displayed colour so it holds at any brightness.
  float swardFar = meadow * max(smoothstep(60.0, 85.0, vDist), uFarRef);
  if (swardFar > 0.001) {
    vec3 corr = mix(vec3(1.02, 1.05, 0.97), vec3(1.16, 1.26, 0.98), smoothstep(0.15, 0.5, sinE));
    col = untone(tone(col) * mix(vec3(1.0), corr, swardFar));
  }
  // flowers of the far meadow, lit like the flower heads of flowers.js (facing up, backlit
  // glow) and blended with the sward after the tone curve
  float fW = flW * meadow;
  if (fW > 0.001) {
    vec3 fc = toonLight(flAlb, vec3(0.0, 1.0, 0.0), vis, 0.3);
    fc += uSunColor * flAlb * pow(max(dot(viewDir, uSunDir), 0.0), 2.0) * 0.2 * vis;
    fc = applyAtmosphere(min(fc, vec3(1.6)), cameraPosition, vWorld);
    col = untone(mix(tone(col), tone(fc), fW));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
