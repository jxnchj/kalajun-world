import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldStructures} from './structures.js';
import {createEntities} from './world-data.js';

globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => ({width:1,height:1,byteLength:blob.size,close(){}});
const ROOT = new URL('../../public/', import.meta.url);
const digest = geometry => {
  const hash = createHash('sha256');
  for (const [name,attribute] of [['index',geometry.index],...Object.entries(geometry.attributes)].sort()) {
    if (!attribute) continue;
    hash.update(name+':'+attribute.itemSize+':'+attribute.normalized+':'+attribute.array.constructor.name);
    hash.update(new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
  }
  return hash.digest('hex');
};
let pairPromise;
async function pair() {
  return pairPromise ??= (async()=>{
    const objects=JSON.parse(await readFile(new URL('data/objects.json',ROOT)));
    const manifest=JSON.parse(await readFile(new URL('world-v2/manifest.json',ROOT)));
    const entities=createEntities(objects,manifest.assetMetadata);
    const world={entities,surface:{buildingPose:e=>({x:e.x,y:2200,z:e.z,rot:e.rot,scale:e.scale})}};
    const sources=new Map();
    const loadAsset=async url=>{
      if (!sources.has(url)) sources.set(url,(async()=>{
        const data=await readFile(new URL(url.replace(/^\.\//,''),ROOT));
        return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
      })());
      return sources.get(url);
    };
    const old=new WorldStructures(world,{loadAsset,preparationReuse:false,selectionReuse:false});
    const reused=new WorldStructures(world,{loadAsset,preparationReuse:true,selectionReuse:true});
    await old.load();await reused.load();
    return {old,reused,entities};
  })();
}
function cameraAt(x,y,z) {
  const camera=new THREE.PerspectiveCamera(60,1453/783,.1,200000);
  camera.position.set(x,y,z);camera.lookAt(0,2200,0);camera.updateProjectionMatrix();
  return camera;
}
function state(structures) {
  return structures._batches.map(b=>[b.nearSelection,b.farSelection,Array.from(b.detailState),Array.from(b.lodState),
    ...[b.mesh,b.lodMesh].filter(Boolean).map(mesh=>({
      count:mesh.count,visible:mesh.visible,castShadow:mesh.castShadow,
      active:mesh.userData.activeEntityIds,matrices:Array.from(mesh.instanceMatrix.array),
      box:mesh.boundingBox.toArray?.()||[mesh.boundingBox.min.toArray(),mesh.boundingBox.max.toArray()],
      sphere:[mesh.boundingSphere.center.toArray(),mesh.boundingSphere.radius],
    }))]);
}

test('real eighteen source assets retain every prepared attribute and material with local reuse',async()=>{
  const {old,reused}=await pair();
  assert.equal(old.stats.assetsLoaded,18);assert.equal(reused.stats.assetsLoaded,18);
  assert.equal(old.stats.materials,reused.stats.materials);
  assert.equal(old.stats.triangles,reused.stats.triangles);
  let geometries=0;
  for (const [key,parts] of old._templates) {
    const next=reused._templates.get(key);assert.equal(next.length,parts.length,key);
    for(let i=0;i<parts.length;i++) {
      const a=parts[i],b=next[i];
      assert.deepEqual(a.names,b.names);assert.equal(a.role,b.role);
      assert.equal(digest(a.geometry),digest(b.geometry),key+'/'+i);geometries++;
      assert.equal(Boolean(a.low),Boolean(b.low));
      if(a.low){assert.equal(a.low.error,b.low.error);assert.equal(digest(a.low.geometry),digest(b.low.geometry));geometries++;}
      for (const field of Object.keys(a.material)) {
        if(['id','uuid','userData','_listeners','onBeforeCompile','customProgramCacheKey'].includes(field))continue;
        const av=a.material[field],bv=b.material[field];
        if(av?.isTexture)assert.equal(av,bv,field+' texture identity');
        else if(typeof av!=='function')assert.deepEqual(av,bv,field);
      }
    }
  }
  assert.ok(reused.stats.materialSourceReuses>0);
  assert.ok(reused.stats.materialKeyComputations<old.stats.materialKeyComputations);
  console.log(JSON.stringify({preparedGeometryDigests:geometries,originalKeys:old.stats.materialKeyComputations,
    reusedKeys:reused.stats.materialKeyComputations,sourceMaterialReuses:reused.stats.materialSourceReuses}));
});

test('distance reuse preserves sequential camera hysteresis, instances, bounds and all shadow decisions',async()=>{
  const {old,reused,entities}=await pair();
  const points=[[-3611.9813305250705,2329.161214161885,4805.371282289286],[40000,2400,40000]];
  for(const e of entities.filter((_,i)=>i%23===0)) {
    // Travel both ways across the established 40/75/85/100/150/180m thresholds.
    for(const offset of [0,39.999,40.001,74.999,75.001,84.999,85.001,100,150,180,75,39,0])
      points.push([e.x+offset,2201.6,e.z]);
  }
  let originalTests=0,reusedTests=0;
  for(const point of points) {
    const camera=cameraAt(...point);old.update(camera,.016);reused.update(camera,.016);
    assert.deepEqual(state(old),state(reused),'camera '+point.join(','));
    for(const field of ['visibleBatches','visibleTriangles','shadowBatches','culledDetailInstances','lowLODInstances','activeTriangles'])
      assert.equal(old.stats[field],reused.stats[field],field);
    originalTests=old.stats.distanceTests;reusedTests=reused.stats.distanceTests;
    assert.equal(reusedTests,entities.length);
    assert.ok(originalTests>reusedTests);
  }
  // No state survives across frames: moving an already shared bound is observed.
  for(const s of [old,reused])s._batches[0].worldBounds[0].translate(new THREE.Vector3(1,2,3));
  const camera=cameraAt(0,2201.6,0);old.update(camera,.016);reused.update(camera,.016);
  assert.deepEqual(state(old),state(reused));
  console.log(JSON.stringify({cameraSamples:points.length,distanceTestsBefore:originalTests,distanceTestsAfter:reusedTests}));
});

test('material reuse is scoped to synchronous load, so later PBR/texture edits do not reuse stale keys',()=>{
  const s=new WorldStructures({entities:[]});
  const source=new THREE.MeshStandardMaterial({roughness:.7,map:new THREE.Texture()});
  const first=s._material(source);source.roughness=.3;
  const second=s._material(source);assert.notEqual(second,first);assert.equal(second.roughness,.3);
  source.map.offset.x=.25;const third=s._material(source);assert.notEqual(third,second);
  s.dispose();assert.equal(s._selectionBins.length,0);
});
