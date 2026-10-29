import {createTerrainShadowDomain} from './terrain-shadow-domain.js';
import {TerrainSiblingBatches,terrainSiblingBatchPolicy42} from "./terrain-sibling-batches.js";
import {yieldWorldPreparation} from "./preparation-yield.js";
import * as THREE from "three";
import { createTerrainMaterial, terrainRockFraction, TERRAIN_SHORE_SAMPLING } from "./terrain-material.js";
import { TerrainSampleCache } from "./terrain-sample-cache.js";
import { TerrainTileCache } from "./terrain-tile-cache.js";
import { getMeadowLandform } from "./meadow-surface.js";
import { shoreTerrainBedCoverage } from "./shore-material.js";

// A geographic surface, not a camera-dependent landscape. Every top vertex is
// sampled from the same height function as physics. Only sampling density changes.
const GRID = 32;
const BASE_TILES = 8;
const MIN_TILE_SIZE = 10;
const FOUNDATION_EDGE_TILE_SIZE = 1.25;
const SPLIT_RANGE = 1.65;
const MERGE_RANGE = 2.15;
const BUILD_BUDGET_MS = 3;
const MAX_UPLOADS_PER_FRAME = 2;
const PLAN_INTERVAL = 0.12;
const MORPH_SECONDS = 0.45;
const MORPH_GUARD_METRES = 420;
const MORPH_MIN_TILE_SIZE = 80;
const STRIDE = GRID + 1;
const TOP_VERTICES = STRIDE * STRIDE;
const PERIMETER = GRID * 4;
const VERTICES = TOP_VERTICES + PERIMETER;
const TRIANGLES = GRID * GRID * 2 + PERIMETER * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();

function hash(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x, z, period = 0) {
  const i = Math.floor(x), j = Math.floor(z);
  let u = x - i, v = z - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const h = (a, b) => hash(period ? ((a % period) + period) % period : a, period ? ((b % period) + period) % period : b);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

const PALETTE = {
  fresh: new THREE.Color("#687c43"),
  cool: new THREE.Color("#536e43"),
  dry: new THREE.Color("#8d8656"),
  earth: new THREE.Color("#8a7962"),
  forest: new THREE.Color("#43563b"),
  litter: new THREE.Color("#746952"),
  rock: new THREE.Color("#79796e"),
  alpine: new THREE.Color("#898a70"),
  snow: new THREE.Color("#dce2e5"),
};

function edgeVertices() {
  const a = [];
  // Counter-clockwise viewed from above (x east, z south).
  for (let i = 0; i < GRID; i++) a.push(i);
  for (let j = 0; j < GRID; j++) a.push(j * STRIDE + GRID);
  for (let i = GRID; i > 0; i--) a.push(GRID * STRIDE + i);
  for (let j = GRID; j > 0; j--) a.push(j * STRIDE);
  return a;
}
const EDGES = edgeVertices();

function makeIndices() {
  const out = new Uint16Array(TRIANGLES * 3);
  let k = 0;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * STRIDE + i, b = a + 1, c = a + STRIDE, d = c + 1;
    // All top triangles face +Y; sampled vertices remain on the source surface.
    out[k++] = a; out[k++] = c; out[k++] = b;
    out[k++] = b; out[k++] = c; out[k++] = d;
  }
  for (let i = 0; i < PERIMETER; i++) {
    const j = (i + 1) % PERIMETER, a = EDGES[i], b = EDGES[j], c = TOP_VERTICES + i, d = TOP_VERTICES + j;
    out[k++] = a; out[k++] = b; out[k++] = c;
    out[k++] = b; out[k++] = d; out[k++] = c;
  }
  return out;
}
const INDICES = makeIndices();

