import {generateBrush} from './spruce-brush.js';
export const BRUSH_LAYOUT=Object.freeze({stations:288,needles:1440,woodVertices:117,triangles:1596,frameStride:16,woodStride:12});
const xyz=v=>[v[0],v[2],-v[1]];
// CPU stores one station frame per FIVE needles and one vertex per shared twig
// ring. No expanded needle positions, normals, wind or UV arrays are allocated.
export function buildBrushPacket(records){
 const originalBrushes=records.findIndex(r=>r.variationKey!==undefined),retained=originalBrushes<0?records.length:originalBrushes;
 const frameStride=retained===records.length?16:13,frames=new Float32Array(records.length*288*frameStride),variations=new Float32Array(retained*1440*2),wood=new Float32Array(records.length*117*12);
 const sharedVariations=retained===records.length?null:new Float32Array(16*1440*2),variationKeys=sharedVariations?new Int16Array(records.map(r=>r.variationKey??-1)):null,seenVariations=new Set();
 let topology=null;
 records.forEach((record,brush)=>{
  let f=0,n=0,w=0;const corners=[];
  generateBrush(record,null,{
   frame(q,t,l,u){let o=(brush*288+f++)*frameStride;
    frames[o++]=q.p[0];frames[o++]=q.p[2];frames[o++]=-q.p[1];frames[o++]=q.ao;
    frames[o++]=t[0];frames[o++]=t[2];frames[o++]=-t[1];frames[o++]=q.w[0];
    frames[o++]=l[0];frames[o++]=l[2];frames[o++]=-l[1];frames[o++]=q.w[1];
    if(frameStride===16){frames[o++]=u[0];frames[o++]=u[2];frames[o++]=-u[1];}frames[o]=q.w[2];},
   needle(angle,length){const i=n++;if(record.variationKey===undefined)variations.set([angle,length],(brush*1440+i)*2);else if(!seenVariations.has(record.variationKey))sharedVariations.set([angle,length],(record.variationKey*1440+i)*2);},
   wood(p,normal,wind,ao){let o=(brush*117+w++)*12;
    wood[o++]=p[0];wood[o++]=p[1];wood[o++]=p[2];wood[o++]=ao;
    wood[o++]=normal[0];wood[o++]=normal[1];wood[o++]=normal[2];
    wood[o++]=wind[0];wood[o++]=wind[1];wood[o++]=wind[2];wood[o++]=0;wood[o]=0;},
   corner(index,uv){corners.push([index,...uv]);}
  });
  if(record.variationKey!==undefined)seenVariations.add(record.variationKey);
  if(f!==288||n!==1440||w!==117||corners.length!==468)throw new Error('Spruce compact brush topology changed');
  if(!topology)topology=corners;else for(let i=0;i<468;i++)if(corners[i].some((v,k)=>v!==topology[i][k]))throw new Error('Spruce twig template is not shared');
 });
 return{frames,frameStride,variations,wood,topology,originalBrushes:retained,sharedVariations,variationKeys,brushes:records.length,bytes:frames.byteLength+variations.byteLength+wood.byteLength+(sharedVariations?.byteLength||0)+(variationKeys?.byteLength||0)};
}
// JS mirror of the shader is used against the original realised geometry.
export function packetNeedleVertex(packet,brush,needle,corner){
 const a=packet.frames,stride=packet.frameStride||16,o=(brush*288+Math.floor(needle/5))*stride,key=packet.variationKeys?.[brush]??-1,j=((key<0?brush:key)*1440+needle)*2,v=key<0?packet.variations:packet.sharedVariations,angle=v[j],len=v[j+1];
 const base=[a[o],a[o+1],a[o+2]],t=[a[o+4],a[o+5],a[o+6]],l=[a[o+8],a[o+9],a[o+10]],u=stride===16?[a[o+12],a[o+13],a[o+14]]:[l[1]*t[2]-l[2]*t[1],l[2]*t[0]-l[0]*t[2],l[0]*t[1]-l[1]*t[0]];if(stride===13){const n=Math.hypot(...u);for(let k=0;k<3;k++)u[k]/=n;}
 const delta=u.map((v,k)=>(v*Math.cos(angle)+l[k]*Math.sin(angle))*len+t[k]*len*.36);
 const cross=(x,y)=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],norm=v=>{const m=Math.hypot(...v);return v.map(x=>x/m);};
 const side=norm(cross(delta,t)),normal=norm(cross(side,delta));
 return{position:base.map((v,k)=>v+(corner===2?delta[k]:side[k]*(corner===0?-.00115:.00115))),normal,wind:[a[o+7],a[o+11],a[o+stride-1]],ao:a[o+3]};
}

// Larger, arithmetic-free vertex representation. Keep base/wind once per five
// needles; store delta, unit side and inverse cross length once per needle.
// This remains a shared brush template, not expanded triangle vertex storage.
export function precomputeBrushPacket(packet){
 const start=performance.now(),frames=new Float32Array(packet.brushes*288*8),variations=new Float32Array(packet.brushes*1440*8),old=packet.frames;
 for(let station=0;station<packet.brushes*288;station++){
  const a=station*16,o=station*8;frames.set(old.subarray(a,a+4),o);frames.set([old[a+7],old[a+11],old[a+15],0],o+4);
  for(let k=0;k<5;k++){
   const i=station*5+k,j=i*2,angle=packet.variations[j],len=packet.variations[j+1],c=Math.cos(angle),s=Math.sin(angle);
   const dx=(old[a+12]*c+old[a+8]*s)*len+old[a+4]*len*.36,dy=(old[a+13]*c+old[a+9]*s)*len+old[a+5]*len*.36,dz=(old[a+14]*c+old[a+10]*s)*len+old[a+6]*len*.36;
   let sx=dy*old[a+6]-dz*old[a+5],sy=dz*old[a+4]-dx*old[a+6],sz=dx*old[a+5]-dy*old[a+4];const sl=Math.hypot(sx,sy,sz);sx/=sl;sy/=sl;sz/=sl;
   const inv=1/Math.hypot(sy*dz-sz*dy,sz*dx-sx*dz,sx*dy-sy*dx);variations.set([dx,dy,dz,inv,sx,sy,sz,0],i*8);
  }
 }
 return{...packet,frames,variations,layout:'precomputed-delta-side',packingMs:performance.now()-start,bytes:frames.byteLength+variations.byteLength+packet.wood.byteLength};
}
export function packedNeedleVertex(packet,brush,needle,corner){
 const station=brush*288+Math.floor(needle/5),a=station*8,j=(brush*1440+needle)*8,f=packet.frames,v=packet.variations,d=[v[j],v[j+1],v[j+2]],side=[v[j+4],v[j+5],v[j+6]],scale=v[j+3];
 return{position:[0,1,2].map(k=>f[a+k]+(corner===2?d[k]:side[k]*(corner===0?-.00115:.00115))),normal:[side[1]*d[2]-side[2]*d[1],side[2]*d[0]-side[0]*d[2],side[0]*d[1]-side[1]*d[0]].map(x=>x*scale),wind:[f[a+4],f[a+5],f[a+6]],ao:f[a+3]};
}
