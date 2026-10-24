import {buildExclusionNeighborhoods} from "./plant-exclusion-index.js";
export function cellRandom(x, z, salt = 0) {
  let h = Math.imul(x ^ 0x45d9f3b, 374761393) ^ Math.imul(z ^ salt, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function createForestExclusionIndex(world){
 const index={world};
    index.exclusions=new Map();
    for(const e of world.entities){const key=Math.floor(e.x/64)+","+Math.floor(e.z/64);if(!index.exclusions.has(key))index.exclusions.set(key,[]);index.exclusions.get(key).push(e);}
    index.exclusionNeighborhoods=buildExclusionNeighborhoods(index.exclusions);
    index.exclusionNeighborhoodsEnabled=new URLSearchParams(globalThis.location?.search||"").get("ecologyExclusionIndex")==="1";
    index.routeBins=new Map();
    for(const route of [...(world.objects.tracks||[]),...(world.objects.paths||[]),...(world.objects.boardwalks||[])])
      for(let j=0;j<(route.pts?.length||0)-1;j++){
        const a=route.pts[j],b=route.pts[j+1],radius=(route.width||1.5)/2+.35,segment={a,b,radius};
        for(let x=Math.floor((Math.min(a[0],b[0])-radius)/64);x<=Math.floor((Math.max(a[0],b[0])+radius)/64);x++)
          for(let z=Math.floor((Math.min(a[1],b[1])-radius)/64);z<=Math.floor((Math.max(a[1],b[1])+radius)/64);z++){
            const key=x+","+z;if(!index.routeBins.has(key))index.routeBins.set(key,[]);index.routeBins.get(key).push(segment);
          }
      }
 return index;
}
export function rootExcluded(index,x,z,padding=2,allowWetBank=false) {
    if(!allowWetBank&&index.world.hydrology?.isExcluded(x,z,padding))return true;
    const ix=Math.floor(x/64),iz=Math.floor(z/64);
    for(const route of index.routeBins.get(ix+","+iz)||[]){
      const dx=route.b[0]-route.a[0],dz=route.b[1]-route.a[1],len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((x-route.a[0])*dx+(z-route.a[1])*dz)/len)):0;
      if(Math.hypot(x-route.a[0]-t*dx,z-route.a[1]-t*dz)<route.radius)return true;
    }
    if(index.exclusionNeighborhoodsEnabled){
      // Exact source neighborhood, not an approximate footprint or cached boolean.
      for(const e of index.exclusionNeighborhoods.get(ix+","+iz)||[]){
      const pad=e.pad,hx=pad?.hx??(e.kind==="yurt"?4:12),hz=pad?.hz??7,c=Math.cos(e.rot||0),s=Math.sin(e.rot||0);
      const ux=(x-e.x)*c-(z-e.z)*s-(pad?.cx||0),uz=(x-e.x)*s+(z-e.z)*c-(pad?.cz||0);
      if(Math.abs(ux)<hx+padding&&Math.abs(uz)<hz+padding)return true;
      }
      return false;
    }
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const e of index.exclusions.get((ix+dx)+","+(iz+dz))||[]){
      const pad=e.pad,hx=pad?.hx??(e.kind==="yurt"?4:12),hz=pad?.hz??7,c=Math.cos(e.rot||0),s=Math.sin(e.rot||0);
      const ux=(x-e.x)*c-(z-e.z)*s-(pad?.cx||0),uz=(x-e.x)*s+(z-e.z)*c-(pad?.cz||0);
      if(Math.abs(ux)<hx+padding&&Math.abs(uz)<hz+padding)return true;
    }
    return false;
  }
export function originalForestRoot(index,ix,iz) {
    const x=(ix+.15+.7*cellRandom(ix,iz,1))*12,z=(iz+.15+.7*cellRandom(ix,iz,2))*12,cover=index.world.landcoverAt(x,z),density=smooth(.24,.8,cover.r);
    if(cellRandom(ix,iz,3)>density*.86||rootExcluded(index,x,z,3))return null;
    const y=index.world.surface.heightAt(x,z);if(y>3300)return null;
    return {id:"spruce:"+ix+":"+iz,x,y:y-.15,z,s:.72+cellRandom(ix,iz,4)*.76,rot:cellRandom(ix,iz,5)*Math.PI*2,variant:Math.floor(cellRandom(ix,iz,6)*5)};
  }
