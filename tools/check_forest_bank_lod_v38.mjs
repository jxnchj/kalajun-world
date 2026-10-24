// Build actual WorldTerrain rows/indices for one 10m tile; no browser/GPU.
import * as T from '../web/node_modules/three/build/three.module.js';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldTerrain} from '../web/src/v2/terrain.js';
import {TerrainSampleCache} from '../web/src/v2/terrain-sample-cache.js';
import {getMeadowLandform,sampleMeadowField} from '../web/src/v2/meadow-surface.js';
import {projectRiverSection,riverSectionAt} from '../web/src/v2/river-section.js';
import {FOREST_BANK_LINE,forestBankRootCover,forestRootedShoulderHeight} from '../web/src/v2/forest-bank-shoulder.js';
const world=actualForestWorld(undefined,'rgba'),h=world.hydrology,view=h.viewpoints.find(v=>v.id==='river-forest'),anchor=h.segments.find(s=>s.id===view.segmentId),byId=new Map(h.segments.map(s=>[s.id,s]));
const baseline=(x,z)=>world.surface.heightAt(x,z);
const candidateWorld=actualForestWorld(undefined,'rgba',{forestRootedShoulder38:true});
const proposed=(x,z)=>candidateWorld.surface.heightAt(x,z);

const section=riverSectionAt(anchor,0),probe={x:section.x-section.fz*(section.right+.5),z:section.z+section.fx*(section.right+.5)};
const node={x:Math.floor(probe.x/10)*10,z:Math.floor(probe.z/10)*10,size:10,depth:13,parent:null};
function build(heightAt){
 const surface={...world.surface,heightAt,normalAt(x,z,step=2){const dx=heightAt(x-step,z)-heightAt(x+step,z),dz=heightAt(x,z-step)-heightAt(x,z+step),n=Math.hypot(dx,2*step,dz);return{x:dx/n,y:2*step/n,z:dz/n};}};
 const t=Object.create(WorldTerrain.prototype);Object.assign(t,{world:{...world,surface},sampleCache:new TerrainSampleCache(heightAt,{entries:0,attributeComponents:22}),tileCache:{take:()=>null},landform:getMeadowLandform(world),_landformValue:new T.Vector2(),_landformResponse:[1,1,1,0],_communityResponse:[0,0,0,0],_color:new T.Color()});
 const job=t._job({...node});while(job.row<=32)t._buildRow(job);return job;
}
const jobs=[build(baseline),build(proposed)];
function meshHeight(job,x,z){
 const u=(x-node.x)/.3125,v=(z-node.z)/.3125,i=Math.floor(u),j=Math.floor(v);if(i<0||i>=32||j<0||j>=32)return null;
 const p=new T.Vector3(x-node.x,0,z-node.z),vtx=k=>new T.Vector3(job.positions[k*3],0,job.positions[k*3+2]),o=(j*32+i)*6;
 for(let k=0;k<6;k+=3){const a=job.indices[o+k],b=job.indices[o+k+1],c=job.indices[o+k+2],weights=T.Triangle.getBarycoord(p,vtx(a),vtx(b),vtx(c),new T.Vector3());if(Math.min(weights.x,weights.y,weights.z)>=-1e-8)return weights.x*job.positions[a*3+1]+weights.y*job.positions[b*3+1]+weights.z*job.positions[c*3+1];}
 throw Error('No actual terrain triangle');
}
const sections=JSON.parse(readFileSync(new URL('./reports/forest-bank-sections-v38.json',import.meta.url)));
for(const r of sections.rows)for(const p of r.samples)assert.ok(Math.abs(baseline(p.x,p.z)-p.y)<1e-8,'recorded source is current');
const samples=[];
for(const d of [-.2,-.1,-.05,0,.05,.1,.2,.35,.5,.75,1]){const x=section.x-section.fz*(section.right+d),z=section.z+section.fx*(section.right+d),base=meshHeight(jobs[0],x,z),next=meshHeight(jobs[1],x,z);if(base!==null)samples.push({d,baselineAnalytic:baseline(x,z)-section.level,candidateAnalytic:proposed(x,z)-section.level,baselineMesh:base-section.level,candidateMesh:next-section.level,meshDelta:next-base});}
assert.ok(samples.filter(p=>p.d<=-.05).every(p=>p.candidateMesh<0),'actual submerged triangles remain below water');
assert.ok(samples.filter(p=>p.d===.2||p.d===.35).every(p=>p.candidateMesh>p.baselineMesh+.02),'physical mesh has a compact rooted shoulder');
const report={scope:'integrated forestRootedShoulder38=1 actual WorldTerrain._job/_buildRow, Float32 positions, adaptive native diagonals; one 10m tile/31.25cm spacing; not browser acceptance',node,sourceStillMatches:true,samples};
writeFileSync(new URL('./reports/forest-bank-lod-v38.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
