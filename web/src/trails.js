import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Horse and foot trails routed over the real terrain (tools/trails.py). Near the viewer each
// trail is a strip of trodden earth laid on the ground (packed brown earth, hoof marks, pebbles,
// needles in the forest, puddly by the brooks, frayed edges where the grass grows in); farther
// out the terrain draws it from the G channel of the stream mask. The same lines keep the grass,
// flowers, trees and fallen logs off the trail (trailDist on the CPU, trailMark in the shaders).

const DRAW = 420;    // m: the strips fade out here, the terrain takes over

const VERT = /* glsl */ `
attribute float aAcross;     // -1..1 over the trodden earth, beyond: the frayed edge
attribute float aAlong;      // metres along the trail
uniform float uCurvature;
varying vec3 vWorld;
varying float vAcross;
varying float vAlong;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 wp = position;
  vWorld = wp;
  vAcross = aAcross;
  vAlong = aAlong;
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec3 vWorld;
varying float vAcross;
varying float vAlong;
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
  float dist = length(p - cameraPosition.xz);
  float a = abs(vAcross);
  // frayed edge: the grass reaches in unevenly
  float edge = 0.8 + 0.35 * (vnoise(vec2(vAlong * 0.9, vAcross * 2.0)) - 0.5) + 0.2 * (vnoise(vec2(vAlong * 3.7, 5.0)) - 0.5);
  float alpha = (1.0 - smoothstep(edge - 0.18, edge + 0.12, a)) * (1.0 - smoothstep(${(DRAW * 0.8).toFixed(1)}, ${DRAW.toFixed(1)}, dist));
  if (alpha < 0.01) discard;
  float forestW = smoothstep(0.3, 0.7, landcover(p).r);
  float wet = streamWet(p);
  // packed earth, lighter in the worn middle, darker and damper under the trees and by the brooks
  vec3 earth = mix(vec3(0.2, 0.15, 0.095), vec3(0.3, 0.235, 0.155), vnoise(p * 0.8) * 0.6 + (1.0 - a) * 0.4);
  earth = mix(earth, vec3(0.13, 0.1, 0.065), forestW * 0.55 + smoothstep(0.1, 0.6, wet) * 0.6);
  // hoof marks: small dark dents along the middle
  vec2 hc = vec2(vAlong / 0.3, vAcross * 3.0);
  vec2 hi = floor(hc);
  vec2 hf = (fract(hc) - (0.3 + 0.4 * hash22(hi))) * vec2(1.0, 1.4);
  float hoof = step(hash12(hi + 3.1), 0.22) * (1.0 - smoothstep(0.08, 0.2, length(hf))) * (1.0 - smoothstep(0.3, 0.8, a));
  earth *= 1.0 - 0.14 * hoof * (1.0 - smoothstep(10.0, 25.0, dist));
  // pebbles, and needles and cones on the forest trails
  vec2 ci = floor(p / 0.14);
  vec2 cf = fract(p / 0.14) - (0.3 + 0.4 * hash22(ci));
  float peb = step(hash12(ci + 7.7), 0.18) * (1.0 - smoothstep(0.18, 0.32, length(cf))) * (1.0 - smoothstep(25.0, 60.0, dist));
  earth = mix(earth, vec3(0.34, 0.32, 0.28) * mix(0.7, 1.2, hash12(ci + 1.0)), peb);
  earth = mix(earth, vec3(0.16, 0.1, 0.05), forestW * 0.4 * smoothstep(0.5, 0.8, vnoise(p * 6.0)));
  // tufts of grass in the middle of little-used trails
  float tuft = smoothstep(0.62, 0.8, vnoise(p * 1.7 + 3.0)) * (1.0 - smoothstep(0.0, 0.4, a)) * (1.0 - forestW * 0.6);
  earth = mix(earth, vec3(0.1, 0.16, 0.05), tuft * 0.7);
  vec3 n = terrainNormal(p, 0.5);
  float vis = groundSunVis(p, 0.2, forestW, dist) * objectShadow(vWorld, n);
  vec3 col = toonLight(earth, n, vis, 0.08);
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Trails {
  static async create(terrain, base = "./data/") {
    const t = new Trails();
    const data = await fetch(base + "trails.json").then((r) => r.json());
    t.build(data.lines, terrain);
    return t;
  }

  build(lines, terrain) {
    this.lines = lines;
    // segment bins for the distance queries (8 m)
    const B = 8;
    this.bins = new Map();
    lines.forEach((L) => {
      for (let i = 0; i + 1 < L.length; i++) {
        const [x0, z0] = L[i], [x1, z1] = L[i + 1];
        for (let bx = Math.floor((Math.min(x0, x1) - 3) / B); bx <= Math.floor((Math.max(x0, x1) + 3) / B); bx++)
          for (let bz = Math.floor((Math.min(z0, z1) - 3) / B); bz <= Math.floor((Math.max(z0, z1) + 3) / B); bz++) {
            const k = bx * 65536 + bz;
            (this.bins.get(k) || this.bins.set(k, []).get(k)).push(x0, z0, x1, z1);
          }
      }
    });
    terrain.trailDist = (x, z) => this.distance(x, z);
    terrain.trailLines = lines;

    const mat = new THREE.ShaderMaterial({
      uniforms: { ...atmos, ...worldUniforms, ...shadowUniforms },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Group();
    const ACROSS = [-1.45, -0.9, -0.3, 0.3, 0.9, 1.45];
    for (const L of lines) {
      // chunks of ~200 m, for culling
      for (let s0 = 0; s0 < L.length - 1; s0 += 100) {
        const s1 = Math.min(L.length - 1, s0 + 100);
        const pos = [], acr = [], alg = [], idx = [];
        let along = s0 * 2;
        for (let i = s0; i <= s1; i++) {
          const a = L[Math.max(i - 1, 0)], c = L[Math.min(i + 1, L.length - 1)];
          let dx = c[0] - a[0], dz = c[1] - a[1];
          const l = Math.hypot(dx, dz) || 1;
          dx /= l; dz /= l;
          // a horse trail is ~0.6 m of bare earth, wider where it is muddy or much used
          const hw = 0.32 + 0.12 * Math.sin(i * 0.37) + 0.06 * Math.sin(i * 1.3);
          for (const u of ACROSS) {
            const x = L[i][0] - dz * u * hw, z = L[i][1] + dx * u * hw;
            pos.push(x, terrain.heightAt(x, z) + 0.035, z);
            acr.push(u);
            alg.push(along);
          }
          if (i > s0) {
            const k = (pos.length / 3) - 2 * ACROSS.length;
            for (let j = 0; j < ACROSS.length - 1; j++) {
              const a0 = k + j, b0 = k + j + 1, a1 = a0 + ACROSS.length, b1 = b0 + ACROSS.length;
              idx.push(a0, b0, a1, b0, b1, a1);
            }
          }
          along += 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("aAcross", new THREE.Float32BufferAttribute(acr, 1));
        g.setAttribute("aAlong", new THREE.Float32BufferAttribute(alg, 1));
        g.setIndex(idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.renderOrder = 0;
        this.mesh.add(m);
      }
    }
  }

  // distance (m) from (x, z) to the nearest trail centre line, 99 if none within ~3 m
  distance(x, z) {
    const b = this.bins.get(Math.floor(x / 8) * 65536 + Math.floor(z / 8));
    if (!b) return 99;
    let best = 99;
    for (let i = 0; i < b.length; i += 4) {
      const x0 = b[i], z0 = b[i + 1], ex = b[i + 2] - x0, ez = b[i + 3] - z0;
      const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / (ex * ex + ez * ez + 1e-9)));
      best = Math.min(best, Math.hypot(x - x0 - ex * t, z - z0 - ez * t));
    }
    return best;
  }

  update(camera) {
    const c = camera.position;
    for (const m of this.mesh.children) m.visible = m.geometry.boundingSphere.center.distanceTo(c) < DRAW + m.geometry.boundingSphere.radius;
  }
}
