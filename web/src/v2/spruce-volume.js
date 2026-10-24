import * as THREE from 'three';
import {createFarSpruceGeometry} from './spruce-geometry.js';
const WIDTHS={position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1};
export const spruceVolumeEnabled=()=>new URLSearchParams(globalThis.location?.search||'').get('spruceVolume')!=='0';
// Source UV domains are partitioned, never duplicated: no added crossing photo
// cards or removed texels. Endpoints and branch identities remain authored.
function sourceCounts(source,mid){
 const ix=source.index?.array,uv=source.attributes.uv?.array;if(!ix||!uv)throw Error('Spruce volume requires indexed source controls');
 const counts=[];let offset=0;
 while(offset<ix.length){const dv=Math.abs(uv[ix[offset]*2+1]-uv[ix[offset+2]*2+1]);const n=mid?4:Math.abs(dv-.5)<1e-5?10:Math.abs(dv-1)<1e-5?6:0;if(!n||offset+n*3>ix.length)throw Error('Spruce volume source topology changed');counts.push(n);offset+=n*3;}return counts;
}
// Exact complete-attribute indexing: unlike positional welding this cannot
// merge a UV seam, wind phase, normal, AO or readiness boundary.
export function indexSpruceVolume(g, patches, {merge=true,audit=false}={}){
 const attrs=Object.entries(g.attributes).map(([name,a])=>({name,a,size:a.itemSize,bits:new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length)})),count=g.attributes.position.count,heads=new Map(),next=new Int32Array(count).fill(-1),unique=new Uint32Array(count),indices=new Uint32Array(count);let uniqueCount=0;
 const equal=(a,b)=>{for(const x of attrs)for(let k=0;k<x.size;k++)if(x.bits[a*x.size+k]!==x.bits[b*x.size+k])return false;return true;};
 for(let i=0;i<count;i++){let hash=2166136261;for(const x of attrs)for(let k=0;k<x.size;k++)hash=Math.imul(hash^x.bits[i*x.size+k],16777619)>>>0;let j=heads.get(hash)??-1;while(j>=0&&!equal(i,unique[j]))j=next[j];if(j<0){j=uniqueCount++;unique[j]=i;next[j]=heads.get(hash)??-1;heads.set(hash,j);}indices[i]=j;}
 const value=(id,key,k)=>g.attributes[key].array[unique[id]*g.attributes[key].itemSize+k],result=[],outPatches=[],errors=Object.fromEntries(attrs.map(x=>[x.name,0]));let removed=0;
 const canRemove=(x,a,b)=>{
  const d=[0,1,2].map(k=>value(b,'position',k)-value(a,'position',k)),v=[0,1,2].map(k=>value(x,'position',k)-value(a,'position',k)),l=d.reduce((n,z)=>n+z*z,0);if(l<1e-12)return false;const t=d.reduce((n,z,k)=>n+z*v[k],0)/l;if(t<=1e-6||t>=1-1e-6)return false;
  const current={};for(const{name,size}of attrs){let max=0;for(let k=0;k<size;k++){const expected=value(a,name,k)*(1-t)+value(b,name,k)*t,actual=value(x,name,k),e=Math.abs(actual-expected);if(e>(name==='position'?1.2e-6:name==='normal'?2e-6:3e-7))return false;max=Math.max(max,e);}current[name]=max;}for(const k in current)errors[k]=Math.max(errors[k],current[k]);return true;
 };
 const cross=(a,b,c)=>{const u=[0,1,2].map(k=>value(b,'position',k)-value(a,'position',k)),v=[0,1,2].map(k=>value(c,'position',k)-value(a,'position',k));return[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
 for(const[start,end]of patches){const tris=[];for(let i=start;i<end;i+=3)tris.push(Array.from(indices.subarray(i,i+3)));if(merge){let changed=true;while(changed){changed=false;search:for(let i=0;i<tris.length;i++)for(let j=i+1;j<tris.length;j++){
   const a=tris[i],b=tris[j],shared=a.filter(k=>b.includes(k));if(shared.length!==2)continue;const outsideA=a.find(k=>!shared.includes(k)),outsideB=b.find(k=>!shared.includes(k));for(const x of shared){if(!canRemove(x,outsideA,outsideB))continue;const pivot=shared.find(k=>k!==x),n=cross(...a),m=cross(pivot,outsideA,outsideB);if(n.reduce((v,k,q)=>v+k*m[q],0)<0)tris[i]=[pivot,outsideB,outsideA];else tris[i]=[pivot,outsideA,outsideB];tris.splice(j,1);removed++;changed=true;break search;}
  }}}
  const begin=result.length;for(const tri of tris)result.push(...tri);if(audit)outPatches.push([begin,result.length]);
 }
 // Remove only vertices made unused by the proved coplanar merge. All kept
 // rows are byte copies of the previous candidate; no coordinate quantization.
 // Vertex IDs are dense integers. Reuse bounded tables instead of allocating
 // a Map entry and five typed subarray views for every retained vertex. Copy
 // the Float32 bit patterns directly, preserving signed zero and every seam.
 const used=new Int32Array(uniqueCount).fill(-1),rows=new Uint32Array(uniqueCount);let rowCount=0;
 for(let i=0;i<result.length;i++){const old=result[i];if(used[old]<0){used[old]=rowCount;rows[rowCount++]=unique[old];}result[i]=used[old];}
 for(const{name,a,size,bits}of attrs){const data=new Float32Array(rowCount*size),copy=new Uint32Array(data.buffer);for(let i=0;i<rowCount;i++){const src=rows[i]*size,dst=i*size;for(let k=0;k<size;k++)copy[dst+k]=bits[src+k];}g.setAttribute(name,new THREE.BufferAttribute(data,size,a.normalized));}
 g.setIndex(new THREE.BufferAttribute(rowCount<=65535?Uint16Array.from(result):Uint32Array.from(result),1));
 const report={beforeVertices:count,afterVertices:rowCount,beforeTriangles:count/3,afterTriangles:result.length/3,coplanarTrianglesRemoved:removed,maximumMergeAttributeError:errors,indexBytes:g.index.array.byteLength};if(audit)report.patches=outPatches;return report;
}
export function createVolumeSpruceFoliage(source,{mid=false,form=null,branchDetail=null,optimize=true,merge=true,audit=false,reuse=new URLSearchParams(globalThis.location?.search||'').get('crownBuildReuse')!=='0'}={}){
 const counts=form?.sourceTriangles||sourceCounts(source,mid),removed=new Set(form?.instances.map(r=>r.cluster)||[]),out=Object.fromEntries(Object.keys(WIDTHS).map(k=>[k,[]])),spray=branchDetail?[]:null,ix=source.index.array;const patches=[];let offset=0,clusters=0,maxShift=0,retainedSourceTriangles=0;
 // Source rows and transformed triangle corners are immutable within a cluster.
 // Reuse those exact values, preserving arithmetic, emission order and indexing.
 const fields=Object.entries(WIDTHS),sourceFields=fields.map(([key,width])=>({key,width,data:source.attributes[key].array}));
 const sourceRows=reuse?new Array(source.attributes.position.count):null;
 const readRow=reuse?i=>{const row={};for(const {key,width,data}of sourceFields){const values=new Array(width);for(let k=0;k<width;k++)values[k]=data[i*width+k];row[key]=values;}return row;}:i=>Object.fromEntries(Object.entries(WIDTHS).map(([k,w])=>[k,Array.from(source.attributes[k].array.subarray(i*w,(i+1)*w))]));
 const read=i=>sourceRows?(sourceRows[i]??=readRow(i)):readRow(i);
 // A UV cut can be emitted by both half-planes and adjacent triangles.
 // Cache only the same directed endpoints and exact t; reversing an edge may
 // have different floating-point rounding and must keep its own result.
 const intersections=reuse?new Map():null;
 const blend=(a,b,t)=>{
  if(!reuse)return Object.fromEntries(Object.keys(WIDTHS).map(k=>[k,a[k].map((v,j)=>v+(b[k][j]-v)*t)]));
  let ends=intersections?.get(a),cached=ends?.get(b);if(cached&&cached.t===t)return cached.value;
  const value={};for(const [key]of fields)value[key]=a[key].map((v,j)=>v+(b[key][j]-v)*t);
  if(intersections){if(!ends){ends=new Map();intersections.set(a,ends);}ends.set(b,{t,value});}return value;
 };
 const clip=(poly,sign)=>{const list=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a.uv[1]-.5),db=sign*(b.uv[1]-.5);if(da>=-1e-8)list.push(a);if(da*db< -1e-12)list.push(blend(a,b,da/(da-db)));}return list;};
 for(let cluster=0;cluster<counts.length;cluster++){
  const n=counts[cluster],indices=Array.from(ix.subarray(offset,offset+n*3));offset+=n*3;if(removed.has(cluster))continue;clusters++;retainedSourceTriangles+=n;
  const vertices=indices.map(read),point=v=>new THREE.Vector3(...v.position),root=mid?point(vertices[0]).add(point(vertices[1])).multiplyScalar(.5):point(vertices[0]),tip=mid?point(vertices[2]).add(point(vertices[5])).multiplyScalar(.5):point(vertices[n===10?11:5]),axis=tip.clone().sub(root);const length=axis.length();if(length<.01)throw Error('Degenerate spruce branch axis');axis.divideScalar(length);
  const lateral=point(vertices[1]).sub(root);lateral.addScaledVector(axis,-lateral.dot(axis)).normalize();const normal=new THREE.Vector3().crossVectors(axis,lateral).normalize(),width=Math.max(.02,...vertices.map(v=>Math.abs(point(v).sub(root).dot(lateral))));
  const phase=cluster*2.399963,twist=(.48+.10*Math.sin(phase))*(cluster%2?1:-1),bow=width*(.10+.045*Math.sin(phase*.7));
  const corners=reuse?new Map():null;
  function emit(v){let corner=corners?.get(v);if(!corner){const p=point(v),d=p.clone().sub(root),r=d.dot(lateral),h=d.dot(normal),t=THREE.MathUtils.clamp(1-v.uv[1],0,1),st=Math.sin(Math.PI*t),ct=Math.cos(Math.PI*t),angle=twist*st,c=Math.cos(angle),s=Math.sin(angle),rr=c*r-s*h,hh=s*r+c*h+bow*st;
   p.addScaledVector(lateral,rr-r).addScaledVector(normal,hh-h);maxShift=Math.max(maxShift,p.distanceTo(point(v)));
   const original=new THREE.Vector3(...v.normal),nr=original.dot(lateral),nh=original.dot(normal),nu=original.dot(axis),a=twist*Math.PI*ct/length,dr=-a*(s*r+c*h),dh=a*(c*r-s*h)+bow*Math.PI*ct/length,ar=c*nr-s*nh,ah=s*nr+c*nh;
   const norm=axis.clone().multiplyScalar(nu-dr*ar-dh*ah).addScaledVector(lateral,ar).addScaledVector(normal,ah).normalize();
   corner={...v,position:p.toArray(),normal:norm.toArray()};corners?.set(v,corner);
   }
   for(const [key]of fields)out[key].push(...corner[key]);
   if(spray){const detail=branchDetail.byCluster.get(cluster);spray.push(...(detail?[...detail.detailCentre,1+detail.readyIndex*16]:[0,0,0,0]));}
  }
  for(let q=0;q<vertices.length;q+=6){const start=out.position.length/3;for(let i=q;i<q+6;i+=3){const tri=vertices.slice(i,i+3),lo=Math.min(...tri.map(v=>v.uv[1])),hi=Math.max(...tri.map(v=>v.uv[1]));const polys=lo<.5-1e-6&&hi>.5+1e-6?[clip(tri,1),clip(tri,-1)]:[tri];for(const poly of polys)for(let j=1;j<poly.length-1;j++){emit(poly[0]);emit(poly[j]);emit(poly[j+1]);}}patches.push([start,out.position.length/3]);}
 }
 if(offset!==ix.length)throw Error('Spruce volume topology length mismatch');const g=new THREE.BufferGeometry();for(const[k,w]of Object.entries(WIDTHS))g.setAttribute(k,new THREE.Float32BufferAttribute(out[k],w));if(spray)g.setAttribute('aSprayLod',new THREE.Float32BufferAttribute(spray,4));
 const indexing=optimize?indexSpruceVolume(g,patches,{merge,audit}):null;g.computeBoundingBox();g.computeBoundingSphere();g.userData={indexing,...(audit&&!optimize?{patches}:{}),gpuBrushShell:!!form,crownRevision:'twisted-branch-volume-v13',clusters,sourceTriangles:retainedSourceTriangles,triangles:(g.index?.count||g.attributes.position.count)/3,maxShift,coverage:'same complete UV triangles, partitioned once; zero additional alpha overlap'};return g;
}
// Call AFTER loadGpuSpruceRecipe/loadSpruceRecipe has checked the original hi
// fingerprints. The original loaded buffers stay untouched and may be shared.
export function applySpruceVolume(hi,mid,{enabled=spruceVolumeEnabled()}={}){
 const report={enabled,forms:{},addedTriangles:0,geometryBytes:0};if(!enabled)return report;
 for(const[gltf,isMid]of[[hi,false],[mid,true]])gltf.scene.traverse(mesh=>{if(!mesh.isMesh||!mesh.name.endsWith('_frond'))return;const source=mesh.geometry,g=createVolumeSpruceFoliage(source,{mid:isMid});mesh.geometry=g;const record={...g.userData};report.forms[(isMid?'mid:':'hi:')+mesh.name]=record;report.addedTriangles+=record.triangles-record.sourceTriangles;report.geometryBytes+=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0);});return report;
}
export function createFarSpruceVolumeGeometry({enabled=spruceVolumeEnabled()}={}){
 const g=createFarSpruceGeometry();if(!enabled)return g;const p=g.attributes.position;
 for(let j=0;j<=8;j++)for(let k=0;k<=6;k++){const i=j*7+k,sector=k%6,angle=sector*Math.PI/3+.19*Math.sin(j*1.73),radius=Math.hypot(p.getX(i),p.getZ(i))*(1+.08*Math.sin(sector*1.9+j*2.2));
  const lip=j%2===0&&j<8?1:0,dy=j===0||j===8?0:(.30*Math.sin(sector*2.1+j*.91)+lip*.12*Math.cos(sector*1.2-j));p.setXYZ(i,Math.cos(angle)*radius,p.getY(i)+dy,Math.sin(angle)*radius);}
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal,v=new THREE.Vector3();for(let j=0;j<=8;j++){const a=j*7,b=a+6;v.fromBufferAttribute(n,a).add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize();n.setXYZ(a,...v);n.setXYZ(b,...v);}g.userData={crownRevision:'offset-whorls-v13',triangles:104,additionalTriangles:0};return g;
}
