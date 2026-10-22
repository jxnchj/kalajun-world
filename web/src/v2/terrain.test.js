import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WorldTerrain } from "./terrain.js";
import { TerrainSampleCache } from "./terrain-sample-cache.js";
import { TerrainTileCache } from "./terrain-tile-cache.js";
import { createTerrainMaterial, terrainMorphColorChunk, terrainRockFraction } from "./terrain-material.js";
import { CSM } from "three/addons/csm/CSM.js";
import { WorldEnvironment } from "./environment.js";
import { createAerialUniforms } from "./aerial-perspective.js";
import { createCloudUniforms } from "./cloud-field.js";

const SIZE = 81920;
function fixture({ pads = [], heightAt } = {}) {
  const height = heightAt || ((x, z) => 2100 + x * 0.06 - z * 0.04 + 4 * Math.sin(x / 130) * Math.cos(z / 170));
  return {
    meta: { far: { size: SIZE } },
    surface: { pads, heightAt: height, geographicHeightAt: height,
      normalAt(x, z, e) {
        const dx = height(x - e, z) - height(x + e, z), dz = height(x, z - e) - height(x, z + e), len = Math.hypot(dx, 2 * e, dz);
        return { x: dx / len, y: 2 * e / len, z: dz / len };
      },
    },
    landcoverAt: (x, z) => ({ r: Math.max(0, Math.sin(x / 600)) * 0.6, g: Math.max(0, Math.cos(z / 500)) * 0.2, b: 0, a: 1 }),
  };
}
function cameraAt(world, x = -1980, z = 3420, altitude = 2) {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 150000);
  camera.position.set(x, world.surface.heightAt(x, z) + altitude, z);
  camera.lookAt(x + 200, world.surface.heightAt(x + 200, z - 100), z - 100);
  camera.updateMatrixWorld();
  return camera;
}
function assertCoverage(terrain) {
  const meshes = terrain.group.children.filter((m) => m.visible);
  assert.equal(meshes.reduce((area, m) => area + m.userData.terrainTile.size ** 2, 0), SIZE ** 2);
  // An area sum alone could hide an overlap and a matching hole. Sample every
  // coarse grid cell plus the narrow refined part around the camera.
  const points = [];
  for (let z = -40000; z < 40000; z += 5000) for (let x = -40000; x < 40000; x += 5000) points.push([x + 0.123, z + 0.234]);
  for (const [x, z] of points) {
    const count = meshes.reduce((n, m) => { const t = m.userData.terrainTile; return n + (x >= t.x && x < t.x + t.size && z >= t.z && z < t.z + t.size ? 1 : 0); }, 0);
    assert.equal(count, 1, `coverage at ${x}, ${z}`);
  }
}
function settle(terrain, camera, limit = 1600) {
  let quiet = 0;
  for (let i = 0; i < limit; i++) {
    terrain.update(camera, 1 / 60);
    if (i % 37 === 0) assertCoverage(terrain);
    quiet = terrain.stats.queuedTiles === 0 && terrain.stats.morphingGroups === 0 ? quiet + 1 : 0;
    // Child activation can empty the queue just before the next plan schedules
    // its finer descendants. Wait across several planning intervals.
    if (i > 120 && quiet > 30) return;
  }
  assert.fail("terrain refinement did not settle");
}

test("whole-world coverage survives refinement, interrupted jobs and distant relocation", () => {
  const world = fixture(), terrain = new WorldTerrain(world), camera = cameraAt(world);
  assertCoverage(terrain);
  for (let i = 0; i < 30; i++) terrain.update(camera, 1 / 60);
  camera.position.set(35000, 12000, -35000); camera.lookAt(0, 2100, 0); camera.updateMatrixWorld();
  settle(terrain, camera); assertCoverage(terrain);
  const coarse = terrain.stats.residentTiles;
  camera.copy(cameraAt(world)); settle(terrain, camera);
  assert.equal(terrain.stats.minSpacing, 0.3125);
  assert.ok(terrain.stats.residentTiles > coarse);
  const detailed = terrain.stats.residentTiles;
  camera.position.set(35000, 12000, -35000); camera.lookAt(0, 2100, 0); camera.updateMatrixWorld();
  settle(terrain, camera);
  assert.ok(terrain.stats.residentTiles < detailed);
  assertCoverage(terrain); terrain.dispose();
});

