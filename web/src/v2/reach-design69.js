import {reachForm41Height,reachForm41Parameters} from './forest-reach-form41.js';
// Authored analogue, not a surveyed bed. Same control surface supplies water,
// collisions and terrain; the existing centreline/longitudinal level is untouched.
export const REACH_DESIGN69_REVISION='connected-pointbars69-1';
export function reachDesign69Option(search=globalThis.location?.search??''){
 const values=new URLSearchParams(search).getAll('reachDesign69');
 if(values.some(v=>v!=='0'&&v!=='bend')||new Set(values).size>1)throw Error('Invalid reachDesign69 option');
 return values[0]==='bend'?'bend':null;
}
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const bell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
const hermite=(t,a,b,ma,mb,span)=>(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*ma*span+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*mb*span;
export const REACH_DESIGN69_UNITS=Object.freeze([
 {id:'inlet-pointbar',offset:-10.8,reach:6.1,inner:-1,retreat:.20,pool:.085},
 {id:'middle-pointbar',offset:-2.1,reach:5.4,inner:1,retreat:.23,pool:.095},
 {id:'outlet-pointbar',offset:8.4,reach:6.4,inner:-1,retreat:.19,pool:.070},
].map(Object.freeze));
// Source-fixed retained stones. Preserve their support footprint as well as the
// root matrix; this data is independently checked against createShoreStones.
export const REACH_DESIGN69_STONES=Object.freeze([
 [-3619.7683489153546,4815.091475695066,1.1171,.4838,3.585814623092174],
 [-3620.5168691994136,4815.74711587277,.3575,.3655,2.1237390576883026],
 [-3613.196973900597,4803.476410674315,1.0918,.7305,3.5610551529951477],
 [-3623.466262568475,4789.983420681093,.3166,.1681,-2.938238692893758],
 [-3622.704893634915,4791.105880908279,.2626,.2852,-2.2859773128341137],
].map(Object.freeze));
export function reachDesign69Support(x,z){let weight=1;for(const[a,b,rx,rz,rot]of REACH_DESIGN69_STONES){const dx=x-a,dz=z-b,c=Math.cos(rot),s=Math.sin(rot),d=Math.hypot((dx*c-dz*s)/(rx+.06),(dx*s+dz*c)/(rz+.06));weight=Math.min(weight,smooth((d-1)/.35));}return weight;}
export function reachDesign69Section(q,offset,deposition=.5,axis=0){
 const left=reachForm41Parameters(offset,deposition,-1),right=reachForm41Parameters(offset,1-deposition,1);
 const oldLeft=Math.max(.18,q.left*left.width+left.edgeShift),oldRight=Math.max(.18,q.right*right.width+right.edgeShift);
 let inner=0,strength=0,retreatLeft=0,retreatRight=0,pool=0;
 for(const u of REACH_DESIGN69_UNITS){const w=bell((offset-u.offset)/u.reach);inner+=u.inner*w;strength+=w;pool+=u.pool*w;if(u.inner<0)retreatLeft+=u.retreat*w;else retreatRight+=u.retreat*w;}
 inner/=Math.max(1,strength);strength=Math.min(1,strength);
 const L=Math.max(.16,oldLeft-retreatLeft),R=Math.max(.16,oldRight-retreatRight);
 const oldAxis=Math.max(-oldLeft+.17,Math.min(oldRight-.17,(oldRight-oldLeft)*.5+axis*.25));
 const thalweg=Math.max(-L+.14,Math.min(R-.14,oldAxis-inner*.16));
 return {left:L,right:R,oldLeft,oldRight,axis:thalweg,depth:left.depth+pool,inner,strength,
  leftInner:clamp(-inner),rightInner:clamp(inner)};
}
export function reachDesign69Height(args){
 const original=reachForm41Height({...args,design50:false}),{q,offset,signed,x,z,trees,old}=args;
 if(Math.abs(offset)>=18||Math.abs(signed)>=q.outer)return original;
 const p=reachDesign69Section(q,offset,args.side<0?args.deposition:1-args.deposition,args.axis);
 if(p.strength===0)return original;
 const side=signed<p.axis?-1:1,half=side<0?p.left:p.right,oldHalf=side<0?p.oldLeft:p.oldRight;
 const span=half-side*p.axis,t=Math.abs(signed-p.axis)/span,inner=side<0?p.leftInner:p.rightInner;
 const slope=(p.depth/span)*(2.1*(1-inner)+.48*inner),gap=Math.abs(signed)-half;
 let target;
 if(t<=1)target=q.level+hermite(t,-p.depth,0,0,slope,span);
 else {
  // The inner low bar is attached to the bank. Its new dry strip occupies the
  // formerly submerged bed, never a detached island or a second water crossing.
  const run=Math.max(.30,oldHalf-half+.32),u=clamp(gap/run);
  const lift=slope*gap*(1-u)*(1-u)+.065*inner*smooth(gap/.16)*(1-smooth((gap-(oldHalf-half+.10))/.25));
  target=Math.max(original,q.level)+lift;
 }
 const rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-x,r.z-z)));
 const weight=reachDesign69Support(x,z)*smooth((rootDistance-.8)/1.2)*smooth((18-Math.abs(offset))/4)*smooth((q.outer-Math.abs(signed))/.3)*p.strength;
 return original+(target-original)*weight;
}
