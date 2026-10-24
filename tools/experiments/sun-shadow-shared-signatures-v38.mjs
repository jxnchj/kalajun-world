// REJECTED V38 experiment. Offline benchmark only; never imported by application.
import { BasicDepthPacking, Object3D, PCFShadowMap, VSMShadowMap } from "../../web/node_modules/three/build/three.module.js";
import { isStandardProjectedDepth } from "../../web/src/v2/room-shadow.js";

// Compare exact scalar/reference state, not a lossy hash or every vertex/instance.
// Buffer edits follow Three's contract: set the BufferAttribute/Texture needsUpdate.
const put = (s, value) => {
  if (s.values[s.cursor] !== value) { s.values[s.cursor] = value; s.changed = true; }
  s.cursor++;
};
const array = (s, values) => { put(s, values.length); for (let i = 0; i < values.length; i++) put(s, values[i]); };
const SCHEDULED_WIND_ATTRIBUTES = new Set(["aTreeRootWind", "aTreeRootEddy"]);
function attribute(s, a, scheduledWind = false) {
  put(s, a);
  if (!a) return;
  put(s, a.data); put(s, a.array); put(s, a.data?.array);
  // Only per-root wind values follow the existing bounded shadow cadence.
  // Replacing/reallocating an attribute, changing its layout, or opting out
  // still invalidates immediately; instance matrices are never exempt.
  put(s, scheduledWind);
  if (!scheduledWind) { put(s, a.version); put(s, a.data?.version); }
  put(s, a.meshPerAttribute); put(s, a.offset); put(s, a.data?.stride);
  put(s, a.data?.meshPerAttribute); put(s, a.data?.count);
  put(s, a.count); put(s, a.itemSize); put(s, a.normalized); put(s, a.gpuType);
}
// Fixed-layout comparison of the SAME signature as attribute(). Every mutable
// field is read each frame. Stable attributes avoid per-slot cursor mutation and
// generic put() calls, not invalidation checks; the common values layout also
// permits switching implementations without a stale or false revision.
function attributeDirect(s, a, scheduledWind) {
  const values = s.values, data = a.data, buffer = a.array, dataBuffer = data?.array;
  const version = scheduledWind ? undefined : a.version, dataVersion = scheduledWind ? undefined : data?.version;
  const meshPerAttribute = a.meshPerAttribute, offset = a.offset, stride = data?.stride;
  const dataMeshPerAttribute = data?.meshPerAttribute, dataCount = data?.count;
  const count = a.count, itemSize = a.itemSize, normalized = a.normalized, gpuType = a.gpuType;
  const base = scheduledWind ? 5 : 7, length = base + 9;
  s.changed = values.length !== length || values[0] !== a || values[1] !== data
    || values[2] !== buffer || values[3] !== dataBuffer || values[4] !== scheduledWind
    || (!scheduledWind && (values[5] !== version || values[6] !== dataVersion))
    || values[base] !== meshPerAttribute || values[base + 1] !== offset || values[base + 2] !== stride
    || values[base + 3] !== dataMeshPerAttribute || values[base + 4] !== dataCount
    || values[base + 5] !== count || values[base + 6] !== itemSize
    || values[base + 7] !== normalized || values[base + 8] !== gpuType;
  if (s.changed) {
    values[0] = a; values[1] = data; values[2] = buffer; values[3] = dataBuffer; values[4] = scheduledWind;
    if (!scheduledWind) { values[5] = version; values[6] = dataVersion; }
    values[base] = meshPerAttribute; values[base + 1] = offset; values[base + 2] = stride;
    values[base + 3] = dataMeshPerAttribute; values[base + 4] = dataCount;
    values[base + 5] = count; values[base + 6] = itemSize;
    values[base + 7] = normalized; values[base + 8] = gpuType;
    values.length = length;
  }
  s.cursor = length;
}
function texture(s, t) {
  put(s, t);
  if (!t) return;
  put(s, t.version); put(s, t.channel); put(s, t.wrapS); put(s, t.wrapT);
  put(s, t.matrixAutoUpdate);
  if (t.matrixAutoUpdate) {
    put(s, t.offset.x); put(s, t.offset.y); put(s, t.repeat.x); put(s, t.repeat.y);
    put(s, t.center.x); put(s, t.center.y); put(s, t.rotation);
  } else array(s, t.matrix.elements);
}
function revision(store, object, frame, capture, owner) {
  let s = store.get(object);
  if (!s) { s = { values: [], revision: 0, frame: -1 }; store.set(object, s); }
  if (s.frame === frame) return s.revision;
  s.frame = frame; s.cursor = 0; s.changed = false;
  capture.call(owner, s, object);
  if (s.values.length !== s.cursor) { s.values.length = s.cursor; s.changed = true; }
  if (s.changed) s.revision++;
  return s.revision;
}
function drawable(object) {
  const source = object.userData.treeViewSource || object, g = source.geometry;
  if (!g || source.count === 0 || g.instanceCount === 0) return false;
  const start = Math.max(0, g.drawRange.start), end = Math.min(g.index?.count ?? g.attributes.position?.count ?? 0, g.drawRange.start + g.drawRange.count);
  if (end <= start) return false;
  if (!Array.isArray(object.material)) return object.material?.visible === true;
  return g.groups.some(group => object.material[group.materialIndex]?.visible
    && Math.min(end, group.start + group.count) > Math.max(start, group.start));
}

