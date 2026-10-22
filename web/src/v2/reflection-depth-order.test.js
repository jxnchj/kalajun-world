import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WebGLRenderList } from "three/src/renderers/webgl/WebGLRenderLists.js";
import { ReflectionDepthOrder } from "./reflection-depth-order.js";
import { createWaterReflectionCamera } from "./water-reflection.js";

function fixture(reverse = true) {
  const c = new THREE.PerspectiveCamera(52, 1.78, .25, 150000); c._reversedDepth = reverse;
  c.position.set(2400, 1703, -3600); c.lookAt(2408, 1700, -3610); c.updateProjectionMatrix(); c.updateMatrixWorld();
  const camera = createWaterReflectionCamera(c, new THREE.Plane(new THREE.Vector3(.08, 1, .03).normalize(), 0).setFromNormalAndCoplanarPoint(new THREE.Vector3(.08, 1, .03).normalize(), new THREE.Vector3(2400, 1700, -3600)));
  const r = { opaque: null, setOpaqueSort(fn) { this.opaque = fn; }, setTransparentSort() { throw Error("must not touch transparent list"); } };
  return { camera, r, scene: new THREE.Scene(), order: new ReflectionDepthOrder({enabled:true}) };
}
function mesh(f, depth, material, options = {}) {
  const g = new THREE.BoxGeometry(), m = material || new THREE.MeshStandardMaterial(), o = options.instanced ? new THREE.InstancedMesh(g, m, 1) : new THREE.Mesh(g, m);
  if (options.instanced) { o.setMatrixAt(0, new THREE.Matrix4().makeTranslation(40, 12, 25)); o.computeBoundingSphere(); }
  o.geometry.computeBoundingSphere();
  const center = o.boundingSphere?.center || o.geometry.boundingSphere.center;
  o.position.copy(new THREE.Vector3(0, 0, -depth).applyMatrix4(f.camera.matrixWorld)).sub(center);
  if (options.renderOrder) o.renderOrder = options.renderOrder;
  f.scene.add(o); o.updateMatrixWorld(); return o;
}
function item(f, o, id, groupOrder = 0, variant = 0) {
  const p = new THREE.Vector4().copy(o.boundingSphere?.center || o.geometry?.boundingSphere?.center || new THREE.Vector3()).applyMatrix4(o.matrixWorld)
    .applyMatrix4(f.camera.matrixWorldInverse).applyMatrix4(f.camera.projectionMatrix);
  return { object: o, material: o.material, id, groupOrder, renderOrder: o.renderOrder, materialVariant: variant, z: f.camera.reversedDepth ? -p.z : p.z };
}

test("oblique standard/reversed mirrors sort real instance-bound centers in fourfold view-distance bands", () => {
  for (const reverse of [false, true]) {
    const f = fixture(reverse), distantMaterial = new THREE.MeshStandardMaterial(), nearMaterial = new THREE.MeshStandardMaterial();
    const far = mesh(f, 90, distantMaterial), near = mesh(f, 3, nearMaterial, { instanced: true });
    const list = new WebGLRenderList();
    for (const [i, o] of [far, near].entries()) list.push(o, o.geometry, o.material, 0, item(f, o, i).z * (reverse ? -1 : 1), null, f.camera);
    const projection = f.camera.projectionMatrix.clone();
    f.order.run(f.r, f.scene, f.camera, () => {
      list.sort(f.r.opaque); assert.equal(list.opaque[0].object, near);
      assert.equal(f.order.cache.get(near).bucket, 0); assert.equal(f.order.cache.get(far).bucket, 3);
      assert.equal(f.order.stats.objects, 2);
    });
    assert.equal(f.r.opaque, null); assert.deepEqual(f.camera.projectionMatrix, projection);
  }
});

test("material/variant order stays within a band; explicit order and unknown-bound groups retain default material order", () => {
  const f = fixture(), a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  const far = mesh(f, 30, a), near = mesh(f, 18, b), explicitFar = mesh(f, 100, a, { renderOrder: 2 }), explicitNear = mesh(f, 1, b, { renderOrder: 2 });
  const items = [item(f, near, 1), item(f, far, 2), item(f, explicitNear, 3), item(f, explicitFar, 4)];
  f.order.run(f.r, f.scene, f.camera, () => assert.deepEqual(items.slice().sort(f.r.opaque).map(i => i.id), [2, 1, 4, 3]));
  const group = new THREE.Group(); group.renderOrder = 7; f.scene.add(group);
  const unknown = new THREE.Mesh(new THREE.BufferGeometry(), a); group.add(unknown);
  group.add(far, near); far.position.copy(new THREE.Vector3(0, 0, -90).applyMatrix4(f.camera.matrixWorld)); near.position.copy(new THREE.Vector3(0, 0, -1).applyMatrix4(f.camera.matrixWorld)); f.scene.updateMatrixWorld();
  const known = [item(f, near, 5, 7), item(f, far, 6, 7)];
  f.order.run(f.r, f.scene, f.camera, () => {
    assert.equal(f.order.stats.unknownGroups, 1); assert.deepEqual(known.slice().sort(f.r.opaque).map(i => i.id), [6, 5]);
  });
});

test("all comparator triples remain transitive when unknown/special groups coexist; drawing contains the identical objects", () => {
  const f = fixture(), materials = Array.from({ length: 5 }, () => new THREE.MeshStandardMaterial());
  const objects = Array.from({ length: 45 }, (_, i) => mesh(f, .3 * 1.2 ** i, materials[i % 5], { renderOrder: i % 11 === 0 ? 2 : 0 }));
  const values = objects.map((o, i) => item(f, o, i, 0, i % 3));
  f.order.run(f.r, f.scene, f.camera, () => {
    const cmp = f.r.opaque, sign = x => x === 0 ? 0 : x < 0 ? -1 : 1;
    for (const a of values) for (const b of values) {
      assert.equal(sign(cmp(a, b)), -sign(cmp(b, a)) || 0);
      if (cmp(a, b) <= 0) for (const c of values) if (cmp(b, c) <= 0) assert.ok(cmp(a, c) <= 0);
    }
    assert.deepEqual(new Set(values.slice().sort(cmp).map(v => v.object)), new Set(objects));
  });
});

test("per-capture state refreshes moved bounds; disabled mode and render/preparation failure restore the default sorter", () => {
  const f = fixture(), a = mesh(f, 1), b = mesh(f, 90), items = [item(f, a, 1), item(f, b, 2)];
  f.order.run(f.r, f.scene, f.camera, () => assert.ok(f.r.opaque(...items) < 0));
  a.position.copy(new THREE.Vector3(0, 0, -400).applyMatrix4(f.camera.matrixWorld)); a.updateMatrixWorld();
  f.order.run(f.r, f.scene, f.camera, () => assert.ok(f.r.opaque(...items) > 0));
  assert.throws(() => f.order.run(f.r, f.scene, f.camera, () => { throw Error("capture failure"); }), /capture failure/); assert.equal(f.r.opaque, null);
  f.order.enabled = false; f.order.run(f.r, f.scene, f.camera, () => assert.equal(f.r.opaque, null));
  f.order.enabled = true; a.geometry.boundingSphere = null; a.geometry.computeBoundingSphere = () => { throw Error("bound failure"); };
  assert.throws(() => f.order.run(f.r, f.scene, f.camera, () => {}), /bound failure/); assert.equal(f.r.opaque, null);
});
