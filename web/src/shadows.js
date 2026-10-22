import * as THREE from "three";

// Object shadows: sun-aligned orthographic cascades: two centred ahead of the viewer (64 m,
// 420 m, every frame / every 3rd) and a wide one round the viewer (1.6 km, redrawn when the viewer
// has moved 40 m or the sun has moved) that also holds every tree of the GPU forest (trees.js,
// layer 2), so the forest floor is lit and shaded by the trees that stand there.
// Casters render with their `userData.shadowMaterial` (same vertex code, SHADOW_PASS
// defined) into an R32F target that stores normalised light-space depth. Receivers call
// objectShadow(worldPos, normal) from OBJ_SHADOW_GLSL. Terrain self-shadowing stays in
// world.js (height-field shadows); this adds buildings, trees, rocks, animals.

const DEPTH_RANGE = 1500; // metres either side of the cascade centre plane

export const shadowUniforms = {
  uShadowMap0: { value: null },
  uShadowMap1: { value: null },
  uShadowMap2: { value: null },
  uShadowMat0: { value: new THREE.Matrix4() },
  uShadowMat1: { value: new THREE.Matrix4() },
  uShadowMat2: { value: new THREE.Matrix4() },
  uShadowPassMat: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector3(1 / 2048, 1 / 2048, 1 / 2048) },
  uShadowOn: { value: 0 },
};

