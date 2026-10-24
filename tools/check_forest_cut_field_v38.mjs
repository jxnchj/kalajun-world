import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {buildForestCutField38,sampleForestCutField38,cutHorizon38,FOREST_CUT38} from '../web/src/v2/forest-cut-horizon-v38.js';
import {readFileSync} from 'node:fs';
const world=actualForestWorld(undefined,'rgba'),start=performance.now();
const field=await buildForestCutField38(world.surface,{yieldTask:async()=>{}}),buildMs=performance.now()-start;
let max=0,sum=0,count=0;
// Deterministic staggered sub-cell positions, not only exactly sampled vertices.
for(let j=0;j<512;j+=7)for(let i=0;i<512;i+=7){
 const x=field.origin.x+(i+.37)*.25,z=field.origin.z+(j+.63)*.25;
 const e=Math.abs(sampleForestCutField38(field,x,z)-world.surface.uncarvedHeightAt(x,z));max=Math.max(max,e);sum+=e;count++;
}
const sections=JSON.parse(readFileSync(new URL('./reports/forest-bank-sections-v38.json',import.meta.url))),rows=[];
for(const r of sections.rows)for(const p of r.samples){
 const raw=world.surface.uncarvedHeightAt(p.x,p.z),height=world.surface.heightAt(p.x,p.z),approx=sampleForestCutField38(field,p.x,p.z);
 rows.push({offset:r.offset,side:r.side,distance:p.distance,depth:raw-height,error:approx-raw,horizon:cutHorizon38({depth:raw-height,shoreDistance:p.distance,clearance:p.clearance,distance:Math.hypot(p.x-FOREST_CUT38.x,p.z-FOREST_CUT38.z)})});
}
console.log(JSON.stringify({kind:'read-only actual pre-incision interpolation; no geometry/runtime changes',buildMs,bytes:field.bytes,interpolation:{samples:count,maxAbsMetres:max,meanAbsMetres:sum/count},rows},null,2));
if(max>.002)throw new Error('Actual interpolation error exceeds 2mm candidate bound');
