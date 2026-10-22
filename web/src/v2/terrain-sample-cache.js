// Bounded exact-coordinate cache for the immutable terrain source. Hash collisions
// only cause recomputation: x/z are checked exactly, never rounded into a sample.
export class TerrainSampleCache {
  constructor(heightAt, { entries = 262144, coordinateScale = 1, attributeComponents = 12 } = {}) {
    const requested = Math.max(0, Math.floor(entries));
    this.capacity = requested ? 2 ** Math.ceil(Math.log2(requested)) : 0;
    if (this.capacity > 1048576) throw new RangeError("Terrain sample cache exceeds its bounded allocation.");
    this.heightAt = heightAt; this.scale = coordinateScale; this.mask = this.capacity - 1;
    this.coordinates = new Float64Array(this.capacity * 2);
    this.heights = new Float64Array(this.capacity);
    if(!Number.isInteger(attributeComponents)||attributeComponents<0||attributeComponents>32)throw new RangeError("Invalid terrain vertex attribute layout.");
    this.attributeComponents=attributeComponents;
    this.attributes = new Float32Array(this.capacity * attributeComponents);
    this.states = new Uint8Array(this.capacity); // 0 empty; 1 height; 2 complete vertex
    this.stats = { entries: this.capacity, bytes: this.coordinates.byteLength + this.heights.byteLength + this.attributes.byteLength + this.states.byteLength,
      heightHits: 0, heightMisses: 0, vertexHits: 0, vertexMisses: 0 };
  }
  locate(x, z) {
    if (!this.capacity) return -1;
    let h = Math.imul(Math.round(x * this.scale), 374761393) ^ Math.imul(Math.round(z * this.scale), 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    const slot = h & this.mask, i = slot * 2;
    if (this.states[slot] && this.coordinates[i] === x && this.coordinates[i + 1] === z) return slot;
    this.coordinates[i] = x; this.coordinates[i + 1] = z; this.states[slot] = 0;
    return slot;
  }
  height(slot, x, z) {
    if (slot >= 0 && this.states[slot]) { this.stats.heightHits++; return this.heights[slot]; }
    this.stats.heightMisses++;
    const y = this.heightAt(x, z);
    if (slot >= 0) { this.heights[slot] = y; this.states[slot] = 1; }
    return y;
  }
  heightAtPoint(x, z) { return this.height(this.locate(x, z), x, z); }
  dispose() {
    this.capacity = 0; this.mask = -1;
    this.coordinates = new Float64Array(0); this.heights = new Float64Array(0);
    this.attributes = new Float32Array(0); this.states = new Uint8Array(0);
    this.stats.entries = 0; this.stats.bytes = 0; this.heightAt = null;
  }
}
