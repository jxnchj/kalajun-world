import test from 'node:test';import assert from 'node:assert/strict';import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';import {WorldEcology} from './ecology.js';import {riverSectionAt} from './river-section.js';import {FOREST_REACH39_SOURCE as src} from './forest-reach39-source.js';import {reachBank48Height} from './reach-bank-profile48.js';import {terrainRowWorkerPolicy} from './terrain-row-worker-client.js';
const saved=globalThis.location;let a,b;
try{globalThis.location={search:''};a=actualForestWorld(undefined,'rgba');globalThis.location={search:'?reachBankProfile48=left-hermite'};b=actualForestWorld(undefined,'rgba');}finally{globalThis.location=saved;}
const r=a.hydrology.forestReach39,segments=a.hydrology.segments.filter(s=>s.lineId===src.lineId);
const section=o=>{const v=r.origin+o,s=segments.find(s=>s.a.distance<=v&&s.b.distance>=v),t=(v-s.a.distance)/(s.b.distance-s.a.distance);return {s,t,q:riverSectionAt(s,t)};};
test('local OFF candidate preserves complete water edges, opposite bank and domain, C1 and positive dry slope',async t=>{
 assert.equal(terrainRowWorkerPolicy('?reachBankProfile48=left-hermite').enabled,false);
 assert.notDeepEqual(await a.getForestRootInputHashes(),await b.getForestRootInputHashes());
 let changed=0,maxRise=0,maxSlope=0,minDry=Infinity,maxEdgeError=0;
 for(let o=-13;o<=-6;o+=.1){const {s,t:st,q}=section(o),qa=r.waterSectionAt(s,st),qb=b.hydrology.forestReach39.waterSectionAt(s,st);maxEdgeError=Math.max(maxEdgeError,Math.abs(qa.left-qb.left),Math.abs(qa.right-qb.right));
 for(const side of [-1,1]){let prev=null;
 for(let d=0;d<=q.outer+.02;d+=.025){const x=q.x-q.fz*side*d,z=q.z+q.fx*side*d,old=a.surface.heightAt(x,z),y=b.surface.heightAt(x,z),delta=y-old;
 if(delta!==0){changed++;maxRise=Math.max(maxRise,delta);assert.ok(side===-1&&o>-11.1&&o<-7.6);assert.ok(delta>=-1e-9);minDry=Math.min(minDry,y-q.level);}
 if(prev!==null&&side===-1&&d>qa.left&&o>-11.1&&o<-7.6)maxSlope=Math.max(maxSlope,Math.abs((y-prev)/.025));prev=y;
 }}}
 assert.ok(changed>0);assert.ok(maxEdgeError<1e-7);assert.ok(minDry>=-1e-7);assert.ok(maxSlope<1);
 const eps=1e-4;let endpointError=0,derivativeDelta=0;
 for(const edge of [-11.1,-7.6]){const values=[];for(const o of [edge-eps,edge,edge+eps]){const {q}=section(o),d=q.left+.4,x=q.x+q.fz*d,z=q.z-q.fx*d;values.push(b.surface.heightAt(x,z)-a.surface.heightAt(x,z));}endpointError=Math.max(endpointError,Math.abs(values[1]));derivativeDelta=Math.max(derivativeDelta,Math.abs((values[2]-values[0])/(2*eps)));}
 assert.equal(endpointError,0);assert.ok(derivativeDelta<1e-5);t.diagnostic(JSON.stringify({changed,maxRise,maxSlope,minDry,maxEdgeError,endpointError,derivativeDelta}));
});
test('ordinary profile never changes rootBank or unsuitable real endpoint and matches end derivatives',()=>{
 const options={offset:-9.35,side:-1,rootBank:0,gap:0,span:1.5,level:0,anchor:{height:.12,slope:.05}};
 assert.equal(reachBank48Height(0,options),0);assert.equal(reachBank48Height(.12,{...options,gap:1.5}),.12);
 assert.equal(reachBank48Height(.07,{...options,gap:.5,rootBank:.001}),.07);
 assert.equal(reachBank48Height(.07,{...options,gap:.5,anchor:{height:-.03,slope:.05}}),.07);
 const e=1e-5,at=x=>reachBank48Height(0,{...options,gap:x});assert.ok(Math.abs((at(e)-at(0))/e)<1e-5);assert.ok(Math.abs((at(1.5)-at(1.5-e))/e-.05)<1e-5);
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
