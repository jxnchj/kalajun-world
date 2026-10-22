import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SunShadowReceiverCulling, sunReceiverHalfspaces, sunReceiverFilterMargin, boxMayReachSunReceivers, csmReceiverDepthRanges, sunReceiverDepthHalfspaces, sunReceiverProjectionHalfspaces } from "./sun-shadow-receivers.js";
import { CSMShader } from "three/addons/csm/CSMShader.js";
import { SunShadowCasters } from "./sun-shadow-casters.js";
import { createWaterReflectionCamera } from "./water-reflection.js";

function camera(reverse = true) {
  const c = new THREE.PerspectiveCamera(52, 1.78, .25, 150000);
  c._reversedDepth = reverse; c.updateProjectionMatrix(); c.updateMatrixWorld(); return c;
}
const smallBox = (p, size = .001) => new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(size, size, size));
const frustum = c => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem, c.reversedDepth);
function light() {
  const l = new THREE.DirectionalLight(); l.position.set(0, 300, 0); l.target.position.set(0, 0, 0);
  Object.assign(l.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1000 });
  l.shadow.mapSize.set(2048, 2048); l.shadow.radius = 2; l.shadow.normalBias = .04; l.shadow.bias = -.000002;
  l.shadow.camera.updateProjectionMatrix(); l.updateMatrixWorld(); l.target.updateMatrixWorld(); l.shadow.updateMatrices(l); return l;
}

