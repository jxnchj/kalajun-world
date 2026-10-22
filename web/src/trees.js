import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { atmos, ATMOS_GLSL } from "./atmosphere.js";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL, SHADOW_GLSL, TOON_GLSL, MEADOW_GLSL } from "./glsl.js";
import { worldUniforms } from "./world.js";
import { OBJ_SHADOW_GLSL, shadowUniforms } from "./shadows.js";

// Schrenk spruce forest, placed procedurally on the GPU from the real forest map.
// Each tier is a camera-centred grid of cells; every cell may hold one tree whose
// position/size come from a hash of the integer cell id, so trees stay put in the world.

// unit tree: height 1, crown radius ~0.13 (scaled per instance)
function detailedSpruce() {
  const parts = [];
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 0.16 * (1 - t * 0.78);
    const h = 0.3 - t * 0.1;
    const y0 = 0.1 + t * 0.66;
    const cone = new THREE.ConeGeometry(r, h, 7, 1, false);
    cone.translate(0, y0 + h / 2, 0);
    // droop the rim a little so tiers read as hanging branches
    const pos = cone.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      if (Math.abs(y - y0) < 1e-4) pos.setY(k, y0 - 0.025);
    }
    cone.rotateY(i * 0.9);
    parts.push(cone);
  }
  const trunk = new THREE.CylinderGeometry(0.012, 0.018, 0.16, 5, 1, true);
  trunk.translate(0, 0.08, 0);
  parts.push(trunk);
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  // mark trunk vertices (y < 0.1 and thin) via a colour attribute: 1 = foliage, 0 = trunk
  const pos = g.attributes.position;
  const foliage = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) foliage[k] = Math.hypot(pos.getX(k), pos.getZ(k)) > 0.02 || pos.getY(k) > 0.17 ? 1 : 0;
  g.setAttribute("aFoliage", new THREE.BufferAttribute(foliage, 1));
  return g;
}