export class WorldTerrain {
  constructor(world, { sampleCacheEntries = 65536, tileCacheBytes = 64 * 1024 * 1024 } = {}) {
    if (!world?.surface?.heightAt || !world?.surface?.normalAt || !world?.landcoverAt) {
      throw new TypeError("WorldTerrain requires surface.heightAt, surface.normalAt and landcoverAt.");
    }
    this.world = world;
    this.forestBankSubdivision38 = new URLSearchParams(globalThis.location?.search||"").get("forestBankSubdivision38")!=="0";
    this.size = Number(world.meta?.far?.size) || 81920;
    if (!(this.size > 0) || !Number.isFinite(this.size)) throw new RangeError("Invalid terrain extent.");
    this.group = new THREE.Group();
    this.group.name = "WorldTerrainV2";
    this.submissionBatches=new TerrainSiblingBatches(this.group,terrainSiblingBatchPolicy42(globalThis.location?.search||""));
    const surfaceMaterial = createTerrainMaterial();
    this.textures = surfaceMaterial.textures;
    this.loadSurfaces = surfaceMaterial.loadReferences;
    this.material = surfaceMaterial.material;
    this.shadowDomain=createTerrainShadowDomain(this.group,this.material,{enabled:new URLSearchParams(globalThis.location?.search||"").get("terrainShadowDomain38")==="1",available:()=>!this.submissionBatches.enabled});
    this.materials = [this.material]; // Caller may register once with CSM.setupMaterial.
    this.roots = [];
    this.queue = [];
    this._queueDirty = false; this._nearRadius = 160; this._activePreparation = 0;
    this.sampleCache = new TerrainSampleCache((x, z) => world.surface.heightAt(x, z), { entries: sampleCacheEntries, coordinateScale: 1 / (FOUNDATION_EDGE_TILE_SIZE / GRID), attributeComponents:22 });
    this.tileCache = new TerrainTileCache(tileCacheBytes);
    this._padBounds = (world.surface.pads || []).map((p) => {
      const c = Math.cos(p.rot), s = Math.sin(p.rot), margin = p.bank ? 6 : 0.5;
      const x = p.x + p.cx * c + p.cz * s, z = p.z - p.cx * s + p.cz * c;
      const ex = Math.abs(c) * p.hx + Math.abs(s) * p.hz + margin;
      const ez = Math.abs(s) * p.hx + Math.abs(c) * p.hz + margin;
      return { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, x, z, c, s, hx: p.hx, hz: p.hz, thinBank: !p.bank };
    });
    this.liveNodes = new Set();
    this.morphs = new Set();
    this._color = new THREE.Color();
    this.landform = getMeadowLandform(world);
    this._landformValue = new THREE.Vector2();
    this._landformResponse = [1,1,1,0];
    this._communityResponse = [0,0,0,0];
    this._camera = new THREE.Vector3();
    this._lastPlan = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._frustum = new THREE.Frustum();
    this._projection = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this._elapsed = PLAN_INTERVAL;
    this.disposed = false;
    this._prepareToken = 0;
    this.regularDepth = Math.max(0, Math.ceil(Math.log2((this.size / BASE_TILES) / MIN_TILE_SIZE)));
    this.maxDepth = Math.max(this.regularDepth, Math.ceil(Math.log2((this.size / BASE_TILES) / FOUNDATION_EDGE_TILE_SIZE)));
    this.stats = {
      visibleTiles: 0, residentTiles: 0, queuedTiles: 0, triangles: 0, morphingGroups: 0,
      minSpacing: this.size / BASE_TILES / GRID, maxSpacing: this.size / BASE_TILES / GRID,
      shadowDomain:this.shadowDomain?.stats??null, submissionBatches:this.submissionBatches.stats, buildMs: 0, initialBuildMs: 0, generatedTiles: 0, maxDepth: this.maxDepth, sampleCache: this.sampleCache.stats, tileCache: this.tileCache.stats, restoredTiles: 0,
    };
    const start = now(), s = this.size / BASE_TILES;
    // Complete coarse coverage is present before the first update. All later
    // refinement is incremental; no child replaces its parent before its siblings.
    for (let j = 0; j < BASE_TILES; j++) for (let i = 0; i < BASE_TILES; i++) {
      const node = this._node(-this.size / 2 + i * s, -this.size / 2 + j * s, s, 0, null);
      const job = this._job(node);
      while (job.row <= GRID) this._buildRow(job);
      this._finish(job);
      node.mesh.visible = true;this.shadowDomain?.touch();
      this.roots.push(node);
    }
    this.stats.initialBuildMs = now() - start;
    this._measure();
  }

  _node(x, z, size, depth, parent) {
    const node = { x, z, size, depth, parent, children: null, mesh: null, job: null,
      split: false, wantsSplit: false, dead: false, transition: null, morphWeight: 0, protected: false, minHeight: parent?.minHeight ?? -1000, maxHeight: parent?.maxHeight ?? 7000 };
    const bounds = { minX: x, maxX: x + size, minZ: z, maxZ: z + size };
    node.bounds = bounds;
    node.pads = (parent?.pads || this._padBounds).filter((p) => x < p.maxX && x + size > p.minX && z < p.maxZ && z + size > p.minZ);
    node.riverOverlaps = new Map([[0, Boolean(this.world.hydrology?.intersectsBounds(bounds))]]);
    node.protected = node.pads.length > 0 || node.riverOverlaps.get(0);
    this.liveNodes.add(node);
    return node;
  }

  _job(node) {
    const cached = this.tileCache.take(node.depth + ":" + node.x + "," + node.z);
    if (cached) { const job = { node, row: GRID + 1, cached }; node.job = job; return job; }
    const job = { node, row: 0, positions: new Float32Array(VERTICES * 3), normals: new Float32Array(VERTICES * 3),
      heights: new Float64Array(TOP_VERTICES), centers: new Float64Array(GRID * GRID), colors: new Float32Array(VERTICES * 3), cover: new Float32Array(VERTICES * 3), hydrology: new Float32Array(VERTICES * 4), shoreDistance: new Float32Array(VERTICES), landform: new Float32Array(VERTICES * 4), community: new Float32Array(VERTICES * 4), uvs: new Float32Array(VERTICES * 2), indices: INDICES.slice(), min: Infinity, max: -Infinity };
    node.job = job;
    return job;
  }

