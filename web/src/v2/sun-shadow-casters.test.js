import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WorldShadowDepth } from "./room-shadow.js";
import { SunShadowCasters } from "./sun-shadow-casters.js";

function fixture(options = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const lights = [10, 30, 100].map(span => {
    const light = new THREE.DirectionalLight(); light.position.set(0, 20, 0); light.castShadow = true;
    Object.assign(light.shadow.camera, { left: -span / 2, right: span / 2, top: span / 2, bottom: -span / 2, near: 1, far: 60 });
    light.shadow.camera.updateProjectionMatrix(); scene.add(light, light.target); return light;
  });
  const tracker = new SunShadowCasters(scene, lights, {compactCapture:true,...options});
  return { scene, camera, lights, tracker, update: () => [...tracker.update(camera).changed] };
}
function box(x = 0) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const morph = geometry.attributes.position.clone();
  for (let i = 0; i < morph.count; i++) morph.setY(i, morph.getY(i) + .2);
  geometry.morphAttributes.position = [morph];
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.position.x = x; mesh.castShadow = true; return mesh;
}

test("outside builds and morphs do not invalidate any cascade; membership changes do", () => {
  const f = fixture(), far = box(1000); f.scene.add(far);
  assert.deepEqual(f.update(), [true, true, true]);
  assert.deepEqual(f.update(), [false, false, false]);
  far.morphTargetInfluences[0] = .7;
  far.geometry.attributes.position.needsUpdate = true;
  f.scene.add(box(1200));
  assert.deepEqual(f.update(), [false, false, false]);
  assert.equal(f.tracker.stats.objectScans, 0);
  far.position.x = 12;
  assert.deepEqual(f.update(), [false, true, true]);
  assert.deepEqual(f.tracker.result.counts, [0, 1, 1]);
  far.position.x = 1000;
  assert.deepEqual(f.update(), [false, true, true]);
  assert.deepEqual(f.tracker.result.counts, [0, 0, 0]);
});

test("visible native morphs, world matrices and geometry versions invalidate only intersecting levels", () => {
  const f = fixture(), mesh = box(12); f.scene.add(mesh); f.update(); f.update();
  const check = change => { change(); assert.deepEqual(f.update(), [false, true, true]); assert.deepEqual(f.update(), [false, false, false]); };
  check(() => mesh.morphTargetInfluences[0] = .6);
  check(() => mesh.position.y += .25);
  check(() => mesh.geometry.attributes.position.needsUpdate = true);
  check(() => mesh.geometry.morphAttributes.position[0].needsUpdate = true);
  check(() => mesh.geometry = mesh.geometry.clone());
  assert.equal(f.tracker.stats.objectScans, 1, "one state capture serves two cascades");
  assert.equal(f.tracker.stats.geometryScans, 1);
});

test("instance uploads, counts and replaced attributes are observed without scanning instance arrays", () => {
  const f = fixture(), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
  mesh.castShadow = true; mesh.setMatrixAt(0, new THREE.Matrix4()); mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 0));
  f.scene.add(mesh); f.update(); f.update();
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2, 0, 0)); mesh.instanceMatrix.needsUpdate = true;
  assert.deepEqual(f.update(), [true, true, true]); assert.deepEqual(f.update(), [false, false, false]);
  mesh.count = 1; assert.deepEqual(f.update(), [true, true, true]);
  mesh.instanceMatrix = mesh.instanceMatrix.clone(); assert.deepEqual(f.update(), [true, true, true]);
  mesh.count = 0; assert.deepEqual(f.update(), [true, true, true]); assert.deepEqual(f.tracker.result.counts, [0, 0, 0]);
  mesh.count = 1; assert.deepEqual(f.update(), [true, true, true]);
});

