import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import {parseGLB}from'./pack-structure-prepared-v38.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),binding=JSON.parse(fs.readFileSync('web/src/v2/generated/lodge-chairs-source-38.json')),source=fs.readFileSync('web/public/'+binding.sourceGLB);assert.equal(sha(source),binding.sourceSHA256);
const {json:j,bin}=parseGLB(source),legacy=JSON.parse(fs.readFileSync('web/src/v2/generated/lodge-wood-38.json'));
const read=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={VEC4:4,VEC3:3,VEC2:2,SCALAR:1}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size,out=Buffer.alloc(a.count*n*size);for(let k=0;k<a.count;k++)bin.copy(out,k*n*size,start+k*stride,start+k*stride+n*size);return {bytes:out,values:a.componentType===5126?new Float32Array(out.buffer,out.byteOffset,out.byteLength/4):a.componentType===5125?new Uint32Array(out.buffer,out.byteOffset,out.byteLength/4):new Uint16Array(out.buffer,out.byteOffset,out.byteLength/2)};};
const result={version:'lodge-interior-wood-38',sourceSHA256:binding.sourceSHA256,originalLayoutSHA256:sha(fs.readFileSync('web/src/v2/generated/lodge-wood-38.json')),nodes:[]},report=[];
for(const record of legacy.nodes){
 const p=j.meshes.find(m=>m.name===record.name).primitives[0],pos=read(p.attributes.POSITION).values,norm=read(p.attributes.NORMAL).values,idx=read(p.indices).values;
 for(const [k,h]of Object.entries(record.binding))assert.equal(sha(read(k==='index'?p.indices:p.attributes[k]).bytes),h,record.name+'/'+k);
 const buf=Buffer.from(record.field,'base64'),old=new Float32Array(buf.buffer,buf.byteOffset,buf.length/4),field=old.slice();let reprojected=0;
 for(let i=0;i<record.count;i++){
  const role=old[i*4+2];if(role<0||role===0||role===3)continue;
  const component=record.components.find(c=>Math.abs(c.seed-old[i*4+3])<1e-6&&c.min.every((v,k)=>pos[i*3+k]>=v-1e-5&&pos[i*3+k]<=c.max[k]+1e-5));assert.ok(component);
  const size=component.max.map((v,k)=>v-component.min[k]),axis=[0,1,2].reduce((a,k)=>Math.abs(norm[i*3+k])>Math.abs(norm[i*3+a])?k:a,0);
  // Wall lining and tall cabinet faces use upright grain; cabinet tops and thin shelves follow their real horizontal long axis.
  let grain=component.grain;
  if(role===1){const wall=component.min[0]<-12&&size[1]>2.9;grain=wall?1:size[1]>.5&&axis!==1?1:size[0]>=size[2]?0:2;}
  const end=axis===grain,transverse=[0,1,2].filter(k=>k!==grain),across=[0,1,2].find(k=>k!==axis&&k!==grain),centre=component.min.map((v,k)=>(v+component.max[k])/2);
  const u=end?pos[i*3+transverse[0]]-centre[transverse[0]]:pos[i*3+across]-component.min[across],v=end?pos[i*3+transverse[1]]-centre[transverse[1]]:pos[i*3+grain]-component.min[grain];
  field.set([u,v,end?3:role,component.seed],i*4);reprojected++;
 }
 // Extend only the two authored indoor plank tops; the original GLB remains untouched.
 const extras=[];
 if(record.name.endsWith('_plank'))for(const spec of [
  {name:'reception-top',centre:[.3,1.12,.52],half:[1.251,.026,.341],seed:.3187},
  {name:'lounge-tea-top',centre:[5.3,.4,-.4],half:[.51,.061,.51],seed:.7831}
 ]){
  const ids=[];for(let i=0;i<record.count;i++)if(spec.centre.every((v,k)=>Math.abs(pos[i*3+k]-v)<=spec.half[k]))ids.push(i);
  assert.ok(ids.length>0,spec.name);const set=new Set(ids),assigned=new Map();let triangles=0;
  const min=[0,1,2].map(k=>Math.min(...ids.map(i=>pos[i*3+k]))),max=[0,1,2].map(k=>Math.max(...ids.map(i=>pos[i*3+k])));
  for(let t=0;t<idx.length;t+=3){const tri=Array.from(idx.slice(t,t+3));if(!tri.some(i=>set.has(i)))continue;assert.ok(tri.every(i=>set.has(i)),spec.name+' partial face');triangles++;
   const normal=[0,1,2].map(k=>tri.reduce((sum,i)=>sum+norm[i*3+k],0)),axis=[0,1,2].reduce((a,k)=>Math.abs(normal[k])>Math.abs(normal[a])?k:a,0),end=axis===0,across=axis===1?2:1;
   for(const i of tri){const value=end?[pos[i*3+1]-spec.centre[1],pos[i*3+2]-spec.centre[2],3,spec.seed]:[pos[i*3+across]-min[across],pos[i*3]-min[0],0,spec.seed];if(assigned.has(i))assert.deepEqual(assigned.get(i),value,spec.name+' shared vertex chart conflict');assigned.set(i,value);field.set(value,i*4);}
  }
  extras.push({name:spec.name,role:0,grain:0,table:false,indoorTop:true,vertices:ids.length,triangles,min,max,seed:spec.seed});
 }
 let selected=0,oldFlat=0,newFlat=0,minArea=Infinity;
 for(let t=0;t<idx.length;t+=3){const[a,b,c]=idx.slice(t,t+3);if(field[a*4+2]<0)continue;selected++;const area=f=>Math.abs((f[b*4]-f[a*4])*(f[c*4+1]-f[a*4+1])-(f[c*4]-f[a*4])*(f[b*4+1]-f[a*4+1]));if(old[a*4+2]>=0&&area(old)<1e-9)oldFlat++;const next=area(field);if(next<1e-9)newFlat++;minArea=Math.min(minArea,next);assert.equal(field[a*4+2],field[b*4+2]);assert.equal(field[a*4+2],field[c*4+2]);}
 assert.equal(newFlat,0,record.name+' tangent charts must not collapse');result.nodes.push({...record,components:[...record.components,...extras],field:Buffer.from(field.buffer).toString('base64')});report.push({name:record.name,selectedTriangles:selected,oldZeroUVTriangles:oldFlat,newZeroUVTriangles:newFlat,minUVDoubleArea:minArea,reprojectedVertices:reprojected,allOriginalAttributeBindingsEqual:true});
}
fs.writeFileSync('web/src/v2/generated/lodge-interior-wood-38.json',JSON.stringify(result)+'\n');fs.writeFileSync('tools/reports/lodge-interior-wood-layout-v38.json',JSON.stringify({sourceSHA256:binding.sourceSHA256,nodes:report,geometryChanged:false,originalAOChanged:false,originalUVChanged:false},null,2)+'\n');console.log(JSON.stringify(report,null,2));