  _buildRow(job) {
    if (job.cached) return;
    const { node, positions, normals, colors, cover, hydrology, shoreDistance, landform, community, uvs } = job;
    const j = job.row++, step = node.size / GRID;
    const z = node.z + j * step, surface = this.world.surface;
    for (let i = 0; i <= GRID; i++) {
      const x = node.x + i * step, k = j * STRIDE + i, k3 = k * 3;
      const cache = this.sampleCache, slot = cache.locate(x, z), offset = slot * cache.attributeComponents;
      const parent = node.parent, pi = parent ? (node.x - parent.x) / step / 2 + i / 2 : 0, pj = parent ? (node.z - parent.z) / step / 2 + j / 2 : 0;
      const parentVertex = parent?.heights && !(i & 1) && !(j & 1) ? pj * STRIDE + pi : -1;
      const parentCenter = parent?.centers && (i & 1) && (j & 1) ? Math.floor(pj) * GRID + Math.floor(pi) : -1;
      const y = parentVertex >= 0 ? parent.heights[parentVertex] : parentCenter >= 0 ? parent.centers[parentCenter] : cache.height(slot, x, z);
      job.heights[k] = y;
      if (slot >= 0 && !cache.states[slot]) { cache.heights[slot] = y; cache.states[slot] = 1; }
      if (!Number.isFinite(y)) throw new RangeError("Invalid terrain height at " + x + ", " + z);
      positions[k3] = i * step; positions[k3 + 1] = y; positions[k3 + 2] = j * step;
      uvs[k * 2] = x / 2.4; uvs[k * 2 + 1] = z / 2.4;
      if (parentVertex >= 0) {
        cache.stats.parentVertexHits = (cache.stats.parentVertexHits || 0) + 1;
        for (const [name, target] of [["normal", normals], ["color", colors], ["terrainCover", cover]]) {
          const data = parent.mesh.geometry.attributes[name].array, source = parentVertex * 3;
          target[k3] = data[source]; target[k3 + 1] = data[source + 1]; target[k3 + 2] = data[source + 2];
        }
        const parentHydrology=parent.mesh.geometry.attributes.terrainHydrology.array;
        hydrology.set(parentHydrology.subarray(parentVertex*4,parentVertex*4+4),k*4);
        shoreDistance[k]=parent.mesh.geometry.attributes.terrainShoreDistance.getX(parentVertex);
        const parentLandform=parent.mesh.geometry.attributes.terrainLandform.array;
        landform.set(parentLandform.subarray(parentVertex*4,parentVertex*4+4),k*4);
        const parentCommunity=parent.mesh.geometry.attributes.terrainCommunity.array;
        community.set(parentCommunity.subarray(parentVertex*4,parentVertex*4+4),k*4);
      } else if (slot >= 0 && cache.states[slot] === 2) {
        cache.stats.vertexHits++;
        for (let a = 0; a < 3; a++) {
          normals[k3 + a] = cache.attributes[offset + a]; colors[k3 + a] = cache.attributes[offset + 3 + a];
          cover[k3 + a] = cache.attributes[offset + 6 + a]; hydrology[k*4 + a] = cache.attributes[offset + 9 + a];
        }
        hydrology[k*4+3]=cache.attributes[offset+20];
        shoreDistance[k]=cache.attributes[offset+21];
        for(let a=0;a<4;a++){landform[k*4+a]=cache.attributes[offset+12+a];community[k*4+a]=cache.attributes[offset+16+a];}
      } else {
        cache.stats.vertexMisses++;
        // Sampling scales are fixed physical distances, independent of tile LOD.
        let n = surface.normalAt(x, z, 2);
        const water = this.world.hydrology?.sampleAt(x, z, { includeDepth: false });
        const wet = clamp01(Number(water?.wetness) || 0);
        if (wet > 0.02) {
          const fine = surface.normalAt(x, z, 0.2), w = smooth(0.02, 0.35, wet);
          n = { x: n.x + (fine.x - n.x) * w, y: n.y + (fine.y - n.y) * w, z: n.z + (fine.z - n.z) * w };
        }
        const inv = 1 / (Math.hypot(n.x, n.y, n.z) || 1);
        normals[k3] = n.x * inv; normals[k3 + 1] = n.y * inv; normals[k3 + 2] = n.z * inv;
        const lc = this.world.landcoverAt(x, z);
        cover[k3] = clamp01(Number(lc.r) || 0); cover[k3 + 1] = clamp01(Number(lc.g) || 0); cover[k3 + 2] = clamp01(Number(lc.b) || 0);
        if (water) {
          hydrology[k*4] = wet; hydrology[k*4 + 1] = TERRAIN_SHORE_SAMPLING==="v24"?shoreTerrainBedCoverage(Number(water.riverBed) || 0,y,water.surfaceLevel):clamp01(Number(water.riverBed)||0); hydrology[k*4 + 2] = clamp01(Number(water.bank) || 0);
        }
        // Interpolate metric clearance, then evaluate the nonlinear exposure in the fragment.
        // This fourth component shares the existing attribute slot and water query.
        hydrology[k*4+3]=Number.isFinite(water?.surfaceLevel)?y-water.surfaceLevel:(water?.id===null?.12:0);
        // Horizontal distance to the SAME cross-section used by the water mesh.
        // A terrain triangle can dip below level outside that mesh. Height alone
        // must not classify that exposed lip as an immersed bed. Missing rivers
        // use a finite, inactive value; wetness remains zero there.
        shoreDistance[k]=Number.isFinite(water?.shoreDistance)?water.shoreDistance:8;
        const altitude = surface.geographicHeightAt ? surface.geographicHeightAt(x, z) : y;
        const c = this._surfaceColor(x, z, altitude, normals[k3 + 1], lc);
        colors[k3] = c.r; colors[k3 + 1] = c.g; colors[k3 + 2] = c.b;
        // _surfaceColor already sampled these exact broad traits. Reuse all
        // geographic/cover/wetness inputs instead of repeating source queries.
        landform.set(this.landform.response(x,z,{traits:this._landformValue,altitude,wetness:wet,cover:lc},this._landformResponse,this._communityResponse),k*4);
        community.set(this._communityResponse,k*4);
        if (slot >= 0) {
          for (let a = 0; a < 3; a++) {
            cache.attributes[offset + a] = normals[k3 + a]; cache.attributes[offset + 3 + a] = colors[k3 + a];
            cache.attributes[offset + 6 + a] = cover[k3 + a]; cache.attributes[offset + 9 + a] = hydrology[k*4 + a];
          }
          for(let a=0;a<4;a++){cache.attributes[offset+12+a]=landform[k*4+a];cache.attributes[offset+16+a]=community[k*4+a];}
          cache.attributes[offset+20]=hydrology[k*4+3];
          cache.attributes[offset+21]=shoreDistance[k];
          cache.states[slot] = 2;
        }
      }
      job.min = Math.min(job.min, y); job.max = Math.max(job.max, y);
    }
    if (j > 0) for (let i = 0; i < GRID; i++) {
      const a = (j - 1) * STRIDE + i, b = a + 1, c = a + STRIDE, d = c + 1;
      const center = this.sampleCache.heightAtPoint(node.x + (i + 0.5) * step, node.z + (j - 0.5) * step);
      job.centers[(j - 1) * GRID + i] = center;
      const bc = (positions[b * 3 + 1] + positions[c * 3 + 1]) / 2;
      const ad = (positions[a * 3 + 1] + positions[d * 3 + 1]) / 2;
      // Cut banks are not bilinear. Choose the diagonal that best follows their
      // actual centre height instead of bridging every cut in the same direction.
      if (Math.abs(ad - center) < Math.abs(bc - center)) {
        const o = ((j - 1) * GRID + i) * 6;
        job.indices[o] = a; job.indices[o + 1] = c; job.indices[o + 2] = d;
        job.indices[o + 3] = a; job.indices[o + 4] = d; job.indices[o + 5] = b;
      }
    }
  }

