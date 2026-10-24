import fs from 'node:fs';import {createHash} from 'node:crypto';import {parseGLB} from './pack-structure-prepared-v38.mjs';
const source=fs.readFileSync('web/public/assets/gh_lanchuan_lodge.glb'),{json:j,bin}=parseGLB(source),sha=b=>createHash('sha256').update(b).digest('hex');
const read=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={VEC4:4,VEC3:3,VEC2:2,SCALAR:1}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size,out=Buffer.alloc(a.count*n*size);for(let k=0;k<a.count;k++)bin.copy(out,k*n*size,start+k*stride,start+k*stride+n*size);return {bytes:out,values:a.componentType===5126?new Float32Array(out.buffer,out.byteOffset,out.byteLength/4):a.componentType===5125?new Uint32Array(out.buffer,out.byteOffset,out.byteLength/4):new Uint16Array(out.buffer,out.byteOffset,out.byteLength/2),n};};
const result={version:'lodge-wood-38',assetId:'gh_lanchuan_lodge',sourceSHA256:sha(source),nodes:[]};
for(const name of ['gh_lanchuan_lodge_plank','gh_lanchuan_lodge_pine']){
 const primitive=j.meshes.find(m=>m.name===name).primitives[0],p=read(primitive.attributes.POSITION),n=read(primitive.attributes.NORMAL),idx=read(primitive.indices),count=p.values.length/3,parent=Array.from({length:count},(_,i)=>i),find=x=>parent[x]===x?x:parent[x]=find(parent[x]),join=(a,b)=>parent[find(a)]=find(b),key=new Map();
 for(let i=0;i<count;i++){const k=Array.from(p.values.subarray(i*3,i*3+3)).map(v=>Math.round(v*1e5)).join(',');if(key.has(k))join(i,key.get(k));else key.set(k,i);}
 for(let i=0;i<idx.values.length;i+=3){join(idx.values[i],idx.values[i+1]);join(idx.values[i],idx.values[i+2]);}
 const groups=new Map();for(let i=0;i<count;i++){const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);}
 const field=new Float32Array(count*4),records=[];for(let i=0;i<count;i++)field[i*4+2]=-1;
 let serial=0;
 for(const ids of groups.values()){
  const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);for(const i of ids)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p.values[i*3+k]);max[k]=Math.max(max[k],p.values[i*3+k]);}const size=max.map((v,k)=>v-min[k]),center=max.map((v,k)=>(v+min[k])/2);let role=-1,grain=0;
  const table=Math.abs(size[0]-1.9)<.001&&Math.abs(size[2]-.9)<.001&&Math.abs(center[1]-.74)<.001;
  const leg=Math.abs(size[1]-.72)<.001&&size[0]<.07&&size[2]<.07&&center[0]<-3.7;
  const floor=size[0]>3&&size[2]>3&&center[1]<.03&&center[1]>-.04;
  if(table){role=0;grain=0;}else if(leg){role=0;grain=1;}else if(floor){role=2;grain=0;}else if(name.endsWith('_pine')){role=1;grain=size[0]>size[2]?0:2;if(size[1]>Math.max(size[0],size[2]))grain=1;}
  if(role<0)continue;
  const seed=(Math.sin(++serial*127.17+center[0]*3.71+center[2]*2.17)*43758.5453)%1;const stableSeed=seed-Math.floor(seed);
  for(const i of ids){const normal=Array.from(n.values.subarray(i*3,i*3+3)),axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),isEnd=role===0&&axis===grain;const transverse=[0,1,2].filter(k=>k!==grain);let across=[0,1,2].find(k=>k!==grain&&k!==axis);if(across===undefined)across=transverse[0];const u=isEnd?p.values[i*3+transverse[0]]-center[transverse[0]]:p.values[i*3+across]-min[across],v=isEnd?p.values[i*3+transverse[1]]-center[transverse[1]]:p.values[i*3+grain]-min[grain];field.set([u,v,isEnd?3:role,stableSeed],i*4);}
  records.push({role,grain,table,leg,floor,vertices:ids.length,min,max,seed:stableSeed});
 }
 const binding={};for(const[name,i]of Object.entries({...primitive.attributes,index:primitive.indices}))binding[name]=sha(read(i).bytes);
 result.nodes.push({name,count,binding,field:Buffer.from(field.buffer).toString('base64'),components:records});
}
if(result.nodes.flatMap(n=>n.components).filter(c=>c.table).length!==4)throw Error('Expected four original tabletops');
fs.mkdirSync('web/src/v2/generated',{recursive:true});fs.writeFileSync('web/src/v2/generated/lodge-wood-38.json',JSON.stringify(result));console.log(JSON.stringify(result.nodes.map(n=>({name:n.name,components:n.components.length,roles:n.components.map(c=>({role:c.role,table:c.table,leg:c.leg,floor:c.floor}))})),null,2));
