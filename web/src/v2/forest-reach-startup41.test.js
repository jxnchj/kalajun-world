import test from'node:test';import assert from'node:assert/strict';import * as T from'three';import{actualForestWorld}from'../../../tools/benchmark_forest_exclusion_v38.mjs';import{WorldTerrain}from'./terrain.js';
test('actual v3 starts the complete world terrain, including non-natural same-river segments and endpoints',t=>{
 const saved=globalThis.location;globalThis.location={search:'?view=river-forest&time=870&debug=1&forestReach39=1&forestReachForm41=1'};
 let terrain;try{const w=actualForestWorld(undefined,'rgba',{forestReach39:true}),baseline=actualForestWorld(undefined,'rgba',{forestReach39:false}),reach=w.hydrology.forestReach39;let outside=0,unshaped=0;
 for(const s of w.hydrology.segments.filter(s=>s.lineId===reach.lineId)){for(const node of[s.a,s.b]){const offset=node.distance-reach.origin;if(Math.abs(offset)<=18)continue;outside++;if(!s.naturalBanks)unshaped++;for(const dx of[-1,0,1]){const x=node.x+dx,z=node.z;assert.ok(Number.isFinite(w.surface.heightAt(x,z)));assert.equal(w.surface.heightAt(x,z),baseline.surface.heightAt(x,z));}}}
 assert.ok(outside>0&&unshaped>0);terrain=new WorldTerrain(w);assert.equal(terrain.roots.length,64);const camera=new T.PerspectiveCamera(52,1280/800,.25,150000);camera.position.set(-3611.981330525,2329.157,4805.371282289);camera.rotation.set(-.17,.52,0,'YXZ');camera.updateMatrixWorld();for(let i=0;i<12;i++)terrain.update(camera,1/60);
 t.diagnostic(JSON.stringify({fullWorldRoots:terrain.roots.length,outsideEndpointSamples:outside,unshapedEndpointSamples:unshaped,queuedTiles:terrain.stats.queuedTiles}));
 }finally{terrain?.dispose();globalThis.location=saved;}
});
