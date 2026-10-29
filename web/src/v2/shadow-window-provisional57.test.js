import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createWindowColumnIndex42,cachedWindowBudget42,executableWindowBudget42} from './shadow-window-budget42.js';
import {shadowColumnBasis42,createColumnPreparationBudget42} from './shadow-column-audit42.js';
import {ShadowWindowCoverage42,sourceGeometryState42} from './shadow-window-coverage42.js';
function fixture(){const sun=new T.Vector3(.2,1,.1),basis=shadowColumnBasis42(sun.toArray()),records=new Map(),provider={revision:1,ready:true,records,sources:()=>[...records.keys()],states:()=>new Map()},index=createWindowColumnIndex42({wholeStaticSources:true}),debug={environment:{sun},terrain:{materials:[]},ecology:{gpuBrushes:{forms:[],batches:new Map()}}};return{basis,provider,index,debug,options:{anchor:[0,0,0],sizes:[4.5],submissions:provider,sourceIndex:index,wholeStaticSources:true},add(s){s.updateMatrixWorld();provider.revision++;records.set(s,{version:provider.revision,snapshot:sourceGeometryState42(s)});}};}
function roots(){const g=new T.BoxGeometry();g.setAttribute('aPlantWind',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(.6),3));const s=new T.InstancedMesh(g,new T.MeshStandardMaterial(),2);s.customDepthMaterial=new T.MeshDepthMaterial();s.setMatrixAt(0,new T.Matrix4());s.setMatrixAt(1,new T.Matrix4().makeTranslation(900,30,0));s.instanceMatrix.needsUpdate=true;return s;}
test('unknown wind bounds retain all actual roots/draw attributes then refine without a partial source certificate',async()=>{
 const f=fixture();await f.index.sync(f.provider,f.basis);const s=roots();f.add(s);const budget=cachedWindowBudget42(f.debug,f.options,()=>{});
 assert.equal(f.index.provisional.size,1);assert.equal(budget.provisional57.length,1);assert.deepEqual(budget.rows[0].records.map(r=>r.root),[0,1]);assert.equal(budget.total[0],24,'complete two-root oracle triangle count');
 const shadow=new T.DirectionalLight().shadow;shadow.mapSize.set(4096,4096);shadow.map={};Object.assign(f.debug,{renderer:{capabilities:{maxSamples:4}},environment:{sun:f.debug.environment.sun,csm:{lights:[{shadow}]}}});
 const owner=new ShadowWindowCoverage42({debug:f.debug},budget,{retirementOptions:{schedule:()=>1,cancel:()=>{}}}),view=owner.views[0];assert.equal(view.mesh.count,2);assert.deepEqual(view.mesh.geometry.index.array,s.geometry.index.array);assert.deepEqual(view.mesh.instanceMatrix.array,s.instanceMatrix.array);assert.strictEqual(view.mesh.geometry.attributes.aPlantWind,s.geometry.attributes.aPlantWind);
 let checks=0;await f.index.sync(f.provider,f.basis,{budget:{stats:{yieldWaitMs:0},async checkpoint(){checks++;assert.equal(f.index.validates(budget.sourceCertificate,f.provider),true,'complete provisional certificate stays valid through precision work');}}});assert.ok(checks);assert.equal(f.index.provisional.size,0);
 const refined=await executableWindowBudget42(f.debug,{...f.options,preparationBudget:createColumnPreparationBudget42({milliseconds:100})});assert.equal(refined.provisional57.length,0);assert.equal(refined.total[0],12);assert.deepEqual(refined.rows[0].records.filter(r=>r.counts[0]).map(r=>r.root),[0]);owner.dispose();f.index.dispose();
});
test('provisional source versions still invalidate old masks; removed sources retire and cancellation cannot publish',async()=>{
 for(const mode of ['mutate','remove','cancel']){const f=fixture();await f.index.sync(f.provider,f.basis);const s=roots();f.add(s);const old=cachedWindowBudget42(f.debug,f.options,()=>{});let once=false;
  const work=f.index.sync(f.provider,f.basis,{budget:{stats:{yieldWaitMs:0},async checkpoint(){if(once)return;once=true;if(mode==='cancel'){f.index.dispose();return;}f.provider.revision++;if(mode==='remove')f.provider.records.delete(s);else{s.count=1;s.instanceMatrix.needsUpdate=true;f.provider.records.set(s,{version:f.provider.revision,snapshot:sourceGeometryState42(s)});}assert.equal(f.index.validates(old.sourceCertificate,f.provider),false);}}});
  if(mode==='cancel'){await assert.rejects(work,/disposed/i);assert.equal(f.index.versions.size,0);}else{await work;assert.equal(f.index.provisional.size,0);assert.equal(f.index.versions.has(s),mode==='mutate');if(mode==='mutate')assert.equal(f.index.versions.get(s),f.provider.records.get(s).version);}f.index.dispose();
 }
});
test('facade original drawRange remains whole and a caller deadline never becomes a larger provisional budget',async()=>{
 const f=fixture();await f.index.sync(f.provider,f.basis);const s=roots(),g=s.geometry;s.isInstancedMesh=false;s.count=undefined;g.setDrawRange(6,12);f.add(s);
 const budget=cachedWindowBudget42(f.debug,f.options,()=>{});assert.equal(budget.rows[0].wholeSource,true);assert.equal(budget.total[0],4);assert.equal(budget.rows[0].source.geometry.drawRange.start,6);
 f.provider.revision++;f.provider.records.get(s).version=f.provider.revision;assert.throws(()=>cachedWindowBudget42(f.debug,f.options,()=>{throw Error('deadline');}),/deadline/);f.index.dispose();
});
test('a valid complete owner starts background refinement instead of waiting forever for source invalidation',async()=>{
 const {ShadowWindowController42}=await import('./shadow-window-controller42.js'),camera=new T.PerspectiveCamera(60,1.6,.1,100);camera.position.set(0,1.7,0);camera.lookAt(0,0,-3);camera.updateMatrixWorld();let prepares=0,renders=0;
 const c=Object.create(ShadowWindowController42.prototype);Object.assign(c,{api:{world:{surface:{heightAt:()=>0}},debug:{camera}},enabled:true,disposed:false,stats:{},options:{span:4},warmSynchronousMilliseconds:0,pending:null,lastRenderAt:null,index:{provisional:new Map([[{},{}]])}});
 c.owner={budget:{anchor:[0,0,-3],sizes:[4.5],basis:{right:[1,0,0],up:[0,0,-1]}},anchor:[0,0,-3],valid:()=>null,setAnchor(){},setEnabled(){},render(){renders++;},stats:{reason:'complete'}};c.prepare=()=>{prepares++;c.pending=Promise.resolve();};
 c.afterShadow();assert.equal(prepares,1);assert.equal(renders,1);c.afterShadow();assert.equal(prepares,1);assert.equal(renders,2,'valid original full geometry still draws while precision work is pending');
});

