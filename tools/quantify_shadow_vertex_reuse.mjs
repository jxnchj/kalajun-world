import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const base=new URL('../web/public/assets/v2/',import.meta.url),manifest=JSON.parse(await readFile(new URL('spruce-canopy-v1.json',base))),data=gunzipSync(await readFile(new URL(manifest.payload.file,base)));
const TYPES={Float32Array,Uint16Array,Uint32Array},array=d=>new TYPES[d.type](data.buffer,data.byteOffset+d.byteOffset,d.length);
const misses=(index,size)=>{const cache=[];let n=0;for(const v of index){const p=cache.indexOf(v);if(p<0)n++;else cache.splice(p,1);cache.unshift(v);if(cache.length>size)cache.pop();}return n;};
const parts=[];
for(const [id,part]of Object.entries(manifest.parts)){
 const index=array(part.index),count=part.attributes.position.length/3,fields=Object.entries(part.attributes).filter(([name])=>name!=='normal').map(([name,d])=>{const a=array(d);return{name,width:d.itemSize,bits:new Uint32Array(a.buffer,a.byteOffset,a.length)};});
 const canonical=new Uint32Array(count),rows=new Map();
 for(let i=0;i<count;i++){let key='';for(const f of fields)for(let k=0;k<f.width;k++)key+=f.bits[i*f.width+k]+',';let v=rows.get(key);if(v===undefined){v=i;rows.set(key,v);}canonical[i]=v;}
 const remapped=index.map(v=>canonical[v]);const sim=Object.fromEntries([16,24,32,64].map(size=>[size,{before:misses(index,size),after:misses(remapped,size)}]));
 parts.push({id,triangles:index.length/3,indexedVertices:new Set(index).size,shadowVertices:new Set(remapped).size,changedCorners:index.reduce((n,v,i)=>n+(v!==remapped[i]),0),simulatedLRU:sim});
}
const summarize=list=>({parts:list.length,triangles:list.reduce((n,p)=>n+p.triangles,0),indexedVertices:list.reduce((n,p)=>n+p.indexedVertices,0),shadowVertices:list.reduce((n,p)=>n+p.shadowVertices,0),simulatedLRU:Object.fromEntries([16,24,32,64].map(size=>[size,{before:list.reduce((n,p)=>n+p.simulatedLRU[size].before,0),after:list.reduce((n,p)=>n+p.simulatedLRU[size].after,0)}]))});
const report={source:'complete current 15 foliage geometries',method:'remap each index to earliest vertex whose complete non-normal attribute bits match; retain all triangle corners/order; LRU is a model, not a GPU measurement',all:summarize(parts),staticHiMid:summarize(parts.filter(p=>!p.id.startsWith('near:'))),parts};
console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