  _landformAt(x, z) {
    return this.landform.sample(x,z,this._landformValue);
  }

  _surfaceColor(x, z, altitude, up, lc) {
    // Broad colour follows geographic exposure and concavity at fixed scales.
    const traits = this._landformAt(x, z), exposure = traits.x, hollow = traits.y;
    const moisture = clamp01(0.15 + 0.55 * (1 - exposure) + 0.3 * hollow);
    const dry = smooth(0.4, 0.88, exposure * 0.75 + (1 - hollow) * 0.25);
    const slope = 1 - clamp01(up), forest = smooth(0.12, 0.9, Number(lc.r) || 0);
    const bare = clamp01(Number(lc.g) || 0), snow = smooth(0.1, 0.9, Number(lc.b) || 0);
    // The source combines bare ground and sparse vegetation. Low, gentle
    // terrain is not assumed to be exposed stone merely from that channel.
    const rock = terrainRockFraction(bare, slope, altitude);
    const alpine = smooth(2780, 3650, altitude) * (0.28 + bare * 0.72);
    const c = this._color.copy(PALETTE.fresh).lerp(PALETTE.cool, moisture * 0.75);
    c.lerp(PALETTE.dry, dry * 0.27);
    c.lerp(PALETTE.alpine, alpine * 0.58);
    c.lerp(PALETTE.forest, forest * 0.94);
    c.lerp(PALETTE.litter, forest * (1 - moisture) * 0.12);
    c.lerp(PALETTE.earth, bare * (1 - rock) * 0.38);
    c.lerp(PALETTE.rock, rock * 0.92);
    c.multiplyScalar(0.985 + 0.03 * noise(x / 43 - 7, z / 43 + 5));
    c.lerp(PALETTE.snow, snow * (1 - smooth(0.6, 0.85, slope) * 0.45));
    return c;
  }

