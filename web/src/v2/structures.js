import {HouseholdLiving} from './household-living.js';
import {transformWorldBox} from "./world-box-transform.js";
import {createPreparationYield} from './preparation-yield.js';
import {StructureTextureReuse} from "./structure-texture-reuse.js";
import {loadWorldGLB} from "./glb-transport.js";
import * as THREE from "three";
import { SETTLEMENT_ASSETS, settlementMeshRole } from "./settlement-assets.js";
import { createStructureDepth } from "./room-shadow.js";
import { preserveAssetOcclusion, installAssetOcclusion } from "./asset-occlusion.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "three/addons/libs/meshopt_simplifier.module.js";

// Existing static GLBs plus explicit complete-building replacements.
// The Lanchuan replacement contains three new room-family interiors; no old furniture is overlaid.
// COLOR_0 in these assets stores AO / sky visibility, not an RGB surface colour.
const TILE_SIZE = 256;
const SHADOW_DISTANCE = 350;
const LOAD_CONCURRENCY = 4;
const ASSET_OVERRIDES = Object.freeze({gh_lanchuan: "v2/gh_lanchuan_rooms.glb",...Object.fromEntries(Object.entries(SETTLEMENT_ASSETS).map(([id,asset])=>[id,asset.url]))});

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`WorldStructures: invalid ${label}: ${value}`);
  return value;
}

function selectedPart(mesh, part, root) {
  if (!part) return true;
  for (let node = mesh; node && node !== root.parent; node = node.parent) {
    if (node.name === part || node.name.startsWith(part + "_")) return true;
  }
  return false;
}

function signature(geometry) {
  return (geometry.index ? "indexed:" : "flat:") + Object.keys(geometry.attributes).sort().map((name) => {
    const a = geometry.attributes[name];
    return `${name}/${a.itemSize}/${a.normalized}/${a.array.constructor.name}`;
  }).join("|");
}

function triangles(geometry) {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

// Keep texture identity in the key: two separately decoded images are not assumed equal.
// The scalar / vector / matrix fields below also distinguish UV channels and sampling.
function materialKey(source) {
  const textureFields = [
    "channel", "mapping", "wrapS", "wrapT", "magFilter", "minFilter", "anisotropy",
    "format", "internalFormat", "type", "offset", "repeat", "center", "rotation",
    "matrixAutoUpdate", "matrix", "generateMipmaps", "premultiplyAlpha", "flipY",
    "unpackAlignment", "colorSpace", "compareFunction",
  ];
  const encode = (value) => {
    if (value === null || value === undefined || typeof value !== "object") {
      // Custom shader hooks can close over state: never merge their owners by function text.
      return typeof value === "function" ? { customHookOwner: source.uuid } : value;
    }
    if (value.isTexture) {
      const result = { textureUUID: value.uuid };
      for (const name of textureFields) result[name] = encode(value[name]);
      return result;
    }
    if (value.isColor || value.isVector2 || value.isVector3 || value.isVector4 ||
        value.isMatrix3 || value.isMatrix4 || value.isEuler || value.isQuaternion) return value.toArray();
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, encode);
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, encode(value[name])]));
  };
  const ignored = new Set(["id", "uuid", "name", "version", "userData", "_listeners", "vertexColors"]);
  return JSON.stringify(Object.fromEntries(Object.keys(source).sort()
    .filter((name) => !ignored.has(name)).map((name) => [name, encode(source[name])])));
}


// Asset names are authored in tools/blender/{cabin,yurt,guesthouses,v2_lanchuan}.py.
// Unknown/mixed wood, iron, plaster, glass and shell materials stay structural.
// In particular, never classify by material alone after merging: plaster/wood are
// also used by walls, floors, doors and furniture.
function detailRole(assetId, name) {
  if (/^freedom\d+_/.test(name)) {
    const part = name.replace(/^freedom\d+_/, "").replaceAll("_", " ");
    if (/^(floor|shared-wall|bath side|bath doorway|bath rounded opening|wet floor)/.test(part)) return "body";
    if (/(handle|socket|kettle|cup|tap|shower head|shower rail|drawer gap)/.test(part)) return "fine";
    return "interior";
  }
  if (/_(turfblade|turfdry|seedstalk|grass)$/.test(name)) return "roof-grass";
  if (/_(linen|throw|rug|rug_in|tekemet|chest|whitewash|rattan|quilt_[rgby]|felt_in|chiy_in|band_in|floorfelt)$/.test(name)) return "interior";
  if (/_lamp$/.test(name) || /_door\d+.*_iron$/.test(name)) return "fine";
  if (/^yurt/.test(assetId) && /_rope$/.test(name)) return "fine";
  return "body";
}

