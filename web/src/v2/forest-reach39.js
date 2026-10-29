import {reachDesign73Height,REACH_DESIGN73_REVISION} from './reach-design73.js';
import {reachDesign69Height,REACH_DESIGN69_REVISION} from './reach-design69.js';
import {reachBankDesign50Enabled} from './reach-bank-design50.js';
import {reachBank48Enabled,reachBank48Weight} from './reach-bank-profile48.js';
import {reachForm41Height as legacyForm41Height} from './forest-reach-form41-legacy.js';
import {reachForm41Height,REACH_FORM41_REVISION} from './forest-reach-form41.js';
import {riverSectionAt,projectRiverSection} from './river-section.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const xy=(q,side,d)=>({x:q.x-q.fz*side*d,z:q.z+q.fx*side*d});
// Low depositional bank tongues, not repeated shoreline texture or cover dots.
// Each compact shoulder has a different reach, cross-bank extent and rise.
// It changes the shared physical height before the water intersection is solved.
const rootShoulders39=[
 {side:-1,offset:-12.6,reach:2.2,across:.37,width:.24,rise:.055},
 {side:1,offset:-5.1,reach:1.6,across:.44,width:.21,rise:.045},
 {side:-1,offset:1.8,reach:2.8,across:.40,width:.27,rise:.075},
 {side:1,offset:10.2,reach:2.1,across:.35,width:.23,rise:.06},
];
const compactBell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
export function reachRootShoulderLift39(offset,across,side){return rootShoulders39.reduce((height,p)=>height+(p.side===side?p.rise*compactBell((offset-p.offset)/p.reach)*compactBell((across-p.across)/p.width):0),0);}

