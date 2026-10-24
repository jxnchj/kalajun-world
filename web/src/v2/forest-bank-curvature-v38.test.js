import test from 'node:test';import assert from 'node:assert/strict';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {riverSectionAt} from './river-section.js';
import {createForestBankCurvature38,forestBankCurvatureHeight38} from './forest-bank-curvature-v38.js';
const base=actualForestWorld(undefined,'rgba',{forestBankCurvature38:false}),candidate=actualForestWorld(undefined,'rgba'),h=base.hydrology,anchor=h.segments.find(s=>s.id===h.viewpoints.find(v=>v.id==='river-forest').segmentId);
test('actual candidate leaves all source nodes water parameters and unrelated terrain exact',()=>{
 assert.deepEqual(candidate.hydrology.lines,base.hydrology.lines);assert.deepEqual(candidate.hydrology.segments,base.hydrology.segments);
 assert.equal(base.hydrology.stats.forestBankCurvature38,false);assert.equal(candidate.hydrology.stats.forestBankCurvature38,true);
 let changed=0;
 for(const offset of [-24,-18,-12,-6,0,6,12,18,24]){
  const s=h.segments.find(s=>s.lineId===anchor.lineId&&s.a.distance<=anchor.a.distance+offset&&s.b.distance>=anchor.a.distance+offset),q=riverSectionAt(s,(anchor.a.distance+offset-s.a.distance)/(s.b.distance-s.a.distance));
  for(const side of [-1,1])for(const outward of [-.2,0,.02,.1,.3,.6,1,2]){
   const half=side<0?q.left:q.right,d=half+outward,x=q.x-q.fz*side*d,z=q.z+q.fx*side*d,a=base.surface.heightAt(x,z),b=candidate.surface.heightAt(x,z),raw=base.surface.uncarvedHeightAt(x,z);
   if(Math.abs(offset)>=18||outward<=0||d>=q.outer)assert.ok(Math.abs(a-b)<1e-9,`protected ${offset}/${side}/${outward}`);
   else {if(Math.abs(a-b)>1e-6)changed++;assert.ok(b<=raw+1e-9);if(raw>q.level)assert.ok(b>=q.level-1e-9);}
   const wa=base.hydrology.sampleAt(x,z),wb=candidate.hydrology.sampleAt(x,z);for(const key of ['wetness','riverBed','bank','width','flowX','flowZ','insideWater','shoreDistance'])assert.equal(wa[key],wb[key],key);
   assert.equal(candidate.forestShoulderSourceWorld.surface.heightAt(x,z),a);
  }
 }
 assert.ok(changed>20,'candidate genuinely changes bank geometry');
 assert.notDeepEqual(candidate.getForestRootInputHashes(),base.getForestRootInputHashes(),'old prepared heights cannot be reused under candidate inputs');
});
test('actual signed bend corrects inside/outside convention; toe and crest continuous; protection exact',()=>{
 const field=createForestBankCurvature38(h.segments,anchor),q=riverSectionAt(anchor,0),turn=field.byId.get(anchor.id);assert.ok(turn.a<-.5);
 const evaluate=(side,u)=>{const half=side<0?q.left:q.right;return forestBankCurvatureHeight38({field,query:{section:q,segment:anchor,signed:side,distance:half+u,half},rawHeight:q.level+.4,baseline:q.level});};
 assert.ok(evaluate(-1,.2)<evaluate(1,.2),'negative bend: side- is gentle inner bank');
 for(const side of [-1,1]){let prev=q.level;const half=side<0?q.left:q.right;for(let d=.001;d<q.outer-half;d+=.005){const y=evaluate(side,d);assert.ok(y>=prev-1e-9);prev=y;}assert.ok(Math.abs(evaluate(side,.000001)-q.level)<.00001);}
 assert.equal(forestBankCurvatureHeight38({field,query:{section:q,segment:anchor,signed:1,distance:q.right+.2,half:q.right},rawHeight:q.level+.4,baseline:q.level+.12,protectedGround:true}),q.level+.12);
});


test('real candidate seats complete original leaf footprints without compacting or changing wind/indices',async()=>{
 const {WorldEcology}=await import('./ecology.js'),a=new WorldEcology(base),b=new WorldEcology(candidate);
 const p=a._grassAt(-4524,6011),q=b._grassAt(-4524,6011);assert.ok(q.brookAsset);const {y:py,...pa}=p,{y:qy,brookAsset,...qa}=q;assert.deepEqual(pa,qa);
 for(const [i,g]of q.brookAsset.geometries.entries()){
  const original=[a.grassGeometries[0],a.grassGeometries[1],a.baseGrassGeometry][i],p0=original.attributes.position,p1=g.attributes.position;
  assert.deepEqual(original.index.array,g.index.array);assert.equal(p0.count,p1.count);
  for(let j=0;j<p0.count;j++){assert.equal(p0.getX(j),p1.getX(j));assert.equal(p0.getZ(j),p1.getZ(j));}
  for(const [key,attr]of Object.entries(original.attributes))if(key!=='position')assert.deepEqual(attr.array,g.attributes[key].array,key);
 }
 for(let iz=398;iz<=403;iz++)for(let ix=-304;ix<=-298;ix++){
  const p=a.treeAt(ix,iz),q=b.treeAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(p){const {y:py,...pr}=p,{y:qy,...qr}=q;assert.deepEqual(pr,qr);}
 }
 q.brookAsset.dispose();a.dispose();b.dispose();
});

test('explicit URL zero selects original bank; default adopts only curvature geometry and leaf seating',()=>{
 const previous=globalThis.location;try{globalThis.location={search:'?forestBankCurvature38=0'};const original=actualForestWorld(undefined,'rgba');assert.equal(original.hydrology.stats.forestBankCurvature38,false);assert.equal(original.forestShoulderSourceWorld,undefined);}finally{globalThis.location=previous;}
});
