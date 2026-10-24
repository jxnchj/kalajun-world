import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import {gunzipSync}from'node:zlib';
import manifest from './lodge-door-package.json' with {type:'json'};
import local from './lodge-room-data.js';import cross from './lodge-cross-data.js';
import {decodeLodgeDoorPackage,lodgeSHA}from'./lodge-door-codec.js';
import {loadLodgeDoorPackage}from'./lodge-door-package.js';
const bases={local,cross},original=await Promise.all([0,1,2].map(i=>import('./lodge-door-data/'+i+'.js').then(m=>m.default)));
const packed=new Uint8Array(await readFile(new URL('../../public/'+manifest.url,import.meta.url))),raw=gunzipSync(packed);
test('lossless delta restores every original state object, Float16 bit and compressed direction string exactly',async()=>{
 assert.equal(packed.length,manifest.gzipBytes);assert.equal(await lodgeSHA(packed),manifest.sha256);assert.equal(raw.length,manifest.rawBytes);assert.equal(await lodgeSHA(raw),manifest.rawSHA256);
 const states=await decodeLodgeDoorPackage(raw,bases);for(let i=0;i<3;i++)assert.equal(JSON.stringify(states[i]),JSON.stringify(original[i]));assert.ok(packed.length<800000,'not shipping original 7.86MB modules');
});
test('gzip and HTTP transparently decoded bodies both use one request and never fetch full modules on success',async()=>{
 for(const body of [packed,raw]){
  let calls=0,fallback=0;const stats={},fetchImpl=async url=>{calls++;assert.match(url,/lodge-door-gi-38\.xor\.gz\?v=/);return new Response(body);};
  const states=await loadLodgeDoorPackage(bases,{fetchImpl,stats,fallbackLoaders:[0,1,2].map(i=>async()=>{fallback++;return original[i];})});
  assert.equal(calls,1);assert.equal(fallback,0);assert.equal(stats.status,'delta');assert.ok(stats.scheduler.yields>0,'decoding yields between unchanged complete directions');assert.deepEqual(states,original);
  console.log(JSON.stringify({delivery:stats.delivery,decodeMs:stats.decodeMs,yields:stats.scheduler.yields,maxOverrunMs:stats.scheduler.maxOverrunMs}));
 }
});
test('corrupt transport fails closed then explicitly loads retained original states only as fallback',async()=>{
 const bad=packed.slice();bad[bad.length-8]^=1;let fallback=0;const stats={};
 const states=await loadLodgeDoorPackage(bases,{fetchImpl:async()=>new Response(bad),stats,fallbackLoaders:[0,1,2].map(i=>async()=>{fallback++;return original[i];})});
 assert.equal(stats.status,'fallback');assert.match(stats.reason,/checksum/);assert.equal(fallback,3);assert.deepEqual(states,original);
 await assert.rejects(loadLodgeDoorPackage(bases,{fetchImpl:async()=>new Response(bad)}),/checksum/);
});
test('wrong base, incomplete packet and mutated coefficients cannot become apparently valid restored states',async()=>{
 await assert.rejects(decodeLodgeDoorPackage(raw,{local:{...local,key:'other'},cross}),/base checksum/);
 await assert.rejects(decodeLodgeDoorPackage(raw.subarray(0,raw.length-1),bases),/field range/);
 const bad=raw.slice();bad[bad.length-1]^=1;await assert.rejects(decodeLodgeDoorPackage(bad,bases),/Restored lodge state checksum/);
});

test('chunked source serialization preserves native JSON SHA and yields within full solar tables',async()=>{
 const {lodgeObjectSHA}=await import('./lodge-door-codec.js');const encode=new TextEncoder();
 for(const value of [local,cross,...original,{quote:'\"\\\n喀拉峻',numbers:[0,-0,1.2,1e-12,null],omit:undefined}]){
  let checks=0;const actual=await lodgeObjectSHA(value,{checkpoint:()=>{checks++;return checks%5===0?Promise.resolve():null;}});
  assert.equal(actual,await lodgeSHA(encode.encode(JSON.stringify(value))));
  if(value===local)assert.ok(checks>50,'checks occur inside multi-megabyte source instead of only after digest');
 }
});
