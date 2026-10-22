import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { WebGLPrograms } from "three/src/renderers/webgl/WebGLPrograms.js";
import { compileShadowWorld } from "./compile-shadow-world.js";
import { WorldShadowDepth, useProjectedShadowDepth } from "./room-shadow.js";
import { attachEcologyWind } from "./ecology.js";

const shadowSource = readFileSync(new URL("../../node_modules/three/src/renderers/webgl/WebGLShadowMap.js", import.meta.url), "utf8");
// Execute the installed custom-depth branch itself, not a second copy of our
// field mapping. This fails if Three changes the private branch we mirror.
const source = shadowSource.slice(shadowSource.indexOf("function getDepthMaterial("), shadowSource.indexOf("function renderObject("));
const installedDepth = new Function("renderer", "VSMShadowMap", "shadowSide", "return (" + source + ")")(
  {}, THREE.VSMShadowMap, { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide });
function fixture({ renderTarget = new THREE.WebGLRenderTarget(1, 1) } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 1.8, .25, 150000), light = new THREE.DirectionalLight();
  camera._reversedDepth = true; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  light.position.set(0, 100, 0); light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 500 });
  light.shadow.camera._reversedDepth = true; light.shadow.camera.updateProjectionMatrix();
  scene.add(light, light.target, new THREE.HemisphereLight()); scene.updateMatrixWorld(true); light.shadow.updateMatrices(light, camera);
  scene.fog = new THREE.FogExp2("white", .01); scene.environment = new THREE.Texture();
  const shadowDepth = new WorldShadowDepth(scene), calls = [], properties = new WeakMap();
  const renderer = { shadowMap: { enabled: true, type: THREE.PCFShadowMap }, localClippingEnabled: false, clippingPlanes: [],
    state: { buffers: { depth: { getReversed: () => true } } }, outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping,
    getRenderTarget: () => renderTarget, setRenderTarget: value => { renderTarget = value; }, info: { programs: [] }, properties: { get(material) { let s = properties.get(material); if (!s) { s = { programs: new Map(), __version: material.version }; properties.set(material, s); } return s; } },
    getContext: () => ({ LINK_STATUS: 35714, isContextLost: () => false, getProgramParameter: () => true }),
    compile(input, c, target) {
      const objects = []; input.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) objects.push(o); });
      calls.push({ input, camera: c, target, objects });
      const materials = new Set();
      for (const object of objects) {
        materials.add(object.material); const state = this.properties.get(object.material);
        const program = { id: this.info.programs.length, name: "depth", program: {}, isReady: () => true };
        this.info.programs.push(program); state.programs.set(program.id, program);
      }
      return materials;
    }
  };
  return { scene, camera, light, shadowDepth, renderer, calls, run() { return compileShadowWorld(renderer, scene, camera, { shadowDepth, lights: [light] }); } };
}
function mesh(name, x = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); m.castShadow = true; m.name = name; m.position.set(x, 0, 0); return m;
}
const sceneState = scene => { const rows = []; scene.traverse(o => rows.push([o, o.parent, [...o.children], o.visible, o.material, o.count, o.matrixWorld.elements.slice()])); return rows; };

test("shadow preparation includes off-camera casters through the exact CSM frustum hook and preserves scene ownership", async () => {
  const f = fixture(), active = mesh("off-camera", 80), outside = mesh("outside", 500), hidden = new THREE.Group(), hiddenChild = mesh("hidden");
  hidden.visible = false; hidden.add(hiddenChild);
  const zero = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1); zero.count = 0; zero.castShadow = true;
  const empty = mesh("empty"), wrongLayer = mesh("layer"); empty.geometry.setDrawRange(0, 0); wrongLayer.layers.set(4);
  const custom = mesh("custom", 500); custom.intersectsFrustum = frustum => frustum === f.light.shadow.getFrustum();
  f.scene.add(active, outside, hidden, zero, empty, wrongLayer, custom); f.scene.updateMatrixWorld(true); const before = sceneState(f.scene);
  const result = await f.run(), selected = f.calls.flatMap(c => c.objects);
  assert.deepEqual(selected.map(o => o.name), ["off-camera", "custom"]); assert.ok(active.customDepthMaterial);
  assert.match(active.customDepthMaterial.customProgramCacheKey(), /projected-shadow-v1/);
  for (const proxy of selected) { assert.equal(proxy.parent, f.scene); assert.notEqual(proxy, active); assert.equal(proxy.material, Object.getPrototypeOf(proxy).customDepthMaterial); }
  assert.deepEqual(sceneState(f.scene), before); assert.equal(result.userData.compileShadowSelection.objects, 2);
  for (const c of f.calls) { assert.equal(c.target.fog, null); assert.equal(c.target.environment, null); const lights = []; c.target.traverseVisible(o => { if (o.isLight) lights.push(o); }); assert.equal(lights.length, 2); assert.ok(lights.includes(f.light)); }
  assert.equal(result.userData.compileReadiness.status, "complete");
});

