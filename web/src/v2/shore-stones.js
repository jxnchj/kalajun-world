import {applyShoreAssetReview42} from './shore-asset-review42-state.js';
import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { shoreScan } from "./shore-rock-data.js";
import { riverSectionAt, projectRiverSection, riverBankMaterialDistance } from "./river-section.js";
function random(id,seed=0){let h=2166136261^seed;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;}
const at=riverSectionAt;
function sourceWetness(source,x,z,t){
  const q=projectRiverSection(x,z,source,t),n=q.section,half=q.signed<0?n.left:n.right;
  const material=riverBankMaterialDistance(n,q.signed<0?-1:1,q.distance);
  const u=Math.max(0,Math.min(1,(material-half*.65)/(n.outer-half*.65)));
  return 1-u*u*(3-2*u);
}
// Avalanche the local stone hash: adjacent suffixes in raw FNV are correlated
// enough to put two members of the same group almost on the very same root.
function stoneRandom(id,seed=0){let h=(random(id,seed)*4294967296)>>>0;h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^(h>>>16))>>>0)/4294967296;}
// These are the original fixed roots and sizes, measured from sourceWidth rather
// than the narrower designed water edge. Only the shared bed updates their seat.
function sourceShoreStones(world,s){
  const records=[];if(s.index%3!==1)return records;
  const source=s.meanderSource??s,id=s.id,r=random(id),t=.25+.5*random(id,1),n=at(source,t),fx=source.flowX,fz=source.flowZ;
  for(let side=-1;side<=1;side++){
    if(side===0&&r>.46)continue;
    const inWater=side===0,offset=inWater?(random(id,3)-.5)*n.sourceWidth*.55:side*(n.sourceWidth*.5+.14+random(id,4)*.9);
    const x=n.x-fz*offset,z=n.z+fx*offset,h=world.hydrology.sampleAt(x,z);
    // Original roots retain their identity if a small bend leaves them drier.
    // Actual seating, material wetness and wakes still follow the new terrain.
    const selectionWetness=s.meanderSource?sourceWetness(source,x,z,t):h.wetness;
    if(!inWater&&selectionWetness<.15)continue;
    const scale=(inWater?.25:.19)+random(id,5+side)*.42,ground=world.surface.heightAt(x,z);
    records.push({id:id+":"+side,x,z,y:ground+scale*.20,scale,sx:1.05+random(id,8),sy:.65+random(id,9)*.5,sz:.8+random(id,10),rot:random(id,11)*Math.PI*2,
      sourceSide:side,wet:h.insideWater||h.wetness>.5,wetness:h.wetness,ground,waterLevel:h.waterLevel??n.level,inWater:h.insideWater,level:h.waterLevel,flowX:s.meanderSource&&h.insideWater?h.flowX:fx,flowZ:s.meanderSource&&h.insideWater?h.flowZ:fz,
      wake:h.insideWater&&ground+scale*.2+scale*(.65+random(id,9)*.5)>h.waterLevel+.025});
  }
  return records;
}
function retainedShoreAnchor(world,s){
  // Retain the substantial root nearest each authored entrance; elsewhere leave
  // irregular empty stations. At most ONE source bank root survives per station.
  const entrance=(world.hydrology.viewpoints||[]).some(v=>v.segmentId.startsWith(s.lineId+":")&&Math.round((Number(v.segmentId.slice(s.lineId.length+1))-1)/3)*3+1===s.index);
  if(!entrance&&stoneRandom(s.id,30)<.37)return null;
  const volume=r=>r.scale**3*r.sx*r.sy*r.sz;
  const choices=sourceShoreStones(world,s).filter(r=>r.sourceSide!==0&&r.scale>.38&&volume(r)>.085).sort((a,b)=>volume(b)-volume(a));
  if(!choices.length)return null;
  const r=choices[!entrance&&choices.length>1&&stoneRandom(s.id,33)<.42?1:0];
  return {...r,role:"anchor",sourceAnchor:true};
}
// Fixed chainage groups have unequal gaps and explicit along-bank spacing.
// Their secondary stones accompany retained major roots and the finer gravel.
function naturalShoreStones(world,s){
  const records=[],spacing=12,start=s.a.distance,end=s.b.distance;
  for(let k=Math.floor(start/spacing);k<=Math.floor(end/spacing);k++){
    const station=s.lineId+":bank:"+k,d=(k+.08+.84*stoneRandom(station,1))*spacing;
    if(d<start||d>=end||stoneRandom(station,11)>.76)continue;
    const side=stoneRandom(station,2)<.5?-1:1,count=2+(stoneRandom(station,3)>.67?1:0),n=at(s,(d-start)/(end-start));
    for(let j=0;j<count;j++){
      const id=station+":"+j,inChannel=j===2,half=side<0?n.left:n.right;
      const offset=inChannel?(stoneRandom(id,4)-.5)*n.width*.70:side*(half+.08+stoneRandom(id,4)*.78);
      const along=j===1?(stoneRandom(station,12)<.5?-1:1)*(.5+.75*stoneRandom(id,8)):(stoneRandom(id,8)-.5)*.3;
      const x=n.x-n.fz*offset+n.fx*along,z=n.z+n.fx*offset+n.fz*along,h=world.hydrology.sampleAt(x,z);if(h.wetness<.12)continue;
      const scale=j===1?.09+stoneRandom(id,5)*.14:.19+Math.pow(stoneRandom(id,5),1.7)*.24,sy=.42+stoneRandom(id,6)*.43,ground=world.surface.heightAt(x,z);
      records.push({id,x,z,y:ground+scale*.20,scale,sx:1.15+stoneRandom(id,7)*.8,sy,sz:.75+stoneRandom(id,9)*.6,
        role:j===1?"fragment":"secondary",rot:Math.atan2(n.fx,n.fz)+(stoneRandom(id,10)-.5)*1.4,wet:h.insideWater||h.wetness>.5,wetness:h.wetness,ground,
        waterLevel:h.waterLevel??n.level,inWater:h.insideWater,level:h.waterLevel,flowX:n.fx,flowZ:n.fz,
        wake:h.insideWater&&ground+scale*.20+scale*sy>h.waterLevel+.025});
    }
  }
  return records;
}
export function createShoreStones(world,segments){
  const records=[];
  for(const s of segments){
    if(!s.naturalBanks){records.push(...sourceShoreStones(world,s));continue;}
    const anchor=retainedShoreAnchor(world,s);if(anchor)records.push(anchor);
    for(const r of naturalShoreStones(world,s)){
      if(anchor&&Math.hypot(r.x-anchor.x,r.z-anchor.z)<.7*(anchor.scale*Math.max(anchor.sx,anchor.sz)+r.scale))continue;
      records.push(r);
    }
  }
  return applyShoreAssetReview42(records);
}
// A welded low-cost river pebble: smooth normals across the original triangle seams,
// but asymmetric erosion preserves a stone silhouette rather than a perfect sphere.
export const SHORE_ROCK_CREASE_ANGLE=35*Math.PI/180;
export function createRiverPebbleGeometry({creaseAngle=SHORE_ROCK_CREASE_ANGLE}={}){
  const source=new THREE.IcosahedronGeometry(1,2);
  source.deleteAttribute("normal");source.deleteAttribute("uv");
  const g=mergeVertices(source,1e-5);source.dispose();
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const broad=.075*Math.sin(x*3.1+y*1.8-z*2.2)+.045*Math.sin(x*5.7-y*3.3+z*1.9);
    // A few weathered fracture planes break the inflated ellipsoid silhouette.
    // Keep the welded 180-triangle budget and smooth worn edges.
    const f=Math.min(1+broad,.80/Math.max(.001,.86*x+.43*y+.28*z),.87/Math.max(.001,-.32*x+.82*y+.47*z),.84/Math.max(.001,.15*x-.52*y-.84*z));
    const ledge=.025*Math.sin(y*8.4+x*2.8+z)*(1-y*y);
    p.setXYZ(i,x*(f+ledge)+.035*y*z,y*(f*.93)+.025*Math.sin(x*4+z*3)*(1-y*y),z*(f+.045*x+ledge));
  }
  let top=0;for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));
  for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)/top); // Unit top preserves the physical exposed-stone/wake contract.
  p.needsUpdate=true;g.computeVertexNormals();
  // Only normal continuity changes: the same 180 triangles and physical shell
  // serve rendering and contact. Worn regions remain smooth; fracture edges
  // above 35 degrees retain a distinct lighting response.
  const creased=toCreasedNormals(g,creaseAngle),result=mergeVertices(creased,1e-5);
  g.dispose();creased.dispose();result.computeBoundingBox();result.computeBoundingSphere();return result;
}

