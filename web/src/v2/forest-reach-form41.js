import {applyReachBankDesign50} from './reach-bank-design50.js';
import {reachBank48Height} from './reach-bank-profile48.js';
// Reach-scale design, not surveyed bed morphology. Authored local depositional
// tongues and pools interrupt both banks, rather than colouring a straight cut.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const hermite=(t,a,b,ma,mb,span)=>(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*ma*span+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*mb*span;
const bell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
export const REACH_FORM41_REVISION='asymmetric-root-banks-v3';
// offset,width ratio,rooted shoulder freeboard,shoulder run,thalweg depth.
export const REACH_FORM41_STATIONS=Object.freeze([
 [-18,1,.07,.4,.12],[-13.5,.98,.055,.62,.11],[-9,1.05,.07,.55,.17],
 [1.75,.98,.06,.62,.20],[5.75,.96,.055,.58,.13],[9,1.03,.06,.65,.17],
 [14.75,.98,.045,.70,.09],[18,1,.07,.4,.12],
].map(Object.freeze));
// Each landform is a whole bank/water boundary deformation in metres. Alternating
// sides are not periodic: near-source bends, a middle pool and outlet low bar
// have deliberately different lengths. No new trees, scattering dots or fences.
export const REACH_FORM41_LANDFORMS=Object.freeze([
 {name:'inlet-root-tongue',offset:-13.2,reach:2.1,side:-1,edge:-.34,height:.13,run:.38,depth:.10},
 {name:'inlet-outer-pool',offset:-10.2,reach:2.6,side:1,edge:.29,height:.075,run:.57,depth:.25},
 {name:'low-deposition-bar',offset:-6.8,reach:2.5,side:1,edge:-.30,height:.012,run:1.05,depth:.085},
 {name:'middle-pool',offset:-2.2,reach:3.0,side:-1,edge:.32,height:.038,run:.82,depth:.25},
 {name:'middle-root-lobe',offset:1.5,reach:1.9,side:1,edge:-.36,height:.15,run:.28,depth:.18},
 {name:'outlet-grass-tongue',offset:5.1,reach:2.0,side:-1,edge:-.34,height:.11,run:.34,depth:.095},
 {name:'outlet-quiet-pool',offset:8.4,reach:2.3,side:1,edge:.27,height:.045,run:.80,depth:.23},
 {name:'outlet-shallow-spread',offset:13.2,reach:2.4,side:-1,edge:.22,height:.025,run:.95,depth:.065},
].map(Object.freeze));
export function reachForm41Parameters(offset,deposition,side=1,design50=false){
 const rows=REACH_FORM41_STATIONS,k=rows.findIndex(r=>r[0]>=offset),a=rows[Math.max(0,k-1)],b=rows[k<0?rows.length-1:k],t=a===b?0:smooth((offset-a[0])/(b[0]-a[0]));
 const v=a.map((x,i)=>x+(b[i]-x)*t),inside=smooth((deposition-.4)/.4);
 const p={width:v[1],height:v[2]*(1.08-.28*inside),run:v[3]*(.78+.44*inside),depth:v[4],edgeShift:0,rootBank:0,shelf:0};
 for(const f of REACH_FORM41_LANDFORMS){const w=bell((offset-f.offset)/f.reach);if(!w)continue;
  // One shared thalweg depth: changing signed bank must not produce a bed seam.
  p.depth+=(f.depth-v[4])*w;
  if(f.side===side){p.edgeShift+=f.edge*w;p.height+=(f.height-p.height)*w;p.run+=(f.run-p.run)*w;p.rootBank=Math.max(p.rootBank,f.height>=.07&&f.edge<0?w:0);p.shelf=Math.max(p.shelf,f.height<.04?w:0);}
 }
 return design50?applyReachBankDesign50(p,offset,side):p;
}
export function reachForm41Height({q,offset,signed,distance,old,side,deposition,axis,trees,x,z,bankAnchor48=null,design50=false}){
 // At a source-node round cap, radial distance and signed cross-stream
 // distance differ. Mixing radial branch selection with signed bed evaluation
 // creates a discontinuous dry step inside the same transverse profile.
 distance=Math.abs(signed);
 const p=reachForm41Parameters(offset,deposition,side,design50),opposite=reachForm41Parameters(offset,1-deposition,-side,design50),half=Math.max(.18,(side<0?q.left:q.right)*p.width+p.edgeShift),otherHalf=Math.max(.18,(side<0?q.right:q.left)*opposite.width+opposite.edgeShift);
 const left=side<0?half:otherHalf,right=side>0?half:otherHalf;
 // A protruding root mat displaces the flowing thalweg as well as the bank.
 // Retaining the old axis would pinch a deep vertical slot beside the tongue.
 axis=Math.max(-left+.17,Math.min(right-.17,(right-left)*.5+axis*.25));
 let rootDistance=Infinity;for(const r of trees)rootDistance=Math.min(rootDistance,Math.hypot(r.x-x,r.z-z));
 const rootWeight=smooth((rootDistance-.8)/1.2),endWeight=smooth((18-Math.abs(offset))/4),edgeWeight=smooth((q.outer-distance)/.3);
 if(!rootWeight||!endWeight||!edgeWeight)return old;
 const run=Math.min(p.run,(q.outer-half)*.76),span=Math.max(.08,half-side*axis),wet=2*p.depth/span,dry=p.height/run*p.rootBank,slope=2*wet*dry/Math.max(.0001,wet+dry);
 let target;
 if(distance<=half){
  const bedSide=signed<axis?-1:1,bp=bedSide===side?p:reachForm41Parameters(offset,1-deposition,bedSide,design50),bh=bedSide===side?half:Math.max(.18,(bedSide<0?q.left:q.right)*bp.width+bp.edgeShift),bs=Math.max(.08,bh-bedSide*axis),br=Math.min(bp.run,(q.outer-bh)*.76),bw=2*bp.depth/bs,bd=bp.height/br*bp.rootBank,joint=2*bw*bd/Math.max(.0001,bw+bd),t=clamp(Math.abs(signed-axis)/bs);
  const bowl=hermite(t,-bp.depth,0,0,joint,bs);
  // Deposition is a broad shallow shelf beside the moving thalweg, not a
  // second raised kerb on both sides. Its volume is actual terrain/water depth.
  const shelf=-bp.depth*(1-t*t)**3;
  // Centimetre-scale connected sediment relief stays below the water surface
  // and vanishes quadratically at either shore. No isolated rock instances.
  const relief=.0035*Math.sin(offset*2.1+signed*5.3)*Math.sin(offset*1.7-signed*5.2)*(1-t)**2;
  target=q.level+bowl*(1-bp.shelf*.85)+shelf*bp.shelf*.85+relief;
 }else{
  const gap=distance-half;
  // The ordinary depositional bank joins directly into the surrounding
  // terrain, without the old fixed-height horizontal shoulder. Only authored
  // root lobes have a local raised root mat and steeper bank face.
  const u=clamp(gap/Math.max(.01,q.outer-half));
  const originalBank=q.level+Math.max(0,old-q.level)*smooth(u);
  const bank=bankAnchor48?reachBank48Height(originalBank,{offset,side,rootBank:p.rootBank,gap,span:q.outer-half,level:q.level,anchor:bankAnchor48}):originalBank;
  let rooted;
  if(gap<run)rooted=q.level+hermite(gap/run,0,p.height,slope,0,run);
  else {const release=smooth((gap-run)/Math.max(.01,q.outer-half-run));rooted=(q.level+p.height)*(1-release)+old*release;}
  target=bank+(rooted-bank)*p.rootBank;
 }
 return old+(target-old)*rootWeight*endWeight*edgeWeight;
}
