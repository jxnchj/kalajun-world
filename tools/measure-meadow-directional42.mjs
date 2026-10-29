import fs from 'node:fs';
import {meadowGeometry} from '../web/src/v2/ecology.js';
import {canopyReferenceSamples,angularDirection,sourceCanopyResponse} from '../web/src/v2/meadow-canopy-reference.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
function compress(samples,count){
 const data=samples.map(s=>{const sign=s.face[1]<0?-1:1;return{area:s.area,face:s.face.map(v=>v*sign),normal:s.normal.map(v=>v*sign)};});
 const dist=(a,b)=>2-dot(a.face,b.face)-dot(a.normal,b.normal);
 const centres=[data.reduce((a,b)=>a.area>b.area?a:b)];
 while(centres.length<count)centres.push(data.reduce((best,s)=>{const d=Math.min(...centres.map(c=>dist(s,c)));return d>best.d?{s,d}:best;},{s:data[0],d:-1}).s);
 let nodes=centres.map(s=>({...s,face:[...s.face],normal:[...s.normal]}));
 for(let it=0;it<24;it++){
  const sum=nodes.map(()=>({area:0,face:[0,0,0],normal:[0,0,0]}));
  for(const s of data){let best=0,d=Infinity;for(let i=0;i<count;i++){const q=dist(s,nodes[i]);if(q<d){best=i;d=q;}}const a=sum[best];a.area+=s.area;for(let k=0;k<3;k++){a.face[k]+=s.area*s.face[k];a.normal[k]+=s.area*s.normal[k];}}
  nodes=sum.map((s,i)=>s.area?{area:s.area,face:unit(s.face),normal:unit(s.normal)}:{...nodes[i],area:0});
 }
 return nodes;
}
const rows=[];
for(const near of [false,true]){
 const g=meadowGeometry(near),train=canopyReferenceSamples(g,{heightRatio:.955});
 for(const count of[8,16]){
  const nodes=compress(train.samples,count),cases=[];
  for(const heightRatio of[.6006,.78,.955,1.13]){
   const {samples}=canopyReferenceSamples(g,{heightRatio});
   const scale=heightRatio/.955, adjusted=nodes.map(n=>{const face=[n.face[0]*scale,n.face[1],n.face[2]*scale];return{area:n.area*Math.hypot(...face),face:unit(face),normal:unit([n.normal[0],n.normal[1]/scale,n.normal[2]])};});
   for(const sun of[15,19.975,30,41.814,45,60,66.625,75])for(const elevation of[5,20,45,75])for(const azimuth of[0,90,180]){
    const l=angularDirection(sun),v=angularDirection(elevation,azimuth),source=sourceCanopyResponse(samples,l,v),approx=sourceCanopyResponse(adjusted,l,v);cases.push({heightRatio,sun,elevation,azimuth,source,approx,error:approx-source});
   }
  }
  const rmse=Math.sqrt(cases.reduce((s,r)=>s+r.error*r.error,0)/cases.length),worst=cases.reduce((a,b)=>Math.abs(a.error)>Math.abs(b.error)?a:b);
  rows.push({lod:near?'near':'middle',count,nodes,rmse,maxAbsolute:Math.abs(worst.error),worst,passed:rmse<=.04&&Math.abs(worst.error)<=.08,cases});
 }
 g.dispose();
}
const report={method:'Area-weighted deterministic Lloyd clustering of canonical face+interpolated normal pairs, 24 iterations. Train only source height .955; inverse-transpose node normals and cofactor-transform face areas for each source height (no additional coefficients); validate original and other three source height ratios. No directional response fitted to screenshots.',limits:{rmse:.04,maxAbsolute:.08},runtimeCost:'Per node two 3D dot products, abs, orientation sign, max, three scalar multiplies, two accumulates; one final reciprocal. 16 nodes: 32 dot products plus 16 branches/sign selections, no texture lookup. Occupancy/interception NOT validated by this unit-response gate.',rows};
fs.writeFileSync('tools/reports/meadow-directional42.json',JSON.stringify(report,null,2));console.log(JSON.stringify(rows.map(({nodes,cases,...r})=>r),null,2));
