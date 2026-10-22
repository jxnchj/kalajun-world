import { InterleavedBuffer, InterleavedBufferAttribute, StaticDrawUsage } from "three";

const FIELDS = ["position", "normal", "uv", "aPlantWind", "aCrownOcclusion", "aSprayLod"];
// Opt-in until whole-frame GPU A/B has demonstrated a benefit. Packing happens
// only after authoring/cache capture, on the private render geometry container.
export const treeVertexLayoutEnabled = () => new URLSearchParams(globalThis.location?.search || "").get("treeVertexLayout") === "interleaved";

export function interleaveTreeVertices(geometry) {
  if (geometry.userData.treeVertexLayout) return geometry.userData.treeVertexLayout;
  if (Object.keys(geometry.morphAttributes).length) throw new Error("Tree layout does not support morph attributes");
  const count = geometry.attributes.position?.count;
  if (!Number.isInteger(count) || count < 1) throw new Error("Tree layout requires vertices");
  const fields = FIELDS.filter(name => geometry.hasAttribute(name)).map(name => [name, geometry.attributes[name]]);
  for (const [name, a] of fields) {
    if (a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || !(a.array instanceof Float32Array)
      || a.count !== count || a.usage !== StaticDrawUsage || a.normalized)
      throw new Error("Unsupported static tree attribute: " + name);
  }
  const stride = fields.reduce((sum, [, a]) => sum + a.itemSize, 0);
  // Copy Uint32 bits, not converted floats: signed zero and NaN payloads also
  // survive. Vertex/index order, triangle corners and interpolation are unchanged.
  const bits = new Uint32Array(count * stride), buffer = new InterleavedBuffer(new Float32Array(bits.buffer), stride);
  let offset = 0;
  for (const [name, a] of fields) {
    const src = new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length);
    for (let vertex = 0; vertex < count; vertex++) for (let k = 0; k < a.itemSize; k++) bits[vertex * stride + offset + k] = src[vertex * a.itemSize + k];
    const view = new InterleavedBufferAttribute(buffer, a.itemSize, offset, a.normalized);
    view.name = a.name; geometry.setAttribute(name, view); offset += a.itemSize;
  }
  return geometry.userData.treeVertexLayout = { layout: "interleaved-float32-v1", vertices: count, strideBytes: stride * 4,
    bytes: bits.byteLength, beforeBuffers: fields.length, afterBuffers: 1 };
}
