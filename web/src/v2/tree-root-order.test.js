import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TreeRootOrder} from './tree-root-order.js';
import {SpruceRootWind,treeRootWind} from './spruce-wind.js';
import {MeadowWindField} from './wind-field.js';
import {WorldEcology} from './ecology.js';
const root=(id,x,y,z)=>({id,x,y,z,rot:.12*id,s:1+id*.01,variant:0});
const ids=b=>b.activeRecords.map(r=>r.id);
function fixture(mode=5,roots=[root(0,0,100,-44),root(1,1,101,-20),root(2,-1,99,-30)]) {
 const wind=new SpruceRootWind(),batches=new Map(),geometry=new THREE.BoxGeometry(1,3,1);
 for(let part=0;part<3;part++) {
  const mesh=new THREE.InstancedMesh(wind.createGeometry(geometry,16,'test'),new THREE.MeshBasicMaterial(),16);
  mesh.count=roots.length;roots.forEach((r,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(r.x,r.y,r.z)));
  const b={mesh,mode,records:roots,activeRecords:roots.slice(),activeIndex:new Map(roots.map((r,i)=>[r.id,i]))};batches.set(part,b);
 }
 const field=new MeadowWindField();field.update(2,new THREE.Vector3(0,100,0));wind.update(batches,field,2,0);
 const camera=new THREE.PerspectiveCamera();camera.position.y=100;camera.updateMatrixWorld(true);
 return{wind,batches,geometry,field,camera,roots,dispose(){field.dispose();}};
}
function verify(f,original) {
 for(const b of f.batches.values())for(let i=0;i<b.mesh.count;i++) {
  const r=b.activeRecords[i];assert.equal(b.activeIndex.get(r.id),i);
  const actual=b.mesh.instanceMatrix.array.slice(i*16,i*16+16);
  if(original)assert.deepEqual(actual,original.get(r.id));
  else {assert.equal(actual[12],r.x);assert.equal(actual[13],r.y);assert.equal(actual[14],r.z);}
  const buf=b.mesh.geometry.attributes.aTreeRootWind.data.array;
  assert.deepEqual(buf.slice(i*5,i*5+5),treeRootWind(f.field,r,2));
 }
 assert.equal(f.wind.collectGroups(f.batches).length,1);
}
test('default is untouched; candidate keeps all three parts and exact matrices/wind, stable frame does not upload',()=>{
 const f=fixture(),s=new TreeRootOrder(),b=f.batches.get(0),original=new Map(b.activeRecords.map((r,i)=>[r.id,b.mesh.instanceMatrix.array.slice(i*16,i*16+16)]));
 assert.equal(s.sync(f.batches,f.camera,0),false);assert.deepEqual(ids(b),[0,1,2]);
 s.enabled=true;assert.equal(s.sync(f.batches,f.camera,0),true);assert.deepEqual(ids(b),[1,2,0]);verify(f,original);
 const versions=[...f.batches.values()].map(b=>b.mesh.instanceMatrix.version),wv=b.mesh.geometry.attributes.aTreeRootWind.data.version,sorts=s.stats.sorts;
 for(let i=0;i<20;i++)assert.equal(s.sync(f.batches,f.camera,1),false);
 assert.deepEqual([...f.batches.values()].map(b=>b.mesh.instanceMatrix.version),versions);assert.equal(b.mesh.geometry.attributes.aTreeRootWind.data.version,wv);assert.equal(s.stats.sorts,sorts);
 f.wind.update(f.batches,f.field,3,1);assert.ok(b.mesh.geometry.attributes.aTreeRootWind.data.version>wv);
 for(const p of f.batches.values())for(let i=0;i<p.mesh.count;i++)assert.deepEqual(p.mesh.geometry.attributes.aTreeRootWind.data.array.slice(i*5,i*5+5),treeRootWind(f.field,p.activeRecords[i],3));
 s.enabled=false;assert.equal(s.sync(f.batches,f.camera,1),true);assert.deepEqual(ids(b),[0,1,2]);f.dispose();
});
test('rotation reverses depth order; camera translation alone preserves matrix bytes and upload versions',()=>{
 const f=fixture(),s=new TreeRootOrder({enabled:true});s.sync(f.batches,f.camera,0);
 const before=[...f.batches.values()].map(b=>b.mesh.instanceMatrix.version);
 f.camera.position.set(10,110,15);assert.equal(s.sync(f.batches,f.camera,1),false);
 assert.deepEqual([...f.batches.values()].map(b=>b.mesh.instanceMatrix.version),before);
 f.camera.rotation.y=Math.PI;assert.equal(s.sync(f.batches,f.camera,1),true);assert.deepEqual(ids(f.batches.get(0)),[0,2,1]);verify(f);
 f.camera.rotation.x=Math.PI/3;assert.equal(typeof s.sync(f.batches,f.camera,2),'boolean');verify(f);f.dispose();
});
test('real active-prefix swap removal/re-entry remains complete and restores native baseline when disabled',()=>{
 const f=fixture(),control=fixture(),s=new TreeRootOrder({enabled:true}),eco={nearTreeBatches:f.batches,treeBatchRevision:0,stats:{}},base={nearTreeBatches:control.batches,treeBatchRevision:0,stats:{}};
 for(const e of [eco,base])e.matrix=r=>new THREE.Matrix4().makeTranslation(r.x,r.y,r.z);
 const sync=e=>WorldEcology.prototype.syncActiveTrees.call(e,f.camera,true);
 sync(eco);sync(base);s.sync(f.batches,f.camera,eco.treeBatchRevision);eco.treeBatchRevision=s.revision;
 for(const z of [-12,-37,18,-7,0]) {
  f.camera.position.z=z;sync(eco);sync(base);
  if(s.sync(f.batches,f.camera,eco.treeBatchRevision))eco.treeBatchRevision++;
  f.wind.update(f.batches,f.field,2,eco.treeBatchRevision);
  assert.deepEqual(ids(f.batches.get(0)).slice().sort(),ids(control.batches.get(0)).slice().sort());verify(f);
 }
 s.enabled=false;if(s.sync(f.batches,f.camera,eco.treeBatchRevision))eco.treeBatchRevision++;
 assert.deepEqual(ids(f.batches.get(0)),ids(control.batches.get(0)));verify(f);
 assert.equal(s.sync(f.batches,f.camera,eco.treeBatchRevision),false);f.dispose();control.dispose();
});
test('replacement groups at unchanged camera get sorted and old source root records remain unchanged',()=>{
 const f=fixture(),s=new TreeRootOrder({enabled:true});s.sync(f.batches,f.camera,0);
 const rebuilt=fixture(1,[root(3,0,100,-100),root(4,0,100,-60)]);
 assert.equal(s.sync(rebuilt.batches,f.camera,2),true);assert.deepEqual(ids(rebuilt.batches.get(0)),[4,3]);assert.deepEqual(rebuilt.roots.map(r=>r.id),[3,4]);verify(rebuilt);
 f.dispose();rebuilt.dispose();
});
test('near needle and unrelated groups retain original order and all geometry/index references',()=>{
 const f=fixture(12),s=new TreeRootOrder({enabled:true}),g=f.batches.get(0).mesh.geometry,index=g.index,pos=g.attributes.position;
 const bytes=f.batches.get(0).mesh.instanceMatrix.array.slice();assert.equal(s.sync(f.batches,f.camera,0),false);
 assert.deepEqual(f.batches.get(0).mesh.instanceMatrix.array,bytes);assert.strictEqual(g.index,index);assert.strictEqual(g.attributes.position,pos);assert.equal(s.stats.groups,0);f.dispose();
});
test('shared force identity disagreement fails before reordering any part',()=>{
 const f=fixture(),s=new TreeRootOrder({enabled:true}),before=f.batches.get(0).mesh.instanceMatrix.array.slice();f.batches.get(1).activeRecords.reverse();
 assert.throws(()=>s.sync(f.batches,f.camera,0),/identical active root order/);assert.deepEqual(f.batches.get(0).mesh.instanceMatrix.array,before);f.dispose();
});
test('actual ecology dynamics publishes reordered wind, advances revision once, and honours roots=false preparation',()=>{
 const f=fixture(),eco={nearTreeBatches:f.batches,treeBatchRevision:0,treeRootOrder:new TreeRootOrder({enabled:true}),treeRootWind:f.wind,windField:f.field,uniforms:{uWindTime:{value:2}},stats:{}};
 const sync=(options)=>WorldEcology.prototype.syncTreeDynamics.call(eco,f.camera,options);
 sync({roots:false});assert.equal(eco.treeBatchRevision,1);assert.deepEqual(ids(f.batches.get(0)),[1,2,0]);verify(f);
 const sorts=eco.treeRootOrder.stats.sorts,mv=f.batches.get(0).mesh.instanceMatrix.version;
 sync();assert.equal(eco.treeBatchRevision,1);assert.equal(eco.treeRootOrder.stats.sorts,sorts);assert.equal(f.batches.get(0).mesh.instanceMatrix.version,mv);
 assert.strictEqual(eco.stats.treeRootOrder,eco.treeRootOrder.stats);
 f.camera.rotation.y=Math.PI;sync({roots:false});assert.equal(eco.treeBatchRevision,2);assert.deepEqual(ids(f.batches.get(0)),[0,2,1]);verify(f);
 eco.treeRootOrder.enabled=false;sync({roots:false});assert.equal(eco.treeBatchRevision,3);assert.deepEqual(ids(f.batches.get(0)),[0,1,2]);verify(f);f.dispose();
});