test("vertices retain source heights, unit normals, consistent world UVs and upward winding", () => {
  const world = fixture(), terrain = new WorldTerrain(world);
  settle(terrain, cameraAt(world));
  const shared = new Map();
  for (const mesh of terrain.group.children) {
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, color = g.attributes.color, cover = g.attributes.terrainCover;
    for (let k = 0; k < 1089; k++) {
      const x = mesh.position.x + p.getX(k), z = mesh.position.z + p.getZ(k), y = p.getY(k);
      assert.ok(Math.abs(y - world.surface.heightAt(x, z)) < 0.001);
      assert.ok(Math.abs(Math.hypot(n.getX(k), n.getY(k), n.getZ(k)) - 1) < 1e-6);
      assert.ok(Math.abs(uv.getX(k) - x / 2.4) < 0.002);
      assert.ok(Math.abs(uv.getY(k) - z / 2.4) < 0.002);
      const key = x + "," + z, entry = [color.getX(k), color.getY(k), color.getZ(k), n.getX(k), n.getY(k), n.getZ(k), cover.getX(k), cover.getY(k), cover.getZ(k)];
      if (shared.has(key)) assert.deepEqual(entry, shared.get(key), "same place must not change ecology with LOD");
      else shared.set(key, entry);
    }
    for (let k = 0; k < 6144; k += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(k)), b = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(k + 1)), c = new THREE.Vector3().fromBufferAttribute(p, g.index.getX(k + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).y > 0);
    }
    for (let k = 1089; k < p.count; k++) assert.ok(Number.isFinite(p.getY(k)));
    assert.equal(mesh.receiveShadow, true);
  }
  terrain.dispose();
});

test("narrow foundation edges receive additional local sampling and disposal releases owned resources", () => {
  const pad = { x: 0, z: 0, cx: 0, cz: 0, hx: 12, hz: 3, rot: 0.4, bank: false };
  const heightAt = (x, z) => {
    const c = Math.cos(pad.rot), s = Math.sin(pad.rot);
    const lx = x * c - z * s, lz = x * s + z * c;
    const out = Math.hypot(Math.max(0, Math.abs(lx) - pad.hx), Math.max(0, Math.abs(lz) - pad.hz));
    const t = Math.min(1, Math.max(0, (out - 0.325) / 0.175));
    return 2100 - Math.max(0, 2 - out) * (1 - t * t * (3 - 2 * t));
  };
  const world = fixture({ pads: [pad], heightAt });
  const terrain = new WorldTerrain(world), camera = cameraAt(world, 0, 12);
  settle(terrain, camera);
  assert.equal(terrain.stats.minSpacing, 0.0390625);
  let interpolationError = 0;
  for (const mesh of terrain.group.children) {
    const tile = mesh.userData.terrainTile;
    if (!mesh.visible || tile.x > 20 || tile.x + tile.size < -20 || tile.z > 20 || tile.z + tile.size < -20) continue;
    const p = mesh.geometry.attributes.position;
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const k = j * 33 + i, x = tile.x + (i + 0.5) * tile.spacing, z = tile.z + (j + 0.5) * tile.spacing;
      const bc = mesh.geometry.index.getX((j * 32 + i) * 6 + 2) === k + 1;
      const renderY = bc ? (p.getY(k + 1) + p.getY(k + 33)) / 2 : (p.getY(k) + p.getY(k + 34)) / 2;
      interpolationError = Math.max(interpolationError, Math.abs(renderY - heightAt(x, z)));
    }
  }
  assert.ok(interpolationError < 0.08, `steep foundation interpolation error ${interpolationError} m`);
  const meshes = [...terrain.group.children];
  let geometries = 0, textures = 0, materials = 0;
  for (const mesh of meshes) mesh.geometry.addEventListener("dispose", () => geometries++);
  for (const texture of Object.values(terrain.textures)) texture.addEventListener("dispose", () => textures++);
  terrain.material.addEventListener("dispose", () => materials++);
  terrain.dispose(); terrain.dispose(); terrain.update(camera, 1 / 60);
  assert.equal(geometries, meshes.length); assert.equal(textures, 1); assert.equal(materials, 1);
  assert.equal(terrain.group.children.length, 0); assert.equal(terrain.stats.residentTiles, 0); assert.equal(terrain.stats.queuedTiles, 0);
});


