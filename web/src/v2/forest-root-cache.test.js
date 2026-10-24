import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import {gunzipSync}from 'node:zlib';
import {ForestRootCache,forestRootCacheEligibility}from './forest-root-cache.js';
import {decodeForestRootBundle,forestRootFromTile,rootBytesSHA}from './forest-root-codec.js';
import {forestRootCodeBinding}from '../../forest-root-binding.js';
import {WorldEcology}from './ecology.js';
const manifest=JSON.parse(readFileSync(new URL('../../public/data/v2/forest-roots-38.json',import.meta.url)));
const packed=new Uint8Array(readFileSync(new URL('../../public/data/v2/forest-roots-38.bin.gz',import.meta.url)));
const raw=new Uint8Array(gunzipSync(packed));
function harness({code=manifest.code,inputs=manifest.inputs,transport=packed,field=manifest,fail=false}={}){
 const calls=[];
 const cache=new ForestRootCache({getForestRootInputHashes:async()=>inputs},{
  search:'?forestRootCache=1',loadCode:async()=>code,
  fetchImpl:async url=>{calls.push(url);if(fail)throw new Error('offline');
   return url.includes('.json')?{ok:true,json:async()=>field}:{ok:true,arrayBuffer:async()=>transport.slice().buffer};
  }
 });return {cache,calls};
}
test('bundle binds the currently compiled root source, no stale manifest accepted',()=>{
 assert.deepEqual(manifest.code,forestRootCodeBinding());
 assert.ok(manifest.code.sources.some(s=>s.path==='src/v2/river-bed-profile.js'));
});
test('cache is opt-in and unsupported spatial/layout experiments retain procedural roots',async()=>{
 assert.equal(forestRootCacheEligibility('', 'v15'),'disabled');
 assert.equal(forestRootCacheEligibility('?forestRootCache=1','v15'),null);
 assert.equal(forestRootCacheEligibility('?forestRootCache=1&forestPriorityFirst=0&ecologyExclusionIndex=1','v15'),null);
 assert.match(forestRootCacheEligibility('?forestRootCache=1','v14'),/layout/);
 for(const key of ['demInterpolation','landcoverSampling','riverMeanders','bankProfile','bankContour','bankShoulders','shoreLobes','brookLandform','brookIncision','brookMeanders','valleyLandform','valleyMeanders','valleySection'])
  assert.match(forestRootCacheEligibility('?forestRootCache=1&'+key+'=0','v15'),/spatial/);
 const cache=new ForestRootCache({}, {search:'',fetchImpl:()=>assert.fail('disabled cache fetched')});
 assert.equal(await cache.prepare(),false);assert.equal(cache.at(-1,0),undefined);
});
test('loaded 134-tile records preserve all Float64 values, identities, nulls and source object key order',async()=>{
 const {cache,calls}=harness();assert.equal(await cache.prepare(),true);assert.equal(calls.length,2);
 const rows=[];let trees=0;
 for(const tile of manifest.tiles)for(let z=tile.tz*32;z<(tile.tz+1)*32;z++)for(let x=tile.tx*32;x<(tile.tx+1)*32;x++){
  const root=cache.at(x,z);rows.push(root);if(!root)continue;trees++;
  assert.equal(root.id,'spruce:'+x+':'+z);assert.equal(Object.keys(root).join(','),'id,x,y,z,s,rot,variant');
  assert.strictEqual(cache.at(x,z),root);
 }
 assert.equal(rows.length,137216);assert.equal(trees,80927);
 assert.equal(await rootBytesSHA(new TextEncoder().encode(JSON.stringify(rows))),manifest.recordDigest);
 assert.equal(cache.stats.records,80927);assert.equal(cache.at(100000,100000),undefined);
 const eco={rootCache:cache,forestLayout:{at:()=>({procedural:true})}};
 assert.deepEqual(WorldEcology.prototype.treeAt.call(eco,100000,100000),{procedural:true});
 const t=manifest.tiles[0],sample=cache.at(t.tx*32,t.tz*32);
 assert.strictEqual(WorldEcology.prototype.treeAt.call(eco,t.tx*32,t.tz*32),sample);
 cache.dispose();assert.equal(cache.at(t.tx*32,t.tz*32),undefined);assert.equal(cache.tiles.size,0);
});
test('source or actual world data mismatch rejects before downloading bundle',async()=>{
 for(const options of [{code:{signature:'changed'}},{inputs:{...manifest.inputs,meta:'changed'}}]){
  const {cache,calls}=harness(options);assert.equal(await cache.prepare(),false);
  assert.equal(calls.length,1);assert.equal(cache.stats.status,'fallback');assert.equal(cache.at(0,0),undefined);
 }
});
test('missing and corrupt downloads fail closed to the original algorithm',async()=>{
 const corrupt=packed.slice();corrupt[100]^=1;
 for(const options of [{fail:true},{transport:corrupt},{transport:packed.subarray(1)}]){
  const {cache}=harness(options);assert.equal(await cache.prepare(),false);
  assert.equal(cache.ready,false);assert.equal(cache.tiles.size,0);assert.equal(cache.stats.status,'fallback');
 }
});
test('individual block identities, checksums and occupancy remain validated even if outer hash matches',async()=>{
 const corrupt=raw.slice(),entry=manifest.tiles[0];corrupt[entry.offset+16]^=1;
 const altered={...manifest,rawSHA256:await rootBytesSHA(corrupt)};
 await assert.rejects(()=>decodeForestRootBundle(corrupt,altered),/tile checksum/);
 const wrong={...manifest,tiles:manifest.tiles.map((t,i)=>i===0?{...t,tx:t.tx+1}:t)};
 await assert.rejects(()=>decodeForestRootBundle(raw,wrong),/identity/);
 const changedHeader=raw.slice();new DataView(changedHeader.buffer).setUint32(12,manifest.trees-1,true);
 await assert.rejects(async()=>decodeForestRootBundle(changedHeader,{...manifest,rawSHA256:await rootBytesSHA(changedHeader)}),/header/);
 const tiles=await decodeForestRootBundle(raw,manifest),t=tiles.values().next().value;
 assert.throws(()=>forestRootFromTile(t,t.tx*32,t.tz*32-1),/outside/);
});
test('abort or disposal while fetching never activates decoded roots',async()=>{
 for(const action of ['abort','dispose']){
  const {cache}=harness(),controller=new AbortController();
  const pending=cache.prepare({signal:controller.signal});
  if(action==='abort')controller.abort();else cache.dispose();
  assert.equal(await pending,false);assert.equal(cache.ready,false);assert.equal(cache.tiles.size,0);
 }
});

