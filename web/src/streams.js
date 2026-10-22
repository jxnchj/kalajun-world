import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Brooks and rivers derived from the real terrain (tools/streams.py): a water ribbon along each
// channel, laid in the lowest line of the rendered ground (the centre line is snapped sideways
// onto it), the water level only ever falling downstream (pools where the bed dips). The water
// reflects the sky (Fresnel), is darker where deeper, ripples along the flow, glints in the sun,
// foams on the steep runs and takes the shadows of the trees. The wet banks and the stony bed
// are drawn by the terrain from the stream mask (STREAM_GLSL).

const VERT = /* glsl */ `
attribute vec3 aFlow;        // flow direction (x, z) and the fall of the bed (m / m)
attribute vec2 aAcross;      // -1..1 across the water (beyond +-1: the soft edge), width (m)
uniform float uCurvature;
varying vec3 vWorld;
varying vec3 vFlow;
varying vec2 vAcross;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 wp = position;
  vWorld = wp;
  vFlow = aFlow;
  vAcross = aAcross;
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vFlow;
varying vec2 vAcross;
${ATMOS_GLSL}
${NOISE_GLSL}
${HEIGHT_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vWorld.xz;
  vec2 fd = normalize(vFlow.xy + 1e-5);
  vec2 side = vec2(-fd.y, fd.x);
  float fall = vFlow.z;
  float speed = 0.35 + 6.0 * min(fall, 0.2);
  // ripples carried down the stream: noise in the flow frame, stretched along it
  vec2 q = vec2(dot(p, fd), dot(p, side));
  float t = uTime * speed;
  float e = 0.08;
  float r0 = vnoise(vec2(q.x * 1.2 - t * 1.4, q.y * 3.0)) * 0.6 + vnoise(vec2(q.x * 3.1 - t * 2.3, q.y * 6.0 + 3.0)) * 0.4;
  float rx = vnoise(vec2((q.x + e) * 1.2 - t * 1.4, q.y * 3.0)) * 0.6 + vnoise(vec2((q.x + e) * 3.1 - t * 2.3, q.y * 6.0 + 3.0)) * 0.4;
  float ry = vnoise(vec2(q.x * 1.2 - t * 1.4, (q.y + e) * 3.0)) * 0.6 + vnoise(vec2(q.x * 3.1 - t * 2.3, (q.y + e) * 6.0 + 3.0)) * 0.4;
  float amp = 0.25 + 1.6 * min(fall, 0.15);
  vec2 g = vec2(rx - r0, ry - r0) / e * amp * 0.12;
  vec3 n = normalize(vec3(-(g.x * fd.x + g.y * side.x), 1.0, -(g.x * fd.y + g.y * side.y)));
  vec3 v = normalize(cameraPosition - vWorld);
  float a = abs(vAcross.x);
  float depth = 1.0 - a * a;                                  // deepest mid-stream
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  float forestW = smoothstep(0.3, 0.7, landcover(p).r);
  vec3 sky = skyBase(normalize(vec3(r.x, abs(r.y) + 0.02, r.z)));
  float vis = groundSunVis(p, 0.1, forestW, length(p - cameraPosition.xz)) * objectShadow(vWorld, n);
  // the bed seen through the water (shifted by the ripples): pebbles and stones, wet and dark,
  // clear at the edges, lost in the dark green-brown mid-stream
  vec2 bp = p + n.xz * 0.15;
  vec3 bed = mix(vec3(0.05, 0.05, 0.038), vec3(0.11, 0.105, 0.08), vnoise(bp * 2.3));
  for (int o = 0; o < 2; o++) {
    float sz = o == 0 ? 0.1 : 0.26;
    vec2 cp = bp / sz, ci = floor(cp);
    vec2 f = fract(cp) - (0.3 + 0.4 * hash22(ci + float(o) * 5.0));
    float rr = 0.22 + 0.18 * hash12(ci + 2.0 + float(o));
    float on = step(hash12(ci + 9.0 + float(o)), o == 0 ? 0.65 : 0.35) * (1.0 - smoothstep(0.7, 1.0, length(f) / rr));
    bed = mix(bed, vec3(0.13, 0.12, 0.1) * mix(0.55, 1.2, hash12(ci + 13.0)) * (0.9 + 0.15 * dot(f / rr, vec2(-0.55, -0.83))), on);
  }
  float dist = length(p - cameraPosition.xz);
  bed = mix(vec3(0.075, 0.075, 0.058), bed, 1.0 - smoothstep(40.0, 120.0, dist));
  float deep = depth * clamp(vAcross.y / 6.0, 0.15, 0.9);     // a 1 m brook is clear to the stones, a river is not
  vec3 body = mix(bed * vec3(0.85, 0.97, 0.92), vec3(0.012, 0.03, 0.03), deep);
  vec3 col = toonLight(body, vec3(0.0, 1.0, 0.0), vis, 0.2);
  sky = mix(vec3(dot(sky, vec3(0.3, 0.55, 0.15))), sky, 0.65);   // a mountain brook reflects a paler, greyer sky
  sky *= mix(1.0, 0.4, forestW);                                  // under the spruces it mirrors mostly the dark crowns
  col = mix(col, sky * mix(0.55, 1.0, vis), fres * mix(0.45, 0.8, deep));
  // sun glints on the ripples
  col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 180.0) * 2.5 * vis;
  // white water on the steep runs, streaks drawn out along the flow
  // (thin streaks drawn out along the flow, never blotches)
  float foam = smoothstep(0.7, 0.86, vnoise(vec2(q.x * 0.45 - t * 1.8, q.y * 5.0 + 7.0)) * 0.6 + vnoise(vec2(q.x * 2.0 - t * 3.0, q.y * 12.0)) * 0.4);
  foam *= smoothstep(0.06, 0.18, fall) + 0.2 * smoothstep(0.88, 1.0, a) * (1.0 - smoothstep(1.0, 1.1, a));
  col = mix(col, toonLight(vec3(0.55, 0.6, 0.6), vec3(0.0, 1.0, 0.0), vis, 0.3), foam * 0.55);
  col = applyAtmosphere(col, cameraPosition, vWorld);
  float beyond = (a - 1.0) * vAcross.y * 0.5;                  // metres past the water's edge
  float alpha = 1.0 - smoothstep(-0.12, 0.33, beyond);         // the bed is drawn here: only the edge fades into the bank
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function hash(a, b) {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x3c6ef372, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

export class Streams {
  static async create(terrain, base = "./data/") {
    const s = new Streams();
    const [lines, maskMeta, maskBuf] = await Promise.all([
      fetch(base + "streams.json").then((r) => r.json()),
      fetch(base + "streammask.json").then((r) => r.json()),
      fetch(base + "streammask.bin.gz").then((r) => r.arrayBuffer()),
    ]);
    let buf = maskBuf;
    const b = new Uint8Array(buf, 0, 2);
    if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const mn = Math.round(maskMeta.size / maskMeta.res);
    const ch = maskMeta.channels || 1;   // R wetness (+ G trails, tools/trails.py)
    const tex = new THREE.DataTexture(new Uint8Array(buf), mn, mn, ch === 2 ? THREE.RGFormat : THREE.RedFormat, THREE.UnsignedByteType);
    tex.unpackAlignment = 1;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    worldUniforms.uStreamMask.value = tex;
    worldUniforms.uStreamOrigin.value.set(maskMeta.origin[0], maskMeta.origin[1]);
    worldUniforms.uStreamSize.value = maskMeta.size;
    // the channels are cut into the ground (HEIGHT_GLSL streamCarve): the CPU heights follow
    const md = new Uint8Array(buf), x0 = maskMeta.origin[0], z0 = maskMeta.origin[1], r = maskMeta.res;
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    terrain.carve = (x, z) => {
      const u = (x - x0) / r - 0.5, v = (z - z0) / r - 0.5;
      if (u < 0 || v < 0 || u >= mn - 1 || v >= mn - 1) return 0;
      const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
      const g = (a, b) => md[(b * mn + a) * ch];
      const val = ((g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fz) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fz) / 255;
      return 0.7 * sm(0.45, 0.95, val);
    };
    terrain.streamWet = (x, z) => terrain.carve(x, z) / 0.7;   // 0 on dry ground, 1 in the channel
    s.build(lines.lines, terrain);
    return s;
  }

  // lay each line into the rendered ground and build the ribbons
  build(lines, terrain) {
    this.lines = [];
    const pos = [], flow = [], across = [], idx = [];
    const chunks = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...atmos, ...worldUniforms, ...shadowUniforms },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const flush = () => {
      if (!idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 3));
      g.setAttribute("aAcross", new THREE.Float32BufferAttribute(across, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 1;
      chunks.add(m);
      pos.length = flow.length = across.length = idx.length = 0;
    };
    for (const L of lines) {
      const n = L.length;
      // 1. the channel is cut along this very line (streamCarve), so the water follows it
      const dir = [];
      for (let i = 0; i < n; i++) {
        const a = L[Math.max(i - 1, 0)], c = L[Math.min(i + 1, n - 1)];
        let dx = c[0] - a[0], dz = c[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        dir.push([dx / l, dz / l]);
      }
      // 2. the water level: the bed (lowest of three points across) plus a little depth,
      // smoothed along the stream; never below bed + 5 cm, so it runs unbroken
      const bed = [], w0 = [];
      for (let i = 0; i < n; i++) {
        const [dx, dz] = dir[i];
        // the last point is the confluence: keep the tributary's own width there
        const w = i === n - 1 && n > 1 ? L[n - 2][2] : L[i][2];
        let b = Infinity;
        for (const o of [-0.3, 0, 0.3]) b = Math.min(b, terrain.heightAt(L[i][0] - dz * o * w, L[i][1] + dx * o * w));
        bed.push(b);
        w0.push(w);
      }
      const P = [];
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < n) { sum += bed[j]; c++; } }
        const w = w0[i] * (i >= n - 2 ? 0.6 : 1);          // tapers into the stream it joins
        const level = Math.max(sum / c, bed[i] + 0.05) + 0.08 + 0.03 * w;
        P.push([L[i][0], level, L[i][1], w, dir[i][0], dir[i][1], bed[i]]);
      }
      this.lines.push(P);
      // 3. ribbon: the water plus a soft margin on either side
      for (let i = 0; i < n; i++) {
        const [x, y, z, w, dx, dz] = P[i];
        const fall = Math.max(0, (P[Math.max(i - 1, 0)][1] - P[Math.min(i + 1, n - 1)][1]) / 8);
        const half = w / 2 + 0.35;
        for (const s of [-1, 1]) {
          pos.push(x - dz * s * half, y, z + dx * s * half);
          flow.push(dx, dz, fall);
          across.push(s * half / (w / 2), w);
        }
        if (i > 0) {
          const k = pos.length / 3 - 4;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);   // facing up
        }
        if (pos.length / 3 > 3000 && i < n - 1) {   // chunks of a few hundred metres, for culling
          flush();
          // restart the strip at this point
          for (const s of [-1, 1]) { pos.push(x - dz * s * half, y, z + dx * s * half); flow.push(dx, dz, fall); across.push(s * half / (w / 2), w); }
        }
      }
      flush();
    }
    this.mesh = chunks;
  }

  // stones along and in the brooks near (cx, cz): [x, z, scale, yaw, inWater, water level]
  stonesNear(cx, cz, R) {
    const out = [];
    this.lines.forEach((P, li) => {
      for (let i = 0; i < P.length; i++) {
        const [x, y, z, w, dx, dz] = P[i];
        if (Math.abs(x - cx) > R || Math.abs(z - cz) > R || Math.hypot(x - cx, z - cz) > R) continue;
        for (let k = 0; k < 2; k++) {
          const u = hash(li * 4096 + i, k);
          if (u > 0.45) continue;
          const side = hash(li * 4096 + i, k + 7) < 0.5 ? -1 : 1;
          const inWater = hash(li * 4096 + i, k + 11) < 0.35;
          const o = inWater ? (hash(li, i * 3 + k) - 0.5) * w * 0.8 : side * (w / 2 + 0.2 + hash(li * 7, i + k) * 1.2);
          const s = inWater ? 0.2 + 0.35 * hash(i, li + k) : 0.3 + 0.7 * hash(i + k, li) ** 2;
          out.push([x - dz * o, z + dx * o, s, hash(li, i + k * 13) * 6.283, inWater, y]);
        }
      }
    });
    return out;
  }
}
