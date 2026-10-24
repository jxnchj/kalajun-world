import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {gzipSync}from 'node:zlib';
import {actualForestWorld}from './benchmark_forest_exclusion_v38.mjs';
import {ForestRootLayout}from '../web/src/v2/forest-root-layout.js';
import {cellRandom,createForestExclusionIndex,rootExcluded,originalForestRoot}from '../web/src/v2/forest-root-source.js';
import {FOREST_ROOT_BUNDLE_VERSION,encodeForestRootTile,decodeForestRootBundle,forestRootFromTile}from '../web/src/v2/forest-root-codec.js';
import {forestRootCodeBinding}from '../web/forest-root-binding.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),world=actualForestWorld(undefined,'rgba'),source=createForestExclusionIndex(world);
const layout=new ForestRootLayout(world,{originalAt:(x,z)=>originalForestRoot(source,x,z),excluded:(x,z,p)=>rootExcluded(source,x,z,p),random:cellRandom});
const p={x:-3611.9813305250705,z:4805.371282289286},wanted=[];
for(let z=Math.floor((p.z-2200)/384);z<=Math.floor((p.z+2200)/384);z++)for(let x=Math.floor((p.x-2200)/384);x<=Math.floor((p.x+2200)/384);x++){
 const d=Math.hypot((x+.5)*384-p.x,(z+.5)*384-p.z);if(d<2480)wanted.push({x,z,d});
}
wanted.sort((a,b)=>a.d-b.d);const selected=wanted.slice(0,134),chunks=[],tiles=[],rows=[],t=performance.now();let offset=16,trees=0;
for(const tile of selected){
 const records=[];for(let z=tile.z*32;z<(tile.z+1)*32;z++)for(let x=tile.x*32;x<(tile.x+1)*32;x++)records.push(layout.at(x,z));
 const bytes=encodeForestRootTile(tile.x,tile.z,records),count=records.filter(Boolean).length;
 chunks.push(bytes);tiles.push({tx:tile.x,tz:tile.z,offset,bytes:bytes.length,trees:count,sha256:sha(bytes)});offset+=bytes.length;trees+=count;rows.push(...records);
}
const rootsMs=performance.now()-t,recordDigest=sha(JSON.stringify(rows)),old=JSON.parse(readFileSync(new URL('./reports/forest-root-v38-exclusion-index.json',import.meta.url)));
assert.equal(recordDigest,old.samples[0].digest,'Every record and null must match the pre-extraction actual world baseline');
assert.equal(trees,80927);assert.equal(rows.length,137216);
const raw=new Uint8Array(offset),view=new DataView(raw.buffer);raw.set(new TextEncoder().encode('FR38'));view.setUint32(4,1,true);view.setUint32(8,tiles.length,true);view.setUint32(12,trees,true);
for(let i=0;i<tiles.length;i++)raw.set(chunks[i],tiles[i].offset);
const compressed=gzipSync(raw,{level:9}),inputs=await world.getForestRootInputHashes();
const manifest={version:FOREST_ROOT_BUNDLE_VERSION,url:'data/v2/forest-roots-38.bin.gz',code:forestRootCodeBinding(),inputs,trees,tiles,rawBytes:raw.length,rawSHA256:sha(raw),gzipBytes:compressed.length,sha256:sha(compressed),recordDigest,scope:'Exact current v15 root records for the 134 forest-creek 384m source tiles. ID/null/Float64 x,y,z,s,rot,variant preserved. All outside cells retain procedural generation.',anchor:p};
const decodeStart=performance.now(),decoded=await decodeForestRootBundle(raw,manifest);let i=0;
for(const tile of selected)for(let z=tile.z*32;z<(tile.z+1)*32;z++)for(let x=tile.x*32;x<(tile.x+1)*32;x++)assert.deepEqual(forestRootFromTile(decoded.get(tile.x+','+tile.z),x,z),rows[i++]);
const output=new URL('../web/public/data/v2/',import.meta.url);mkdirSync(output,{recursive:true});writeFileSync(new URL('forest-roots-38.bin.gz',output),compressed);writeFileSync(new URL('forest-roots-38.json',output),JSON.stringify(manifest));
writeFileSync(new URL('./reports/forest-root-cache-v38.json',import.meta.url),JSON.stringify({version:manifest.version,trees,tiles:tiles.length,sourceSlots:rows.length,recordDigest,preRefactorBaselineIdentical:true,allDecodedRecordsExactlyEqual:true,floatFields:'Float64, no quantization',rawBytes:raw.length,gzipBytes:compressed.length,rootGenerationMs:rootsMs,decodeAndFullEqualityCheckMs:performance.now()-decodeStart,code:manifest.code,scope:manifest.scope},null,2));
layout.dispose();console.log(JSON.stringify({trees,tiles:tiles.length,recordDigest,rawBytes:raw.length,gzipBytes:compressed.length,rootGenerationMs:rootsMs,allRecordsEqual:true}));
