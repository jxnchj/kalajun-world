import {riverSectionAt,riverCrossPoint} from './river-section.js';
const baseCache=new WeakMap();
export function brookShoulderSuitable(world,x,z){
 if(!world.hydrology?.stats.brookBendBanks?.nodes)return false;
 const q=world.hydrology.sampleAt(x,z,{includeDepth:false});
 if(q.insideWater||q.shoreDistance<.035||q.wetness<.025||!q.id)return false;
 const segment=world.hydrology.nearSegments(x,z,2).find(s=>s.id===q.id);
 if(!(segment?.a.bankShape?.bendWeight>0||segment?.b.bankShape?.bendWeight>0))return false;
 return world.surface.heightAt(x,z)-q.surfaceLevel>=.045;
}
export function grassStemFeet(geometries){
 let points=baseCache.get(geometries[0]);if(points)return points;
 points=[];
 for(const geometry of geometries){const p=geometry.attributes.position,w=geometry.attributes.aPlantWind;
  for(let i=0;i<p.count;i++)if(w.getX(i)<.00001)points.push([p.getX(i),p.getZ(i)]);
 }
 baseCache.set(geometries[0],points);return points;
}
function overlap(a,b,padding){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<1e-10)continue;
  const nx=-dz/len,nz=dx/len;let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const p of a){const d=p[0]*nx+p[1]*nz;amin=Math.min(amin,d);amax=Math.max(amax,d);}
  for(const p of b){const d=p[0]*nx+p[1]*nz;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax+padding<bmin||bmax+padding<amin)return false;
 }
 return true;
}
// Vertical swept slabs permit leaves overhanging the stream ABOVE the water,
// while rejecting actual contact. A fixed horizontal exclusion disk cannot.
export function brookGrassIntersectsWater(world,root,envelope){
 const c=Math.cos(root.rot),s=Math.sin(root.rot),scale=root.s,sy=root.sy??scale;
 const slices=envelope.slabs.map(b=>({lo:root.y+(b.lo-.55*b.sway*b.sway)*sy,hi:root.y+b.hi*sy,padding:b.sway*scale+.015,
  polygon:b.polygon.map(([x,z])=>[root.x+(c*x+s*z)*scale,root.z+(-s*x+c*z)*scale])}));
 const radius=envelope.radius*scale;
 for(const segment of world.hydrology.nearSegments(root.x,root.z,radius+5)){
  const reach=world.hydrology.forestReach39,active=reach?.activeSegment(segment),times=active?reach.waterSamples(segment):Array.from({length:Math.max(1,Math.ceil(segment.length))+1},(_,i)=>i/Math.max(1,Math.ceil(segment.length)));
  for(let i=0;i<times.length-1;i++){
   const section=active?reach.waterSectionAt:riverSectionAt,a=section(segment,times[i]),b=section(segment,times[i+1]),lo=Math.min(a.level,b.level)+.006,hi=Math.max(a.level,b.level)+.006;
   const possible=slices.filter(v=>v.lo<=hi+.003&&v.hi>=lo-.003);if(!possible.length)continue;
   const poly=[riverCrossPoint(a,-1),riverCrossPoint(a,1),riverCrossPoint(b,1),riverCrossPoint(b,-1)].map(p=>[p.x,p.z]);
   if(possible.some(v=>overlap(v.polygon,poly,v.padding)))return true;
  }
 }
 return false;
}
// The near narrow-channel terrain uses 10m tiles / 32 cells. Match its
// centre-selected diagonal and Float32 vertex heights, so an analytically
// grounded new tuft cannot float over the rendered chord of a curved bank.
export function brookRenderedBankHeight(world,x,z,cache=new Map()){
 const step=.3125,ix=Math.floor(x/step),iz=Math.floor(z/step),key=ix+','+iz;
 let cell=cache.get(key);
 if(!cell){const ox=ix*step,oz=iz*step,h=(x,z)=>Math.fround(world.surface.heightAt(x,z));
  const a=h(ox,oz),b=h(ox+step,oz),c=h(ox,oz+step),d=h(ox+step,oz+step),mid=world.surface.heightAt(ox+step*.5,oz+step*.5);
  cell={a,b,c,d,ad:Math.abs((a+d)*.5-mid)<Math.abs((b+c)*.5-mid)};cache.set(key,cell);
 }
 const {a,b,c,d,ad}=cell,u=x/step-ix,v=z/step-iz;
 if(ad)return v>=u?a+(d-c)*u+(c-a)*v:a+(b-a)*u+(d-b)*v;
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export function seatBrookShoulderGrass(world,root,feet,envelope,diagnostics=null){
 const reject=reason=>{if(diagnostics)diagnostics[reason]=(diagnostics[reason]||0)+1;return null;};
 const c=Math.cos(root.rot),s=Math.sin(root.rot),meshCells=new Map();let low=Infinity,high=-Infinity;
 for(const [fx,fz]of feet){
  const x=root.x+(c*fx+s*fz)*root.s,z=root.z+(-s*fx+c*fz)*root.s,y=world.surface.heightAt(x,z),q=world.hydrology.sampleAt(x,z,{includeDepth:false});
  if(q.insideWater||q.shoreDistance<.02||Number.isFinite(q.surfaceLevel)&&y-q.surfaceLevel<.025)return reject("wet-foot");
  low=Math.min(low,y,brookRenderedBankHeight(world,x,z,meshCells));high=Math.max(high,y);
 }
 // Roots are seated, never floated over the lower part of a cut face. Very
 // steep microsites remain bare rather than burying most of the grass clump.
 if(high-low>.16)return reject("steep-footprint");
 const seated={...root,y:low-.012,brookShoulder:true};
 return brookGrassIntersectsWater(world,seated,envelope)?reject("swept-water-contact"):seated;
}

// A second, wider representative reach reuses the existing channel and level.
// Eligibility depends only on world data, never the camera or rendered LOD.
const valleyReaches=new WeakMap();
export function valleyShoulderSuitable(world,x,z){
 let reach=valleyReaches.get(world);
 if(reach===undefined){const view=world.hydrology?.viewpoints.find(v=>v.id==='river-valley'),anchor=world.hydrology?.segments.find(s=>s.id===view?.segmentId);reach=anchor?{lineId:anchor.lineId,distance:anchor.a.distance}:null;valleyReaches.set(world,reach);}
 if(!reach)return false;
 const q=world.hydrology.sampleAt(x,z,{includeDepth:false});
 if(q.insideWater||q.shoreDistance<.06||q.wetness<.025||!q.id)return false;
 const segment=world.hydrology.nearSegments(x,z,q.distance+.1).find(s=>s.id===q.id);
 if(segment?.lineId!==reach.lineId||Math.abs(segment.a.distance-reach.distance)>80)return false;
 // Physical roots stay above water; flexible leaf tips may naturally touch it.
 return world.surface.heightAt(x,z)-q.surfaceLevel>=.045;
}
// A newly emerged point bar is still a wet-margin source, rather than ordinary
// meadow turf. Retain the pre-deposit exclusion footprint for classification;
// this does not exclude or remove any root that existed before the landform.
export function valleySourceExcluded(world,x,z,padding=.3){
 return Boolean(world.hydrology.stats.valleyDeposits?.nodes&&world.hydrology.isExcludedSource(x,z,padding));
}