test("layered PBR material keeps linear packed textures seamless and composes with the actual CSM registration", () => {
  const { material, textures } = createTerrainMaterial();
  assert.equal(material.isMeshStandardMaterial, true);
  for (const texture of Object.values(textures)) {
    assert.equal(texture.colorSpace, THREE.NoColorSpace);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.RepeatWrapping);
    const { data: allPixels, width: n, depth } = texture.image;
    assert.equal(depth,4);
    for(let layer=0;layer<depth;layer++){
    const data=allPixels.subarray(layer*n*n*4,(layer+1)*n*n*4);
    let internal = 0, seam = 0, min = 255, max = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = (y * n + x) * 4;
      min = Math.min(min, data[k]); max = Math.max(max, data[k]);
      if (x < n - 1) internal += Math.abs(data[k] - data[k + 4]);
      if (y < n - 1) internal += Math.abs(data[k] - data[k + n * 4]);
    }
    for (let q = 0; q < n; q++) seam += Math.abs(data[q * n * 4] - data[(q * n + n - 1) * 4])
      + Math.abs(data[q * 4] - data[((n - 1) * n + q) * 4]);
    assert.ok(max - min > 60, "texture must contain structure, not a neutral flat texel");
    assert.ok(seam / (2 * n) < internal / (2 * n * (n - 1)) * 2, "wrapped edge must not introduce a seam stripe");
    }
  }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 150000);
  const environment = Object.create(WorldEnvironment.prototype);
  environment.csm = new CSM({ camera, parent: scene, cascades: 3, maxFar: 500 });
  environment.registered = new Set(); environment.clouds = createCloudUniforms(); environment.aerial = createAerialUniforms(new THREE.Vector3(0, 1, 0));
  environment.register([material]); environment.register([material]);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.equal(material.defines.CSM_CASCADES, 3);
  assert.equal(shader.uniforms.uCloudSun, environment.clouds.uCloudSun);
  assert.equal(shader.uniforms.CSM_cascades.value.length, 3);
  assert.equal(shader.uniforms.terrainPackedFields.value, textures.packed);
  for(const layer of [0,1,2,3])assert.ok(shader.fragmentShader.includes((layer===2?"terrainSampleGrad(":"terrainSample(")+layer+"."),"every original surface layer stays bound");
  assert.equal((shader.fragmentShader.match(/vec3 terrainPerturbed =/g) || []).length, 1);
  assert.ok(shader.vertexShader.includes("vTerrainCover = terrainCover;"));
  assert.ok(shader.fragmentShader.includes("material.dfg = texture2D"), "current PBR reflection initialization must survive CSM");
  assert.ok(shader.fragmentShader.includes("CSM_cascades[ i ]"), "directional lighting must retain cascade selection");
  assert.ok(shader.fragmentShader.includes("#include <lights_fragment_maps>"), "standard environment radiance must be accumulated");
  assert.ok(shader.fragmentShader.includes("#include <lights_fragment_end>"), "standard PBR indirect lighting must run");
  assert.ok(shader.fragmentShader.includes("light.color = directionalLight.color * cloudDirectAttenuation;"));
  assert.ok(shader.fragmentShader.includes("light.color = pointLight.color;"), "local lamps are not dimmed by overhead clouds");
  assert.ok(shader.fragmentShader.includes("uniform vec2 CSM_cascades[CSM_CASCADES];"), "expanded light declarations preserve CSM");
  const scatter = shader.fragmentShader.indexOf("gl_FragColor.rgb = applyAerialPerspective");
  assert.ok(scatter > shader.fragmentShader.indexOf("#include <opaque_fragment>"));
  assert.ok(scatter < shader.fragmentShader.indexOf("#include <tonemapping_fragment>"));
  assert.equal(shader.fragmentShader.includes("#include <fog_fragment>"), false, "do not apply air extinction twice");
  assert.equal(shader.uniforms.uAerialSun, environment.aerial.uAerialSun);
  environment.csm.dispose(); environment.csm.remove(); material.dispose();
  for (const texture of Object.values(textures)) texture.dispose();
});


