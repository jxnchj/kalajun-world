import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {createTreeShadowIndex,installTreeShadowIndex,installShadowIndexRenderer} from './tree-shadow-index.js';
import {prepareTreeWindCoefficients} from './tree-wind-coefficients.js';
function fixture(){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],2));
 g.setAttribute('aPlantWind',new THREE.Float32BufferAttribute(Array(18).fill(.125),3));
 g.setIndex([0,1,2,3,4,5]);return g;
}
function rendererFixture(){
 const canvas=new EventTarget(),calls={created:0,deleted:[],data:[]};let binding={original:true};
 const gl={ELEMENT_ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER_BINDING:2,STATIC_DRAW:3,UNSIGNED_INT:4,UNSIGNED_SHORT:5,
 getParameter(){return binding;},createBuffer(){return {id:++calls.created};},bindBuffer(t,b){binding=b;},bufferData(t,array){calls.data.push(array.slice());},deleteBuffer(b){calls.deleted.push(b);}};
 const renderer={getContext:()=>gl,domElement:canvas,shadowMap:{render:fn=>fn()}};
 return {renderer,canvas,gl,calls,getBinding:()=>binding};
}
const shadowArgs=(renderer,mesh)=>[renderer,mesh,new THREE.Camera(),new THREE.Camera(),mesh.geometry,mesh.customDepthMaterial,null];

test('only normal is ignored; UV, wind and signed-zero bits remain distinct and order is retained',()=>{
 const g=fixture(),original=g.index,record=createTreeShadowIndex(g);assert.deepEqual([...record.index],[0,1,2,0,1,2]);assert.strictEqual(g.index,original);assert.equal(record.stats.remappedVertices,3);record.dispose();
 for(const [name,component]of [['position',0],['uv',0],['aPlantWind',1]]){
  const modified=fixture(),a=modified.getAttribute(name);a.array[3*a.itemSize+component]=name==='aPlantWind'?.2:-0;
  const r=createTreeShadowIndex(modified);assert.equal(r.index[3],3,name+' must not merge changed input');r.dispose();modified.dispose();
 }
 g.dispose();
});

test('zero-benefit geometry does not install hooks or allocate indices',()=>{
 const g=fixture();g.setIndex([0,1,2]);const mesh=new THREE.Mesh(g),before=mesh.onBeforeShadow,r=createTreeShadowIndex(g),handle=installTreeShadowIndex(mesh,r);assert.equal(r.index,null);assert.equal(r.stats.bytes,0);assert.strictEqual(mesh.onBeforeShadow,before);handle.dispose();g.dispose();
});

test('shared GPU buffer, live toggle, original hooks, exceptions and owned cleanup',()=>{
 const g=fixture(),record=createTreeShadowIndex(g),{renderer,gl,calls,getBinding}=rendererFixture(),state=installShadowIndexRenderer(renderer),initialBinding=getBinding(),enabled={value:true};
 const mesh=new THREE.Mesh(g),original=g.index,events=[];mesh.onBeforeShadow=()=>events.push('before');mesh.onAfterShadow=()=>{events.push('after');assert.strictEqual(g.index,original);};
 const handle=installTreeShadowIndex(mesh,record,{enabled});
 const draw=()=>{const args=shadowArgs(renderer,mesh);mesh.onBeforeShadow(...args);assert.ok(g.index.isGLBufferAttribute);assert.equal(g.index.count,original.count);mesh.onAfterShadow(...args);};
 renderer.shadowMap.render(draw);renderer.shadowMap.render(draw);assert.equal(calls.created,1);assert.equal(record.stats.draws,2);assert.equal(record.stats.uploads,1);assert.strictEqual(getBinding(),initialBinding);assert.deepEqual(events,['before','after','before','after']);
 enabled.value=false;renderer.shadowMap.render(()=>{const args=shadowArgs(renderer,mesh);mesh.onBeforeShadow(...args);assert.strictEqual(g.index,original);mesh.onAfterShadow(...args);});assert.equal(record.stats.draws,2);enabled.value=true;
 assert.throws(()=>renderer.shadowMap.render(()=>{mesh.onBeforeShadow(...shadowArgs(renderer,mesh));throw new Error('draw failed');}),/draw failed/);assert.strictEqual(g.index,original);assert.equal(state.active.size,0);
 renderer.shadowMap.render(draw);record.dispose();assert.equal(calls.deleted.length,1);assert.equal(record.stats.liveBuffers,0);assert.strictEqual(g.index,original);record.dispose();handle.dispose();state.dispose();assert.equal(calls.deleted.length,1);g.dispose();
});

