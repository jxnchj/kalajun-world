import test from 'node:test';import assert from 'node:assert/strict';import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';import {WorldEcology} from './ecology.js';import {riverSectionAt} from './river-section.js';import {FOREST_REACH39_SOURCE as src} from './forest-reach39-source.js';import {reachForm41Parameters,reachForm41Height} from './forest-reach-form41.js';import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
const saved=globalThis.location;let a,b,off;
try{globalThis.location={search:''};a=actualForestWorld(undefined,'rgba');globalThis.location={search:'?reachBankDesign50=root-pool'};b=actualForestWorld(undefined,'rgba');globalThis.location={search:'?reachBankDesign50=0'};off=actualForestWorld(undefined,'rgba');}finally{globalThis.location=saved;}
const r=a.hydrology.forestReach39,segments=a.hydrology.segments.filter(s=>s.lineId===src.lineId);
const section=o=>{const v=r.origin+o,s=segments.find(s=>s.a.distance<=v&&s.b.distance>=v),t=(v-s.a.distance)/(s.b.distance-s.a.distance);return {s,t,q:riverSectionAt(s,t)};};
test('root-pool whole section is bounded, protects trees and keeps complete water boundary',async t=>{
 assert.equal(terrainRowWorkerPolicy('?reachBankDesign50=root-pool').enabled,false);
 assert.notDeepEqual(await a.getForestRootInputHashes(),await b.getForestRootInputHashes());
 assert.deepEqual(await a.getForestRootInputHashes(),await off.getForestRootInputHashes());
 let changed=0,maxRise=0,maxFall=0,maxEdge=0,maxSlope=0,waterCrossings=0,originalWaterCrossings=0,newWaterCrossings=0;
 for(let o=-7;o<=5;o+=.1){
 const {s,t:st,q}=section(o),wa=r.waterSectionAt(s,st),wb=b.hydrology.forestReach39.waterSectionAt(s,st);
 maxEdge=Math.max(maxEdge,Math.abs(wa.left-wb.left),Math.abs(wa.right-wb.right));
 for(const side of [-1,1]){let prev=null,wet=null,oldWet=null;
 for(let d=0;d<=q.outer+.1;d+=.025){
 const x=q.x-q.fz*side*d,z=q.z+q.fx*side*d,old=a.surface.heightAt(x,z),y=b.surface.heightAt(x,z),delta=y-old;
 assert.equal(off.surface.heightAt(x,z),old);
 if(delta!==0){changed++;assert.ok(o>-5.2&&o<3.4);maxRise=Math.max(maxRise,delta);maxFall=Math.max(maxFall,-delta);}
 if(prev!==null)maxSlope=Math.max(maxSlope,Math.abs(y-prev)/.025);prev=y;
 const isWet=y<q.level-1e-7,wasWet=old<q.level-1e-7,oldCross=oldWet!==null&&!oldWet&&wasWet,newCross=wet!==null&&!wet&&isWet;if(oldCross)originalWaterCrossings++;if(newCross)waterCrossings++;if(newCross&&!oldCross)newWaterCrossings++;wet=isWet;oldWet=wasWet;
 }}}
 assert.ok(changed>0);assert.ok(maxRise>.05);assert.ok(maxEdge<.0002,'same water zero with original -1e-8 height threshold: under 0.2mm lateral solver shift');assert.equal(newWaterCrossings,0);assert.equal(waterCrossings,originalWaterCrossings);assert.ok(maxSlope<2);
 for(const tree of src.trees)for(const dx of [0,.2,-.2]){assert.equal(b.surface.heightAt(tree.x+dx,tree.z),a.surface.heightAt(tree.x+dx,tree.z));}
 let boundary=0,boundaryDerivative=0;
 for(const o of [-5.2,3.4]){const {q}=section(o);for(const side of [-1,1])for(const d of [.2,.5,1,1.5,2]){const x=q.x-q.fz*side*d,z=q.z+q.fx*side*d;boundary=Math.max(boundary,Math.abs(b.surface.heightAt(x,z)-a.surface.heightAt(x,z)));}}
 assert.equal(boundary,0);
 for(const o of [-5.2,3.4])for(const side of [-1,1])for(const d of [.2,.5,1,1.5,2]){
 const delta=offset=>{const {q}=section(offset),x=q.x-q.fz*side*d,z=q.z+q.fx*side*d;return b.surface.heightAt(x,z)-a.surface.heightAt(x,z);};
 boundaryDerivative=Math.max(boundaryDerivative,Math.abs((delta(o+1e-4)-delta(o-1e-4))/2e-4));
 }
 assert.ok(boundaryDerivative<1e-5);

 t.diagnostic(JSON.stringify({changed,maxRise,maxFall,maxEdge,maxSlope,waterCrossings,originalWaterCrossings,newWaterCrossings,boundary,boundaryDerivative}));
});
test('design reads the same continuous bed parameters from either side and returns exact original outside',()=>{
 for(const offset of [-9,-5.2,3.4,9])for(const side of [-1,1])assert.deepEqual(reachForm41Parameters(offset,.6,side,true),reachForm41Parameters(offset,.6,side));
 const p=reachForm41Parameters(1.5,.5,1,true),old=reachForm41Parameters(1.5,.5,1);assert.ok(Math.abs(p.height-old.height-.1)<1e-12);
});
test('actual complete 521-root generation preserves identity and reports changed source seats',t=>{
 const ea=new WorldEcology(a,{reachCoverPrepared:false}),eb=new WorldEcology(b,{reachCoverPrepared:false});
 try{ea.reachBankCover39.build();eb.reachBankCover39.build();const ar=ea.reachBankCover39.pools.flatMap(p=>p.records),br=eb.reachBankCover39.pools.flatMap(p=>p.records);assert.equal(ar.length,521);assert.equal(br.length,521);
 let movedY=0,maxRootY=0,changedFeet=0,maxOldSeatDelta=0,maxNewSeatError=0;
 for(let i=0;i<ar.length;i++){const p=ar[i],q=br[i];for(const k of ['id','kind','x','z','s','sy','rot'])assert.equal(q[k],p[k],p.id+'/'+k);if(q.y!==p.y){movedY++;maxRootY=Math.max(maxRootY,Math.abs(q.y-p.y));}
 const ga=p.coverAsset.geometry,gb=q.coverAsset.geometry;assert.deepEqual(gb.index.array,ga.index.array);assert.equal(gb.attributes.position.count,ga.attributes.position.count);
 for(const seat of p.coverAsset.seats)for(const v of seat.points){const delta=b.surface.heightAt(v.x,v.z)-a.surface.heightAt(v.x,v.z);if(Math.abs(delta)>1e-9)changedFeet++;maxOldSeatDelta=Math.max(maxOldSeatDelta,Math.abs(delta));}
 for(const seat of q.coverAsset.seats)for(const v of seat.points)maxNewSeatError=Math.max(maxNewSeatError,Math.abs(b.surface.heightAt(v.x,v.z)-seat.level));
 }
 assert.ok(maxNewSeatError<.027);t.diagnostic(JSON.stringify({roots:br.length,movedY,maxRootY,changedFeet,maxOldSeatDelta,maxNewSeatError}));
 }finally{ea.dispose();eb.dispose();}
});
