import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {inflateSync} from "node:zlib";
const ROOT=new URL("../../../",import.meta.url),BACKUP="assets/src/v2/spruce/backup-20261019-185553-before-alpha-trim/";
const file=p=>readFile(new URL(p,ROOT));
const close=(a,b,e=2e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function png(bytes){
 let width,height,channels;const chunks=[];
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);
  if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===6?4:3;}
  if(type==="IDAT")chunks.push(d);p+=n+12;
 }
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
  const f=raw[y*(stride+1)],i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
  pixels[i]=(raw[y*(stride+1)+1+x]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
 }
 assert.equal(channels,4);return{width,height,pixels};
}
function glb(bytes){
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),binary=bytes.subarray(28+length);
 const array=index=>{
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],out=[];
  for(let i=0;i<a.count;i++)for(let k=0;k<components;k++){
   const offset=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*components)+k*size;
   out.push(a.componentType===5126?binary.readFloatLE(offset):a.componentType===5125?binary.readUInt32LE(offset):binary.readUInt16LE(offset));
  }return out;
 };
 return{json,binary,array,mesh:name=>json.meshes.find(m=>m.name===name).primitives[0]};
}
function area(p,index){
 let sum=0;
 for(let i=0;i<index.length;i+=3){const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3,u=[0,1,2].map(k=>p[b+k]-p[a+k]),v=[0,1,2].map(k=>p[c+k]-p[a+k]);sum+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5;}return sum;
}
const removed=[[[0,0],[.38,0],[0,.5]],[[1,1],[.95,1],[1,.5]]];
function clip(poly,axis,bound,sign){
 const out=[];
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
  if(da>=-1e-10)out.push(a);
  if((da<0)!==(db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }return out;
}
// Exact maximum of bilinear alpha over each clipped pixel cell. On a straight
// polygon edge it is quadratic; checking its stationary point covers subpixels.
// Trilinear filtering is a convex combination of two such mip values.
function maxFilteredAlpha(a,width,height){
 const wrap=(i,n)=>(i%n+n)%n,at=(x,y)=>a[wrap(y,height)*width+wrap(x,width)];
 let maximum=0;
 for(const wedge of removed){
  const poly=wedge.map(([u,v])=>[(.090576171875+.31884765625*u)*width-.5,(1-v)*height-.5]);
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  for(let y=Math.floor(Math.min(...ys));y<=Math.floor(Math.max(...ys));y++)for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++){
   let p=poly;for(const [axis,bound,sign] of [[0,x,1],[0,x+1,-1],[1,y,1],[1,y+1,-1]])p=clip(p,axis,bound,sign);
   if(p.length<3)continue;
   const A=at(x,y),B=at(x+1,y)-A,C=at(x,y+1)-A,D=at(x+1,y+1)-at(x+1,y)-at(x,y+1)+A;
   const value=([u,v])=>A+B*u+C*v+D*u*v;
   for(let i=0;i<p.length;i++){
    const q=[p[i][0]-x,p[i][1]-y],r=[p[(i+1)%p.length][0]-x,p[(i+1)%p.length][1]-y],dx=r[0]-q[0],dy=r[1]-q[1];
    maximum=Math.max(maximum,value(q),value(r));const quadratic=D*dx*dy,linear=B*dx+C*dy+D*(q[0]*dy+q[1]*dx);
    if(Math.abs(quadratic)>1e-15){const t=-linear/(2*quadratic);if(t>0&&t<1)maximum=Math.max(maximum,value([q[0]+dx*t,q[1]+dy*t]));}
   }
  }
 }return maximum;
}
test("trimmed fan corners retain every nonzero source texel and every alpha-passing mip sample",async t=>{
 const {width,height,pixels}=png(await file("assets/tex/spruce_atlas.png"));let sourceCount=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=((x+.5)/width-.090576171875)/.31884765625,v=1-(y+.5)/height;
  if(u<0||u>1||pixels[(y*width+x)*4+3]===0)continue;
  sourceCount++;assert.ok(u>=.38*Math.max(0,1-2*v)-1e-12);assert.ok(u<=1-.05*Math.max(0,2*v-1)+1e-12);
 }
 assert.ok(sourceCount>300000);let overall=0;
 // Both ideal averages and each-level RGBA8 rounding; no alpha threshold edits.
 for(const quantize of [false,true]){
  let w=width,h=height,a=Float64Array.from({length:w*h},(_,i)=>pixels[i*4+3]/255);
  for(let level=0;;level++){
   const maximum=maxFilteredAlpha(a,w,h);overall=Math.max(overall,maximum);
   assert.ok(maximum<.45,`mip ${level}: removed alpha ${maximum} can pass the unchanged .45 test`);
   if(w===1&&h===1)break;
   const nw=Math.max(1,w>>1),nh=Math.max(1,h>>1),next=new Float64Array(nw*nh);
   for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){let sum=0,count=0;
    for(let dy=0;dy<(h>1?2:1);dy++)for(let dx=0;dx<(w>1?2:1);dx++){sum+=a[(y*2+dy)*w+x*2+dx];count++;}
    next[y*nw+x]=quantize?Math.round(sum/count*255)/255:sum/count;
   }a=next;w=nw;h=nh;
  }
 }t.diagnostic(`retained ${sourceCount} nonzero texels; maximum removed filtered alpha ${overall.toFixed(6)} < 0.45`);
});
test("fixed topology trim preserves mid bytes, all structural data, textures, cluster roots and face budgets",async t=>{
 const mid=await file("web/public/assets/v2/schrenk-spruce-mid.glb");assert.deepEqual(mid,await file(BACKUP+"schrenk-spruce-mid.glb"));
 assert.deepEqual(await file("assets/src/v2/spruce/shared-skeleton.json"),await file(BACKUP+"shared-skeleton.json"));
 assert.deepEqual(await file("web/src/v2/spruce-spec.json"),await file(BACKUP+"spruce-spec.json"));
 assert.deepEqual(await file("web/src/v2/spruce-geometry.js"),await file(BACKUP+"spruce-geometry.js"));
 const old=glb(await file(BACKUP+"schrenk-spruce-hi.glb")),now=glb(await file("web/public/assets/v2/schrenk-spruce-hi.glb"));
 // A later hi-only surface pass adds a normal texture, but its albedo image,
 // alpha test, tint and every old material parameter remain identical.
 const comparable=asset=>asset.json.materials.map(m=>{
  const copy=structuredClone(m);delete copy.normalTexture;
  if(copy.extras?.surfaceRevision==="needle-bundle-surface-v1"){delete copy.extras.surfaceRevision;if(!Object.keys(copy.extras).length)delete copy.extras;}
  const map=copy.pbrMetallicRoughness?.baseColorTexture;
  if(map)map.index=asset.json.images[asset.json.textures[map.index].source].name;
  return copy;
 });
 assert.deepEqual(comparable(now),comparable(old));assert.deepEqual(now.json.samplers,old.json.samplers);
 assert.equal(now.json.meshes.length,15);
 for(let i=0;i<old.json.images.length;i++){
  const image=now.json.images.find(image=>image.name===old.json.images[i].name);assert.ok(image);
  const before=old.json.bufferViews[old.json.images[i].bufferView],after=now.json.bufferViews[image.bufferView];
  assert.deepEqual(now.binary.subarray(after.byteOffset,after.byteOffset+after.byteLength),old.binary.subarray(before.byteOffset,before.byteOffset+before.byteLength));
 }
 let removedArea=0,totalArea=0,moved=0;
 for(const mesh of old.json.meshes){
  const a=old.mesh(mesh.name),b=now.mesh(mesh.name),ix=old.array(a.indices);assert.deepEqual(now.array(b.indices),ix);
  for(const key of Object.keys(a.attributes))assert.equal(now.array(b.attributes[key]).length,old.array(a.attributes[key]).length);
  if(!mesh.name.endsWith("_frond")){for(const key of Object.keys(a.attributes))assert.deepEqual(now.array(b.attributes[key]),old.array(a.attributes[key]));continue;}
  const p=old.array(a.attributes.POSITION),q=now.array(b.attributes.POSITION),uv=old.array(a.attributes.TEXCOORD_0),nuv=now.array(b.attributes.TEXCOORD_0);
  const beforeArea=area(p,ix),afterArea=area(q,ix),fraction=1-afterArea/beforeArea;assert.ok(fraction>.04&&fraction<.046);removedArea+=beforeArea-afterArea;totalArea+=beforeArea;
  const neighbours=Array.from({length:p.length/3},()=>new Set());
  for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++)for(let k=0;k<3;k++)if(j!==k)neighbours[ix[i+j]].add(ix[i+k]);
  const attributes=Object.fromEntries(["_PLANT_WIND","_CROWN_OCCLUSION","NORMAL"].map(key=>[key,[old.array(a.attributes[key]),now.array(b.attributes[key]),key==="_CROWN_OCCLUSION"?1:3]]));
  for(let i=0;i<p.length/3;i++){
   const changed=[0,1,2].some(k=>p[i*3+k]!==q[i*3+k]);if(!changed)continue;moved++;
   const centre=[...neighbours[i]].find(k=>Math.abs(uv[k*2]-.25)<1e-7&&Math.abs(uv[k*2+1]-uv[i*2+1])<1e-7);assert.ok(centre!==undefined);
   const ratio=(nuv[i*2]-.25)/(uv[i*2]-.25);assert.ok(Math.abs(ratio-.24)<1e-6||Math.abs(ratio-.9)<1e-6);
   close(nuv[i*2+1],uv[i*2+1]);
   for(let k=0;k<3;k++)close(q[i*3+k],p[centre*3+k]*(1-ratio)+p[i*3+k]*ratio);
   for(const [key,[before,after,components]] of Object.entries(attributes)){
    let expected=Array.from({length:components},(_,k)=>before[centre*components+k]*(1-ratio)+before[i*components+k]*ratio);
    if(key==="NORMAL"){const length=Math.hypot(...expected);expected=expected.map(x=>x/length);}
    for(let k=0;k<components;k++)close(after[i*components+k],expected[k],key==="NORMAL"?.0006:2e-6);
   }
  }
 }
 assert.equal(moved,10048);t.diagnostic(`hi frond surface ${totalArea.toFixed(3)} -> ${(totalArea-removedArea).toFixed(3)} m2; removed ${(removedArea/totalArea*100).toFixed(3)}%, no additional vertices or triangles`);
});