// The built-in opaque terrain depth pass reads position/morph position only.
// These named attributes shade the surface but cannot alter its depth. Unknown
// attributes remain tracked, and any custom depth hook/alpha/displacement falls
// back to the complete signature immediately. Nothing is removed from geometry.
const TERRAIN_SURFACE_ATTRIBUTES = new Set(["normal", "color", "uv", "terrainCover", "terrainHydrology", "terrainLandform", "terrainCommunity", "terrainLandformDelta", "terrainCommunityDelta", "terrainShoreDistance", "terrainShoreDistanceDelta"]);
export function hasOpaqueTerrainDepth(object, standardProjected = isStandardProjectedDepth) {
  const m=object.material;
  return !!object.userData.terrainTile && object.isMesh && !object.isSkinnedMesh
    && !object.isInstancedMesh && (object.customDepthMaterial === undefined || standardProjected(object.customDepthMaterial))
    && object.onBeforeShadow === Object3D.prototype.onBeforeShadow
    && m?.isMeshStandardMaterial === true && m.alphaTest === 0
    && !m.alphaToCoverage && !m.displacementMap;
}

// Call after CSM.update(), before the shadow scheduler/render. The returned
// arrays are reused: copy each revision value into the scheduler's own state.
// Shader time/wind uniforms deliberately remain on the scheduler's bounded
// cadence. For other custom shader changes use markChanged(object).
export class SunShadowCasters {
  constructor(scene, lights, { sharedSignatures38 = new URLSearchParams(globalThis.location?.search || "").get("shadowSharedSignatures38") === "1", entryReuse = new URLSearchParams(globalThis.location?.search || "").get("shadowCasterEntries") !== "0", terrainDepthCapture = new URLSearchParams(globalThis.location?.search || "").get("terrainShadowSignature") !== "0", shadowType = PCFShadowMap, directAttributeCapture = new URLSearchParams(globalThis.location?.search || "").get("shadowAttributeDirect") !== "0", compactCapture = new URLSearchParams(globalThis.location?.search || "").get("shadowCaptureCompact") !== "0", attributeCache = new URLSearchParams(globalThis.location?.search || "").get("shadowAttributeCache") !== "0", profilePhases = new URLSearchParams(globalThis.location?.search || "").get("shadowCasterPhases") === "1" } = {}) {
    if (!scene || !lights.every(light => light.isDirectionalLight)) throw new TypeError("SunShadowCasters requires a scene and directional lights.");
    this.profilePhases = profilePhases;
    this.sharedSignatures38 = sharedSignatures38;
    this._standardDepthFrames = new WeakMap();
    this._standardDepth = depth => {
      const cached = this._standardDepthFrames.get(depth);
      if (cached?.frame === this._frame) { this.stats.standardDepthReuses++; return cached.standard; }
      this.stats.standardDepthScans++;
      const standard = isStandardProjectedDepth(depth);
      if(cached){cached.frame=this._frame;cached.standard=standard;}else this._standardDepthFrames.set(depth, { frame:this._frame, standard });
      return standard;
    };
    this.entryReuse = entryReuse; this._entries = lights.map(() => new Map());
    this.scene = scene; this.lights = [...lights]; this.shadowType = shadowType; this.attributeCache = attributeCache; this.compactCapture = compactCapture; this.directAttributeCapture = directAttributeCapture;
    this._attributes = [new WeakMap(), new WeakMap()];
    this.terrainDepthCapture = terrainDepthCapture; this._terrainGeometries = new WeakMap();
    this._frame = 0; this.disposed = false;
    this._objects = new WeakMap(); this._geometries = new WeakMap(); this._materials = new WeakMap(); this._manual = new WeakMap();
    this._previous = lights.map(() => new Map()); this._current = lights.map(() => new Map());
    this.result = { revisions: lights.map(() => 0), changed: lights.map(() => false), counts: lights.map(() => 0) };
    this.stats = { frames: 0, lastMs: 0, meanMs: 0, visited: 0, candidates: 0, frustumTests: 0, objectScans: 0, geometryScans: 0, materialScans: 0, attributeScans: 0, attributeReuses: 0 };
  }

