import {Frustum, Matrix4, InstancedBufferAttribute, DynamicDrawUsage, Vector4} from 'three';
import {treeCullSphere} from './tree-frustum-cull.js';
const materials=new WeakMap();
// CPU-normalized current-camera planes; no per-vertex matrix construction.
export const TREE_WORLD_FRUSTUM_GLSL=`
attribute vec4 aTreeWorldSphere;
uniform vec4 uTreeWorldPlanes[6];
uniform float uTreeWorldCull;
bool treeOutsideWorldView(){
 if(aTreeWorldSphere.w<0.)return false;
 for(int i=0;i<6;i++)if(dot(uTreeWorldPlanes[i].xyz,aTreeWorldSphere.xyz)+uTreeWorldPlanes[i].w < -aTreeWorldSphere.w)return true;
 return false;
}
`;
function materialState(material,control){
 let state=materials.get(material);if(state)return state;
 const planes=Array.from({length:6},()=>new Vector4()),matrix=new Matrix4(),projection=new Matrix4(),view=new Matrix4(),frustum=new Frustum();let ready=false;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);
  if(!shader.vertexShader.includes('// ECO_LOD_EARLY_BEGIN'))throw Error('World tree frustum requires ecology LOD hook');
  shader.uniforms.uTreeWorldPlanes={value:planes};shader.uniforms.uTreeWorldCull=control;
  shader.vertexShader=TREE_WORLD_FRUSTUM_GLSL+shader.vertexShader.replace('// ECO_LOD_EARLY_BEGIN',`// ECO_LOD_EARLY_BEGIN
if(uTreeWorldCull>.5 && treeOutsideWorldView()){gl_Position=vec4(2.,2.,2.,1.);return;}`);
 };material.customProgramCacheKey=()=>key+'-world-tree-frustum-v38';
 state={setCamera(camera){if(ready&&projection.equals(camera.projectionMatrix)&&view.equals(camera.matrixWorldInverse))return;ready=true;projection.copy(camera.projectionMatrix);view.copy(camera.matrixWorldInverse);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix,camera.coordinateSystem,camera.reversedDepth);for(let i=0;i<6;i++){const p=frustum.planes[i];planes[i].set(p.normal.x,p.normal.y,p.normal.z,p.constant);}}};
 materials.set(material,state);return state;
}
export function installTreeWorldFrustum(mesh,control){
 if(!mesh.isInstancedMesh||mesh.geometry.hasAttribute('aTreeWorldSphere'))return false;
 const bound=treeCullSphere(mesh.geometry);
 const data=new Float32Array(mesh.instanceMatrix.count*4),attribute=new InstancedBufferAttribute(data,4).setUsage(DynamicDrawUsage);
 for(let i=3;i<data.length;i+=4)data[i]=-1;mesh.geometry.setAttribute('aTreeWorldSphere',attribute);
 const sourceMatrix=mesh.instanceMatrix,matrix=new Matrix4(),world=new Matrix4();let version=-1,count=-1,valid=false;
 const local=bound?Array.from(bound):null,stats={builds:0,roots:0,bytes:data.byteLength,unsupportedBounds:!bound};mesh.userData.treeWorldFrustum=stats;
 const sync=()=>{
  if(!bound)return;
  if(mesh.instanceMatrix!==sourceMatrix)throw Error('Reinstall tree world bounds after matrix buffer replacement');
  if(valid&&version===sourceMatrix.version&&count===mesh.count&&world.equals(mesh.matrixWorld))return;
  world.copy(mesh.matrixWorld);
  for(let i=0;i<mesh.count;i++){
   matrix.fromArray(sourceMatrix.array,i*16).premultiply(world);const e=matrix.elements;
   const x=e[0]*local[0]+e[4]*local[1]+e[8]*local[2]+e[12],y=e[1]*local[0]+e[5]*local[1]+e[9]*local[2]+e[13],z=e[2]*local[0]+e[6]*local[1]+e[10]*local[2]+e[14];
   // Spectral norm <= sqrt(||A||_1 ||A||_infinity), including shear.
   const one=Math.max(Math.abs(e[0])+Math.abs(e[1])+Math.abs(e[2]),Math.abs(e[4])+Math.abs(e[5])+Math.abs(e[6]),Math.abs(e[8])+Math.abs(e[9])+Math.abs(e[10]));
   const inf=Math.max(Math.abs(e[0])+Math.abs(e[4])+Math.abs(e[8]),Math.abs(e[1])+Math.abs(e[5])+Math.abs(e[9]),Math.abs(e[2])+Math.abs(e[6])+Math.abs(e[10]));
   const offset=i*4;data[offset]=x;data[offset+1]=y;data[offset+2]=z;
   const rounding=Math.hypot(x-data[offset],y-data[offset+1],z-data[offset+2]);
   data[offset+3]=(local[3]*Math.sqrt(one*inf)+rounding+.04+Math.max(Math.abs(x),Math.abs(y),Math.abs(z))*.000002)*(1+2**-22);
  }
  attribute.clearUpdateRanges();attribute.addUpdateRange(0,mesh.count*4);attribute.needsUpdate=true;version=sourceMatrix.version;count=mesh.count;valid=true;stats.builds++;stats.roots=mesh.count;
 };
 const intersects=mesh.intersectsFrustum,before=mesh.onBeforeRender,shadow=mesh.onBeforeShadow;
 const colour=materialState(mesh.material,control),depth=materialState(mesh.customDepthMaterial,control);
 mesh.intersectsFrustum=function(f){const visible=intersects.call(this,f);if(visible)sync();return visible;};
 mesh.onBeforeRender=function(...args){before.apply(this,args);colour.setCamera(args[2]);};
 mesh.onBeforeShadow=function(...args){shadow.apply(this,args);depth.setCamera(args[3]);};
 return {sync,stats,attribute};
}
