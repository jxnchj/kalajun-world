import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadHabitatMap} from './habitat-loading.js';
import {decodeHabitatMap} from './habitat-data.js';
import manifest from '../../public/data/v2/habitat-transport-manifest.json' with {type:'json'};
const root=new URL('../../public/',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const source=async(name)=>{const metaBytes=await readFile(new URL('data/'+name+'.json',root)),gzip=await readFile(new URL('data/'+name+'.bin.gz',root));return{metaBytes,gzip,bytes:gunzipSync(gzip),meta:JSON.parse(metaBytes)}};
const files=({decoded=false,calls=[]}={})=>async(url)=>{calls.push(url);const bytes=await readFile(new URL(url.split('?')[0],root));return new Response(decoded&&url.includes('.gz')?gunzipSync(bytes):bytes)};
for(const name of ['vegmap','vegcore'])test(name+' derived payload preserves every original pixel, metadata and source fingerprint',async()=>{
 const src=await source(name),entry=manifest.maps[name],original=decodeHabitatMap(src.meta,src.bytes),calls=[];
 const map=await loadHabitatMap(name,{fetchImpl:files({calls})}),http=await loadHabitatMap(name,{fetchImpl:files({decoded:true})});
 assert.deepEqual(map.data,original.data);assert.deepEqual(http.data,original.data);assert.deepEqual(map.meta,original.meta);assert.equal(map.n,original.n);
 assert.equal(hash(src.bytes),entry.source.sha256);assert.equal(hash(src.metaBytes),entry.source.metadataSha256);assert.equal(hash(map.data),entry.sha256);
 assert.equal(src.gzip.length,entry.source.gzipBytes);assert.equal(src.bytes.length,entry.source.rawBytes);assert.equal(map.transport.responseBytes,entry.gzipBytes);assert.equal(http.transport.responseBytes,entry.rawBytes);
 assert.equal(calls.length,1);assert.match(calls[0],/habitat.bin.gz\?v=[a-f0-9]{64}$/);assert.equal(map.transport.decodedBytes*6,entry.source.rawBytes);
 const raw=await loadHabitatMap(name,{mode:'raw',fetchImpl:files()});assert.deepEqual(raw.data,map.data);assert.deepEqual(raw.meta,map.meta);
 // Independent exact channel checks protect the derivation, including tile/channel maxima.
 const n=map.n,at=(i,j,t,c)=>src.bytes[(((Math.floor(t/3)*n+j)*3*n)+(t%3)*n+i)*4+c];
 for(let j=0;j<n;j+=13)for(let i=0;i<n;i+=17){const p=(j*n+i)*4;assert.equal(map.data[p],at(i,j,0,0));assert.equal(map.data[p+1],Math.max(at(i,j,0,1),at(i,j,2,0)));assert.equal(map.data[p+2],Math.max(at(i,j,1,0),at(i,j,1,3),at(i,j,4,2),at(i,j,4,3)));assert.equal(map.data[p+3],Math.max(at(i,j,3,0),at(i,j,3,1)));}
});
test('metadata and data are independent per load',async()=>{const a=await loadHabitatMap('vegmap',{fetchImpl:files()});a.meta.origin[0]=0;a.meta.layers[0][0]='changed';a.data.fill(0);const b=await loadHabitatMap('vegmap',{fetchImpl:files()});assert.deepEqual(b.meta,manifest.maps.vegmap.meta);assert.equal(hash(b.data),manifest.maps.vegmap.sha256);});
test('unknown, unsuccessful, incomplete and malformed payloads reject without a quality fallback',async()=>{
 let calls=0;await assert.rejects(loadHabitatMap('unknown',{fetchImpl:()=>{calls++}}),/Unknown habitat/);assert.equal(calls,0);
 await assert.rejects(loadHabitatMap('vegmap',{mode:'invalid'}),/Unknown habitat transport/);
 await assert.rejects(loadHabitatMap('vegmap',{fetchImpl:async()=>new Response('missing',{status:404})}),/404/);
 await assert.rejects(loadHabitatMap('vegmap',{fetchImpl:async()=>new Response(new Uint8Array(16))}),/size or version mismatch/);
 await assert.rejects(loadHabitatMap('vegmap',{fetchImpl:async()=>new Response(new Uint8Array([31,139,0,0]))}));
 await assert.rejects(loadHabitatMap('vegmap',{mode:'raw',fetchImpl:async()=>new Response('missing',{status:404})}),/Cannot load habitat/);
});
test('request cancellation is passed through and cannot publish a ready derived map',async()=>{
 const controller=new AbortController(),reason=new Error('cancel destination');let observed;
 const task=loadHabitatMap('vegmap',{signal:controller.signal,fetchImpl:async(url,options)=>{observed=options.signal;const r=await files()(url);controller.abort(reason);return r;}});
 await assert.rejects(task,error=>error===reason);assert.equal(observed,controller.signal);
});
