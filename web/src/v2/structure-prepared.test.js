import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from 'node:fs/promises';
import {gzipSync}from 'node:zlib';
import {createHash}from 'node:crypto';
import {WorldStructures}from './structures.js';
import {WorldDoors}from './doors.js';
import {StructurePreparedAssets,preparedStructureEligible}from './structure-prepared.js';
import {structurePreparedBinding}from '../../structure-prepared-binding.js';
import {parseGLB}from '../../../tools/pack-structure-prepared-v38.mjs';
import {collisionTriangles}from './collision.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
const root=new URL('../../public/',import.meta.url),bytes=path=>readFile(new URL(path,root)),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await bytes('data/v2/structure-prepared-38.json')),binding=structurePreparedBinding(),source=await bytes('assets/v2/house_a_lived.glb'),raw=await bytes('assets/v2/prepared/house_a-38.glb'),gzip=await bytes(manifest.assets.house_a.url);
const world={entities:[{id:'test-house',assetId:'house_a'}],surface:{buildingPose:()=>({x:116,y:2200,z:-7,rot:.31,scale:{x:1.1,y:.9,z:1.2}})}};
const buffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
function setup(enabled,options={}){
 const doors=new WorldDoors({document:null,eventTarget:null});let originalLoads=0;
 const owner=new WorldStructures(world,{doors,preparedAssets:enabled,cooperativePreparation:false,loadAsset:async(url,loader)=>{originalLoads++;return loader.parseAsync(buffer(source),'');}});
 owner.preparedAssets.loadBinding=async()=>options.binding??binding;
 owner.preparedAssets.fetch=async url=>url.includes('.json')?{ok:true,json:async()=>options.manifest??manifest}:{ok:options.http!==false,status:404,arrayBuffer:async()=>buffer(options.transport??gzip)};
 return {owner,doors,get originalLoads(){return originalLoads;},dispose(){owner.dispose();doors.dispose();}};
}
const attr=a=>({type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,count:a.count,bytes:Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)});
function geometry(a,b){assert.deepEqual(Object.keys(a.attributes).sort(),Object.keys(b.attributes).sort());for(const k of Object.keys(a.attributes))assert.deepEqual(attr(a.attributes[k]),attr(b.attributes[k]),k);assert.deepEqual(a.index&&attr(a.index),b.index&&attr(b.index));assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);}
function material(m){const value=x=>x?.toArray?x.toArray():x;const out={};for(const k of ['name','color','emissive','roughness','metalness','normalScale','aoMapIntensity','emissiveIntensity','opacity','transparent','alphaTest','side','depthWrite','vertexColors','flatShading'])out[k]=value(m[k]);for(const [k,t]of Object.entries(m))if(t?.isTexture){out[k]={};for(const key of ['channel','wrapS','wrapT','magFilter','minFilter','anisotropy','format','type','colorSpace','flipY','premultiplyAlpha','generateMipmaps','matrix','offset','repeat','center','rotation'])out[k][key]=value(t[key]);}return out;}
test('real prepared source, all full detail and existing far geometry, materials, doors and collision match exactly',async()=>{
 for(const path of ['src/v2/lodge-tables-definition.js', 'src/v2/lodge-tables-loader.js', 'src/v2/generated/lodge-tables-source-38.json', 'src/v2/generated/lodge-tables-wood-38.json', 'src/v2/generated/lodge-tables-stream-38.json', 'src/v2/boardwalk-endpoints.js', 'src/v2/boardwalk-timber.js']){const entry=binding.sources.find(s=>s.path===path);assert.ok(entry,'Structure source dependencies must invalidate prepared binding');assert.equal(entry.sha256,sha(await readFile(new URL('../../'+path,import.meta.url))));}
 assert.equal(manifest.signature,binding.signature);assert.equal(manifest.assets.house_a.sourceSHA256,sha(source));
 const a=setup(false),b=setup(true);try{
 await a.owner.load();await b.owner.load();assert.equal(b.originalLoads,0);assert.equal(a.originalLoads,1);assert.equal(b.owner.stats.status,'ready');assert.equal(b.doors.stats.ready,true);
 const x=a.owner._templates.get('house_a:'),y=b.owner._templates.get('house_a:');assert.equal(x.length,y.length);
 x.forEach((p,i)=>{const q=y[i];for(const k of ['role','names','triangles'])assert.deepEqual(q[k],p[k]);geometry(p.geometry,q.geometry);assert.deepEqual(material(q.material),material(p.material));assert.deepEqual(q.material.userData.sourceMaterialNames,p.material.userData.sourceMaterialNames);assert.equal(Boolean(p.low),Boolean(q.low));if(p.low){geometry(p.low.geometry,q.low.geometry);assert.equal(p.low.error,q.low.error);}});
 assert.deepEqual(collisionTriangles(a.owner.collisionPartsFor(world.entities[0])),collisionTriangles(b.owner.collisionPartsFor(world.entities[0])));
 const da=a.doors.templates.get('house_a'),db=b.doors.templates.get('house_a');assert.equal(da.length,db.length);da.forEach((d,i)=>{const e=db[i];for(const k of ['name','base','scale','bounds','initial','open'])assert.deepEqual(e[k],d[k]);assert.equal(d.parts.length,e.parts.length);d.parts.forEach((p,j)=>{geometry(p.geometry,e.parts[j].geometry);assert.deepEqual(material(e.parts[j].material),material(p.material));});});
 assert.deepEqual(a.doors.stats.thresholdStones,b.doors.stats.thresholdStones);assert.equal(a.owner.stats.assetPreparation.assets.house_a.stoneOcclusion.active,true);assert.deepEqual(a.owner.stats.assetPreparation.assets.house_a.stoneOcclusion,b.owner.stats.assetPreparation.assets.house_a.stoneOcclusion);
 for(const angle of [0,.52,1.05,1.75]){for(const d of [a.doors,b.doors])for(const leaf of d.leaves){leaf.angle=angle;d.writeLeaf(leaf);}a.doors.group.children.forEach((m,i)=>assert.deepEqual(attr(m.instanceMatrix),attr(b.doors.group.children[i].instanceMatrix)));}
 const ownership=new Set([...b.owner._geometries,...b.owner._sourceGeometries]);assert.equal(ownership.size,b.owner._geometries.size+b.owner._sourceGeometries.size);let releases=0;for(const g of ownership)g.addEventListener('dispose',()=>releases++);b.owner.dispose();assert.equal(releases,ownership.size);b.owner.dispose();assert.equal(releases,ownership.size);
 console.log(JSON.stringify({baseline:a.owner.stats.assetPreparation.assets.house_a,prepared:b.owner.stats.assetPreparation.assets.house_a,templates:x.length,triangles:a.owner.stats.triangles}));
 }finally{a.dispose();b.dispose();}
});
test('packed images and PBR JSON preserve exact original embedded content',()=>{
 const a=parseGLB(source),b=parseGLB(raw);for(const key of ['materials','textures','samplers'])assert.deepEqual(b.json[key],a.json[key]);assert.equal(a.json.images.length,b.json.images.length);
 for(let i=0;i<a.json.images.length;i++){const im=a.json.images[i],jm=b.json.images[i];assert.equal(im.mimeType,jm.mimeType);const av=a.json.bufferViews[im.bufferView],bv=b.json.bufferViews[jm.bufferView];assert.deepEqual(a.bin.subarray(av.byteOffset,av.byteOffset+av.byteLength),b.bin.subarray(bv.byteOffset,bv.byteOffset+bv.byteLength));}
});
test('HTTP transparently decoded GLB remains strictly authenticated',async()=>{const x=setup(true,{transport:raw});try{await x.owner.load();assert.equal(x.originalLoads,0);assert.equal(x.owner.preparedAssets.stats.prepared,1);}finally{x.dispose();}});
test('changed actual source binding falls back to complete original asset',async()=>{const x=setup(true,{binding:{...binding,signature:'changed'}});try{await x.owner.load();assert.equal(x.originalLoads,1);assert.equal(x.owner.stats.status,'ready');assert.equal(x.owner.preparedAssets.stats.fallbacks,1);assert.ok(x.owner.stats.triangles>50000);}finally{x.dispose();}});
test('candidate corrupt transport or missing asset fails explicitly and releases rather than showing empty shell',async()=>{for(const options of [{transport:Buffer.from('corrupt')},{http:false}]){const x=setup(true,options);try{await assert.rejects(x.owner.load(),/checksum mismatch|HTTP 404/);assert.equal(x.owner.stats.status,'failed');assert.equal(x.originalLoads,0);assert.equal(x.owner.group.children.length,0);assert.equal(x.owner._geometries.size,0);}finally{x.dispose();}}});
test('default/native fetch binding and unsupported source modes do not accidentally activate',async()=>{
 const options={enabled:true,doors:{}};assert.equal(preparedStructureEligible('house_a',new Set(['']),options),true);
 for(const o of [{enabled:false},{doors:null},{base:'/custom/'},{search:'?timberContinuity=0'},{search:'?stoneOcclusion=0'}])assert.equal(Boolean(preparedStructureEligible('house_a',new Set(['']),{...options,...o})),false);
 assert.equal(Boolean(preparedStructureEligible('house_a',new Set(['part']),options)),false);assert.equal(Boolean(preparedStructureEligible('yurt',new Set(['']),options)),false);
 const f=globalThis.fetch;globalThis.fetch=function(){assert.equal(this,globalThis);return 7;};try{assert.equal(new StructurePreparedAssets().fetch('example'),7);}finally{globalThis.fetch=f;}
});
test('disposed loading never places late candidate geometry',async()=>{const x=setup(true);x.owner.preparedAssets.loadBinding=async()=>{x.owner.dispose();return binding;};try{await assert.rejects(x.owner.load(),/disposed/);assert.equal(x.owner.stats.status,'disposed');assert.equal(x.owner._sourceGeometries.size,0);assert.equal(x.owner.group.children.length,0);}finally{x.dispose();}});
