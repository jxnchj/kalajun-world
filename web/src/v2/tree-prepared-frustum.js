import {InstancedBufferAttribute,DynamicDrawUsage} from 'three';
import {treeCullSphere} from './tree-frustum-cull.js';

const installed=new WeakMap();
// Reserved owned cull attribute is already retained by disposeTreeWindGeometry.
// This candidate and the old full-matrix culler are mutually exclusive.
const NAME='aTreeFrustumSphere';
// Gershgorin upper bound of A^T A, valid for nonuniform scales, rotations,
// reflection and shear. Column-length max alone is unsafe when columns shear.
export function treeLinearScaleBoundSquared(e,offset=0){
 const a=[e[offset],e[offset+1],e[offset+2]],b=[e[offset+4],e[offset+5],e[offset+6]],c=[e[offset+8],e[offset+9],e[offset+10]];
 const dot=(x,y)=>x[0]*y[0]+x[1]*y[1]+x[2]*y[2],ab=Math.abs(dot(a,b)),ac=Math.abs(dot(a,c)),bc=Math.abs(dot(b,c));
 return Math.max(dot(a,a)+ab+ac,dot(b,b)+ab+bc,dot(c,c)+ac+bc);
}
export function transformTreeCullSphere(sphere,e,offset=0,out=new Float32Array(4),at=0){
 const disabled=()=>{out[at]=out[at+1]=out[at+2]=0;out[at+3]=-1;return false;};
 if(!sphere||sphere[3]<0||!Array.from({length:16},(_,i)=>e[offset+i]).every(Number.isFinite)||e[offset+3]!==0||e[offset+7]!==0||e[offset+11]!==0||e[offset+15]!==1)return disabled();
 const x=sphere[0],y=sphere[1],z=sphere[2];
 const cx=e[offset]*x+e[offset+4]*y+e[offset+8]*z+e[offset+12],cy=e[offset+1]*x+e[offset+5]*y+e[offset+9]*z+e[offset+13],cz=e[offset+2]*x+e[offset+6]*y+e[offset+10]*z+e[offset+14];
 out[at]=cx;out[at+1]=cy;out[at+2]=cz;
 const round=Math.hypot(cx-out[at],cy-out[at+1],cz-out[at+2]);
 const radius=sphere[3]*Math.sqrt(treeLinearScaleBoundSquared(e,offset))+round+.003;
 out[at+3]=radius*(1+2**-22);return true;
}

export const PREPARED_TREE_FRUSTUM_GLSL=/* glsl */`
attribute vec4 aTreeFrustumSphere;
uniform float uTreePreparedFrustum;
bool preparedTreeOutsidePlane(vec4 plane,vec4 center,float radiusSquared){
 float n2=dot(plane.xyz,plane.xyz),d=dot(plane,center);
 return n2>1e-24 && d<0. && d*d>radiusSquared*n2;
}
bool preparedTreeOutsideCurrentView(){
 if(aTreeFrustumSphere.w<0.)return false;
 // Center is already transformed by the original float32 instance matrix.
 // Actual per-draw matrices cover the main, oblique mirror and shadow camera.
 vec4 center=modelViewMatrix*vec4(aTreeFrustumSphere.xyz,1.);
 vec3 a=modelViewMatrix[0].xyz,b=modelViewMatrix[1].xyz,c=modelViewMatrix[2].xyz;
 float ab=abs(dot(a,b)),ac=abs(dot(a,c)),bc=abs(dot(b,c));
 float scale2=max(max(dot(a,a)+ab+ac,dot(b,b)+ab+bc),dot(c,c)+ac+bc);
 float guard=.03+max(max(abs(aTreeFrustumSphere.x),abs(aTreeFrustumSphere.y)),abs(aTreeFrustumSphere.z))*.000002;
 float radius=aTreeFrustumSphere.w+guard;
 float radius2=radius*radius*scale2*1.000002;
 vec4 x=vec4(projectionMatrix[0].x,projectionMatrix[1].x,projectionMatrix[2].x,projectionMatrix[3].x);
 vec4 y=vec4(projectionMatrix[0].y,projectionMatrix[1].y,projectionMatrix[2].y,projectionMatrix[3].y);
 vec4 z=vec4(projectionMatrix[0].z,projectionMatrix[1].z,projectionMatrix[2].z,projectionMatrix[3].z);
 vec4 w=vec4(projectionMatrix[0].w,projectionMatrix[1].w,projectionMatrix[2].w,projectionMatrix[3].w);
 if(preparedTreeOutsidePlane(w+x,center,radius2)||preparedTreeOutsidePlane(w-x,center,radius2)||preparedTreeOutsidePlane(w+y,center,radius2)||preparedTreeOutsidePlane(w-y,center,radius2))return true;
#ifdef USE_REVERSED_DEPTH_BUFFER
 if(preparedTreeOutsidePlane(z,center,radius2))return true;
#else
 if(preparedTreeOutsidePlane(w+z,center,radius2))return true;
#endif
 return preparedTreeOutsidePlane(w-z,center,radius2);
}
`;
const EARLY=/* glsl */`
// TREE_PREPARED_FRUSTUM_BEGIN
#ifdef USE_INSTANCING
if(uTreePreparedFrustum>.5 && preparedTreeOutsideCurrentView()){gl_Position=vec4(2.,2.,2.,1.);return;}
#endif
// TREE_PREPARED_FRUSTUM_END
`;
export function installPreparedTreeFrustumMaterial(material,control){
 if(installed.has(material)){if(installed.get(material)!==control)throw new Error('Conflicting prepared tree cull controls');return;}
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  if(!shader.vertexShader.includes('// ECO_LOD_EARLY_END'))throw new Error('Prepared tree cull requires ecology early hook');
  shader.uniforms.uTreePreparedFrustum=control;
  shader.vertexShader=PREPARED_TREE_FRUSTUM_GLSL+shader.vertexShader.replace('// ECO_LOD_EARLY_END',EARLY+'\n// ECO_LOD_EARLY_END');
 };
 material.customProgramCacheKey=()=>key+'-tree-prepared-frustum-v1';material.userData.treePreparedFrustum=control;installed.set(material,control);
}

