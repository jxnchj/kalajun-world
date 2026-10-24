import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {MEADOW_ROOT_VERSION,sourceCells,encodeMeadowRoots,decodeMeadowRoots} from './meadow-root-codec.js';
import {MeadowRootCache,meadowRootInputHashes,MEADOW_CACHE_SPATIAL_PARAMETERS} from './meadow-root-cache.js';
import {rootBytesSHA} from './forest-root-codec.js';
import {GrassRootField} from './grass-root-field.js';
import {meadowRootCodeBinding} from '../../meadow-root-binding.js';
const ecoFixture=()=>({world:{getForestRootInputHashes:async()=>({world:'exact'})},floraLocal:{meta:{n:1},data:new Uint8Array([1,2,3,4])},floraCore:{meta:{n:1},data:new Uint8Array([5,6,7,8])},grassRootField:{seed(root,fields){root.seeded=fields;}},grassAt:(ix,iz)=>({id:'procedural:'+ix+':'+iz})});
async function fixture(){
 const cells=sourceCells(-2,3),slots=cells.map(()=>null),fields=new Float32Array([0,-0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);
 const [ix,iz]=cells[4],root={id:'grass:'+ix+':'+iz,x:-0,y:100,z:0,s:.95,sy:1.1,rot:1.2,shoreMove:.2,thresholdUnresolved:true};slots[4]={root,fields};slots[8]=true;
 const raw=encodeMeadowRoots([{tx:-2,tz:3,slots}]),packed=new Uint8Array(gzipSync(raw)),eco=ecoFixture();
 const manifest={version:MEADOW_ROOT_VERSION,tiles:1,roots:1,procedural:1,rawBytes:raw.length,rawSHA256:await rootBytesSHA(raw),gzipBytes:packed.length,sha256:await rootBytesSHA(packed),code:{signature:'source'},inputs:await meadowRootInputHashes(eco),url:'fixture'};
 return {eco,manifest,raw,packed,slots};
}
const options=f=>({search:'?meadowRootCache=1',loadCode:async()=>({signature:'source'}),fetchImpl:async url=>({ok:true,json:async()=>f.manifest,arrayBuffer:async()=>f.packed.buffer})});
test('source slots preserve negative tile boundaries, nulls, procedural wet markers, all final root flags and Float32 bits',async()=>{
 const f=await fixture(),tiles=await decodeMeadowRoots(f.raw,f.manifest);assert.deepEqual(tiles.get('-2,3').slots,f.slots);assert.deepEqual(new Uint8Array(tiles.get('-2,3').slots[4].fields.buffer),new Uint8Array(f.slots[4].fields.buffer));assert.ok(Object.is(tiles.get('-2,3').slots[4].root.x,-0));
});
test('cache is opt-in and every spatial experiment keeps source generation',async()=>{
 const eco=ecoFixture();let calls=0;const fetchImpl=()=>{calls++;throw Error('must not fetch');};
 for(const search of ['',...MEADOW_CACHE_SPATIAL_PARAMETERS.map(k=>'?meadowRootCache=1&'+k+'=1')]){const c=new MeadowRootCache(eco,{search,fetchImpl});assert.equal(await c.prepare(),false);assert.equal(c.readTile(0,0),undefined);}assert.equal(calls,0);
});
test('valid cache restores final roots, seeds fields, preserves wet original generation and outside fallback',async()=>{
 const f=await fixture(),c=new MeadowRootCache(f.eco,options(f));assert.equal(await c.prepare(),true);const list=c.readTile(-2,3);assert.equal(list.length,2);assert.equal(list[0].shoreMove,.2);assert.deepEqual(list[0].seeded,f.slots[4].fields);assert.equal(list[1].id,'procedural:'+sourceCells(-2,3)[8].join(':'));assert.equal(c.readTile(300,300),undefined);list[0].x=999;assert.ok(Object.is(c.readTile(-2,3)[0].x,-0));
});
test('both HTTP compressed and transparent decompression transport are validated',async()=>{
 const f=await fixture();for(const body of [f.packed,f.raw]){const c=new MeadowRootCache(f.eco,{...options(f),fetchImpl:async()=>({ok:true,json:async()=>f.manifest,arrayBuffer:async()=>body.buffer})});assert.equal(await c.prepare(),true);}
});
test('changed source, actual habitat/world, corrupt bytes and failed requests fall back before any cached root',async()=>{
 for(const mode of ['source','habitat','world','bytes','http']){const f=await fixture(),o=options(f);if(mode==='source')o.loadCode=async()=>({signature:'new'});if(mode==='habitat')f.eco.floraLocal.data[0]++;if(mode==='world')f.eco.world.getForestRootInputHashes=async()=>({world:'changed'});if(mode==='bytes')f.packed[30]^=1;if(mode==='http')o.fetchImpl=async()=>({ok:false,status:404});const c=new MeadowRootCache(f.eco,o);assert.equal(await c.prepare(),false,mode);assert.equal(c.stats.status,'fallback');assert.equal(c.readTile(-2,3),undefined);}
});
test('disposal while loading prevents late installation',async()=>{
 const f=await fixture();let release;const wait=new Promise(r=>release=r),c=new MeadowRootCache(f.eco,{...options(f),loadCode:async()=>{await wait;return {signature:'source'};}}),pending=c.prepare();c.dispose();release();assert.equal(await pending,false);assert.equal(c.ready,false);assert.equal(c.tiles.size,0);
});
test('seeded root fields are consumed exactly; moved roots invalidate seeds',()=>{
 const world={surface:{heightAt:()=>100},landcoverAt:()=>({r:0,g:0,b:0}),hydrology:{sampleAt:()=>({wetness:0})}},field=new GrassRootField(world),root={x:1.25,z:-3.5},values=new Float32Array([1,2,3,4,5,6,7,8,9,10,11,12]);field.seed(root,values);assert.deepEqual(field.sample(root),values.subarray(0,4));assert.deepEqual(field.sampleLandform(root),values.subarray(4,8));assert.deepEqual(field.sampleCommunity(root),values.subarray(8));root.x+=1;assert.notDeepEqual(field.sample(root),values.subarray(0,4));field.dispose();
});
test('generated 111 tiles are bound to current source and 45440 complete field records plus 46 original-geometry slots retain all 45486 roots',async()=>{
 const base=new URL('../../public/data/v2/',import.meta.url),m=JSON.parse(readFileSync(new URL('meadow-roots-38.json',base))),raw=new Uint8Array(gunzipSync(readFileSync(new URL('meadow-roots-38.bin.gz',base))));assert.deepEqual(m.code,meadowRootCodeBinding());const tiles=await decodeMeadowRoots(raw,m);assert.equal(tiles.size,111);const slots=[...tiles.values()].flatMap(t=>t.slots);assert.equal(slots.filter(e=>e&&e!==true).length,45440);assert.equal(slots.filter(e=>e===true).length,46);assert.equal(slots.filter(Boolean).length,45486);assert.equal(m.roots,45440);assert.equal(m.procedural,46);
});

test('early asset prefetch does not expose roots before actual habitat verification',async()=>{
 const f=await fixture(),c=new MeadowRootCache(f.eco,options(f));const downloaded=await c.prefetch();assert.equal(downloaded.tiles.size,1);assert.equal(c.ready,false);assert.equal(c.readTile(-2,3),undefined);f.eco.floraCore.data[0]++;assert.equal(await c.prepare(),false);assert.equal(downloaded.tiles.size,0,'failed validation releases unused decoded roots');
});

test('shore community source and its authored reach controls participate in root binding',()=>{
 const paths=new Set(meadowRootCodeBinding().sources.map(s=>s.path));
 assert.ok(paths.has('src/v2/forest-reach-community39.js'));
 assert.ok(paths.has('src/v2/forest-reach39-source.js'));
});