// The scanned shell retains real fracture planes, eroded corners and UV detail.
// It is synchronous so rendering and vegetation contact always share one shape.
export function createShoreRockGeometry(){
  const g=new THREE.BufferGeometry();
  for(const [name,size] of [["position",3],["normal",3],["uv",2]])
    g.setAttribute(name,new THREE.Float32BufferAttribute(shoreScan[name],size));
  g.setIndex(shoreScan.index);g.normalizeNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}

// This exact transform is used by both the renderer and plant contact geometry.
export function shoreStoneMatrix(record,target=new THREE.Matrix4()){
 if(record.shoreAsset42){const original=shoreStoneMatrix({...record,shoreAsset42:null});const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();original.decompose(p,q,s);const scale=Math.min(Math.abs(s.x),Math.abs(s.z));target.compose(p,q,new THREE.Vector3(scale,scale,scale));record.shoreAsset42.originalGeometry??=createShoreRockGeometry();const oldLow=record.shoreAsset42.originalGeometry.boundingBox.clone().applyMatrix4(original).min.y,newLow=record.shoreAsset42.geometry.boundingBox.clone().applyMatrix4(target).min.y;target.elements[13]+=oldLow-newLow;return target;}
 const p=record,q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.12*random(p.id,2),p.rot,.18*random(p.id,3)));
 return target.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.scale*p.sx,p.scale*p.sy,p.scale*p.sz));
}
