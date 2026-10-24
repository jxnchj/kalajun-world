import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldTerrain} from '../web/src/v2/terrain.js';
import {createTerrainRowKernel,terrainRowInput,terrainRowBuffers} from '../web/src/v2/terrain-row-kernel.js';
const world=actualForestWorld(),terrain=new WorldTerrain(world),kernel=createTerrainRowKernel(world),cases=[];
for(const [id,x,z,size] of [['forest',-3640,4800,40],['meadow',-2000,3360,40],['west',-7080,2640,40],['settlement',-2000,3440,40],['far',-10240,10240,5120]]) {
 const parent=terrain._node(x,z,size,1,null),pjob=terrain._job(parent);while(pjob.row<=32)terrain._buildRow(pjob);terrain._finish(pjob);
 for(let q=0;q<4;q++){
  const node=terrain._node(x+(q%2)*size/2,z+Math.floor(q/2)*size/2,size/2,2,parent),job=terrain._job(node),input=terrainRowInput(node);
  while(job.row<=32)terrain._buildRow(job);
  const a=performance.now(),out=kernel.build(structuredClone(input)),ms=performance.now()-a;
  let bytes=0;for(const[k,v]of Object.entries(out)){if(ArrayBuffer.isView(v)){assert.deepEqual(v,job[k],id+':'+q+':'+k);bytes+=v.byteLength;}else assert.equal(v,job[k],k);}
  const transfer=structuredClone(out,{transfer:terrainRowBuffers(out)});assert.ok(transfer.positions.byteLength);assert.equal(out.positions.byteLength,0);assert.ok(parent.heights.byteLength);
  cases.push({id,child:q,bytes,ms,exact:true});
 }
}
const report={scope:'real source terrain rows, parent attribute reuse and transferable payload; not browser performance',cases,stats:kernel.stats};fs.writeFileSync('tools/reports/terrain-row-kernel-v38.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));kernel.dispose();terrain.dispose();