test("inherited visibility, main-camera layers and custom frustum hooks match WebGLShadowMap", () => {
  const f = fixture(), parent = new THREE.Group(), mesh = box(1000); parent.add(mesh); f.scene.add(parent);
  let calls = 0;
  mesh.intersectsFrustum = frustum => { calls++; return frustum === f.lights[0].shadow.getFrustum(); };
  // A parent layer mismatch does not hide descendants; shadow-camera layers are irrelevant.
  parent.layers.set(3); f.lights[0].shadow.camera.layers.set(4);
  f.update(); assert.deepEqual(f.tracker.result.counts, [1, 0, 0]); assert.equal(calls, 3);
  parent.visible = false; assert.deepEqual(f.update(), [true, false, false]); assert.equal(calls, 3);
  parent.visible = true; f.update(); mesh.layers.set(2); assert.deepEqual(f.update(), [true, false, false]);
  f.camera.layers.enable(2); assert.deepEqual(f.update(), [true, false, false]);
  mesh.frustumCulled = false; assert.deepEqual(f.update(), [false, true, true]); assert.deepEqual(f.tracker.result.counts, [1, 1, 1]);
  mesh.material.visible = false; assert.deepEqual(f.update(), [true, true, true]);
  mesh.material.visible = true; assert.deepEqual(f.update(), [true, true, true]);
});

test("alpha occlusion changes invalidate depth; illumination and shader time do not", () => {
  const f = fixture(), mesh = box(), texture = new THREE.Texture(); mesh.material.alphaTest = .5; mesh.material.alphaMap = texture;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial(); mesh.customDepthMaterial.userData.time = { value: 0 };
  f.scene.add(mesh); f.update(); f.update();
  f.lights[0].intensity = 5; mesh.material.color.set("red"); mesh.material.roughness = .2;
  mesh.customDepthMaterial.userData.time.value = 1;
  assert.deepEqual(f.update(), [false, false, false]);
  for (const change of [() => mesh.material.alphaTest = .6, () => texture.needsUpdate = true, () => texture.offset.x = .2,
    () => mesh.material.displacementScale = .4, () => f.tracker.markChanged(mesh)]) {
    change(); assert.deepEqual(f.update(), [true, true, true]); assert.deepEqual(f.update(), [false, false, false]);
  }
});

test("material groups and VSM receivers follow actual depth eligibility; disposal releases references only", () => {
  const f = fixture(), mesh = box(), hidden = new THREE.MeshStandardMaterial({ visible: false });
  mesh.material = [hidden]; mesh.geometry.clearGroups(); mesh.geometry.addGroup(0, mesh.geometry.index.count, 0);
  f.scene.add(mesh); f.update(); assert.deepEqual(f.tracker.result.counts, [0, 0, 0]);
  hidden.visible = true; assert.deepEqual(f.update(), [true, true, true]);
  mesh.castShadow = false; mesh.receiveShadow = true; assert.deepEqual(f.update(), [true, true, true]);
  f.tracker.update(f.camera, { shadowType: THREE.VSMShadowMap }); assert.deepEqual(f.tracker.result.counts, [1, 1, 1]);
  mesh.geometry.setDrawRange(0, 0); f.tracker.update(f.camera, { shadowType: THREE.VSMShadowMap }); assert.deepEqual(f.tracker.result.counts, [0, 0, 0]);
  let disposed = 0; mesh.geometry.addEventListener("dispose", () => disposed++); f.tracker.dispose();
  assert.equal(disposed, 0); assert.equal(mesh.parent, f.scene);
  assert.ok([...f.tracker._previous, ...f.tracker._current].every(map => map.size === 0));
});

test("declared root-wind uploads preserve cadence while all structure and other uploads invalidate", () => {
  const f = fixture(), mesh = box();
  const geometry = mesh.geometry;
  const wind = new THREE.InstancedBufferAttribute(new Float32Array(8), 4);
  const eddy = new THREE.InstancedBufferAttribute(new Float32Array(4), 2);
  geometry.setAttribute("aTreeRootWind", wind);
  geometry.setAttribute("aTreeRootEddy", eddy);
  geometry.userData.ecologyWindAttributes = ["aTreeRootWind", "aTreeRootEddy", "position"];
  f.scene.add(mesh); f.update(); f.update();
  for (let i = 0; i < 4; i++) {
    wind.setX(0, i * .1); wind.needsUpdate = true;
    eddy.setY(1, i * .2); eddy.needsUpdate = true;
    assert.deepEqual(f.update(), [false, false, false]);
  }
  const check = change => {
    change(); assert.deepEqual(f.update(), [true, true, true]);
    assert.deepEqual(f.update(), [false, false, false]);
  };
  check(() => geometry.attributes.position.needsUpdate = true);
  check(() => wind.array = new Float32Array(8));
  check(() => wind.meshPerAttribute = 2);
  check(() => wind.itemSize = 2);
  check(() => wind.count = 4);
  check(() => wind.normalized = true);
  check(() => wind.gpuType = THREE.IntType);
  check(() => geometry.setAttribute("aTreeRootWind", wind.clone()));
  check(() => geometry.userData.ecologyWindAttributes = []);
  check(() => geometry.attributes.aTreeRootWind.needsUpdate = true);
  check(() => f.tracker.markChanged(mesh));
});

