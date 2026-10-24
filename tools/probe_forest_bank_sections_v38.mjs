import {writeFileSync} from 'node:fs';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {riverSectionAt} from '../web/src/v2/river-section.js';
import {sampleMeadowField} from '../web/src/v2/meadow-surface.js';
const world=actualForestWorld(undefined,'rgba'),h=world.hydrology;
const view=h.viewpoints.find(v=>v.id==='river-forest'),anchor=h.segments.find(s=>s.id===view.segmentId);
const rows=[];
for(const offset of [-36,-24,-12,0,12,24,36]){
 const distance=anchor.a.distance+offset,s=h.segments.find(s=>s.lineId===anchor.lineId&&s.a.distance<=distance&&s.b.distance>=distance);if(!s)continue;
 const t=(distance-s.a.distance)/(s.b.distance-s.a.distance),q=riverSectionAt(s,t);
 for(const side of [-1,1]){
  const half=side<0?q.left:q.right,point=d=>({x:q.x-q.fz*side*d,z:q.z+q.fx*side*d});
  const samples=[0,.02,.05,.1,.2,.35,.5,.75,1].filter(d=>half+d<=q.outer).map(d=>{const p=point(half+d),y=world.surface.heightAt(p.x,p.z),raw=world.surface.uncarvedHeightAt(p.x,p.z),cover=world.landcoverAt(p.x,p.z),field=sampleMeadowField(p.x,p.z);return {distance:d,x:p.x,z:p.z,y,clearance:y-q.level,rawClearance:raw-q.level,cover,field};});
  rows.push({offset,side,segment:s.id,t,section:q,samples});
 }
}
const report={scope:'actual canonical DEM/detail/landcover and existing forest meander; no runtime edits',anchor:view,lineId:anchor.lineId,rows};
const path=process.argv[2]||'tools/reports/forest-bank-sections-v38.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({offset:r.offset,side:r.side,width:r.section.width,bar:r.side<0?r.section.barLeft:r.section.barRight,bend:r.section.bendWeight,points:r.samples.map(p=>[p.distance,+p.clearance.toFixed(4),+p.rawClearance.toFixed(4)])})),null,2));
