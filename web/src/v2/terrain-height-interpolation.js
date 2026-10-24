// Shape-preserving DEM reconstruction. Source samples remain authoritative;
// interpolated slopes need not jump at every 10 m raster-cell boundary.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const tangent=(a,b)=>a*b>0?2*a*b/(a+b):0;
export function monotoneHeight(a,b,c,d,t){
  const m=tangent(b-a,c-b),n=tangent(c-b,d-c),u=t*t,v=u*t;
  return (2*v-3*u+1)*b+(v-2*u+t)*m+(-2*v+3*u)*c+(v-u)*n;
}
export function sampleMonotoneHeight(r,x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('World coordinates must be finite');
  const u=clamp((x-r.x0)/r.res-.5,0,r.n-1),v=clamp((z-r.z0)/r.res-.5,0,r.n-1);
  const ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz;
  // Four rows; scalar arithmetic avoids allocation on frequent terrain queries.
  const row=j=>{const y=clamp(j,0,r.n-1)*r.n;
    const at=i=>r.data[y+clamp(i,0,r.n-1)];
    return monotoneHeight(at(ix-1),at(ix),at(ix+1),at(ix+2),tx);};
  return monotoneHeight(row(iz-1),row(iz),row(iz+1),row(iz+2),tz);
}

// Existing authored buildings, entry stonework and GI use the original ground.
// Protect each complete source footprint plus its construction apron; transition
// outside that apron, rather than moving assets or weakening their source guard.
export function createAuthoredHeightProtection(entities,assets){
  const bins=new Map(),cell=128,apron=32,release=24;
  for(const e of entities){
    const b=assets[e.assetId]?.bounds,p=assets[e.assetId]?.pad;
    const radius=Math.max(
      b?Math.hypot(Math.max(Math.abs(b.min[0]),Math.abs(b.max[0]))*e.scale.x,Math.max(Math.abs(b.min[2]),Math.abs(b.max[2]))*e.scale.z):0,
      p?Math.hypot((Math.abs(p.cx)+p.hx)*e.scale.x,(Math.abs(p.cz)+p.hz)*e.scale.z):0,
      Math.hypot(e.source?.w||0,e.source?.d||0)*.5,e.source?.r||0)+apron;
    const item={x:e.x,z:e.z,radius};
    for(let x=Math.floor((e.x-radius-release)/cell);x<=Math.floor((e.x+radius+release)/cell);x++)
      for(let z=Math.floor((e.z-radius-release)/cell);z<=Math.floor((e.z+radius+release)/cell);z++){
        const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item);
      }
  }
  return (x,z)=>{
    let weight=1;
    for(const p of bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){
      const q=clamp((Math.hypot(x-p.x,z-p.z)-p.radius)/release,0,1);
      weight=Math.min(weight,q*q*(3-2*q));if(weight===0)return 0;
    }
    return weight;
  };
}
