import * as THREE from "three";
import { worldUniforms } from "./world.js";
import { atmos } from "./atmosphere.js";

// A few will-o'-the-wisp lights in the forest glade of the old standing stone (slice.js
// placeEggs): after sunset they come out one by one, drift slowly between the ferns, rise and
// sink and blink. Pale teal and pink, additive, so the bloom gives them a soft halo.

const N = 16;

const VERT = /* glsl */ `
attribute float aId;
uniform vec3 uCentre;
uniform float uTime;
uniform float uCurvature;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float s = aId;
  float t = uTime * (0.12 + 0.08 * h1(s + 3.0));
  vec3 p = uCentre + vec3(sin(t * 1.7 + s * 2.1) * 5.0 + sin(t * 3.1 + s) * 1.2,
                          0.5 + 1.0 * h1(s + 7.0) + 0.35 * sin(t * 2.3 + s * 4.0),
                          cos(t * 1.3 + s * 1.7) * 5.0 + cos(t * 2.9 + s * 0.3) * 1.2);
  float night = smoothstep(0.06, -0.06, uSunDir.y);
  float appear = smoothstep(h1(s + 11.0) * 0.8, h1(s + 11.0) * 0.8 + 0.2, night);   // one by one
  float blink = 0.55 + 0.45 * sin(uTime * (1.5 + h1(s + 5.0) * 2.0) + s * 6.0);
  vA = appear * blink;
  vCol = mix(vec3(0.55, 1.0, 0.95), vec3(1.0, 0.7, 0.9), step(0.6, h1(s + 13.0)));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  vec3 wp = p + (right * position.x + up * position.y) * 0.12;
  vUv = position.xy;
  vec2 dh = wp.xz - cameraPosition.xz;
  wp.y -= dot(dh, dh) * uCurvature;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float r = length(vUv);
  float a = vA * (exp(-r * r * 12.0) + 0.2 * exp(-r * r * 4.0)) * (1.0 - smoothstep(0.8, 1.0, r));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * 3.0 * a, 1.0);
}
`;

export class Fairies {
  constructor(centre) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("aId", new THREE.InstancedBufferAttribute(new Float32Array([...Array(N).keys()]), 1));
    g.instanceCount = N;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { ...worldUniforms, uSunDir: atmos.uSunDir, uCentre: { value: new THREE.Vector3(...centre) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
}