export const OBJ_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform sampler2D uShadowMap2;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform mat4 uShadowMat2;
uniform mat4 uShadowPassMat;
uniform vec3 uShadowTexel;
uniform float uShadowOn;
float shadowCascade(sampler2D m, mat4 M, vec3 wp, float bias, float texel) {
  vec3 p = (M * vec4(wp, 1.0)).xyz;
  if (any(lessThan(p.xy, vec2(0.02))) || any(greaterThan(p.xy, vec2(0.98)))) return -1.0;
  float s = 0.0;
  // 12-tap rotated disc PCF for soft painterly edges
  float ang = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996;
    vec2 o = R * vec2(cos(a), sin(a)) * sqrt(float(i) + 0.5) * 0.55;
    float d = texture2D(m, p.xy + o * texel).r;
    s += step(p.z - bias, d);
  }
  return s / 12.0;
}
float objectShadow(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  wp += n * 0.04;  // normal offset against acne
  float s = shadowCascade(uShadowMap0, uShadowMat0, wp, 0.00002, uShadowTexel.x);
  if (s < 0.0) s = shadowCascade(uShadowMap1, uShadowMat1, wp + n * 0.15, 0.0001, uShadowTexel.y);
  if (s < 0.0) s = shadowCascade(uShadowMap2, uShadowMat2, wp + n * 0.3, 0.00025, uShadowTexel.z);
  return s < 0.0 ? 1.0 : s;
}
float shadowPassDepth(vec3 wp) { return (uShadowPassMat * vec4(wp, 1.0)).z; }
`;

export class ObjectShadows {
  constructor(renderer, { size0 = 64, size1 = 420, size2 = 1600, res = 2048 } = {}) {
    this.renderer = renderer;
    this.cascades = [size0, size1, size2].map((size, i) => {
      const rt = new THREE.WebGLRenderTarget(res, res, {
        type: THREE.FloatType,
        format: THREE.RedFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
      });
      rt.texture.generateMipmaps = false;
      const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 1, 2 * DEPTH_RANGE);
      return { size, rt, cam, mat: new THREE.Matrix4(), texel: 1 / res, res };
    });
    shadowUniforms.uShadowMap0.value = this.cascades[0].rt.texture;
    shadowUniforms.uShadowMap1.value = this.cascades[1].rt.texture;
    shadowUniforms.uShadowMap2.value = this.cascades[2].rt.texture;
    shadowUniforms.uShadowTexel.value.set(this.cascades[0].texel, this.cascades[1].texel, this.cascades[2].texel);
    this.last2 = { pos: new THREE.Vector3(1e9, 0, 1e9), sun: new THREE.Vector3() };
    shadowUniforms.uShadowOn.value = 1;
    this._clear = new THREE.Color();
    this.frame = 0;
  }

  // Casters are meshes on layer 1 carrying userData.shadowMaterial; `roots` are searched
  // for them. The shadow cameras only see layer 1, so the scene renders unchanged otherwise.
  update(camera, sunDir, scene, roots) {
    if (sunDir.y < 0.01) {
      shadowUniforms.uShadowOn.value = 0;
      return;
    }
    shadowUniforms.uShadowOn.value = 1;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const L = sunDir.clone().normalize(); // toward the sun
    const up = Math.abs(L.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, L).normalize();
    const upL = new THREE.Vector3().crossVectors(L, right).normalize();
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(this._clear).clone();
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    r.setClearColor(0xffffff, 1);
    r.autoClear = true;

    // swap materials once for both cascades (and first put back any a cut-short pass left swapped: an
    // error mid-pass, or a script stopped mid-frame, left every caster drawn with its depth material)
    if (this.pending) for (const [o, mat] of this.pending) o.material = mat;
    const swapped = (this.pending = []);
    for (const root of roots) {
      root.traverse((o) => {
        if (o.isMesh && o.userData.shadowMaterial && o.visible) {
          swapped.push([o, o.material]);
          o.material = o.userData.shadowMaterial;
        }
      });
    }
    this.cascades.forEach((c, i) => {
      if (i === 1 && this.frame % 3 !== 0 && this.frame > 2) return; // far cascade updates every 3rd frame
      if (i === 2) {   // the wide cascade: only when the viewer or the sun has moved
        const moved = Math.hypot(camera.position.x - this.last2.pos.x, camera.position.z - this.last2.pos.z);
        if (moved < 40 && L.angleTo(this.last2.sun) < 0.002) return;
        this.last2.pos.copy(camera.position);
        this.last2.sun.copy(L);
      }
      const center = i === 2 ? camera.position.clone() : camera.position.clone().addScaledVector(fwd, c.size * 0.35);
      // snap to texels in light space to avoid shimmering
      const tx = c.size / c.res;
      const cx = Math.round(center.dot(right) / tx) * tx;
      const cy = Math.round(center.dot(upL) / tx) * tx;
      const cz = center.dot(L);
      const snapped = right.clone().multiplyScalar(cx).addScaledVector(upL, cy).addScaledVector(L, cz);
      c.cam.position.copy(snapped).addScaledVector(L, DEPTH_RANGE);
      c.cam.up.copy(upL);
      c.cam.lookAt(snapped);
      c.cam.updateMatrixWorld();
      c.cam.updateProjectionMatrix();
      // world -> (u, v, normalised depth); depth grows away from the sun
      const m = new THREE.Matrix4().set(
        right.x / c.size, right.y / c.size, right.z / c.size, 0.5 - cx / c.size,
        upL.x / c.size, upL.y / c.size, upL.z / c.size, 0.5 - cy / c.size,
        -L.x / (2 * DEPTH_RANGE), -L.y / (2 * DEPTH_RANGE), -L.z / (2 * DEPTH_RANGE), 0.5 + cz / (2 * DEPTH_RANGE),
        0, 0, 0, 1
      );
      c.mat.copy(m);
      shadowUniforms.uShadowPassMat.value.copy(m);
      r.setRenderTarget(c.rt);
      r.clear();
      c.cam.layers.set(1);
      if (i >= 1) c.cam.layers.enable(3);   // casters that only matter beyond the 64 m cascade (mid-range trees)
      if (i === 2) c.cam.layers.enable(2);   // + the GPU forest
      r.render(scene, c.cam);
      shadowUniforms[["uShadowMat0", "uShadowMat1", "uShadowMat2"][i]].value.copy(m);
    });
    for (const [o, mat] of swapped) o.material = mat;
    this.pending = null;
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    this.frame++;
  }
}

// mark every mesh under root as a shadow caster (layer 1)
export function markCaster(root) {
  root.traverse((o) => {
    if (o.isMesh && o.userData.shadowMaterial) o.layers.enable(1);
  });
  return root;
}
