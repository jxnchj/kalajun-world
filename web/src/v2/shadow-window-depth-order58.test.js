import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WebGLRenderList} from '../../node_modules/three/src/renderers/webgl/WebGLRenderLists.js';
import {ShadowWindowCoverage42,setCoverageDepthOrder58} from './shadow-window-coverage42.js';
import {compareFullCoverage42} from './shadow-window-reference42.js';

// Execute Three's actual opaque sort. At equal depth, LessEqual accepts both
// fragments, so the last item's output is the mask value (not a shader mock).
function sorted(meshes){const list=new WebGLRenderList();for(const m of meshes)list.push(m,m.geometry,m.material,0,0,null,{});list.sort();return list.opaque.map(item=>item.object);}
function equalDepthWinner(meshes){for(const m of meshes)assert.equal(m.material.depthFunc,T.LessEqualDepth);return sorted(meshes).at(-1);}
test('equal-depth ground coverage is independent of full/new versus selected/cached material creation order',()=>{
 const g=new T.PlaneGeometry(),selected=new T.Mesh(g,new T.MeshBasicMaterial()),ground=new T.Mesh(g,new T.MeshBasicMaterial()),full=new T.Mesh(g,new T.MeshBasicMaterial());
 assert.strictEqual(equalDepthWinner([selected,ground]),ground,'old cached caster is overwritten without an explicit mask order');
 assert.strictEqual(equalDepthWinner([full,ground]),full,'new full-source caster instead overwrites the same ground');
 for(const caster of[selected,full])setCoverageDepthOrder58(caster,'caster');setCoverageDepthOrder58(ground,'receiver');
 assert.strictEqual(equalDepthWinner([selected,ground]),selected);assert.strictEqual(equalDepthWinner([full,ground]),full);
 // Arrival order and arbitrary old material ids cannot change either decision.
 assert.strictEqual(equalDepthWinner([ground,selected]),selected);assert.strictEqual(equalDepthWinner([ground,full]),full);
 for(const m of[selected,ground,full])m.material.dispose();g.dispose();
});

test('real window commits/reuses and complete-source oracle enforce the same order without changing original geometry or renderOrder',()=>{
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,0,1],3));g.setIndex([0,1,2]);
 const ground=new T.Mesh(g,new T.MeshStandardMaterial()),grass=new T.InstancedMesh(g,new T.MeshStandardMaterial(),1);grass.setMatrixAt(0,new T.Matrix4());
 ground.renderOrder=7;grass.renderOrder=9;for(const s of[ground,grass]){s.customDepthMaterial=new T.MeshDepthMaterial();s.updateMatrixWorld();}
 let target=null,clear=new T.Color(0),alpha=1,oracleMeshes=null;
 const renderer={capabilities:{maxSamples:4},shadowMap:{enabled:true,render(){}},autoClear:true,info:{autoReset:true,render:{calls:0,triangles:0}},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},getClearColor:out=>out.copy(clear),getClearAlpha:()=>alpha,setClearColor:(v,a)=>{clear=new T.Color(v);alpha=a;},readRenderTargetPixels:(t,x,y,w,h,bytes)=>bytes.fill(255),render(scene){oracleMeshes=scene.children.slice();this.info.render.calls+=scene.children.length;this.info.render.triangles+=scene.children.length;}};
 const shadow=new T.DirectionalLight().shadow;shadow.mapSize.set(4096,4096);shadow.map={};const registry=new Map([[ground,{}],[grass,{}]]),api={debug:{renderer,environment:{sun:new T.Vector3(0,1,0),csm:{lights:[{shadow}]},shadowCasters:{entryReuse:true,_entries:[registry]}},terrain:{materials:[ground.material]}}};
 const rows=[{source:grass,terrain:false,instanced:true,submitted:[1],records:[{root:0,counts:[1]}]},{source:ground,terrain:true,instanced:false,submitted:[2],records:[{indices:[0,1,2],counts:[1]}]}],budget={anchor:[0,0,0],basis:{right:[1,0,0],up:[0,0,-1]},sizes:[4.5],brushes:[],rows};
 const positions=g.attributes.position,index=g.index,matrix=grass.instanceMatrix,owner=new ShadowWindowCoverage42(api,budget),views=owner.views.slice();
 try{
  for(const view of owner.views)assert.equal(view.mesh.renderOrder,view._plan.kind==='caster'?1:-1);
  assert.strictEqual(equalDepthWinner(owner.maskScene.children),owner.views.find(v=>v._plan.kind==='caster').mesh);
  owner.replaceBudget({...budget,rows:[rows[1],rows[0]]});assert.equal(owner.stats.viewsCreated,0);assert.ok(owner.views.every(v=>views.includes(v)));
  assert.strictEqual(equalDepthWinner(owner.maskScene.children),owner.views.find(v=>v._plan.kind==='caster').mesh);
  compareFullCoverage42(owner);assert.equal(oracleMeshes.length,2);assert.deepEqual(sorted(oracleMeshes).map(m=>m.renderOrder),[-1,1]);assert.equal(equalDepthWinner(oracleMeshes).isInstancedMesh,true);
  assert.equal(ground.renderOrder,7);assert.equal(grass.renderOrder,9);assert.strictEqual(g.attributes.position,positions);assert.strictEqual(g.index,index);assert.strictEqual(grass.instanceMatrix,matrix);assert.equal(grass.count,1);
 }finally{owner.dispose();for(const s of[ground,grass]){s.material.dispose();s.customDepthMaterial.dispose();}g.dispose();}
});