function simpleSpruce() {
  const a = new THREE.ConeGeometry(0.15, 0.72, 6, 1, true).translate(0, 0.08 + 0.36, 0);
  const b = new THREE.ConeGeometry(0.1, 0.5, 6, 1, true).translate(0, 0.5 + 0.25, 0).rotateY(0.5);
  const g = mergeGeometries([a, b]);
  g.computeVertexNormals();
  g.setAttribute("aFoliage", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
  return g;
}

const VERT = /* glsl */ `
attribute float aFoliage;
uniform vec2 uOrigin;     // integer cell coords of grid corner
uniform float uCell;
uniform float uN;
uniform vec4 uFade;       // fade-in start/end, fade-out start/end (m)
uniform float uWidth;
uniform float uFill;
uniform float uDensPow;   // >1 thins out isolated trees in the coarse tiers
uniform vec3 uViewPos;    // the viewer (the shadow pass renders from the sun)
varying vec3 vNormal;
varying vec3 vWorld;
varying float vH;
varying float vVis;
varying float vTint;
varying float vFoliage;
${HEIGHT_GLSL}
${NOISE_GLSL}
${LANDCOVER_GLSL}
${SHADOW_GLSL}
${MEADOW_GLSL}
uniform float uCurvature;
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  float id = float(gl_InstanceID);
  float iz = floor(id / uN);
  float ix = id - iz * uN;
  vec2 cell = uOrigin + vec2(ix, iz);
  vec2 pos = (cell + 0.15 + 0.7 * hash22(cell)) * uCell;
  vec2 dh = pos - uViewPos.xz;
  float d = length(dh);
  float fade = (uFade.y > 0.0 ? smoothstep(uFade.x, uFade.y, d) : 1.0) * (1.0 - smoothstep(uFade.z, uFade.w, d));
  // no trees in the brooks or on the trails
  float dens = pow(forestDensity(pos), uDensPow) * (1.0 - smoothstep(0.3, 0.6, streamWet(pos))) * (1.0 - smoothstep(0.15, 0.35, trailMark(pos)));
  float keep = step(hash12(cell * 1.37 + 5.1), dens * uFill);
  if (keep * fade < 0.02) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  float r1 = hash12(cell + 3.7), r2 = hash12(cell + 9.1), r3 = hash12(cell + 1.3);
  float h = mix(14.0, 30.0, r1 * r1) * mix(0.6, 1.0, fade);
  float w = h * uWidth * mix(0.85, 1.2, r2) * fade;
  float ang = r3 * 6.2831;
  vec3 p = position;
  p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
  vec3 n = normal;
  n.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * n.xz;
  // soften normals toward a spheroid around the crown axis (painted foliage look)
  vec3 radial = normalize(vec3(p.x, (p.y - 0.45) * 0.35, p.z) + 1e-4);
  vNormal = normalize(mix(n, radial, 0.45 * aFoliage));

  float ground = terrainHeight(pos);
  // the wind (glsl.js windQ): the crown leans a little with the gusts and swings slowly (~0.3 Hz),
  // the more the higher up (as the near forest, assets.js uSway); unseen beyond ~1.5 km
  vec2 wsw = vec2(0.0);
  if (d < 1500.0) {
    float wb = windBend(pos);
    wsw = windDirAt(pos) * (0.02 * wb + 0.008 * tnoise(uTime * 0.32 + r3 * 20.0, r3) * (0.06 + wb)) * p.y * p.y * h;
  }
  vec3 world = vec3(pos.x + p.x * w + wsw.x, ground - 0.4 + p.y * h, pos.y + p.z * w + wsw.y);
  vWorld = world;
  vH = p.y;
  vTint = r2;
  vFoliage = aFoliage;
  vVis = groundSunVis(pos, p.y * h, dens, d);   // near the viewer the trees shade each other (object shadows)
  #ifndef SHADOW_PASS
  world.y -= dot(dh, dh) * uCurvature;
  #endif
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
varying float vH;
varying float vVis;
varying float vTint;
varying float vFoliage;
${ATMOS_GLSL}
${TOON_GLSL}
${OBJ_SHADOW_GLSL}
#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 deep = mix(vec3(0.012, 0.042, 0.038), vec3(0.02, 0.05, 0.03), vTint);
  vec3 tip = mix(vec3(0.05, 0.11, 0.055), vec3(0.075, 0.13, 0.05), vTint);
  vec3 albedo = mix(deep, tip, smoothstep(0.1, 0.95, vH));
  albedo = mix(vec3(0.05, 0.035, 0.025), albedo, vFoliage);
  vec3 col = toonLight(albedo, n, vVis * objectShadow(vWorld, n), 0.12);
  // rim light when the sun is behind the tree
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * pow(max(dot(-v, uSunDir), 0.0), 2.0);
  col += uSunColor * rim * 0.35 * vVis;
  col = applyAtmosphere(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// shadow pass (shadows.js cascade 2): light-space depth of the crowns
const SHADOW_FRAG = /* glsl */ `
varying vec3 vWorld;
${OBJ_SHADOW_GLSL}
void main() { gl_FragColor = vec4(shadowPassDepth(vWorld)); }
`;

export class Forest {
  constructor() {
    this.group = new THREE.Group();
    const detailed = detailedSpruce(), simple = simpleSpruce();
    // near: detailed trees; mid/far: simple cones with wider crowns to keep canopy cover
    this.tiers = [
      { cell: 7, radius: 700, geo: detailed, fade: [205, 240, 560, 700], width: 0.95, fill: 0.85, densPow: 1 },   // (in as the near forest dissolves, slice.js LOD_FAR)
      { cell: 12, radius: 2600, geo: simple, fade: [560, 700, 2200, 2600], width: 1.25, fill: 0.9, densPow: 1.6 },
      { cell: 30, radius: 7000, geo: simple, fade: [2200, 2600, 5800, 7000], width: 2.0, fill: 0.97, densPow: 2.5 },
    ];
    for (const t of this.tiers) {
      t.n = Math.ceil((2 * t.radius) / t.cell);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = t.geo.index;
      for (const k of ["position", "normal", "aFoliage"]) geo.setAttribute(k, t.geo.attributes[k]);
      geo.instanceCount = t.n * t.n;
      t.uniforms = {
        ...atmos,
        ...worldUniforms,
        uOrigin: { value: new THREE.Vector2() },
        uCell: { value: t.cell },
        uN: { value: t.n },
        uFade: { value: new THREE.Vector4(...t.fade) },
        uWidth: { value: t.width },
        uFill: { value: t.fill },
        uDensPow: { value: t.densPow },
        uViewPos: { value: new THREE.Vector3() },
        ...shadowUniforms,
      };
      const mat = new THREE.ShaderMaterial({ uniforms: t.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
      t.mesh = new THREE.Mesh(geo, mat);
      t.mesh.frustumCulled = false;
      // every tree also casts its shadow into the wide object-shadow cascade (layer 2)
      t.mesh.userData.shadowMaterial = new THREE.ShaderMaterial({ uniforms: t.uniforms, vertexShader: VERT, fragmentShader: SHADOW_FRAG,
        side: THREE.DoubleSide, defines: { SHADOW_PASS: 1 } });
      t.mesh.layers.enable(2);
      this.group.add(t.mesh);
    }
  }

  update(camera) {
    for (const t of this.tiers) {
      t.uniforms.uViewPos.value.copy(camera.position);
      t.uniforms.uOrigin.value.set(
        Math.floor(camera.position.x / t.cell) - t.n / 2,
        Math.floor(camera.position.z / t.cell) - t.n / 2
      );
    }
  }
}
