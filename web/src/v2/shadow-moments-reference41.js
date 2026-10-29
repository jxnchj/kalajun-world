// CPU depth predictor for the independent moments experiment. Same DEM, no GPU
// geometry pass. Values are local light-depth offsets, not replacement geometry.
import {Vector3,Vector4} from 'three';
export const MOMENT_REFERENCE_GRID41=17;
export function buildMomentReference41(data,sun,span,range,offset=0){
 const n=MOMENT_REFERENCE_GRID41,packed=Array.from({length:Math.ceil(n*n/4)},()=>new Vector4()),up=new Vector3(0,1,0),right=new Vector3().crossVectors(up,sun).normalize();up.crossVectors(sun,right).normalize();
 const height=(x,z)=>{const fx=Math.max(0,Math.min(data.N-1e-6,(x/data.size+.5)*data.N)),fz=Math.max(0,Math.min(data.N-1e-6,(z/data.size+.5)*data.N)),ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz,h=(a,b)=>data.positions[(b*(data.N+1)+a)*3+1];return(h(ix,iz)*(1-tx)+h(ix+1,iz)*tx)*(1-tz)+(h(ix,iz+1)*(1-tx)+h(ix+1,iz+1)*tx)*tz;};
 let maxResidual=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const base=right.clone().multiplyScalar((x/(n-1)-.5)*span).addScaledVector(up,(y/(n-1)-.5)*span),p=base.clone();let t=0;for(let k=0;k<8;k++){p.copy(base).addScaledVector(sun,-t);t+=(p.y-height(p.x,p.z))/sun.y;}p.copy(base).addScaledVector(sun,-t);maxResidual=Math.max(maxResidual,Math.abs(p.y-height(p.x,p.z)));packed[Math.floor((y*n+x)/4)].setComponent((y*n+x)%4,(-p.dot(sun)+offset)/range);}
 return{packed,maxResidual,grid:n,scope:'actual DEM bilinear predictor; shader still renders every real occluder'};
}
export const momentReferenceGLSL41=`
uniform vec4 momentReference41[73];
float refValue41(ivec2 p){int i=p.y*17+p.x;return momentReference41[i/4][i-4*(i/4)];}
float depthReference41(vec2 uv){vec2 p=clamp(uv,0.,1.)*16.;ivec2 a=ivec2(min(floor(p),vec2(15.)));vec2 f=p-vec2(a);return mix(mix(refValue41(a),refValue41(a+ivec2(1,0)),f.x),mix(refValue41(a+ivec2(0,1)),refValue41(a+ivec2(1,1)),f.x),f.y);}
`;
