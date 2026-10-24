import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {WorldTerrain} from './terrain.js';import {TerrainSampleCache} from './terrain-sample-cache.js';import {getMeadowLandform} from './meadow-surface.js';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
const world=actualForestWorld(undefined,'rgba'),heightAt=world.surface.heightAt;
function terrain(){const t=Object.create(WorldTerrain.prototype);Object.assign(t,{world,size:81920,regularDepth:10,maxDepth:13,sampleCache:new TerrainSampleCache(heightAt,{entries:0,attributeComponents:22}),tileCache:{take:()=>null},landform:getMeadowLandform(world),_landformValue:new T.Vector2(),_landformResponse:[1,1,1,0],_communityResponse:[0,0,0,0],_color:new T.Color()});return t;}
function node(x,z,size){return{x,z,size,depth:Math.round(Math.log2(10240/size)),parent:null,split:false,riverOverlaps:new Map(),bounds:{minX:x,maxX:x+size,minZ:z,maxZ:z+size}};}
test('candidate refines only nearby representative river tiles; normal world, distant view and other reaches retain existing LOD',()=>{
 const t=terrain(),n=node(-3620,4800,10);assert.equal(t._riverDepth(n,8),10);t.forestBankSubdivision38=true;assert.equal(t._riverDepth(n,8),11);assert.equal(t._riverDepth(n,60),10);
 const other=node(-2220,3360,10);t.forestBankSubdivision38=false;const before=t._riverDepth(other,8);t.forestBankSubdivision38=true;assert.equal(t._riverDepth(other,8),before);
 t.forestBankSubdivision38=false;assert.equal(t._riverDepth(n,8),10);
});
test('actual native Float32 triangles reduce original section height error at 15.625cm without changing shared analytic collision heights or normals',t=>{
 const owner=terrain(),jobs=new Map();function job(x,z,size){const nx=Math.floor(x/size)*size,nz=Math.floor(z/size)*size,key=[nx,nz,size].join(',');if(!jobs.has(key)){const j=owner._job(node(nx,nz,size));while(j.row<=32)owner._buildRow(j);jobs.set(key,j);}return{j:jobs.get(key),nx,nz};}
 function mesh(x,z,size){const{j,nx,nz}=job(x,z,size),step=size/32,i=Math.floor((x-nx)/step),k=Math.floor((z-nz)/step),o=(k*32+i)*6,p=new T.Vector3(x-nx,0,z-nz);for(let a=0;a<6;a+=3){const ids=[0,1,2].map(b=>j.indices[o+a+b]),v=ids.map(id=>new T.Vector3(j.positions[id*3],0,j.positions[id*3+2])),w=T.Triangle.getBarycoord(p,...v,new T.Vector3());if(Math.min(w.x,w.y,w.z)>=-1e-7)return w.x*j.positions[ids[0]*3+1]+w.y*j.positions[ids[1]*3+1]+w.z*j.positions[ids[2]*3+1];}throw Error('missing triangle');}
 const sums=[0,0],max=[0,0];let count=0;
 for(let z=4800.07;z<4810;z+=.17)for(let x=-3619.93;x<-3610;x+=.17){const q=world.hydrology.sampleAt(x,z,{includeDepth:false});if(q.id===null||Math.abs(q.shoreDistance)>.7)continue;const exact=heightAt(x,z);[10,5].forEach((size,i)=>{const e=Math.abs(mesh(x,z,size)-exact);sums[i]+=e*e;max[i]=Math.max(max[i],e);});count++;}
 const rmse=sums.map(v=>Math.sqrt(v/count));assert.ok(count>100);assert.ok(rmse[1]<rmse[0]*.7,JSON.stringify({rmse,max}));assert.ok(max[1]<max[0]);
 // Adjacent equally refined tiles use identical shared heights and analytic
 // normal inputs along the common edge; mixed-LOD inheritance is unchanged.
 const left=job(-3617,4802,5).j,right=job(-3612,4802,5).j;
 for(let k=0;k<=32;k++){const a=k*33+32,b=k*33;assert.equal(left.positions[a*3+1],right.positions[b*3+1]);for(let c=0;c<3;c++)assert.equal(left.normals[a*3+c],right.normals[b*3+c]);}
 assert.equal(world.surface.heightAt,heightAt);t.diagnostic(JSON.stringify({samples:count,rmseMetres:rmse,maxErrorMetres:max,tiles:jobs.size,normalSampling:'original 0.2m wet-bank analytic gradient; unchanged, shared across tile boundaries'}));
});