function compactGeometry(source, sourceIndices) {
  // Remap only, never move vertices or resample UV / normal / AO attributes.
  const indices = new Uint32Array(sourceIndices);
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const copy = new THREE.BufferAttribute(new attribute.array.constructor(count * attribute.itemSize),
      attribute.itemSize, attribute.normalized);
    for (let i = 0; i < remap.length; i++) {
      if (remap[i] === 0xffffffff) continue;
      for (let k = 0; k < attribute.itemSize; k++) copy.setComponent(remap[i], k, attribute.getComponent(i, k));
    }
    geometry.setAttribute(name, copy);
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function namedSections(assetId, name, geometry, extras) {
  const role = settlementMeshRole(assetId,name,extras) || detailRole(assetId, name);
  if (!/^yurt(?:_deck)?_orange$/.test(name)) return [{role, geometry}];
  // yurt.py uses orange both for the interior kerege/uyk and exterior crown/door.
  // Its two known radii are 3.2 and 3.6 m; crown starts at hw+rise=3.25 m.
  // Split only triangles fully inside the felt and below the crown. Boundary
  // triangles and the complete front jamb/lintel region remain structural.
  const radius = assetId === "yurt_deck" ? 3.6 : 3.2;
  const position = geometry.attributes.position, index = geometry.index;
  const body = [], interior = [];
  const isInside = i => {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    return y < 3.12 && Math.hypot(x, z) < radius - .025 &&
      !(Math.abs(x) < .86 && z > radius - .4);
  };
  for (let j = 0; j < index.count; j += 3) {
    const a = index.getX(j), b = index.getX(j + 1), c = index.getX(j + 2);
    (isInside(a) && isInside(b) && isInside(c) ? interior : body).push(a, b, c);
  }
  return [
    {role:"body", geometry:compactGeometry(geometry, body)},
    {role:"interior", geometry:compactGeometry(geometry, interior)},
  ].filter(part => part.geometry.index.count);
}

function distantShell(geometry, names, role) {
  if (role !== "body" || triangles(geometry) < 800 ||
      !names.every(name => /_(log|loggrey|logpale|stone|plinth)$/.test(name))) return null;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal, uv = geometry.attributes.uv, ao = geometry.attributes.assetOcclusion;
  const stride = (normal ? 3 : 0) + (uv ? 2 : 0) + (ao ? 2 : 0);
  const attributes = new Float32Array(position.count * stride), weights = [];
  if (normal) weights.push(.1, .1, .1);
  if (uv) weights.push(.05, .05);
  if (ao) weights.push(.02, .02);
  for (let i = 0, o = 0; i < position.count; i++) {
    for (const a of [normal, uv, ao]) if (a) {
      for (let k = 0; k < a.itemSize; k++) attributes[o++] = a.getComponent(i, k);
    }
  }
  const indices = geometry.index?.array || Uint32Array.from({length:position.count}, (_, i) => i);
  // Permissive resolves the source's flat-normal vertex splits; attribute error
  // still penalises texture/shading changes. LockBorder protects openings and
  // material interfaces. Never use Prune or replace a house with a box proxy.
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices,
    position.array, 3, attributes, stride, weights, null,
    Math.max(3, Math.floor(indices.length * .35 / 3) * 3), .06,
    ["LockBorder", "Permissive", "ErrorAbsolute"]);
  if (!Number.isFinite(error) || !simplified.length) throw new Error("Invalid structural LOD result");
  if (simplified.length >= indices.length * .9) return null;
  const low = compactGeometry(geometry, simplified);
  return {geometry:low, error, triangles:triangles(low)};
}

function detailIsVisible(role, distance, scale, projection, wasVisible) {
  if (role === "body" || distance <= 40) return true;
  // Normalised screen height, independent of display resolution. Known component
  // sizes (not the full merged tile bounds) control when detail becomes unreadable.
  const settings = role === "interior" ? [2, .012, 150] :
    role === "roof-grass" ? [.45, .003, 180] : [.2, .0025, 100];
  const hysteresis = wasVisible ? 1.12 : 1;
  return distance < settings[2] * hysteresis &&
    settings[0] * scale * projection / Math.max(distance, .01) > settings[1] / hysteresis;
}