  _finish(job) {
    if (job.cached) {
      if (job.node.dead || this.disposed) return;
      const c = job.cached; this._attachMesh(job.node, c.geometry, c.heights, c.centers, c.minHeight, c.maxHeight);
      this.stats.restoredTiles++; return;
    }
    const { node, positions, normals, colors, cover, hydrology, shoreDistance, landform, community, uvs } = job;
    if (node.dead || this.disposed) return;
    // Skirts hide the gap between samples on different LOD edges. They are not
    // sampled by physics and never change the authoritative top surface.
    const depth = Math.max(5, node.size / GRID * 2.5);
    for (let i = 0; i < PERIMETER; i++) {
      const source = EDGES[i], target = TOP_VERTICES + i;
      for (let a = 0; a < 3; a++) {
        positions[target * 3 + a] = positions[source * 3 + a];
        normals[target * 3 + a] = normals[source * 3 + a];
        colors[target * 3 + a] = colors[source * 3 + a];
        cover[target * 3 + a] = cover[source * 3 + a];
      }
      hydrology.set(hydrology.subarray(source*4,source*4+4),target*4);
      shoreDistance[target]=shoreDistance[source];
      landform.set(landform.subarray(source*4,source*4+4),target*4);
      community.set(community.subarray(source*4,source*4+4),target*4);
      positions[target * 3 + 1] -= depth;
      uvs[target * 2] = uvs[source * 2]; uvs[target * 2 + 1] = uvs[source * 2 + 1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("terrainCover", new THREE.BufferAttribute(cover, 3));
    geometry.setAttribute("terrainHydrology", new THREE.BufferAttribute(hydrology, 4));
    geometry.setAttribute("terrainShoreDistance",new THREE.BufferAttribute(shoreDistance,1));
    geometry.setAttribute("terrainLandform", new THREE.BufferAttribute(landform, 4));
    geometry.setAttribute("terrainCommunity", new THREE.BufferAttribute(community, 4));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    // Each tile owns its index buffer; its diagonals follow the local cut banks.
    geometry.setIndex(new THREE.BufferAttribute(job.indices, 1));
    if (node.parent && node.size >= MORPH_MIN_TILE_SIZE && !node.parent.protected) this._addMorphTargets(geometry, node);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    this.stats.generatedTiles++;
    this._attachMesh(node, geometry, job.heights, job.centers, job.min, job.max);
  }

  _attachMesh(node, geometry, heights, centers, minHeight, maxHeight) {
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `Terrain ${node.depth}:${node.x},${node.z}`;
    mesh.position.set(node.x, 0, node.z);
    mesh.receiveShadow = true;
    mesh.castShadow = node.size <= 640;
    mesh.visible = false;
    mesh.userData.terrainTile = { x: node.x, z: node.z, size: node.size, spacing: node.size / GRID, depth: node.depth };
    this.shadowDomain?.add(mesh);
    this.group.add(mesh);
    node.mesh = mesh; node.job = null; node.heights = heights; node.centers = centers; node.minHeight = minHeight; node.maxHeight = maxHeight;
    this._activate(node.parent);
  }

  _distance(node) {
    const p = this._camera;
    const dx = Math.max(node.x - p.x, 0, p.x - node.x - node.size);
    const dz = Math.max(node.z - p.z, 0, p.z - node.z - node.size);
    const dy = Math.max(0, p.y - node.maxHeight);
    return Math.hypot(dx, dy, dz);
  }

  _visible(node) {
    this._sphere.center.set(node.x + node.size / 2, (node.minHeight + node.maxHeight) / 2, node.z + node.size / 2);
    this._sphere.radius = Math.hypot(node.size * Math.SQRT1_2, (node.maxHeight - node.minHeight) / 2);
    return this._frustum.intersectsSphere(this._sphere);
  }

  _addMorphTargets(geometry, node) {
    const parent = node.parent, pg = parent.mesh.geometry, step = parent.size / GRID;
    const attributes = ["position", "normal", "color"];
    const target = attributes.map(() => new Float32Array(VERTICES * 3));
    const landformDelta=new Float32Array(VERTICES*4),communityDelta=new Float32Array(VERTICES*4),shoreDelta=new Float32Array(VERTICES);
    const parentShore=pg.attributes.terrainShoreDistance.array,fineShore=geometry.attributes.terrainShoreDistance.array;
    const parentCommunity=pg.attributes.terrainCommunity.array,fineCommunity=geometry.attributes.terrainCommunity.array;
    const parentLandform=pg.attributes.terrainLandform.array,fineLandform=geometry.attributes.terrainLandform.array;
    for (let k = 0; k < TOP_VERTICES; k++) {
      const local = geometry.attributes.position, x = node.x + local.getX(k), z = node.z + local.getZ(k);
      const fx = (x - parent.x) / step, fz = (z - parent.z) / step;
      const i = Math.min(GRID - 1, Math.max(0, Math.floor(fx))), j = Math.min(GRID - 1, Math.max(0, Math.floor(fz)));
      const u = fx - i, v = fz - j, a = j * STRIDE + i, b = a + 1, c = a + STRIDE, d = c + 1;
      const alternate = pg.index.getX((j * GRID + i) * 6 + 2) === d;
      let wa, wb, wc, wd;
      if (alternate) {
        if (u >= v) { wa = 1 - u; wb = u - v; wc = 0; wd = v; }
        else { wa = 1 - v; wb = 0; wc = v - u; wd = u; }
      } else if (u + v <= 1) { wa = 1 - u - v; wb = u; wc = v; wd = 0; }
      else { wa = 0; wb = 1 - v; wc = 1 - u; wd = u + v - 1; }
      shoreDelta[k]=parentShore[a]*wa+parentShore[b]*wb+parentShore[c]*wc+parentShore[d]*wd-fineShore[k];
      for(let axis=0;axis<4;axis++)landformDelta[k*4+axis]=parentLandform[a*4+axis]*wa+parentLandform[b*4+axis]*wb
        +parentLandform[c*4+axis]*wc+parentLandform[d*4+axis]*wd-fineLandform[k*4+axis];
      for(let axis=0;axis<4;axis++)communityDelta[k*4+axis]=parentCommunity[a*4+axis]*wa+parentCommunity[b*4+axis]*wb
        +parentCommunity[c*4+axis]*wc+parentCommunity[d*4+axis]*wd-fineCommunity[k*4+axis];
      for (let n = 0; n < attributes.length; n++) {
        const source = pg.attributes[attributes[n]].array, fine = geometry.attributes[attributes[n]].array;
        for (let axis = 0; axis < 3; axis++) {
          // x/z are identical geographic positions, expressed in different tile origins.
          target[n][k * 3 + axis] = n === 0 && axis !== 1 ? 0 :
            source[a * 3 + axis] * wa + source[b * 3 + axis] * wb + source[c * 3 + axis] * wc + source[d * 3 + axis] * wd - fine[k * 3 + axis];
        }
      }
    }
    // A parent hinge can cross a child cell. Keep that diagonal aligned so the
    // first morph frame reproduces the parent triangle plane exactly.
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const pi = Math.floor(((node.x - parent.x) / step) + i / 2), pj = Math.floor(((node.z - parent.z) / step) + j / 2);
      const pa = pj * STRIDE + pi, pd = pa + STRIDE + 1;
      const alternate = pg.index.getX((pj * GRID + pi) * 6 + 2) === pd;
      if (alternate !== ((i & 1) === (j & 1))) continue;
      const a = j * STRIDE + i, b = a + 1, c = a + STRIDE, d = c + 1, offset = (j * GRID + i) * 6;
      geometry.index.array.set(alternate ? [a, c, d, a, d, b] : [a, c, b, b, c, d], offset);
    }
    for (let i = 0; i < PERIMETER; i++) for (let n = 0; n < attributes.length; n++) {
      const a = EDGES[i] * 3, b = (TOP_VERTICES + i) * 3;
      target[n][b] = target[n][a]; target[n][b + 1] = target[n][a + 1]; target[n][b + 2] = target[n][a + 2];
    }
    for(let i=0;i<PERIMETER;i++)landformDelta.set(landformDelta.subarray(EDGES[i]*4,EDGES[i]*4+4),(TOP_VERTICES+i)*4);
    geometry.setAttribute("terrainLandformDelta",new THREE.BufferAttribute(landformDelta,4));
    for(let i=0;i<PERIMETER;i++)communityDelta.set(communityDelta.subarray(EDGES[i]*4,EDGES[i]*4+4),(TOP_VERTICES+i)*4);
    geometry.setAttribute("terrainCommunityDelta",new THREE.BufferAttribute(communityDelta,4));
    for(let i=0;i<PERIMETER;i++)shoreDelta[TOP_VERTICES+i]=shoreDelta[EDGES[i]];
    geometry.setAttribute("terrainShoreDistanceDelta",new THREE.BufferAttribute(shoreDelta,1));
    geometry.morphTargetsRelative = true;
    for (let n = 0; n < attributes.length; n++) geometry.morphAttributes[attributes[n]] = [new THREE.BufferAttribute(target[n], 3)];
  }

  _canMorph(parent) {
    return !parent.protected && this._distance(parent) > MORPH_GUARD_METRES
      && parent.children?.every((c) => c.mesh?.morphTargetInfluences?.length);
  }

  _morphWeight(parent, weight) {
    if(parent.morphWeight!==weight)this.shadowDomain?.touch();
    parent.morphWeight = weight;
    for (const child of parent.children || []) if (child.mesh?.morphTargetInfluences?.length) child.mesh.morphTargetInfluences[0] = weight;
  }

  _startMorph(parent, target) {
    if (parent.transition?.target === target) return;
    parent.transition = { from: parent.morphWeight, target, elapsed: 0 };
    this.morphs.add(parent);
  }

  _advanceMorphs(dt) {
    for (const parent of this.morphs) {
      if (parent.dead || !parent.children) { this.morphs.delete(parent); continue; }
      if (this._distance(parent) <= MORPH_GUARD_METRES) {
        // Never continue a shape transition under the viewer or at a foundation.
        this._morphWeight(parent, 0); parent.transition = null; this.morphs.delete(parent); this._plan(parent); continue;
      }
      const transition = parent.transition;
      transition.elapsed += dt;
      const duration = MORPH_SECONDS * Math.max(0.05, Math.abs(transition.target - transition.from));
      const t = Math.min(1, transition.elapsed / duration), eased = t * t * (3 - 2 * t);
      this._morphWeight(parent, transition.from + (transition.target - transition.from) * eased);
      if (t >= 1) {
        parent.transition = null; this.morphs.delete(parent);
        if (transition.target === 1) this._merge(parent); else this._plan(parent);
      }
    }
  }

  _activate(parent) {
    if (!parent || parent.dead || parent.split || !parent.wantsSplit || !parent.children?.every((c) => c.mesh)) return;
    this.shadowDomain?.touch();
    parent.mesh.visible = false;
    parent.split = true;
    for (const child of parent.children) child.mesh.visible = true;
    if (this._canMorph(parent)) { this._morphWeight(parent, 1); this._startMorph(parent, 0); }
    else { this._morphWeight(parent, 0); this._plan(parent); }
  }

  _requestMerge(node) {
    if (!node.split) { this._merge(node); return; }
    // Collapse the deepest ready layer first; keep complete visible coverage.
    for (const child of node.children || []) if (child.children) this._requestMerge(child);
    if (node.children.some((child) => child.children)) return;
    if (this._canMorph(node)) this._startMorph(node, 1);
    else this._merge(node);
  }

  _refine(node) {
    if (node.children) return;
    const s = node.size / 2;
    node.children = [this._node(node.x, node.z, s, node.depth + 1, node), this._node(node.x + s, node.z, s, node.depth + 1, node),
      this._node(node.x, node.z + s, s, node.depth + 1, node), this._node(node.x + s, node.z + s, s, node.depth + 1, node)];
    for (const child of node.children) this.queue.push(this._job(child));
    this._queueDirty = true;
  }

  _release(node) {
    node.dead = true;
    this.morphs.delete(node); node.transition = null;
    if (node.children) for (const c of node.children) this._release(c);
    const key = node.depth + ":" + node.x + "," + node.z;
    if (node.mesh) {
      this.group.remove(node.mesh); node.mesh.geometry.dispose();
      if (!this.disposed && node.size <= 160) this.tileCache.put(key, { geometry: node.mesh.geometry, heights: node.heights, centers: node.centers, minHeight: node.minHeight, maxHeight: node.maxHeight });
      node.mesh = null;
    } else if (node.job?.cached && !this.disposed) this.tileCache.put(key, node.job.cached);
    node.job = null; node.heights = null; node.centers = null;
    this._queueDirty = true;
    this.liveNodes.delete(node);
  }

  _merge(node) {
    // The retained parent mesh is ready, so there is no frame with missing land.
    this.shadowDomain?.touch();
    node.mesh.visible = true;
    if (node.children) for (const c of node.children) this._release(c);
    node.children = null; node.split = false; node.wantsSplit = false;
    this.morphs.delete(node); node.transition = null; node.morphWeight = 0;
  }

  _foundationDepth(node, distance) {
    if (distance >= 220 || node.size > 320) return 0;
    let depth = 0;
    for (const p of node.pads) {
      if (node.x >= p.maxX || node.x + node.size <= p.minX || node.z >= p.maxZ || node.z + node.size <= p.minZ) continue;
      depth = Math.max(depth, this.regularDepth);
      if (!p.thinBank) continue;
      // Conservative bounds in the pad's local frame. Refine only the narrow
      // cut edge of sheds, not their flat interior or the whole neighbourhood.
      const dx = node.x + node.size / 2 - p.x, dz = node.z + node.size / 2 - p.z;
      const lx = Math.abs(dx * p.c - dz * p.s), lz = Math.abs(dx * p.s + dz * p.c);
      const e = node.size / 2 * (Math.abs(p.c) + Math.abs(p.s));
      const nearest = Math.hypot(Math.max(0, lx - e - p.hx), Math.max(0, lz - e - p.hz));
      const farthest = Math.hypot(Math.max(0, lx + e - p.hx), Math.max(0, lz + e - p.hz));
      if (nearest < 0.55 && farthest > 0) {
        // Centimetre sampling is useful at our feet, but a cut 150 m away
        // should not retain hundreds of the same tiny meshes. Keep the source
        // surface unchanged; only relax sampling with projected distance.
        const spacing = Math.max(0.04, distance * (node.split ? 0.0016 : 0.002));
        const edgeDepth = Math.ceil(Math.log2((this.size / BASE_TILES) / (GRID * spacing)));
        depth = Math.max(depth, Math.min(this.maxDepth, edgeDepth));
      }
    }
    return depth;
  }

  _riverDepth(node, distance) {
    if (!this.world.hydrology || distance >= 2350) return 0;
    // Match the water visibility range. Fine bank sampling follows only nearby
    // enabled channels; small distant creeks do not refine the entire world.
    const d = distance * (node.split ? 0.88 : 1);
    let spacing, minWidth;
    if (d < 220) {
      // Broad channels already have several samples across their bed at .625 m.
      // Cache the narrow-channel overlap only after reaching local-sized tiles.
      if (node.size <= 320 && node.narrowRiver === undefined && this.world.hydrology.nearSegments) {
        const rect = { minX: node.x, maxX: node.x + node.size, minZ: node.z, maxZ: node.z + node.size };
        node.narrowRiver = this.world.hydrology.nearSegments(node.x + node.size / 2, node.z + node.size / 2, node.size * Math.SQRT1_2 + 16)
          .some((segment) => Math.min(segment.a.width, segment.b.width) <= 2
            && segment.bounds.minX < rect.maxX && segment.bounds.maxX > rect.minX
            && segment.bounds.minZ < rect.maxZ && segment.bounds.maxZ > rect.minZ);
      }
      spacing = d < 40 || node.narrowRiver !== false ? 0.3125 : 0.625; minWidth = 0;
    }
    else if (d < 430) { spacing = 0.625; minWidth = 0; }
    else if (d < 650) { spacing = 0.625; minWidth = 1.5; }
    else if (d < 1200) { spacing = 1.25; minWidth = 3; }
    else if (d < 2000) { spacing = 2.5; minWidth = 6; }
    else return 0;
    if (!node.riverOverlaps.has(minWidth)) node.riverOverlaps.set(minWidth, this.world.hydrology.intersectsBounds(node.bounds, { minWidth }));
    if (!node.riverOverlaps.get(minWidth)) return 0;
    let depthLimit=this.regularDepth;
    // Resolve the original narrow curved section, not a new river shape. The
    // existing parent-edge inheritance/skirt path also serves foundation tiles
    // beyond regularDepth, so this uses that same local refinement mechanism.
    if(this.forestBankSubdivision38&&d<48){
      if(node.forestBankSubdivision38===undefined){
        const cx=node.x+node.size/2,cz=node.z+node.size/2,r=node.size*Math.SQRT1_2;
        node.forestBankSubdivision38=Math.hypot(cx+3611.9813305250705,cz-4805.371282289286)<36+r
          &&this.world.hydrology.nearSegments(cx,cz,r+4).some(s=>s.lineId==="river-41711e76-99c57ca2"
            &&s.bounds.minX<node.bounds.maxX&&s.bounds.maxX>node.bounds.minX&&s.bounds.minZ<node.bounds.maxZ&&s.bounds.maxZ>node.bounds.minZ);
      }
      if(node.forestBankSubdivision38){spacing=.15625;depthLimit=this.maxDepth;}
    }
    return Math.min(depthLimit, Math.ceil(Math.log2((this.size / BASE_TILES) / (GRID * spacing))));
  }

  _plan(node) {
    const distance = this._distance(node);
    // Do not spend near-camera detail on distant tiles behind the viewer. All
    // nearby tiles still refine, so turning does not uncover a missing surface.
    const range = (node.split ? MERGE_RANGE : SPLIT_RANGE) * (this._visible(node) || distance < 180 ? 1 : 0.65);
    // Building cuts can be much sharper than the DEM. Resolve the whole nearby
    // foundation (not only the point under the camera), so coarse triangles do
    // not bridge a lowered pad and protrude through its floor.
    const localDepth = Math.max(this._foundationDepth(node, distance), this._riverDepth(node, distance));
    node.wantsSplit = (node.depth < this.regularDepth && distance < node.size * range) || node.depth < localDepth;
    if (!node.wantsSplit) {
      if (node.children) this._requestMerge(node);
      return;
    }
    if (node.transition) {
      if (node.transition.target === 1) this._startMorph(node, 0);
      return;
    }
    if (node.split) for (const child of node.children) this._plan(child);
    else this._refine(node);
  }

  _measure() {
    let visible = 0, resident = 0, minSpacing = Infinity, maxSpacing = 0;
    for (const n of this.liveNodes) if (n.mesh) {
      resident++;
      if (n.mesh.visible) {
        visible++;
        minSpacing = Math.min(minSpacing, n.size / GRID); maxSpacing = Math.max(maxSpacing, n.size / GRID);
      }
    }
    Object.assign(this.stats, { visibleTiles: visible, residentTiles: resident, morphingGroups: this.morphs.size,
      queuedTiles: this.queue.reduce((n, j) => n + (!j.node.dead && !j.node.mesh ? 1 : 0), 0),
      nearQueuedTiles: this.queue.reduce((n, j) => n + (!j.node.dead && !j.node.mesh && this._distance(j.node.parent || j.node) < this._nearRadius ? 1 : 0), 0),
      triangles: visible * TRIANGLES, minSpacing: visible ? minSpacing : 0, maxSpacing });
  }

  _sortQueue() {
    this.queue = this.queue.filter((job) => !job.node.dead && !job.node.mesh);
    for (const job of this.queue) {
      // Complete sibling groups together: one unfinished far sibling otherwise
      // prevents the near child from revealing its next level.
      const group = job.node.parent || job.node, distance = this._distance(group);
      const tier = distance < this._nearRadius ? 0 : this._visible(group) ? 1 : 2;
      job.priority = tier * 1000 + distance / group.size - job.node.depth * 0.035 - job.row * 0.00001;
    }
    this.queue.sort((a, b) => a.priority - b.priority);
    this._queueDirty = false;
  }

  cancelPreparation() {
    this._prepareToken++; this._activePreparation = 0;
  }

  // Uses the normal geometry scheduler and full precision. Near readiness only
  // reports completion of requested detail around the destination; complete
  // world coverage remains visible while distant requested detail continues.
  async prepareView(camera, { maxMs = 2500, onProgress, nearRadius = 160, waitFor = "all", yieldInitializingRows42 = this.yieldInitializingRows42 === true } = {}) {
    const token = ++this._prepareToken, start = now(), view = camera.clone();
    this._activePreparation = token;
    this._nearRadius = Math.max(20, Math.min(500, Number(nearRadius) || 160));
    const budget = Number.isFinite(maxMs) ? Math.max(0, maxMs) : 2500;
    let iterations = 0, quiet = 0, nearQuiet = 0, ready = false, nearReady = false, lastYield = start;
    const result = () => ({
      ready, nearReady, reason: this.disposed ? "disposed" : token !== this._prepareToken ? "superseded"
        : ready ? "ready" : waitFor === "near" && nearReady ? "near-ready" : "budget",
      elapsedMs: now() - start, iterations, queuedTiles: this.stats.queuedTiles, nearQueuedTiles: this.stats.nearQueuedTiles ?? 0,
      visibleTiles: this.stats.visibleTiles, minSpacing: this.stats.minSpacing,
    });
    onProgress?.({ ...result(), reason: "preparing" });
    try {
      this._elapsed = PLAN_INTERVAL; // Re-plan destination even when its position is unchanged.
      while (!this.disposed && token === this._prepareToken && now() - start < budget) {
        const planThisTurn = iterations % 8 === 0;
        this.update(view, planThisTurn ? PLAN_INTERVAL + 0.001 : 0, { preparationToken: token });
        iterations++;
        if (planThisTurn) {
          quiet = this.stats.queuedTiles === 0 && this.morphs.size === 0 ? quiet + 1 : 0;
          nearQuiet = this.stats.nearQueuedTiles === 0 ? nearQuiet + 1 : 0;
        }
        nearReady = nearQuiet >= 3; ready = quiet >= 3;
        if (ready || (waitFor === "near" && nearReady)) break;
        const initializingRows42 = yieldInitializingRows42 && this.rowWorker && !this.rowWorker.ready && !this.rowWorker.closed;
        if (this.queue[0]?.workerPending || initializingRows42) {
          if (initializingRows42) this.stats.initializationTaskYields42 = (this.stats.initializationTaskYields42 || 0) + 1;
          // scheduler.yield continuations can outrank worker message tasks.
          // Initialization/network delivery also needs a real task turn. The
          // candidate still executes the original update above on EVERY turn;
          // a slow/failed worker never prevents local row generation.
          // Waiting for a result has no local work: yield a real event-loop turn
          // instead of spinning/replanning and starving result/error delivery.
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYield = now();
          continue;
        }
        if (now() - lastYield >= 12) {
          if (token === this._prepareToken) onProgress?.({ ...result(), reason: "preparing" });
          // Yield to input/rendering without requiring a GPU-bound animation
          // frame to finish before CPU generation is allowed to resume.
          await yieldWorldPreparation();
          lastYield = now();
        }
      }
      const final = result();
      if (token === this._prepareToken) onProgress?.(final);
      return final;
    } finally {
      if (this._activePreparation === token) this._activePreparation = 0;
    }
  }

  update(camera, dt = 1 / 60, { preparationToken = 0 } = {}) {
    if (this.disposed || (this._activePreparation && preparationToken !== this._activePreparation)) return;
    this.submissionBatches.restore();
    this._camera.copy(camera.position);
    this._advanceMorphs(Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 1)));
    camera.updateMatrixWorld();
    this._projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projection, camera.coordinateSystem ?? THREE.WebGLCoordinateSystem, camera.reversedDepth ?? false);
    this._elapsed += Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 1));
    if (this._elapsed >= PLAN_INTERVAL || this._lastPlan.distanceToSquared(this._camera) > 400) {
      this._elapsed = 0; this._lastPlan.copy(this._camera);
      for (const root of this.roots) this._plan(root);
      this._queueDirty = true;
    }
    const start = now();
    let uploads = 0;
    const readyWindow42 = this.workerReadyWindow42 === true;
    const windowStats42 = this.stats.workerReadyWindow42 ??= { frames: 0, totalFinished: 0, totalExtraFinished: 0, maxReadyPrefix: 0 };
    Object.assign(windowStats42, { enabled: readyWindow42, readyPrefix: 0, finished: 0, workerFinished: 0, extraFinished: 0 });
    if (this._queueDirty) this._sortQueue();
    // Bounded diagnostic: never scan the resident world or overtake a queue head.
    for (const candidate of this.queue) {
      if (candidate.node.dead || candidate.node.mesh) continue;
      if (!candidate.workerPayload || candidate.workerPayload.row !== GRID + 1) break;
      if (++windowStats42.readyPrefix === 4) break;
    }
    windowStats42.maxReadyPrefix = Math.max(windowStats42.maxReadyPrefix, windowStats42.readyPrefix);
    while (this.queue.length && uploads < (readyWindow42 ? 4 : MAX_UPLOADS_PER_FRAME) && now() - start < BUILD_BUDGET_MS) {
      if (this._queueDirty) this._sortQueue();
      if (!this.queue.length) break;
      const job = this.queue[0];
      if (job.node.dead || job.node.mesh) { this.queue.shift(); continue; }
      const completeWorker42 = job.workerPayload?.row === GRID + 1;
      // Extra slots consume only complete worker output, never CPU rows/cache.
      if (uploads >= MAX_UPLOADS_PER_FRAME && !completeWorker42) break;
      if(this.rowWorker?.ready){
        // Dispatch remains bounded by the client; parent activation still waits
        // for all four children in the original _finish/_activate path.
        for(const candidate of this.queue){
          if(this.rowWorker.pending.size>=this.rowWorker.limit)break;
          if(!candidate.node.dead)this.rowWorker.enqueue(candidate);
        }
      }
      if(job.workerPayload){Object.assign(job,job.workerPayload);delete job.workerPayload;}
      else if(job.workerPending)break;
      else this._buildRow(job);
      if (job.row > GRID) {
        this.queue.shift(); this._finish(job); uploads++;
        if (completeWorker42) windowStats42.workerFinished++;
      }
    }
    windowStats42.frames++;
    windowStats42.finished = uploads;
    windowStats42.extraFinished = Math.max(0, uploads - MAX_UPLOADS_PER_FRAME);
    windowStats42.totalFinished += uploads;
    windowStats42.totalExtraFinished += windowStats42.extraFinished;
    this.stats.buildMs = now() - start;
    this._measure();
    this.submissionBatches.update(this.liveNodes);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rowWorker?.dispose();
    this.submissionBatches.dispose();
    this._prepareToken++;
    for (const root of this.roots) this._release(root);
    this.queue.length = 0; this.roots.length = 0; this.morphs.clear();
    for (const texture of Object.values(this.textures)) texture.dispose();
    this.sampleCache.dispose(); this.tileCache.dispose(); this.landform=null;
    this.shadowDomain?.dispose();
    this.material.dispose(); this.group.clear(); this._measure();
  }
}
