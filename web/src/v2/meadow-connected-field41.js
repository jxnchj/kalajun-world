// Review-only replacement for radial moisture/maturity islands. Physical
// canopy G and blend A are copied byte-for-byte; geographic community weights,
// root positions, leaf geometry and all source histograms remain authoritative.
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const hash=(x,z,seed)=>{let h=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
function gradientField(period,seed){const wrap=i=>(i%period+period)%period;return(x,z)=>{const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=smooth(fx),v=smooth(fz);let sum=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const angle=hash(wrap(ix+i),wrap(iz+j),seed)*Math.PI*2,d=Math.cos(angle)*(fx-i)+Math.sin(angle)*(fz-j);sum+=d*(i?u:1-u)*(j?v:1-v);}return sum;};}
// Rank transfer copies the complete existing pigment distribution. This is an
// offline source operation, not a per-frame contrast/brightness correction.
function transferDistribution(raw,reference,channel,out){const order=Array.from({length:raw.length},(_,i)=>i).sort((a,b)=>raw[a]-raw[b]||a-b),hist=new Uint32Array(256);for(let i=channel;i<reference.length;i+=4)hist[reference[i]]++;let at=0;for(let value=0;value<256;value++)for(let n=0;n<hist[value];n++)out[order[at++]*4+channel]=value;}
export function createConnectedMeadowField41(reference,size=512){
 if(!(reference instanceof Uint8Array)||reference.length!==size*size*4)throw new TypeError('Meadow41 requires the complete RGBA source field');
 const out=reference.slice(),wet=new Float32Array(size*size),mature=new Float32Array(size*size);
 const broad=gradientField(2,411),community=gradientField(3,419),small=gradientField(4,421),local=gradientField(8,431),warpX=gradientField(2,439),warpZ=gradientField(2,443);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const u=(x+.5)/size,v=(z+.5)/size,dx=warpX(u*2,v*2),dz=warpZ(u*2,v*2),i=z*size+x;
  // Smooth toroidal drift creates connected masses rather
  // than one radial kernel per cell. These remain ecological source variation;
  // actual DEM aspect/hollows/forest edge are applied by the shared caller.
  const mass=.30*broad(u*2+dx*.55,v*2+dz*.55)+.46*community(u*3+dx*.8,v*3+dz*.8)+.24*small(u*4+dx*.6,v*4+dz*.6);
  wet[i]=mass;mature[i]=-.85*mass+.15*local(u*8+dx*.5,v*8+dz*.5);
 }
 transferDistribution(wet,reference,0,out);transferDistribution(mature,reference,2,out);return out;
}