test("24 installed Three depth cache keys match for structure/wind modes, instancing/color and all face sides", async () => {
  let matches = 0, wrongScene = 0;
  for (const mode of [0, 2, 5, 12]) for (const instanced of [false, true]) for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
    const f = fixture(), source = new THREE.MeshStandardMaterial({ side, map: new THREE.Texture(), alphaTest: mode ? .35 : 0, alphaToCoverage: mode === 2 });
    source.displacementMap = new THREE.Texture(); source.displacementScale = .2; source.displacementBias = -.1;
    const createDepth = () => useProjectedShadowDepth(mode ? attachEcologyWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), {}, mode, true, true) : new THREE.MeshDepthMaterial());
    const geometry = new THREE.BoxGeometry(), object = instanced ? new THREE.InstancedMesh(geometry, source, 1) : new THREE.Mesh(geometry, source);
    if (instanced) object.setColorAt(0, new THREE.Color("red")); object.castShadow = true; object.customDepthMaterial = createDepth(); f.scene.add(object); f.scene.updateMatrixWorld(true);
    const lights = { sun: [], directional: [{}], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [{}], sunShadowMap: [], directionalShadowMap: [{}], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0 };
    const programs = WebGLPrograms(f.renderer, { get: () => null }, { has: () => false }, { precision: "highp", getMaxPrecision: () => "highp", logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
    const ref = Object.create(object); ref.customDepthMaterial = createDepth();
    const actual = installedDepth(ref, source, f.light, THREE.PCFShadowMap);
    const key = (depth, target, obj) => programs.getProgramCacheKey(programs.getParameters(depth, lights, [f.light], target, obj, []));
    const expected = key(actual, { fog: null, environment: null }, object);
    if (key(actual, f.scene, object) !== expected) wrongScene++;
    const original = f.renderer.compile;
    f.renderer.compile = function(input, camera, target) {
      input.traverse(o => { if (o.isMesh) { assert.equal(key(o.material, target, o), expected); matches++; } });
      return original.call(this, input, camera, target);
    };
    const before = Object.getOwnPropertyDescriptors(object.customDepthMaterial);
    await f.run(); assert.deepEqual(Object.getOwnPropertyDescriptors(object.customDepthMaterial), before);
    assert.equal(f.renderer.properties.get(object.customDepthMaterial).__version, undefined, "real draw must select its own warmed variant again");
    assert.ok(f.renderer.properties.get(object.customDepthMaterial).programs.size > 0);
  }
  assert.equal(matches, 24); assert.equal(wrongScene, 24, "using main fog target would waste all 24 compiled variants");
});

test("shared depth material variants are grouped and restored synchronously before asynchronous readiness", async () => {
  const f = fixture(), a = mesh("a"), b = mesh("b"), c = mesh("same-as-a");
  const depth = useProjectedShadowDepth(new THREE.MeshDepthMaterial()); a.customDepthMaterial = b.customDepthMaterial = c.customDepthMaterial = depth;
  c.material = a.material; b.material.alphaTest = .6; b.material.side = THREE.DoubleSide;
  f.scene.add(a, b, c); f.scene.updateMatrixWorld(true); const before = Object.getOwnPropertyDescriptors(depth);
  const original = f.renderer.compile; let ready = false;
  f.renderer.compile = function(...args) { const materials = original.apply(this, args); this.info.programs.forEach(p => { p.isReady = () => ready; }); return materials; };
  const promise = f.run(); assert.equal(f.calls.length, 2); assert.deepEqual(Object.getOwnPropertyDescriptors(depth), before);
  assert.equal(f.calls[0].objects.length, 2); assert.equal(f.calls[1].objects.length, 1);
  ready = true; const result = await promise; assert.equal(result.userData.compileReadiness.verifiedPrograms, 3);
});

test("compile and link failures restore every temporary depth field and reject without rendering", async () => {
  for (const kind of ["compile", "ready", "link"]) {
    const f = fixture(), object = mesh("failure"); object.material.alphaTest = .5;
    object.customDepthMaterial = useProjectedShadowDepth(new THREE.MeshDepthMaterial()); f.scene.add(object); f.scene.updateMatrixWorld(true);
    const before = Object.getOwnPropertyDescriptors(object.customDepthMaterial), original = f.renderer.compile;
    f.renderer.render = () => { throw Error("must never render"); };
    f.renderer.compile = function(...args) { if (kind === "compile") throw Error("kickoff failed"); const m = original.apply(this, args); if (kind === "ready") this.info.programs[0].isReady = () => { throw Error("ready failed"); }; return m; };
    if (kind === "link") f.renderer.getContext = () => ({ LINK_STATUS: 35714, isContextLost: () => false, getProgramParameter: () => false, getProgramInfoLog: () => "bad link", getShaderInfoLog: () => "bad shader" });
    if (kind === "compile") assert.throws(() => f.run(), /kickoff failed/); else await assert.rejects(f.run(), /ready failed|Shader link failed/);
    assert.deepEqual(Object.getOwnPropertyDescriptors(object.customDepthMaterial), before);
  }
});

