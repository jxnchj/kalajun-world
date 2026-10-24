import {riverSectionAt} from './river-section.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const xy=(q,side,d)=>({x:q.x-q.fz*side*d,z:q.z+q.fx*side*d});
// Opt-in design. Queries, collider height and both water LODs share this surface.
export function createForestReach39({segments,queryAt,rawHeight,baseHeightAt,protectedAt=()=>false,source=FOREST_REACH39_SOURCE}){
 const anchor=segments.find(s=>s.id===source.anchorId);if(!anchor)throw new Error('ForestReach39 source anchor missing');
 const origin=anchor.a.distance,controls=source.controls,trees=source.trees;
 const line=segments.filter(s=>s.lineId===source.lineId);
 for(const expected of source.expected){const distance=origin+expected.offset,g=line.find(g=>g.a.distance<=distance&&g.b.distance>=distance);if(!g)throw new Error('ForestReach39 control segment missing');const q=riverSectionAt(g,(distance-g.a.distance)/(g.b.distance-g.a.distance));
  for(const key of ['x','z','level','left','right','outer'])if(Math.abs(q[key]-expected[key])>1e-7)throw new Error('ForestReach39 source geometry mismatch: '+key);
  const c=controls.find(c=>c.offset===expected.offset);for(const v of c.sides){const p=xy(q,v.side,q.outer);if(Math.abs(rawHeight(p.x,p.z)-q.level-v.freeboard)>1e-7)throw new Error('ForestReach39 source terrain mismatch');}
 }
function parameters(s,side){let k=controls.findIndex(c=>c.offset>=s);if(k<=0)return controls[0].sides[side<0?0:1];const a=controls[k-1],b=controls[k],u=smooth((s-a.offset)/(b.offset-a.offset)),j=side<0?0:1;return Object.fromEntries(['crest','toe','toeRise','poolDepth','axis','deposition'].map(key=>[key,a.sides[j][key]+(b.sides[j][key]-a.sides[j][key])*u]));}
const project=queryAt;

const hermite=(t,y0,y1,m0,m1,span)=>(2*t**3-3*t*t+1)*y0+(t**3-2*t*t+t)*span*m0+(-2*t**3+3*t*t)*y1+(t**3-t*t)*span*m1;
function contact(q,s,side,a){const half=side<0?q.left:q.right,margin=q.outer-half,p=xy(q,side,half+a.toe*margin),raw=rawHeight(p.x,p.z),axis=a.axis*(a.axis<0?q.left:q.right),span=half-side*axis,wet=a.poolDepth/span,dry=Math.max(.0001,(raw-q.level)*a.toeRise/(a.toe*margin));return {axis,span,slope:2*wet*dry/(wet+dry)};}
function innerSlope(q,s,p,old,raw){
 const a0=parameters(s,p.signed<0?-1:1),axis=a0.axis*(a0.axis<0?q.left:q.right),side=p.signed<axis?-1:1,a=parameters(s,side),strength=smooth((a.deposition-.5)/.35);
 if(!strength)return old;
 const edge=xy(q,side,q.outer),edgeRaw=rawHeight(edge.x,edge.z),span=q.outer-side*axis,t=clamp(Math.abs(p.signed-axis)/span);
 // One broad inner-bank surface, with no water-edge or toe breakpoint.
 // The deep trough decays close to the OUTER-bend axis, leaving a shallow
 // inner bench that rises continuously into original low grassland.
 const broad=smooth(t),shallow=.018,free=Math.max(.001,edgeRaw-q.level),sigma=.22*span;
 const y=q.level-shallow+(free+shallow)*broad-(a.poolDepth-shallow)*Math.exp(-(((t*span)/sigma)**2))*(1-broad);
 const reach=smooth((18-Math.abs(s))/4),rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-p.wx,r.z-p.wz))),rootRelease=smooth((rootDistance-.8)/1.2);
 const support=smooth((q.outer-p.distance)/.25);
 return old+(Math.min(raw,y)-old)*strength*reach*rootRelease*support;
}
function value(x,z){const old=baseHeightAt(x,z),p=project(x,z);if(p){p.wx=x;p.wz=z;}if(!p||p.segment.lineId!==source.lineId||protectedAt(x,z))return{old,y:old,zone:0};const q=riverSectionAt(p.segment,p.t),s=q.distance-origin,side=p.signed<0?-1:1,half=side<0?q.left:q.right,d=p.distance,raw=rawHeight(x,z);
 if(Math.abs(s)>=18||d>=q.outer)return{old,y:old,zone:d<=half?3:0,water:q.level};
 if(d<=half){const a=parameters(s,side),axis=a.axis*(a.axis<0?q.left:q.right),bankSide=p.signed<axis?-1:1,ba=parameters(s,bankSide),edge=contact(q,s,bankSide,ba),t=clamp(Math.abs(p.signed-axis)/edge.span),proposed=hermite(t,q.level-a.poolDepth,q.level,0,edge.slope,edge.span),weight=smooth((18-Math.abs(s))/4),y=old+(proposed-old)*weight;const final=innerSlope(q,s,p,y,raw);return{old,y:final,zone:final<q.level?3:0,water:q.level,raw,s,side,u:d/half};}
 if(parameters(s,side).deposition<=.5||raw<=q.level)return{old,y:old,zone:old<q.level?3:0,water:q.level};
 const u=(d-half)/(q.outer-half),a=parameters(s,side);let r;
 const slope0=a.toeRise/a.toe,slope1=(1-a.toeRise)/(a.crest-a.toe),tangent=2*slope0*slope1/(slope0+slope1);

 if(u<a.toe)r=hermite(u/a.toe,0,a.toeRise,Math.min(3*slope0,contact(q,s,side,a).slope*(q.outer-half)/(raw-q.level)),tangent,a.toe);else if(u<a.crest)r=hermite((u-a.toe)/(a.crest-a.toe),a.toeRise,1,tangent,0,a.crest-a.toe);else r=1;
 let proposed=q.level+(raw-q.level)*r;
 // Original trunk support retained exactly within 0.8 m, smoothly released to
 // 2 m. This changes no tree record, size, orientation or placement.
 const rootDistance=Math.min(...trees.map(t=>Math.hypot(t.x-x,t.z-z))),rootRelease=smooth((rootDistance-.8)/1.2);
 const weight=smooth((18-Math.abs(s))/4)*rootRelease;
 const y=old+(proposed-old)*weight;
 const final=innerSlope(q,s,p,y,raw);return{old,y:final,zone:final<q.level?3:r<.25?1:r<.98?2:0,water:q.level,raw,s,side,u};}

 const waterSections=new Map();
 const activeSegment=s=>s.lineId===source.lineId&&s.b.distance>origin-18&&s.a.distance<origin+18;
 function solveSection(segment,t){
  const q=riverSectionAt(segment,t),offset=q.distance-origin;
  if(!activeSegment(segment)||Math.abs(offset)>=18)return q;
  const key=segment.id+':'+t;if(waterSections.has(key))return waterSections.get(key);
  const sides=[-1,1].map(side=>{
   const original=side<0?q.left:q.right,distances=[...Array.from({length:129},(_,j)=>q.outer*j/128),original].sort((a,b)=>a-b);let last=0;
   for(const d of distances){const p=xy(q,side,d),v=value(p.x,p.z);if(v.y-q.level>=-1e-8){let lo=last,hi=d;for(let k=0;k<24;k++){const m=(lo+hi)/2,p=xy(q,side,m);if(value(p.x,p.z).y-q.level>=-1e-8)hi=m;else lo=m;}return(lo+hi)/2;}last=d;}
   throw new Error('ForestReach39: no connected dry bank intersection at '+offset+'/'+side);
  });
  const result={...q,left:sides[0],right:sides[1],width:sides[0]+sides[1]};waterSections.set(key,result);return result;
 }
 const sampleTimes=new Map();
 function waterSamples(segment){if(sampleTimes.has(segment.id))return sampleTimes.get(segment.id);const steps=Math.max(1,Math.ceil(segment.length/.125)),times=Array.from({length:steps+1},(_,j)=>j/steps);for(const distance of [origin-18,origin+18]){const t=(distance-segment.a.distance)/(segment.b.distance-segment.a.distance);if(t>0&&t<1)times.push(t);}const result=[...new Set(times)].sort((a,b)=>a-b);sampleTimes.set(segment.id,result);return result;}
 function waterSectionAt(segment,t){
  const q=riverSectionAt(segment,t);if(!activeSegment(segment)||Math.abs(q.distance-origin)>=18)return q;
  const times=waterSamples(segment),hi=times.findIndex(v=>v>=t),lo=Math.max(0,hi-1),weight=hi===lo?0:(t-times[lo])/(times[hi]-times[lo]);
  const a=solveSection(segment,times[lo]),b=solveSection(segment,times[hi]),oa=riverSectionAt(segment,times[lo]),ob=riverSectionAt(segment,times[hi]);
  const left=q.left+(a.left-oa.left)*(1-weight)+(b.left-ob.left)*weight,right=q.right+(a.right-oa.right)*(1-weight)+(b.right-ob.right)*weight;
  return {...q,left,right,width:left+right};
 }
 return {version:source.version,origin,lineId:source.lineId,activeSegment,queryAt:project,waterSectionAt,waterSamples,waterStep:.125,
  heightAt:(x,z)=>value(x,z).y,
  depthAt:(x,z,level)=>Math.max(0,level-value(x,z).y),
  stats:{sourceVersion:source.version,sourceTreeHash:source.treeSourceHash,giMatched:false,defaultEnabled:false},
  dispose(){waterSections.clear();sampleTimes.clear();}};
}
