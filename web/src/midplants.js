import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL, LOD_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";
import { EXEMPLARS, hash2 } from "./vegetation.js";

// The meadow plants between the modelled ones (vegetation.js, dissolving out 9-12 m) and the
// flower ring (flowers.js, taking over 38-45 m): each plant drawn as a picture of itself. At
// start-up every species' model is photographed from the side -- each posture variant with the
// EXEMPLARS appearance seeds the modelled plants use (heads hidden, head colours, leaf tint) --
// into one atlas, so a plant's picture is exactly that plant, lit here the way vegetation.js
// lights it. The pictures stand where vegetation.js clumpPlants() puts the plants (the same
// function, cached in 8 m blocks), turn to face the camera, lean with the gust and away from
// the walker. The hand-overs are per pixel (world.js uPlantLod, glsl.js LOD_GLSL): each pixel
// is drawn by the model, the picture or the flower ring, never two, never none -- so nothing
// pops, and a patch keeps its look, its colours and its cover from 45 m in to the feet.

const TILE = 128;          // atlas tile (px)
const PAD = 6;             // empty margin round each picture (px): no bleeding at coarse mips
const BLOCK = 8;           // placement cache blocks (m)
const FOOT = 0.04;         // the picture's frame starts this share of its height below the ground

// the species' own material, writing its albedo (its uniforms shared: the same palette, hidden
// heads and atlas)
function captureMaterial(src) {
  return new THREE.ShaderMaterial({ uniforms: src.uniforms, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader,
    defines: { ...(src.defines || {}), CAPTURE: 1 }, side: THREE.DoubleSide });
}

