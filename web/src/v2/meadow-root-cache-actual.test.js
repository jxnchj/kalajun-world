import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actualMeadowEcology} from '../../../tools/profile-meadow-v38.mjs';
import {MeadowRootCache,meadowRootInputHashes} from './meadow-root-cache.js';
import {meadowRootCodeBinding} from '../../meadow-root-binding.js';
import {boardwalkTimber} from './boardwalk-timber.js';
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const rows=mesh=>Object.fromEntries(['aMeadowRootField','aMeadowLandform','aMeadowCommunity'].map(k=>[k,bytes(mesh.geometry.attributes[k].array)]));
const geometryData=g=>({attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{bytes:bytes(a.array),itemSize:a.itemSize,normalized:a.normalized}])),index:g.index?bytes(g.index.array):null,groups:g.groups,drawRange:g.drawRange,boundingBox:g.boundingBox,boundingSphere:g.boundingSphere});
const rootData=({brookAsset,...root})=>brookAsset?{...root,brookAsset:{geometries:brookAsset.geometries.map(geometryData),envelope:brookAsset.envelope,feet:brookAsset.feet,seating:brookAsset.seating,physicalOnly:brookAsset.physicalOnly}}:root;
const base=new URL('../../public/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('data/v2/meadow-roots-38.json',base)));
function camera(eco,x,z){const position=eco.uniforms.uWorldViewer.value;position.set(x,eco.world.surface.heightAt(x,z)+1.7,z);return {position};}
function prepare(eco,cam){for(let i=0;i<90;i++)eco.updateMeadow(cam,{deferPools:true});eco.publishMeadowPools(cam);}
const fetchImpl=async url=>{const data=readFileSync(new URL(url.split('?')[0],base));return {ok:true,json:async()=>JSON.parse(data),arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};};
test('actual source world: 90 cached/source ticks yield identical root lists, every near/far/basal matrix and field byte; timber does not mutate roots or inputs',async()=>{
 const previous=globalThis.location,original=actualMeadowEcology();let cached;
 try{
  globalThis.location={search:'?meadowRootCache=1&boardwalkTimber=1'};cached=actualMeadowEcology();
  const before=await meadowRootInputHashes(cached),timber=boardwalkTimber(cached.world);assert.equal(timber.enabled,true);assert.ok(timber.pieces>0);
  assert.deepEqual(await meadowRootInputHashes(cached),before,'Rendering/collision timber has not modified source world/habitat');assert.deepEqual(before,manifest.inputs,'Exact current decoded world and habitats match generated package');
  cached.meadowRootCache=new MeadowRootCache(cached,{search:globalThis.location.search,fetchImpl,loadCode:async()=>meadowRootCodeBinding()});assert.equal(await cached.meadowRootCache.prepare(),true,cached.meadowRootCache.stats.reason);
  const [x,z]=manifest.anchors[0];prepare(original,camera(original,x,z));prepare(cached,camera(cached,x,z));
  assert.equal(cached.grassTiles.size,original.grassTiles.size);assert.equal(cached.stats.grassTufts,19403);assert.equal(cached.stats.grassPending,0);assert.equal(cached.meadowRootCache.stats.hits,54);
  for(const [key,tile]of original.grassTiles){const actual=cached.grassTiles.get(key);assert.deepEqual(actual.list.map(rootData),tile.list.map(rootData),key+' full roots and every procedural leaf attribute');assert.equal(actual.wetMeshes.length,tile.wetMeshes.length);for(let j=0;j<tile.wetMeshes.length;j++){assert.deepEqual(geometryData(actual.wetMeshes[j].geometry),geometryData(tile.wetMeshes[j].geometry),key+' wet batched geometry');assert.equal(actual.wetMeshes[j].visible,tile.wetMeshes[j].visible);assert.equal(actual.wetMeshes[j].castShadow,tile.wetMeshes[j].castShadow);}assert.equal(actual.meshes.length,tile.meshes.length);for(let i=0;i<tile.meshes.length;i++){
   const a=actual.meshes[i],b=tile.meshes[i];if(!b){assert.equal(a,b);continue;}
   assert.deepEqual(bytes(a.instanceMatrix.array),bytes(b.instanceMatrix.array),key+' instance matrices');assert.deepEqual(rows(a),rows(b),key+' all fields');assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);assert.equal(a.castShadow,b.castShadow);assert.equal(a.count,b.count);
  }}
  const a=cached.baseGrass.mesh,b=original.baseGrass.mesh;assert.deepEqual(bytes(a.instanceMatrix.array),bytes(b.instanceMatrix.array));assert.deepEqual(rows(a),rows(b));assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);assert.equal(a.count,b.count);
 }finally{globalThis.location=previous;original.dispose();cached?.dispose();}
});