// sync MUST run after instance writes and before renderer.render / compile.
// Three uploads geometry before onBeforeRender and onBeforeShadow, so a render
// hook would deliver stale bounds. No per-camera attribute change is needed.
export function installPreparedTreeFrustum(mesh,control){
 if(!mesh?.isInstancedMesh||!control?.value)return null;
 if(mesh.geometry.hasAttribute(NAME))throw new Error('Prepared tree cull already installed');
 const geometry=mesh.geometry,matrix=mesh.instanceMatrix,source=geometry.userData.treeWindSource||geometry,position=source.attributes.position,wind=source.attributes.aPlantWind;
 const positionVersion=position?.version,windVersion=wind?.version;
 const unknownDeformation=()=>mesh.isSkinnedMesh||mesh.material?.displacementMap||mesh.customDepthMaterial?.displacementMap||Object.keys(geometry.morphAttributes).length>0||Object.keys(source.morphAttributes).length>0;
 const bound=unknownDeformation()?null:treeCullSphere(geometry),capacity=matrix.count;
 const attr=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
 for(let i=0;i<capacity;i++)attr.array[i*4+3]=-1;
 geometry.setAttribute(NAME,attr);installPreparedTreeFrustumMaterial(mesh.material,control);installPreparedTreeFrustumMaterial(mesh.customDepthMaterial,control);
 const stats={supported:!!bound,bytes:attr.array.byteLength,builds:0,roots:0,unsupportedRoots:0,cpuMs:0};
 let version=-1,count=-1,dynamic=false;
 const record={attribute:attr,stats,sync(){
  if(mesh.geometry!==geometry||mesh.instanceMatrix!==matrix||matrix.count!==capacity)throw new Error('Reinstall prepared tree cull after resource replacement');
  if(mesh.count<0||mesh.count>capacity||!Number.isInteger(mesh.count))throw new RangeError('Invalid prepared tree root prefix');
  const changed=source.attributes.position!==position||source.attributes.aPlantWind!==wind||position?.version!==positionVersion||wind?.version!==windVersion||Boolean(unknownDeformation());
  if(version===matrix.version&&count===mesh.count&&dynamic===changed)return false;
  const start=performance.now();dynamic=changed;let unsupported=0;
  for(let i=0;i<mesh.count;i++)if(!transformTreeCullSphere(dynamic?null:bound,matrix.array,i*16,attr.array,i*4))unsupported++;
  // A growing prefix rebuilds its entries; old inactive values are never read.
  if(mesh.count){attr.addUpdateRange(0,mesh.count*4);attr.needsUpdate=true;}
  version=matrix.version;count=mesh.count;stats.builds++;stats.roots=count;stats.unsupportedRoots=unsupported;stats.cpuMs=performance.now()-start;return true;
 }};
 record.sync();return record;
}
