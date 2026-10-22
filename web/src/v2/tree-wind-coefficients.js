import { InterleavedBuffer, InterleavedBufferAttribute } from "three";

const prepared = new WeakMap(), installed = new WeakMap();
const OFFSET = "vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());";
const NAMES = ["aTreeWindCoefficients", "aTreeWindEddy"];

// Static coefficients only: prepare after the authored geometry transforms and
// volume construction, before creating spatial/root geometry wrappers. A pair of
// shared position/wind attributes owns one buffer, regardless of batch count.
export function prepareTreeWindCoefficients(geometry) {
  const position = geometry.getAttribute("position");
  const wind = geometry.getAttribute("aPlantWind") || geometry.getAttribute("_plant_wind");
  if (!position || !wind || position.count !== wind.count || position.itemSize !== 3 || wind.itemSize !== 3)
    throw new Error("Tree wind coefficients require matching position and plant-wind vectors.");
  if (geometry.userData.gpuBrushShell || Object.keys(geometry.morphAttributes).length)
    throw new Error("Tree wind coefficients require a complete static tree geometry.");
  let byWind = prepared.get(position);
  if (!byWind) { byWind = new WeakMap(); prepared.set(position, byWind); }
  let entry = byWind.get(wind);
  if (entry && (entry.positionVersion !== position.version || entry.windVersion !== wind.version))
    throw new Error("Tree wind coefficient source attributes changed after preparation.");
  const reused = !!entry;
  if (!entry) {
    const data = new Float32Array(position.count * 5);
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i), wx = wind.getX(i), wy = wind.getY(i), wz = wind.getZ(i);
      if (![y, wx, wy, wz].every(Number.isFinite)) throw new Error("Tree wind coefficient source is not finite.");
      const h = Math.min(20, Math.max(0, y)), H = h * h * .0014, a = .48 * wx, b = 1 - a, k = i * 5;
      data[k] = b * (1.32 * H - .12 * wy);
      data[k + 1] = (1.32 * a - .32) * H + b * .12 * wy;
      data[k + 2] = .018 * wy * Math.cos(wz);
      data[k + 3] = .018 * wy * Math.sin(wz);
      data[k + 4] = .018 * wy;
    }
    const buffer = new InterleavedBuffer(data, 5);
    entry = {
      attributes: [new InterleavedBufferAttribute(buffer, 4, 0), new InterleavedBufferAttribute(buffer, 1, 4)],
      positionVersion: position.version, windVersion: wind.version,
      vertexCount: position.count, bytes: data.byteLength,
    };
    byWind.set(wind, entry);
  }
  for (let i = 0; i < NAMES.length; i++) {
    const previous = geometry.getAttribute(NAMES[i]);
    if (previous && previous !== entry.attributes[i]) throw new Error("Conflicting tree wind coefficient attribute.");
  }
  for (let i = 0; i < NAMES.length; i++) geometry.setAttribute(NAMES[i], entry.attributes[i]);
  return { attributes: entry.attributes, vertexCount: entry.vertexCount, bytes: entry.bytes, allocatedBytes: reused ? 0 : entry.bytes };
}

// Match the original GPU uniform conversion and float32 time multiplication.
// Splitting sin(phase + wz) into sin/cos terms changes floating-point rounding,
// particularly after long sessions; this is algebraic, not bitwise equivalence.
export function updateTreeWindCoefficientPhase(phase, time) {
  if (!phase?.value?.isVector2 || !Number.isFinite(time)) throw new Error("Tree wind phase requires a Vector2 uniform and finite time.");
  const angle = Math.fround(Math.fround(time) * Math.fround(.85));
  phase.value.set(Math.sin(angle), Math.cos(angle));
  return phase;
}

const DECLARATIONS = /* glsl */`
attribute vec4 aTreeWindCoefficients;
attribute float aTreeWindEddy;
uniform vec2 uTreeWindCoefficientPhase;
uniform float uTreeWindCoefficients;
`;
const REPLACEMENT = /* glsl */`
vec2 ecoOffset;
if(uTreeWindCoefficients>.5) {
  float treeWindAlong=dot(aTreeRootWind.zw,aTreeWindCoefficients.xy)
    +dot(uTreeWindCoefficientPhase,aTreeWindCoefficients.zw);
  ecoOffset=aTreeRootWind.xy*treeWindAlong
    +vec2(-aTreeRootWind.y,aTreeRootWind.x)*aTreeRootEddy*aTreeWindEddy;
} else {
  ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());
}
`;

export function installTreeWindCoefficients(material, { phase, enabled }) {
  if (!phase?.value?.isVector2 || !enabled || !Number.isFinite(enabled.value))
    throw new Error("Tree wind coefficients require shared phase and enabled uniforms.");
  const current = installed.get(material);
  if (current) {
    if (current.phase !== phase || current.enabled !== enabled) throw new Error("Conflicting tree wind coefficient controls.");
    return material;
  }
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!/const float uPlantMode=(?:1|5)\.0;/.test(shader.vertexShader) ||
        !shader.vertexShader.includes("#define ECO_TREE") ||
        material.defines?.ECO_ROOT_WIND === undefined ||
        shader.vertexShader.split(OFFSET).length !== 2)
      throw new Error("Tree wind coefficients require the unchanged mode 1/5 static ecology wind hook.");
    shader.uniforms.uTreeWindCoefficientPhase = phase;
    shader.uniforms.uTreeWindCoefficients = enabled;
    shader.vertexShader = DECLARATIONS + shader.vertexShader.replace(OFFSET, REPLACEMENT);
  };
  material.customProgramCacheKey = () => key + "-tree-wind-coefficients-v1";
  material.userData.treeWindCoefficients = { phase, enabled };
  installed.set(material, { phase, enabled });
  return material;
}
