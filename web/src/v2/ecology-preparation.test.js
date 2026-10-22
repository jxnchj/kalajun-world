import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareEcologyQueues} from './ecology-preparation.js';
import {WorldEcology} from './ecology.js';
import {MeadowWindField} from './wind-field.js';
import {SpruceRootWind} from './spruce-wind.js';
function fixture(){
 const camera={position:new THREE.Vector3(0,101,0)},field=new MeadowWindField({resolution:8}),rootWind=new SpruceRootWind();
 const source=new THREE.BoxGeometry(1,1,1),geometry=rootWind.createGeometry(source,2,'fixture'),mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),2);
 mesh.count=2;const roots=[{id:'one',x:0,y:100,z:0},{id:'two',x:5,y:100,z:7}];
 const batches=new Map([['fixture',{mesh,activeRecords:roots}]]),eco=Object.create(WorldEcology.prototype);
 Object.assign(eco,{uniforms:{uWindTime:{value:0},uWorldViewer:{value:new THREE.Vector3()}},treeWindCoefficients:{value:false},windField:field,treeRootWind:rootWind,nearTreeBatches:batches,treeBatchRevision:1,last:new THREE.Vector2(0,0),nearLast:new THREE.Vector2(0,0),nearY:101,queue:Array.from({length:120},(_,i)=>({x:i,z:0})),tiles:new Map(),grassQueue:[],stats:{treeNeedleShellTriangles:10},syncActiveTrees(){},updateMeadow(){},forestFloor:{update(){},stats:{pending:0}},buildTile(x,z){this.tiles.set(x+','+z,{count:3});},gpuBrushes:{stats:{triangles:100},branchCache:{stats:{builtGroups:0}},sync(){this.calls=(this.calls||0)+1;this.lastWind=geometry.attributes.aTreeRootWind.data.array.slice();}}});
 const water={stats:{pending:0},time:0,update(_camera,dt){this.time+=dt;}};
 return {eco,water,camera,dispose(){field.dispose();rootWind.dispose();geometry.dispose();source.dispose();mesh.material.dispose();}};
}
test('same 90 static ticks retain exact queue, time, wind fields and final root uploads with one final publication',async()=>{
 const a=fixture(),b=fixture();let yields=0;
 try{
  const old=await prepareEcologyQueues({...a,ecology:a.eco,staticPreparation:false,yieldToInput:async()=>{}});
  const next=await prepareEcologyQueues({...b,ecology:b.eco,yieldToInput:async()=>{yields++;if(yields===4)b.eco.gpuBrushes.branchCache.stats.builtGroups++;}});
  assert.equal(old.iterations,90);assert.equal(next.iterations,90);assert.equal(yields,22);
  assert.deepEqual(a.eco.queue,b.eco.queue);assert.deepEqual(a.eco.tiles,b.eco.tiles);
  assert.equal(a.eco.uniforms.uWindTime.value,b.eco.uniforms.uWindTime.value);assert.equal(a.water.time,b.water.time);
  for(const name of ['previous','current'])assert.deepEqual(a.eco.windField[name].image.data,b.eco.windField[name].image.data);
  assert.deepEqual(a.eco.gpuBrushes.lastWind,b.eco.gpuBrushes.lastWind);
  assert.equal(a.eco.gpuBrushes.calls,90);assert.equal(b.eco.gpuBrushes.calls,3);
  assert.equal(b.eco.stats.preparation.finalSyncs,1);assert.equal(b.eco.stats.preparation.skippedDynamicSyncs,88);
 }finally{a.dispose();b.dispose();}
});
test('destination cancellation never publishes a stale final sync, and short queues retain old minimum ticks',async()=>{
 const f=fixture();let current=true;
 try{
  const result=await prepareEcologyQueues({...f,ecology:f.eco,isCurrent:()=>current,yieldToInput:async()=>{current=false;}});
  assert.equal(result,null);assert.equal(f.eco.tiles.size,4);assert.equal(f.eco.stats.preparation.finalSyncs,0);
  f.eco.queue=[];current=true;
  const completed=await prepareEcologyQueues({...f,ecology:f.eco,isCurrent:()=>current,yieldToInput:async()=>{}});
  assert.equal(completed.iterations,14);assert.equal(f.eco.stats.preparation.finalSyncs,1);
 }finally{f.dispose();}
});
test('a completed branch worker failure remains visible during static preparation',async()=>{
 const f=fixture();let yields=0;const sync=f.eco.gpuBrushes.sync;
 f.eco.gpuBrushes.sync=function(){if(this.branchCache.stats.error)throw Error(this.branchCache.stats.error);return sync.call(this);};
 try{await assert.rejects(prepareEcologyQueues({...f,ecology:f.eco,yieldToInput:async()=>{if(++yields===1)f.eco.gpuBrushes.branchCache.stats.error='branch failed';}}),/branch failed/);assert.equal(f.eco.stats.preparation.finalSyncs,0);}
 finally{f.dispose();}
});
