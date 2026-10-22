import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadFarSpruceAssets} from './spruce-far-impostor.js';

const dir=new URL('../../public/assets/v2/spruce/far-v14/',import.meta.url);
const metadata=JSON.parse(readFileSync(new URL('impostor-manifest.json',dir)));
const sourceURL='./assets/v2/spruce/far-v14/impostor-manifest.json';
const bytesFor=url=>gunzipSync(readFileSync(new URL(new URL(url,'http://localhost/').pathname.split('/').at(-1),dir)));
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const actualFetch=async url=>String(url).endsWith('.json')?{ok:true,json:async()=>structuredClone(metadata)}:{ok:true,arrayBuffer:async()=>arrayBuffer(bytesFor(url))};

test('bundled canonical metadata starts both complete payloads before any manifest round trip',async()=>{
 const requests=[];let releases=[];
 const result=loadFarSpruceAssets({fetch:url=>{requests.push(String(url));return new Promise(resolve=>releases.push(()=>resolve({ok:true,arrayBuffer:async()=>arrayBuffer(bytesFor(url))})));}});
 assert.equal(requests.length,2);assert.ok(requests.every(url=>!url.endsWith('.json')));
 assert.ok(requests.some(url=>url.includes('albedo')));assert.ok(requests.some(url=>url.includes('normal')));
 let complete=false;result.then(()=>complete=true);await Promise.resolve();assert.equal(complete,false);
 for(const release of releases)release();const loaded=await result;
 assert.equal(loaded.stats.manifestMode,'bundled');assert.deepEqual(loaded.metadata,metadata);
 assert.equal(loaded.albedo.image.depth,120);assert.equal(loaded.normal.image.depth,120);assert.equal(loaded.stats.decodedBytes,47185920);
 loaded.dispose();
});

test('bundled and network paths preserve every decoded texel, capture frame, texture option and isolation',async()=>{
 for(const transport of ['v26','v27']){
  const bundled=await loadFarSpruceAssets({fetch:actualFetch,transport});
  const reference=await loadFarSpruceAssets({fetch:actualFetch,transport,manifest:'network'});
  assert.equal(reference.stats.manifestMode,'network');assert.deepEqual(bundled.metadata,reference.metadata);
  for(const kind of ['albedo','normal']){
   assert.deepEqual(bundled[kind].image.data,reference[kind].image.data);
   for(const key of ['format','type','colorSpace','minFilter','magFilter','generateMipmaps','wrapS','wrapT','flipY','unpackAlignment'])assert.equal(bundled[kind][key],reference[kind][key]);
  }
  // A caller cannot corrupt the metadata bound to a later load.
  bundled.metadata.frames[0].rect[0]=999;
  const next=await loadFarSpruceAssets({fetch:actualFetch,transport});assert.deepEqual(next.metadata,metadata);
  bundled.dispose();reference.dispose();next.dispose();
 }
});

test('custom manifests remain authoritative and failures or cancellation cannot publish an incomplete tree',async()=>{
 const requests=[];
 const custom=await loadFarSpruceAssets({url:'http://localhost/custom/impostor-manifest.json',manifest:'bundled',fetch:async url=>{requests.push(String(url));return actualFetch(url);}});
 assert.equal(requests[0],'http://localhost/custom/impostor-manifest.json');assert.equal(custom.stats.manifestMode,'network');custom.dispose();
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadFarSpruceAssets({signal:controller.signal,fetch:()=>{throw Error('must not request');}}),e=>e.name==='AbortError');
 await assert.rejects(loadFarSpruceAssets({fetch:async()=>({ok:false,status:503})}),/503/);
 const old=await loadFarSpruceAssets({url:sourceURL,manifest:'network',fetch:actualFetch});assert.equal(old.stats.manifestMode,'network');old.dispose();
});
