import {createVolumeSpruceFoliage,spruceVolumeEnabled} from './spruce-volume.js';
import * as THREE from 'three';
const WIDTHS={position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1};
const V=a=>new THREE.Vector3(...a),read=(g,name,i)=>Array.from(g.attributes[name].array.subarray(i*WIDTHS[name],(i+1)*WIDTHS[name]));
// Preserve each source triangle's UV domain. Subdivision is a one-to-one map,
// not extra overlapping alpha planes. Only lower, currently non-brush sprays
// bend; all 1143 real-needle brushes and the hi/mid source remain untouched.
export function createNearShell(source,form,{shape=true,branchDetail=null,volume=spruceVolumeEnabled()}={}){
 if(shape&&volume)return createVolumeSpruceFoliage(source,{form,branchDetail});
 const replaced=new Set(form.instances.map(r=>r.cluster)),clusters=[];let offset=0,curved=0,count=0,sourceTriangles=0,maxShift=0;
 form.sourceTriangles.forEach((n,cluster)=>{
  const indices=Array.from(source.index.array.subarray(offset,offset+n*3));offset+=n*3;if(replaced.has(cluster))return;sourceTriangles+=n;
  const points=indices.map(i=>V(read(source,'position',i))),root=points[0],tip=points[n===10?11:5],axis=tip.clone().sub(root),length=axis.length();axis.normalize();
  let lateral=points[1].clone().sub(root);lateral.addScaledVector(axis,-lateral.dot(axis)).normalize();const width=Math.max(.02,...points.map(p=>Math.abs(p.clone().sub(root).dot(lateral)))),normal=new THREE.Vector3().crossVectors(axis,lateral).normalize();
  const bend=shape&&points.reduce((a,p)=>a+p.y,0)/points.length<10&&length>.04&&normal.lengthSq()>.5,divisions=bend?3:1;curved+=bend?1:0;count+=n*3*divisions*divisions;
  clusters.push({detail:branchDetail?.byCluster.get(cluster),indices,root:root.toArray(),axis:axis.toArray(),length,lateral:lateral.toArray(),width,normal:normal.toArray(),bend,divisions,phase:(cluster*2.399963)%6.283185307,amplitude:Math.min(.065,width*.14)});
 });
 if(offset!==source.index.count)throw new Error('GPU spruce source topology mismatch');
 const out=Object.fromEntries(Object.entries(WIDTHS).map(([key,width])=>[key,new Float32Array(count*width)])),entries=Object.entries(WIDTHS).map(([key,width])=>({key,width,src:source.attributes[key].array,dst:out[key]}));let cursor=0;const sprayLod=branchDetail?new Float32Array(count*4):null;
 const grids={};for(const n of [1,3]){const list=[],at=(i,j)=>[1-(i+j)/n,i/n,j/n];for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){list.push(at(i,j),at(i+1,j),at(i,j+1));if(i+j<n-1)list.push(at(i+1,j),at(i+1,j+1),at(i,j+1));}grids[n]=list;}
 for(const c of clusters){const {root,axis,lateral,normal,length,width}=c;
  for(let tri=0;tri<c.indices.length;tri+=3)for(const bary of grids[c.divisions]){
   const i0=c.indices[tri],i1=c.indices[tri+1],i2=c.indices[tri+2];
   for(const {width:w,src,dst}of entries)for(let k=0;k<w;k++)dst[cursor*w+k]=src[i0*w+k]*bary[0]+src[i1*w+k]*bary[1]+src[i2*w+k]*bary[2];
   if(c.bend){
    const o=cursor*3,p=out.position,n=out.normal,dx=p[o]-root[0],dy=p[o+1]-root[1],dz=p[o+2]-root[2];
    const t=(dx*axis[0]+dy*axis[1]+dz*axis[2])/length,r=(dx*lateral[0]+dy*lateral[1]+dz*lateral[2])/width;
    const st=Math.sin(Math.PI*t),wave=.65*Math.sin(r*1.7+c.phase)+r*.35,d=c.amplitude*st*wave;
    const da=c.amplitude*Math.PI*Math.cos(Math.PI*t)*wave/length,dl=c.amplitude*st*(1.105*Math.cos(r*1.7+c.phase)+.35)/width,dot=n[o]*normal[0]+n[o+1]*normal[1]+n[o+2]*normal[2];
    let norm=0;for(let k=0;k<3;k++){p[o+k]+=normal[k]*d;n[o+k]-=(axis[k]*da+lateral[k]*dl)*dot;norm+=n[o+k]*n[o+k];}norm=Math.sqrt(norm);for(let k=0;k<3;k++)n[o+k]/=norm;maxShift=Math.max(maxShift,Math.abs(d));
   }if(sprayLod&&c.detail)sprayLod.set([...c.detail.detailCentre,1+(c.detail.readyIndex||0)*16],cursor*4);cursor++;
  }
 }
 if(cursor!==count)throw new Error('Near crown tessellation length mismatch');
 const g=new THREE.BufferGeometry();for(const [name,width]of Object.entries(WIDTHS))g.setAttribute(name,new THREE.BufferAttribute(out[name],width));if(sprayLod)g.setAttribute('aSprayLod',new THREE.BufferAttribute(sprayLod,4));
 source.computeBoundingBox();source.computeBoundingSphere();g.boundingBox=source.boundingBox.clone().expandByScalar(.10);g.boundingSphere=source.boundingSphere.clone();g.boundingSphere.radius+=.10;g.userData={gpuBrushShell:true,crownRevision:shape?'curved-open-crown-v1':'source',curvedSprays:curved,sourceTriangles,triangles:g.attributes.position.count/3,maxShift};return g;
}
// The old near core is a continuous opaque six-sided cone. Replace that filler
// with separated tapering inner shoots. Authored trunk/primary branches and
// every foliage cluster remain in the other parts; no tree root is moved.
export function createOpenCrownCore(source){
 const p=source.attributes.position,levels=new Map();for(let i=0;i<p.count;i++){const y=p.getY(i),key=y.toFixed(4);if(!levels.has(key))levels.set(key,[]);levels.get(key).push(new THREE.Vector3(p.getX(i),y,p.getZ(i)));}
 const rings=[...levels.values()].sort((a,b)=>a[0].y-b[0].y).map(points=>{const unique=new Map(points.map(p=>[p.toArray().map(v=>v.toFixed(5)).join(','),p])),list=[...unique.values()],centre=list.reduce((v,p)=>v.add(p),new THREE.Vector3()).divideScalar(list.length);return{centre,radius:Math.max(...list.map(p=>p.distanceTo(centre)))};});
 const out=Object.fromEntries(Object.keys(WIDTHS).map(k=>[k,[]]));let shoots=0;
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<6;k++){
  const r=rings[j],a=k*Math.PI/3+j*.43,radial=new THREE.Vector3(Math.cos(a),0,Math.sin(a));
  const start=r.centre.clone().addScaledVector(radial,r.radius*.12),end=r.centre.clone().addScaledVector(radial,r.radius*.94);end.y+=.16+(j%3)*.045;
  const axis=end.clone().sub(start).normalize(),side=new THREE.Vector3().crossVectors(axis,new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(side,axis).normalize(),radius=Math.min(.025,r.radius*.045);
  const ring=(t,i)=>{const theta=i*Math.PI*2/5,n=side.clone().multiplyScalar(Math.cos(theta)).addScaledVector(up,Math.sin(theta)),point=start.clone().lerp(end,t).addScaledVector(n,radius*(1-t*.84));return{point,n};};
  for(let sideIndex=0;sideIndex<5;sideIndex++)for(const [t,i]of[[0,sideIndex],[0,sideIndex+1],[1,sideIndex+1],[0,sideIndex],[1,sideIndex+1],[1,sideIndex]]){
   const {point,n}=ring(t,i);out.position.push(...point);out.normal.push(...n);out.uv.push(i/5,t);out._plant_wind.push(point.y/18,.012,(Math.round(point.y/.55)*.37+a)%(Math.PI*2));out._crown_occlusion.push(.56);
  }shoots++;
 }
 const g=new THREE.BufferGeometry();for(const [name,width]of Object.entries(WIDTHS))g.setAttribute(name,new THREE.Float32BufferAttribute(out[name],width));g.computeBoundingBox();g.computeBoundingSphere();g.userData={crownRevision:'curved-open-crown-v1',innerShoots:shoots,opaqueFillerRemoved:true};return g;
}
