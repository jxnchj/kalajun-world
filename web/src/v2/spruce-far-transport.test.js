import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {FAR_NORMAL_TRANSPORT,restoreFarNormalRGBA,validateFarTransport} from './spruce-far-transport.js';
import {loadFarSpruceAssets,validateFarSpruceManifest} from './spruce-far-impostor.js';
const dir=new URL('../../public/assets/v2/spruce/far-v14/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('impostor-manifest.json',dir)));
const files=Object.fromEntries(manifest.files.map(f=>[f.kind,f]));
const source=kind=>gunzipSync(readFileSync(new URL(files[kind].url,dir)));
const digest=b=>createHash('sha256').update(b).digest('hex');
test('shared-alpha unpack preserves wrapped channel values and ALL RGB below zero alpha',()=>{
 const rgb=Uint8Array.from([255,128,0, 1,255,128, 5,0,255]),albedo=Uint8Array.from([1,2,3,0, 0,0,0,128, 0,0,0,255]);
 const saved=rgb.slice(),a=albedo.slice();
 assert.deepEqual([...restoreFarNormalRGBA(rgb,albedo,3)],[255,1,5,0,128,255,0,128,0,128,255,255]);
 assert.deepEqual(rgb,saved);assert.deepEqual(albedo,a);
 for(const n of [-1,0,2,3.5])assert.throws(()=>restoreFarNormalRGBA(rgb,albedo,n),/byte count/);
 assert.throws(()=>restoreFarNormalRGBA(rgb.subarray(1),albedo,3),/byte count/);
});
test('published normal RGB and shared alpha reconstruct the original full RGBA SHA256 byte for byte',()=>{
 validateFarSpruceManifest(manifest);
 const t=files.normal.losslessTransport,packed=readFileSync(new URL(t.url,dir));
 assert.equal(t.encoding,FAR_NORMAL_TRANSPORT);assert.equal(packed.length,t.bytes);assert.equal(digest(packed),t.gzipSHA256);
 const rgb=gunzipSync(packed),albedo=source('albedo'),normal=source('normal');
 assert.equal(rgb.length,t.decodedBytes);
 const out=restoreFarNormalRGBA(rgb,albedo,manifest.width*manifest.height*manifest.layers);
 assert.equal(digest(out),files.normal.sha256);assert.deepEqual(out,new Uint8Array(normal));
 assert.equal(digest(albedo),files.albedo.sha256);
 for(let i=3;i<normal.length;i+=4)assert.equal(normal[i],albedo[i]);
 assert.ok(t.bytes<files.normal.bytes*.8,'delivery format must have material measured benefit');
});
test('malformed alternative contracts fail instead of silently using legacy textures',()=>{
 for(const mutation of [t=>t.encoding='unknown',t=>t.alphaSource='normal',t=>t.decodedBytes--,t=>t.rgbaSHA256='0'.repeat(64),t=>t.gzipSHA256='bad']){
  const f=structuredClone(files.normal);mutation(f.losslessTransport);assert.throws(()=>validateFarTransport(f,128*384*120),/contract/);
 }
});
const fetcher=decoded=>async url=>{
 const name=new URL(url).pathname.split('/').pop();const bytes=readFileSync(new URL(name,dir));
 if(name.endsWith('.json'))return {ok:true,json:async()=>JSON.parse(bytes)};
 const body=decoded?gunzipSync(bytes):bytes;
 return {ok:true,url,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)};
};
test('real new and legacy loaders deliver identical GPU texture bytes through both HTTP and application gzip',async()=>{
 for(const decoded of [false,true]){
  const old=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetcher(decoded),transport:'v26'});
  const current=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetcher(decoded),transport:'v27'});
  for(const kind of ['albedo','normal'])assert.deepEqual(current[kind].image.data,old[kind].image.data);
  assert.equal(current.stats.encodedBytes,files.albedo.bytes+files.normal.losslessTransport.bytes);
  assert.equal(current.stats.decodedBytes,old.stats.decodedBytes);assert.equal(current.stats.gpuTextureBytes,old.stats.gpuTextureBytes);
  assert.equal(current.stats.applicationGzipDecodes,decoded?0:2);
  assert.equal(current.stats.transportMode,'v27');assert.ok(current.stats.rgbaRestoreMs>0);
  assert.ok(current.stats.encodedBytes<old.stats.encodedBytes*.89);
  console.log(JSON.stringify({farTransport:'v27',httpDecoded:decoded,restoreMs:current.stats.rgbaRestoreMs,oldBytes:old.stats.encodedBytes,newBytes:current.stats.encodedBytes}));
  old.dispose();current.dispose();
 }
});
