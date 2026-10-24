// Physical bed and optical depth share these coefficients and side semantics.
const C=Object.freeze({toe:.025,start:.08,lip:.45,bar:.70,barStart:.2,barEnd:.62});
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
export function riverBedDepth(depth,weight,across,bar,sectionWeight=0,deposit=0){
 const u=Math.max(0,Math.min(1,Math.abs(across)));
 const shallow=C.toe*(1-smooth(C.lip,1,u))+depth*(1-smooth(C.start,1,u))*(1-C.bar*bar*smooth(C.barStart,C.barEnd,u));
 const old=mix(C.toe+depth*Math.max(0,1-u*u),shallow,weight);
 if(sectionWeight<=0)return old;
 // Nonzero contact slope on a cut bank. A real inside-bend point bar alone
 // receives the broad shallow profile; straight reaches do not get two shelves.
 const cut=(depth+C.toe)*(1-u*u*u*u);
 const point=C.toe*(1-smooth(C.lip,1,u))+depth*(1-smooth(C.start,1,u))*(1-C.bar*smooth(C.barStart,C.barEnd,u));
 return mix(old,mix(cut,point,deposit),sectionWeight);
}
const f=n=>Number.isInteger(n)?n+'.0':String(n);
export const RIVER_BED_GLSL=`
float riverBedDepth(float depth,float weight,float across,float bar,float sectionWeight,float deposit){
 float u=clamp(abs(across),0.0,1.0);
 float shallow=${f(C.toe)}*(1.0-smoothstep(${f(C.lip)},1.0,u))+depth*(1.0-smoothstep(${f(C.start)},1.0,u))*(1.0-${f(C.bar)}*bar*smoothstep(${f(C.barStart)},${f(C.barEnd)},u));
 float old=mix(${f(C.toe)}+depth*max(0.0,1.0-u*u),shallow,weight);
 if(sectionWeight<=0.0)return old;
 float cut=(depth+${f(C.toe)})*(1.0-u*u*u*u);
 float point=${f(C.toe)}*(1.0-smoothstep(${f(C.lip)},1.0,u))+depth*(1.0-smoothstep(${f(C.start)},1.0,u))*(1.0-${f(C.bar)}*smoothstep(${f(C.barStart)},${f(C.barEnd)},u));
 return mix(old,mix(cut,point,deposit),sectionWeight);
}`;
// + normal = (-flowZ,+flowX). A positive turn bends toward that + side.
export function bendDeposits(turn){const strength=smooth(.035,.27,Math.abs(turn));return {left:turn<0?strength:0,right:turn>0?strength:0};}