test("wind interleaved uploads ignore only data versions, never backing storage or layout", () => {
  const f = fixture(), mesh = box();
  const data = new THREE.InstancedInterleavedBuffer(new Float32Array(12), 6);
  const wind = new THREE.InterleavedBufferAttribute(data, 4, 0);
  mesh.geometry.setAttribute("aTreeRootWind", wind);
  mesh.geometry.userData.ecologyWindAttributes = ["aTreeRootWind"];
  f.scene.add(mesh); f.update(); f.update();
  data.needsUpdate = true; assert.deepEqual(f.update(), [false, false, false]);
  for (const change of [
    () => data.array = new Float32Array(12),
    () => data.stride = 8,
    () => wind.offset = 1,
    () => wind.data = new THREE.InstancedInterleavedBuffer(new Float32Array(12), 6)
  ]) {
    change(); assert.deepEqual(f.update(), [true, true, true]);
    assert.deepEqual(f.update(), [false, false, false]);
  }
});


test("shared VBO metadata is scanned once per frame while versions and scheduling policies remain independent", () => {
  const f = fixture(), base = new THREE.BoxGeometry();
  const shared = new THREE.InstancedBufferAttribute(new Float32Array(8), 4);
  const meshes = [];
  for (let i = 0; i < 100; i++) {
    const g = new THREE.BufferGeometry(); g.setIndex(base.index);
    for (const [name, a] of Object.entries(base.attributes)) g.setAttribute(name, a);
    g.setAttribute("aTreeRootWind", shared); g.userData.ecologyWindAttributes = ["aTreeRootWind"];
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); mesh.castShadow = true; f.scene.add(mesh); meshes.push(mesh);
  }
  f.update(); assert.deepEqual(f.update(), [false, false, false]);
  assert.equal(f.tracker.stats.geometryScans, 100); assert.equal(f.tracker.stats.attributeScans, 5);
  assert.equal(f.tracker.stats.attributeReuses, 495);
  shared.needsUpdate = true; assert.deepEqual(f.update(), [false, false, false]);
  meshes[0].geometry.userData.ecologyWindAttributes = [];
  assert.deepEqual(f.update(), [true, true, true]); f.update();
  shared.needsUpdate = true; assert.deepEqual(f.update(), [true, true, true]);
  assert.equal(f.tracker.stats.attributeScans, 6, "same attribute has independent scheduled and immediate revision");
  base.attributes.position.needsUpdate = true; assert.deepEqual(f.update(), [true, true, true]);
  assert.equal(f.tracker.result.counts[0], 100);
  shared.array = new Float32Array(8); assert.deepEqual(f.update(), [true, true, true]);
  shared.itemSize = 2; assert.deepEqual(f.update(), [true, true, true]);
  f.tracker.attributeCache = false; f.update(); assert.deepEqual(f.update(), [false, false, false]);
  assert.equal(f.tracker.stats.attributeScans, 500); assert.equal(f.tracker.stats.attributeReuses, 0);
  f.tracker.attributeCache = true; f.update(); assert.deepEqual(f.update(), [false, false, false]);
  assert.equal(f.tracker.stats.attributeScans, 6);
  f.tracker.dispose(); for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } base.dispose();
});

