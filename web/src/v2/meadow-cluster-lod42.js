// Independent source-derived cluster LOD candidate. No production import.
// Keeps every root and all 24 individual leaves. Only eight curved long leaves
// replace their three nonzero triangles with one area-preserving triangle.
import * as T from 'three';
export function buildMeadowClusterLeaf42(source,{maxDeviation=Infinity}={}){
 const attrs=source.attributes,output=Object.fromEntries(Object.keys(attrs).map(k=>[k,[]])),indices=[],leaves=[];
 const pos=id=>new T.Vector3().fromArray(attrs.position.array,id*3);
 const append=(id,position=null)=>{const n=output.position.length/3;for(const [key,a]of Object.entries(attrs))for(let j=0;j<a.itemSize;j++)output[key].push(key==='position'&&position?position.getComponent(j):a.array[id*a.itemSize+j]);return n;};
 let base=0;
 for(let leaf=0;leaf<24;leaf++){
  const segments=leaf<8?2:1,count=(segments+1)*2;
  if(segments===1){const ids=Array.from({length:count},(_,j)=>append(base+j));for(let j=0;j<source.index.count;j+=3){const ix=[0,1,2].map(k=>source.index.array[j+k]);if(ix.every(i=>i>=base&&i<base+count))indices.push(...ix.map(i=>ids[i-base]));}base+=count;continue;}
  const triangles=[];let area=0;const areaNormal=new T.Vector3();
  for(let j=0;j<source.index.count;j+=3){const ix=[0,1,2].map(k=>source.index.array[j+k]);if(!ix.every(i=>i>=base&&i<base+count))continue;const t=new T.Triangle(...ix.map(pos)),a=t.getArea();if(a<1e-12)continue;area+=a;areaNormal.addScaledVector(t.getNormal(new T.Vector3()),a);triangles.push(t);}
  const foot=pos(base).add(pos(base+1)).multiplyScalar(.5),tip=pos(base+4),axis=tip.clone().sub(foot),normal=areaNormal.normalize(),widthAxis=new T.Vector3().crossVectors(normal,axis).normalize();
  const halfWidth=area/axis.length(),a=foot.clone().addScaledVector(widthAxis,-halfWidth),b=foot.clone().addScaledVector(widthAxis,halfWidth),candidate=new T.Triangle(a,b,tip);
  let winding=[a,b,tip];if(candidate.getNormal(new T.Vector3()).dot(normal)<0)winding=[b,a,tip];
  const geometricProbe=new T.Vector3();const error=Math.max(...triangles.flatMap(t=>[t.a,t.b,t.c].map(p=>p.distanceTo(new T.Triangle(...winding).closestPointToPoint(p,geometricProbe)))));
  if(error>maxDeviation){const ids=Array.from({length:count},(_,j)=>append(base+j));for(let j=0;j<source.index.count;j+=3){const ix=[0,1,2].map(k=>source.index.array[j+k]);if(ix.every(i=>i>=base&&i<base+count))indices.push(...ix.map(i=>ids[i-base]));}base+=count;continue;}
  const ids=winding.map((p,j)=>append(base+(j===2?4:j),p));indices.push(...ids);
  const finalTriangle=new T.Triangle(...winding),probe=new T.Vector3();let sourceToCandidate=0,candidateToSourceSampled=0;
  for(const t of triangles)for(const p of [t.a,t.b,t.c])sourceToCandidate=Math.max(sourceToCandidate,p.distanceTo(finalTriangle.closestPointToPoint(p,probe)));
  for(let i=0;i<=8;i++)for(let j=0;j<=8-i;j++){const p=new T.Vector3().addScaledVector(winding[0],i/8).addScaledVector(winding[1],j/8).addScaledVector(winding[2],1-(i+j)/8);candidateToSourceSampled=Math.max(candidateToSourceSampled,Math.min(...triangles.map(t=>p.distanceTo(t.closestPointToPoint(p,probe)))));}
  leaves.push({leaf,sourceArea:area,candidateArea:finalTriangle.getArea(),sourceToCandidateBound:sourceToCandidate,candidateToSourceSampled,foot:foot.toArray(),tip:tip.toArray()});base+=count;
 }
 // Retain geometric seed stalk and head unchanged, including original shader selection.
 const tailStart=base;for(let i=base;i<attrs.position.count;i++)append(i);
 const tailOffset=output.position.length/3-(attrs.position.count-tailStart)-tailStart;
 for(let i=0;i<source.index.count;i+=3){const ids=[0,1,2].map(j=>source.index.array[i+j]);if(ids.every(x=>x>=tailStart))indices.push(...ids.map(x=>x+tailOffset));}
 const geometry=new T.BufferGeometry();for(const [name,a]of Object.entries(attrs))geometry.setAttribute(name,new T.Float32BufferAttribute(output[name],a.itemSize));geometry.setIndex(indices); // Preserve source shading normals; changing tessellation must not flatten original curved-leaf normals.
 const nonzero=g=>{let n=0;for(let j=0;j<g.index.count;j+=3){const t=new T.Triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(g.attributes.position,g.index.array[j+k])));if(t.getArea()>1e-12)n++;}return n;};
 return{geometry,stats:{sourceNonzeroTriangles:nonzero(source),candidateNonzeroTriangles:nonzero(geometry),retainedLeaves:24,retainedLongLeaves:8,simplifiedLongLeaves:leaves.length,maxDeviation,leaves,maxSourceToCandidateBound:Math.max(0,...leaves.map(l=>l.sourceToCandidateBound)),maxCandidateToSourceSampled:Math.max(0,...leaves.map(l=>l.candidateToSourceSampled)),scope:'Static geometry one-sided bound plus sampled reverse distance; dynamic wind, projected coverage and light response still require actual browser validation.'}};
}
export function clusterLeafProjectedError42(worldError,distance,{height=800,fov=52}={}){if(!(distance>worldError&&worldError>=0))return Infinity;return worldError*height/(2*Math.tan(fov*Math.PI/360)*(distance-worldError));}
