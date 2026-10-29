// Falsification only: known terrain endpoint is an additional geometric fact,
// not free information in four moments. This script does not change rendering.
import {writeFileSync} from 'node:fs';
import {DataUtils} from '../web/node_modules/three/build/three.module.js';
const half=x=>DataUtils.fromHalfFloat(DataUtils.toHalfFloat(x));
function encode(depths,q=x=>x){const per=depths.map(d=>[1,2,3,4].map(k=>q((d/64*16)**k)));return[0,1,2,3].map(j=>q(per.reduce((s,v)=>s+v[j],0)/per.length)/(16/64)**(j+1));}
function radau(m,t){const [b1,b2,b3,b4]=m,det=b2*b2-b1*b3;
 if(Math.abs(b1)<1e-16)return{v:t<=0?1:0,nodes:[0],weights:[1]};
 if(Math.abs(det)<Math.max(1e-20,.000001*b2*b2)){const r=b2/b1,w=b1/r;return{v:(r>=t?w:0)+(0>=t?1-w:0),nodes:[r,0],weights:[w,1-w]};}
 const a=(b1*b4-b2*b3)/det,b=(b3*b3-b2*b4)/det,disc=a*a-4*b;
 if(disc<0)return{error:'negative discriminant'};const q=-.5*(a+(a<0?-1:1)*Math.sqrt(disc)),roots=[q,b/q].sort((a,b)=>a-b),[r1,r2]=roots,w1=(b2-b1*r2)/(r1*(r1-r2)),w2=(b2-b1*r1)/(r2*(r2-r1)),w0=1-w1-w2;
 return{v:(r1>=t?w1:0)+(r2>=t?w2:0)+(0>=t?w0:0),nodes:[r1,r2,0],weights:[w1,w2,w0]};
}
const cases=[{name:'leaf-ground',depths:[-.3,0,0,0],t:-.008},{name:'two-leaf-ground',depths:[-.1,-.4,0,0],t:-.008},{name:'three-leaf-ground',depths:[-.1,-.2,-.4,0],t:-.008},{name:'four-leaf-blocked',depths:[-.1,-.2,-.4,-.8],t:-.008},{name:'low-leaf-biased-ground',depths:[-.06,-.1,-.4,0],t:-.04},{name:'mixed-very-low-leaf',depths:[-.02,-.06,-.1,0],t:-.04}];
const rows=[];for(const c of cases)for(const [format,q]of[['exact',x=>x],['float',Math.fround],['half',half]])for(const predictorError of[0,.005,-.005,.02,-.02]){const depths=c.depths.map(x=>x+predictorError),t=c.t+predictorError;rows.push({case:c.name,format,predictorError,expected:depths.filter(d=>d>=t).length/4,...radau(encode(depths,q),t)});}
const report={scope:'Known exact ground upper endpoint 0; perturbed cases explicitly violate that assumption and test sensitivity. Not a production correction.',rows};writeFileSync(new URL('./reports/shadow-moments41-bounded.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(rows.filter(r=>r.predictorError===0));