test('actual legacy valley never activates newly adopted default forest or meadow roots, even if the caller omits its URL flags',async()=>{
 const {ForestRootCache}=await import('./forest-root-cache.js');
 const {forestRootCodeBinding}=await import('../../forest-root-binding.js');
 const previous=globalThis.location;let eco;
 try{
  globalThis.location={search:'?valleyLandform=0&valleyMeanders=0&valleySection=0'};eco=actualMeadowEcology();
  assert.equal(eco.world.hydrology.stats.valleyDeposits.nodes,0);
  const actual=await meadowRootInputHashes(eco);assert.notEqual(actual.world.options,manifest.inputs.world.options,'resolved physical section participates in the actual input hash');
  let calls=0;const neverFetch=()=>{calls++;throw Error('explicit experiment must bypass');};
  const forestBypass=new ForestRootCache(eco.world,{search:globalThis.location.search+'&forestRootCache=1',fetchImpl:neverFetch});
  const meadowBypass=new MeadowRootCache(eco,{search:globalThis.location.search+'&meadowRootCache=1',fetchImpl:neverFetch});
  assert.equal(await forestBypass.prepare(),false);assert.equal(await meadowBypass.prepare(),false);assert.equal(calls,0);
  // Source input verification is independent of URL eligibility: an accidental
  // option-stripping caller must still not install the default spatial data.
  const forest=new ForestRootCache(eco.world,{search:'?forestRootCache=1',fetchImpl,loadCode:async()=>forestRootCodeBinding()});
  const meadow=new MeadowRootCache(eco,{search:'?meadowRootCache=1',fetchImpl,loadCode:async()=>meadowRootCodeBinding()});
  assert.equal(await forest.prepare(),false);assert.match(forest.stats.reason,/actual world inputs changed/);
  assert.equal(await meadow.prepare(),false);assert.match(meadow.stats.reason,/world\/habitat inputs changed/);
  assert.equal(forest.at(-1,0),undefined);assert.equal(meadow.readTile(-1,0),undefined);
  forest.dispose();meadow.dispose();forestBypass.dispose();meadowBypass.dispose();
 }finally{globalThis.location=previous;eco?.dispose();}
});

test('real valley-to-forest request sequence activates only at the destination and yields byte-identical retained plants',async()=>{
 const original=actualMeadowEcology(),cached=actualMeadowEcology(),requests=[];let pending;
 try{
  cached.meadowRootCache.dispose();cached.meadowRootCache=new MeadowRootCache(cached,{browser:true,search:'?view=valley',fetchImpl:async(url,init)=>{requests.push(url);return fetchImpl(url,init);},loadCode:async()=>meadowRootCodeBinding()});
  const valleyA=camera(original,-1700,4500),valleyB=camera(cached,-1700,4500);valleyA.position.y+=128.3;valleyB.position.y+=128.3;
  original.updateMeadow(valleyA,{deferPools:true});cached.updateMeadow(valleyB,{deferPools:true});assert.equal(requests.length,0,'valley entry requests no finite forest payload');assert.equal(cached.meadowRootCache.stats.status,'dormant');
  const [x,z]=manifest.anchors[0],a=camera(original,x,z),b=camera(cached,x,z);
  original.updateMeadow(a,{deferPools:true});cached.updateMeadow(b,{deferPools:true});pending=cached.meadowRootCache.pending;assert.ok(pending,'real updateMeadow starts destination preparation');assert.equal(await pending,true,cached.meadowRootCache.stats.reason);
  prepare(original,a);prepare(cached,b);
  assert.equal(requests.length,2);assert.match(requests[0],/meadow-roots-38\.json$/);assert.match(requests[1],/meadow-roots-38\.bin\.gz\?v=/);
  assert.equal(cached.grassTiles.size,54);assert.equal(cached.stats.grassTufts,19403);assert.equal(cached.stats.grassPending,0);assert.ok(cached.meadowRootCache.stats.hits>=52,'at most the first two tiles use the existing generator while fetch is pending');
  for(const [key,tile]of original.grassTiles){const t=cached.grassTiles.get(key);assert.deepEqual(t.list.map(rootData),tile.list.map(rootData),key+' every root and procedural geometry');for(let i=0;i<tile.meshes.length;i++){const ga=t.meshes[i],gb=tile.meshes[i];if(!gb){assert.equal(ga,gb);continue;}assert.deepEqual(bytes(ga.instanceMatrix.array),bytes(gb.instanceMatrix.array),key+' matrices');assert.deepEqual(rows(ga),rows(gb),key+' fields');assert.deepEqual(ga.boundingBox,gb.boundingBox);assert.deepEqual(ga.boundingSphere,gb.boundingSphere);assert.equal(ga.count,gb.count);assert.equal(ga.castShadow,gb.castShadow);}}
  assert.deepEqual(bytes(cached.baseGrass.mesh.instanceMatrix.array),bytes(original.baseGrass.mesh.instanceMatrix.array));assert.deepEqual(rows(cached.baseGrass.mesh),rows(original.baseGrass.mesh));
  cached.updateMeadow(camera(cached,-1700,4500),{deferPools:true});assert.equal(cached.meadowRootCache.stats.active,false);cached.updateMeadow(camera(cached,x,z),{deferPools:true});assert.equal(requests.length,2,'return uses the verified payload without refetch');
 }finally{original.dispose();cached.dispose();}
});
