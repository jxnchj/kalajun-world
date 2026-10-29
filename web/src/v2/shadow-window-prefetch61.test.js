import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShadowWindowCoverage42} from './shadow-window-coverage42.js';
import {residentNeedleProgramSources61,nativeProgramViews42} from './shadow-window-programs42.js';
function needle(){const g=new T.BoxGeometry();g.setAttribute('aTreeRootWind',new T.InstancedBufferAttribute(new Float32Array(8),4));const s=new T.InstancedMesh(g,new T.MeshStandardMaterial(),2);s.customDepthMaterial=new T.MeshDepthMaterial();s.customDepthMaterial.onBeforeCompile=shader=>{shader.uniforms.exactSourceUniform={value:7};};s.customDepthMaterial.customProgramCacheKey=()=> 'real-template-mode12';s.name='spruce-12-real-prefetch';s.count=0;s.visible=false;s.updateMatrixWorld();return s;}
test('only actual resident mode12 batches receive private dormant representatives; original buffers/count/visibility remain intact',()=>{
 const s=needle(),other=needle(),unknown=needle(),batches=new Map([[1,{mode:12,mesh:s,records:[{}]}],[2,{mode:5,mesh:other,records:[{}]}],[3,{mode:12,mesh:unknown,records:[]}]]),matrix=s.instanceMatrix,g=s.geometry,wind=g.attributes.aTreeRootWind,depth=s.customDepthMaterial;
 const sources=residentNeedleProgramSources61({nearTreeBatches:batches},[]);assert.deepEqual(sources,[s]);const version=depth.version;residentNeedleProgramSources61({nearTreeBatches:batches},[]);assert.equal(depth.version,version,'projection preparation is idempotent');
 const m=new T.MeshDepthMaterial(),defaultViews=nativeProgramViews42(sources,new Set(),()=>m);assert.equal(defaultViews.views.length,0);defaultViews.dispose();
 const views=nativeProgramViews42(sources,new Set(),()=>m,{allowDormant:new Set(sources)});assert.equal(views.views.length,1);assert.equal(views.views[0].mesh.count,1);assert.strictEqual(views.views[0].mesh.geometry.attributes.position,g.attributes.position);assert.strictEqual(s.instanceMatrix,matrix);assert.strictEqual(g.attributes.aTreeRootWind,wind);assert.equal(s.count,0);assert.equal(s.visible,false);assert.strictEqual(s.customDepthMaterial,depth);views.dispose();assert.strictEqual(s.geometry,g);assert.ok(g.index);m.dispose();
});

test('real owner prefetch certifies exact dormant layout only after compileAsync succeeds and reuses it when the source becomes a caster',async()=>{
 const source=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());source.customDepthMaterial=new T.MeshDepthMaterial();source.updateMatrixWorld();const dormant=needle(),shadow=new T.DirectionalLight().shadow;shadow.mapSize.set(4096,4096);shadow.map={};let target=null;const pending=[],compiled=[],renderer={capabilities:{maxSamples:4},info:{programs:[]},shadowMap:{enabled:true,type:T.PCFShadowMap,render(){}},getRenderTarget:()=>target,setRenderTarget:v=>target=v,compileAsync(scene){compiled.push(scene.children.slice());return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};
 const provider={revision:1,sources:()=>[source]},debug={renderer,ecology:{nearTreeBatches:new Map([[1,{mode:12,mesh:dormant,records:[{}]}]])},environment:{sun:new T.Vector3(0,1,0),csm:{lights:[{shadow}]}},terrain:{materials:[]}},row={source,submitted:[12],terrain:false,wholeSource:true,records:[]},budget={wholeStaticSources:true,sourceProvider:provider,sourceRevision:1,anchor:[0,0,0],basis:{right:[1,0,0],up:[0,0,-1]},sizes:[4.5],brushes:[],rows:[row]},owner=new ShadowWindowCoverage42({debug},budget,{retirementOptions:{schedule:()=>1,cancel:()=>{}}});
 try{
  const signature=()=>owner.nativeProgramCache.signature(dormant,owner.depth(dormant,'caster','root'),'caster','root',renderer,owner.camera,owner.mask);
  let work=owner.preparePrograms();assert.equal(owner.nativeProgramCache.has(dormant,signature()),false);assert.ok(compiled.flat().some(m=>m.isInstancedMesh&&m.count===1));assert.equal(dormant.count,0);assert.equal(dormant.visible,false);assert.deepEqual(owner.registry,[source]);
  pending.splice(0).forEach(p=>p.reject(Error('real compile rejected')));await assert.rejects(work,/real compile rejected/);assert.equal(owner.nativeProgramCache.has(dormant,signature()),false,'failed compile never publishes readiness');
  work=owner.preparePrograms();pending.splice(0).forEach(p=>p.resolve());await work;assert.equal(owner.nativeProgramCache.has(dormant,signature()),true);assert.equal(owner.stats.compilePrefetchSources61.length,1);
  dormant.count=1;dormant.visible=true;provider.revision=2;provider.sources=()=>[source,dormant];owner.replaceBudgetWithin({...budget,sourceRevision:2,rows:[row,{source:dormant,submitted:[12],terrain:false,instanced:true,records:[{root:0,counts:[12]}]}]},()=>{});
  assert.equal(owner.programsRequired,false,'first real source arrival reuses the successfully compiled exact template');assert.equal(owner.activeProgramsReady44(),true);assert.deepEqual(owner.registry,[source,dormant]);
  dormant.customDepthMaterial.needsUpdate=true;provider.revision=3;owner.replaceBudgetWithin({...owner.budget,sourceRevision:3},()=>{});assert.equal(owner.activeProgramsReady44(),false,'recaptured real source depth version changes remain invalid');
 }finally{owner.dispose();}
});