export class WorldStructures {
  constructor(world, {loadAsset=loadWorldGLB,doors=null,
    textureReuse=new URLSearchParams(globalThis.location?.search || "").get("structureTextureReuse") !== "0",
    preparationReuse=new URLSearchParams(globalThis.location?.search || "").get("structurePreparationReuse") !== "0",
    cooperativePreparation=new URLSearchParams(globalThis.location?.search || "").get("structurePreparation") !== "blocking",
    selectionReuse=new URLSearchParams(globalThis.location?.search || "").get("structureSelectionReuse") !== "0"} = {}) {
    this.world = world;
    this.doors = doors;
    this.preparationReuse = preparationReuse;
    this.selectionReuse = selectionReuse;
    this.preparationYield = createPreparationYield({enabled:cooperativePreparation});
    this.group = new THREE.Group();
    this.group.name = "world-v2-structures";
    this.materials = [];
    this.entityPoses = new Map();
    this.shadowDistance = SHADOW_DISTANCE;
    this.stats = {
      status: "idle", entities: 0, assets: 0, assetsLoaded: 0,
      batches: 0, instances: 0, triangles: 0, upgradedRooms: 0, visibleBatches: 0,
      visibleTriangles: 0, shadowBatches: 0, materials: 0, errors: [],
      culledDetailInstances: 0, lowLODInstances: 0, activeTriangles: 0, lodTemplates: 0,
      materialKeyComputations: 0, materialSourceReuses: 0, distanceTests: 0,
      assetPreparation: {mode:cooperativePreparation?"cooperative":"blocking", assets:{}, scheduler:this.preparationYield.stats},
    };
    this._templates = new Map();
    this._materialCache = new Map();
    this._geometries = new Set();
    this._depthMaterials = new Map();
    this._sourceGeometries = new Set();
    this._sourceMaterials = new Set();
    this._textures = new Set();
    this._resourceErrors = new Set();
    this._batches = [];
    this._selectionBins = [];
    this._disposed = false;
    this._loadPromise = null;
    this._frustum = new THREE.Frustum();
    this._viewProjection = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this._box = new THREE.Box3();
    this._cameraPosition = new THREE.Vector3();
    const manager = new THREE.LoadingManager();
    manager.onError = (url) => this._resourceErrors.add(url);
    this.loader = new GLTFLoader(manager);
    this.textureReuse = new StructureTextureReuse({enabled:textureReuse});
    this.textureReuse.install(this.loader);
    this.stats.textureReuse = this.textureReuse.stats;
    this.loadAsset = url => loadAsset(url, this.loader);
  }

  load({ onProgress } = {}) {
    if (this._disposed) return Promise.reject(new Error("WorldStructures has been disposed"));
    if (!this._loadPromise) this._loadPromise = this._load(onProgress);
    return this._loadPromise;
  }