test('upload failure restores GL binding, context loss rebuilds, and renderer detach releases its buffer',()=>{
 const g=fixture(),record=createTreeShadowIndex(g),{renderer,canvas,gl,calls,getBinding}=rendererFixture(),state=installShadowIndexRenderer(renderer),mesh=new THREE.Mesh(g),original=g.index,previous=getBinding();installTreeShadowIndex(mesh,record);
 const upload=gl.bufferData;gl.bufferData=()=>{throw new Error('upload failed');};assert.throws(()=>renderer.shadowMap.render(()=>mesh.onBeforeShadow(...shadowArgs(renderer,mesh))),/upload failed/);assert.strictEqual(g.index,original);assert.strictEqual(getBinding(),previous);assert.equal(calls.deleted.length,1);gl.bufferData=upload;
 const draw=()=>{const args=shadowArgs(renderer,mesh);mesh.onBeforeShadow(...args);mesh.onAfterShadow(...args);};renderer.shadowMap.render(draw);canvas.dispatchEvent(new Event('webglcontextlost'));assert.equal(record.stats.liveBuffers,0);renderer.shadowMap.render(draw);assert.equal(record.stats.uploads,2);state.dispose();assert.equal(record.stats.liveBuffers,0);assert.equal(calls.deleted.length,2);record.dispose();g.dispose();
});

test('all 15 real foliage geometries preserve each shadow triangle input exactly',async()=>{
 const root=new URL('../../public/assets/v2/',import.meta.url),m=JSON.parse(await readFile(new URL('spruce-canopy-v1.json',root))),bytes=gunzipSync(await readFile(new URL(m.payload.file,root))),types={Float32Array,Uint16Array,Uint32Array};
 let before=0,after=0;
 for(const [name,part]of Object.entries(m.parts)){
  const array=d=>new types[d.type](bytes.buffer,bytes.byteOffset+d.byteOffset,d.length),g=new THREE.BufferGeometry();
  for(const [key,d]of Object.entries(part.attributes))g.setAttribute(key,new THREE.BufferAttribute(array(d),d.itemSize,d.normalized));g.setIndex(new THREE.BufferAttribute(array(part.index),1));
  if(!name.startsWith('near:'))prepareTreeWindCoefficients(g);
  const r=createTreeShadowIndex(g),old=g.index.array,next=r.index||old;assert.equal(next.length,old.length);before+=r.stats.beforeVertices;after+=r.stats.afterVertices;
  for(const [key,a]of Object.entries(g.attributes))if(key!=='normal'){
   const arr=a.isInterleavedBufferAttribute?a.data.array:a.array,bits=new Uint32Array(arr.buffer,arr.byteOffset,arr.length),stride=a.isInterleavedBufferAttribute?a.data.stride:a.itemSize,offset=a.isInterleavedBufferAttribute?a.offset:0;
   for(let i=0;i<old.length;i++)for(let k=0;k<a.itemSize;k++)assert.equal(bits[old[i]*stride+offset+k],bits[next[i]*stride+offset+k],name+'/'+key);
  }
  if(name.startsWith('mid:'))assert.equal(r.index,null);r.dispose();g.dispose();
 }
 assert.equal(before,315283);assert.equal(after,280306);
});