test("camera receiver extrusion retains arbitrarily lightward casters for front/back/sidelit views and both depth conventions", () => {
  let checked = 0;
  for (const reverse of [false, true]) for (const yaw of [0, 31, 90, 150, 299.5, 344]) {
    const c = camera(reverse); c.position.set(-3000, 1915, 4900);
    c.rotation.set(-.17, yaw * Math.PI / 180, 0, "YXZ"); c.updateMatrixWorld();
    for (const direction of [[0, 1, 0], [1, .04, 0], [-1, .7, 1], [0, .3, -1]]) {
      const sun = new THREE.Vector3(...direction).normalize(), domains = [sunReceiverHalfspaces(c, sun)];
      for (const x of [-.999, 0, .999]) for (const y of [-.999, 0, .999]) for (const depth of [1, 30, 600, 140000]) {
        const r = new THREE.Vector3(x * depth * Math.tan(c.fov * Math.PI / 360) * c.aspect, y * depth * Math.tan(c.fov * Math.PI / 360), -depth).applyMatrix4(c.matrixWorld);
        assert.ok(frustum(c).containsPoint(r));
        for (const distance of [0, .1, 100, 10000, 1e7]) {
          const caster = r.clone().addScaledVector(sun, distance);
          assert.equal(boxMayReachSunReceivers(smallBox(caster), domains, .02), true);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 8640);
});

test("oblique mirror-only receivers survive the union even when excluded by the main receiver domain", () => {
  for (const reverse of [false, true]) {
    const c = camera(reverse); c.position.set(0, 2, 8); c.lookAt(0, 0, 0); c.updateMatrixWorld();
    const mirror = createWaterReflectionCamera(c, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const sun = new THREE.Vector3(0, .15, -1).normalize(), main = sunReceiverHalfspaces(c, sun), reflected = sunReceiverHalfspaces(mirror, sun);
    const mf = frustum(mirror); let exclusive = 0;
    for (let x = -100; x <= 100; x += 5) for (let y = 0; y <= 100; y += 5) for (let z = -150; z <= 0; z += 10) {
      const receiver = new THREE.Vector3(x, y, z), b = smallBox(receiver);
      if (!mf.containsPoint(receiver) || boxMayReachSunReceivers(b, [main])) continue;
      exclusive++; assert.equal(boxMayReachSunReceivers(b, [main, reflected]), true);
      assert.equal(boxMayReachSunReceivers(smallBox(receiver.addScaledVector(sun, 5000)), [main, reflected]), true);
    }
    assert.ok(exclusive > 0, "mirror test must exercise geometry that the main domain would reject");
  }
});

test("filter margin covers rotated PCF footprint, bilinear taps, normal and depth bias at domain edges", () => {
  const l = light(), s = l.shadow, margin = sunReceiverFilterMargin(s);
  const domain = [[new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)]];
  const texel = 400 / 2048, maximum = s.radius * texel + Math.SQRT2 * texel + s.normalBias + Math.abs(s.bias) * 999;
  assert.ok(margin >= maximum + .019999);
  assert.equal(boxMayReachSunReceivers(smallBox(new THREE.Vector3(-maximum, 0, 0)), domain, margin), true);
  assert.equal(boxMayReachSunReceivers(smallBox(new THREE.Vector3(-margin - .01, 0, 0)), domain, margin), false);
  assert.equal(boxMayReachSunReceivers(new THREE.Box3(new THREE.Vector3(-Infinity, 0, 0), new THREE.Vector3(0, Infinity, 0)), domain, margin), true);
});

test("installed Three shadow frustum and caster tracker share one predicate; color/sphere paths and unknown geometry remain untouched", () => {
  const scene = new THREE.Scene(), c = camera(), l = light(); scene.add(l, l.target);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  mesh.position.set(0, 0, 80); mesh.castShadow = true;
  const box = new THREE.Box3(); mesh.geometry.computeBoundingBox();
  mesh.intersectsFrustum = function(f) { return f.intersectsBox(box.copy(this.geometry.boundingBox).applyMatrix4(this.matrixWorld)); };
  scene.add(mesh); scene.updateMatrixWorld(true); const f = l.shadow.getFrustum(), color = frustum(c), sun = new THREE.Vector3(0, 1, 0);
  const original = f.intersectsBox, sphereMethod = f.intersectsSphere, colorMethod = color.intersectsBox;
  assert.equal(mesh.intersectsFrustum(f), true);
  const filter = new SunShadowReceiverCulling([l]), tracker = new SunShadowCasters(scene, [l]);
  filter.update(c, sun); assert.equal(mesh.intersectsFrustum(f), false);
  assert.deepEqual([...tracker.update(c).counts], [0]);
  assert.strictEqual(f.intersectsSphere, sphereMethod); assert.strictEqual(color.intersectsBox, colorMethod);
  const sphere = new THREE.Sphere(mesh.position.clone(), 2); assert.equal(f.intersectsSphere(sphere), true);
  assert.equal(f.intersectsObject(mesh), true, "ordinary object/sphere path stays conservative");
  filter.enabled = false; filter.update(c, sun); assert.equal(mesh.intersectsFrustum(f), true);
  assert.deepEqual([...tracker.update(c).counts], [1]); assert.deepEqual([...tracker.result.changed], [true]);
  filter.enabled = true; filter.update(c, sun); assert.deepEqual([...tracker.update(c).counts], [0]);
  filter.update(c, sun, { shadowType: THREE.VSMShadowMap }); assert.equal(mesh.intersectsFrustum(f), true);
  filter.update(c, new THREE.Vector3()); assert.equal(mesh.intersectsFrustum(f), true);
  filter.dispose(); filter.dispose(); assert.strictEqual(f.intersectsBox, original); tracker.dispose();
  mesh.geometry.dispose(); mesh.material.dispose();
});

test("new camera/sun and mirror changes widen/restrict only subsequent shadow predicates without mutating matrices or ownership", () => {
  const l = light(), c = camera(), filter = new SunShadowReceiverCulling([l]);
  const mainProjection = c.projectionMatrix.clone(), lightProjection = l.shadow.camera.projectionMatrix.clone();
  const b = smallBox(new THREE.Vector3(0, 0, 80)), f = l.shadow.getFrustum();
  filter.update(c, new THREE.Vector3(0, 1, 0)); assert.equal(f.intersectsBox(b), false);
  c.rotation.y = Math.PI; c.updateMatrixWorld(); filter.update(c, new THREE.Vector3(0, 1, 0)); assert.equal(f.intersectsBox(b), true);
  assert.deepEqual(c.projectionMatrix, mainProjection); assert.deepEqual(l.shadow.camera.projectionMatrix, lightProjection);
  assert.equal(c.far, 150000); assert.equal(l.shadow.mapSize.x, 2048); assert.equal(l.shadow.radius, 2);
  filter.dispose();
});


const csmOptions = () => ({ breaks: [.12, .36, 1], maxFar: 500, fade: true });
const mainDepth = (point, c) => -point.clone().applyMatrix4(c.matrixWorldInverse).z;

test("cascade ranges contain the installed CSMShader fade support and use its exact main depth denominator", () => {
  const c = camera(), csm = csmOptions(), span = 500 - c.near;
  const ranges = csmReceiverDepthRanges(c, csm);
  assert.deepEqual(ranges, [[0, (.12 + .12 ** 2 / 8) * span],
    [(.12 - .12 ** 2 / 8) * span, (.36 + .36 ** 2 / 8) * span], [(.36 - .36 ** 2 / 8) * span, Infinity]]);
  // Execute the installed shader's edge arithmetic, rather than duplicating
  // the expected fade formula as the sole oracle in this test.
  const shader = CSMShader.lights_fragment_begin;
  assert.match(shader, /linearDepth = \(vViewPosition.z\) \/ \(shadowFar - cameraNear\)/);
  const arithmetic = shader.slice(shader.indexOf("cascadeCenter ="), shader.indexOf("if( linearDepth >= csmx"));
  const edges = new Function("cascade", "linearDepth", "pow", "let cascadeCenter, closestEdge, margin, csmx, csmy;" + arithmetic + ";return {csmx,csmy};");
  for (let i = 0; i < 3; i++) {
    const cascade = { x: csm.breaks[i - 1] || 0, y: csm.breaks[i] };
    for (let step = 0; step <= 4000; step++) {
      const depth = step / 3000, { csmx, csmy } = edges(cascade, depth, Math.pow);
      if (depth >= csmx && (depth < csmy || i === 2)) {
        assert.ok(depth * span >= ranges[i][0] - 1e-9);
        assert.ok(depth * span <= ranges[i][1] + 1e-9);
      }
    }
  }
  csm.fade = false; assert.deepEqual(csmReceiverDepthRanges(c, csm), [[0, .12 * span], [.12 * span, .36 * span], [.36 * span, Infinity]]);
  c.far = 300; assert.equal(csmReceiverDepthRanges(c, csm)[0][1], .12 * (300 - c.near));
});

test("random main and oblique mirror receivers keep every lightward caster inside their MAIN-depth cascade slab", () => {
  let seed = 71829, checked = 0, mirrorDifferentDepth = 0, mirrorExclusive = 0;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (const reverse of [false, true]) {
    const c = camera(reverse); c.position.set(-2100, 36, 4700); c.lookAt(-2100, 0, 4580); c.updateMatrixWorld();
    const mirror = createWaterReflectionCamera(c, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    assert.ok(mirror); const ranges = csmReceiverDepthRanges(c, csmOptions());
    for (const direction of [[0, 1, 0], [1, .08, -1], [-1, .6, 1], [0, .05, -1], [1, 1e-12, -1e-9]]) {
      const sun = new THREE.Vector3(...direction).normalize();
      const domains = [c, mirror].map(view => sunReceiverHalfspaces(view, sun));
      const byCascade = ranges.map(range => { const slab = sunReceiverDepthHalfspaces(c, sun, range); return domains.map(domain => [...domain, ...slab]); });
      const projected = ranges.map(range => [c, mirror].map(view => sunReceiverProjectionHalfspaces(view, c, sun, range)));
      for (const domains of projected) for (const planes of domains) {
        assert.ok(planes?.length); for (const plane of planes) assert.ok(plane.normal.dot(sun) >= 0, "every support plane must remain lightward-safe at arbitrary t");
      }
      for (const view of [c, mirror]) for (let k = 0; k < 750; k++) {
        const depth = 2 + random() * 950, v = new THREE.Vector3((random() * 1.98 - .99) * depth * Math.tan(c.fov * Math.PI / 360) * c.aspect,
          (random() * 1.98 - .99) * depth * Math.tan(c.fov * Math.PI / 360), -depth).applyMatrix4(view.matrixWorld);
        if (!frustum(view).containsPoint(v)) continue;
        const d = mainDepth(v, c);
        for (let i = 0; i < ranges.length; i++) {
          if (d < ranges[i][0] || d > ranges[i][1]) continue;
          if (view === mirror && Math.abs(mainDepth(v, mirror) - d) > 1) mirrorDifferentDepth++;
          if (view === mirror && !boxMayReachSunReceivers(smallBox(v), [domains[0]])) mirrorExclusive++;
          for (const distance of [0, random() * 1000, 1e7, 1e14]) {
            const caster = smallBox(v.clone().addScaledVector(sun, distance));
            assert.equal(boxMayReachSunReceivers(caster, byCascade[i], .02), true);
            assert.equal(boxMayReachSunReceivers(caster, projected[i], .02), true, "nonnegative elimination keeps main and mirror receivers even at extreme extrusion distances");
            checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 15000); assert.ok(mirrorDifferentDepth > 1000); assert.ok(mirrorExclusive > 0);
});

test("cascade slab filter margin protects fade edges and never limits the discarded lightward side", () => {
  const c = camera(), ranges = csmReceiverDepthRanges(c, csmOptions()), margin = sunReceiverFilterMargin(light().shadow);
  for (const [sunZ, depth, sign] of [[-1, ranges[1][0], -1], [1, ranges[0][1], 1]]) {
    const sun = new THREE.Vector3(0, 0, sunZ), slabs = sunReceiverDepthHalfspaces(c, sun, sunZ < 0 ? ranges[1] : ranges[0]);
    assert.equal(slabs.length, 1);
    const boundary = new THREE.Vector3(0, 0, -(depth + sign * margin * .99));
    assert.equal(boxMayReachSunReceivers(smallBox(boundary), [slabs], margin), true);
    const outside = new THREE.Vector3(0, 0, -(depth + sign * (margin + .1)));
    assert.equal(boxMayReachSunReceivers(smallBox(outside), [slabs], margin), false);
    assert.equal(boxMayReachSunReceivers(smallBox(boundary.addScaledVector(sun, 1e8)), [slabs], margin), true);
  }
  assert.deepEqual(sunReceiverDepthHalfspaces(c, new THREE.Vector3(1, 0, 0), ranges[1]), [], "parallel slab planes are omitted conservatively");
});

test("opt-in cascade wrapper adds useful rejection but preserves baseline, unknown CSM and all off paths", () => {
  const lights = [light(), light(), light()], c = camera(), csm = csmOptions(), sun = new THREE.Vector3(0, 0, 1);
  const filter = new SunShadowReceiverCulling(lights, { csm, cascadeReceiverCull: false, tightProjection: false });
  const b = smallBox(new THREE.Vector3(0, 0, -120)), f = lights[0].shadow.getFrustum();
  try {
    const projections = lights.map(l => l.shadow.camera.projectionMatrix.clone());
    filter.update(c, sun); const baseline = filter.domains;
    assert.equal(f.intersectsBox(b), true); assert.equal(filter.stats.cascadeActive, false);
    filter.cascadeReceiverCull = true; filter.update(c, sun);
    assert.equal(filter.stats.cascadeActive, true); assert.deepEqual(filter.domains, baseline, "original receiver domain is unchanged");
    assert.equal(f.intersectsBox(b), false); assert.equal(lights[1].shadow.getFrustum().intersectsBox(b), true);
    assert.equal(filter.stats.cascades[0].culled, 1); assert.equal(filter.stats.cascades[2].depthRange[1], Infinity);
    const original = csm.breaks;
    for (const invalid of [null, { ...csm, breaks: [.3, .2, 1] }, { ...csm, breaks: [.12, 1] }, { ...csm, maxFar: NaN }]) {
      filter.csm = invalid; filter.update(c, sun); assert.equal(filter.stats.cascadeActive, false); assert.equal(f.intersectsBox(b), true);
    }
    filter.csm = csm; csm.breaks = [.4, .7, 1]; filter.update(c, sun); assert.equal(f.intersectsBox(b), true, "public break changes apply on next update"); csm.breaks = original;
    filter.enabled = false; filter.update(c, sun); assert.equal(filter.stats.cascadeActive, false); assert.equal(f.intersectsBox(b), true);
    filter.enabled = true; filter.update(c, sun, { shadowType: THREE.VSMShadowMap }); assert.equal(filter.stats.cascadeActive, false); assert.equal(f.intersectsBox(b), true);
    filter.update(c, new THREE.Vector3()); assert.equal(filter.stats.cascadeActive, false); assert.equal(f.intersectsBox(b), true);
    assert.deepEqual(lights.map(l => l.shadow.camera.projectionMatrix), projections);
  } finally { filter.dispose(); }
});


test("light-axis elimination excludes foreground casters that the noon far-cascade slab cannot reject", () => {
  const c = camera(); c.position.set(0, 2, 0);
  const forward = new THREE.Vector3(-.36663, -.17365, -.91402).normalize(), sun = new THREE.Vector3(.03205, .91793, .39545).normalize();
  c.lookAt(c.position.clone().add(forward)); c.updateMatrixWorld();
  const range = csmReceiverDepthRanges(c, csmOptions())[2], slab = [...sunReceiverHalfspaces(c, sun), ...sunReceiverDepthHalfspaces(c, sun, range)];
  const tight = sunReceiverProjectionHalfspaces(c, c, sun, range);
  assert.ok(forward.dot(sun) < -.53); assert.ok(tight.length > slab.length);
  for (const distance of [5, 15, 30, 60, 100]) {
    const b = smallBox(c.position.clone().addScaledVector(forward, distance), 1);
    assert.equal(boxMayReachSunReceivers(b, [slab], .8), true);
    assert.equal(boxMayReachSunReceivers(b, [tight], .8), false);
  }
  const receiver = c.position.clone().addScaledVector(forward, 200);
  for (const distance of [0, 1, 100, 1e5, 1e12, 1e15]) assert.equal(boxMayReachSunReceivers(smallBox(receiver.clone().addScaledVector(sun, distance)), [tight], .02), true);
});

test("projection cache follows exact view, main-depth, sun and ranges while equivalent mirror objects reuse it", () => {
  const lights = [light(), light(), light()], c = camera(), csm = csmOptions(), sun = new THREE.Vector3(.03, .92, .39).normalize();
  c.position.set(0, 2, 8); c.lookAt(0, 0, 0); c.updateMatrixWorld();
  const mirror = createWaterReflectionCamera(c, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const filter = new SunShadowReceiverCulling(lights, { csm, cascadeReceiverCull: true, tightProjection: true });
  const update = additional => filter.update(c, sun, { additionalCameras: [additional || mirror] });
  try {
    update(); assert.equal(filter.stats.projectionActive, true); assert.equal(filter.stats.projectionBuilds, 6);
    const planes = filter.cascadeDomains[0][0], equivalent = mirror.clone(); equivalent._reversedDepth = mirror.reversedDepth; update(); update(equivalent);
    assert.equal(filter.stats.projectionBuilds, 6); assert.strictEqual(filter.cascadeDomains[0][0], planes);
    c.position.z += .001; c.updateMatrixWorld(); update(); assert.equal(filter.stats.projectionBuilds, 12, "main depth changes must also invalidate mirror slabs");
    mirror.projectionMatrix.elements[0] += 1e-8; update(); assert.equal(filter.stats.projectionBuilds, 15, "only mirror camera projection changed");
    sun.x += 1e-6; sun.normalize(); update(); assert.equal(filter.stats.projectionBuilds, 21);
    csm.fade = false; update(); assert.equal(filter.stats.projectionBuilds, 27);
    csm.maxFar = 450; update(); assert.equal(filter.stats.projectionBuilds, 33);
    filter.tightProjection = false; update(); assert.equal(filter.stats.projectionActive, false); assert.equal(filter.stats.projectionBuilds, 33);
    filter.tightProjection = true; update(); assert.equal(filter.stats.projectionActive, true); assert.equal(filter.stats.projectionBuilds, 33);
    filter.cascadeReceiverCull = false; update(); assert.equal(filter.stats.projectionActive, false); assert.equal(filter.projectionCache.length, 0);
    filter.cascadeReceiverCull = true; update(); assert.equal(filter.stats.projectionBuilds, 39);
    filter.update(c, sun); assert.equal(filter.projectionCache[0].length, 1, "removed mirror slots cannot accumulate");
  } finally { filter.dispose(); assert.equal(filter.projectionCache.length, 0); }
});


test("published box predicate revision tracks exact effective receiver domains and margin without depending on stats",()=>{
 const lights=[light(),light(),light()],c=camera(),sun=new THREE.Vector3(.03,.92,.39).normalize(),csm=csmOptions();
 const filter=new SunShadowReceiverCulling(lights,{csm,cascadeReceiverCull:true,tightProjection:true});
 try{
  filter.update(c,sun);const state=lights[0].shadow.getFrustum().intersectsBox.treeViewCullState,first=state.revision;
  assert.strictEqual(state.original,THREE.Frustum.prototype.intersectsBox);
  filter.update(c,sun);assert.equal(state.revision,first,"new domain arrays with identical coefficients retain identity");
  filter.stats.tests=0;filter.stats.culled=0;filter.update(c,sun);assert.equal(state.revision,first);
  lights[0].shadow.normalBias+=.000001;filter.update(c,sun);assert.equal(state.revision,first+1);
  for(const part of["x","y","z","constant"]){
   const previous=state.revision,plane=filter.cascadeDomains[0][0][0];
   if(part==="constant")plane.constant+=1e-10;else plane.normal[part]+=1e-10;
   filter._updateCullStates();assert.equal(state.revision,previous+1,"each exact coefficient participates in the owner publication");
  }
  const previous=state.revision;filter.enabled=false;filter.update(c,sun);assert.equal(state.revision,previous+1);
  lights[0].shadow.normalBias+=.01;filter.update(c,sun);assert.equal(state.revision,previous+1,"inactive ignored margins do not invalidate roots");
 }finally{filter.dispose();}
 const l=light(),f=l.shadow.getFrustum(),native=f.intersectsBox;f.intersectsBox=function(box){return native.call(this,box);};
 const unknown=new SunShadowReceiverCulling([l]);assert.equal(f.intersectsBox.treeViewCullState,undefined,"a hidden upstream predicate cannot claim complete state");unknown.dispose();
});


test("verified cascade receiver optimizations default on and query zero retains the explicit fallback",()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,"location");let filter;
 try{
  Object.defineProperty(globalThis,"location",{configurable:true,value:{search:""}});
  filter=new SunShadowReceiverCulling([]);assert.equal(filter.cascadeReceiverCull,true);assert.equal(filter.tightProjection,true);filter.dispose();
  Object.defineProperty(globalThis,"location",{configurable:true,value:{search:"?cascadeReceiverCull=0&tightProjection=0"}});
  filter=new SunShadowReceiverCulling([]);assert.equal(filter.cascadeReceiverCull,false);assert.equal(filter.tightProjection,false);filter.dispose();
 }finally{filter?.dispose();if(previous)Object.defineProperty(globalThis,"location",previous);else delete globalThis.location;}
});