  async _load(onProgress) {
    this.stats.status = "loading";
    try {
      if (!Array.isArray(this.world.entities) || typeof this.world.surface?.buildingPose !== "function") {
        throw new Error("WorldStructures requires world.entities and world.surface.buildingPose()");
      }
      const assets = new Map();
      const ids = new Set();
      for (const entity of this.world.entities) {
        if (!entity.id || ids.has(entity.id)) throw new Error(`Duplicate or missing structure id: ${entity.id}`);
        ids.add(entity.id);
        if (typeof entity.assetId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(entity.assetId)) {
          throw new Error(`Invalid assetId for structure ${entity.id}`);
        }
        const variants = assets.get(entity.assetId) || new Set();
        variants.add(entity.part || "");
        assets.set(entity.assetId, variants);
      }
      this.stats.entities = this.world.entities.length;
      this.stats.assets = assets.size;
      const queue = [...assets];
      let next = 0;
      const worker = async () => {
        while (next < queue.length && !this._disposed) {
          const [assetId, parts] = queue[next++];
          try {
            await this._loadAsset(assetId, parts);
          } catch (error) {
            throw new Error(`Could not load structure asset "${assetId}": ${error.message}`, { cause: error });
          }
          this.stats.assetsLoaded++;
          onProgress?.({ stage: "structures", assetId, loaded: this.stats.assetsLoaded, total: this.stats.assets });
        }
      };
      // Wait for all in-flight assets before cleanup on failure.
      const results = await Promise.allSettled(Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, worker));
      const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
      if (failures.length) throw new AggregateError(failures, failures.map((error) => error.message).join("\n"));
      if (this._disposed) throw new Error("Structure loading was disposed");
      if (this._resourceErrors.size) {
        throw new Error(`Structure resources failed to load: ${[...this._resourceErrors].join(", ")}`);
      }
      this._placeEntities();
      this.stats.materials = this.materials.length;
      this.stats.status = "ready";
      return this;
    } catch (error) {
      this.stats.errors.push(error.message);
      this.stats.status = this._disposed ? "disposed" : "failed";
      this._release();
      throw error;
    }
  }

  _trackSource(gltf) {
    gltf.scene.traverse((node) => {
      if (!node.isMesh) return;
      this._sourceGeometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        this._sourceMaterials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) this._textures.add(value);
      }
    });
  }

  _material(source) {
    if (!source?.isMeshStandardMaterial) {
      throw new Error(`Unsupported non-PBR material: ${source?.name || "(unnamed)"}`);
    }
    const interiorBounce = source.name.startsWith("v2_") ? .30 : .16;
    this.stats.materialKeyComputations++;
    const key = interiorBounce + ":" + materialKey(source);
    if (this._materialCache.has(key)) {
      const shared = this._materialCache.get(key);
      if (!shared.userData.sourceMaterialNames.includes(source.name)) shared.userData.sourceMaterialNames.push(source.name);
      return shared;
    }
    const material = source.clone();
    material.name = `v2/${source.name || source.uuid}`;
    material.vertexColors = false;
    installAssetOcclusion(material, {interiorBounce});
    material.userData = { ...source.userData, legacyVertexAOPreserved: true, sourceMaterialNames: [source.name] };
    // Keep all GLTFLoader PBR maps, scalar factors, alpha mode and sidedness.
    // Texture objects are shared with our private loader result, not the old scene.
    this._materialCache.set(key, material);
    this.materials.push(material);
    return material;
  }

  async _loadAsset(assetId, parts) {
    const base = this.world.assetBase || "./assets/";
    const url = base.replace(/\/?$/, "/") + (ASSET_OVERRIDES[assetId] || assetId + ".glb");
    const loadStarted=performance.now();
    const gltf = await this.loadAsset(url);
    const metrics=this.stats.assetPreparation.assets[assetId]={loadMs:performance.now()-loadStarted,prepareMs:0,yieldWaitMs:0,checkpoints:0};
    const prepareStarted=performance.now();
    const checkpoint=()=>{
      const pending=this.preparationYield.checkpoint();
      if(!pending)return null;
      const start=performance.now();metrics.checkpoints++;
      return pending.then(()=>{metrics.yieldWaitMs+=performance.now()-start;if(this._disposed)throw new Error("Structure loading was disposed");});
    };
    this._trackSource(gltf);
    if (this._disposed) throw new Error("Structure loading was disposed");
    // GLTFLoader can return a null texture after a decode error. Treat that as failure,
    // rather than quietly presenting an untextured building.
    if (gltf.parser) {
      const textures = await gltf.parser.getDependencies("texture");
      for (const texture of textures) {
        if (!texture) throw new Error("A GLB texture could not be decoded");
        this._textures.add(texture);
      }
    }
    await MeshoptSimplifier.ready;
    gltf.scene.updateMatrixWorld(true);
    this.doors?.captureAsset(assetId,gltf.scene,source=>this._material(source));
    // A source material is immutable during this synchronous preparation pass.
    // Keep this cache local: later source/texture edits or another asset load
    // must still run the complete key (including texture sampling state).
    const preparedMaterials = new Map();
    for (const part of parts) {
      const buckets = new Map();
      const nodes=[];gltf.scene.traverseVisible(node=>{if(node.isMesh&&selectedPart(node,part,gltf.scene))nodes.push(node);});
      for(const node of nodes) {
        if (node.isSkinnedMesh || Object.keys(node.geometry.morphAttributes).length) {
          throw new Error(`Animated mesh "${node.name}" needs a dedicated animated-asset path`);
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const sections = materials.length === 1
          ? [{ start: 0, count: Infinity, materialIndex: 0 }]
          : node.geometry.groups;
        if (!sections.length) throw new Error(`Mesh "${node.name}" has materials but no geometry groups`);
        for (const section of sections) {
          const source = materials[section.materialIndex];
          let material;
          if (this.preparationReuse && preparedMaterials.has(source)) {
            material = preparedMaterials.get(source);
            this.stats.materialSourceReuses++;
          } else {
            material = this._material(source);
            if (this.preparationReuse) preparedMaterials.set(source, material);
          }
          const geometry = node.geometry.clone();
          this._geometries.add(geometry);
          preserveAssetOcclusion(geometry,Boolean(SETTLEMENT_ASSETS[assetId]) || /^(gh_|cabin|yurt)/.test(assetId));
          geometry.clearGroups();
          if (materials.length > 1) {
            const index = geometry.index;
            const count = index ? index.count : geometry.attributes.position.count;
            const end = Math.min(count, section.start + section.count);
            const indices = [];
            for (let i = section.start; i < end; i++) indices.push(index ? index.getX(i) : i);
            geometry.setIndex(indices);
          }
          geometry.applyMatrix4(node.matrixWorld);
          if (node.matrixWorld.determinant() < 0) {
            const index = geometry.index;
            if (!index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
            const indices = geometry.index;
            for (let i = 0; i < indices.count; i += 3) {
              const b = indices.getX(i + 1);
              indices.setX(i + 1, indices.getX(i + 2));
              indices.setX(i + 2, b);
            }
          }
          const sections = namedSections(assetId, node.name, geometry, node.userData);
          for (const section of sections) {
            this._geometries.add(section.geometry);
            const key = section.role + ":" + material.uuid + ":" + signature(section.geometry);
            if (!buckets.has(key)) buckets.set(key, { role:section.role, material, geometries: [], names: [] });
            buckets.get(key).geometries.push(section.geometry);
            buckets.get(key).names.push(node.name);
          }
          if (!sections.some(section => section.geometry === geometry)) {
            geometry.dispose(); this._geometries.delete(geometry);
          }
        }
        const pending=checkpoint();if(pending)await pending;
      }
      if (!buckets.size) throw new Error(`No mesh found for asset ${assetId}, part "${part || "(whole)"}"`);
      const meshes = [];
      for (const bucket of buckets.values()) {
        const geometry = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
        if (!geometry) throw new Error(`Could not merge compatible geometry in ${assetId}`);
        this._geometries.add(geometry);
        if (bucket.geometries.length > 1) {
          for (const original of bucket.geometries) {
            original.dispose();
            this._geometries.delete(original);
          }
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const low = distantShell(geometry, bucket.names, bucket.role);
        if (low) { this._geometries.add(low.geometry); this.stats.lodTemplates++; }
        meshes.push({ geometry, material: bucket.material, role:bucket.role, low,
          names: bucket.names, triangles: triangles(geometry) });
        const pending=checkpoint();if(pending)await pending;
      }
      this._templates.set(assetId + ":" + part, meshes);
    }
    metrics.prepareMs=performance.now()-prepareStarted;
    metrics.cpuMs=metrics.prepareMs-metrics.yieldWaitMs;
  }

  _placeEntities() {
    const bins = new Map();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const entity of this.world.entities) {
      const pose = this.world.surface.buildingPose(entity);
      if (ASSET_OVERRIDES[entity.assetId]) this.stats.upgradedRooms += entity.assetId==="gh_lanchuan"?3:1;
      for (const key of ["x", "y", "z", "rot"]) finite(pose?.[key], `${entity.id}.${key}`);
      for (const key of ["x", "y", "z"]) {
        if (finite(pose.scale?.[key], `${entity.id}.scale.${key}`) <= 0) {
          throw new Error(`Structure ${entity.id} has non-positive scale`);
        }
      }
      this.entityPoses.set(entity.id, { ...pose, scale: { ...pose.scale } });
      const tx = Math.floor(pose.x / TILE_SIZE), tz = Math.floor(pose.z / TILE_SIZE);
      const templateKey = entity.assetId + ":" + (entity.part || "");
      const key = templateKey + ":" + tx + ":" + tz;
      if (!bins.has(key)) bins.set(key, { templateKey, assetId: entity.assetId, part: entity.part || "", tx, tz, entities: [], matrices: [] });
      const bin = bins.get(key);
      position.set(pose.x - tx * TILE_SIZE, pose.y, pose.z - tz * TILE_SIZE);
      rotation.setFromAxisAngle(up, pose.rot);
      scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
      bin.matrices.push(new THREE.Matrix4().compose(position, rotation, scale));
      bin.entities.push(entity.id);
    }
    for (const bin of bins.values()) {
      const template = this._templates.get(bin.templateKey);
      const buildingBox = new THREE.Box3();
      for (const part of template) buildingBox.union(part.geometry.boundingBox);
      const offset = new THREE.Vector3(bin.tx * TILE_SIZE, 0, bin.tz * TILE_SIZE);
      const worldBounds = bin.matrices.map(matrix => buildingBox.clone().applyMatrix4(matrix).translate(offset));
      const scales = bin.entities.map(id => Math.max(...Object.values(this.entityPoses.get(id).scale)));
      // Every material/detail batch in a tile uses the same complete-building
      // bound. Re-evaluate it once per frame, not once per constituent mesh.
      // Float64 retains the exact Number precision of distanceToPoint().
      const distances = new Float64Array(worldBounds.length);
      this._selectionBins.push({worldBounds, distances});
      for (const part of template) {
        const makeMesh = (geometry, level) => {
          const mesh = new THREE.InstancedMesh(geometry, part.material, bin.matrices.length);
          mesh.name = [bin.assetId, bin.part || "all", bin.tx + "," + bin.tz, part.role, level, part.material.name].join("/");
          mesh.position.copy(offset);
          // Tile-local TRS is fixed for this batch; instance buffers own entity motion.
          // World matrices still follow the parent normally. Keep the reference path.
          if(new URLSearchParams(globalThis.location?.search||"").get("structureStaticMatrices")!=="0"){mesh.updateMatrix();mesh.matrixAutoUpdate=false;}
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          bin.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
          mesh.frustumCulled = true;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          if(!this._depthMaterials.has(part.material))this._depthMaterials.set(part.material,createStructureDepth(part.material));
          mesh.customDepthMaterial=this._depthMaterials.get(part.material);
          mesh.userData = {
            entityIds:bin.entities, activeEntityIds:level === "near" ? [...bin.entities] : [],
            assetId:bin.assetId, part:bin.part, detailRole:part.role, lodLevel:level,
            sourceMeshes:part.names, staticLegacyInterior:!ASSET_OVERRIDES[bin.assetId],
            assetOverride:ASSET_OVERRIDES[bin.assetId] || null,
            maxLocalError:level === "far" ? part.low.error : 0,
          };
          if (level === "far") { mesh.count = 0; mesh.visible = false; }
          this.group.add(mesh);
          return mesh;
        };
        const mesh = makeMesh(part.geometry, "near");
        const lodMesh = part.low ? makeMesh(part.low.geometry, "far") : null;
        this._batches.push({mesh, lodMesh, part, matrices:bin.matrices, worldBounds, scales, distances,
          entities:bin.entities, nearSelection:bin.entities.map((_, i) => i).join(","),
          farSelection:"", detailState:new Uint8Array(bin.entities.length).fill(1),
          lodState:new Uint8Array(bin.entities.length)});
        // Source budget remains comparable to the old full-detail renderer. Derived
        // far geometry is mutually exclusive and counted in activeTriangles instead.
        this.stats.instances += bin.matrices.length;
        this.stats.triangles += part.triangles * bin.matrices.length;
      }
    }
    this.doors?.place(this.world);
    this.stats.batches = this.group.children.length;
    this.group.updateMatrixWorld(true);
  }

  async loadHouseholdLiving(options={}) {
    if(this.householdLiving)return this.householdLiving;
    const living=new HouseholdLiving(this.world);
    try{await living.load(this,options);if(this._disposed){living.dispose();throw new Error("Structure loading was disposed");}this.householdLiving=living;this.group.add(living.group);this.stats.householdLiving=living.stats;return living;}catch(error){living.dispose();throw error;}
  }

  collisionPartsFor(entity){return [...(this._templates.get(entity.assetId+":"+(entity.part||""))||[]),...(this.householdLiving?.partsFor(entity)||[])];}

  update(camera, dt) {
    if (this.stats.status !== "ready") return;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this._cameraPosition);
    this.group.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection,camera.coordinateSystem,camera.reversedDepth);
    this.householdLiving?.update(camera,this._frustum);
    let visible = 0, visibleTriangles = 0, shadows = 0;
    let culledDetailInstances = 0, lowLODInstances = 0, activeTriangles = 0;
    const projection = Math.abs(camera.projectionMatrix.elements[5]) * .5;
    this.stats.distanceTests = 0;
    if (this.selectionReuse) for (const bin of this._selectionBins) {
      for (let i = 0; i < bin.worldBounds.length; i++) {
        bin.distances[i] = bin.worldBounds[i].distanceToPoint(this._cameraPosition);
        this.stats.distanceTests++;
      }
    }
    const assign = (batch, mesh, selection, key) => {
      const signature = selection.join(",");
      if (signature !== batch[key]) {
        for (let i = 0; i < selection.length; i++) mesh.setMatrixAt(i, batch.matrices[selection[i]]);
        mesh.count = selection.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.activeEntityIds = selection.map(i => batch.entities[i]);
        // InstancedMesh bounds must follow the compacted active prefix, not the
        // original tile: otherwise distant hidden interiors still expand culling.
        if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
        batch[key] = signature;
        this.stats.revision=(this.stats.revision||0)+1;
      }
      mesh.visible = selection.length > 0;
      mesh.castShadow = false;
      if (!mesh.visible) return;
      this._sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
      transformWorldBox(this._box,mesh.boundingBox,mesh.matrixWorld);
      // Off-screen nearby objects remain casters for CSM and room light shadows.
      mesh.castShadow = !mesh.material.transparent && this._box.distanceToPoint(this._cameraPosition) <= this.shadowDistance;
      if (mesh.castShadow) shadows++;
      const triangleCount = triangles(mesh.geometry) * mesh.count;
      activeTriangles += triangleCount;
      if (this._frustum.intersectsSphere(this._sphere)) { visible++; visibleTriangles += triangleCount; }
    };
    for (const batch of this._batches) {
      const near = [], far = [];
      for (let i = 0; i < batch.entities.length; i++) {
        const distance = this.selectionReuse ? batch.distances[i]
          : batch.worldBounds[i].distanceToPoint(this._cameraPosition);
        if (!this.selectionReuse) this.stats.distanceTests++;
        const enabled = detailIsVisible(batch.part.role, distance, batch.scales[i], projection, batch.detailState[i]);
        batch.detailState[i] = enabled ? 1 : 0;
        if (!enabled) { culledDetailInstances++; continue; }
        const projectedError = batch.part.low
          ? batch.part.low.error * batch.scales[i] * projection / Math.max(distance, .01) : Infinity;
        const useLow = batch.lodMesh && distance > (batch.lodState[i] ? 75 : 85) &&
          projectedError < (batch.lodState[i] ? .001 : .0008);
        batch.lodState[i] = useLow ? 1 : 0;
        (useLow ? far : near).push(i);
      }
      assign(batch, batch.mesh, near, "nearSelection");
      if (batch.lodMesh) assign(batch, batch.lodMesh, far, "farSelection");
      lowLODInstances += far.length;
    }
    this.stats.visibleBatches = visible;
    this.stats.visibleTriangles = visibleTriangles;
    this.stats.shadowBatches = shadows;
    this.stats.culledDetailInstances = culledDetailInstances;
    this.stats.lowLODInstances = lowLODInstances;
    this.stats.activeTriangles = activeTriangles;
  }

  _release() {
    this.householdLiving?.dispose();this.householdLiving=null;
    for (const { mesh, lodMesh } of this._batches) { mesh.dispose(); lodMesh?.dispose(); }
    this.group.clear();
    this._batches.length = 0;
    this._selectionBins.length = 0;
    for (const geometry of this._geometries) geometry.dispose();
    for (const geometry of this._sourceGeometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const material of this._sourceMaterials) material.dispose();
    for (const texture of this._textures) texture.dispose();
    this.textureReuse.clear();
    for(const depth of this._depthMaterials.values())depth.dispose();
    this._depthMaterials.clear();
    this._geometries.clear();
    this._sourceGeometries.clear();
    this._sourceMaterials.clear();
    this._textures.clear();
    this._templates.clear();
    this._materialCache.clear();
    this.materials.length = 0;
    this.entityPoses.clear();
    Object.assign(this.stats, {
      batches: 0, instances: 0, triangles: 0, upgradedRooms: 0, materials: 0,
      visibleBatches: 0, visibleTriangles: 0, shadowBatches: 0,
      culledDetailInstances: 0, lowLODInstances: 0, activeTriangles: 0, lodTemplates: 0,
    });
  }

  dispose() {
    this._disposed = true;
    this._release();
    this.group.removeFromParent();
    this.stats.status = "disposed";
  }
}
