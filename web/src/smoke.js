import * as THREE from "three";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, SHADOW_GLSL, TOON_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";

// Thin smoke from the chimneys and stovepipes of the houses and yurts where a fire is lit
// (slice.js picks about half of them). Each plume is a stream of soft puffs animated on the GPU:
// they rise, slow down, widen, drift off with the wind and fade. Lit by the same sun: warm where
// the low sun shines through them, blue-grey in the shade of the hills.

const PUFFS = 22;
const LIFE = 16;     // s from the chimney to gone

const VERT = /* glsl */ `
attribute vec4 iBase;       // chimney top x, y, z; seed
attribute float iK;         // puff index 0..PUFFS-1
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStr;
uniform float uCurvature;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vWorld;
varying float vVis;
varying float vSeed;
${NOISE_GLSL}
${HEIGHT_GLSL}
${SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  float seed = iBase.w;
  float phase = fract(uTime / ${LIFE.toFixed(1)} + iK / ${PUFFS.toFixed(1)} + seed);
  float age = phase * ${LIFE.toFixed(1)};
  float cyc = floor(uTime / ${LIFE.toFixed(1)} + iK / ${PUFFS.toFixed(1)} + seed);
  float r = hash12(vec2(iK + cyc * 7.0, seed * 91.0));
  // buoyant rise that slows, then carried off by the wind; a slow meander
  float rise = 6.0 * (1.0 - exp(-age / 3.5));
  float wind = (0.06 + 0.9 * uWindStr) * age;   // in a breeze it bends over soon (wisps); in still air it rises
  vec2 side = vec2(-uWindDir.y, uWindDir.x);
  vec2 mean = uWindDir * wind * (0.35 + 0.65 * smoothstep(0.0, 6.0, age));
  float wob = sin(age * 0.7 + seed * 40.0) * 0.25 * age + (r - 0.5) * 0.3 * age;
  vec3 c = iBase.xyz + vec3(mean.x + side.x * wob, rise, mean.y + side.y * wob);
  float size = 0.22 + 0.24 * age + 0.2 * r;
  // camera-facing puff, slowly turning
  vec3 toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  float a = seed * 6.28 + age * (r - 0.5) * 0.4;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  vec3 wp = c + (right * q.x + up * q.y) * size;
  vUv = position.xy;
  float dist = length(c - cameraPosition);
  vAlpha = smoothstep(0.0, 0.1, phase) * pow(1.0 - phase, 1.8) * 0.2 * (1.0 - smoothstep(1400.0, 2000.0, dist));
  vWorld = wp;
  vSeed = r;
  vVis = sunVisibility(c.xz, max(c.y - terrainHeight(c.xz), 0.0));
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying vec3 vWorld;
varying float vVis;
varying float vSeed;
${ATMOS_GLSL}
${NOISE_GLSL}
${TOON_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vUv);
  float n = vnoise(vUv * 2.5 + vSeed * 17.0) * 0.6 + vnoise(vUv * 6.0 - vSeed * 5.0) * 0.4;
  float a = vAlpha * smoothstep(1.0, 0.25, r + (n - 0.5) * 0.6);
  if (a < 0.003) discard;
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 base = vec3(0.72, 0.72, 0.75);
  vec3 col = base * (uSkyAmbient * 1.1 + uSunColor * 0.55 * vVis);
  col += base * uSunColor * pow(max(dot(v, uSunDir), 0.0), 6.0) * 1.2 * vVis;   // forward scattering toward the sun
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Smoke {
  constructor(sources) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const base = new Float32Array(sources.length * PUFFS * 4), k = new Float32Array(sources.length * PUFFS);
    sources.forEach((s, i) => {
      for (let j = 0; j < PUFFS; j++) {
        base.set([s[0], s[1], s[2], s[3]], (i * PUFFS + j) * 4);
        k[i * PUFFS + j] = j;
      }
    });
    g.setAttribute("iBase", new THREE.InstancedBufferAttribute(base, 4));
    g.setAttribute("iK", new THREE.InstancedBufferAttribute(k, 1));
    g.instanceCount = sources.length * PUFFS;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { ...atmos, ...worldUniforms }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.count = sources.length;
  }
}

// top of the chimney of a building model: the highest vertices of the given material (stone
// chimney, tin stovepipe), in the model's frame; null if it has none above minY
export function chimneyTop(gltf, matPrefix, minY = 2.5) {
  let top = null;
  const v = new THREE.Vector3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !(o.material?.name || "").startsWith(matPrefix)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y > minY && (!top || v.y > top.y + 0.02)) top = { x: v.x, y: v.y, z: v.z, n: 1 };
      else if (top && Math.abs(v.y - top.y) <= 0.02) { top.x += v.x; top.z += v.z; top.n++; }
    }
  });
  return top ? new THREE.Vector3(top.x / top.n, top.y, top.z / top.n) : null;
}
