import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {WorldStructures} from "./structures.js";
import {createEntities} from "./world-data.js";
import {settlementAssetFor} from "./settlement-assets.js";

// Actual checked-in geometry and PBR descriptors. Node has no image decoder:
// these tests do not establish browser pixel quality or GPU frame time.
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => ({width:1,height:1,byteLength:blob.size,close(){}});
const ROOT = new URL("../../public/", import.meta.url);
const tri = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
const bytes = async path => {
  const b = await readFile(new URL(path.replace(/^\.\//, ""), ROOT));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const cameraAt = (x,y,z) => {
  const camera = new THREE.PerspectiveCamera(60, 1453/783, .1, 200000);
  camera.position.set(x,y,z); camera.lookAt(0,2200,0); camera.updateProjectionMatrix();
  return camera;
};
async function load(entities,options={}) {
  const poses = new Map(entities.map(e => [e.id,{x:e.x,y:2200,z:e.z,rot:e.rot,scale:e.scale}]));
  const world = {entities,surface:{buildingPose:e=>poses.get(e.id)}};
  const structures = new WorldStructures(world,options), sourceCounts = new Map();
  structures.loadAsset = async url => {
    const gltf = await new GLTFLoader().parseAsync(await bytes(url), "");
    let count = 0;
    gltf.scene.traverse(node => {if(node.isMesh)count += tri(node.geometry);});
    sourceCounts.set(url.split("/").at(-1).replace(".glb",""),count);
    return gltf;
  };
  await structures.load();
  return {structures,sourceCounts,poses};
}
let actualPromise;
const actual = () => actualPromise ??= (async() => {
  const objects=JSON.parse(await readFile(new URL("data/objects.json",ROOT)));
  const manifest=JSON.parse(await readFile(new URL("world-v2/manifest.json",ROOT)));
  const entities=createEntities(objects,manifest.assetMetadata);
  return {...await load(entities),entities};
})();

test("real assets retain every entity, source triangle and near-room shadow caster",async() => {
  const {structures:s,entities,sourceCounts,poses}=await actual();
  assert.equal(s.stats.assetsLoaded,18);
  assert.equal(s.entityPoses.size,364);
  const sourceName=id=>id==="gh_lanchuan"?"gh_lanchuan_rooms":settlementAssetFor(id)?.url.split("/").at(-1).replace(".glb","")||id;
  const expectedBudget=entities.reduce((sum,e)=>sum+(e.part?(e.part==="stack"?484:336):sourceCounts.get(sourceName(e.assetId))),0);
  assert.equal(s.stats.triangles,expectedBudget); // Every entity retains its complete selected source.
  // Brass, ceramic and clay now have PBR textures in each pastoral GLB.
  // Independently loaded house/yurt images split those 3 former scalar-only shared pools.
  assert.equal(s.stats.materials,168); // 165 previous + 3 texture-identity splits; no LOD copies.
  for(const entity of entities)assert.deepEqual(s.entityPoses.get(entity.id),poses.get(entity.id));
  const unique = new Map(entities.map(e=>[e.assetId+":"+(e.part||""),e]));
  for(const entity of unique.values()){
    const pose=poses.get(entity.id),camera=cameraAt(pose.x,pose.y+1.6,pose.z);
    s.update(camera,.016);
    const active=s.group.children.filter(m=>m.visible&&m.userData.activeEntityIds.includes(entity.id));
    const actualTriangles=active.reduce((n,m)=>n+tri(m.geometry),0);
    const expected=entity.part ? (entity.part==="stack"?484:336) :
      sourceCounts.get(sourceName(entity.assetId));
    assert.equal(actualTriangles,expected,entity.assetId+" loses near geometry");
    assert.ok(active.every(m=>m.userData.lodLevel==="near"));
    assert.ok(active.filter(m=>!m.material.transparent).every(m=>m.castShadow),entity.assetId+" loses near shadow caster");
  }
});

test("far instances keep all building shells while rejecting sub-visible interior/detail",async() => {
  const {structures:s,entities}=await actual();
  s.update(cameraAt(40000,2400,40000),.016);
  const active=s.group.children.filter(m=>m.visible);
  assert.ok(active.every(m=>m.userData.detailRole==="body"));
  const ids=new Set(active.flatMap(m=>m.userData.activeEntityIds));
  assert.equal(ids.size,entities.length,"A distant building or terrain object disappeared");
  assert.ok(s.stats.activeTriangles < s.stats.triangles*.50,JSON.stringify(s.stats));
  assert.ok(s.stats.lowLODInstances>300);
  assert.ok(s.stats.culledDetailInstances>2000);
  for(const batch of s._batches){
    const near=new Set(batch.mesh.userData.activeEntityIds);
    assert.ok((batch.lodMesh?.userData.activeEntityIds||[]).every(id=>!near.has(id)),"double-rendered LOD");
    if(batch.part.role==="body")assert.equal(near.size+(batch.lodMesh?.count||0),batch.entities.length);
  }
});

test("same 256m tile independently selects near/far detail and preserves instance matrices",async() => {
  const entities=[
    {id:"near",assetId:"cabin_small",x:20,z:20,rot:.32,scale:{x:1,y:1,z:1}},
    {id:"far",assetId:"cabin_small",x:235,z:235,rot:-.57,scale:{x:1.2,y:.9,z:.8}},
  ];
  const {structures:s}=await load(entities);
  s.update(cameraAt(20,2201.6,20),.016);
  const near=s.group.children.filter(m=>m.visible&&m.userData.activeEntityIds.includes("near"));
  const far=s.group.children.filter(m=>m.visible&&m.userData.activeEntityIds.includes("far"));
  assert.equal(near.reduce((n,m)=>n+tri(m.geometry),0),28164);
  assert.ok(far.length>0&&far.every(m=>m.userData.detailRole==="body"));
  assert.ok(far.some(m=>m.userData.lodLevel==="far"));
  const expected=new THREE.Matrix4().compose(new THREE.Vector3(235,2200,235),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-.57),new THREE.Vector3(1.2,.9,.8));
  for(const mesh of far){
    const matrix=new THREE.Matrix4();mesh.getMatrixAt(mesh.userData.activeEntityIds.indexOf("far"),matrix);
    matrix.elements.forEach((x,i)=>assert.ok(Math.abs(x-expected.elements[i])<1e-5));
  }
  // Re-entering restores original geometry and does not duplicate a far mesh.
  s.update(cameraAt(235,2201.6,235),.016);
  assert.equal(s.group.children.filter(m=>m.visible&&m.userData.activeEntityIds.includes("far")).reduce((n,m)=>n+tri(m.geometry),0),28164);
  const meshes=[...s.group.children],disposed=new Set();
  meshes.forEach(m=>m.addEventListener("dispose",()=>disposed.add(m)));
  s.dispose();assert.equal(disposed.size,meshes.length,"far instance buffers leaked");
});

test("simplified shell keeps source PBR attributes, geometric bounds and material identity",async() => {
  const {structures:s}=await actual();
  let tested=0,maxBoundsDelta=0;
  for(const parts of s._templates.values())for(const part of parts){
    if(!part.low)continue;tested++;
    assert.equal(part.role,"body");
    assert.ok(part.low.error<=.06);
    assert.ok(part.low.triangles<=part.triangles*.4);
    const names=Object.keys(part.geometry.attributes).sort();
    assert.deepEqual(Object.keys(part.low.geometry.attributes).sort(),names);
    const tuple=(geometry,i)=>names.flatMap(n=>{
      const a=geometry.attributes[n];return Array.from({length:a.itemSize},(_,k)=>a.getComponent(i,k));
    }).join(",");
    const source=new Set(Array.from({length:part.geometry.attributes.position.count},(_,i)=>tuple(part.geometry,i)));
    for(let i=0;i<part.low.geometry.attributes.position.count;i++)assert.ok(source.has(tuple(part.low.geometry,i)),"LOD altered UV/normal/AO/position");
    for(const key of ["min","max"])for(const axis of ["x","y","z"]){
      const delta=Math.abs(part.geometry.boundingBox[key][axis]-part.low.geometry.boundingBox[key][axis]);
      maxBoundsDelta=Math.max(maxBoundsDelta,delta);assert.ok(delta<=.06,"shell bound changed "+delta);
    }
    const mesh=s.group.children.find(m=>m.geometry===part.low.geometry);
    assert.equal(mesh.material,part.material);
  }
  assert.equal(tested,16);
  console.log(JSON.stringify({validatedLODTemplates:tested,maxBoundsDelta,fullDetailTriangles:s.stats.triangles}));
});

test("actual yurt exterior crown/door and Lanchuan partitions are never classified as disposable furniture",async() => {
  const {structures:s}=await actual();
  for(const id of ["yurt","yurt_deck"]){
    const parts=s._templates.get(id+":");
    const orange=parts.filter(p=>p.names.includes(id+"_orange"));
    assert.equal(orange.length,2);
    const inner=orange.find(p=>p.role==="interior"),body=orange.find(p=>p.role==="body");
    assert.ok(inner.triangles>8000&&body.triangles>1000);
    assert.ok(inner.geometry.boundingBox.max.y<3.12);
    assert.ok(body.geometry.boundingBox.max.y>3.6);
    assert.ok(body.names.some(n=>n.includes("_door0_")));
  }
  const room=s._templates.get("gh_lanchuan:");
  const names=room.flatMap(p=>p.names.map(name=>({name,role:p.role})));
  for(const prefix of ["floor","bath_side","bath_doorway","bath_rounded_opening","wet_floor","shared-wall"]){
    const found=names.filter(x=>x.name.startsWith("freedom")&&x.name.includes(prefix));
    assert.ok(found.length>0,prefix+" actual nodes not found");
    assert.ok(found.every(x=>x.role==="body"),prefix+" removed with interior");
  }
});


test("sampled exterior shell rays retain openings and surface depth across LOD",async() => {
  const {structures:s}=await actual();
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let common=0,misses=0,maxDelta=0,rays=0;
  for(const id of ["cabin_small:","lodge24:","barn:"])for(const part of s._templates.get(id)){
    if(!part.low)continue;
    const high=new THREE.Mesh(part.geometry,material),low=new THREE.Mesh(part.low.geometry,material);
    const box=part.geometry.boundingBox;
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1])for(let i=0;i<5;i++)for(let j=0;j<5;j++){
      const axes=["x","y","z"],a=axes[axis],u=axes[(axis+1)%3],v=axes[(axis+2)%3];
      const point=box.getCenter(new THREE.Vector3());
      point[a]=box[sign>0?"max":"min"][a]+sign*2;
      point[u]=THREE.MathUtils.lerp(box.min[u],box.max[u],(i+.5)/5);
      point[v]=THREE.MathUtils.lerp(box.min[v],box.max[v],(j+.5)/5);
      const direction=new THREE.Vector3();direction[a]=-sign;
      const ray=new THREE.Raycaster(point,direction),h=ray.intersectObject(high)[0],l=ray.intersectObject(low)[0];
      rays++;
      if(Boolean(h)!==Boolean(l))misses++;
      else if(h){common++;maxDelta=Math.max(maxDelta,Math.abs(h.distance-l.distance));}
    }
  }
  material.dispose();
  assert.equal(rays,750);assert.ok(common>300);assert.equal(misses,0);
  // Oblique rays can amplify the simplifier's geometric error. This measured
  // bound is a separate sample check, not a claim of an exhaustive Hausdorff proof.
  assert.ok(maxDelta<.12);
  console.log(JSON.stringify({exteriorRays:rays,commonHits:common,newHoles:misses,maxDepthDelta:maxDelta}));
});


