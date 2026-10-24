import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {SpruceSharedImages} from './spruce-shared-images.js';
import {createSpruceLoader} from './spruce-loading.js';
import {loadWorldGLB} from './glb-transport.js';
import {canopySourceDigests} from './spruce-canopy-cache.js';
const base=new URL('../../public/',import.meta.url),m=JSON.parse(readFileSync(new URL('assets/v2/spruce/shared-v38/manifest.json',base))),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=n=>readFileSync(new URL(n,base)),buffers=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const bitmapRecords=[];
async function bitmap(blob,options){const data=Buffer.from(await blob.arrayBuffer()),image={width:data.readUInt32BE(16),height:data.readUInt32BE(20),sha:sha(data),closed:0,close(){this.closed++;this.width=this.height=0;}};bitmapRecords.push({image,options});return image;}
function requests(){const calls=[];return {calls,fetchImpl:async url=>{const path=new URL(url,'http://localhost/').pathname.slice(1);calls.push(path);return new Response(raw(path));}};}
function meshes(gltf){const result=new Map();gltf.scene.traverse(o=>{if(o.isMesh)result.set(o.name,o);});return result;}
function textures(material){return Object.fromEntries(Object.entries(material).filter(([,v])=>v?.isTexture));}
const textureState=t=>Object.fromEntries(['mapping','channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','internalFormat','type','colorSpace','flipY','premultiplyAlpha','unpackAlignment','generateMipmaps','rotation','matrixAutoUpdate','compareFunction',...['offset','repeat','center','matrix']].map(k=>[k,t[k]?.toArray?t[k].toArray():t[k]]));
function disposeGltf(gltf){const gs=new Set(),ms=new Set(),ts=new Set();gltf?.scene?.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){ms.add(material);Object.values(textures(material)).forEach(t=>ts.add(t));}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}

test('replacement package contains original PNG bytes exactly once and current canonical source bindings',()=>{
 let saved=0;for(const lod of ['hi','mid']){const entry=m.lods[lod],original=raw(entry.source),n=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+n)),bin=original.subarray(n+28);assert.equal(sha(original),entry.sourceSha256);assert.equal(sha(gunzipSync(raw(entry.url))),entry.sha256);
  for(const image of json.images){const v=json.bufferViews[image.bufferView],png=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),entry=m.images.find(e=>e.sha256===sha(png));assert.ok(entry);assert.deepEqual(raw(entry.url),png);saved+=png.length;}
 }
 assert.equal(m.images.length,3);assert.equal(saved-m.images.reduce((n,e)=>n+e.bytes,0),1845768);assert.equal(m.bytes.savedBytes,1721665);assert.ok(m.bytes.replacementBytes<m.bytes.previousBytes);
});

