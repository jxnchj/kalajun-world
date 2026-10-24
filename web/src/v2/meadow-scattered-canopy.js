// Toroidal irregular sites replace the former one-site-per-square canopy grid.
// Generation is CPU-only; existing shared RGBA texture, mips, grass-root lookup
// and four world projections remain unchanged. No camera/time-dependent noise.
function randomGenerator(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function scatteredCanopyField(period=53,seed=19){
 const random=randomGenerator(seed),bins=Array.from({length:period*period},()=>[]),wrap=x=>(x%period+period)%period;
 const minimum=.48,sites=period*period;
 let accepted=0,attempts=0;
 while(accepted<sites){
  if(++attempts>sites*40)throw new Error('Canopy site packing failed');
  const x=random()*period,z=random()*period,ix=Math.floor(x),iz=Math.floor(z);let clear=true;
  for(let dz=-1;dz<=1&&clear;dz++)for(let dx=-1;dx<=1&&clear;dx++)for(const p of bins[wrap(iz+dz)*period+wrap(ix+dx)]){
   const ax=Math.abs(p.x-x),az=Math.abs(p.z-z),sx=Math.min(ax,period-ax),sz=Math.min(az,period-az);
   if(sx*sx+sz*sz<minimum*minimum){clear=false;break;}
  }
  if(clear){bins[iz*period+ix].push({x,z,value:random()});accepted++;}
 }
 const sample=(u,v)=>{
  u=(u%period+period)%period;v=(v%period+period)%period;const ix=Math.floor(u),iz=Math.floor(v);let value=0,total=0;
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)for(const p of bins[wrap(iz+dz)*period+wrap(ix+dx)]){
   let x=p.x-u,z=p.z-v;if(x>period/2)x-=period;if(x<-period/2)x+=period;if(z>period/2)z-=period;if(z<-period/2)z+=period;
   const d=x*x+z*z;if(d>4)continue;
   // At 2 cells the Gaussian is < 2e-6; no visible cut or empty-neighbour hole.
   const w=Math.exp(-d/.3025);value+=p.value*w;total+=w;
  }
  if(!total)throw new Error('Uncovered canopy sample');
  return value/total;
 };
 sample.sites=accepted;return sample;
}
