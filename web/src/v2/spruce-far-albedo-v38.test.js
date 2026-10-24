import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {restoreFarAlbedoRGBA,farAlbedoTransport38,verifyFarAlbedoPayload38} from './spruce-far-transport.js';
import {loadFarSpruceAssets} from './spruce-far-impostor.js';
const dir=new URL('../../public/assets/v2/spruce/far-v14/',import.meta.url);
const m=JSON.parse(readFileSync(new URL('impostor-manifest.json',dir)));
const descriptor=JSON.parse(readFileSync(new URL('albedo-lossless-v38.json',dir)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload=name=>readFileSync(new URL(name,dir));
test('green restoration preserves wrapping, zero-alpha RGB, offset views and input ownership',()=>{
 const owner=Uint8Array.from([99,250,1,20,255,10,254,0,255,88]),input=owner.subarray(1,9),saved=owner.slice();
 const out=restoreFarAlbedoRGBA(input,2);
 assert.deepEqual([...out],[14,250,4,0,0,1,255,255]);assert.deepEqual(owner,saved);assert.notEqual(out.buffer,owner.buffer);
 for(const n of [0,-1,1,2.5])assert.throws(()=>restoreFarAlbedoRGBA(input,n),/byte count/);
});
test('published green bytes reconstruct every original byte including alpha-zero RGB',async()=>{
 const f=farAlbedoTransport38(m,descriptor),packed=payload(f.url),planes=gunzipSync(packed),saved=planes.slice();
 await verifyFarAlbedoPayload38(packed,f,true);await verifyFarAlbedoPayload38(planes,f,false);
 const original=gunzipSync(payload(m.files.find(f=>f.kind==='albedo').url));
 const out=restoreFarAlbedoRGBA(planes,m.width*m.height*m.layers);
 assert.equal(Buffer.compare(Buffer.from(out),original),0);assert.equal(sha(out),f.rgbaSHA256);assert.deepEqual(planes,saved);
});
test('wrong capture, encoding, dimensions and same-sized wrong payload fail explicitly',async()=>{
 for(const change of [t=>t.version++,t=>t.encoding='rgba',t=>t.captureSHA256='0'.repeat(64),t=>t.rgbaSHA256='0'.repeat(64),t=>t.width++,t=>t.url='wrong.gz',t=>t.decodedBytes--]){
  const t=structuredClone(descriptor);change(t);assert.throws(()=>farAlbedoTransport38(m,t),/contract/);
 }
 const f=farAlbedoTransport38(m,descriptor),packed=payload(f.url),planes=gunzipSync(packed);
 for(const [raw,gzip] of [[packed,true],[planes,false]]){const bad=raw.slice();bad[bad.length-1]^=1;await assert.rejects(verifyFarAlbedoPayload38(bad,f,gzip),/SHA256/);await assert.rejects(verifyFarAlbedoPayload38(raw.subarray(1),f,gzip),/length/);}
});
const fetcher=decoded=>async url=>{
 const name=new URL(url).pathname.split('/').pop(),bytes=payload(name);
 if(name.endsWith('.json'))return {ok:true,json:async()=>JSON.parse(bytes)};
 const body=decoded?gunzipSync(bytes):bytes;
 return {ok:true,url,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)};
};
test('candidate loader restores exact albedo before normal shared alpha in both HTTP modes and legacy normal',async()=>{
 for(const decoded of [false,true])for(const transport of ['v26','v27']){
  const options={url:'http://localhost/impostor-manifest.json',fetch:fetcher(decoded),transport};
  const base=await loadFarSpruceAssets({...options,farLossless38:false});
  const candidate=await loadFarSpruceAssets({...options,farLossless38:true});
  try{for(const kind of ['albedo','normal'])assert.equal(Buffer.compare(Buffer.from(base[kind].image.data),Buffer.from(candidate[kind].image.data)),0);
   assert.equal(candidate.stats.encodedBytes,base.stats.encodedBytes-m.files[0].bytes+descriptor.bytes);
   assert.equal(candidate.stats.gpuTextureBytes,base.stats.gpuTextureBytes);assert.equal(candidate.stats.decodedBytes,base.stats.decodedBytes);
   assert.equal(candidate.stats.applicationGzipDecodes,decoded?0:2);assert.ok(candidate.stats.albedoRestoreMs>0);assert.ok(candidate.stats.payloadVerificationMs>0);assert.equal(base.stats.farLossless38,false);
  }finally{base.dispose();candidate.dispose();}
 }
});
test('same-length legacy RGBA cannot be silently interpreted as candidate planar payload',async()=>{
 const original=gunzipSync(payload(m.files[0].url));
 const badFetch=async url=>new URL(url).pathname.endsWith(descriptor.url)?{ok:true,url,arrayBuffer:async()=>original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)}:fetcher(true)(url);
 await assert.rejects(loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:badFetch,farLossless38:true}),/SHA256/);
});

test('verified green transport is default and URL zero restores original transport',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location');
 try{
  for(const [search,expected] of [['',true],['?farLossless38=0',false],['?farLossless38=1',true]]){
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search,href:'http://localhost/'}});
   const loaded=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetcher(true)});
   try{assert.equal(loaded.stats.farLossless38,expected);
    assert.equal(loaded.stats.encodedBytes,(expected?descriptor.bytes:m.files[0].bytes)+m.files[1].losslessTransport.bytes);
    for(const kind of ['albedo','normal'])assert.equal(sha(loaded[kind].image.data),m.files.find(f=>f.kind===kind).sha256);
   }finally{loaded.dispose();}
  }
 }finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
});