test('real GLTFLoader: geometry, canopy source digests, material sampler/UV/colour remain exact; hi+mid download/decode 3 images and share pixel Sources',async()=>{
 const beforeSelf=globalThis.self,beforeBitmap=globalThis.createImageBitmap;globalThis.self=globalThis;globalThis.createImageBitmap=bitmap;const request=requests(),original=[],candidate=[];let pool;
 try{
  bitmapRecords.length=0;for(const lod of ['hi','mid'])original.push(await loadWorldGLB('./'+m.lods[lod].source,createSpruceLoader(),{fetchImpl:request.fetchImpl}));const originalDecodeCount=bitmapRecords.length;
  request.calls.length=0;bitmapRecords.length=0;pool=new SpruceSharedImages({search:'',fetchImpl:request.fetchImpl,bitmapImpl:bitmap});candidate.push(...await Promise.all(['hi','mid'].map(lod=>pool.load(lod,createSpruceLoader()))));
  assert.equal(originalDecodeCount,5);assert.equal(bitmapRecords.length,3);assert.equal(pool.stats.imageRequests,3);assert.equal(pool.stats.imageDecodes,3);assert.equal(request.calls.length,5);assert.ok(request.calls.every(p=>p.includes('/shared-v38/')));assert.equal(pool.stats.sharedSourceSlots,2);
  for(let i=0;i<2;i++){
   assert.deepEqual(await canopySourceDigests(candidate[i]),await canopySourceDigests(original[i]));const a=meshes(original[i]),b=meshes(candidate[i]);assert.deepEqual([...a.keys()],[...b.keys()]);
   for(const [name,source]of a){const actual=b.get(name);assert.deepEqual(actual.matrix,source.matrix);assert.deepEqual(Object.keys(actual.geometry.attributes),Object.keys(source.geometry.attributes));
    for(const [key,attr]of Object.entries(source.geometry.attributes)){const value=actual.geometry.attributes[key];assert.equal(value.itemSize,attr.itemSize);assert.equal(value.normalized,attr.normalized);assert.equal(value.array.constructor,attr.array.constructor);assert.deepEqual(buffers(value.array),buffers(attr.array));}
    assert.deepEqual(buffers(actual.geometry.index.array),buffers(source.geometry.index.array));assert.deepEqual(actual.geometry.groups,source.geometry.groups);
    const sa=source.material,ma=actual.material;for(const key of ['name','side','alphaTest','transparent','roughness','metalness','opacity','depthWrite','depthTest'])assert.equal(ma[key],sa[key]);assert.deepEqual(ma.color,sa.color);assert.deepEqual(ma.normalScale,sa.normalScale);
    const st=textures(sa),mt=textures(ma);assert.deepEqual(Object.keys(mt),Object.keys(st));for(const key of Object.keys(st)){assert.deepEqual(textureState(mt[key]),textureState(st[key]));assert.equal(mt[key].image.sha,st[key].image.sha);assert.deepEqual(candidate[i].parser.associations.get(mt[key]),original[i].parser.associations.get(st[key]));}
   }
  }
  for(const record of bitmapRecords)assert.deepEqual(record.options,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const hi=meshes(candidate[0]),mid=meshes(candidate[1]);for(const name of ['column_bark','column_frond'])assert.strictEqual(hi.get(name).material.map.source,mid.get(name).material.map.source);
  candidate.forEach(disposeGltf);candidate.length=0;pool.dispose();await Promise.resolve();assert.ok(bitmapRecords.every(r=>r.image.closed===1));pool.dispose();assert.ok(bitmapRecords.every(r=>r.image.closed===1));
 }finally{original.forEach(disposeGltf);candidate.forEach(disposeGltf);pool?.dispose();globalThis.self=beforeSelf;globalThis.createImageBitmap=beforeBitmap;}
});

test('off/unsupported/source-changed route requests only complete original assets',async()=>{
 for(const options of [{search:'?spruceSharedImages=0'},{search:'?spruceSharedImages=1',bitmapImpl:null},{search:'?spruceSharedImages=1',sourceManifest:{assets:{}}}]){let original=0;const p=new SpruceSharedImages({bitmapImpl:bitmap,...options,fetchImpl:()=>{throw Error('unexpected replacement request');},loadOriginal:async url=>{original++;return {url,complete:true};}});assert.equal((await p.load('hi',{})).complete,true);assert.equal(original,1);p.dispose();}
});

test('network or PNG failure recovers complete original LOD, never parses a missing-map tree',async()=>{
 for(const mode of ['geometry','image']){let originals=0,parses=0;const req=requests(),p=new SpruceSharedImages({search:'?spruceSharedImages=1',bitmapImpl:bitmap,fetchImpl:async(url,opts)=>String(url).endsWith('.png')=== (mode==='image')?new Response('',{status:503}):req.fetchImpl(url,opts),loadOriginal:async()=>{originals++;return {complete:true};}});p.loader.parseAsync=async()=>{parses++;throw Error('should not parse');};assert.deepEqual(await p.load('hi',{}),{complete:true});assert.equal(originals,1);assert.equal(parses,0);assert.equal(p.stats.byLod.hi.status,'fallback');p.dispose();}
});

test('abort does not restart original downloads, late decoded shared images close and are not published',async()=>{
 const controller=new AbortController(),req=requests();let originals=0,release,started;const begun=new Promise(r=>started=r),gate=new Promise(r=>release=r),images=[];
 const p=new SpruceSharedImages({search:'?spruceSharedImages=1',signal:controller.signal,fetchImpl:req.fetchImpl,bitmapImpl:async(blob,options)=>{started();await gate;const result=await bitmap(blob,options);images.push(result);return result;},loadOriginal:async()=>{originals++;}});
 const pending=p.load('hi',{});pending.catch(()=>{});await begun;controller.abort(new DOMException('cancelled','AbortError'));release();await assert.rejects(pending,/cancelled|abort/i);assert.equal(originals,0);p.dispose();await Promise.allSettled([...p.images.values()]);await new Promise(r=>setTimeout(r,10));assert.ok(images.every(image=>image.closed===1));
});
