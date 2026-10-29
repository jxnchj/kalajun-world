import * as THREE from "three";
import {TreeWindAtlas44} from './tree-wind-atlas44.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const F=Math.fround;
// Mirror the existing un-mipped RGBA8 wind sampler: pixel centres, clamped bilinear
// interpolation, previous/current blend and the world-dependent edge fallback.
export function sampleTreeWind(field,x,z,time,out=new Float32Array(4)){
  x=F(x);z=F(z);time=F(time);
  const u=F(F(x-F(field.origin.x))/F(field.span)),v=F(F(z-F(field.origin.y))/F(field.span));
  const phase=F(F(F(x*.023)+F(z*.017))-F(time*.4));
  const distant=[.38+.12*Math.sin(phase),.38+.12*Math.sin(F(phase+.168)),.5+.25*Math.sin(F(phase*.7)),.5];
  const edge=Math.min(u,v,F(1-u),F(1-v)),blend=smooth(edge/.08);
  if(edge<=0){out.set(distant);return out;}
  const n=field.resolution,px=u*n-.5,pz=v*n-.5,ix=Math.floor(px),iz=Math.floor(pz),fx=px-ix,fz=pz-iz;
  const x0=clamp(ix,0,n-1),x1=clamp(ix+1,0,n-1),z0=clamp(iz,0,n-1),z1=clamp(iz+1,0,n-1);
  const a=(z0*n+x0)*4,b=(z0*n+x1)*4,c=(z1*n+x0)*4,d=(z1*n+x1)*4;
  const sample=(data,k)=>((data[a+k]*(1-fx)+data[b+k]*fx)*(1-fz)+(data[c+k]*(1-fx)+data[d+k]*fx)*fz)/255;
  const t=F(field.uniforms.uWindFieldBlend.value),previous=field.previous.image.data,current=field.current.image.data;
  for(let k=0;k<4;k++){const lo=sample(previous,k),hi=sample(current,k);out[k]=distant[k]*(1-blend)+(lo*(1-t)+hi*t)*blend;}
  return out;
}
export function treeRootWind(field,root,time,out=new Float32Array(5)){
  const f=sampleTreeWind(field,root.x,root.z,time),turn=(f[3]-.5)*.5;
  let dx=.82-.36*turn,dz=.36+.82*turn;const length=Math.hypot(dx,dz);dx/=length;dz/=length;
  // Match the normalized float32 matrix columns consumed by the previous shader.
  const c=F(Math.cos(root.rot)*root.s),s=F(Math.sin(root.rot)*root.s),len=Math.hypot(c,s);
  out[0]=(dx*c-dz*s)/len;out[1]=(dx*s+dz*c)/len;out[2]=f[0];out[3]=f[1];out[4]=f[2]-.5;return out;
}
// Candidate only: exact CPU arithmetic, with stable addresses/rotation and scratch
// arrays retained per root object. Every input scalar is read again on every call.
export class TreeRootWindExactReuse42 {
  constructor(){this.records=new WeakMap();}
  sample(field,root,time){
    let r=this.records.get(root);
    if(!r){r={out:new Float32Array(5),f:new Float32Array(4),distant:new Float64Array(4)};this.records.set(root,r);}
    const x=F(root.x),z=F(root.z),ox=F(field.origin.x),oz=F(field.origin.y),span=F(field.span),n=field.resolution;
    if(!r.ready||!Object.is(x,r.x)||!Object.is(z,r.z)||!Object.is(ox,r.ox)||!Object.is(oz,r.oz)||!Object.is(span,r.span)||n!==r.n){
      Object.assign(r,{x,z,ox,oz,span,n,ready:true});
      const u=F(F(x-ox)/span),v=F(F(z-oz)/span);
      r.edge=Math.min(u,v,F(1-u),F(1-v));r.blend=smooth(r.edge/.08);
      const px=u*n-.5,pz=v*n-.5,ix=Math.floor(px),iz=Math.floor(pz);
      r.fx=px-ix;r.fz=pz-iz;
      const x0=clamp(ix,0,n-1),x1=clamp(ix+1,0,n-1),z0=clamp(iz,0,n-1),z1=clamp(iz+1,0,n-1);
      r.a=(z0*n+x0)*4;r.b=(z0*n+x1)*4;r.c=(z1*n+x0)*4;r.d=(z1*n+x1)*4;
    }
    if(!r.rotationReady||!Object.is(root.rot,r.rot)||!Object.is(root.s,r.scale)){
      r.rot=root.rot;r.scale=root.s;r.rotationReady=true;
      r.cos=F(Math.cos(root.rot)*root.s);r.sin=F(Math.sin(root.rot)*root.s);r.len=Math.hypot(r.cos,r.sin);
    }
    time=F(time);
    const phase=F(F(F(x*.023)+F(z*.017))-F(time*.4)),distant=r.distant,f=r.f;
    distant[0]=.38+.12*Math.sin(phase);distant[1]=.38+.12*Math.sin(F(phase+.168));distant[2]=.5+.25*Math.sin(F(phase*.7));distant[3]=.5;
    if(r.edge<=0)f.set(distant);
    else {
      const t=F(field.uniforms.uWindFieldBlend.value),previous=field.previous.image.data,current=field.current.image.data;
      const {a,b,c,d,fx,fz,blend}=r;
      for(let k=0;k<4;k++){
        const lo=((previous[a+k]*(1-fx)+previous[b+k]*fx)*(1-fz)+(previous[c+k]*(1-fx)+previous[d+k]*fx)*fz)/255;
        const hi=((current[a+k]*(1-fx)+current[b+k]*fx)*(1-fz)+(current[c+k]*(1-fx)+current[d+k]*fx)*fz)/255;
        f[k]=distant[k]*(1-blend)+(lo*(1-t)+hi*t)*blend;
      }
    }
    const turn=(f[3]-.5)*.5;let dx=.82-.36*turn,dz=.36+.82*turn;
    const length=Math.hypot(dx,dz);dx/=length;dz/=length;
    const out=r.out,c=r.cos,s=r.sin,len=r.len;
    out[0]=(dx*c-dz*s)/len;out[1]=(dx*s+dz*c)/len;out[2]=f[0];out[3]=f[1];out[4]=f[2]-.5;return out;
  }
  clear(){this.records=new WeakMap();}
}
// Geometry containers share static vertices with their source, and the three
// mesh parts of a spatial root group also share ONE per-instance force buffer.
const windBuffer=capacity=>new THREE.InstancedInterleavedBuffer(new Float32Array(capacity*5),5).setUsage(THREE.DynamicDrawUsage);
export function createTreeWindGeometry(source,capacity,allocation=null){
  const g=new THREE.BufferGeometry();
  for(const [key,a]of Object.entries(source.attributes))g.setAttribute(key,a);
  g.setIndex(source.index);g.morphAttributes=source.morphAttributes;g.morphTargetsRelative=source.morphTargetsRelative;
  g.groups=source.groups.map(x=>({...x}));g.drawRange={...source.drawRange};
  g.boundingBox=source.boundingBox?.clone()||null;g.boundingSphere=source.boundingSphere?.clone()||null;
  const data=allocation?.data||windBuffer(capacity);
  if(data.count<capacity)throw new RangeError("Shared tree wind allocation is too small");
  if(allocation){allocation.references++;g.userData.treeWindAllocation=allocation;}
  g.setAttribute("aTreeRootWind",new THREE.InterleavedBufferAttribute(data,4,0));
  g.setAttribute("aTreeRootEddy",new THREE.InterleavedBufferAttribute(data,1,4));
  g.userData.ecologyWindAttributes=["aTreeRootWind","aTreeRootEddy"];g.userData.treeWindSource=source;return g;
}
export function disposeTreeWindGeometry(g){
  if(!g.userData.treeWindSource||g.userData.treeWindReleased)return;
  const allocation=g.userData.treeWindAllocation;
  if(allocation){
    allocation.references--;allocation.release();
    if(allocation.references>0){
      // WebGLGeometries disposes attribute buffers with the geometry. Keep the
      // shared wind buffer alive until its LAST mesh part retires.
      for(const key of g.userData.ecologyWindAttributes)g.deleteAttribute(key);
    }
  }
  for(const key of Object.keys(g.attributes))if(!g.userData.ecologyWindAttributes.includes(key)&&key!=="aTreeFrustumSphere"&&key!=="aTreeWorldSphere"&&key!=="aCrownMaskBase")g.deleteAttribute(key);
  g.setIndex(null);g.morphAttributes={};g.userData.treeWindReleased=true;g.dispose();
}
export class SpruceRootWind {
  constructor({atlas44=false,atlasOptions}={}){
    this.cache=new Map();this.allocations=new Map();this.groups=[];
    this.atlas44=atlas44?new TreeWindAtlas44(atlasOptions):null;
    this.exactReuse42=new TreeRootWindExactReuse42();
    this.lastTime=NaN;this.lastRevision=-1;this.lastTreeRevision=-1;
    this.layoutRevision=0;this.lastLayoutRevision=-1;
    this.stats={roots:0,partInstances:0,bytes:0,batches:0,cpuMs:0,exactReuse42:true};
  }
  setExactReuse42(enabled){
    if(Boolean(this.exactReuse42)===Boolean(enabled))return;
    this.exactReuse42?.clear();this.exactReuse42=enabled?new TreeRootWindExactReuse42():null;
    this.lastTime=NaN;this.stats.exactReuse42=Boolean(enabled);
  }
  createGeometry(source,capacity,key){
    let allocation=this.allocations.get(key);
    if(!allocation){
      allocation={data:windBuffer(capacity),references:0,release:()=>{if(allocation.references===0)this.allocations.delete(key);this.layoutRevision++;}};
      this.allocations.set(key,allocation);
    }
    const geometry=createTreeWindGeometry(source,capacity,allocation);this.layoutRevision++;return geometry;
  }
  collectGroups(batches){
    const groups=new Map();
    for(const batch of batches.values()){
      const {mesh,activeRecords}=batch,buffer=mesh.geometry.attributes.aTreeRootWind?.data;
      if(!buffer)continue;
      if(mesh.count!==activeRecords.length||mesh.count>buffer.count)throw new Error("Tree wind active prefix length mismatch");
      let group=groups.get(buffer);
      if(!group){group={buffer,records:activeRecords,parts:0};groups.set(buffer,group);}
      else if(group.records.length!==activeRecords.length||group.records.some((r,i)=>r.id!==activeRecords[i].id))
        throw new Error("Shared tree wind parts must retain identical active root order");
      group.parts++;
    }
    return [...groups.values()];
  }
  update(batches,field,time,treeRevision){
    const changed=treeRevision!==this.lastTreeRevision||this.layoutRevision!==this.lastLayoutRevision;
    if(time===this.lastTime&&field.revisions===this.lastRevision&&!changed)return false;
    const start=performance.now();
    // Membership changes are rare. Validate all part orders then; do not scan the
    // same three prefixes or issue three identical GPU updates on every frame.
    if(changed){this.groups=this.collectGroups(batches);this.atlas44?.syncLayout(batches,this.groups);}
    this.cache.clear();let partInstances=0,bytes=0,count=0;
    for(const {buffer,records,parts}of this.groups){
      if(!records.length)continue;
      for(let i=0;i<records.length;i++){
        const root=records[i];let force=this.cache.get(root.id);
        if(!force){force=this.exactReuse42?this.exactReuse42.sample(field,root,time):treeRootWind(field,root,time);this.cache.set(root.id,force);}
        buffer.array.set(force,i*5);
      }
      buffer.clearUpdateRanges();buffer.addUpdateRange(0,records.length*5);buffer.needsUpdate=true;
      partInstances+=records.length*parts;bytes+=records.length*20;count++;
    }
    this.atlas44?.publish(this.cache);
    this.lastTime=time;this.lastRevision=field.revisions;this.lastTreeRevision=treeRevision;this.lastLayoutRevision=this.layoutRevision;
    Object.assign(this.stats,{roots:this.cache.size,partInstances,bytes,batches:count,cpuMs:performance.now()-start});return true;
  }
  dispose(){this.atlas44?.dispose();this.cache.clear();this.groups=[];this.allocations.clear();this.exactReuse42?.clear();this.exactReuse42=null;}
}