test("prepareView resolves the initial near surface and reports an exhausted budget honestly", async () => {
  const world = fixture(), terrain = new WorldTerrain(world), camera = cameraAt(world), progress = [];
  const result = await terrain.prepareView(camera, { maxMs: 2500, onProgress: (p) => progress.push(p) });
  assert.equal(result.ready, true); assert.equal(result.reason, "ready");
  assert.equal(result.queuedTiles, 0); assert.equal(result.minSpacing, 0.3125);
  assert.ok(progress.length >= 2); assertCoverage(terrain);
  const detailed = terrain.stats.visibleTiles;
  terrain.update(camera, 0.13);
  assert.equal(terrain.stats.visibleTiles, detailed, "ready must not mean a temporary empty queue before a deeper split");
  assert.equal(terrain.stats.queuedTiles, 0);
  camera.position.set(35000, 12000, -35000); camera.lookAt(0, 2100, 0); camera.updateMatrixWorld();
  const exhausted = await terrain.prepareView(camera, { maxMs: 0 });
  assert.equal(exhausted.ready, false); assert.equal(exhausted.reason, "budget");
  const relocated = await terrain.prepareView(camera, { maxMs: 2500 });
  assert.equal(relocated.ready, true); assertCoverage(terrain);
  assert.ok(terrain.stats.visibleTiles < detailed);
  terrain.dispose();
  assert.equal((await terrain.prepareView(camera)).reason, "disposed");
});


function triangleHeight(mesh, x, z, morph = 0) {
  const g = mesh.geometry, t = mesh.userData.terrainTile, p = g.attributes.position;
  const fx = (x - t.x) / t.spacing, fz = (z - t.z) / t.spacing;
  const i = Math.min(31, Math.max(0, Math.floor(fx))), j = Math.min(31, Math.max(0, Math.floor(fz)));
  const u = fx - i, v = fz - j, a = j * 33 + i, b = a + 1, c = a + 33, d = c + 1;
  const height = (k) => p.getY(k) + (g.morphAttributes.position?.[0]?.getY(k) || 0) * morph;
  if (g.index.getX((j * 32 + i) * 6 + 2) === d) {
    return u >= v ? height(a) * (1 - u) + height(b) * (u - v) + height(d) * v
      : height(a) * (1 - v) + height(c) * (v - u) + height(d) * u;
  }
  return u + v <= 1 ? height(a) * (1 - u - v) + height(b) * u + height(c) * v
    : height(b) * (1 - v) + height(c) * (1 - u) + height(d) * (u + v - 1);
}

