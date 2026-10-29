import {houseTextiles62Enabled,prepareHouseTextiles62} from './house-textiles62.js';
import {houseFurniture58Enabled,prepareHouseFurniture58,installHouseFurniture58} from './house-furniture-timber58.js';
import {HOUSE_TIMBER48_ENTITY,houseTimber48Enabled,prepareHouseTimber48,installHouseTimber48} from './house-timber48.js';
import {guestLivingEnabled} from './guest-living-definition.js';
import {guestLivingURL,loadGuestLiving} from './guest-living-loader.js';
import {lodgeTablesEnabled,LODGE_TABLES_SOURCE} from './lodge-tables-definition.js';
import {lodgeTablesURL,loadLodgeTables} from './lodge-tables-loader.js';
import {LodgeInteriorStream,loadLodgeStreamPackage} from './lodge-interior-stream.js';
import {lodgeInteriorWoodEnabled,prepareLodgeInteriorWood} from './lodge-interior-wood.js';
import {lodgeChairsEnabled,LODGE_CHAIRS_SOURCE} from './lodge-chairs-definition.js';
import {lodgeChairsURL,loadLodgeChairs,originalLodgeChairsCollision} from './lodge-chairs-loader.js';
import {guestVanityEnabled,isGuestVanityMesh} from './guest-vanity-definition.js';
import {guestVanityURL,loadGuestVanity,originalGuestVanityCollision} from './guest-vanity-loader.js';
import {cabinTimberEnabled,prepareCabinTimber,isCabinTimberPart,cabinTimberTarget,createCabinTimberMaterial} from './cabin-timber.js';
import {cabinWindowGlassEnabled,cabinWindowTarget,verifyCabinWindowSource,isCabinWindowPart,createCabinWindowGlass} from './cabin-window-glass.js';
import {lodgeFurnitureEnabled,LODGE_FURNITURE_SOURCE} from './lodge-furniture-definition.js';
import {lodgeFurnitureURL,loadLodgeFurniture} from './lodge-furniture-loader.js';
import {prepareLodgeWood,installLodgeWood} from './lodge-wood.js';
import {clearThresholdStones} from './threshold-stones.js';
import {StructureSelectionCache} from "./structure-selection-cache.js";
import {prepareStoneOcclusion,applyStoneOcclusion} from './stone-occlusion.js';
import {prepareLodgeGlass,installLodgeThinGlass} from './lodge-opening.js';
import {StructurePreparedAssets,restorePreparedStructures} from './structure-prepared.js';
import {prepareTimberContinuity,applyTimberContinuity} from './timber-continuity.js';
import { createStructureSelection, commitStructureSelection } from "./structure-selection.js";
import {HouseholdLiving} from './household-living.js';
import {HouseholdEntrySteps} from './household-entry-steps.js';
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
  // The two authored replacement sofas inherit the original linen interior role;
  // appliance shells keep their former structural/body visibility contract.
  if(assetId==='gh_lanchuan_lodge'&&(/^(?:export_sofa_[12]_candidate_|chair38_)/.test(name)))return 'interior';
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
  const role = (assetId==="gh_lanchuan_lodge"&&extras?.lodgeChair38?"interior":null) || settlementMeshRole(assetId,name,extras) || detailRole(assetId, name);
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
  constructor(world, {loadAsset=loadWorldGLB,doors=null,preparedAssets,
    lodgeInteriorStream=false,lodgeStreamKind=null,lodgeStreamOptions,
    lodgeChairs=lodgeChairsEnabled(),lodgeChairsFetch,lodgeTables=lodgeChairs&&lodgeTablesEnabled(),lodgeTablesFetch,lodgeInteriorWood=lodgeChairs&&lodgeInteriorWoodEnabled(),lodgeInteriorWoodTextureLoader,guestVanity=guestVanityEnabled(),guestVanityFetch,guestLiving=guestVanity&&guestLivingEnabled(),guestLivingFetch,lodgeFurniture=lodgeFurnitureEnabled(),lodgeFurnitureFetch,cabinWindowGlass=cabinWindowGlassEnabled(),cabinTimber=cabinTimberEnabled(),cabinTimberTextureLoader,houseTimber48=houseTimber48Enabled(),houseTimber48Options,houseFurniture58=houseFurniture58Enabled(undefined,houseTimber48),houseFurniture58Options,houseTextiles62=houseTextiles62Enabled(),houseTextiles62Options,
    selectionCache=new URLSearchParams(globalThis.location?.search || "").get("structureSelectionCache")==="1",
    textureReuse=new URLSearchParams(globalThis.location?.search || "").get("structureTextureReuse") !== "0",
    preparationReuse=new URLSearchParams(globalThis.location?.search || "").get("structurePreparationReuse") !== "0",
    cooperativePreparation=new URLSearchParams(globalThis.location?.search || "").get("structurePreparation") !== "blocking",
    selectionBuffers=new URLSearchParams(globalThis.location?.search || "").get("structureSelectionBuffers") !== "0",
    selectionReuse=new URLSearchParams(globalThis.location?.search || "").get("structureSelectionReuse") !== "0"} = {}) {
    if(houseFurniture58&&!houseTimber48)throw Error('Furniture58 requires houseTimber48; explicit timber rollback is incompatible');
    this.houseFurniture58=houseFurniture58;this.houseFurniture58Options=houseFurniture58Options;
    this.houseTextiles62=houseTextiles62;this.houseTextiles62Options=houseTextiles62Options;
    this.world = world;
    this.lodgeTables=lodgeTables;this.lodgeTablesFetch=lodgeTablesFetch;
    if(lodgeTables&&!lodgeChairs)throw Error('Lodge tables requires chairs ancestry');
    this._lodgeStreamKind=lodgeStreamKind;this._lodgeStreamOptions=lodgeTables?{...lodgeStreamOptions,sourceBinding:LODGE_TABLES_SOURCE,manifestLoader:()=>import('./generated/lodge-tables-stream-38.json',{with:{type:'json'}}).then(m=>m.default)}:lodgeStreamOptions;
    if(lodgeInteriorStream&&!lodgeChairs)throw Error("Lodge streaming requires chairs source");
    this.lodgeStream=new LodgeInteriorStream(world,{enabled:lodgeInteriorStream,shadowDistance:SHADOW_DISTANCE,load:()=>this._loadLodgeInterior()});
    this.lodgeInteriorWood=lodgeInteriorWood;this.lodgeInteriorWoodTextureLoader=lodgeInteriorWoodTextureLoader;this.lodgeChairs=lodgeChairs;this.lodgeChairsFetch=lodgeChairsFetch;this._lodgeChairsCollision=null;if(guestLiving&&!guestVanity)throw Error("Guest living requires accepted vanity source");this.guestLiving=guestLiving;this.guestLivingFetch=guestLivingFetch;this.guestVanity=guestVanity;this.guestVanityFetch=guestVanityFetch;this._guestVanityCollision=null;this.houseTimber48=houseTimber48;this.houseTimber48Options=houseTimber48Options;this.cabinTimber=cabinTimber;this.cabinTimberTextureLoader=cabinTimberTextureLoader;this._cabinTimber=null;this.cabinWindowGlass=cabinWindowGlass;this.lodgeFurniture=lodgeFurniture;this.lodgeFurnitureFetch=lodgeFurnitureFetch;
    this.selectionCache=new StructureSelectionCache({enabled:selectionCache});
    this.doors = doors;
    this.preparedAssets=new StructurePreparedAssets({enabled:preparedAssets});
    this.preparationReuse = preparationReuse;
    this.selectionReuse = selectionReuse;
    this.selectionBuffers = selectionBuffers;
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
    this.stats.selectionCache=this.selectionCache.stats;
    this.stats.preparedAssets=this.preparedAssets.stats;
    this.stats.lodgeInteriorStream=this.lodgeStream.stats;
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
    const key = interiorBounce + ":" + materialKey(source)+(this._houseTimber48?.materials.has(source)?":house-timber48":"")+(this._houseFurniture58?.materials.has(source)?":house-furniture58":"");
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
    installLodgeThinGlass(material);
    installLodgeWood(material,source);
    installHouseTimber48(material,source,this._houseTimber48);
    installHouseFurniture58(material,source,this._houseFurniture58,this.houseFurniture58Options);
    // Keep all GLTFLoader PBR maps, scalar factors, alpha mode and sidedness.
    // Texture objects are shared with our private loader result, not the old scene.
    this._materialCache.set(key, material);
    this.materials.push(material);
    return material;
  }

  async _loadAsset(assetId, parts) {
    const base = this.world.assetBase || "./assets/";
    const tables=this.lodgeTables&&assetId==='gh_lanchuan_lodge';
    const chairs=this.lodgeChairs&&assetId==='gh_lanchuan_lodge';
    const furniture=this.lodgeFurniture&&assetId==='gh_lanchuan_lodge';
    const vanity=this.guestVanity&&assetId==='gh_lanchuan',living=vanity&&this.guestLiving;
    const url = tables?lodgeTablesURL(base):chairs?lodgeChairsURL(base):living?guestLivingURL(base):vanity?guestVanityURL(base):furniture?lodgeFurnitureURL(base):base.replace(/\/?$/, "/") + (ASSET_OVERRIDES[assetId] || assetId + ".glb");
    const streamKind=chairs&&(this._lodgeStreamKind||(this.lodgeStream.enabled?"shell":null));
    const loadStarted=performance.now();
    const houseTimber48=assetId==='house_a'&&this.houseTimber48&&this.world.entities.some(e=>e.assetId==='house_a'&&e.id===HOUSE_TIMBER48_ENTITY);
    const houseTextiles62=assetId==='house_a'&&this.houseTextiles62;
    const prepared=(chairs||furniture||vanity||houseTimber48||houseTextiles62)?null:await this.preparedAssets.load(assetId,parts,this,url);
    const gltf = streamKind?await loadLodgeStreamPackage(streamKind,this.loader,this._lodgeStreamOptions):tables?await loadLodgeTables(url,this.loader,{fetchImpl:this.lodgeTablesFetch}):chairs?await loadLodgeChairs(url,this.loader,{fetchImpl:this.lodgeChairsFetch}):living?await loadGuestLiving(url,this.loader,{fetchImpl:this.guestLivingFetch}):vanity?await loadGuestVanity(url,this.loader,{fetchImpl:this.guestVanityFetch}):furniture?await loadLodgeFurniture(url,this.loader,{fetchImpl:this.lodgeFurnitureFetch}):prepared?.gltf??await this.loadAsset(url);
    const metrics=this.stats.assetPreparation.assets[assetId]={loadMs:performance.now()-loadStarted,prepareMs:0,yieldWaitMs:0,checkpoints:0};
    metrics.loadStartMs=loadStarted;metrics.loadEndMs=performance.now();if(gltf.userData?.assetTransport)metrics.transport=gltf.userData.assetTransport;
    if(living)metrics.guestLiving={...gltf.userData.guestLiving};
    if(vanity){metrics.guestVanity={...gltf.userData.guestVanity};this._guestVanityCollision=await originalGuestVanityCollision();for(const p of this._guestVanityCollision)this._geometries.add(p.geometry);}
    if(tables)gltf.scene.traverse(n=>{if(!n.isMesh)return;for(let owner=n;owner;owner=owner.parent)if(owner.name.startsWith('tablecraft38_')){n.userData.lodgeTable38=owner.name;break;}});
    if(tables)metrics.lodgeTables={sourceSHA256:LODGE_TABLES_SOURCE.sourceSHA256,...gltf.userData.lodgeTables};
    if(chairs){metrics.lodgeChairs={...gltf.userData.lodgeChairs};this._lodgeChairsCollision=await originalLodgeChairsCollision();for(const p of this._lodgeChairsCollision)this._geometries.add(p.geometry);}
    if(furniture&&!chairs)metrics.lodgeFurniture={...gltf.userData.lodgeFurniture};
    if(streamKind){this._lodgeStreamManifest=gltf.userData.lodgeStream.manifest;if(this.lodgeStream.enabled)this.lodgeStream.setBounds(this._lodgeStreamManifest.fullBounds);metrics.lodgeStream={kind:streamKind,responseBytes:gltf.userData.lodgeStream.responseBytes};}
    if(houseTextiles62){
      this._houseTextiles62=await prepareHouseTextiles62(assetId,gltf.scene,{loadAsset:url=>this.loadAsset(url),...this.houseTextiles62Options,enabled:true});
      // Retired originals and new source buffers share the existing asset owner.
      // Track now so a later timber/preparation failure releases both sets.
      for(const g of [...this._houseTextiles62.retiredGeometries,...this._houseTextiles62.geometries])this._sourceGeometries.add(g);
      metrics.houseTextiles62=this._houseTextiles62.stats;this.stats.houseTextiles62=this._houseTextiles62.stats;
    }
    if(houseTimber48){this._houseTimber48=await prepareHouseTimber48(assetId,gltf.scene,this.world,{...this.houseTimber48Options,enabled:true});if(this._houseTimber48){metrics.houseTimber48=this._houseTimber48.stats;for(const t of Object.values(this._houseTimber48.textures))this._textures.add(t);}}
    if(this.houseFurniture58&&houseTimber48){
      this._houseFurniture58=await prepareHouseFurniture58(assetId,gltf.scene,this.world,{...this.houseFurniture58Options,enabled:true,timberOwner:this._houseTimber48});
      if(this._houseFurniture58){metrics.houseFurniture58=this._houseFurniture58.stats;this.stats.houseFurniture58=this._houseFurniture58.stats;}
    }
    const prepareStarted=performance.now();
    const checkpoint=()=>{
      const pending=this.preparationYield.checkpoint();
      if(!pending)return null;
      const start=performance.now();metrics.checkpoints++;
      return pending.then(()=>{metrics.yieldWaitMs+=performance.now()-start;if(this._disposed)throw new Error("Structure loading was disposed");});
    };
    if(this.cabinWindowGlass&&assetId==='cabin_small')metrics.cabinWindowGlass=verifyCabinWindowSource(gltf.scene);
    prepareLodgeGlass(assetId,gltf.scene);
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
    if(prepared){
      restorePreparedStructures(this,assetId,gltf,prepared.meta);
      metrics.timberContinuity=prepared.meta.timberContinuity;metrics.stoneOcclusion=prepared.meta.stoneOcclusion;metrics.offlinePrepared=true;
      metrics.prepareMs=performance.now()-prepareStarted;metrics.cpuMs=metrics.prepareMs;return;
    }
    const cabin=await prepareCabinTimber(assetId,gltf.scene,{enabled:this.cabinTimber&&this.world.entities.some(cabinTimberTarget),sourceSHA256:this.world.manifest?.assetMetadata?.[assetId]?.sha256,textureLoader:this.cabinTimberTextureLoader});
    if(cabin){this._cabinTimber=cabin;metrics.cabinTimber=cabin.stats;for(const texture of Object.values(cabin.textures))this._textures.add(texture);}
    if(streamKind==='shell'&&this.lodgeInteriorWood)for(const record of this._lodgeStreamManifest.interiorWoodLayout.nodes){const node=gltf.scene.getObjectByName(record.name);if(node?.isMesh){const old=node.material,m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,old);m.clearcoat=0;node.material=m;this._sourceMaterials.add(m);}}
    const wood=streamKind==='shell'?{active:false}:this.lodgeInteriorWood&&assetId==='gh_lanchuan_lodge'?await prepareLodgeInteriorWood(assetId,gltf.scene,{enabled:true,sourceSHA256:tables?LODGE_TABLES_SOURCE.sourceSHA256:chairs?LODGE_CHAIRS_SOURCE.sourceSHA256:undefined,sourceDefinition:tables?LODGE_TABLES_SOURCE:LODGE_CHAIRS_SOURCE,layoutOverride:streamKind?this._lodgeStreamManifest.interiorWoodLayout:tables?(await import('./generated/lodge-tables-wood-38.json',{with:{type:'json'}})).default:undefined,textureLoader:this.lodgeInteriorWoodTextureLoader}):await prepareLodgeWood(assetId,gltf.scene,{sourceSHA256:tables?LODGE_TABLES_SOURCE.sourceSHA256:chairs?LODGE_CHAIRS_SOURCE.sourceSHA256:furniture?LODGE_FURNITURE_SOURCE.sourceSHA256:this.world.manifest?.assetMetadata?.[assetId]?.sha256});
    const {textures:woodTextures,...woodStats}=wood;metrics.lodgeWood=woodStats;
    for(const texture of woodTextures||[])this._textures.add(texture);
    if(wood.active)this._trackSource(gltf);
    await MeshoptSimplifier.ready;
    gltf.scene.updateMatrixWorld(true);
    const timberCandidate=await prepareTimberContinuity(assetId,gltf.scene);
    metrics.timberContinuity=timberCandidate?{active:true,version:timberCandidate.version,samples:timberCandidate.samples,sourceSHA256:timberCandidate.sourceSHA256}:{active:false};
    // Threshold source placement is structural, even in a viewer without door interaction.
    if(streamKind!=="interior"){if(this.doors)this.doors.captureAsset(assetId,gltf.scene,source=>this._material(source));
    else clearThresholdStones(assetId,gltf.scene);}
    const stoneCandidate=await prepareStoneOcclusion(assetId,gltf.scene);
    metrics.stoneOcclusion=stoneCandidate?{active:true,version:stoneCandidate.version,stones:stoneCandidate.stones}:{active:false};
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
          applyTimberContinuity(geometry,node,timberCandidate);
          applyStoneOcclusion(geometry,node,stoneCandidate);
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
            const chairsReplacement=chairs&&Boolean(node.userData.lodgeChair38);
            const tablesReplacement=tables&&Boolean(node.userData.lodgeTable38);
            const vanityReplacement=vanity&&isGuestVanityMesh(node.name)&&!node.name.includes('shower');
            const key = section.role + ":" + material.uuid + ":" + signature(section.geometry)+(chairsReplacement?":chairs38":"")+(tablesReplacement?":tables38":"")+(vanityReplacement?":vanity38":"")+(vanity&&/shower/.test(node.name)?":shower38":"");
            if (!buckets.has(key)) buckets.set(key, { role:section.role, material, geometries: [], names: [],chairsReplacement,tablesReplacement,vanityReplacement });
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
          names: bucket.names, chairsReplacement:bucket.chairsReplacement,tablesReplacement:bucket.tablesReplacement, vanityReplacement:bucket.vanityReplacement, triangles: triangles(geometry) });
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
      if(bin.assetId==="gh_lanchuan_lodge"&&this._lodgeStreamManifest){const b=this._lodgeStreamManifest.fullBounds;if(!b)throw Error("Lodge stream full bounds missing");buildingBox.min.fromArray(b[0]);buildingBox.max.fromArray(b[1]);}
      const offset = new THREE.Vector3(bin.tx * TILE_SIZE, 0, bin.tz * TILE_SIZE);
      const worldBounds = bin.matrices.map(matrix => buildingBox.clone().applyMatrix4(matrix).translate(offset));
      const scales = bin.entities.map(id => Math.max(...Object.values(this.entityPoses.get(id).scale)));
      // Every material/detail batch in a tile uses the same complete-building
      // bound. Re-evaluate it once per frame, not once per constituent mesh.
      // Float64 retains the exact Number precision of distanceToPoint().
      const distances = new Float64Array(worldBounds.length);
      this._selectionBins.push({worldBounds, distances});
      for (const part of template) {
        const wholeBin=bin,wholeBounds=worldBounds,wholeScales=scales,wholeDistances=distances;
        const glassPart=this.cabinWindowGlass&&isCabinWindowPart(part),timberPart=isCabinTimberPart(part,this._cabinTimber);
        const target=glassPart||timberPart?bin.entities.findIndex(id=>cabinWindowTarget({assetId:bin.assetId,id})):-1;
        // Split only the exact target material batches; all other entities retain their original shared material.
        const variants=target<0?[null]:[bin.entities.map((_,i)=>i).filter(i=>i!==target),[target]].filter(ids=>ids.length);
        for(const selected of variants){
        const bin=selected?{...wholeBin,entities:selected.map(i=>wholeBin.entities[i]),matrices:selected.map(i=>wholeBin.matrices[i])}:wholeBin;
        const worldBounds=selected?selected.map(i=>wholeBounds[i]):wholeBounds,scales=selected?selected.map(i=>wholeScales[i]):wholeScales,distances=selected?new Float64Array(selected.length):wholeDistances;
        if(selected)this._selectionBins.push({worldBounds,distances,sourceDistances:wholeDistances,sourceIndices:selected});
        const renderMaterial=selected?.length===1&&selected[0]===target?(glassPart?createCabinWindowGlass(part.material):createCabinTimberMaterial(part.material,part,this._cabinTimber)):part.material;
        if(renderMaterial!==part.material)this.materials.push(renderMaterial);
        const makeMesh = (geometry, level) => {
          const mesh = new THREE.InstancedMesh(geometry, renderMaterial, bin.matrices.length);
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
          if(!this._depthMaterials.has(renderMaterial))this._depthMaterials.set(renderMaterial,createStructureDepth(renderMaterial));
          mesh.customDepthMaterial=this._depthMaterials.get(renderMaterial);
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
          nearBuffer:createStructureSelection(bin.entities.length,true), farBuffer:createStructureSelection(bin.entities.length),
          farSelection:"", detailState:new Uint8Array(bin.entities.length).fill(1),
          lodState:new Uint8Array(bin.entities.length)});
        // Source budget remains comparable to the old full-detail renderer. Derived
        // far geometry is mutually exclusive and counted in activeTriangles instead.
        this.stats.instances += bin.matrices.length;
        this.stats.triangles += part.triangles * bin.matrices.length;
        }
      }
    }
    this.doors?.place(this.world);
    this.stats.batches = this.group.children.length;
    this.group.updateMatrixWorld(true);
  }

  async loadHouseholdLiving(options={}) {
    if(this.householdLiving)return this.householdLiving;
    const living=new HouseholdLiving(this.world);let steps;
    try{await living.load(this,options);if(this._disposed){living.dispose();throw new Error("Structure loading was disposed");}steps=new HouseholdEntrySteps(this.world);await steps.load(this,options);if(this._disposed)throw new Error("Structure loading was disposed");this.householdLiving=living;this.householdEntrySteps=steps;this.group.add(living.group,steps.group);this.stats.householdLiving=living.stats;this.stats.householdEntrySteps=steps.stats;return living;}catch(error){steps?.dispose();living.dispose();throw error;}
  }

  async _loadLodgeInterior(){
    const world={...this.world,entities:this.world.entities.filter(e=>e.assetId==='gh_lanchuan_lodge')};
    const stage=new WorldStructures(world,{lodgeInteriorStream:false,lodgeStreamKind:'interior',lodgeStreamOptions:this._lodgeStreamOptions,lodgeTables:this.lodgeTables,lodgeTablesFetch:this.lodgeTablesFetch,lodgeChairs:true,lodgeInteriorWood:this.lodgeInteriorWood,lodgeInteriorWoodTextureLoader:this.lodgeInteriorWoodTextureLoader,doors:null,preparedAssets:false});
    try{await stage.load();if(this._disposed)throw Error('Structures disposed during lodge load');return stage;}catch(error){stage.dispose();throw error;}
  }
  installLodgeInterior(stage){
    if(stage._streamInstalled)return;stage._streamInstalled=true;
    for(const [key,parts]of stage._templates)this._templates.set(key,[...(this._templates.get(key)||[]),...parts]);
    for(const child of [...stage.group.children])this.group.add(child);
    this._batches.push(...stage._batches);this._selectionBins.push(...stage._selectionBins);this.materials.push(...stage.materials);
    for(const key of ['_geometries','_sourceGeometries','_sourceMaterials','_textures']){for(const item of stage[key])this[key].add(item);stage[key].clear();}
    for(const [key,value]of stage._depthMaterials)this._depthMaterials.set(key,value);
    stage._depthMaterials.clear();stage._templates.clear();stage._batches=[];stage._selectionBins=[];stage.materials=[];
    for(const key of ['instances','triangles','lodTemplates'])this.stats[key]+=stage.stats[key];
    this.stats.batches=this.group.children.length;this.stats.materials=this.materials.length;this.stats.revision=(this.stats.revision||0)+1;this.selectionCache.clear();
    this.group.updateMatrixWorld(true);
  }
  collisionPartsFor(entity){
    this.lodgeStream.assertCollision(entity);
    let parts=this._templates.get(entity.assetId+":"+(entity.part||""))||[];
    if(this.lodgeChairs&&entity.assetId==='gh_lanchuan_lodge')parts=[...parts.filter(p=>!p.chairsReplacement),...(this._lodgeChairsCollision||[])];
    if(this.guestVanity&&entity.assetId==='gh_lanchuan'){
      const retained=(this._guestVanityCollision||[]).filter(p=>!entity.part||p.names.some(n=>n===entity.part||n.startsWith(entity.part+'_')));
      parts=[...parts.filter(p=>!p.vanityReplacement),...retained];
    }
    return [...parts,...(this.householdLiving?.partsFor(entity)||[]),...(this.householdEntrySteps?.partsFor(entity)||[])];
  }

  update(camera, dt) {
    if (this.stats.status !== "ready") return;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this._cameraPosition);
    this.group.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection,camera.coordinateSystem,camera.reversedDepth);
    this.householdLiving?.update(camera,this._frustum);this.householdEntrySteps?.update(camera);
    let visible = 0, visibleTriangles = 0, shadows = 0;
    let culledDetailInstances = 0, lowLODInstances = 0, activeTriangles = 0;
    const projection = Math.abs(camera.projectionMatrix.elements[5]) * .5;
    this.stats.distanceTests = 0;
    this.stats.selectionBuffers = this.selectionBuffers; this.stats.selectionSignatureBuilds = 0;
    if(this.selectionCache.reuse(this,camera))return;
    if (this.selectionReuse) for (const bin of this._selectionBins) {
      // Material-only partitions retain the original entity distance evaluation.
      if (bin.sourceDistances) {
        for (let i=0;i<bin.sourceIndices.length;i++) bin.distances[i]=bin.sourceDistances[bin.sourceIndices[i]];
        continue;
      }
      for (let i = 0; i < bin.worldBounds.length; i++) {
        bin.distances[i] = bin.worldBounds[i].distanceToPoint(this._cameraPosition);
        this.stats.distanceTests++;
      }
    }
    const assign = (batch, mesh, selection, count, key, buffer) => {
      const signature = buffer ? commitStructureSelection(buffer) : selection.join(",");
      if (signature !== null) this.stats.selectionSignatureBuilds++;
      if (signature !== null && signature !== batch[key]) {
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, batch.matrices[selection[i]]);
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.activeEntityIds = Array.from({length:count}, (_,i) => batch.entities[selection[i]]);
        // InstancedMesh bounds must follow the compacted active prefix, not the
        // original tile: otherwise distant hidden interiors still expand culling.
        if (mesh.count) { mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
        batch[key] = signature;
        this.stats.revision=(this.stats.revision||0)+1;
      }
      mesh.visible = count > 0;
      mesh.castShadow = false;
      if (!mesh.visible) return;
      this._sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
      transformWorldBox(this._box,mesh.boundingBox,mesh.matrixWorld);
      // Off-screen nearby objects remain casters for CSM and room light shadows.
      mesh.castShadow = !mesh.material.userData.lodgeThinGlass && !mesh.material.transparent && this._box.distanceToPoint(this._cameraPosition) <= this.shadowDistance;
      if (mesh.castShadow) shadows++;
      const triangleCount = triangles(mesh.geometry) * mesh.count;
      activeTriangles += triangleCount;
      if (this._frustum.intersectsSphere(this._sphere)) { visible++; visibleTriangles += triangleCount; }
    };
    for (const batch of this._batches) {
      const nearBuffer = this.selectionBuffers ? batch.nearBuffer : null, farBuffer = this.selectionBuffers ? batch.farBuffer : null;
      const near = nearBuffer?.indices ?? [], far = farBuffer?.indices ?? [];
      let nearCount = 0, farCount = 0;
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
        if (useLow) far[farCount++] = i; else near[nearCount++] = i;
      }
      if (nearBuffer) nearBuffer.count = nearCount;
      if (farBuffer) farBuffer.count = farCount;
      assign(batch, batch.mesh, near, nearCount, "nearSelection", nearBuffer);
      if (batch.lodMesh) assign(batch, batch.lodMesh, far, farCount, "farSelection", farBuffer);
      lowLODInstances += farCount;
    }
    this.stats.visibleBatches = visible;
    this.stats.visibleTriangles = visibleTriangles;
    this.stats.shadowBatches = shadows;
    this.stats.culledDetailInstances = culledDetailInstances;
    this.stats.lowLODInstances = lowLODInstances;
    this.stats.activeTriangles = activeTriangles;
    this.selectionCache.capture(this,camera);
  }

  _release() {
    this._houseTextiles62=null;delete this.stats.houseTextiles62;
    this._houseFurniture58?.dispose();this._houseFurniture58=null;delete this.stats.houseFurniture58;
    this.lodgeStream.dispose();
    this.selectionCache.clear();
    this.householdLiving?.dispose();this.householdLiving=null;this.householdEntrySteps?.dispose();this.householdEntrySteps=null;
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
    this._cabinTimber=null;
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
