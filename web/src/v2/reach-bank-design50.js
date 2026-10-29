// OFF-only local design; no change to water boundary or tree protection.
export const reachBankDesign50Enabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('reachBankDesign50')==='root-pool';
const bell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
export function applyReachBankDesign50(p,offset,side){
 const root=bell((offset-1.5)/1.9),pool=bell((offset+2.2)/3);
 if(side===1){p.height+=.10*root;p.run+=.14*root;}
 p.depth+=.05*pool;
 // One scoured outer pool and opposite submerged shelf, not two raised kerbs.
 if(side===-1)p.shelf*=1-.8*pool;
 else p.shelf=Math.max(p.shelf,.75*pool);
 return p;
}
