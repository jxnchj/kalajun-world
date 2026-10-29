import { Group, Scene, PCFShadowMap, FrontSide, BackSide, DoubleSide } from "three";
import { compilePreparedWorld } from "./shader-readiness.js";
import { ownedShadowSide } from "./owned-shadow-policy.js";

const FIELDS = ["visible", "wireframe", "side", "alphaMap", "alphaTest", "map", "clipShadows", "clippingPlanes",
  "clipIntersection", "displacementMap", "displacementScale", "displacementBias", "wireframeLinewidth", "linewidth"];
const SHADOW_SIDE = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

// Exact PCF getDepthMaterial mapping in installed Three WebGLShadowMap. Keep
// this separate from material construction: authored wind/morph/needle shader
// hooks and depthPacking always remain those of the real customDepthMaterial.
export function shadowDepthState(material) {
  return [material.visible, material.wireframe, material.shadowSide ?? SHADOW_SIDE[material.side],
    material.alphaMap, material.alphaToCoverage ? .5 : material.alphaTest, material.map,
    material.clipShadows, material.clippingPlanes, material.clipIntersection,
    material.displacementMap, material.displacementScale, material.displacementBias,
    material.wireframeLinewidth, material.linewidth];
}

function materialsDrawn(object) {
  const source = object.userData.treeViewSource || object, g = source.geometry;
  if (!g || source.count === 0 || g.instanceCount === 0) return [];
  const start = Math.max(0, g.drawRange.start), end = Math.min(g.index?.count ?? g.attributes.position?.count ?? 0, g.drawRange.start + g.drawRange.count);
  if (end <= start) return [];
  if (!Array.isArray(object.material)) return object.material?.visible ? [object.material] : [];
  return [...new Set(g.groups.filter(group => Math.min(end, group.start + group.count) > Math.max(start, group.start))
    .map(group => object.material[group.materialIndex]).filter(material => material?.visible))];
}
function view(objects, name) {
  const group = new Group(); group.name = name;
  group.traverse = group.traverseVisible = callback => { callback(group); for (const object of objects) callback(object); };
  return group;
}

// Shader compilation only: no render, buffer upload, shadow-map allocation or
// temporary attachment to the scene. Kickoffs are synchronous so the caller
// can overlap this promise with colour compilation while restoring its HDR
// target immediately, just like compileVisibleWorld.
export function compileShadowWorld(renderer, scene, camera, { shadowDepth, lights = [], prepareDepthMaterial, projectedSpots = false } = {}) {
  const input = view([], "world-shadow-precompile-selection");
  const stats = input.userData.compileShadowSelection = { objects: 0, variants: 0, skippedUnsupported: 0, reason: "prepared" };
  const skip = reason => {
    stats.reason = reason;
    input.userData.compileReadiness = { elapsedMs: 0, probes: 0, maxProbeMs: 0, probeTotalMs: 0,
      programCount: 0, verifiedPrograms: 0, stalledProbes: 0, status: "skipped" };
    return Promise.resolve(input);
  };
  if (!renderer.shadowMap?.enabled || renderer.shadowMap.type !== PCFShadowMap) return skip("requires-pcf-shadow-map");
  // Actual shadow draws always bind an ordinary offscreen target. Compiling
  // against the screen/XR target would add output transfer and tone mapping,
  // producing a different cache key even for MeshDepthMaterial. The caller
  // owns a short target binding scope and restores it before awaiting.
  const target = renderer.getRenderTarget?.();
  if (!target || target.isXRRenderTarget === true) return skip("requires-offscreen-shadow-compile-target");
  if (!lights.length || lights.some(light => !light.isDirectionalLight && !(projectedSpots && light.isSpotLight && !light.map))) return skip("requires-directional-shadow-lights");
  // Public compile does not enter Three's private clipping.beginShadows(). Do
  // not guess a different clipping variant on a path this world does not use.
  if (renderer.localClippingEnabled || renderer.clippingPlanes?.length) return skip("unsupported-shadow-clipping");
  if (!shadowDepth?.prepare) return skip("missing-shadow-depth-preparation");
  shadowDepth.prepare();
  const visibleLights = new Set(); scene.traverseVisible(object => { if (object.isLight) visibleLights.add(object); });
  const activeLights = lights.filter(light => visibleLights.has(light) && light.layers.test(camera.layers) && light.castShadow);
  if (!activeLights.length) return skip("no-active-projected-shadows");
  const frustums = activeLights.map(light => { light.shadow.updateMatrices(light, camera); return light.shadow.getFrustum(); });
  const batches = [], byDepth = new Map();
  scene.traverseVisible(object => {
    if (!object.layers.test(camera.layers) || !(object.isMesh || object.isLine || object.isPoints) || !object.castShadow) return;
    const materials = materialsDrawn(object); if (!materials.length) return;
    if (object.frustumCulled && !frustums.some(f => object.intersectsFrustum(f))) return;
    const depth = object.customDepthMaterial;
    if (!depth?.isMeshDepthMaterial || depth.transparent) { stats.skippedUnsupported++; return; }
    stats.objects++;
    let variants = byDepth.get(depth); if (!variants) { prepareDepthMaterial?.(depth); variants = []; byDepth.set(depth, variants); }
    for (const material of materials) {
      const state = shadowDepthState(material);
      // Query the real owner before creating compile proxies. Never replay a
      // draw callback or derive this explicit policy from mutable depth.side.
      state[2] = ownedShadowSide(object, material, depth) ?? state[2];
      let batch = variants.find(candidate => candidate.state.every((value, i) => value === state[i]));
      if (!batch) { batch = { depth, state, objects: [] }; variants.push(batch); batches.push(batch); }
      const proxy = Object.create(object); proxy.material = depth; batch.objects.push(proxy);
    }
  });
  stats.variants = batches.length;
  if (!batches.length) return skip("no-supported-shadow-casters");
  const selected = batches.flatMap(batch => batch.objects);
  input.traverse = input.traverseVisible = callback => { callback(input); for (const object of selected) callback(object); };
  // renderBufferDirect(..., null, ...) uses Three's empty scene, hence NO fog
  // or environment. Keep exactly the original visible lights/shadow counts:
  // those still participate in the installed program key even for depth.
  const depthScene = new Scene(); depthScene.name = "world-shadow-compile-light-context";
  depthScene.traverseVisible = callback => { callback(depthScene); for (const light of visibleLights) callback(light); };
  const kickoff = {
    info: renderer.info, properties: renderer.properties, getContext: () => renderer.getContext(),
    initTexture: texture => renderer.initTexture(texture),
    compile() {
      const materials = new Set();
      for (const batch of batches) {
        const { depth, state } = batch, previous = FIELDS.map(key => depth[key]), own = FIELDS.map(key => Object.hasOwn(depth, key)), version = depth.version;
        try {
          FIELDS.forEach((key, i) => { depth[key] = state[i]; });
          for (const material of renderer.compile(view(batch.objects, "shadow-material-variant"), camera, depthScene)) materials.add(material);
        } finally {
          FIELDS.forEach((key, i) => { depth[key] = previous[i]; if (!own[i]) delete depth[key]; }); depth.version = version;
          // compile() updates currentProgram/common flags but does not render.
          // Ensure the first real draw reselects its exact warmed variant after
          // restoring shared material fields. Keep all compiled programs alive.
          const properties = renderer.properties?.get(depth); if (properties) properties.__version = undefined;
        }
      }
      return materials;
    }
  };
  return compilePreparedWorld(kickoff, input, camera, depthScene);
}