test('source removed and provisional record retired during an awaited selection checkpoint reconciles instead of matching undefined versions',async()=>{
 const f=fixture();await f.index.sync(f.provider,f.basis);const first=roots(),removed=roots();f.add(first);f.add(removed);
 const old=cachedWindowBudget42(f.debug,f.options,()=>{});assert.equal(old.provisional57.length,2);let removedDuringYield=false,checks=0;
 const preparationBudget={stats:{yieldWaitMs:0},async checkpoint(){checks++;await Promise.resolve();if(removedDuringYield)return;removedDuringYield=true;f.provider.revision++;f.provider.records.delete(removed);f.index.remove(removed);assert.equal(f.index.validates(old.sourceCertificate,f.provider),false,'retired source must invalidate old mask certificate');}};
 const result=await executableWindowBudget42(f.debug,{...f.options,preparationBudget});
 assert.ok(checks>1);assert.equal(result.selectionReconciliations,1,'real source retirement retries through the existing reconciliation path');assert.deepEqual(result.rows.map(r=>r.source),[first]);assert.equal(result.total[0],12);assert.equal(result.sourceRevision,f.provider.revision);assert.equal(f.index.validates(result.sourceCertificate,f.provider),true);assert.equal(result.provisional57.length,0);f.index.dispose();
});
