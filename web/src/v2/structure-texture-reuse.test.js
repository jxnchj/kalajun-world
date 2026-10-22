import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Texture} from 'three';
import {WorldStructures} from './structures.js';
import {createEntities} from './world-data.js';
import {StructureTextureReuse} from './structure-texture-reuse.js';

globalThis.self=globalThis;
let decodes=0;
globalThis.createImageBitmap=async blob=>({width:1,height:1,digest:createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex'),decode:++decodes,close(){}});
const ROOT=new URL('../../public/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const geometryDigest=g=>Object.fromEntries([['index',g.index],...Object.entries(g.attributes)].filter(([,a])=>a).map(([key,a])=>[key,[a.itemSize,a.normalized,a.array.constructor.name,sha(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))]]));
const textureState=t=>Object.fromEntries(Object.entries(t).filter(([k])=>!['id','uuid','source','version','_listeners','renderTarget','isRenderTargetTexture'].includes(k)).map(([k,v])=>[k,typeof v?.toArray==='function'?v.toArray():v]));

test('all eighteen real buildings share only byte-identical decoded images; all prepared geometry and texture sampling stay exact',async()=>{
 const entities=createEntities(JSON.parse(await readFile(new URL('data/objects.json',ROOT))),JSON.parse(await readFile(new URL('world-v2/manifest.json',ROOT))).assetMetadata);
 const world={entities,surface:{buildingPose:e=>({x:e.x,y:2200,z:e.z,rot:e.rot,scale:e.scale})}};
 const loadAsset=async(url,loader)=>{
   const b=await readFile(new URL(url.replace(/^\.\//,''),ROOT));
   return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 };
 decodes=0;const old=new WorldStructures(world,{loadAsset,textureReuse:false});await old.load();const oldDecodes=decodes;
 decodes=0;const reused=new WorldStructures(world,{loadAsset,textureReuse:true});await reused.load();const newDecodes=decodes;
 assert.equal(old.stats.assetsLoaded,18);assert.equal(reused.stats.assetsLoaded,18);
 assert.equal(old.stats.triangles,reused.stats.triangles);assert.equal(old.stats.materials,reused.stats.materials);
 assert.equal(old.stats.batches,reused.stats.batches);
 let geometryCount=0,textureCount=0;
 for(const [key,parts] of old._templates){
   const actual=reused._templates.get(key);assert.equal(actual.length,parts.length,key);
   for(let i=0;i<parts.length;i++){
     const a=parts[i],b=actual[i];assert.deepEqual(a.names,b.names);assert.equal(a.role,b.role);
     assert.deepEqual(geometryDigest(a.geometry),geometryDigest(b.geometry));geometryCount++;
     assert.equal(Boolean(a.low),Boolean(b.low));if(a.low){assert.equal(a.low.error,b.low.error);assert.deepEqual(geometryDigest(a.low.geometry),geometryDigest(b.low.geometry));geometryCount++;}
     for(const name of Object.keys(a.material)){
       const av=a.material[name],bv=b.material[name];
       if(av?.isTexture){assert.equal(av.image.digest,bv.image.digest);assert.deepEqual(textureState(av),textureState(bv),key+'/'+name);textureCount++;}
       else if(!['id','uuid','userData','_listeners','onBeforeCompile','customProgramCacheKey'].includes(name)&&typeof av!=='function')assert.deepEqual(av,bv,key+'/'+name);
     }
   }
 }
 assert.ok(newDecodes<oldDecodes*.6,`${oldDecodes} -> ${newDecodes}`);
 const byHash=new Map();for(const t of reused._textures){const hash=t.image.digest;if(byHash.has(hash))assert.equal(t.source,byHash.get(hash));else byHash.set(hash,t.source);}
 assert.equal(newDecodes,reused.stats.textureReuse.uniqueImages);
 console.log(JSON.stringify({assets:18,geometryCount,textureCount,oldDecodes,newDecodes,triangles:reused.stats.triangles,stats:reused.stats.textureReuse}));
 old.dispose();reused.dispose();assert.equal(reused.textureReuse.sources.size,0);
});

function fixture(reuse,options={}){
 let plugin;reuse.install({register:f=>plugin=f});let loads=0;
 const parser={json:{images:[{bufferView:0,mimeType:'image/png',extras:{tag:'first'}},{bufferView:1,mimeType:'image/png',extras:{tag:'second'}}]},getDependency:async()=>new Uint8Array([1,2,3]).buffer,loadImageSource:async()=>{loads++;return new Texture({width:4,height:4});}};
 plugin(parser);return {parser,loader:{isImageBitmapLoader:true,options},loads:()=>loads};
}
test('concurrent identical bytes share one source while texture state and extras remain isolated',async()=>{
 const reuse=new StructureTextureReuse(),f=fixture(reuse);
 const [a,b]=await Promise.all([f.parser.loadImageSource(0,f.loader),f.parser.loadImageSource(1,f.loader)]);
 assert.equal(f.loads(),1);assert.equal(a.source,b.source);assert.notEqual(a,b);
 assert.deepEqual(a.userData,{tag:'first',mimeType:'image/png'});assert.deepEqual(b.userData,{tag:'second',mimeType:'image/png'});
 a.offset.x=.7;a.colorSpace='srgb';assert.equal(b.offset.x,0);assert.notEqual(a.colorSpace,b.colorSpace);
});
test('MIME and decode options isolate sources, while external/custom decoders use their original path',async()=>{
 const reuse=new StructureTextureReuse(),a=fixture(reuse,{premultiplyAlpha:'none'}),b=fixture(reuse,{premultiplyAlpha:'premultiply'}),c=fixture(reuse,{premultiplyAlpha:'none'});
 c.parser.json.images[0].mimeType='image/jpeg';
 const xs=await Promise.all([a,b,c].map(f=>f.parser.loadImageSource(0,f.loader)));
 assert.equal(new Set(xs.map(t=>t.source)).size,3);
 const d=fixture(reuse);d.parser.json.images[0]={uri:'external.png'};await d.parser.loadImageSource(0,d.loader);await d.parser.loadImageSource(1,{isImageBitmapLoader:false});assert.equal(d.loads(),2);
});
test('a failed image is not installed as a reusable source',async()=>{
 const reuse=new StructureTextureReuse();let plugin;reuse.install({register:f=>plugin=f});
 const parser={json:{images:[{bufferView:0,mimeType:'image/png'}]},getDependency:async()=>new ArrayBuffer(1),loadImageSource:async()=>{throw new Error('decode failed');}};
 plugin(parser);await assert.rejects(parser.loadImageSource(0,{isImageBitmapLoader:true,options:{}}),/decode failed/);
 assert.equal(reuse.sources.size,0);
});

test('shared image closes once at whole-world release, never when one texture is disposed',async()=>{
 let closed=0,plugin;const reuse=new StructureTextureReuse();reuse.install({register:f=>plugin=f});
 const parser={json:{images:[{bufferView:0,mimeType:'image/png'},{bufferView:1,mimeType:'image/png'}]},getDependency:async()=>new Uint8Array([4]).buffer,loadImageSource:async()=>new Texture({close(){closed++;}})};
 plugin(parser);const loader={isImageBitmapLoader:true,options:{}};
 const [a,b]=await Promise.all([parser.loadImageSource(0,loader),parser.loadImageSource(1,loader)]);
 a.dispose();assert.equal(closed,0);assert.equal(a.source,b.source);
 b.dispose();reuse.clear();reuse.clear();assert.equal(closed,1);
});
test('release during in-flight decode closes the late source without retaining it',async()=>{
 let closed=0,plugin,finish,started;const decoding=new Promise(resolve=>started=resolve);
 const reuse=new StructureTextureReuse();reuse.install({register:f=>plugin=f});
 const parser={json:{images:[{bufferView:0,mimeType:'image/png'}]},getDependency:async()=>new Uint8Array([5]).buffer,
 loadImageSource:()=>new Promise(resolve=>{finish=()=>resolve(new Texture({close(){closed++;}}));started();})};
 plugin(parser);const request=parser.loadImageSource(0,{isImageBitmapLoader:true,options:{}});
 await decoding;reuse.clear();finish();await request;
 assert.equal(closed,1);assert.equal(reuse.decodedSources.size,0);assert.equal(reuse.sources.size,0);
});
test('release during image hashing cannot resurrect the source pool',async()=>{
 let closed=0,plugin,finish,started;const hashing=new Promise(resolve=>started=resolve);
 const reuse=new StructureTextureReuse({digest:()=>new Promise(resolve=>{finish=()=>resolve(new ArrayBuffer(32));started();})});reuse.install({register:f=>plugin=f});
 const parser={json:{images:[{bufferView:0,mimeType:'image/png'}]},getDependency:async()=>new Uint8Array([6]).buffer,
 loadImageSource:async()=>new Texture({close(){closed++;}})};
 plugin(parser);const request=parser.loadImageSource(0,{isImageBitmapLoader:true,options:{}});
 await hashing;reuse.clear();finish();await request;
 assert.equal(closed,1);assert.equal(reuse.decodedSources.size,0);assert.equal(reuse.sources.size,0);
});