test("distant native morph reproduces parent triangle planes and reverses without holes", () => {
  const world = fixture({ heightAt: (x, z) => 2100 + 50 * Math.sin(x / 730) * Math.cos(z / 570) });
  const terrain = new WorldTerrain(world), parent = terrain.roots[0];
  terrain._camera.set(parent.x + parent.size + 500, 2100, parent.z + parent.size / 2); parent.wantsSplit = true; terrain._refine(parent);
  for (const child of parent.children) {
    const job = child.job; while (job.row <= 32) terrain._buildRow(job); terrain._finish(job);
  }
  assert.equal(parent.split, true); assert.equal(parent.morphWeight, 1); assert.equal(terrain.morphs.size, 1);
  assertCoverage(terrain);
  let maxError = 0;
  for (const child of parent.children) {
    const mesh = child.mesh, g = mesh.geometry, p = g.attributes.position;
    assert.equal(g.morphTargetsRelative, true); assert.equal(mesh.morphTargetInfluences[0], 1);
    assert.deepEqual(Object.keys(g.morphAttributes).sort(), ["color", "normal", "position"]);
    for (let i = 0; i < 6144; i += 3) {
      let x = 0, z = 0, h = 0;
      for (let q = 0; q < 3; q++) {
        const k = g.index.getX(i + q); x += mesh.position.x + p.getX(k); z += mesh.position.z + p.getZ(k);
        h += p.getY(k) + g.morphAttributes.position[0].getY(k);
      }
      x /= 3; z /= 3; h /= 3;
      maxError = Math.max(maxError, Math.abs(h - triangleHeight(parent.mesh, x, z)));
    }
  }
  assert.ok(maxError < 0.0001, `first morph frame must match retained parent: ${maxError} m`);
  terrain._advanceMorphs(0.225); assert.ok(parent.morphWeight > 0 && parent.morphWeight < 1); assertCoverage(terrain);
  terrain._advanceMorphs(0.3); assert.equal(parent.morphWeight, 0); assert.equal(terrain.morphs.size, 0);
  terrain._requestMerge(parent); terrain._advanceMorphs(0.15); const inFlight = parent.morphWeight;
  terrain._startMorph(parent, 0); assert.equal(parent.morphWeight, inFlight, "reversal starts at the displayed shape");
  terrain._advanceMorphs(1); assert.equal(parent.morphWeight, 0); assertCoverage(terrain);
  terrain._requestMerge(parent); terrain._advanceMorphs(1);
  assert.equal(parent.children, null); assert.equal(parent.mesh.visible, true); assertCoverage(terrain); terrain.dispose();
});

test("nearby narrow river banks refine locally and retain fixed fine normals and hydrology", () => {
  const world = fixture({ heightAt: (x, z) => 2100 - 0.38 * Math.exp(-(((x - 150) / 0.5) ** 2)) });
  let maskCalls = 0;
  world.hydrology = {
    intersectsBounds: (r, { minWidth = 0 } = {}) => minWidth <= 1 && r.minX < 153 && r.maxX > 147 && r.minZ < 900 && r.maxZ > -900,
    sampleAt(x, z, options) {
      assert.equal(options.includeDepth, false, "terrain masks must not re-query physical height"); maskCalls++;
      const wetness = Math.abs(z) < 900 ? Math.max(0, 1 - Math.abs(x - 150) / 3) : 0;
      return { wetness, riverBed: wetness, bank: wetness, surfaceLevel:2099.75 };
    },
  };
  const terrain = new WorldTerrain(world), camera = cameraAt(world, 0, 0);
  settle(terrain, camera, 2500); assertCoverage(terrain); assert.ok(maskCalls > 0);
  const at = (x, z) => terrain.group.children.find((m) => { const t = m.userData.terrainTile; return m.visible && x >= t.x && x < t.x + t.size && z >= t.z && z < t.z + t.size; });
  assert.equal(at(150.1, 10.1).userData.terrainTile.spacing, 0.3125);
  assert.equal(at(150.1, 400.1).userData.terrainTile.spacing, 0.625);
  assert.ok(at(150.1, 850.1).userData.terrainTile.spacing > 0.625, "faded distant narrow creeks must not keep near precision");
  const mesh = at(149.7, 10.1), p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal, wet = mesh.geometry.attributes.terrainHydrology;
  assert.equal(mesh.morphTargetInfluences, undefined, "river surfaces cannot morph away from their waterline");
  let checked = 0;
  for (let k = 0; k < 1089; k++) {
    const x = mesh.position.x + p.getX(k), z = mesh.position.z + p.getZ(k);
    if (Math.abs(x - 150) > 0.6 || Math.abs(x - 150) < 0.2) continue;
    const expected = world.surface.normalAt(x, z, 0.2);
    assert.ok(Math.abs(n.getX(k) - expected.x) < 1e-6); assert.ok(wet.getX(k) > 0.7);
    assert.ok(Math.abs(p.getY(k) - world.surface.heightAt(x, z)) < 0.001);
    assert.equal(wet.itemSize,4);
    assert.ok(Math.abs(wet.getW(k)-(world.surface.heightAt(x,z)-2099.75))<1e-6,"metric shoreline clearance follows exact source height through cache and parent reuse"); checked++;
  }
  assert.ok(checked > 0); terrain.dispose();
});