test("per-view submission buffers cannot alter logical caster revisions or mask resident roots",()=>{
 const f=fixture(),source=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2),proxy=new THREE.Mesh(source.geometry,source.material);
 source.count=2;proxy.castShadow=true;proxy.userData.treeViewSource=source;
 proxy.intersectsFrustum=()=>{proxy.geometry=new THREE.BufferGeometry();proxy.geometry.instanceCount=0;return true;};
 f.scene.add(proxy);assert.deepEqual(f.update(),[true,true,true]);
 assert.deepEqual(f.update(),[false,false,false]);assert.deepEqual(f.tracker.result.counts,[1,1,1]);
 source.instanceMatrix.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);assert.deepEqual(f.update(),[false,false,false]);
 source.count=0;assert.deepEqual(f.update(),[true,true,true]);assert.deepEqual(f.tracker.result.counts,[0,0,0]);
});

// Submission buffers need not be prepared while checking whether a cached
// shadow is stale; the coarser resident bound is conservative for this purpose.
test("caster tracking can use a conservative logical predicate without compacting draw views", () => {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),light=new THREE.DirectionalLight();
  scene.add(light);light.position.set(0,5,0);light.target.position.set(0,0,0);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());mesh.castShadow=true;scene.add(mesh);
  let logical=0;mesh.intersectsShadowCasterFrustum=()=>{logical++;return true;};
  mesh.intersectsFrustum=()=>{throw new Error("draw compaction should not run in the cache audit");};
  const tracker=new SunShadowCasters(scene,[light]);
  assert.equal(tracker.update(camera).counts[0],1);assert.equal(logical,1);tracker.dispose();
  mesh.geometry.dispose();mesh.material.dispose();
});


test("compact state capture matches the original path across in-place mutable layout/groups/material edits",()=>{
 const f=fixture({compactCapture:false}),fast=new SunShadowCasters(f.scene,f.lights,{compactCapture:true});
 const mesh=box(),other=box(12),material=mesh.material;f.scene.add(mesh,other);
 const root=new THREE.InstancedBufferAttribute(new Float32Array(8),4);mesh.geometry.setAttribute("aTreeRootWind",root);mesh.geometry.userData.ecologyWindAttributes=["aTreeRootWind"];
 material.alphaTest=.5;material.map=new THREE.Texture();material.clipShadows=true;material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];
 const compare=()=>{
  const a=f.tracker.update(f.camera),b=fast.update(f.camera);
  assert.deepEqual(b.revisions,a.revisions);assert.deepEqual(b.changed,a.changed);assert.deepEqual(b.counts,a.counts);
  assert.equal(fast.stats.objectScans,f.tracker.stats.objectScans);assert.equal(fast.stats.attributeScans,f.tracker.stats.attributeScans);
 };
 compare();compare();
 for(const change of[
  ()=>mesh.position.x+=.1,
  ()=>mesh.geometry.attributes.position.needsUpdate=true,
  ()=>mesh.geometry.attributes.position.itemSize=2,
  ()=>mesh.geometry.attributes.position.normalized=true,
  ()=>mesh.geometry.attributes.position.array=mesh.geometry.attributes.position.array.slice(),
  ()=>mesh.geometry.setAttribute("custom",new THREE.Float32BufferAttribute([1,2,3],3)),
  ()=>mesh.geometry.deleteAttribute("custom"),
  ()=>mesh.geometry.groups[0].count-=3,
  ()=>mesh.geometry.groups.push({start:0,count:3,materialIndex:0}),
  ()=>mesh.geometry.groups.splice(0,1),
  ()=>mesh.geometry.drawRange.start=1,
  ()=>mesh.geometry.morphAttributes.position.push(mesh.geometry.morphAttributes.position[0].clone()),
  ()=>mesh.morphTargetInfluences[0]=.5,
  ()=>material.clippingPlanes[0].constant=.3,
  ()=>material.clippingPlanes.push(new THREE.Plane(new THREE.Vector3(0,1,0),.2)),
  ()=>material.map.matrixAutoUpdate=false,
  ()=>material.map.matrix.elements[0]=2,
  ()=>root.needsUpdate=true,
  ()=>mesh.geometry.userData.ecologyWindAttributes.splice(0,1),
  ()=>root.needsUpdate=true,
  ()=>mesh.material=[material,new THREE.MeshStandardMaterial()],
  ()=>mesh.material.reverse(),
  ()=>mesh.customDepthMaterial=new THREE.MeshDepthMaterial(),
  ()=>mesh.customDepthMaterial.alphaTest=.3,
  ()=>mesh.visible=false,
  ()=>mesh.visible=true,
  ()=>f.scene.remove(other),
  ()=>f.scene.add(other)
 ]){change();compare();compare();}
 fast.compactCapture=false;compare();fast.compactCapture=true;compare();
 fast.dispose();f.tracker.dispose();
});