const VERT = /* glsl */ `
attribute vec4 iP;        // x, y, z, plant height (m)
attribute vec4 iQ;        // atlas tile, frame size / plant height, seed, -
uniform vec2 uTiles;      // tiles per row, rows
uniform float uPad;       // margin share of a tile
uniform float uCurvature;
varying vec2 vUv;
varying vec3 vWorld;
varying float vVis;
varying float vLodD;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
uniform vec4 uPlantLod;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec3 base = iP.xyz;
  float d = length(base - cameraPosition);
  vLodD = d;
  if (d < uPlantLod.x - 0.3 || d > uPlantLod.w + 0.3) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float S = iQ.y * iP.w;                                   // the picture's square frame (m)
  // off screen (most of the ring): nothing more to do
  vec4 cc = projectionMatrix * viewMatrix * vec4(base + vec3(0.0, 0.5 * S, 0.0), 1.0);
  float m = S * 0.8 * projectionMatrix[0][0] + 0.02 * cc.w;
  if (cc.w < -S || abs(cc.x) > cc.w + m || abs(cc.y) > cc.w + m) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 tc = cameraPosition.xz - base.xz;
  vec2 f = normalize(tc + vec2(1e-4, 0.0));                // toward the camera
  vec3 right = vec3(f.y, 0.0, -f.x);
  // seen from above the picture leans back a little, so it keeps some height on screen
  float tilt = clamp(atan(cameraPosition.y - base.y, length(tc)) * 0.6, 0.0, 0.5);
  vec3 up = vec3(-f.x * sin(tilt), cos(tilt), -f.y * sin(tilt));
  float y = position.y;                                    // 0..1 up the frame
  vec3 wp = base + right * position.x * S + up * (y - ${FOOT}) * S;
  // the gust leans the plant as it leans the modelled ones and the flower ring; the walker
  // parts them (a zoomed-out camera stands them round it)
  float seed = iQ.z;
  float b = windBendPush(base.xz, 0.5), sb = sqrt(b);
  vec2 lean = windDirAt(base.xz) * (0.75 * b + windTurb(base.xz + seed * 5.0) * 0.05 * sb)
            + vec2(tnoise(uTime * mix(1.2, 2.2, seed) + seed * 50.0, seed * 9.0), tnoise(uTime * 1.7 + seed * 40.0, seed * 9.0 + 3.0)) * 0.05 * sb;
  if (uTrail[0].w > 0.0 && distance(base.xz, uTrail[0].xy) < 13.0) lean += trailPush(base.xz) * 0.7;
  float hy = max(y - ${FOOT}, 0.0);
  wp.xz += lean * hy * hy * S;
  wp.y -= dot(lean, lean) * hy * hy * S * 0.3;
  float col = mod(iQ.x, uTiles.x), row = floor(iQ.x / uTiles.x);
  vUv = vec2((col + uPad + (position.x + 0.5) * (1.0 - 2.0 * uPad)) / uTiles.x, (row + uPad + y * (1.0 - 2.0 * uPad)) / uTiles.y);
  vWorld = wp;
  vVis = groundSunVis(base.xz, hy * S + 0.05, smoothstep(0.3, 0.7, landcover(base.xz).r), length(tc));
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vWorld;
varying float vVis;
varying float vLodD;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
${LOD_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  float n = lodDither();
  if (n < lodNear(vLodD) || n >= lodMid(vLodD)) discard;    // the model's pixel, or the flower ring's
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.04) discard;
  vec3 albedo = t.rgb / t.a;                                  // (premultiplied by the coverage at coarse mips)
  albedo *= albedo;                                           // (square-root encoded)
  // lit as vegetation.js lights its plants
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float vis = vVis * objectShadow(vWorld, nrm);
  vec3 col = toonLight(albedo, nrm, vis, 0.45);
  vec3 v = normalize(vWorld - cameraPosition);
  col += uSunColor * albedo * pow(max(dot(v, uSunDir), 0.0), 2.0) * 0.16 * vis;   // thin petals and leaves glow backlit
  col = min(col, vec3(1.15));
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, min(1.0, t.a * 1.15));             // alpha to coverage: stems, far pictures
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class MidPlants {
  constructor(veg, renderer) {
    this.veg = veg;
    this.terrain = veg.terrain;
    this.species = veg.species.filter((sp) => sp.map);
    this.capture(renderer);
    // the pictures: one quad per plant
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    this.geo = geo;
    this.cap = 0;
    this.grow(40000);
    this.uniforms = { ...atmos, ...worldUniforms, ...shadowUniforms, uAtlas: { value: this.atlas }, uTiles: { value: new THREE.Vector2(this.cols, this.rows) }, uPad: { value: PAD / TILE } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, alphaToCoverage: true }));
    this.mesh.frustumCulled = false;
    this.mesh.name = "midplants";
    this.blocks = new Map();     // "bx,bz" -> Float32Array (8 floats per plant)
    this.want = null;
    this.last = { bx: 1e9, bz: 1e9 };
    this.dirty = false;
  }

  grow(n) {
    this.cap = n;
    this.iP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iQ = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("iP", this.iP);
    this.geo.setAttribute("iQ", this.iQ);
    this.geo.instanceCount = 0;
  }

  // every species x posture x appearance seed, photographed from the side in one render
  capture(renderer) {
    const E = EXEMPLARS;
    const nt = this.species.length * 2 * E;
    this.cols = 16;
    this.rows = Math.ceil(nt / this.cols);
    const rt = new THREE.WebGLRenderTarget(this.cols * TILE, this.rows * TILE, {
      samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace,
    });
    const scene = new THREE.Scene();
    const p = PAD / TILE, inner = 1 - 2 * p;
    this.frame = [];   // per species, per posture: frame size / plant height
    this.species.forEach((sp, si) => {
      this.frame[si] = [];
      for (let v = 0; v < 2; v++) {
        const V = sp.vars[Math.min(v, sp.vars.length - 1)];
        const pos = V.geo.attributes.position;
        let wx = 0, yt = 0;
        for (let i = 0; i < pos.count; i++) { wx = Math.max(wx, Math.abs(pos.getX(i))); yt = Math.max(yt, pos.getY(i)); }
        // square frame round the plant at height 1 (a little room for the leaves' flutter)
        const S = Math.max(2 * wx, yt / (1 - FOOT)) * 1.06;
        this.frame[si][v] = S;
        const g = new THREE.InstancedBufferGeometry();
        g.index = V.geo.index;
        for (const [k, a] of Object.entries(V.geo.attributes)) if (!(a instanceof THREE.InstancedBufferAttribute)) g.setAttribute(k, a);
        const iPos = new Float32Array(E * 4), iPar = new Float32Array(E * 4), iSway = new Float32Array(E * 4);
        for (let e = 0; e < E; e++) {
          const t = (si * 2 + v) * E + e, col = t % this.cols, row = Math.floor(t / this.cols);
          const H = inner / S;
          iPos.set([col + 0.5, row + p + FOOT * inner, 0, 0], e * 4);
          iPar.set([H, (e + 0.5) / E, 0, 0], e * 4);
        }
        g.setAttribute("iPos", new THREE.InstancedBufferAttribute(iPos, 4));
        g.setAttribute("iPar", new THREE.InstancedBufferAttribute(iPar, 4));
        g.setAttribute("iSway", new THREE.InstancedBufferAttribute(iSway, 4));
        g.instanceCount = E;
        const m = new THREE.Mesh(g, captureMaterial(V.mesh.material));
        m.frustumCulled = false;
        scene.add(m);
      }
    });
    const cam = new THREE.OrthographicCamera(0, this.cols, this.rows, 0, -10, 10);
    cam.position.set(0, 0, 5);
    cam.updateMatrixWorld();
    const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(pc, pa);
    scene.traverse((o) => { if (o.isMesh) { o.material.dispose(); o.geometry.dispose(); } });
    rt.texture.anisotropy = 4;
    this.rt = rt;
    this.atlas = rt.texture;
  }

  // the plants of one block, as the 8 floats per plant of the instance attributes
  block(bx, bz) {
    const out = [];
    const x0 = bx * BLOCK, z0 = bz * BLOCK, veg = this.veg, E = EXEMPLARS;
    this.species.forEach((sp, si) => {
      const G = veg.clumpGrid(sp), kf = sp.idx * 3, hash = hash2;
      for (let gx = Math.floor(x0 / G) - 1; gx <= Math.floor((x0 + BLOCK) / G); gx++)
        for (let gz = Math.floor(z0 / G) - 1; gz <= Math.floor((z0 + BLOCK) / G); gz++) {
          // the clump belongs to the block its centre falls in
          const cx = (gx + hash(gx, gz, kf + 1)) * G, cz = (gz + hash(gx, gz, kf + 2)) * G;
          if (cx < x0 || cx >= x0 + BLOCK || cz < z0 || cz >= z0 + BLOCK) continue;
          veg.clumpPlants(sp, gx, gz, (x, y, z, hh, r, key, vi) => {
            const e = Math.min(E - 1, Math.floor(r * E));
            out.push(x, y, z, hh, (si * 2 + Math.min(vi, 1)) * E + e, this.frame[si][Math.min(vi, 1)], r, 0);
          });
        }
    });
    return new Float32Array(out);
  }

  update(camera) {
    const L = worldUniforms.uPlantLod.value;
    const above = camera.userData.aboveGround ?? 0;
    this.mesh.visible = above < L.w + 5;
    if (!this.mesh.visible) return;
    const c = camera.position;
    const bx = Math.floor(c.x / BLOCK), bz = Math.floor(c.z / BLOCK);
    if (bx !== this.last.bx || bz !== this.last.bz) {
      this.last = { bx, bz };
      // blocks that can hold a plant within the far fade while the camera stays in this block
      const R = L.w + BLOCK * 1.5, n = Math.ceil(R / BLOCK);
      this.want = [];
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) {
          const dx = Math.max(0, Math.abs(i) - 1) * BLOCK, dz = Math.max(0, Math.abs(j) - 1) * BLOCK;
          if (Math.hypot(dx, dz) <= L.w + 1) this.want.push([bx + i, bz + j, Math.hypot(i, j)]);
        }
      this.want.sort((a, b) => a[2] - b[2]);
      // forget blocks far behind
      for (const k of this.blocks.keys()) {
        const [x, z] = k.split(",").map(Number);
        if (Math.hypot(x - bx, z - bz) > n + 6) this.blocks.delete(k);
      }
      this.dirty = true;
    }
    // compute a few missing blocks per frame, nearest first
    let made = 0;
    const t0 = performance.now();
    for (const [x, z] of this.want) {
      const k = x + "," + z;
      if (this.blocks.has(k)) continue;
      this.blocks.set(k, this.block(x, z));
      made++;
      this.dirty = true;
      if (performance.now() - t0 > 4 && made >= 1) break;
    }
    if (!this.dirty) return;
    this.dirty = false;
    let total = 0;
    const parts = [];
    for (const [x, z] of this.want) {
      const b = this.blocks.get(x + "," + z);
      if (b && b.length) { parts.push(b); total += b.length / 8; }
    }
    if (total > this.cap) this.grow(Math.ceil(total * 1.3));
    const P = this.iP.array, Q = this.iQ.array;
    let o = 0;
    for (const b of parts)
      for (let i = 0; i < b.length; i += 8, o += 4) {
        P[o] = b[i]; P[o + 1] = b[i + 1]; P[o + 2] = b[i + 2]; P[o + 3] = b[i + 3];
        Q[o] = b[i + 4]; Q[o + 1] = b[i + 5]; Q[o + 2] = b[i + 6]; Q[o + 3] = b[i + 7];
      }
    this.geo.instanceCount = total;
    this.iP.needsUpdate = this.iQ.needsUpdate = true;
    this.iP.clearUpdateRanges(); this.iQ.clearUpdateRanges();
    this.iP.addUpdateRange(0, total * 4); this.iQ.addUpdateRange(0, total * 4);
    this.count = total;
  }
}
