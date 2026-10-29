// OFF-only local design: left ordinary bank opposite inlet-outer-pool.
export const REACH_BANK48={side:-1,lo:-11.1,hi:-7.6,center:-9.35,radius:1.75};
export const reachBank48Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('reachBankProfile48')==='left-hermite';
export function reachBank48Weight(offset,side,rootBank=0){
 if(side!==-1||rootBank!==0||offset<=REACH_BANK48.lo||offset>=REACH_BANK48.hi)return 0;
 const x=(offset-REACH_BANK48.center)/REACH_BANK48.radius;return (1-x*x)**3;
}
export function reachBank48Height(original,{offset,side,rootBank,gap,span,level,anchor}){
 const weight=reachBank48Weight(offset,side,rootBank);
 if(!weight||!anchor||!(span>0)||!(anchor.height>level)||!Number.isFinite(anchor.slope))return original;
 const t=Math.max(0,Math.min(1,gap/span)),rise=anchor.height-level;
 // Reject non-monotone source endpoint conditions; never silently clamp a
 // surveyed/actual endpoint derivative merely to make the candidate work.
 if(anchor.slope<0||anchor.slope>3*rise/span)return original;
 const curve=level+(-2*t*t*t+3*t*t)*rise+(t*t*t-t*t)*span*anchor.slope;
 return original+(curve-original)*weight;
}