test("installed Three RGB morph colours write three components into the four-component varying", () => {
  const original = THREE.ShaderChunk.morphcolor_vertex;
  const { material, textures } = createTerrainMaterial();
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  const expand = (source) => source.replace(/#include <([\w]+)>/g, (_, key) => {
    assert.equal(typeof THREE.ShaderChunk[key], "string", `installed shader chunk ${key}`);
    return expand(THREE.ShaderChunk[key]);
  });
  const expanded = expand(shader.vertexShader);
  assert.match(expanded, /varying vec4 vColor;/, "test the actual installed colour varying");
  assert.match(expanded, /vColor\.rgb\s*\+=\s*getMorph\([^;]+\)\.rgb\s*\*\s*morphTargetInfluences/);
  assert.doesNotMatch(expanded, /vColor\s*\+=\s*getMorph\([^;]+\)\.rgb\s*\*\s*morphTargetInfluences/, "vec4 += vec3 was the real browser compile error");
  assert.match(terrainMorphColorChunk(), /vColor\s*\+=\s*getMorph\([^;]+\)\s*\*\s*morphTargetInfluences/, "RGBA morph path remains four-component");
  assert.equal(THREE.ShaderChunk.morphcolor_vertex, original, "compatibility fix must not alter global materials");
  material.dispose(); Object.values(textures).forEach(t => t.dispose());
});

test("low gentle sparse-cover ground is soil and vegetation rather than a broad exposed-rock bed", () => {
  assert.equal(terrainRockFraction(1, 0.005, 2100), 0.04);
  assert.equal(terrainRockFraction(0, 0.005, 2100), 0);
  assert.ok(terrainRockFraction(1, 0.5, 3600) > 0.9, "retain genuine steep alpine rock");
  const world = fixture({ heightAt: () => 2100 }); world.landcoverAt = () => ({ r: 0, g: 1, b: 0, a: 1 });
  const terrain = new WorldTerrain(world), mesh = terrain.roots[0].mesh;
  const colour = mesh.geometry.attributes.color, source = mesh.geometry.attributes.terrainCover;
  assert.equal(source.getY(0), 1, "preserve source land cover rather than repainting its data");
  assert.ok(colour.getY(0) > colour.getZ(0) * 1.4, "lowland sparse cover keeps vegetation/soil chroma");
  assert.ok(Math.max(colour.getX(0), colour.getY(0), colour.getZ(0)) < 0.2, "no pale mineral albedo for a low flat sparse-cover field");
  terrain.dispose();
});


