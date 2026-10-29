import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {MEADOW_ROOT_VERSION,sourceCells,encodeMeadowRoots,decodeMeadowRoots} from './meadow-root-codec.js';
import {MeadowRootCache,meadowRootInputHashes,MEADOW_CACHE_SPATIAL_PARAMETERS,meadowRootCacheEnabled42,MEADOW_ROOT_CACHE_ANCHORS,MEADOW_ROOT_CACHE_RADIUS,meadowRootCacheArea} from './meadow-root-cache.js';
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
 for(const search of ['',...MEADOW_CACHE_SPATIAL_PARAMETERS.map(k=>'?meadowRootCache=1&'+k+'='+(k==='pastureLife41'?'0':'1'))]){const c=new MeadowRootCache(eco,{search,fetchImpl});assert.equal(await c.prepare(),false);assert.equal(c.readTile(0,0),undefined);}assert.equal(calls,0);
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
// Adopted 39/41 moves 38 retained roots to original wet geometry; the 45,486-root total is unchanged.
// Generation independently compares every source slot/field; actual cache/source 90-tick equality is tested separately.
test('generated 111 tiles are bound to current source and 45402 complete field records plus 84 original-geometry slots retain all 45486 roots',async()=>{
 const base=new URL('../../public/data/v2/',import.meta.url),m=JSON.parse(readFileSync(new URL('meadow-roots-38.json',base))),raw=new Uint8Array(gunzipSync(readFileSync(new URL('meadow-roots-38.bin.gz',base))));assert.deepEqual(m.code,meadowRootCodeBinding());const tiles=await decodeMeadowRoots(raw,m);assert.equal(tiles.size,111);const slots=[...tiles.values()].flatMap(t=>t.slots);assert.equal(slots.filter(e=>e&&e!==true).length,45402);assert.equal(slots.filter(e=>e===true).length,84);assert.equal(slots.filter(Boolean).length,45486);assert.equal(m.roots,45402);assert.equal(m.procedural,84);
});

test('early asset prefetch does not expose roots before actual habitat verification',async()=>{
 const f=await fixture(),c=new MeadowRootCache(f.eco,options(f));const downloaded=await c.prefetch();assert.equal(downloaded.tiles.size,1);assert.equal(c.ready,false);assert.equal(c.readTile(-2,3),undefined);f.eco.floraCore.data[0]++;assert.equal(await c.prepare(),false);assert.equal(downloaded.tiles.size,0,'failed validation releases unused decoded roots');
});

test('shore community source and its authored reach controls participate in root binding',()=>{
 const paths=new Set(meadowRootCodeBinding().sources.map(s=>s.path));
 assert.ok(paths.has('src/v2/forest-reach-community39.js'));
 assert.ok(paths.has('src/v2/forest-reach39-source.js'));
});

test('adopted pasture contact participates in exact binding and default/explicit one retain cache',()=>{const paths=new Set(meadowRootCodeBinding().sources.map(s=>s.path));for(const p of ['src/v2/pasture-plant-contact41.js','src/v2/pasture-life41.js','src/v2/generated/pasture-life-contact41.json'])assert.ok(paths.has(p),p);for(const search of ['?meadowRootCache=1','?meadowRootCache=1&pastureLife41=1'])assert.equal(new MeadowRootCache({}, {search}).reason,null);assert.match(new MeadowRootCache({}, {search:'?meadowRootCache=1&pastureLife41=0'}).reason,/pastureLife41/);});

test('automatic cache is limited to verified forest entry and explicit off remains authoritative',()=>{
 assert.equal(meadowRootCacheEnabled42('?view=river-forest',true),true);
 assert.equal(meadowRootCacheEnabled42('?view=river-forest&meadowRootCache=0',true),false);
 assert.equal(meadowRootCacheEnabled42('?view=river-forest&meadowRootCache=invalid',true),false);
 assert.equal(meadowRootCacheEnabled42('?view=river-forest',false),false);
 for(const view of ['valley','meadow','west-slope','brook-lanchuan','guest-interior',''])assert.equal(meadowRootCacheEnabled42('?view='+view,true),false);
 assert.equal(meadowRootCacheEnabled42('?view=brook-lanchuan&meadowRootCache=1',true),true);
});

