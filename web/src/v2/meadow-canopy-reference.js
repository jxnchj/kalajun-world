// Offline unit-diffuse reference for the existing generated grass. No runtime
// hook: an angular fit must pass before a terrain candidate can be connected.
// This deliberately excludes mutual visibility/shadows and is NOT a ground BRDF.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const rotate=(a,r)=>[a[0]*Math.cos(r)+a[2]*Math.sin(r),a[1],-a[0]*Math.sin(r)+a[2]*Math.cos(r)];
const bary=[[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]];
export function canopyReferenceSamples(geometry,{heightRatio=.955,rotations=16}={}){
 if(!(heightRatio>0)||!Number.isInteger(rotations)||rotations<1)throw new RangeError('Invalid source sampling');
 const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),wind=geometry.getAttribute('aPlantWind'),index=geometry.index;
 const get=(a,i)=>[a.getX(i),a.getY(i),a.getZ(i)];
 const samples=[];let area=0,triangles=0,seedArea=0,normalY2=0;
 for(let t=0;t<index.count;t+=3){
  const ids=[index.getX(t),index.getX(t+1),index.getX(t+2)],p=ids.map(i=>{const v=get(pos,i);v[1]*=heightRatio;return v;});
  const c=cross(sub(p[1],p[0]),sub(p[2],p[0])),rawArea=Math.hypot(...c)/2;
  if(rawArea<1e-12)continue;
  // The runtime collapses these seed vertices on 86% of roots.
  const seed=ids.every(i=>wind.getZ(i)>1.6),a=rawArea*(seed?.14:1),face=norm(c);
  area+=a;seedArea+=seed?a:0;triangles++;
  const ns=ids.map(i=>{const n=get(normal,i);n[1]/=heightRatio;return norm(n);});
  for(const b of bary){const n=norm([0,1,2].map(k=>ns.reduce((sum,v,i)=>sum+b[i]*v[k],0)));
   normalY2+=a*n[1]*n[1]/bary.length;
   for(let r=0;r<rotations;r++){const angle=r*Math.PI*2/rotations;samples.push({area:a/bary.length/rotations,face:rotate(face,angle),normal:rotate(n,angle)});}
  }
 }
 return {samples,stats:{triangles,weightedArea:area,seedArea,meanNormalY2:normalY2/area,heightRatio,rotations,quadraturePerTriangle:3}};
}
export function angularDirection(elevation,azimuth=0){const e=elevation*Math.PI/180,a=azimuth*Math.PI/180;return[Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)];}
// Raster-visible area weights use the geometric face, shading uses the actual
// interpolated inverse-transpose vertex normal, with Three DoubleSide flipping.
// Unit diffuse albedo and unit incoming radiance, with the common 1/pi removed.
export function sourceCanopyResponse(samples,light,view){
 let projected=0,response=0;
 for(const s of samples){const facing=dot(s.face,view),a=s.area*Math.abs(facing);projected+=a;response+=a*Math.max(0,dot(s.normal,light)*(facing>=0?1:-1));}
 return projected>1e-12?response/projected:0;
}
// Standard Oren-Nayar diffuse multiplier, sigma in radians. It is tested as a
// possible compact fit, never inferred directly from source normal variance.
export function roughDiffuseResponse(light,view,sigma){
 const nl=Math.max(0,light[1]),nv=Math.max(0,view[1]);if(nl===0||nv===0)return 0;
 const s2=sigma*sigma,A=1-.5*s2/(s2+.33),B=.45*s2/(s2+.09);
 const sl=Math.sqrt(Math.max(0,1-nl*nl)),sv=Math.sqrt(Math.max(0,1-nv*nv));
 const az=Math.max(0,(light[0]*view[0]+light[2]*view[2])/Math.max(1e-12,sl*sv));
 const sinAlpha=Math.max(sl,sv),tanBeta=Math.min(sl/Math.max(1e-12,nl),sv/Math.max(1e-12,nv));
 return nl*(A+B*az*sinAlpha*tanBeta);
}
export function fitRoughDiffuse(rows){
 let best=null;
 for(let i=0;i<=90;i++){const sigma=i*Math.PI/180,errors=rows.map(r=>roughDiffuseResponse(r.light,r.view,sigma)-r.source),mse=errors.reduce((s,e)=>s+e*e,0)/rows.length;
  if(!best||mse<best.mse)best={sigmaDegrees:i,mse,rmse:Math.sqrt(mse),maxAbsoluteError:Math.max(...errors.map(Math.abs))};
 }
 return best;
}