test("preparation isolates normal-frame updates, reports near readiness and cancels old progress", async () => {
 const world=fixture(),terrain=new WorldTerrain(world),a=cameraAt(world),b=cameraAt(world,-7000,2000);
 const previousScheduler=globalThis.scheduler;let resume;
 globalThis.scheduler={yield:()=>new Promise(resolve=>{resume=resolve;})};
 const progress=[],old=terrain.prepareView(a,{maxMs:5000,onProgress:p=>progress.push(p)});
 assert.equal(typeof resume,"function");
 const generated=terrain.stats.generatedTiles,position=terrain._camera.clone();
 terrain.update(b,.5);assert.equal(terrain.stats.generatedTiles,generated);assert.deepEqual(terrain._camera,position);
 const count=progress.length;terrain.cancelPreparation();resume();
 assert.equal((await old).reason,"superseded");assert.equal(progress.length,count,"cancelled task cannot overwrite a new loading label");
 globalThis.scheduler=previousScheduler;
 const near=await terrain.prepareView(b,{maxMs:2500,waitFor:"near",nearRadius:120});
 assert.equal(near.nearReady,true);assert.equal(near.nearQueuedTiles,0);assertCoverage(terrain);
 const all=await terrain.prepareView(b,{maxMs:2500});assert.equal(all.ready,true);assertCoverage(terrain);
 terrain.dispose();assert.equal(terrain.stats.sampleCache.bytes,0);assert.equal(terrain.stats.tileCache.bytes,0);
});

test("returning to a released tile reuses identical CPU geometry with bounded cache storage", () => {
 const world=fixture(),t=new WorldTerrain(world,{tileCacheBytes:256*1024});
 // An independent fine tile exercises retention without inventing a parent
 // whose coordinates/spacing cannot contain the child sample lattice.
 const n=t._node(10,20,40,8,null),job=t._job(n);while(job.row<=32)t._buildRow(job);t._finish(job);
 const expected=Array.from(n.mesh.geometry.attributes.position.array);let released=0;
 n.mesh.geometry.addEventListener("dispose",()=>released++);
 t._release(n);assert.equal(released,1,"GPU resources release even though CPU data are retained");
 const replacement=t._node(10,20,40,8,null),restore=t._job(replacement);assert.ok(restore.cached);
 t._finish(restore);assert.deepEqual(Array.from(replacement.mesh.geometry.attributes.position.array),expected);
 assert.ok(t.tileCache.stats.bytes<=t.tileCache.stats.maxBytes);assert.equal(t.tileCache.stats.hits,1);
 t._release(replacement);t.dispose();assert.equal(t.tileCache.stats.bytes,0);
});

test("exact sample cache distinguishes colliding coordinates and releases bounded arrays", () => {
 let calls=0;const source=(x,z)=>{calls++;return 2100+x*.123456789-z*.234567891;};
 const cache=new TerrainSampleCache(source,{entries:1,coordinateScale:25.6});
 const x=12.000001,z=-8.000003,first=cache.heightAtPoint(x,z);
 assert.equal(first,source(x,z));const before=calls;assert.equal(cache.heightAtPoint(x,z),first);assert.equal(calls,before);
 const second=cache.heightAtPoint(x+.0000001,z);assert.notEqual(first,second);
 assert.equal(second,source(x+.0000001,z));assert.equal(cache.heightAtPoint(x,z),first);
 assert.equal(cache.stats.entries,1);assert.equal(cache.stats.bytes,73);
 cache.dispose();assert.equal(cache.states.length,0);assert.equal(cache.stats.bytes,0);
 const disabled=new TerrainSampleCache(source,{entries:0});assert.equal(disabled.heightAtPoint(x,z),first);disabled.dispose();
});

test("CPU tile cache evicts oldest payloads at its byte ceiling and returns ownership on take", () => {
 const cache=new TerrainTileCache(192);
 const payload=()=>({geometry:{index:null,attributes:{position:{array:new Float32Array(24)}},morphAttributes:{}},heights:new Float64Array(4),centers:new Float64Array(4)});
 cache.put("first",payload());assert.equal(cache.stats.bytes,160);
 cache.put("second",payload());assert.equal(cache.stats.evictions,1);assert.equal(cache.take("first"),null);
 assert.ok(cache.take("second"));assert.equal(cache.stats.bytes,0);assert.equal(cache.stats.tiles,0);
 cache.put("oversized",{...payload(),heights:new Float64Array(100)});assert.equal(cache.stats.tiles,0);
 cache.dispose();assert.equal(cache.stats.bytes,0);
});
