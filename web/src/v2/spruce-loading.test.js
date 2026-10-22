import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {gzipSync} from "node:zlib";
import {createSpruceLoader,loadCompressedSpruce,SpruceGeometryPool,sameSpruceGeometry} from "./spruce-loading.js";
import {createTreeWindGeometry,disposeTreeWindGeometry} from "./spruce-wind.js";
const geometry=()=>{const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute("aPlantWind",new THREE.Float32BufferAttribute([0,0,1,1,0,2,0,1,3],3));g.setIndex([0,1,2]);return g;};
test("tree loader uses the bundled Meshopt decoder and accepts explicit or HTTP-decoded gzip",async()=>{
 assert.ok(createSpruceLoader().meshoptDecoder.supported);
 const raw=Buffer.alloc(20);raw.writeUInt32LE(0x46546c67);const zipped=gzipSync(raw),received=[];
 const loader={parseAsync:async(bytes,path)=>{received.push({bytes:new Uint8Array(bytes),path});return {};}};
 for(const payload of [zipped,raw]){
  const result=await loadCompressedSpruce("./assets/v2/tree.glb.gz",loader,async()=>({ok:true,arrayBuffer:async()=>payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength)}));
  assert.equal(result.userData.transportBytes,payload.length);assert.equal(result.userData.meshoptGLBBytes,20);
 }
 assert.deepEqual(received[0].bytes,received[1].bytes);assert.equal(received[0].path,"./assets/v2/");
 await assert.rejects(loadCompressedSpruce("bad",loader,async()=>({ok:false,status:404})),/404/);
 await assert.rejects(loadCompressedSpruce("bad",loader,async()=>({ok:true,arrayBuffer:async()=>new Uint8Array(20).buffer})),/Invalid/);
});
test("static spruce parts share actual attributes across LODs only after full byte equivalence",()=>{
 const pool=new SpruceGeometryPool(),hi=geometry(),near=hi.clone(),different=hi.clone();different.attributes.aPlantWind.setZ(0,1.00001);
 assert.ok(sameSpruceGeometry(hi,near));assert.ok(!sameSpruceGeometry(hi,different));
 assert.strictEqual(pool.adopt(0,"bark",hi),hi);assert.strictEqual(pool.adopt(0,"bark",near),hi);
 assert.strictEqual(pool.adopt(0,"bark",different),different);
 const other=hi.clone();assert.strictEqual(pool.adopt(1,"bark",other),other);
 const frond=hi.clone();assert.strictEqual(pool.adopt(0,"frond",frond),frond);
 assert.deepEqual(pool.stats,{reusedGeometries:1,vertexBytesSaved:72,indexBytesSaved:6});pool.dispose();
});
test("retiring a needle batch cannot release shared high-LOD static VBOs; pool disposes each once",()=>{
 const pool=new SpruceGeometryPool(),source=pool.adopt(0,"core",geometry()),near=pool.adopt(0,"core",source.clone());
 const hiBatch=createTreeWindGeometry(source,3),nearBatch=createTreeWindGeometry(near,2);let disposed=0;source.addEventListener("dispose",()=>disposed++);
 assert.strictEqual(hiBatch.attributes.position,nearBatch.attributes.position);
 disposeTreeWindGeometry(nearBatch);assert.equal(disposed,0);assert.ok(hiBatch.attributes.position);assert.equal(nearBatch.index,null);assert.equal(nearBatch.attributes.position,undefined);
 disposeTreeWindGeometry(hiBatch);pool.dispose();assert.equal(disposed,1);pool.dispose();assert.equal(disposed,1);
});
