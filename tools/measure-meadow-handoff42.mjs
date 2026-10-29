// Necessary angular-response gate before any terrain installer. No runtime imports.
import fs from 'node:fs';
import {meadowGeometry} from '../web/src/v2/ecology.js';
import {canopyReferenceSamples,angularDirection,sourceCanopyResponse} from '../web/src/v2/meadow-canopy-reference.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const rows=[];
for(const near of [false,true]){
 const geometry=meadowGeometry(near),{samples,stats}=canopyReferenceSamples(geometry,{heightRatio:.955});
 for(const sunElevation of [19.975,41.814,66.625])for(const slope of [0,20]){
  const light=angularDirection(sunElevation),normal=angularDirection(90-slope,90),groundResponse=Math.max(0,dot(normal,light)),directions=[];
  for(const viewElevation of [20,45])for(const relativeAzimuth of [0,90,180]){
   const view=angularDirection(viewElevation,relativeAzimuth),source=sourceCanopyResponse(samples,light,view);
   directions.push({viewElevation,relativeAzimuth,source});
  }
  // Optimistically permit a DIFFERENT scalar for each sun and slope. A real
  // view-independent mean albedo/coverage has less freedom than this bound.
  const values=directions.map(r=>r.source),lo=Math.min(...values),hi=Math.max(...values),bestWorst=(lo+hi)/2,mean=values.reduce((a,b)=>a+b,0)/values.length;
  rows.push({lod:near?'near':'middle',sunElevation,slope,stats,groundResponse,directions,bestMinimaxConstant:bestWorst,minPossibleMaxError:(hi-lo)/2,bestMeanConstant:mean,minPossibleRMSE:Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length)});
 }
 geometry.dispose();
}
const report={scope:'Necessary unit-diffuse angular gate only: actual source faces/normals, inverse-transpose scale, DoubleSide and 14% seed heads. No mutual occlusion, pigment or specular; not a canopy BRDF or rendered acceptance.',limits:{rmse:.04,maxAbsolute:.08},rows,passed:rows.every(r=>r.minPossibleRMSE<=.04&&r.minPossibleMaxError<=.08),decision:'Do not install a view-independent mean albedo/coverage replacement when this necessary source angular gate fails. Retain all roots/leaves and original ground.'};
fs.writeFileSync('tools/reports/meadow-handoff42-angular-gate.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,rows:rows.map(({directions,stats,...r})=>r)},null,2));