  markChanged(object) { this._manual.set(object, (this._manual.get(object) || 0) + 1); }

  _attribute(s, a, scheduledWind = false) {
    if (!a || !this.attributeCache) {
      if (a) this.stats.attributeScans++;
      attribute(s, a, scheduledWind); return;
    }
    // Immutable VBOs are shared by many geometry containers. Capture their
    // exact metadata once per frame, retaining distinct scheduled-wind policy.
    // Every frame still observes version/layout/replacement changes; no stale
    // cross-frame identity cache or vertex-data scan is introduced.
    const store = this._attributes[scheduledWind ? 1 : 0];
    let state;
    if (this.compactCapture) {
      // One lookup and no capture closure for shared-attribute hits. Metadata
      // is still read in full on its first use in EVERY update, not across frames.
      let record = store.get(a);
      if (record?.frame === this._frame) this.stats.attributeReuses++;
      else {
        if (!record) { record = { values: [], revision: 0, frame: -1 }; store.set(a, record); }
        record.frame = this._frame; record.cursor = 0; record.changed = false;
        this.stats.attributeScans++;
        if (this.directAttributeCapture) attributeDirect(record, a, scheduledWind);
        else attribute(record, a, scheduledWind);
        if (record.values.length !== record.cursor) { record.values.length = record.cursor; record.changed = true; }
        if (record.changed) record.revision++;
      }
      state = record.revision;
    } else {
      if (store.get(a)?.frame === this._frame) this.stats.attributeReuses++;
      state = revision(store, a, this._frame, v => {
        this.stats.attributeScans++; attribute(v, a, scheduledWind);
      });
    }
    put(s, a); put(s, scheduledWind); put(s, state);
  }

  _geometry(g, terrainOnly = false) {
    if (terrainOnly) return revision(this._terrainGeometries, g, this._frame, this._captureTerrainGeometry, this);
    return revision(this._geometries, g, this._frame,
      this.sharedSignatures38 ? this._captureGeometryNoKeys : this.compactCapture ? this._captureGeometry : s => this._captureGeometry(s, g), this);
  }

  _captureTerrainGeometry(s, g) { if(this.sharedSignatures38)this._captureGeometryNoKeys(s,g,true);else this._captureGeometry(s, g, true); }

