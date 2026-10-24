import fs from 'node:fs';import {createHash} from 'node:crypto';import {parseGLB} from './pack-structure-prepared-v38.mjs';
const source=fs.readFileSync('web/public/assets/cabin_small.glb'),{json:j,bin}=parseGLB(source),sha=b=>createHash('sha256').update(b).digest('hex');
const read=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={VEC4:4,VEC3:3,VEC2:2,SCALAR:1}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size,out=Buffer.alloc(a.count*n*size);for(let k=0;k<a.count;k++)bin.copy(out,k*n*size,start+k*stride,start+k*stride+n*size);return{bytes:out,values:a.componentType===5126?new Float32Array(out.buffer,out.byteOffset,out.byteLength/4):a.componentType===5125?new Uint32Array(out.buffer,out.byteOffset,out.byteLength/4):new Uint16Array(out.buffer,out.byteOffset,out.byteLength/2)};};
const means=JSON.parse(fs.readFileSync('tools/reports/lodge-dining-gi-v38.json')).materialReflectance;
const out={version:'cabin-timber-38',sourceSHA256:sha(source),entityId:'cabins:-1999.5,3372.6:0f598bcbed84e01b',nodes:[],endTreatment:'Original separate cabin_small_logend node and its radial UV retained byte-identically; no veneer on cut ends.'};
for(const name of ['cabin_small_plank','cabin_small_log']){
 const primitive=j.meshes.find(m=>m.name===name).primitives[0],pos=read(primitive.attributes.POSITION),uv=read(primitive.attributes.TEXCOORD_0),idx=read(primitive.indices),count=pos.values.length/3,parent=Array.from({length:count},(_,i)=>i),find=x=>parent[x]===x?x:parent[x]=find(parent[x]),join=(a,b)=>parent[find(a)]=find(b),keys=new Map();
 for(let i=0;i<count;i++){const key=Array.from(pos.values.subarray(i*3,i*3+3)).map(v=>Math.round(v*1e5)).join(',');if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);}
 for(let i=0;i<idx.values.length;i+=3){join(idx.values[i],idx.values[i+1]);join(idx.values[i],idx.values[i+2]);}
 const groups=new Map();for(let i=0;i<count;i++){const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 const field=new Float32Array(count*4);for(let i=0;i<count;i++)field[i*4+2]=-1;
 const records=[];for(const ids of groups.values()){
  const lo=[Infinity,Infinity,Infinity],hi=lo.map(()=>-Infinity);for(const i of ids)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],pos.values[i*3+k]);hi[k]=Math.max(hi[k],pos.values[i*3+k]);}const size=hi.map((v,k)=>v-lo[k]),centre=hi.map((v,k)=>(v+lo[k])/2);
  const roof=name.endsWith('_plank')&&Math.abs(size[0]-9.8)<1e-4&&size[2]>3.7&&centre[1]>2;
  const beam=name.endsWith('_log')&&Math.abs(size[0]-9.6)<1e-4&&size[1]<.34&&size[2]<.34&&centre[1]>3;
  if(!roof&&!beam)continue;
  const role=roof?0:1,seed=(records.length+1)*.237+(centre[2]>0?.173:.079),sign=centre[2]>0?1:-1;
  for(const i of ids){const p=pos.values.subarray(i*3,i*3+3);const u=roof?p[0]-lo[0]:uv.values[i*2+1]*(Math.PI*.3),v=roof?((p[2]-centre[2])*sign*Math.cos(Math.PI/6)-(p[1]-centre[1])*Math.sin(Math.PI/6)):p[0]-lo[0];field.set([u,v,role,seed],i*4);}
  records.push({kind:roof?'roof':'beam',min:lo,max:hi,seed,vertices:ids.length,triangles:Array.from(idx.values).filter(i=>ids.includes(i)).length/3,coordinates:roof?'u across x; v slope plane from ridge to eave, full 1.83m scan scale':'u original radial UV times 0.3m*pi; v true x-axis length'});
 }
 const binding={};for(const[n,i]of Object.entries({...primitive.attributes,index:primitive.indices}))binding[n]=sha(read(i).bytes);
 out.nodes.push({name,count,binding,materialMean:means[name.endsWith('_plank')?'plank':'log'],field:Buffer.from(field.buffer).toString('base64'),components:records});
}
const all=out.nodes.flatMap(n=>n.components);if(all.filter(c=>c.kind==='roof').length!==2||all.filter(c=>c.kind==='beam').length!==3)throw Error('Must bind exactly original two roof boxes and three long beams: '+JSON.stringify(all));
fs.writeFileSync('web/src/v2/generated/cabin-timber-38.json',JSON.stringify(out));console.log(JSON.stringify({sourceSHA256:out.sourceSHA256,nodes:out.nodes.map(n=>({name:n.name,count:n.count,components:n.components}))},null,2));