test("non-PCF, non-directional and clipping routes explicitly skip instead of preparing mismatched shader variants", async () => {
  for (const change of [f => { f.renderer.shadowMap.type = THREE.VSMShadowMap; }, f => { f.light.isDirectionalLight = false; }, f => { f.renderer.localClippingEnabled = true; }]) {
    const f = fixture(); f.scene.add(mesh("not-prepared")); change(f); let prepares = 0; f.shadowDepth.prepare = () => { prepares++; };
    const result = await f.run(); assert.equal(prepares, 0); assert.equal(f.calls.length, 0); assert.equal(result.userData.compileReadiness.status, "skipped"); assert.notEqual(result.userData.compileShadowSelection.reason, "prepared");
  }
});


test("screen and XR targets cannot be mistaken for the actual offscreen shadow program, in reversed and log depth", async () => {
  for (const logarithmicDepthBuffer of [false, true]) {
    const f = fixture({ renderTarget: null }), object = mesh("screen-target");
    object.customDepthMaterial = useProjectedShadowDepth(new THREE.MeshDepthMaterial());
    f.scene.add(object); f.scene.updateMatrixWorld(true);
    f.renderer.state.buffers.depth.getReversed = () => !logarithmicDepthBuffer;
    const lights = { sun: [], directional: [{}], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [{}], sunShadowMap: [], directionalShadowMap: [{}], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0 };
    const programs = WebGLPrograms(f.renderer, { get: () => null }, { has: () => false }, { precision: "highp", getMaxPrecision: () => "highp", logarithmicDepthBuffer }, {}, { numPlanes: 0, numIntersection: 0 });
    const depth = installedDepth(object, object.material, f.light, THREE.PCFShadowMap);
    const parameters = () => programs.getParameters(depth, lights, [f.light], { fog: null, environment: null }, object, []);
    const screen = parameters(), screenKey = programs.getProgramCacheKey(screen);
    assert.equal(screen.outputColorSpace, THREE.SRGBColorSpace); assert.equal(screen.toneMapping, THREE.ACESFilmicToneMapping);
    let prepares = 0; const prepare = f.shadowDepth.prepare.bind(f.shadowDepth);
    f.shadowDepth.prepare = () => { prepares++; prepare(); };
    for (const target of [null, { isXRRenderTarget: true, texture: { colorSpace: THREE.SRGBColorSpace } }]) {
      f.renderer.setRenderTarget(target);
      const result = await f.run();
      assert.equal(result.userData.compileReadiness.status, "skipped");
      assert.equal(result.userData.compileShadowSelection.reason, "requires-offscreen-shadow-compile-target");
      assert.equal(prepares, 0); assert.equal(f.calls.length, 0);
    }
    const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
    f.renderer.setRenderTarget(target);
    const offscreen = parameters(), expected = programs.getProgramCacheKey(offscreen);
    assert.equal(offscreen.outputColorSpace, THREE.LinearSRGBColorSpace); assert.equal(offscreen.toneMapping, THREE.NoToneMapping);
    assert.notEqual(screenKey, expected);
    const compile = f.renderer.compile;
    f.renderer.compile = function(input, camera, scene) {
      input.traverse(o => { if (o.isMesh) assert.equal(programs.getProgramCacheKey(programs.getParameters(o.material, lights, [f.light], scene, o, [])), expected); });
      return compile.call(this, input, camera, scene);
    };
    const promise = f.run(); f.renderer.setRenderTarget(null);
    const result = await promise; assert.equal(result.userData.compileReadiness.status, "complete");
    assert.equal(prepares, 1); assert.equal(f.renderer.getRenderTarget(), null);
    assert.equal(f.renderer.outputColorSpace, THREE.SRGBColorSpace); assert.equal(f.renderer.toneMapping, THREE.ACESFilmicToneMapping);
    target.dispose();
  }
});

test("shadow precompile checks resident counts rather than an empty previous camera buffer",async()=>{
 const f=fixture(),source=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2),proxy=mesh("view");proxy.userData.treeViewSource=source;proxy.geometry.instanceCount=0;proxy.intersectsFrustum=()=>true;f.scene.add(proxy);
 const result=await f.run();assert.equal(result.userData.compileShadowSelection.objects,1);
 source.count=0;const empty=await f.run();assert.equal(empty.userData.compileShadowSelection.objects,0);
});