// Opt-in design. Queries, collider height and both water LODs share this surface.
export function createForestReach39({segments,queryAt,rawHeight,baseHeightAt,protectedAt=()=>false,source=FOREST_REACH39_SOURCE,allowIncompatible=false,reachDesign69=null,reachDesign73=null,form41=new URLSearchParams(globalThis.location?.search||'').get('forestReachForm41')!=='0'}){
 const profile48=reachBank48Enabled(),design50=reachBankDesign50Enabled();
 const legacy41=new URLSearchParams(globalThis.location?.search||'').get('forestReachBankProfile41')==='legacy',formHeight=reachDesign73==='bend'?reachDesign73Height:reachDesign69==='bend'?reachDesign69Height:legacy41?legacyForm41Height:reachForm41Height;
 if(reachDesign73&&(reachDesign69||!form41||legacy41||profile48||design50))throw Error('reachDesign73 cannot combine with other reach geometry variants');
 if(reachDesign69&&(!form41||legacy41||profile48||design50))throw Error('reachDesign69 cannot combine with other reach geometry variants');
 const anchor=segments.find(s=>s.id===source.anchorId);if(!anchor){if(allowIncompatible)return null;throw new Error('ForestReach39 source anchor missing');}
 const origin=anchor.a.distance,controls=source.controls,trees=source.trees;
 const line=segments.filter(s=>s.lineId===source.lineId);
 for(const expected of source.expected){const distance=origin+expected.offset,g=line.find(g=>g.a.distance<=distance&&g.b.distance>=distance);if(!g){if(allowIncompatible)return null;throw new Error('ForestReach39 control segment missing');}const q=riverSectionAt(g,(distance-g.a.distance)/(g.b.distance-g.a.distance));
  for(const key of ['x','z','level','left','right','outer'])if(Math.abs(q[key]-expected[key])>1e-7){if(allowIncompatible)return null;throw new Error('ForestReach39 source geometry mismatch: '+key);}
  const c=controls.find(c=>c.offset===expected.offset);for(const v of c.sides){const p=xy(q,v.side,q.outer);if(Math.abs(rawHeight(p.x,p.z)-q.level-v.freeboard)>1e-7){if(allowIncompatible)return null;throw new Error('ForestReach39 source terrain mismatch');}}
 }
function parameters(s,side){let k=controls.findIndex(c=>c.offset>=s);if(k<=0)return controls[0].sides[side<0?0:1];const a=controls[k-1],b=controls[k],u=smooth((s-a.offset)/(b.offset-a.offset)),j=side<0?0:1;return Object.fromEntries(['crest','toe','toeRise','poolDepth','axis','deposition'].map(key=>[key,a.sides[j][key]+(b.sides[j][key]-a.sides[j][key])*u]));}
const localSegments=line.filter(s=>s.b.distance>origin-20&&s.a.distance<origin+20);
function project(x,z){
 const original=queryAt(x,z);if(!form41||legacy41||!original||original.segment.lineId!==source.lineId||!original.section||Math.abs(original.section.distance-origin)>=18)return original;
 const oq=original.section,along=(x-original.x)*oq.fx+(z-original.z)*oq.fz;
 if(Math.abs(along)<.001)return original;
 // The old query prefers a round cap beyond its original wet width. A new
 // shallow bank belongs to its actual transverse strip out to the protection
 // envelope, otherwise a neighbour cap introduces a centimetre-high step.
 let best=null,score=Infinity;
 for(const segment of localSegments){const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,t=clamp(((x-segment.a.x)*dx+(z-segment.a.z)*dz)/(dx*dx+dz*dz)),p=projectRiverSection(x,z,segment,t),q=p.section;
  if(p.distance>=q.outer||Math.abs((x-p.x)*q.fx+(z-p.z)*q.fz)>=.001)continue;
  const half=p.signed<0?q.left:q.right,rank=p.distance/half;
  if(rank<score){score=rank;best={...p,segment,width:q.width,half,margin:q.outer-half,level:q.level,channelDepth:q.depth};}
 }
 return best??original;
}

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
 const y=q.level-shallow+(free+shallow)*broad-(a.poolDepth-shallow)*Math.exp(-(((t*span)/sigma)**2))*(1-broad)+reachRootShoulderLift39(s,t,side);
 const reach=smooth((18-Math.abs(s))/4),rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-p.wx,r.z-p.wz))),rootRelease=smooth((rootDistance-.8)/1.2);
 const support=smooth((q.outer-p.distance)/.25);
 return old+(Math.min(raw,y)-old)*strength*reach*rootRelease*support;
}
function value(x,z){const old=baseHeightAt(x,z),p=project(x,z);if(p){p.wx=x;p.wz=z;}if(!p||p.segment.lineId!==source.lineId||protectedAt(x,z))return{old,y:old,zone:0};const q=riverSectionAt(p.segment,p.t),s=q.distance-origin,side=p.signed<0?-1:1,half=side<0?q.left:q.right,d=p.distance,raw=rawHeight(x,z);
 if(Math.abs(s)>=18||d>=q.outer)return{old,y:old,zone:d<=half?3:0,water:q.level};
 if(form41){const a=parameters(s,side),axis=a.axis*(a.axis<0?q.left:q.right);let bankAnchor48=null;if(profile48&&!legacy41&&reachBank48Weight(s,side)){const at=distance=>{const v=xy(q,side,distance);return baseHeightAt(v.x,v.z);};bankAnchor48={height:at(q.outer),slope:(at(q.outer+.025)-at(q.outer-.025))/.05};}const bankAnchor73=reachDesign73?Object.fromEntries([[-1,'left'],[1,'right']].map(([side,key])=>{const v=xy(q,side,q.outer);return[key,baseHeightAt(v.x,v.z)];})):null;const y=formHeight({q,bankAnchor73,offset:s,signed:p.signed,distance:d,old,side,deposition:a.deposition,axis,trees,x,z,bankAnchor48,design50});return{old,y,zone:y<q.level?3:0,water:q.level,raw,s,side};}
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
 function waterSamples(segment){if(sampleTimes.has(segment.id))return sampleTimes.get(segment.id);const steps=Math.max(1,Math.ceil(segment.length/.125)),times=Array.from({length:steps+1},(_,j)=>j/steps);for(const distance of [origin-18,origin+18]){const t=(distance-segment.a.distance)/(segment.b.distance-segment.a.distance);if(t>0&&t<1)times.push(t);}let result=[...new Set(times)].sort((a,b)=>a-b);
  if(reachDesign73){
   // Retained stone supports can make the first wet/dry crossing bend sharply.
   // Refine only those edges instead of interpolating water over a 2 mm dry lip.
   const refined=[result[0]],split=(a,b,depth)=>{const m=(a+b)/2,qa=solveSection(segment,a),qb=solveSection(segment,b),qm=solveSection(segment,m),error=Math.max(Math.abs(qm.left-(qa.left+qb.left)/2),Math.abs(qm.right-(qa.right+qb.right)/2));if(error>.002&&depth<5){split(a,m,depth+1);split(m,b,depth+1);}else refined.push(b);};
   for(let i=1;i<result.length;i++)split(result[i-1],result[i],0);result=refined;
  }
  sampleTimes.set(segment.id,result);return result;}
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
  stats:{...(reachDesign73?{design73:REACH_DESIGN73_REVISION}:{}),...(reachDesign69?{design69:REACH_DESIGN69_REVISION}:{}),design50:design50?'root-pool':null,profile48:profile48?'left-hermite':null,form41,form41Revision:form41?(legacy41?'rooted-bars-pools-v2':REACH_FORM41_REVISION):null,sourceVersion:source.version,sourceTreeHash:source.treeSourceHash,giMatched:false,defaultEnabled:true},
  dispose(){waterSections.clear();sampleTimes.clear();}};
}
