import * as THREE from 'three';
export const BRANCH_DETAIL=Object.freeze({near:4.5,far:7,cell:3,height:10,maxGroupBrushes:36,readyPerForm:256});
const installedPhotoMaterials=new WeakSet();
const f3=(g,k,i)=>Array.from(g.attributes[k].array.subarray(i*3,i*3+3));
// Recover the editable quad controls, including retained trim, from the verified
// hi topology. The original 1143 recipes are reused unchanged and remain first.
export function deriveBranchDetail(source,form,formIndex=0){
 const old=new Set(form.instances.map(r=>r.cluster)),extra=[],byCluster=new Map();let offset=0;
 for(let cluster=0;cluster<form.sourceTriangles.length;cluster++){
  const n=form.sourceTriangles[cluster],segments=(n-2)/4,indices=source.index.array.subarray(offset,offset+n*3);offset+=n*3;
  if(old.has(cluster))continue;
  const controls=[];for(let q=0;q<segments*2;q++)controls.push([0,1,2,5].map(c=>{
   const i=indices[q*6+c],p=f3(source,'position',i),w=f3(source,'_plant_wind',i);return[p[0],-p[2],p[1],...w,source.attributes._crown_occlusion.array[i]];
  }));
  const points=controls.flat().map(q=>new THREE.Vector3(q[0],q[2],-q[1])),box=new THREE.Box3().setFromPoints(points),centre=box.getCenter(new THREE.Vector3());
  if(centre.y>=BRANCH_DETAIL.height)continue;
  const width=Math.max(...controls.map(q=>Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1],q[1][2]-q[0][2])))*2;
  if(!(width>.02))continue;
  const r={cluster,id:'branch:'+cluster,segments,width,seed:(60821+cluster*7919)>>>0,controls,detailCentre:centre.toArray(),detailBounds:{min:box.min.toArray(),max:box.max.toArray()}};
  // Three connected short sprays fill the original full envelope. Needle
  // dimensions stay physical; subdivision adds branches instead of broadening needles.
  byCluster.set(cluster,r);
  const sample=(half,t,side)=>{const row=Math.min(segments-1,Math.floor(t*segments)),v=t*segments-row,q=controls[half*segments+row],weights=[(1-v)*(1-side),(1-v)*side,v*side,v*(1-side)];
   const out=Array.from({length:7},(_,k)=>q.reduce((n,p,i)=>n+p[k]*weights[i],0));
   out[5]=(Math.atan2(q.reduce((n,p,i)=>n+Math.sin(p[5])*weights[i],0),q.reduce((n,p,i)=>n+Math.cos(p[5])*weights[i],0))+Math.PI*2)%(Math.PI*2);return out;
  };
  for(let section=0;section<3;section++){
   const t0=section/3,t1=(section+1)/3,part=[0,1].map(half=>[sample(half,t0,0),sample(half,t0,1),sample(half,t1,1),sample(half,t1,0)]);
   extra.push({...r,id:r.id+':'+section,segments:1,section,controls:part,variationKey:(cluster*3+section)%16,seed:60821+((cluster*3+section)%16)*104729});
  }
 }
 if(offset!==source.index.count)throw new Error('Branch source topology mismatch');
 const key=r=>r.detailCentre.map(x=>Math.floor(x/BRANCH_DETAIL.cell)).join(',');extra.sort((a,b)=>key(a).localeCompare(key(b))||a.cluster-b.cluster);
 const groups=[{start:0,count:form.instances.length,extra:false}],all=[...form.instances,...extra];
 for(let start=0;start<extra.length;){let end=start+1;while(end<extra.length&&end-start<BRANCH_DETAIL.maxGroupBrushes&&key(extra[end])===key(extra[start]))end++;
  const box=new THREE.Box3();for(let i=start;i<end;i++){box.expandByPoint(new THREE.Vector3(...extra[i].detailBounds.min));box.expandByPoint(new THREE.Vector3(...extra[i].detailBounds.max));}box.expandByScalar(.13);
  const readyIndex=formIndex*BRANCH_DETAIL.readyPerForm+groups.length-1;if(groups.length>BRANCH_DETAIL.readyPerForm)throw new Error('Spruce branch ready capacity exceeded');for(let i=start;i<end;i++){extra[i].readyIndex=readyIndex;byCluster.get(extra[i].cluster).readyIndex=readyIndex;}
  groups.push({start:form.instances.length+start,count:end-start,extra:true,readyIndex,bounds:{min:box.min.toArray(),max:box.max.toArray()}});start=end;
 }
 const lod=new Float32Array(all.length*4);extra.forEach((r,i)=>lod.set([...r.detailCentre,1+r.readyIndex*16+r.variationKey],(form.instances.length+i)*4));
 return{instances:all,extras:extra,byCluster,groups,lod,originalBrushes:form.instances.length};
}
export const branchReadyUniform={value:null};
export function createBranchReadiness(ready=false){const capacity=BRANCH_DETAIL.readyPerForm*5,values=new Float32Array(capacity*4);if(ready)for(let i=0;i<capacity;i++)values[i*4]=1;const texture=new THREE.DataTexture(values,capacity,1,THREE.RGBAFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;branchReadyUniform.value=texture;return{texture,set(index,value){if(values[index*4]!==value){values[index*4]=value;texture.needsUpdate=true;}},dispose(){texture.dispose();if(branchReadyUniform.value===texture)branchReadyUniform.value=null;}};}
export const BRANCH_LOD_GLSL=`
uniform vec3 uWorldViewer;
uniform sampler2D uBranchReady;
varying float vSpruceBranchFade;
float spruceBranchFade(vec4 source){
 if(source.w<.5)return 1.;
 vec4 world=vec4(source.xyz,1.);
 #ifdef USE_INSTANCING
 world=instanceMatrix*world;
 #endif
 world=modelMatrix*world;
 return (1.-smoothstep(${BRANCH_DETAIL.near.toFixed(1)},${BRANCH_DETAIL.far.toFixed(1)},distance(world.xyz,uWorldViewer)))*texelFetch(uBranchReady,ivec2(int((source.w-1.)/16.),0),0).r;
}
`;
export function branchFragment(shader,photo=false){
 shader.fragmentShader='varying float vSpruceBranchFade;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
float branchDither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
if(branchDither ${photo?'<':'>='} vSpruceBranchFade)discard;`);
}
export function installSpruceBranchPhotos(material){
 if(installedPhotoMaterials.has(material))return material;installedPhotoMaterials.add(material);
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);shader.uniforms.uBranchReady=branchReadyUniform;
  shader.vertexShader='attribute vec4 aSprayLod;\n'+BRANCH_LOD_GLSL+shader.vertexShader.replace('uniform vec3 uWorldViewer;','');
  shader.vertexShader=shader.vertexShader.replace('// ECO_LOD_EARLY_END',`// ECO_LOD_EARLY_END
vSpruceBranchFade=aSprayLod.w<.5?0.:spruceBranchFade(aSprayLod);
if(vSpruceBranchFade>=1.){gl_Position=vec4(2.,2.,2.,1.);return;}`);
  branchFragment(shader,true);
 };material.customProgramCacheKey=()=>key+'-branch-photos-v12';return material;
}
