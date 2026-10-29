import {Float32BufferAttribute} from 'three';
// Bounded conforming refinement of only inaccurate physical-depth triangles.
// Every split edge is shared with its neighbour in the same pass. Surface and
// flow/optical attributes interpolate the existing water; only depth is sampled.
export function refineReachDepth41(g,reach,{tolerance=.0035,maxRounds=4}={}){
 const data=Object.fromEntries(Object.entries(g.attributes).filter(([k])=>k!=='normal').map(([k,a])=>[k,{size:a.itemSize,values:Array.from(a.array)}]));let indices=Array.from(g.index.array),added=0,rounds=0,maxError=0;
 const pos=data.position.values,depth=data.aReachDepth.values;
 const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
 const actual=(ids)=>{let x=0,y=0,z=0;for(const i of ids){x+=pos[i*3];y+=pos[i*3+1];z+=pos[i*3+2];}return reach.depthAt(x/ids.length,z/ids.length,y/ids.length-.006);};
 const add=ids=>{const id=pos.length/3;for(const a of Object.values(data))for(let k=0;k<a.size;k++){let v=0;for(const i of ids)v+=a.values[i*a.size+k];a.values.push(Math.fround(v/ids.length));}depth[id*2]=Math.fround(actual([id]));added++;return id;};
 for(let round=0;round<=maxRounds;round++){
  const marked=[];let worst=null;maxError=0;
  for(let j=0;j<indices.length;j+=3){const a=indices[j],b=indices[j+1],c=indices[j+2];if(Math.min(depth[a*2+1],depth[b*2+1],depth[c*2+1])<.5)continue;const error=Math.abs((depth[a*2]+depth[b*2]+depth[c*2])/3-actual([a,b,c]));if(error>maxError){maxError=error;worst=[a,b,c].map(i=>[pos[i*3],pos[i*3+1],pos[i*3+2],depth[i*2]]);}if(error>tolerance)marked.push(j);}
  if(!marked.length)break;if(round===maxRounds)throw Error('Reach41 depth refinement unresolved '+maxError+' '+JSON.stringify(worst));
  const edges=new Map();for(const j of marked){const ids=indices.slice(j,j+3);for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,add([a,b]));}}
  const next=[];for(let j=0;j<indices.length;j+=3){const ids=indices.slice(j,j+3),poly=[];for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3];poly.push(a);const mid=edges.get(edgeKey(a,b));if(mid!==undefined)poly.push(mid);}if(poly.length===3){next.push(...ids);continue;}const center=add(ids);for(let k=0;k<poly.length;k++)next.push(center,poly[k],poly[(k+1)%poly.length]);}indices=next;rounds++;
 }
 for(const [name,a]of Object.entries(data))g.setAttribute(name,new Float32BufferAttribute(a.values,a.size));g.setIndex(indices);g.userData.depthRefinement41={addedVertices:added,rounds,maxError,tolerance,triangles:indices.length/3};return g;
}
