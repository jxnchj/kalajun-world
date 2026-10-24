import { DynamicDrawUsage, InstancedMesh, Vector3 } from 'three';

export const FOREST_FLOOR_BLOCK_SIZE = 48;
// Browser A/B has not shown a stable net GPU gain. Keep this candidate opt-in.
export const forestFloorBatchesEnabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get('floorBatches') === '1';

// The five original pools keep every root, capacity and authoritative Float32
// matrix. These draw objects partition that same resident set in fixed world
// blocks. Nothing is selected by the main camera: Three tests each complete
// block separately for the main, reflected and shadow cameras.
export class ForestFloorBatches {
  constructor(group, pools, { bounds, enabled = true, blockSize = FOREST_FLOOR_BLOCK_SIZE } = {}) {
    if (!(blockSize > 0) || !Number.isFinite(blockSize)) throw new RangeError('Invalid forest-floor block size');
    this.group = group; this.pools = pools; this.bounds = bounds; this.blockSize = blockSize;
    this.enabled = false; this.disposed = false; this.batches = new Map(); this.revision = -1;
    this.viewer = new Vector3(); this.boundsViewer = new Vector3(Infinity, Infinity, Infinity);
    this.stats = { enabled: false, blockSize, batches: 0, residentInstances: 0, matrixUploads: 0, boundsRefreshes: 0, instanceMatrixBytes: 0, sourceInstanceMatrixBytes: 0 };
    this.setEnabled(enabled);
  }
  setEnabled(enabled) {
    if (this.disposed) throw new Error('Forest-floor batches have been disposed');
    enabled = !!enabled;
    if (this.enabled === enabled) return this.enabled;
    this.enabled = enabled; this.stats.enabled = enabled;
    for (const pool of this.pools.values()) {
      if (enabled) pool.mesh.removeFromParent(); else this.group.add(pool.mesh);
    }
    for (const batch of this.batches.values()) {
      if (enabled) this.group.add(batch.mesh); else batch.mesh.removeFromParent();
    }
    // Roots may have streamed while this representation was disabled.
    this.revision = -1; this.boundsViewer.set(Infinity, Infinity, Infinity);
    return enabled;
  }
  _create(kind, key, pool, required) {
    // A block can never contain more roots than its unchanged source capacity.
    const capacity = Math.min(pool.mesh.instanceMatrix.count, Math.max(8, 2 ** Math.ceil(Math.log2(required))));
    const source = pool.mesh, mesh = new InstancedMesh(source.geometry, source.material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.count = 0;
    mesh.customDepthMaterial = source.customDepthMaterial; mesh.customDistanceMaterial = source.customDistanceMaterial;
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow; mesh.frustumCulled = true;
    mesh.layers.mask = source.layers.mask; mesh.renderOrder = source.renderOrder;
    mesh.name = 'forest-floor/' + kind + '/' + key;
    mesh.userData.forestFloorBlock = { kind, key, size: this.blockSize };
    // All authoritative matrices are world-local to this unchanged parent.
    // The original pool's identity transform remains identical on each block.
    source.updateMatrix(); mesh.matrix.copy(source.matrix); mesh.matrixAutoUpdate = false;
    const batch = { kind, key, pool, mesh, records: [], boundsDirty: true };
    this.group.add(mesh); return batch;
  }
  _release(batch) {
    batch.mesh.removeFromParent();
    // InstancedMesh.dispose releases its own instance buffer/VAO, not the
    // borrowed geometry, material or authored wind/depth shader resources.
    batch.mesh.dispose();
  }
  _sync() {
    const wanted = new Map();
    for (const [kind, pool] of this.pools) for (const root of pool.records) {
      const key = kind + ':' + Math.floor(root.x / this.blockSize) + ',' + Math.floor(root.z / this.blockSize);
      if (!wanted.has(key)) wanted.set(key, { kind, pool, records: [] });
      wanted.get(key).records.push(root);
    }
    for (const [key, batch] of this.batches) if (!wanted.has(key)) {
      this._release(batch); this.batches.delete(key);
    }
    for (const [key, next] of wanted) {
      let batch = this.batches.get(key);
      if (batch && batch.mesh.instanceMatrix.count < next.records.length) {
        this._release(batch); this.batches.delete(key); batch = null;
      }
      if (!batch) { batch = this._create(next.kind, key, next.pool, next.records.length); this.batches.set(key, batch); }
      if (batch.records.length === next.records.length && batch.records.every((root, i) => root === next.records[i])) continue;
      // Copy source bytes rather than recomputing transforms. Rebatching cannot
      // alter world coordinates, wind phases, normals, scale or root identity.
      const source = next.pool.mesh.instanceMatrix.array, target = batch.mesh.instanceMatrix.array;
      for (let i = 0; i < next.records.length; i++) {
        const slot = next.records[i].slot;
        target.set(source.subarray(slot * 16, slot * 16 + 16), i * 16);
      }
      batch.records = next.records; batch.mesh.count = next.records.length;
      batch.mesh.instanceMatrix.needsUpdate = true; batch.boundsDirty = true; this.stats.matrixUploads++;
    }
    this.stats.batches = this.batches.size;
    this.stats.residentInstances = [...this.pools.values()].reduce((n, pool) => n + pool.records.length, 0);
    this.stats.instanceMatrixBytes = [...this.batches.values()].reduce((n, batch) => n + batch.mesh.instanceMatrix.array.byteLength, 0);
    this.stats.sourceInstanceMatrixBytes = [...this.pools.values()].reduce((n, pool) => n + pool.mesh.instanceMatrix.array.byteLength, 0);
  }
  update(viewer, revision) {
    if (this.disposed) return;
    this.viewer.copy(viewer);
    if (!this.enabled) return;
    if (this.revision !== revision) { this._sync(); this.revision = revision; }
    const moved = viewer.x !== this.boundsViewer.x || viewer.z !== this.boundsViewer.z;
    for (const batch of this.batches.values()) {
      if (!moved && !batch.boundsDirty) continue;
      if (this.bounds) this.bounds(batch.mesh, batch.records, viewer, batch.pool.range, 18);
      else { batch.mesh.computeBoundingSphere(); if (batch.mesh.boundingSphere) batch.mesh.boundingSphere.radius += 1; }
      batch.boundsDirty = false; this.stats.boundsRefreshes++;
    }
    this.boundsViewer.copy(viewer);
  }
  dispose() {
    if (this.disposed) return;
    for (const batch of this.batches.values()) this._release(batch);
    this.batches.clear(); this.disposed = true; this.stats.batches = 0; this.stats.instanceMatrixBytes = 0;
  }
}