test("compact shadow capture is adopted by default and zero retains the old comparison",()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,"location");
 try{
  for(const[search,enabled]of[["",true],["?shadowCaptureCompact=1",true],["?shadowCaptureCompact=0",false]]){
   Object.defineProperty(globalThis,"location",{configurable:true,value:{search}});
   const tracker=new SunShadowCasters(new THREE.Scene(),[]);assert.equal(tracker.compactCapture,enabled);tracker.dispose();
  }
 }finally{if(prior)Object.defineProperty(globalThis,"location",prior);else delete globalThis.location;}
});

test("direct attribute signature preserves every mutable interleaved and instanced field across runtime switches", () => {
 const f=fixture({directAttributeCapture:false}),fast=new SunShadowCasters(f.scene,f.lights,{directAttributeCapture:true});
 const mesh=box(),g=mesh.geometry;f.scene.add(mesh);
 const data=new THREE.InstancedInterleavedBuffer(new Float32Array(24),4,1);
 const a=new THREE.InterleavedBufferAttribute(data,2,1),wind=new THREE.InterleavedBufferAttribute(data,2,0);
 g.setAttribute("custom",a);g.setAttribute("aTreeRootWind",wind);g.userData.ecologyWindAttributes=["aTreeRootWind"];
 const compare=()=>{
  const old=f.tracker.update(f.camera),next=fast.update(f.camera);
  assert.deepEqual(next.revisions,old.revisions);assert.deepEqual(next.changed,old.changed);assert.deepEqual(next.counts,old.counts);
 };
 compare();compare();
 for(const change of[
  ()=>data.needsUpdate=true,
  ()=>data.array=new Float32Array(28),
  ()=>data.stride=3,
  ()=>data.count=5,
  ()=>data.meshPerAttribute=2,
  ()=>a.offset=0,
  ()=>a.itemSize=3,
  ()=>a.normalized=true,
  ()=>a.gpuType=THREE.IntType,
  ()=>a.meshPerAttribute=2,
  ()=>a.data=new THREE.InstancedInterleavedBuffer(new Float32Array(24),4,2),
  ()=>g.userData.ecologyWindAttributes=[],
  ()=>data.needsUpdate=true,
  ()=>fast.directAttributeCapture=false,
  ()=>a.offset=1,
  ()=>fast.directAttributeCapture=true,
  ()=>fast.compactCapture=false,
  ()=>a.itemSize=2,
  ()=>fast.compactCapture=true,
  ()=>g.deleteAttribute("custom"),
  ()=>g.setAttribute("custom",a),
 ]) {change();compare();compare();}
 // NaN retains the original strict-inequality behavior (always invalidates).
 a.offset=NaN;compare();compare();a.offset=0;compare();compare();
 fast.dispose();f.tracker.dispose();
});


test("opaque terrain skips only surface shading attributes while all depth deformation remains live",()=>{
 const f=fixture(),mesh=box();mesh.userData.terrainTile={x:0,z:0};
 for(const name of ["terrainCover","terrainHydrology","terrainLandform","terrainCommunity","terrainLandformDelta","terrainCommunityDelta","terrainShoreDistance","terrainShoreDistanceDelta"])mesh.geometry.setAttribute(name,mesh.geometry.attributes.position.clone());
 mesh.geometry.morphAttributes.color=[mesh.geometry.attributes.position.clone()];
 f.scene.add(mesh);f.update();f.update();assert.equal(f.tracker.stats.terrainDepthScans,1);
 const oldCount=f.tracker.stats.attributeScans;assert.ok(f.tracker.stats.surfaceAttributesSkipped>=9);
 for(const name of ["normal","uv","terrainCover","terrainHydrology","terrainLandform","terrainCommunity","terrainShoreDistance","terrainShoreDistanceDelta"]){mesh.geometry.attributes[name].needsUpdate=true;assert.deepEqual(f.update(),[false,false,false]);}
 mesh.geometry.morphAttributes.color[0].needsUpdate=true;assert.deepEqual(f.update(),[false,false,false]);
 for(const change of [()=>mesh.geometry.attributes.position.needsUpdate=true,()=>mesh.geometry.index.needsUpdate=true,()=>mesh.morphTargetInfluences[0]=.7,()=>mesh.geometry.morphAttributes.position[0].needsUpdate=true,()=>mesh.position.x=.2,()=>mesh.geometry.setAttribute('futureAttribute',new THREE.Float32BufferAttribute([1,2,3],3))]){
  change();assert.deepEqual(f.update(),[true,true,true]);assert.deepEqual(f.update(),[false,false,false]);
 }
 mesh.material.alphaTest=.2;assert.deepEqual(f.update(),[true,true,true]);assert.equal(f.tracker.stats.terrainDepthScans,0);assert.ok(f.tracker.stats.attributeScans>oldCount);
 mesh.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
 mesh.material.alphaTest=0;f.update();f.update();mesh.customDepthMaterial=new THREE.MeshDepthMaterial();f.update();assert.equal(f.tracker.stats.terrainDepthScans,0);mesh.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
});

