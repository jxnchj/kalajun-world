import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {interleaveTreeVertices,treeVertexLayoutEnabled} from './tree-vertex-layout.js';
import {spruceGeometryContainer} from './spruce-loading.js';
import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
import {SunShadowCasters} from './sun-shadow-casters.js';
const make=()=>{const g=new THREE.BoxGeometry(3,16,4);g.translate(0,8,0);const n=g.attributes.position.count;g.setAttribute('aPlantWind',new THREE.BufferAttribute(new Float32Array(n*3).fill(.4),3));g.setAttribute('aCrownOcclusion',new THREE.BufferAttribute(new Float32Array(n).fill(.8),1));g.computeBoundingBox();g.computeBoundingSphere();return g;};
const bitRows=a=>{const data=a.isInterleavedBufferAttribute?a.data.array:a.array,bits=new Uint32Array(data.buffer,data.byteOffset,data.length),out=new Uint32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let k=0;k<a.itemSize;k++)out[i*a.itemSize+k]=bits[a.isInterleavedBufferAttribute?i*a.data.stride+a.offset+k:i*a.itemSize+k];return out;};
test('layout is opt-in and preserves literal index and all vertex bits, including signed zero',()=>{
 assert.equal(treeVertexLayoutEnabled(),false);const g=make(),ix=g.index,attrs=Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,bitRows(a)]));attrs.position[0]=0x80000000;new Uint32Array(g.attributes.position.array.buffer)[0]=0x80000000;
 const report=interleaveTreeVertices(g);assert.strictEqual(g.index,ix);assert.equal(report.beforeBuffers,5);assert.equal(report.afterBuffers,1);
 for(const[n,a]of Object.entries(g.attributes))assert.deepEqual(bitRows(a),attrs[n]);assert.strictEqual(interleaveTreeVertices(g),report);
});
test('private layout leaves original authoring/cache buffers and geometry metadata untouched',()=>{
 const source=make(),g=spruceGeometryContainer(source,new THREE.Matrix4()),attrs={...source.attributes},index=source.index,bounds=g.boundingBox.clone();g.addGroup(0,6,2);g.setDrawRange(3,9);const groups=structuredClone(g.groups),draw={...g.drawRange};interleaveTreeVertices(g);
 for(const[name,a]of Object.entries(attrs)){assert.strictEqual(source.attributes[name],a);assert.deepEqual(bitRows(g.attributes[name]),bitRows(a));}assert.strictEqual(g.index,index);assert.deepEqual(g.boundingBox,bounds);assert.deepEqual(g.groups,groups);assert.deepEqual(g.drawRange,draw);
});
test('real 15 canopy parts retain every attribute bit and original index after packing',async()=>{
 const base=new URL('../../public/assets/v2/',import.meta.url),manifest=JSON.parse(await readFile(new URL('spruce-canopy-v1.json',base)));const bytes=gunzipSync(await readFile(new URL(manifest.payload.file,base)));
 let vertices=0,triangles=0,total=0,buffers=0;
 for(const[name,part]of Object.entries(manifest.parts)){
  const g=new THREE.BufferGeometry(),array=d=>new ({Float32Array,Uint16Array,Uint32Array}[d.type])(bytes.buffer,bytes.byteOffset+d.byteOffset,d.length);
  for(const[key,d]of Object.entries(part.attributes))g.setAttribute(key.replace('_plant_wind','aPlantWind').replace('_crown_occlusion','aCrownOcclusion'),new THREE.BufferAttribute(array(d),d.itemSize,d.normalized));
  g.setIndex(new THREE.BufferAttribute(array(part.index),1));const old=Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,bitRows(a)])),index=g.index;
  const report=interleaveTreeVertices(g);for(const[k,a]of Object.entries(g.attributes))assert.deepEqual(bitRows(a),old[k],name+'/'+k);assert.strictEqual(g.index,index);vertices+=report.vertices;triangles+=index.count/3;total+=report.bytes;buffers+=report.beforeBuffers;
 }
 assert.equal(vertices,315283);assert.equal(triangles,248334);assert.equal(total,16754320);assert.equal(buffers,80);
});
test('spatial instances share one static interleaved buffer, own wind, and retire without deleting source fields',()=>{
 const source=make();interleaveTreeVertices(source);const a=createTreeWindGeometry(source,20),b=createTreeWindGeometry(source,20);assert.strictEqual(a.attributes.position.data,b.attributes.normal.data);assert.notStrictEqual(a.attributes.aTreeRootWind.data,b.attributes.aTreeRootWind.data);const bounds=source.boundingBox.clone();a.computeBoundingBox();assert.deepEqual(a.boundingBox,bounds);disposeTreeWindGeometry(a);assert.ok(source.attributes.position.count);assert.ok(b.attributes.position.count);disposeTreeWindGeometry(b);
});
test('interleaved static shadows stay stable while actual edits still invalidate',()=>{
 const g=make();interleaveTreeVertices(g);const scene=new THREE.Scene(),mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial());mesh.castShadow=true;scene.add(mesh);const light=new THREE.DirectionalLight();light.position.set(10,20,10);Object.assign(light.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:.1,far:100});scene.add(light,light.target);scene.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera();camera.position.set(0,5,25);camera.updateMatrixWorld(true);const caster=new SunShadowCasters(scene,[light]);caster.update(camera);assert.equal(caster.update(camera).changed[0],false);g.attributes.position.setX(0,4);g.attributes.position.data.needsUpdate=true;assert.equal(caster.update(camera).changed[0],true);caster.dispose();
});
test('unsupported mutation/instancing layouts are rejected before conversion',()=>{
 for(const mutate of[g=>g.attributes.position.setUsage(THREE.DynamicDrawUsage),g=>g.setAttribute('aPlantWind',new THREE.InstancedBufferAttribute(new Float32Array(72),3)),g=>g.morphAttributes.position=[g.attributes.position]]){const g=make();mutate(g);const before=g.attributes.position;assert.throws(()=>interleaveTreeVertices(g));assert.strictEqual(g.attributes.position,before);}
});