  _captureGeometry(s, g, terrainOnly = false) {
      this.stats.geometryScans++;
      if(terrainOnly)this.stats.terrainDepthScans++;
      this._attribute(s, g.index);
      const windAttributes = g.userData.ecologyWindAttributes;
      for (const name of Object.keys(g.attributes)) {
        if(terrainOnly && TERRAIN_SURFACE_ATTRIBUTES.has(name)){this.stats.surfaceAttributesSkipped++;continue;}
        put(s, name);
        this._attribute(s, g.attributes[name], SCHEDULED_WIND_ATTRIBUTES.has(name)
          && Array.isArray(windAttributes) && windAttributes.includes(name));
      }
      put(s, "morph"); put(s, g.morphTargetsRelative);
      for (const name of Object.keys(g.morphAttributes)) {
        if(terrainOnly && (name === "normal" || name === "color")){this.stats.surfaceAttributesSkipped+=g.morphAttributes[name].length;continue;}
        put(s, name); put(s, g.morphAttributes[name].length);
        for (const a of g.morphAttributes[name]) this._attribute(s, a);
      }
      put(s, "draw"); put(s, g.drawRange.start); put(s, g.drawRange.count); put(s, g.instanceCount);
      for (const group of g.groups) { put(s, group.start); put(s, group.count); put(s, group.materialIndex); }
  }

  // Own enumerable keys are checked live in native property order. No cached
  // key list can hide same-frame replacement or next-frame add/delete/reorder.
  _captureGeometryNoKeys(s, g, terrainOnly = false) {
      this.stats.geometryScans++;
      if(terrainOnly)this.stats.terrainDepthScans++;
      this._attribute(s, g.index);
      const windAttributes = g.userData.ecologyWindAttributes;
      for (const name in g.attributes) {
        if(!Object.hasOwn(g.attributes,name))continue;
        if(terrainOnly && TERRAIN_SURFACE_ATTRIBUTES.has(name)){this.stats.surfaceAttributesSkipped++;continue;}
        put(s, name);
        this._attribute(s, g.attributes[name], SCHEDULED_WIND_ATTRIBUTES.has(name)
          && Array.isArray(windAttributes) && windAttributes.includes(name));
      }
      put(s, "morph"); put(s, g.morphTargetsRelative);
      for (const name in g.morphAttributes) {
        if(!Object.hasOwn(g.morphAttributes,name))continue;
        if(terrainOnly && (name === "normal" || name === "color")){this.stats.surfaceAttributesSkipped+=g.morphAttributes[name].length;continue;}
        put(s, name); put(s, g.morphAttributes[name].length);
        for (const a of g.morphAttributes[name]) this._attribute(s, a);
      }
      put(s, "draw"); put(s, g.drawRange.start); put(s, g.drawRange.count); put(s, g.instanceCount);
      for (const group of g.groups) { put(s, group.start); put(s, group.count); put(s, group.materialIndex); }
  }

  _material(m) {
    return revision(this._materials, m, this._frame,
      this.compactCapture ? this._captureMaterial : s => this._captureMaterial(s, m), this);
  }

  _captureMaterial(s, m) {
      this.stats.materialScans++;
      put(s, m.version); put(s, m.visible); put(s, m.side); put(s, m.shadowSide);
      put(s, m.wireframe); put(s, m.wireframeLinewidth); put(s, m.linewidth);
      put(s, m.alphaTest); put(s, m.alphaToCoverage);
      if (m.alphaTest > 0 || m.alphaToCoverage) { texture(s, m.map); texture(s, m.alphaMap); }
      put(s, m.displacementScale); put(s, m.displacementBias);
      if (m.displacementScale !== 0) texture(s, m.displacementMap);
      put(s, m.clipShadows); put(s, m.clipIntersection);
      if (m.clipShadows && m.clippingPlanes) for (const p of m.clippingPlanes) {
        put(s, p.normal.x); put(s, p.normal.y); put(s, p.normal.z); put(s, p.constant);
      }
      put(s, m.userData?.shadowRevision ?? 0);
  }

