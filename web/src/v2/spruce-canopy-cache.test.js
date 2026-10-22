import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { createSpruceLoader } from "./spruce-loading.js";
import { loadGpuSpruceRecipe } from "./spruce-gpu-loading.js";
import * as T from "three";
import { CANOPY_FORMS, canopyDigest, canopySourceDigests, encodeCanopyParts, SpruceCanopyCache, loadSpruceCanopyCache, canopyFallback } from "./spruce-canopy-cache.js";

function source(seed=0){
 const scene=new T.Group();
 for(let i=0;i<CANOPY_FORMS.length;i++){
  const g=new T.BoxGeometry(1,2,1);g.translate(i+seed,1,0);
  g.setAttribute("_plant_wind",new T.Float32BufferAttribute(Array.from({length:g.attributes.position.count*3},(_,i)=>(i%7)/8),3));
  g.setAttribute("_crown_occlusion",new T.Float32BufferAttribute(Array(g.attributes.position.count).fill(.7),1));
  const mesh=new T.Mesh(g);mesh.name=CANOPY_FORMS[i]+"_frond";scene.add(mesh);
 }
 return{scene};
}
async function fixture(){
 const hi=source(),mid=source(10),parts={},recipe=new TextEncoder().encode('{"test":"recipe"}'),contract={volume:true,crown:true,branches:true,branchDetail:{cell:3}};
 for(const lod of["hi","mid","near"])for(const form of CANOPY_FORMS){
  const g=(lod==="mid"?mid:hi).scene.getObjectByName(form+"_frond").geometry.clone();
  if(lod==="near")g.setAttribute("aSprayLod",new T.Float32BufferAttribute(Array(g.attributes.position.count*4).fill(.25),4));
  g.userData={triangles:g.index.count/3,sourceTriangles:g.index.count/3,crownRevision:"fixture",groups:[1,2]};g.addGroup(0,g.index.count,0);
  parts[lod+":"+form+"_frond"]=g;
 }
 const encoded=encodeCanopyParts(parts,{inputKey:"fixture-input",sourceDigests:{hi:await canopySourceDigests(hi),mid:await canopySourceDigests(mid)},recipeDigest:await canopyDigest(recipe),nearContract:contract});
 const compressed=gzipSync(encoded.data);encoded.manifest.payload={file:"fixture.bin.gz",digest:await canopyDigest(encoded.data),compressedBytes:compressed.byteLength};
 const manifestBytes=new TextEncoder().encode(JSON.stringify(encoded.manifest)),build={inputKey:encoded.manifest.inputKey,manifestDigest:await canopyDigest(manifestBytes)};
 return{...encoded,hi,mid,parts,recipe,contract,compressed,manifestBytes,build};
}
const fixturePromise=fixture();