test("cooperative preparation retains every actual source/LOD attribute and placement",async()=>{
  const {structures:a,entities}=await actual();
  const {structures:b}=await load(entities,{cooperativePreparation:false});
  assert.ok(a.stats.assetPreparation.scheduler.yields>0);
  assert.equal(b.stats.assetPreparation.scheduler.yields,0);
  assert.deepEqual([...a._templates.keys()].sort(),[...b._templates.keys()].sort());
  const geometry=(x,y)=>{
    assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));
    for(const key of Object.keys(x.attributes)){
      assert.equal(x.attributes[key].itemSize,y.attributes[key].itemSize);
      assert.equal(x.attributes[key].normalized,y.attributes[key].normalized);
      assert.deepEqual(x.attributes[key].array,y.attributes[key].array);
    }
    assert.deepEqual(x.index?.array,y.index?.array);
    assert.deepEqual(x.boundingBox,y.boundingBox);assert.deepEqual(x.boundingSphere,y.boundingSphere);
  };
  for(const [key,parts]of a._templates){
    const other=b._templates.get(key);assert.equal(parts.length,other.length);
    parts.forEach((part,i)=>{
      assert.deepEqual(part.names,other[i].names);assert.equal(part.role,other[i].role);
      geometry(part.geometry,other[i].geometry);assert.equal(!!part.low,!!other[i].low);
      if(part.low)geometry(part.low.geometry,other[i].low.geometry);
    });
  }
  assert.deepEqual(a.entityPoses,b.entityPoses);assert.equal(a.stats.triangles,b.stats.triangles);
  b.dispose();
});