  _object(object) {
    return revision(this._objects, object, this._frame,
      this.compactCapture ? this._captureObject : s => this._captureObject(s, object), this);
  }

  _captureObject(s, object) {
      this.stats.objectScans++;
      // Per-view draw buffers are a submission detail. Observe the complete
      // resident source so camera queries cannot invalidate every shadow cache.
      const source = object.userData.treeViewSource || object;
      array(s, object.matrixWorld.elements);
      const terrainOnly = this.terrainDepthCapture && hasOpaqueTerrainDepth(object, this.sharedSignatures38 ? this._standardDepth : isStandardProjectedDepth);
      put(s, terrainOnly); put(s, source.geometry); put(s, this._geometry(source.geometry, terrainOnly));
      this._attribute(s, source.instanceMatrix); this._attribute(s, source.instanceColor); put(s, source.count);
      texture(s, object.morphTexture);
      if (object.morphTargetInfluences) array(s, object.morphTargetInfluences);
      else put(s, null);
      if (this.compactCapture && !Array.isArray(object.material)) {
        const m = object.material; put(s, 1); put(s, m); if (m) put(s, this._material(m));
      } else {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        put(s, materials.length);
        for (const m of materials) { put(s, m); if (m) put(s, this._material(m)); }
      }
      const depth = object.customDepthMaterial;
      put(s, depth); if (depth) put(s, this._material(depth));
      // WebGLShadowMap preserves custom depth opacity, but does not copy the
      // surface opacity. Only BasicDepthPacking reads it before alphaTest.
      // Keep this object/depth context separate from shared surface materials.
      if (depth?.isMeshDepthMaterial) {
        put(s, depth.depthPacking);
        if (depth.depthPacking === BasicDepthPacking) put(s, depth.opacity);
      }
      if (object.isSkinnedMesh) {
        array(s, object.bindMatrix.elements); array(s, object.bindMatrixInverse.elements);
        for (const bone of object.skeleton.bones) array(s, bone.matrixWorld.elements);
      }
      put(s, this._manual.get(object) || 0); put(s, object.userData.shadowRevision ?? 0); put(s, source.userData.shadowRevision ?? 0);
  }

