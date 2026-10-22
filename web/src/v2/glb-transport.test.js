import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import manifest from '../../public/assets/v2/glb-transport-manifest.json' with {type:'json'};
import {loadWorldGLB,exactGLBBuffer} from './glb-transport.js';
const root=new URL('../../public/',import.meta.url);
const getBytes=path=>readFile(new URL(path,root));
for(const [path,entry]of Object.entries(manifest.assets))test('lossless registered GLB: '+path,async()=>{
 const raw=await getBytes(path),packed=await getBytes(entry.url);let requested,parsePath;
 const loader={loadAsync(){throw new Error('unexpected raw fallback');},async parseAsync(buffer,base){assert.deepEqual(Buffer.from(buffer),raw);parsePath=base;return {userData:{preserved:true}};}};
 const gltf=await loadWorldGLB('./'+path,loader,{compressed:true,fetchImpl:async url=>{requested=url;return new Response(packed);}});
 assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sha256);
 assert.equal(createHash('sha256').update(packed).digest('hex'),entry.gzipSha256);
 assert.equal(requested,'./'+entry.url+'?v='+entry.gzipSha256);
 assert.equal(parsePath,'./'+path.slice(0,path.lastIndexOf('/')+1));assert.equal(gltf.userData.preserved,true);
 assert.equal(gltf.userData.assetTransport.rawBytes,raw.length);
});
test('raw switch and nonregistered/custom bases use normal loader',async()=>{
 const paths=[],loader={loadAsync:async url=>(paths.push(url),url)};
 for(const url of ['./assets/unregistered.glb','https://example.invalid/assets/v2/house_a_lived.glb','../assets/v2/house_a_lived.glb'])assert.equal(await loadWorldGLB(url,loader),url);
 await loadWorldGLB('./assets/v2/house_a_lived.glb',loader,{compressed:false});assert.equal(paths.length,4);
});
test('HTTP-decompressed response is accepted; transport and validation failures are not hidden',async()=>{
 const path='assets/v2/schrenk-spruce-mid.glb',raw=await getBytes(path);let parsed=0;
 const loader={loadAsync(){throw new Error('silent fallback');},async parseAsync(){parsed++;return {};}};
 await loadWorldGLB(path,loader,{compressed:true,fetchImpl:async()=>new Response(raw)});assert.equal(parsed,1);
 await assert.rejects(loadWorldGLB(path,loader,{fetchImpl:async()=>new Response('',{status:503})}),/503/);
 await assert.rejects(loadWorldGLB(path,loader,{fetchImpl:async()=>new Response(new Uint8Array([1,2]))}),/Invalid world GLB/);
 const broken=Buffer.from(raw);broken.writeUInt32LE(3,4);
 await assert.rejects(loadWorldGLB(path,loader,{fetchImpl:async()=>new Response(broken)}),/Invalid world GLB/);
 assert.equal(parsed,1);
});

test('exact GLB handoff reuses owned network bytes but excludes subview prefix and suffix',()=>{
 const bytes=Uint8Array.from([1,2,3,4]);assert.equal(exactGLBBuffer(bytes),bytes.buffer);
 const view=new Uint8Array(bytes.buffer,1,2),buffer=exactGLBBuffer(view);
 assert.notEqual(buffer,bytes.buffer);assert.deepEqual([...new Uint8Array(buffer)],[2,3]);
 const copy=exactGLBBuffer(bytes,true);assert.notEqual(copy,bytes.buffer);assert.deepEqual([...new Uint8Array(copy)],[1,2,3,4]);
 new Uint8Array(buffer)[0]=9;assert.deepEqual([...bytes],[1,2,3,4]);
});

test('registered native HTTP decoding hands its owned bytes directly to GLTFLoader',async()=>{
 const path='assets/v2/schrenk-spruce-mid.glb',raw=await getBytes(path),owned=Uint8Array.from(raw).buffer;
 const result=await loadWorldGLB(path,{async parseAsync(buffer){assert.equal(buffer,owned);return {};},loadAsync(){throw Error('unexpected fallback');}},{compressed:true,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>owned})});
 assert.equal(result.userData.assetTransport.parseBufferCopiedBytes,0);
});
