// Fixed-capacity work buffers remove per-frame lists and comma-joined strings.
// These hold exactly the original instance indices; all visibility/LOD tests
// still run every frame, including mutable bounds and hysteresis.
export function createStructureSelection(capacity, initiallyFull = false) {
  const indices = new Uint32Array(capacity), previous = new Uint32Array(capacity);
  if (initiallyFull) for (let i = 0; i < capacity; i++) previous[i] = i;
  return { indices, previous, count: 0, previousCount: initiallyFull ? capacity : 0 };
}
export function commitStructureSelection(buffer) {
  let changed = buffer.count !== buffer.previousCount;
  for (let i = 0; i < buffer.count && !changed; i++) changed = buffer.indices[i] !== buffer.previous[i];
  if (!changed) return null;
  buffer.previous.set(buffer.indices.subarray(0, buffer.count));
  buffer.previousCount = buffer.count;
  return buffer.indices.subarray(0, buffer.count).join(',');
}
