import * as THREE from "three";
import {createShoreStones,createShoreRockGeometry,shoreStoneMatrix} from "./shore-stones.js";
export const SHORE_PLANT_MAX_SHIFT=4.8;
const TILE=24,MAX_TILES=196,SLAB=.12,fields=new WeakMap();
const hash=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),2246822507);return ((h^(h>>>13))>>>0)/4294967296;};
function hull(points){
 const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),p=[];
 for(const q of sorted)if(!p.length||Math.abs(q[0]-p.at(-1)[0])+Math.abs(q[1]-p.at(-1)[1])>1e-8)p.push(q);
 if(p.length<3)return p;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lo=[],hi=[];
 for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}
 for(const q of [...p].reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=0)hi.pop();hi.push(q);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function clipY(poly,y,above){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=above?a[1]>=y:a[1]<=y,ib=above?b[1]>=y:b[1]<=y;
  if(ia)out.push(a);if(ia!==ib){const t=(y-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t]);}}
 return out;
}
function addGeometrySlabs(bins,g,matrix=null,wind=false){
 const p=g.attributes.position,w=g.attributes.aPlantWind,index=g.index,point=new THREE.Vector3(),verts=[];
 for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);if(matrix)point.applyMatrix4(matrix);verts.push(point.toArray());}
 const count=index?.count??p.count;
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),tri=ids.map(j=>verts[j]),lo=Math.min(...tri.map(v=>v[1])),hi=Math.max(...tri.map(v=>v[1]));
  const wx=wind&&w?Math.max(...ids.map(j=>w.getX(j))):0,wy=wind&&w?Math.max(...ids.map(j=>w.getY(j))):0;
  // Upper bound of the existing herb shader's shared gust + recoil + eddy.
  const sway=wind?.43*wx*wx+.11*wy:0;
  for(let k=Math.floor(lo/SLAB);k<=Math.floor(hi/SLAB);k++){
   const clipped=clipY(clipY(tri,k*SLAB,true),(k+1)*SLAB,false);if(!clipped.length)continue;
   if(!bins.has(k))bins.set(k,{lo:k*SLAB,hi:(k+1)*SLAB,points:[],sway:0});
   const b=bins.get(k);b.points.push(...clipped.map(v=>[v[0],v[2]]));b.sway=Math.max(b.sway,sway);
  }
 }
}
function finishSlabs(bins){return [...bins.values()].map(b=>({...b,polygon:hull(b.points),points:undefined})).sort((a,b)=>a.lo-b.lo);}
export function createPlantEnvelope(geometries,{wind=true}={}){
 const bins=new Map();for(const g of geometries)addGeometrySlabs(bins,g,null,wind);
 const slabs=finishSlabs(bins),radius=Math.max(0,...slabs.flatMap(b=>b.polygon.map(p=>Math.hypot(...p)+b.sway+.015)));
 return {slabs,radius};
}
export function createShoreStoneCollider(record,geometry){
 const matrix=shoreStoneMatrix(record),bins=new Map();addGeometrySlabs(bins,geometry,matrix);
 if(!geometry.boundingBox)geometry.computeBoundingBox();
 const slabs=finishSlabs(bins),box=geometry.boundingBox.clone().applyMatrix4(matrix);
 return {record,slabs,box};
}
// Same height-sliced physical shell used for shore stones; also accepts exact
// original architectural meshes without replacing them by a clearing rectangle.
export function createPlantGeometryCollider(geometry,matrix){
 const bins=new Map();addGeometrySlabs(bins,geometry,matrix);geometry.computeBoundingBox();
 return {slabs:finishSlabs(bins),box:geometry.boundingBox.clone().applyMatrix4(matrix)};
}
function overlap2D(a,b,padding){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(len<1e-10)continue;
  const nx=-dz/len,nz=dx/len;let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const p of a){const d=p[0]*nx+p[1]*nz;amin=Math.min(amin,d);amax=Math.max(amax,d);}
  for(const p of b){const d=p[0]*nx+p[1]*nz;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax+padding<bmin||bmax+padding<amin)return false;
 }
 return true;
}
function placedSlabs(root,envelope){
 const c=Math.cos(root.rot||0),s=Math.sin(root.rot||0),scale=root.s??1,sy=root.sy??scale;
 return envelope.slabs.map(b=>({lo:root.y+(b.lo-.55*b.sway*b.sway)*sy,hi:root.y+b.hi*sy,padding:b.sway*scale+.015,
  polygon:b.polygon.map(([x,z])=>[root.x+(c*x+s*z)*scale,root.z+(-s*x+c*z)*scale])}));
}
export function plantIntersectsStone(root,envelope,collider,placed=null){
 const radius=envelope.radius*(root.s??1),b=collider.box;
 if(root.x+radius<b.min.x||root.x-radius>b.max.x||root.z+radius<b.min.z||root.z-radius>b.max.z)return false;
 const slices=placed??placedSlabs(root,envelope);
 for(const a of slices)for(const b of collider.slabs)if(a.hi>=b.lo&&a.lo<=b.hi&&overlap2D(a.polygon,b.polygon,a.padding))return true;
 return false;
}
class ShoreStoneField{
 constructor(world){this.world=world;this.tiles=new Map();this.stats={builtTiles:0,evictedTiles:0,collidersBuilt:0,colliderHits:0,maxTiles:MAX_TILES};this.colliders=new Map();this.geometry=null;}
 tile(ix,iz){
  const key=ix+","+iz;let items=this.tiles.get(key);if(items){this.tiles.delete(key);this.tiles.set(key,items);return items;}
  const x=(ix+.5)*TILE,z=(iz+.5)*TILE,h=this.world.hydrology;
  if(!h?.nearSegments){items=[];}else{
   // Source channels are at most 14m wide. Include the outer bank offset,
   // the widest tilted stone and group along-offset beyond the tile diagonal.
   const records=createShoreStones(this.world,h.nearSegments(x,z,TILE*.72+12)),bounds={minX:ix*TILE,maxX:(ix+1)*TILE,minZ:iz*TILE,maxZ:(iz+1)*TILE};
   if(records.length&&!this.geometry)this.geometry=createShoreRockGeometry();
   const touchesTile=box=>box.max.x>=bounds.minX&&box.min.x<=bounds.maxX&&box.max.z>=bounds.minZ&&box.min.z<=bounds.maxZ;
   // Cull with the exact same transformed bounding box before slicing the
   // scanned shell. The query is deliberately wider than this tile, so most
   // returned records do not need a collider yet. Boundary stones stay included.
   items=[];
   for(const r of records){
    let c=this.colliders.get(r.id);
    const box=c?.box??this.geometry.boundingBox.clone().applyMatrix4(shoreStoneMatrix(r));
    if(!touchesTile(box))continue;
    if(c){this.colliders.delete(r.id);this.stats.colliderHits++;}
    else {c=createShoreStoneCollider(r,this.geometry);this.stats.collidersBuilt++;}
    this.colliders.set(r.id,c);while(this.colliders.size>1024)this.colliders.delete(this.colliders.keys().next().value);
    items.push(c);
   }
  }
  this.tiles.set(key,items);this.stats.builtTiles++;while(this.tiles.size>MAX_TILES){this.tiles.delete(this.tiles.keys().next().value);this.stats.evictedTiles++;}return items;
 }
 near(x,z,radius){
  if(!this.world.hydrology?.nearSegments)return [];
  const found=new Map();for(let iz=Math.floor((z-radius)/TILE);iz<=Math.floor((z+radius)/TILE);iz++)for(let ix=Math.floor((x-radius)/TILE);ix<=Math.floor((x+radius)/TILE);ix++)
   for(const c of this.tile(ix,iz))if(c.box.max.x>=x-radius&&c.box.min.x<=x+radius&&c.box.max.z>=z-radius&&c.box.min.z<=z+radius)found.set(c.record.id,c);
  return [...found.values()];
 }
 intersects(root,envelope){
  const nearby=this.near(root.x,root.z,envelope.radius*(root.s??1));if(!nearby.length)return false;
  const placed=placedSlabs(root,envelope);return nearby.some(c=>plantIntersectsStone(root,envelope,c,placed));
 }
 dispose(){this.geometry?.dispose();this.geometry=null;this.tiles.clear();this.colliders.clear();}
}
export function getShoreStoneField(world){let field=fields.get(world);if(!field){field=new ShoreStoneField(world);fields.set(world,field);}return field;}
export function releaseShoreStoneField(world){const field=fields.get(world);if(field){field.dispose();fields.delete(world);}}
// Preserve source identity, kind, scale and source-tile ownership. Search a small,
// deterministic neighbourhood only when actual swept plant geometry hits a rock.
export function relocateShorePlant(world,root,envelope,suitable=()=>true){
 const field=getShoreStoneField(world);if(!field.intersects(root,envelope))return root;
 const offsetY=root.y-world.surface.heightAt(root.x,root.z),phase=hash(root.id)*Math.PI*2;
 for(const radius of [.20,.35,.55,.8,1.1,1.45,1.85,2.3,2.8,3.4,4.1,SHORE_PLANT_MAX_SHIFT]){
  const count=16;for(let j=0;j<count;j++){
   const a=phase+j*Math.PI*2/count,x=root.x+Math.cos(a)*radius,z=root.z+Math.sin(a)*radius;
   if(!suitable(x,z))continue;
   const y=world.surface.heightAt(x,z)+offsetY;if(!Number.isFinite(y))continue;
   const moved={...root,x,y,z};if(!field.intersects(moved,envelope))return {...moved,shoreMove:radius};
  }
 }
 // Keep the original plant budget and expose a genuine unresolved site, rather
 // than silently delete it or claim that an impossible local placement succeeded.
 return {...root,shoreUnresolved:true};
}
