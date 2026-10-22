// Retain CPU arrays for revisits; callers dispose GPU resources on release.
// The byte ceiling includes every geometry array plus exact source samples.
export class TerrainTileCache {
  constructor(maxBytes = 64 * 1024 * 1024) {
    this.maxBytes = Math.max(0, Number.isFinite(maxBytes) ? maxBytes : 0);
    this.items = new Map();
    this.stats = { bytes: 0, maxBytes: this.maxBytes, tiles: 0, hits: 0, misses: 0, evictions: 0 };
  }
  take(key) {
    const item = this.items.get(key);
    if (!item) { this.stats.misses++; return null; }
    this.items.delete(key); this.stats.bytes -= item.bytes; this.stats.tiles = this.items.size; this.stats.hits++;
    return item;
  }
  put(key, payload) {
    const arrays = [payload.heights, payload.centers, payload.geometry.index?.array,
      ...Object.values(payload.geometry.attributes).map(a => a.array),
      ...Object.values(payload.geometry.morphAttributes).flat().map(a => a.array)];
    const buffers = new Set(); let bytes = 0;
    for (const array of arrays) if (array && !buffers.has(array.buffer)) { buffers.add(array.buffer); bytes += array.buffer.byteLength; }
    if (bytes > this.maxBytes) return;
    const previous = this.items.get(key);
    if (previous) { this.stats.bytes -= previous.bytes; this.items.delete(key); }
    while (this.stats.bytes + bytes > this.maxBytes && this.items.size) {
      const oldest = this.items.keys().next().value, item = this.items.get(oldest);
      this.items.delete(oldest); this.stats.bytes -= item.bytes; this.stats.evictions++;
    }
    this.items.set(key, { ...payload, bytes }); this.stats.bytes += bytes; this.stats.tiles = this.items.size;
  }
  dispose() { this.items.clear(); this.stats.bytes = 0; this.stats.tiles = 0; }
}