test("terrain and custom depth users of one geometry have independent signatures and hooks fail closed",()=>{
 const f=fixture(),terrain=box(),custom=box();custom.geometry=terrain.geometry;terrain.userData.terrainTile={x:0,z:0};custom.customDepthMaterial=new THREE.MeshDepthMaterial();
 terrain.geometry.setAttribute('terrainCover',terrain.geometry.attributes.position.clone());f.scene.add(terrain,custom);f.update();f.update();assert.equal(f.tracker.stats.terrainDepthScans,1);
 terrain.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
 f.scene.remove(custom);f.update();f.update();terrain.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[false,false,false]);
 terrain.onBeforeShadow=()=>{};f.update();assert.equal(f.tracker.stats.terrainDepthScans,0);terrain.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
 terrain.onBeforeShadow=THREE.Object3D.prototype.onBeforeShadow;terrain.material.displacementMap=new THREE.Texture();f.update();assert.equal(f.tracker.stats.terrainDepthScans,0);
 terrain.material.displacementMap=null;f.tracker.terrainDepthCapture=false;f.update();f.update();terrain.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
});


test("streamed terrain projected-depth installation remains eligible until its depth shader is changed",()=>{
 const f=fixture(),mesh=box();mesh.userData.terrainTile={x:0,z:0};mesh.geometry.setAttribute('terrainCover',mesh.geometry.attributes.position.clone());f.scene.add(mesh);
 const depth=new WorldShadowDepth(f.scene);depth.prepare();f.update();f.update();assert.equal(f.tracker.stats.terrainDepthScans,1);
 mesh.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[false,false,false]);
 const compile=mesh.customDepthMaterial.onBeforeCompile;mesh.customDepthMaterial.onBeforeCompile=()=>{};f.update();assert.equal(f.tracker.stats.terrainDepthScans,0);f.update();mesh.geometry.attributes.terrainCover.needsUpdate=true;assert.deepEqual(f.update(),[true,true,true]);
 mesh.customDepthMaterial.onBeforeCompile=compile;mesh.customDepthMaterial.defines={CUSTOM_DEPTH:1};f.update();assert.equal(f.tracker.stats.terrainDepthScans,0);depth.dispose();f.tracker.dispose();
});

test('due cascades skip invalidation work without losing later edits or membership',()=>{
 const f=fixture(),mesh=box();f.scene.add(mesh);f.update();f.update();
 mesh.position.x=2;mesh.geometry.attributes.position.needsUpdate=true;
 f.tracker.update(f.camera,{skipCascades:[true,true,true]});
 assert.equal(f.tracker.stats.objectScans,0);assert.equal(f.tracker.stats.frustumTests,0);
 assert.deepEqual(f.update(),[true,true,true]);assert.deepEqual(f.update(),[false,false,false]);
 f.scene.remove(mesh);f.tracker.update(f.camera,{skipCascades:[true,false,true]});
 assert.deepEqual(f.tracker.result.changed,[false,true,false]);
 assert.deepEqual(f.update(),[true,false,true]);assert.deepEqual(f.tracker.result.counts,[0,0,0]);
});
