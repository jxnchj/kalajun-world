import {PythonRandom} from "./python-random.js";
const F=Math.fround,TAU=Math.PI*2;
const add=(a,b)=>[F(a[0]+b[0]),F(a[1]+b[1]),F(a[2]+b[2])];
const sub=(a,b)=>[F(a[0]-b[0]),F(a[1]-b[1]),F(a[2]-b[2])];
const mul=(a,s)=>{s=F(s);return[F(a[0]*s),F(a[1]*s),F(a[2]*s)];};
const cross=(a,b)=>[F(F(a[1]*b[2])-F(a[2]*b[1])),F(F(a[2]*b[0])-F(a[0]*b[2])),F(F(a[0]*b[1])-F(a[1]*b[0]))];
const norm=a=>{const n=F(Math.sqrt(F(F(F(a[0]*a[0])+F(a[1]*a[1]))+F(a[2]*a[2]))));return n>1e-20?mul(a,F(1/n)):[0,0,0];};
const centres=[[557.5,376.5],[381.5,607.5],[563.5,679.5],[563.5,442.5],[558.5,393.5]];
function uvPatch(colour,n){
 const [x,y]=centres[colour],u=F(x/2048),v=F(1-y/1024),du=F(.3/2048),dv=F(.3/1024);
 return(n===3?[[-du,-dv],[du,-dv],[0,dv]]:[[-du,-dv],[du,-dv],[du,dv],[-du,dv]]).map(([x,y])=>[F(u+x),F(1-F(v+y))]);
}
function faceNormal(p){
 // Blender's polygon normal uses the whole quad, not the arbitrary render diagonal.
 if(p.length===3)return norm(cross(sub(p[1],p[0]),sub(p[2],p[0])));
 let n=[0,0,0];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];n=add(n,[F(F(a[1]-b[1])*F(a[2]+b[2])),F(F(a[2]-b[2])*F(a[0]+b[0])),F(F(a[0]-b[0])*F(a[1]+b[1]))]);}return norm(n);
}
const pointKey=p=>p.map(x=>Math.round(x*1e6)).join(",");
// A single 1440-needle template algorithm. Controls, phase and RNG seed vary per
// source spray; none of the resulting triangle positions are downloaded.
export function generateBrush(record,emit,compact=null){
 const {segments,controls,width}=record,rng=new PythonRandom(record.seed),faces=[];
 // The source phase is constant throughout a brush. Preserve the exact float32
 // multiply/add order while avoiding four temporary vectors per control sample.
 const phaseSin=controls.map(poly=>poly.map(q=>Math.sin(q[5])));
 const phaseCos=controls.map(poly=>poly.map(q=>Math.cos(q[5])));
 function sample(poly,t,r){
  const weights=[(1-t)*(1-r),(1-t)*r,t*r,t*(1-r)];
  let px=0,py=0,pz=0,wx=0,wy=0,wz=0,ao=0,sn=0,cs=0;
  for(let i=0;i<4;i++){
   const q=controls[poly][i],k=weights[i],fk=F(k);
   px=F(px+F(q[0]*fk));py=F(py+F(q[1]*fk));pz=F(pz+F(q[2]*fk));
   wx=F(wx+F(q[3]*fk));wy=F(wy+F(q[4]*fk));wz=F(wz+F(q[5]*fk));
   ao+=q[6]*k;sn+=phaseSin[poly][i]*k;cs+=phaseCos[poly][i]*k;
  }
  wz=F((Math.atan2(sn,cs)+TAU)%TAU);return{p:[px,py,pz],w:[wx,wy,wz],ao};
 }
 const root=sample(0,0,0).p,tip=sample(segments-1,1,0).p,along=norm(sub(tip,root)),left=sub(sample(0,.5,1).p,sample(0,.5,0).p),normal=norm(cross(along,left));
 const source=(t,r,half)=>{const row=Math.min(segments-1,Math.floor(t*segments));return sample(half*segments+row,t*segments-row,r);};
 function central(t){const q=source(t,0,0);q.p=add(q.p,mul(normal,.022*width*(1-Math.abs(2*t-1))));return q;}
 function face(points,uv,wind,ao){faces.push({points,uv,wind,ao});}
 function needle(base,tip,axis,colour,w,ao){
  const direction=norm(sub(tip,base));let side=norm(cross(direction,axis));if(Math.hypot(...side)<.1)side=norm(cross(direction,[1,0,0]));
  face([sub(base,mul(side,.00115)),add(base,mul(side,.00115)),tip],uvPatch(colour,3),[w,w,w],[ao,ao,ao]);
 }
 function woody(point,radius){
  const rings=[0,.5,1].map(s=>{
   const q=point(s),tangent=norm(sub(point(Math.min(1,s+.015)).p,point(Math.max(0,s-.015)).p)),lateral=norm(cross(tangent,normal)),up=norm(cross(lateral,tangent)),r=radius*(1-.70*s);
   return[0,1,2].map(k=>({p:add(q.p,mul(add(mul(lateral,Math.cos(k*TAU/3)),mul(up,Math.sin(k*TAU/3))),r)),w:q.w,ao:q.ao}));
  });
  for(let j=0;j<2;j++)for(let k=0;k<3;k++){
   const q=[rings[j][k],rings[j][(k+1)%3],rings[j+1][(k+1)%3],rings[j+1][k]];
   face(q.map(v=>v.p),uvPatch(4,4),q.map(v=>v.w),q.map(v=>v.ao));
  }
 }
 woody(central,.0032);
 for(let pair=0;pair<6;pair++)for(const arm of [-1,1]){
  const half=arm<0?0:1,begin=.095+pair*.13+arm*.008,end=Math.min(.97,begin+.19),reach=[.78,1,.96,.80,.56,.28][pair];
  const point=s=>{const t=begin+(end-begin)*s,q=source(t,reach*s,half);q.p=add(q.p,mul(normal,width*(.022*(1-Math.abs(2*t-1))+arm*((-1)**pair)*.085*Math.sin(Math.PI*s))));return q;};
  woody(point,.00165);
  for(let station=0;station<22;station++){
   const s=.025+station*(.92/21)+rng.uniform(-.006,.006),q=point(s),tangent=norm(sub(point(Math.min(1,s+.01)).p,point(Math.max(0,s-.01)).p)),lateral=norm(cross(tangent,normal)),up=norm(cross(lateral,tangent));
   compact?.frame(q,tangent,lateral,up);
   for(let ni=0;ni<5;ni++){
    const angle=ni*TAU/5+station*2.39996+arm*.77+pair*.53+rng.uniform(-.18,.18),length=.024+rng.random()*.011;
    if(compact)compact.needle(angle,length);else {const radial=add(mul(up,Math.cos(angle)),mul(lateral,Math.sin(angle)));needle(q.p,add(add(q.p,mul(radial,length)),mul(tangent,length*.36)),tangent,(station+ni+pair)%4,q.w,q.ao);}
   }
  }
 }
 for(let station=0;station<24;station++){
  const t=.25+station*(.74/23),q=central(t),tangent=norm(sub(central(Math.min(1,t+.01)).p,central(Math.max(0,t-.01)).p)),lateral=norm(cross(tangent,normal)),up=norm(cross(lateral,tangent));
  compact?.frame(q,tangent,lateral,up);
  for(let ni=0;ni<5;ni++){
   const angle=ni*TAU/5+station*2.39996+rng.uniform(-.18,.18),length=.024+rng.random()*.011;
   if(compact)compact.needle(angle,length);else {const radial=add(mul(up,Math.cos(angle)),mul(lateral,Math.sin(angle)));needle(q.p,add(add(q.p,mul(radial,length)),mul(tangent,length*.36)),tangent,(station+ni)%4,q.w,q.ao);}
  }
 }
 // Match the realised source's smoothing at coincident twig ring positions.
 const normalSums=new Map();
 for(const f of faces){const n=faceNormal(f.points);for(const p of f.points){const key=pointKey(p);normalSums.set(key,add(normalSums.get(key)||[0,0,0],n));}}
 if(compact){
  const unique=new Map();
  for(const f of faces)for(const i of [0,1,2,0,2,3]){
   const p=f.points[i],key=pointKey(p);let index=unique.get(key);
   if(index===undefined){index=unique.size;unique.set(key,index);const n=norm(normalSums.get(key));compact.wood([p[0],p[2],-p[1]],[n[0],n[2],-n[1]],f.wind[i],f.ao[i]);}
   compact.corner(index,f.uv[i]);
  }
  return;
 }
 for(const f of faces){const ns=f.points.map(p=>norm(normalSums.get(pointKey(p))));
  const order=f.points.length===3?[0,1,2]:[0,1,2,0,2,3];
  for(const i of order){const p=f.points[i],n=ns[i];emit([p[0],p[2],-p[1]],[n[0],n[2],-n[1]],f.uv[i],f.wind[i],f.ao[i]);}
 }
}
const widths={position:3,normal:3,uv:2,_plant_wind:3,_crown_occlusion:1};
export function buildRecipeFrond(source,form){
 const count=form.trianglesByCluster.reduce((a,b)=>a+b,0)*3,out={};for(const [name,width]of Object.entries(widths))out[name]=new Float32Array(count*width);
 let vertex=0,sourceIndex=0;const instances=new Map();for(const r of form.instances){if(!instances.has(r.cluster))instances.set(r.cluster,[]);instances.get(r.cluster).push(r);}
 const emit=(position,normal,uv,wind,ao)=>{out.position.set(position,vertex*3);out.normal.set(normal,vertex*3);out.uv.set(uv,vertex*2);out._plant_wind.set(wind,vertex*3);out._crown_occlusion[vertex]=ao;vertex++;};
 for(let cluster=0;cluster<form.sourceTriangles.length;cluster++){
  const recipe=instances.get(cluster),length=form.sourceTriangles[cluster]*3;
  if(recipe)for(const r of recipe)generateBrush(r,emit);
  else for(let j=0;j<length;j++){
   const index=source.index[sourceIndex+j];for(const [name,width]of Object.entries(widths))for(let k=0;k<width;k++)out[name][vertex*width+k]=source[name][index*width+k];vertex++;
  }
  sourceIndex+=length;
 }
 if(vertex!==count||sourceIndex!==source.index.length)throw new Error("Spruce recipe/source topology mismatch");return out;
}
