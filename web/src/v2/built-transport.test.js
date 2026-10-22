import test from 'node:test';import assert from 'node:assert/strict';
import {useNativeGzip} from '../../built-preview.js';
import {decodeGzipBytes} from './world-data.js';
import {gzipSync} from 'node:zlib';
test('native lossless decoding is restricted to current build gzip assets with explicit opt-out',()=>{
 const req={headers:{'accept-encoding':'gzip, deflate, br, zstd',referer:'http://127.0.0.1:5174/dist-v2/v2.html?profile=1'}};
 assert.equal(useNativeGzip(req,'dist-v2','/dist-v2/data/core_height.bin.gz'),true);
 assert.equal(useNativeGzip(req,'dist-route-v21-baseline','/dist-route-v21-baseline/data/core_height.bin.gz'),true,'round20 baseline keeps its native gzip behavior');
 assert.equal(useNativeGzip(req,'dist-route-v20-baseline','/dist-route-v20-baseline/data/core_height.bin.gz'),false);
 assert.equal(useNativeGzip(req,'dist-v2','/dist-v2/assets/world.glb'),false);
 assert.equal(useNativeGzip({headers:{}},'dist-v2','/dist-v2/a.gz'),false);
 assert.equal(useNativeGzip({headers:{'accept-encoding':'br, gzip;q=0'}},'dist-v2','/dist-v2/a.gz'),false);
 assert.equal(useNativeGzip({...req,headers:{...req.headers,referer:req.headers.referer+'&httpGzip=0'}},'dist-v2','/dist-v2/a.gz'),false);
});
test('HTTP decoded and application decoded transport produce identical bytes, without a second decode',async()=>{
 const source=Uint8Array.from({length:8192},(_,i)=>i*17%251),packed=gzipSync(source);
 assert.deepEqual(await decodeGzipBytes(packed),source);
 assert.equal(await decodeGzipBytes(source),source);
});