const inside=()=>({x:MEADOW_ROOT_CACHE_ANCHORS[0][0],z:MEADOW_ROOT_CACHE_ANCHORS[0][1]}),outside={x:-1700,z:4500};
test('browser valley entry is dormant until actual destination enters a prepared area; off/invalid/spatial experiment never fetch',async()=>{
 const f=await fixture();let calls=0;const o={...options(f),browser:true,search:'?view=valley',fetchImpl:async(...args)=>{calls++;return options(f).fetchImpl(...args);}};
 const c=new MeadowRootCache(f.eco,o);assert.equal(c.stats.status,'dormant');assert.equal(c.prefetch(),null);assert.equal(await c.prepare(),false);c.updateArea(outside);assert.equal(calls,0);
 assert.equal(await c.updateArea(inside()),true);assert.equal(calls,2);assert.equal(c.stats.activations,1);assert.equal(c.readTile(-2,3).length,2);
 c.updateArea(outside);assert.equal(c.readTile(-2,3),undefined);assert.equal(c.ready,true,'verified payload retained for return');await c.updateArea(inside());assert.equal(calls,2);assert.equal(c.readTile(-2,3).length,2);c.dispose();
 for(const q of ['?meadowRootCache=0','?meadowRootCache=invalid','?riverMeanders=0']){const blocked=new MeadowRootCache(f.eco,{...o,search:q});assert.equal(blocked.updateArea(inside()),null);assert.equal(blocked.prefetch(),null);assert.equal(await blocked.prepare(),false);blocked.dispose();}assert.equal(calls,2);
 const edge=inside();edge.x+=MEADOW_ROOT_CACHE_RADIUS;assert.equal(meadowRootCacheArea(edge),0);edge.x+=.001;assert.equal(meadowRootCacheArea(edge),-1);assert.equal(meadowRootCacheArea({x:NaN,z:0}),-1);
});
test('destination switch aborts owned requests; stale completion cannot replace re-entry or dispose data',async()=>{
 const f=await fixture();let release,calls=0;const gate=new Promise(r=>release=r),signals=[];
 const c=new MeadowRootCache(f.eco,{...options(f),browser:true,search:'?view=valley',fetchImpl:async(url,init)=>{signals.push(init.signal);return options(f).fetchImpl(url,init);},loadCode:async()=>{if(++calls===1)await gate;return {signature:'source'};}});
 const first=c.updateArea(inside());await Promise.resolve();c.updateArea(outside);assert.equal(signals[0].aborted,true);assert.equal(c.stats.cancellations,1);
 const second=c.updateArea(inside());assert.equal(await second,true);const installed=c.tiles;release();assert.equal(await first,false);assert.equal(c.tiles,installed);assert.equal(c.tiles.size,1);assert.equal(c.stats.status,'ready');assert.equal(c.stats.attempts,2);
 c.dispose();assert.equal(c.tiles.size,0);assert.equal(c.stats.status,'disposed');assert.equal(c.updateArea(inside()),null);
});
test('destination failures stay observable without per-frame retries; leaving and re-entering permits recovery',async()=>{
 const f=await fixture();let fail=true,calls=0;
 const c=new MeadowRootCache(f.eco,{...options(f),browser:true,search:'?view=valley',fetchImpl:async(...args)=>{calls++;return fail?{ok:false,status:503}:options(f).fetchImpl(...args);}});
 assert.equal(await c.updateArea(inside()),false);assert.match(c.stats.lastError,/503/);for(let i=0;i<20;i++)assert.equal(await c.updateArea(inside()),false);assert.equal(calls,1);
 c.updateArea(outside);fail=false;assert.equal(await c.updateArea(inside()),true);assert.equal(calls,3);assert.match(c.stats.lastError,/503/,'recovered error remains inspectable');assert.equal(c.stats.reason,null);c.dispose();
});
test('already aborted owner never starts requests, and hidden meadow does not activate a destination',async()=>{
 const f=await fixture();let calls=0;const controller=new AbortController();controller.abort(new DOMException('gone','AbortError'));
 const c=new MeadowRootCache(f.eco,{...options(f),browser:true,search:'?view=valley',fetchImpl:()=>{calls++;throw Error('unexpected');}});
 assert.equal(c.updateArea(inside(),{needed:false}),null);assert.equal(await c.updateArea(inside(),{signal:controller.signal}),false);assert.equal(calls,0);assert.equal(c.stats.status,'aborted');c.dispose();
});
