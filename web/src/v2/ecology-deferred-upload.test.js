import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WebGLAttributes } from "three/src/renderers/webgl/WebGLAttributes.js";
import { WorldEcology, treeLodMayContribute } from "./ecology.js";

// Use Three's real version/range merging/consumption code. Only the WebGL
// storage calls are emulated, including the WebGL2 source offset/count overload.
function gpuStorage(){
  let bound;
  const writes=[],gl={ARRAY_BUFFER:34962,FLOAT:5126,
    createBuffer:()=>({bytes:null}),bindBuffer:(_target,buffer)=>{bound=buffer;},
    bufferData:(_target,array)=>{bound.bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength).slice();},
    bufferSubData:(_target,byteOffset,array,sourceOffset=0,count=array.length-sourceOffset)=>{
      bound.bytes.set(new Uint8Array(array.buffer,array.byteOffset+sourceOffset*array.BYTES_PER_ELEMENT,count*array.BYTES_PER_ELEMENT),byteOffset);
      writes.push({buffer:bound,byteOffset,sourceOffset,count});
    },deleteBuffer:()=>{}};
  const gpu=new WebGLAttributes(gl);
  return {writes,
    upload:attributes=>{for(const attribute of attributes)gpu.update(attribute,gl.ARRAY_BUFFER);},
    check:(attribute,rows,label)=>{
      const n=rows*attribute.itemSize*attribute.array.BYTES_PER_ELEMENT;
      assert.deepEqual(gpu.get(attribute).buffer.bytes.slice(0,n),new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,n),label);
    }};
}
const world=()=>({entities:[],objects:{},landcoverAt:()=>({r:0,g:0,b:0,a:0}),
  hydrology:{sampleAt:(x,z)=>({wetness:(Math.sin(x*.07+z*.11)+1)*.45})},
  surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}});
const camera=(x=0)=>({position:new THREE.Vector3(x,101.7,0)});

test("delayed meadow renders upload every appended and compacted matrix and all three root fields",()=>{
  const eco=new WorldEcology(world()),pool=eco.baseGrass,cam=camera(),storage=gpuStorage();
  try{
    eco.grassAnchor=eco.baseGrassAnchor=eco.flowerNearAnchor="0,0";
    eco.uniforms.uWorldViewer.value.copy(cam.position);
    const attributes=[pool.mesh.instanceMatrix,pool.meadowField,pool.meadowLandform,pool.meadowCommunity];
    // Allocate GPU buffers before the first preparation, as after a forest visit.
    storage.upload(attributes);
    const roots=Array.from({length:9},(_,i)=>({id:"deferred:"+i,x:-19+i*4.17,y:100,z:-11+i*2.83,s:.8+i*.03,sy:1+i*.04,rot:i*.31}));
    const prepare=list=>{eco.syncPool(pool,new Map(list.map(r=>[r.id,r])));eco.updateMeadow(cam);};
    const check=()=>attributes.forEach((a,i)=>storage.check(a,pool.records.length,["matrix","meadow field","landform field","community field"][i]));
    prepare(roots.slice(0,2));storage.upload(attributes);check();
    for(const a of attributes)assert.deepEqual(a.updateRanges,[]);
    const before=storage.writes.length;
    prepare(roots.slice(0,4)); // append slots 2,3
    prepare(roots.slice(0,6)); // append slots 4,5, without rendering the first batch
    prepare([roots[1],roots[2],roots[3],roots[4],roots[5]]); // swap slot 5 into slot 0
    prepare([roots[1],roots[2],roots[3],roots[4],roots[5],roots[6]]); // append slot 5
    assert.equal(storage.writes.length,before,"scene preparation did not render");
    assert.equal(new Set(pool.records.map(r=>Array.from(pool.meadowLandform.array.slice(r.slot*4,r.slot*4+4)).join())).size,pool.records.length,"landform rows differ, so a stale field cannot accidentally pass");
    storage.upload(attributes);check();
    for(const a of attributes)assert.deepEqual(a.updateRanges,[],"Three consumes pending ranges only after upload");
    assert.equal(storage.writes.length-before,8,"Three merges the dirty append ranges but retains the disjoint swapped first slot for each buffer");
    const settled=storage.writes.length,versions=attributes.map(a=>a.version);
    eco.updateMeadow(cam);storage.upload(attributes);
    assert.equal(storage.writes.length,settled);assert.deepEqual(attributes.map(a=>a.version),versions);
    // An empty pool and several refills before the next draw must also converge.
    prepare([]);prepare([roots[7]]);prepare([roots[7],roots[8]]);
    storage.upload(attributes);check();assert.equal(pool.mesh.count,2);
  }finally{eco.dispose();}
});

