import fs from 'node:fs';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {FOREST_REACH39_SOURCE as src} from '../web/src/v2/forest-reach39-source.js';
import {reachSurface41BedMask,reachSurface41OrganicWeight} from '../web/src/v2/forest-reach-surface41.js';
const w=actualForestWorld(undefined,'rgba'),h=w.hydrology,r=h.forestReach39,segments=h.segments.filter(s=>s.lineId===src.lineId),rows=[];
for(let offset=-17.5;offset<=17.5;offset+=.5){
 const distance=r.origin+offset,segment=segments.find(s=>s.a.distance<=distance&&s.b.distance>=distance),t=(distance-segment.a.distance)/(segment.b.distance-segment.a.distance),q=r.waterSectionAt(segment,t);
 for(const side of [-1,1])for(let step=-5;step<=10;step++){
  const nominal=step*.05,across=(side<0?q.left:q.right)+nominal,x=q.x-q.fz*side*across,z=q.z+q.fx*side*across,y=w.surface.heightAt(x,z),water=h.sampleAt(x,z),clearance=y-water.surfaceLevel,oldBed=reachSurface41BedMask(x,z,clearance,water.wetness),organic=reachSurface41OrganicWeight(x,z,clearance);
  rows.push({offset,side,x,z,y,nominal,shore:water.shoreDistance,clearance,wetness:water.wetness,oldBed,organic});
 }
}
const exterior=rows.filter(p=>p.shore>0&&p.oldBed>.2&&p.organic<.2),summary={rows:rows.length,exteriorHighMineralLowOrganic:exterior.length,affectedOffsets:[...new Set(exterior.map(p=>p.offset))],maxExteriorShore:Math.max(...exterior.map(p=>p.shore)),maxOldBed:Math.max(...exterior.map(p=>p.oldBed))};
fs.writeFileSync('tools/reports/reach-facies44-sections.json',JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));