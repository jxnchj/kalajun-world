import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {actualMeadowEcology} from '../../../tools/profile-meadow-v38.mjs';
import {forestFloorAt} from './forest-floor.js';
import {riverSectionAt} from './river-section.js';
import {flowerAssetsFromScene} from './flower-assets.js';
import {forestRootCacheEligibility} from './forest-root-cache.js';
import {MeadowRootCache} from './meadow-root-cache.js';
const base=new URL('../../public/',import.meta.url);
async function load(path){const b=fs.readFileSync(new URL(path,base)),loader=new GLTFLoader();loader.register(()=>({name:'no-image-test',loadTexture:()=>Promise.resolve(new T.Texture())}));return(await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
const before=actualMeadowEcology({forestReach39:false,forestRootedShoulder38:false,forestBankCurvature38:false}),after=actualMeadowEcology({forestReach39:false,forestRootedShoulder38:true,forestBankCurvature38:false});
test.after(()=>{before.dispose();after.dispose();});
test('actual forest candidate retains all water/road/building interfaces, has no new raw-submerged dam, and reconnects at reach ends',()=>{
 const a=before.world,b=after.world,view=a.hydrology.viewpoints.find(v=>v.id==='river-forest'),anchor=a.hydrology.segments.find(s=>s.id===view.segmentId);let raised=0,under=0;
 assert.equal(a.hydrology.stats.forestRootedShoulder38,false);assert.equal(b.hydrology.stats.forestRootedShoulder38,true);
 assert.deepEqual(a.entities,b.entities);assert.deepEqual(a.hydrology.lines,b.hydrology.lines);assert.deepEqual(a.hydrology.segments,b.hydrology.segments);
 for(const s of a.hydrology.segments.filter(s=>s.lineId===anchor.lineId&&Math.abs(s.a.distance-anchor.a.distance)<80))for(const t of [0,.5,1]){
  const q=riverSectionAt(s,t);for(const side of [-1,1])for(const d of [-.2,0,.02,.1,.3,.5,.8,1,1.5,2]){
   const across=side*((side<0?q.left:q.right)+d),x=q.x-q.fz*across,z=q.z+q.fx*across;
   const h=a.surface.heightAt(x,z),n=b.surface.heightAt(x,z),raw=a.surface.uncarvedHeightAt(x,z),water=a.hydrology.sampleAt(x,z);
   assert.ok(n>=h&&n-h<=.090000001);assert.equal(b.forestShoulderSourceWorld.surface.heightAt(x,z),h);
   assert.deepEqual(b.hydrology.sampleAt(x,z),water);assert.equal(b.hydrology.isExcluded(x,z,.3),a.hydrology.isExcluded(x,z,.3));
   if(raw<=water.surfaceLevel){assert.equal(n,h);under++;}if(n>h+1e-6)raised++;
   if(Math.abs(q.distance-anchor.a.distance)>62||d>=1.5)assert.equal(n,h);
  }
 }
 assert.ok(raised>5&&under>5);
 for(const routes of [a.objects.tracks,a.objects.paths,a.objects.boardwalks])for(const route of routes||[])for(const [x,z]of route.pts||[])assert.equal(b.surface.heightAt(x,z),a.surface.heightAt(x,z));
 for(const e of a.entities)assert.equal(b.surface.heightAt(e.x,e.z),a.surface.heightAt(e.x,e.z));
});
test('real grass/tree/floor and loaded flower assets keep ID, xz, scale, rotation and counts; only final Y follows the shared terrain',async t=>{
 const stats={grass:0,tree:0,floor:0,flower:0,raised:0};
 function check(a,b,kind){assert.equal(Boolean(b),Boolean(a),kind+' membership');if(!a)return;stats[kind]++;for(const k of ['id','x','z','s','sy','rot','variant','kind','pitch'])assert.equal(b[k],a[k],kind+' '+k);
  const delta=after.world.surface.heightAt(a.x,a.z)-before.world.surface.heightAt(a.x,a.z);assert.ok(Math.abs(b.y-a.y-delta)<1e-9,kind+' physical Y');if(delta>1e-6)stats.raised++;
 }
 for(let z=Math.floor(4782/.8);z<Math.ceil(4826/.8);z++)for(let x=Math.floor(-3636/.8);x<Math.ceil(-3592/.8);x++)check(before.grassAt(x,z),after.grassAt(x,z),'grass');
 for(let z=395;z<=406;z++)for(let x=-307;x<=-296;x++)check(before.treeAt(x,z),after.treeAt(x,z),'tree');
 for(let z=Math.floor(4782/2.4);z<Math.ceil(4826/2.4);z++)for(let x=Math.floor(-3636/2.4);x<Math.ceil(-3592/2.4);x++)check(forestFloorAt(before.world,x,z,(...p)=>before.excluded(...p)),forestFloorAt(after.world,x,z,(...p)=>after.excluded(...p)),'floor');
 const assets=flowerAssetsFromScene(await load('assets/v2/meadow-flowers-lod.glb')),high=flowerAssetsFromScene(await load('assets/v2/meadow-flowers.glb'));
 for(const eco of [before,after]){eco.flowerAssets=assets;eco.flowerNearAssets=high;eco.flowerPools=assets.variants.filter(v=>v.role!=='seed').map(variant=>({variant,mesh:new T.InstancedMesh(variant.parts[0].geometry,variant.parts[0].material,12000),records:[],dirtyMin:Infinity,dirtyMax:0}));for(const p of eco.flowerPools)eco.group.add(p.mesh);for(let z=199;z<=201;z++)for(let x=-152;x<=-150;x++)eco.addFlowers(x,z);}
 const a=[...before.flowerTiles.values()].flat(),b=new Map([...after.flowerTiles.values()].flat().map(p=>[p.id,p]));assert.equal(a.length,b.size);for(const p of a)check(p,b.get(p.id),'flower');
 assert.ok(stats.grass>100&&stats.tree>10&&stats.floor>5&&stats.flower>50&&stats.raised>0);t.diagnostic(JSON.stringify(stats));
});
test('candidate never accepts default cached root heights and its exact input hashes differ',async()=>{
 assert.match(forestRootCacheEligibility('?forestRootCache=1&forestRootedShoulder38=1','v15'),/forestRootedShoulder38/);
 const cache=new MeadowRootCache(after,{search:'?meadowRootCache=1&forestRootedShoulder38=1'});assert.match(cache.reason,/forestRootedShoulder38/);assert.equal(cache.prefetch(),null);cache.dispose();
 assert.notDeepEqual(await before.world.getForestRootInputHashes(),await after.world.getForestRootInputHashes());
});
