import {riverSectionAt,riverCrossPoint} from './river-section.js';
// Narrow phase for the candidate only. Do not join separate leaves into one
// convex solid or round their vertical extent to a 12 cm bucket.
// Mode 9 uses ecology ecoBend: field channels [0,1], flex <=1.25,
// returning <=.32, lean <=.23*1.25*1.32, eddy <=.5*.045*1.25,
// head <=.10+.5*.012. Thus .43*w.x^2+.11*w.y bounds the
// horizontal magnitude; ecology applies vertical sag .55*lengthSquared.
// Treat the channel below its surface as water volume, not just a thin skin:
// fully submerged triangles must also fail contact.
function clip(poly,y,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[1]>=y:a[1]<=y,ib=above?b[1]>=y:b[1]<=y;if(ia)out.push(a);if(ia!==ib){const t=(y-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t]);}}return out;}
function overlaps(a,b,padding){for(const poly of[a,b])for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<1e-10)continue;const nx=-dz/len,nz=dx/len,aa=a.map(p=>p[0]*nx+p[1]*nz),bb=b.map(p=>p[0]*nx+p[1]*nz);if(Math.max(...aa)+padding<Math.min(...bb)||Math.max(...bb)+padding<Math.min(...aa))return false;}return true;}
export function reachPlantIntersectsWater40(world,root,geometries,context=new Map()){return intersects40(world,root,geometries,context,true);}
// Kept as the unaccelerated boundary oracle for exact source comparisons.
export function reachPlantIntersectsWater40Oracle(world,root,geometries){return intersects40(world,root,geometries,new Map(),false);}
function intersects40(world,root,geometries,context,accelerated){
 const c=Math.cos(root.rot),s=Math.sin(root.rot),scale=root.s,sy=root.sy??scale,triangles=[];let radius=0;
 for(const g of geometries){const p=g.attributes.position,w=g.attributes.aPlantWind,index=g.index,count=index?.count??p.count;
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),wx=w?Math.max(...ids.map(j=>w.getX(j))):0,wy=w?Math.max(...ids.map(j=>w.getY(j))):0,sway=.43*wx*wx+.11*wy,padding=sway*scale+.015,sag=.55*sway*sway*sy;
   const points=ids.map(j=>{const x=p.getX(j),z=p.getZ(j);radius=Math.max(radius,Math.hypot(x,z)*scale+padding);return[root.x+(c*x+s*z)*scale,root.y+p.getY(j)*sy,root.z+(-s*x+c*z)*scale];});triangles.push({points,padding,sag,lo:Math.min(...points.map(p=>p[1])),hi:Math.max(...points.map(p=>p[1]))});
  }
 }
 const reach=world.hydrology.forestReach39;
 for(const segment of world.hydrology.nearSegments(root.x,root.z,radius+5)){
  let strips=accelerated?context.get(segment):null;
  if(!strips){const active=reach?.activeSegment(segment),n=Math.max(1,Math.ceil(segment.length)),times=active?reach.waterSamples(segment):Array.from({length:n+1},(_,i)=>i/n),section=active?reach.waterSectionAt:riverSectionAt;strips=[];
   for(let i=0;i<times.length-1;i++){const a=section(segment,times[i]),b=section(segment,times[i+1]),hi=Math.max(a.level,b.level)+.009,water=[riverCrossPoint(a,-1),riverCrossPoint(a,1),riverCrossPoint(b,1),riverCrossPoint(b,-1)].map(p=>[p.x,p.z]);
    const axes=[];for(let j=0;j<water.length;j++){const p=water[j],q=water[(j+1)%water.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<1e-10)continue;const nx=-dz/len,nz=dx/len,values=water.map(p=>p[0]*nx+p[1]*nz);axes.push({nx,nz,lo:Math.min(...values),hi:Math.max(...values)});}strips.push({hi,water,axes});
   }if(accelerated)context.set(segment,strips);
  }
  for(const {hi,water,axes}of strips)for(const tri of triangles){if(tri.lo-tri.sag>hi)continue;
   // Only use the ORIGINAL water SAT axes, never an arbitrarily padded XZ
   // box: acute corners can extend beyond that box under the original rule.
   // The unclipped triangle contains the clipped polygon. Extra tolerance
   // protects interpolation roundoff; the final original SAT is unchanged.
   if(accelerated&&axes.some(a=>{let lo=Infinity,high=-Infinity;for(const p of tri.points){const v=p[0]*a.nx+p[2]*a.nz;lo=Math.min(lo,v);high=Math.max(high,v);}return high+tri.padding+1e-7<a.lo||a.hi+tri.padding+1e-7<lo;}))continue;
   const clipped=clip(tri.points,hi+tri.sag,false);if(clipped.length&&overlaps(clipped.map(p=>[p[0],p[2]]),water,tri.padding))return true;
  }
 }
 return false;
}
