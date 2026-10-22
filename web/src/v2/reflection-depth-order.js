import { Vector3 } from "three";

const groupKey = (groupOrder, renderOrder) => groupOrder + ":" + renderOrder;
function defaultOrder(a, b) {
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
  const az = Number.isFinite(a.z) ? a.z : 0, bz = Number.isFinite(b.z) ? b.z : 0;
  return az !== bz ? az - bz : a.id - b.id;
}

// Reflection uses an oblique clip row, so renderItem.z cannot be decoded as
// view depth. Use the same world-space bounds center as Three's render list,
// transformed by the actual mirror view matrix; never its oblique projection.
// Measured forest-creek A/B found no GPU gain; keep opt-in until another
// representative scene proves a benefit. Default rendering avoids this scan.
export class ReflectionDepthOrder {
  constructor({ enabled = new URLSearchParams(globalThis.location?.search || "").get("reflectionDepthOrder") === "1" } = {}) {
    this.enabled = enabled; this.cache = new WeakMap(); this.epoch = 0;
    this.blockedGroups = new Set(); this.position = new Vector3();
    this.stats = { enabled, active: false, objects: 0, unknownGroups: 0, bucketsPerOctave: .5 };
    this.compare = (a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
      if (a.renderOrder === 0 && !this.blockedGroups.has(groupKey(a.groupOrder, a.renderOrder))) {
        const aa = this.cache.get(a.object), bb = this.cache.get(b.object);
        // Unknown/mutated objects are not assigned fabricated distances.
        // _prepare blocks their entire order group before sorting starts.
        if (aa?.epoch === this.epoch && bb?.epoch === this.epoch && aa.bucket !== bb.bucket) return aa.bucket - bb.bucket;
      }
      return defaultOrder(a, b);
    };
  }

  _prepare(scene, camera) {
    this.epoch++; this.blockedGroups.clear(); this.stats.objects = 0;
    const visit = (object, inheritedOrder) => {
      if (object.visible === false) return;
      const groupOrder = object.isGroup ? object.renderOrder : inheritedOrder;
      if (object.layers.test(camera.layers) && (object.isMesh || object.isLine || object.isPoints || object.isSprite)) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (object.renderOrder === 0 && materials.some(m => m?.visible && !m.transparent && !(m.transmission > 0))) {
          let sphere;
          if (object.boundingSphere !== undefined) {
            if (object.boundingSphere === null) object.computeBoundingSphere?.();
            sphere = object.boundingSphere;
          } else if (object.geometry?.attributes.position) {
            if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
            sphere = object.geometry.boundingSphere;
          }
          let depth = NaN;
          if (sphere && Number.isFinite(sphere.radius) && sphere.radius >= 0) {
            this.position.copy(sphere.center).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
            depth = -this.position.z;
          }
          if (Number.isFinite(depth)) {
            const bucket = Math.floor(Math.log2(Math.max(camera.near, depth)) * .5);
            const cached = this.cache.get(object);
            if (cached) { cached.epoch = this.epoch; cached.bucket = bucket; }
            else this.cache.set(object, { epoch: this.epoch, bucket });
            this.stats.objects++;
          } else this.blockedGroups.add(groupKey(groupOrder, object.renderOrder));
        }
      }
      for (const child of object.children) visit(child, groupOrder);
    };
    visit(scene, 0); this.stats.unknownGroups = this.blockedGroups.size;
  }

  run(renderer, scene, camera, draw) {
    const active = this.enabled && camera.isPerspectiveCamera && Number.isFinite(camera.near) && camera.near > 0
      && typeof renderer.setOpaqueSort === "function";
    Object.assign(this.stats, { enabled: this.enabled, active, objects: 0, unknownGroups: 0 });
    // This world owns the sorter. Reflection runs only after the main scoped
    // OpaqueDepthOrder has restored null. Transparent/transmissive lists stay
    // under Three's existing order. Restore even if preparation or render throws.
    if (typeof renderer.setOpaqueSort !== "function") return draw();
    try {
      if (active) this._prepare(scene, camera);
      renderer.setOpaqueSort(active ? this.compare : null);
      return draw();
    } finally { renderer.setOpaqueSort(null); }
  }
}
