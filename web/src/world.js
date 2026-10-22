import * as THREE from "three";
import { NOISE_GLSL, HEIGHT_GLSL, LANDCOVER_GLSL } from "./glsl.js";

// Uniforms shared by every world material (terrain, trees, grass, ...).
export const worldUniforms = {
  uCoreH: { value: null },
  uFarH: { value: null },
  uCoreLC: { value: null },
  uFarLC: { value: null },
  uCoreShadow: { value: null },
  uFarShadow: { value: null },
  uCoreHalf: { value: 0 },
  uCoreRes: { value: 0 },
  uCoreN: { value: 0 },
  uFarHalf: { value: 0 },
  uFarRes: { value: 0 },
  uFarN: { value: 0 },
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
  // streams.js: wetness of the brooks' beds and banks (4 m texels round the camp)
  uStreamMask: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat) },
  uStreamOrigin: { value: new THREE.Vector2() },
  uStreamSize: { value: 1 },
  // where the walker has trodden (character.js): x, z, seconds ago, strength -- the grass and the
  // plants bend away from these points and rise again over some seconds
  uTrail: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 1e3, 0)) },
  uWindStr: { value: 0.85 },   // wind of the moment / 4 m/s (main.js updateWind)
  uSward: { value: null },   // top-down texture of the lower sward (tools/paint_sward.py), 0.8 m tile
  uWindOff: { value: new THREE.Vector2() },
  uWindOffPrev: { value: new THREE.Vector2() },
  uWindStrPrev: { value: 0.85 },
  uTimePrev: { value: 0 },
  uCurvature: { value: 1 / (2 * (6371000 / 0.87)) },
  uExagCentre: { value: new THREE.Vector2(-1980, 3420) }, // the lodge camp (photos 1-5)
  uExag: { value: 1.0 },
  uDetail: { value: null },
  // how far the ground is lowered under the houses (slice.js buildPads; R8, glsl.js PAD_STEP per step)
  uPads: { value: null },
  uPadOrigin: { value: new THREE.Vector2(-1e6, -1e6) },
  uPadSize: { value: 1 },
  uPadAtlas: { value: new THREE.Vector3(1, 1, 1) },   // (slice.js buildPads: the main map and the outlying sites' tiles)
  uPadTiles: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
  uDetailOrigin: { value: new THREE.Vector2(-1e6, -1e6) },
  uDetailSize: { value: 1 },
  uDetailScale: { value: 0.02 },
  // habitat maps (tools/veg_map.py): 0 cosmos/daisy/poppy/globeflower, 1 forget-me-not/geranium/
  // delphinium/campanula, 2 yarrow/dandelion/clover/mantle, 3 grass types sedge/stipa/turf/fern
  uVegAtlas: { value: null },
  uVegOrigin: { value: new THREE.Vector2(-1e6, -1e6) },
  uVegSize: { value: 1 },
  // core-wide flora (tools/veg_core.py), 16 m/px, 2x2 atlas: the 12 species in the same
  // channels as uVeg0..2, plus the soft far-view colour of the drifts (rgb) and coverage (a)
  uVegCore: { value: null },
  uVegCoreOrigin: { value: new THREE.Vector2(-1e6, -1e6) },
  uVegCoreSize: { value: 1 },
  uFlora: { value: 1.0 },
  // levels of detail of the meadow plants (3D distance from the camera, m): the modelled plants
  // (vegetation.js) dissolve into their pictures (midplants.js) over x..y, the pictures into the
  // flower ring (flowers.js) over z..w -- pixel by pixel, each pixel drawn by exactly one of them
  uPlantLod: { value: new THREE.Vector4(9, 12, 38, 45) },
  // the viewer's position (main.js, every frame): levels of detail are chosen from it in every
  // pass, the sun's shadow pass included
  uViewer: { value: new THREE.Vector3() },
  uFarRef: { value: 0.0 },
  // shrubs (shrubs.js; per-species values from assets/shrubs.json)
  uShrubDens: { value: 0.35 },
  uShrubH: { value: [new THREE.Vector2(1.2, 1.9), new THREE.Vector2(0.7, 1.1), new THREE.Vector2(1.1, 1.7), new THREE.Vector2(0.6, 1.1)] },
  uShrubAspect: { value: [1, 1, 1, 2] },
  uShrubCol: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0.1, 0.15, 0.08)) },
  uShrubFill: { value: [0.4, 0.4, 0.4, 0.4] },
  uToneExposure: { value: 0.9 },   // = renderer.toneMappingExposure (main.js)  // calibration: shade the ground as seen from afar at any distance, no plants   // overall flower abundance (all levels of detail alike)
  uFloraCol: { value: Array.from({ length: 18 }, () => new THREE.Vector3(1, 1, 1)) },
  uFloraMaxD: { value: new Array(18).fill(0) },
  uFloraCov1: { value: new Array(18).fill(0) },   // seen from above (share of a full cell)
  uFloraCovV: { value: new Array(18).fill(0) },   // upright part, seen edge-on
  // props mask (R: no grass, G: trampled ground), 1 m/px square around the lodge
  uPropMask: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) },
  uMaskOrigin: { value: new THREE.Vector2(-1e6, -1e6) },
  uMaskSize: { value: 1 },
};
worldUniforms.uPropMask.value.needsUpdate = true;
worldUniforms.uStreamMask.value.needsUpdate = true;
{
  const t = new THREE.DataTexture(new Uint8Array([128, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  worldUniforms.uDetail.value = t;
  for (const k of ["uVegAtlas", "uVegCore", "uSward", "uPads"]) {
    const z = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    z.needsUpdate = true;
    worldUniforms[k].value = z;
  }
}

export const CANOPY_HEIGHT = 24; // mean Schrenk spruce canopy height used for shadows (m)

// Sun shadow heights over the core and far grids, recomputed when the sun moves.
export class SunShadows {
  constructor(renderer, terrain, atmos) {
    this.renderer = renderer;
    const mk = (n) => {
      const rt = new THREE.WebGLRenderTarget(n, n, {
        type: THREE.HalfFloatType,
        format: THREE.RGFormat,        // r: terrain + canopy roof, g: terrain only
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.core = mk(terrain.core.n);
    this.far = mk(terrain.far.n);
    worldUniforms.uCoreShadow.value = this.core.texture;
    worldUniforms.uFarShadow.value = this.far.texture;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...worldUniforms,
        uSunDir: atmos.uSunDir,
        uGridHalf: { value: 0 },
        uGridRes: { value: 0 },
        uStart: { value: 5 },
        uGrowth: { value: 1.09 },
        uMaxOcc: { value: terrain.maxH + CANOPY_HEIGHT },
      },
      defines: { STEPS: 110, CANOPY: CANOPY_HEIGHT.toFixed(1) },
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform float uGridHalf, uGridRes, uStart, uGrowth, uMaxOcc, uCurvature;
        ${NOISE_GLSL}
        ${HEIGHT_GLSL}
        ${LANDCOVER_GLSL}
        void main() {
          vec2 p = vec2(-uGridHalf) + gl_FragCoord.xy * uGridRes;
          float h0 = terrainHeight(p);
          float horiz = length(uSunDir.xz);
          if (uSunDir.y <= -0.01 || horiz < 1e-4) { gl_FragColor = vec4(vec2(uSunDir.y <= -0.01 ? 1000.0 : 0.0), 0.0, 1.0); return; }
          vec2 d = uSunDir.xz / horiz;
          float tanEl = uSunDir.y / horiz;
          float best = -1e4, bestT = -1e4;
          float t = uStart;
          for (int i = 0; i < STEPS; i++) {
            vec2 q = p + d * t;
            float ground = terrainHeight(q) - t * t * uCurvature;
            float occ = ground + forestDensity(q) * CANOPY;
            best = max(best, occ - t * tanEl);
            bestT = max(bestT, ground - t * tanEl);
            if (h0 + t * tanEl > uMaxOcc) break;
            t *= uGrowth;
          }
          gl_FragColor = vec4(clamp(best - h0, 0.0, 1000.0), clamp(bestT - h0, 0.0, 1000.0), 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.lastDir = new THREE.Vector3(0, -1, 0);
  }

  update(sunDir, force = false) {
    if (!force && sunDir.angleTo(this.lastDir) < 0.0015) return false; // < ~0.09°
    this.lastDir.copy(sunDir);
    const u = this.material.uniforms;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const grids = [
      [this.far, worldUniforms.uFarHalf.value, worldUniforms.uFarRes.value, 40],
      [this.core, worldUniforms.uCoreHalf.value, worldUniforms.uCoreRes.value, 6],
    ];
    for (const [rt, half, res, start] of grids) {
      u.uGridHalf.value = half;
      u.uGridRes.value = res;
      u.uStart.value = start;
      r.setRenderTarget(rt);
      r.render(this.scene, this.camera);
    }
    r.setRenderTarget(prev);
    return true;
  }
}