  update(camera, { updateWorldMatrices = true, shadowType = this.shadowType, skipCascades = [] } = {}) {
    if (this.disposed) return this.result;
    if (!camera?.layers) throw new TypeError("The main render camera is required for shadow layers.");
    const start = performance.now(); this._frame++;
    const phases = this.profilePhases ? { matrixMs:0, lightsMs:0, traversalMs:0, captureMs:0, membershipMs:0 } : null;
    this.stats.phases = phases;
    this.stats.skippedCascades = this.lights.map((_,i)=>skipCascades[i]===true);
    Object.assign(this.stats, { sharedSignatures38:this.sharedSignatures38, standardDepthScans:0, standardDepthReuses:0, entryReuse:this.entryReuse, entryCreates:0, terrainDepthCapture:this.terrainDepthCapture, terrainDepthScans:0, surfaceAttributesSkipped:0, visited: 0, candidates: 0, frustumTests: 0, objectScans: 0, geometryScans: 0, materialScans: 0, attributeScans: 0, attributeReuses: 0, attributeCache: this.attributeCache, compactCapture: this.compactCapture, directAttributeCapture: this.directAttributeCapture });
    // Same matrix propagation as WebGLRenderer; no forced update on fixed nodes.
    if (updateWorldMatrices && this.scene.matrixWorldAutoUpdate) this.scene.updateMatrixWorld();
    const matrixEnd = phases ? performance.now() : 0;
    if (phases) phases.matrixMs = matrixEnd - start;
    const frustums = this.lights.map((light,i) => {
      if(skipCascades[i])return null;
      // A target is commonly outside the scene; bring its world transform current.
      if (updateWorldMatrices) { light.updateWorldMatrix(true, false); light.target.updateWorldMatrix(true, false); }
      light.shadow.updateMatrices(light, camera);
      return light.shadow.getFrustum();
    });
    const lightsEnd = phases ? performance.now() : 0;
    if (phases) phases.lightsMs = lightsEnd - matrixEnd;
    const changed = this.result.changed;
    for (let i = 0; i < this.lights.length; i++) { this._current[i].clear(); changed[i] = this._frame === 1; }
    const visit = object => {
      this.stats.visited++;
      if (object.visible === false) return; // Three prunes invisible ancestors.
      if (object.layers.test(camera.layers) && (object.isMesh || object.isLine || object.isPoints)
          && (object.castShadow || (shadowType === VSMShadowMap && object.receiveShadow)) && drawable(object)) {
        this.stats.candidates++;
        let state;
        for (let i = 0; i < frustums.length; i++) {
          if(skipCascades[i])continue;
          this.stats.frustumTests += object.frustumCulled ? 1 : 0;
          // Preserve custom ecology bounds; never substitute Frustum.intersectsObject.
          if (object.frustumCulled && !(object.intersectsShadowCasterFrustum || object.intersectsFrustum).call(object, frustums[i])) continue;
          if (state === undefined) { // Compute once even when all cascades see it.
            const captureStart = phases ? performance.now() : 0;
            state = this._object(object);
            if (phases) phases.captureMs += performance.now() - captureStart;
          }
          if (this.entryReuse) {
            // Keep entries for resident casters instead of clearing/reallocating
            // two Maps every frame. Signature capture remains exact and live.
            const entries = this._entries[i];
            let entry = entries.get(object);
            if (!entry) { entry = { state, frame: this._frame }; entries.set(object, entry); this.stats.entryCreates++; changed[i] = true; }
            else { if (entry.state !== state) changed[i] = true; entry.state = state; entry.frame = this._frame; }
          } else {
            this._current[i].set(object, state);
            if (this._previous[i].get(object) !== state) changed[i] = true;
          }
        }
      }
      // A layer mismatch does not prune children in WebGLShadowMap.
      for (const child of object.children) visit(child);
    };
    if(skipCascades.length!==this.lights.length || !skipCascades.every(Boolean))visit(this.scene);
    const traversalEnd = phases ? performance.now() : 0;
    if (phases) phases.traversalMs = traversalEnd - lightsEnd - phases.captureMs;
    for (let i = 0; i < frustums.length; i++) {
      // Keep the last captured state. A later cacheable frame compares against
      // that exact state; it may render once extra, but cannot miss a change.
      if(skipCascades[i]){changed[i]=false;continue;}
      if (this.entryReuse) {
        const entries = this._entries[i];
        entries.forEach((entry, object) => { if (entry.frame !== this._frame) { entries.delete(object); changed[i] = true; } });
        if (changed[i]) this.result.revisions[i]++;
        this.result.counts[i] = entries.size;
        continue;
      }
      if (this._previous[i].size !== this._current[i].size) changed[i] = true;
      if (changed[i]) this.result.revisions[i]++;
      this.result.counts[i] = this._current[i].size;
      const previous = this._previous[i]; this._previous[i] = this._current[i]; this._current[i] = previous;
      this._current[i].clear(); // Removed objects are not retained until another frame.
    }
    const end = performance.now();
    if (phases) phases.membershipMs = end - traversalEnd;
    this.stats.frames++; this.stats.lastMs = end - start;
    this.stats.meanMs += (this.stats.lastMs - this.stats.meanMs) / this.stats.frames;
    return this.result;
  }

  dispose() {
    for (const m of [...this._previous, ...this._current, ...this._entries]) m.clear();
    this._objects = new WeakMap(); this._geometries = new WeakMap(); this._materials = new WeakMap(); this._manual = new WeakMap();
    this._attributes = [new WeakMap(), new WeakMap()];
    this._terrainGeometries = new WeakMap(); this._standardDepthFrames = new WeakMap();
    this.scene = null; this.lights.length = 0; this.result.counts.fill(0); this.result.changed.fill(false); this.disposed = true;
  }
}