test("tree active prefixes retain unsent swap and append ranges across multiple main-camera moves",()=>{
  const eco=new WorldEcology(world()),geometry=new THREE.BoxGeometry(1,18,1),material=new THREE.MeshStandardMaterial();
  geometry.translate(0,9,0);
  const mesh=new THREE.InstancedMesh(geometry,material,16),storage=gpuStorage();
  const records=Array.from({length:6},(_,i)=>({id:"tree:"+i,x:-180+i*20,y:100,z:0,s:1+i*.03,rot:i*.2}));
  const batch={mesh,mode:5,records,activeRecords:[],activeIndex:new Map()};
  eco.nearTreeBatches.set("test-negative-world",batch);eco.nearGroup.add(mesh);
  const cam=camera(-190),attribute=mesh.instanceMatrix;
  try{
    storage.upload([attribute]);
    const prepare=x=>{cam.position.x=x;eco.uniforms.uWorldViewer.value.copy(cam.position);eco.syncActiveTrees(cam);};
    const check=()=>{
      assert.deepEqual(batch.activeRecords.map(r=>r.id).sort(),records.filter(r=>treeLodMayContribute(5,r,cam.position)).map(r=>r.id).sort());
      storage.check(attribute,mesh.count,"tree instance matrices consumed by main, reflection and shadow draws");
    };
    prepare(-190);storage.upload([attribute]);check();assert.deepEqual(attribute.updateRanges,[]);
    const before=storage.writes.length;
    prepare(-180);prepare(-160);prepare(-150);
    assert.equal(storage.writes.length,before);assert.equal(mesh.count,5);
    storage.upload([attribute]);check();assert.deepEqual(attribute.updateRanges,[]);
    assert.equal(storage.writes.length,before+1,"Three coalesces the accumulated overlapping matrix ranges");
    const revision=eco.treeBatchRevision,version=attribute.version,settled=storage.writes.length;
    assert.equal(eco.syncActiveTrees(cam),false);storage.upload([attribute]);
    assert.equal(attribute.version,version);assert.equal(eco.treeBatchRevision,revision);assert.equal(storage.writes.length,settled);
    prepare(1000);assert.equal(mesh.count,0);assert.equal(mesh.visible,false);
    prepare(-190);prepare(-180);storage.upload([attribute]);check();assert.equal(mesh.visible,true);
  }finally{eco.dispose();geometry.dispose();material.dispose();}
});

test('hidden preparation combines meadow pool publication without changing selected rows, bounds or final GPU bytes',()=>{
 const a=new WorldEcology(world()),b=new WorldEcology(world()),cam=camera(),storage=gpuStorage();
 const roots=Array.from({length:12},(_,i)=>({id:'defer-publish:'+i,x:i*1.8,y:100,z:i*.9,s:1,rot:i*.1}));
 for(const eco of[a,b])eco.grassAnchor=eco.baseGrassAnchor=eco.flowerNearAnchor='0,0';
 const attrs=pool=>[pool.mesh.instanceMatrix,pool.meadowField,pool.meadowLandform,pool.meadowCommunity];
 try{
  storage.upload(attrs(b.baseGrass));const version=b.baseGrass.mesh.instanceMatrix.version;
  for(const list of[roots.slice(0,3),roots.slice(0,7),roots.slice(2,8),roots.slice(1,12)]){
   for(const eco of[a,b])eco.syncPool(eco.baseGrass,new Map(list.map(r=>[r.id,r])));
   a.updateMeadow(cam);b.updateMeadow(cam,{deferPools:true});
  }
  assert.equal(b.baseGrass.mesh.instanceMatrix.version,version,'no intermediate GPU publication');
  b.publishMeadowPools(cam);
  assert.deepEqual(b.baseGrass.records.map(r=>r.id),a.baseGrass.records.map(r=>r.id));
  assert.deepEqual(b.baseGrass.mesh.boundingBox,a.baseGrass.mesh.boundingBox);
  assert.deepEqual(b.baseGrass.mesh.boundingSphere,a.baseGrass.mesh.boundingSphere);
  assert.equal(b.baseGrass.mesh.count,a.baseGrass.mesh.count);
  attrs(b.baseGrass).forEach((attr,i)=>assert.deepEqual(attr.array,attrs(a.baseGrass)[i].array));
  storage.upload(attrs(b.baseGrass));attrs(b.baseGrass).forEach(attr=>storage.check(attr,b.baseGrass.records.length,'coalesced complete pool'));
 }finally{a.dispose();b.dispose();}
});