test("all 15 cached parts retain exact typed bytes and use views into one original decoded buffer",async()=>{
 const f=await fixturePromise,cache=new SpruceCanopyCache(f.manifest,f.data);
 assert.throws(()=>cache.createGeometry("hi","column_frond"),/verified/);
 await Promise.all([cache.verifySource("hi",f.hi),cache.verifySource("mid",f.mid)]);
 assert.throws(()=>cache.createGeometry("near","column_frond"),/verified/);
 await cache.verifyRecipe(f.recipe,f.contract);
 for(const[key,original]of Object.entries(f.parts)){
  const[lod,name]=key.split(":"),g=cache.createGeometry(lod,name);
  for(const n of[...Object.keys(original.attributes),"index"]){
   const a=n==="index"?original.index:original.attributes[n],b=n==="index"?g.index:g.attributes[n];
   assert.equal(b.array.constructor,a.array.constructor);assert.equal(b.itemSize,a.itemSize);assert.equal(b.normalized,a.normalized);
   assert.deepEqual(new Uint8Array(b.array.buffer,b.array.byteOffset,b.array.byteLength),new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
   assert.strictEqual(b.array.buffer,f.data.buffer,"binding does not copy the payload");
  }
  assert.deepEqual(g.userData,original.userData);assert.deepEqual(g.groups,original.groups);assert.deepEqual(g.drawRange,original.drawRange);
  assert.ok(g.boundingBox.equals(original.boundingBox));assert.ok(g.boundingSphere.equals(original.boundingSphere));
 }
 assert.equal(cache.stats.usedParts.length,15);assert.equal(cache.stats.status,"active");
});

test("input fingerprints and the complete recipe/branch contract reject stale geometry",async()=>{
 const f=await fixturePromise;
 const changed=source();changed.scene.children[0].geometry.attributes._plant_wind.setY(0,.15);
 const stale=new SpruceCanopyCache(f.manifest,f.data);await assert.rejects(stale.verifySource("hi",changed),/fingerprint/);
 const cache=new SpruceCanopyCache(f.manifest,f.data);await cache.verifySource("hi",f.hi);
 await assert.rejects(cache.verifySource("hi",source()),/identity/);
 await assert.rejects(cache.verifyRecipe(new TextEncoder().encode("changed"),f.contract),/recipe/);
 await assert.rejects(cache.verifyRecipe(f.recipe,{...f.contract,branches:false}),/contract/);
});

test("corrupt versions, ranges, missing variants and out-of-range indices fail before geometry is exposed",async()=>{
 const f=await fixturePromise;
 let manifest=structuredClone(f.manifest);manifest.revision="old";assert.throws(()=>new SpruceCanopyCache(manifest,f.data),/version/);
 manifest=structuredClone(f.manifest);delete manifest.parts["mid:young_frond"];assert.throws(()=>new SpruceCanopyCache(manifest,f.data),/15/);
 manifest=structuredClone(f.manifest);manifest.parts["hi:column_frond"].attributes.position.byteOffset=1;assert.throws(()=>new SpruceCanopyCache(manifest,f.data),/range/);
 const data=f.data.slice(),d=f.manifest.parts["hi:column_frond"].index;new Uint16Array(data.buffer,d.byteOffset,d.length)[0]=65535;
 assert.throws(()=>new SpruceCanopyCache(f.manifest,data),/index outside/);
});

test("lossless HTTP loader reports actual response size, gzip decode and validates both manifest and payload",async()=>{
 const f=await fixturePromise,calls=[],stats={};
 const cache=await loadSpruceCanopyCache({url:"./assets/v2/cache.json",build:f.build,stats,fetchImpl:async url=>{calls.push(url);return new Response(url.endsWith(".json")?f.manifestBytes:f.compressed);}});
 assert.deepEqual(calls,["./assets/v2/cache.json","./assets/v2/fixture.bin.gz"]);
 assert.equal(stats.responseBodyBytes,f.compressed.length);assert.equal(stats.compressedAssetBytes,f.compressed.length);assert.equal(stats.decodedBytes,f.data.length);
 assert.ok(stats.decodeMs>=0&&stats.validateMs>=0&&stats.fetchMs>=0);
 assert.deepEqual(cache.data,f.data);
 // HTTP content decoding may already have removed gzip; do not decode twice.
 const decoded=await loadSpruceCanopyCache({build:f.build,fetchImpl:async url=>new Response(url.endsWith(".json")?f.manifestBytes:f.data)});
 assert.deepEqual(decoded.data,f.data);assert.equal(decoded.stats.responseBodyBytes,f.data.length);
});

test("fetch/hash failures are explicit and the caller can recover with a visible original-algorithm fallback",async()=>{
 const f=await fixturePromise;
 await assert.rejects(loadSpruceCanopyCache({build:null}),/not been generated/);
 await assert.rejects(loadSpruceCanopyCache({build:f.build,fetchImpl:async()=>new Response("",{status:503})}),/HTTP 503/);
 await assert.rejects(loadSpruceCanopyCache({build:{...f.build,manifestDigest:"bad"},fetchImpl:async()=>new Response(f.manifestBytes)}),/manifest differs/);
 await assert.rejects(loadSpruceCanopyCache({build:f.build,fetchImpl:async url=>new Response(url.endsWith(".json")?f.manifestBytes:f.data.slice(1))}),/payload fingerprint/);
 const messages=[],warn=console.warn,stats={};
 try{console.warn=m=>messages.push(m);canopyFallback(stats,new Error("stale input"));}finally{console.warn=warn;}
 assert.equal(stats.status,"fallback");assert.equal(stats.reason,"stale input");assert.match(messages[0],/original complete geometry/);
 const controller=new AbortController();controller.abort();let fetches=0;
 await assert.rejects(loadSpruceCanopyCache({signal:controller.signal,build:f.build,fetchImpl:async()=>{fetches++;}}),/abort/i);assert.equal(fetches,0);
});

test("volume binding keeps all five forms and reports exactly the same geometry totals",async()=>{
 const f=await fixturePromise,hi=source(),mid=source(10),cache=new SpruceCanopyCache(f.manifest,f.data);
 await Promise.all([cache.verifySource("hi",hi),cache.verifySource("mid",mid)]);
 const report=cache.applyVolume(hi,mid);
 assert.equal(Object.keys(report.forms).length,10);assert.equal(report.addedTriangles,0);
 for(const[lod,gltf]of[["hi",hi],["mid",mid]])for(const form of CANOPY_FORMS){
  const g=gltf.scene.getObjectByName(form+"_frond").geometry;assert.deepEqual(g.index.array,f.parts[lod+":"+form+"_frond"].index.array);
 }
 assert.equal(report.geometryBytes,cache.stats.boundBytes);
});

test("the real recipe loader binds all five cached near shells and recovers stale cache with identical old geometry",async()=>{
 const loader=createSpruceLoader();loader.register(()=>({name:"TEXTURE_STUB",loadTexture:()=>Promise.resolve(new T.Texture())}));
 const sourceBytes=await readFile(new URL("../../public/assets/v2/schrenk-spruce-hi.glb",import.meta.url));
 const hi=await loader.parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength),"");
 const assetFetch=async url=>new Response(await readFile(new URL("../../public/"+url.replace(/^\.\//,""),import.meta.url)));
 const fresh=()=>loadSpruceCanopyCache({fetchImpl:assetFetch});
 // Packet geometry is independent of the shell cache. The stub immediately
 // returns an empty packet envelope so this test isolates the real loader's
 // source checks, shell binding, ready identities and failure recovery.
 const workerFactory=()=>{const worker={terminate(){},postMessage({id,records}){
  queueMicrotask(()=>worker.onmessage({data:{id,packet:{brushes:records.length,frames:new Float32Array(),wood:new Float32Array(),variations:new Float32Array(),sharedVariations:new Float32Array(),variationKeys:new Float32Array(),bytes:0}}}));
 }};return worker;};
 const cachedStore=await fresh(),cached=await loadGpuSpruceRecipe(hi,undefined,{fetchImpl:assetFetch,workerFactory,branches:true,canopyCache:cachedStore});
 assert.equal(cached.userData.timings.canopyMode,"precomputed-indexed");assert.equal(cachedStore.stats.usedParts.length,5);
 const staleStore=await fresh();staleStore.manifest.sourceDigests.hi.column_frond.POSITION="changed";
 const warnings=[],warn=console.warn;let fallback;
 try{console.warn=m=>warnings.push(m);fallback=await loadGpuSpruceRecipe(hi,undefined,{fetchImpl:assetFetch,workerFactory,branches:true,canopyCache:staleStore});}
 finally{console.warn=warn;}
 assert.equal(fallback.userData.timings.canopyMode,"runtime");assert.equal(staleStore.stats.status,"fallback");assert.equal(warnings.length,1);
 for(const form of CANOPY_FORMS){
  const a=cached.scene.getObjectByName(form+"_frond").geometry,b=fallback.scene.getObjectByName(form+"_frond").geometry;
  assert.deepEqual(a.index.array,b.index.array);
  for(const name of Object.keys(a.attributes))assert.deepEqual(new Uint8Array(a.attributes[name].array.buffer,a.attributes[name].array.byteOffset,a.attributes[name].array.byteLength),new Uint8Array(b.attributes[name].array.buffer,b.attributes[name].array.byteOffset,b.attributes[name].array.byteLength),form+"/"+name);
  assert.deepEqual(a.userData,b.userData);
 }
});

test("the generated package is bound to the current generator and algorithm source files",async()=>{
 const manifest=JSON.parse(await readFile(new URL("../../public/assets/v2/spruce-canopy-v1.json",import.meta.url),"utf8"));
 for(const[file,digest]of Object.entries(manifest.algorithmDigests)){
  assert.equal(await canopyDigest(await readFile(new URL("../../../"+file,import.meta.url))),digest,file+" changed: regenerate the lossless cache before building");
 }
});
