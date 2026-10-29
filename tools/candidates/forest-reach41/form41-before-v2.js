// Reach-scale design, not surveyed bed morphology. Station positions follow
// source bends/low banks; no periodic shoreline noise or material recolouring.
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const hermite=(t,a,b,ma,mb,span)=>(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*ma*span+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*mb*span;
// offset,width ratio,rooted shoulder height,shoulder run,thalweg depth.
// Shallow inlet -> broad inside bar -> short outer root bank -> outlet riffle.
export const REACH_FORM41_STATIONS=Object.freeze([
 [-18,1,.07,.4,.12],[-13.5,.93,.075,.48,.08],[-9,.83,.12,.32,.14],
 [1.75,.98,.16,.24,.28],[5.75,.85,.14,.38,.16],[9,.91,.13,.28,.22],
 [14.75,.86,.08,.48,.08],[18,1,.07,.4,.12],
].map(Object.freeze));
export function reachForm41Parameters(offset,deposition){
 const rows=REACH_FORM41_STATIONS,k=rows.findIndex(r=>r[0]>=offset),a=rows[Math.max(0,k-1)],b=rows[k<0?rows.length-1:k],t=a===b?0:smooth((offset-a[0])/(b[0]-a[0]));
 const v=a.map((x,i)=>x+(b[i]-x)*t),inside=smooth((deposition-.4)/.4);
 return {width:v[1]*(.96+.08*inside),height:v[2]*(1.08-.28*inside),run:v[3]*(.68+.72*inside),depth:v[4]};
}
export function reachForm41Height({q,offset,signed,distance,old,side,deposition,axis,trees,x,z}){
 const p=reachForm41Parameters(offset,deposition),half=(side<0?q.left:q.right)*p.width;
 const rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-x,r.z-z))),rootWeight=smooth((rootDistance-.8)/1.2),endWeight=smooth((18-Math.abs(offset))/4),edgeWeight=smooth((q.outer-distance)/.3);
 if(!rootWeight||!endWeight||!edgeWeight)return old;
 let target;
 if(distance<=half){
  // Keep a connected channel; the bend thalweg uses the same source axis.
  const bedSide=signed<axis?-1:1,channelHalf=bedSide===side?half:(bedSide<0?q.left:q.right)*reachForm41Parameters(offset,1-deposition).width,span=Math.max(.08,channelHalf-bedSide*axis),t=clamp(Math.abs(signed-axis)/span);
  target=q.level-p.depth*(1-t*t);
 }else{
  const gap=distance-half,run=Math.min(p.run,(q.outer-half)*.62),slope=2*p.depth/Math.max(.08,half-side*axis);
  if(gap<run)target=q.level+hermite(gap/run,0,p.height,Math.min(slope,3*p.height/run),0,run);
  else {
   // The shoulder blends into its own source surface, not a horizontal strip.
   const release=smooth((gap-run)/Math.max(.01,q.outer-half-run));
   target=(q.level+p.height)*(1-release)+old*release;
  }
 }
 return old+(target-old)*rootWeight*endWeight*edgeWeight;
}
