import {reachForm41Height} from './forest-reach-form41.js';
import {REACH_DESIGN69_STONES} from './reach-design69.js';
export const REACH_DESIGN73_REVISION='rooted-low-banks73-1';
export function reachDesign73Option(search=globalThis.location?.search??''){
 const v=new URLSearchParams(search).getAll('reachDesign73');
 if(v.some(x=>x!=='0'&&x!=='bend')||new Set(v).size>1)throw Error('Invalid reachDesign73 option');
 return v[0]==='bend'?'bend':null;
}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const REACH_DESIGN73_STATIONS=Object.freeze([
 // Metres, source chainage. These are designed low-bank analogues, not survey.
 // [along, wet-left, wet-right, thalweg, depth, left cut, right cut]
 [-18,.68,.32,0,.18,0,0],[-14,.72,.40,.10,.105,0,0],
 [-10,.52,.32,.10,.12,0,0],[-6,.60,.55,-.08,.16,.10,0],
 [-3.4,.72,.57,-.22,.21,.85,0],[-1.4,.69,.55,-.20,.20,.80,0],
 [1.5,.49,.38,-.13,.13,0,0],[5,.43,.47,.02,.085,0,0],
 [9,.70,.48,.13,.12,0,.32],[13,.56,.34,.10,.145,0,0],
 [18,.68,.32,0,.18,0,0],
].map(Object.freeze));
export function reachDesign73Section(offset){
 const rows=REACH_DESIGN73_STATIONS;let k=rows.findIndex(r=>r[0]>=offset);if(k<1)k=offset<=rows[0][0]?1:rows.length-1;
 const a=rows[k-1],b=rows[k],u=smooth((offset-a[0])/(b[0]-a[0]));
 const v=a.map((x,i)=>x+(b[i]-x)*u);
 return {left:v[1],right:v[2],axis:v[3],depth:v[4],cutLeft:v[5],cutRight:v[6]};
}
// Monotone cubic interpolation: same derivative on each side of a joint, no
// depositional ridge followed by an inland trough. Interior control heights
// can be lowered as well as raised; only the 30 cm outside seam blends to old.
function curve(points,x){
 let k=points.findIndex(p=>p[0]>=x);if(k<0)return points.at(-1)[1];if(k===0)return points[0][1];
 const sec=i=>(points[i+1][1]-points[i][1])/(points[i+1][0]-points[i][0]);
 const tangent=i=>{if(i===0)return sec(0);if(i===points.length-1)return sec(i-1);const a=sec(i-1),b=sec(i);return a*b<=0?0:2*a*b/(a+b);};
 const a=points[k-1],b=points[k],span=b[0]-a[0],t=clamp((x-a[0])/span),m0=tangent(k-1),m1=tangent(k);
 return (2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*span*m1;
}
export function reachDesign73Profile(q,p,signed,edgeHeight){
 const side=signed<p.axis?-1:1,half=side<0?p.left:p.right,span=half-side*p.axis;
 const d=Math.abs(signed-p.axis),cut=side<0?p.cutLeft:p.cutRight;
 // A shallow mineral toe, low rooted bench and a limited soil cut share the
// same profile. High banks are NOT classified as rock by this parameter.
 const end=q.outer-side*p.axis,free=Math.max(.008,edgeHeight-q.level);
 const shoulder=Math.min(end-.08,span+.62-.32*cut),rise=Math.min(free,.025+.115*cut);
 const toeDepth=.030+.075*cut,points=[[0,-p.depth],[span*.52,-Math.min(p.depth*.55,toeDepth)],[span,0],[shoulder,rise],[end,Math.max(free,rise)]];
 return q.level+curve(points,d);
}
export function reachDesign73Support(x,z){let weight=1;for(const[a,b,rx,rz,rot]of REACH_DESIGN69_STONES){const dx=x-a,dz=z-b,c=Math.cos(rot),s=Math.sin(rot),d=Math.hypot((dx*c-dz*s)/(rx+.06),(dx*s+dz*c)/(rz+.06));weight=Math.min(weight,smooth((d-1.45)/.70));}return weight;}
export function reachDesign73Height(args){
 const original=reachForm41Height({...args,design50:false}),{q,offset,signed,x,z,trees,bankAnchor73}=args;
 if(Math.abs(offset)>=18||Math.abs(signed)>=q.outer)return original;
 const p=reachDesign73Section(offset),side=signed<p.axis?-1:1;
 if(!bankAnchor73)throw Error('Reach73 needs actual outside-bank height');
 const target=reachDesign73Profile(q,p,signed,side<0?bankAnchor73.left:bankAnchor73.right);
 const rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-x,r.z-z)));
 const weight=reachDesign73Support(x,z)*smooth((rootDistance-.8)/1.2)*smooth((18-Math.abs(offset))/3)*smooth((q.outer-Math.abs(signed))/.30);
 return original+(target-original)*weight;
}
const bell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
// Geometry roles: mineral bed/toe, cohesive soil cut, rooted low bank. No
// 'steep implies rock' gate and no fixed brown stripe on the dry waterline.
export function reachDesign73Roles(offset,signed,clearance){
 const p=reachDesign73Section(offset),side=signed<0?-1:1,half=side<0?p.left:p.right,gap=Math.abs(signed)-half;
 const bank=smooth((gap+.19)/.37)*smooth((clearance+.13)/.15);
 const cut=(side<0?p.cutLeft:p.cutRight)*smooth((gap+.03)/.12)*(1-smooth((gap-.45)/.35));
 const thread=Math.exp(-(((signed-p.axis)/.43)**2));
 const lenses=Math.max(bell((offset+14.4)/2.3)*.85,bell((offset-5.0)/1.8),bell((offset-14.8)/2.4)*.8);
 return {bank,cut,coarse:clamp(.08+.88*lenses*thread),fine:clamp(.92-.88*lenses*thread)};
}