test('default fetch preserves the browser Window receiver',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=function(url){
  assert.strictEqual(this,globalThis);calls++;
  return Promise.resolve(url.includes('.json')?{ok:true,json:async()=>manifest}:{ok:true,arrayBuffer:async()=>packed.slice().buffer});
 };
 try{
  const cache=new ForestRootCache({getForestRootInputHashes:async()=>manifest.inputs},{search:'?forestRootCache=1',loadCode:async()=>manifest.code});
  assert.equal(await cache.prepare(),true);assert.equal(calls,2);assert.equal(cache.stats.status,'ready');cache.dispose();
 }finally{globalThis.fetch=previous;}
});

test('HTTP transparently decompressed delivery validates the exact raw digest before activation',async()=>{
 const {cache}=harness({transport:raw});
 assert.equal(await cache.prepare(),true);assert.equal(cache.stats.delivery,'http-decoded-body');
 assert.equal(cache.stats.responseBytes,manifest.rawBytes);assert.equal(cache.stats.trees,80927);
 cache.dispose();
 const changed=raw.slice();changed[128]^=1;
 const broken=harness({transport:changed}).cache;
 assert.equal(await broken.prepare(),false);assert.equal(broken.ready,false);
 assert.match(broken.stats.reason,/HTTP-decoded checksum/);
});
