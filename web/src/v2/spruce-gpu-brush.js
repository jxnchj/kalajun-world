import {BRANCH_LOD_GLSL,branchFragment,branchReadyUniform} from './spruce-branch-detail.js';
import * as THREE from 'three';
export const GPU_BRUSH_TRIANGLES=1596;
const TEXTURE_WIDTH=1024;
function table(array){const height=Math.ceil(array.length/4/TEXTURE_WIDTH),data=new Float32Array(TEXTURE_WIDTH*height*4);data.set(array);const t=new THREE.DataTexture(data,TEXTURE_WIDTH,height,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
export function createGpuBrushTables(packet,woodOnly=false,{includeVariations=true}={}){let branchVariations=null;if(packet.sharedVariations&&includeVariations){const merged=new Float32Array(packet.variations.length+packet.sharedVariations.length);merged.set(packet.variations);merged.set(packet.sharedVariations,packet.variations.length);branchVariations=table(merged);}const textures={frames:woodOnly?null:table(packet.frames),variations:woodOnly?null:table(packet.variations),wood:table(packet.wood),branchLod:packet.branchLod?table(packet.branchLod):null,branchVariations};return{...textures,originalBrushes:packet.originalBrushes,count:packet.brushes,bytes:Object.values(textures).reduce((n,t)=>n+(t?.image.data.byteLength||0),0),dispose(){Object.values(textures).forEach(t=>t?.dispose());}};}
const centres=[[557.5,376.5],[381.5,607.5],[563.5,679.5],[563.5,442.5]];
export function createGpuBrushTemplate(topology){
 const codes=[],uv=[];
 for(let needle=0;needle<1440;needle++){
  const station=Math.floor(needle/5),ni=needle%5,pair=station<264?Math.floor(station/44):0,local=station<264?station%22:station-264,colour=(local+ni+pair)%4;
  const [x,y]=centres[colour];for(const [corner,dx,dy]of[[0,-.3,.3],[1,.3,.3],[2,0,-.3]]){codes.push(0,needle,corner);uv.push((x+dx)/2048,(y+dy)/1024);}
 }
 for(const [index,u,v]of topology){codes.push(1,index,0);uv.push(u,v);}
 if(codes.length!==1596*9)throw new Error('GPU brush template must retain 1440 needle and 156 twig triangles');
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(1596*9),3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(1596*9),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aBrushCode',new THREE.Float32BufferAttribute(codes,3));g.setAttribute('aPlantWind',new THREE.Float32BufferAttribute(new Float32Array(1596*9),3));g.setAttribute('aCrownOcclusion',new THREE.Float32BufferAttribute(new Float32Array(1596*3),1));return g;
}
export const GPU_BRUSH_GLSL=`
uniform sampler2D uBrushFrames;uniform sampler2D uBrushVariations;uniform sampler2D uBrushWood;uniform int uBrushCount;
attribute vec3 aBrushCode;
vec4 brushFetch(sampler2D t,int p){return texelFetch(t,ivec2(p%1024,p/1024),0);}
void readBrush(out vec3 p,out vec3 normal,out vec3 wind,out float ao){
 int brush=gl_InstanceID%uBrushCount;
 if(aBrushCode.x<.5){
  int needle=int(aBrushCode.y+.5),station=needle/5,j=(brush*288+station)*4;
  vec4 f0=brushFetch(uBrushFrames,j),f1=brushFetch(uBrushFrames,j+1),f2=brushFetch(uBrushFrames,j+2),f3=brushFetch(uBrushFrames,j+3);
  int n=brush*1440+needle;vec4 variation=brushFetch(uBrushVariations,n/2);vec2 al=n%2==0?variation.xy:variation.zw;
  vec3 delta=(f3.xyz*cos(al.x)+f2.xyz*sin(al.x))*al.y+f1.xyz*(al.y*.36);
  vec3 side=normalize(cross(delta,f1.xyz));p=f0.xyz+(aBrushCode.z>1.5?delta:side*(aBrushCode.z<.5?-.00115:.00115));
  normal=normalize(cross(side,delta));wind=vec3(f1.w,f2.w,f3.w);ao=f0.w;
 }else{
  int j=(brush*117+int(aBrushCode.y+.5))*3;vec4 w0=brushFetch(uBrushWood,j),w1=brushFetch(uBrushWood,j+1),w2=brushFetch(uBrushWood,j+2);
  p=w0.xyz;normal=w1.xyz;wind=vec3(w1.w,w2.xy);ao=w0.w;
 }
}
`;
const GPU_TWIG_GLSL=`
uniform sampler2D uBrushWood;uniform int uBrushCount;attribute vec3 aBrushCode;
vec4 brushFetch(sampler2D t,int p){return texelFetch(t,ivec2(p%1024,p/1024),0);}
void readBrush(out vec3 p,out vec3 normal,out vec3 wind,out float ao){
 int j=((gl_InstanceID%uBrushCount)*117+int(aBrushCode.y+.5))*3;
 vec4 w0=brushFetch(uBrushWood,j),w1=brushFetch(uBrushWood,j+1),w2=brushFetch(uBrushWood,j+2);
 p=w0.xyz;normal=w1.xyz;wind=vec3(w1.w,w2.xy);ao=w0.w;
}
`;
const GPU_PACKED_GLSL=`
uniform sampler2D uBrushFrames,uBrushVariations,uBrushWood;uniform int uBrushCount;attribute vec3 aBrushCode;
vec4 brushFetch(sampler2D t,int p){return texelFetch(t,ivec2(p%1024,p/1024),0);}
void readBrush(out vec3 p,out vec3 normal,out vec3 wind,out float ao){
 int brush=gl_InstanceID%uBrushCount;
 if(aBrushCode.x<.5){
  int needle=int(aBrushCode.y+.5),station=needle/5,j=(brush*288+station)*2;
  vec4 base=brushFetch(uBrushFrames,j),weights=brushFetch(uBrushFrames,j+1);
  int n=(brush*1440+needle)*2;vec4 delta=brushFetch(uBrushVariations,n),side=brushFetch(uBrushVariations,n+1);
  p=base.xyz+(aBrushCode.z>1.5?delta.xyz:side.xyz*(aBrushCode.z<.5?-.00115:.00115));
  normal=cross(side.xyz,delta.xyz)*delta.w;wind=weights.xyz;ao=base.w;
 }else{
  int j=(brush*117+int(aBrushCode.y+.5))*3;vec4 w0=brushFetch(uBrushWood,j),w1=brushFetch(uBrushWood,j+1),w2=brushFetch(uBrushWood,j+2);
  p=w0.xyz;normal=w1.xyz;wind=vec3(w1.w,w2.xy);ao=w0.w;
 }
}
`;
export function installGpuBrush(material,tables,{twigOnly=false,packed=false}={}){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  Object.assign(shader.uniforms,{uBrushFrames:{value:tables.frames},uBrushVariations:{value:tables.variations},uBrushWood:{value:tables.wood},uBrushCount:{value:tables.count}});
  let v=shader.vertexShader;
  if(!v.includes('// ECO_LOD_EARLY_END'))throw new Error('GPU brush requires shared tree LOD/wind hook first');
  v=v.replace('// ECO_LOD_EARLY_END','// ECO_LOD_EARLY_END\nvec3 brushPosition,brushNormal,brushWind;float brushAO;readBrush(brushPosition,brushNormal,brushWind,brushAO);');
  v=v.replaceAll('position.y','brushPosition.y').replace('ecoWeights=aPlantWind','ecoWeights=brushWind').replace('vCrownOcclusion=aCrownOcclusion','vCrownOcclusion=brushAO');
  v=v.replace('#include <begin_vertex>','vec3 transformed=brushPosition;').replace('#include <beginnormal_vertex>','vec3 objectNormal=brushNormal;\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif');
  let code=twigOnly?GPU_TWIG_GLSL:packed?GPU_PACKED_GLSL:GPU_BRUSH_GLSL;
  if(twigOnly&&tables.branchLod){v=v.replace('uniform vec3 uWorldViewer;','');
   shader.uniforms.uBranchLod={value:tables.branchLod};shader.uniforms.uBranchReady=branchReadyUniform;
   code=code.replace('gl_InstanceID%uBrushCount','(gl_InstanceID+int(aTreeRootBrushStart+.5))%uBrushCount');
   v=v.replace('// ECO_LOD_EARLY_END',`// ECO_LOD_EARLY_END
int branchIndex=(gl_InstanceID+int(aTreeRootBrushStart+.5))%uBrushCount;
vSpruceBranchFade=spruceBranchFade(texelFetch(uBranchLod,ivec2(branchIndex%1024,branchIndex/1024),0));
if(vSpruceBranchFade<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}`);
   code='uniform sampler2D uBranchLod; attribute float aTreeRootBrushStart;\n'+BRANCH_LOD_GLSL+code;branchFragment(shader);
  }
  shader.vertexShader=code+v;
 };material.customProgramCacheKey=()=>key+'-gpu-shared-brush-v1-'+twigOnly+'-'+packed+'-'+!!tables.branchLod;return material;
}
// A source geometry that never reached WebGLGeometries has no dispose listener.
// Retain at most one actually rendered wrapper for each shared VBO family until
// the pool closes. Its real Three listener then frees shared and private buffers.
export class GpuGeometryOwners{
 constructor(){this.owners=new Map();}
 register(mesh,key){mesh.userData.gpuOwnerKey=key;const mark=()=>{if(!this.owners.has(key))this.owners.set(key,mesh.geometry);};mesh.onBeforeRender=mark;mesh.onBeforeShadow=mark;}
 release(mesh){if(this.owners.get(mesh.userData.gpuOwnerKey)===mesh.geometry)mesh.dispose();else releaseContainer(mesh);}
 disposeKey(key){const g=this.owners.get(key);if(g){g.dispose();this.owners.delete(key);}}
 dispose(){for(const g of new Set(this.owners.values()))g.dispose();this.owners.clear();}
}
function releaseContainer(mesh){
 for(const name of Object.keys(mesh.geometry.attributes))if(!name.startsWith('aTreeRoot')&&!mesh.geometry.userData.privateGpuAttributes?.includes(name))mesh.geometry.deleteAttribute(name);mesh.geometry.setIndex(null);mesh.geometry.dispose();mesh.dispose();
}
// Root wind continues to collect normal root batches ONLY. A GPU brush batch
// mirrors their active prefix; its instance divisor repeats each root per brush.
export class SpruceGpuBrushes{
 constructor(forms,template){this.forms=forms;this.template=template;this.group=new THREE.Group();this.group.name='shared-gpu-needle-brushes';this.batches=new Map();this.owners=new GpuGeometryOwners();this.stats={representation:'GPU shared 1596-triangle brush; parameter texture fetches',batches:0,roots:0,brushInstances:0,triangles:0,tableBytes:forms.reduce((n,f)=>n+f.tables.bytes,0),templateBytes:Object.values(template.attributes).reduce((n,a)=>n+a.array.byteLength,0)};}
 sync(rootBatches){
  const wanted=new Set();let roots=0,instances=0;
  for(const [key,b]of rootBatches){if(b.mode!==12||!b.mesh.material.userData.gpuBrushSource)continue;wanted.add(key);const form=this.forms[b.variant],source=b.mesh;let item=this.batches.get(key);
   if(!item){
    const g=new THREE.BufferGeometry();for(const [name,a]of Object.entries(this.template.attributes))g.setAttribute(name,a);
    const w=source.geometry.attributes.aTreeRootWind.data,wind=new THREE.InstancedInterleavedBuffer(w.array,5,form.tables.count);wind.setUsage(THREE.DynamicDrawUsage);
    g.userData.ecologyWindAttributes=['aTreeRootWind','aTreeRootEddy'];g.setAttribute('aTreeRootWind',new THREE.InterleavedBufferAttribute(wind,4,0));g.setAttribute('aTreeRootEddy',new THREE.InterleavedBufferAttribute(wind,1,4));
    const mesh=new THREE.InstancedMesh(g,form.material,0);mesh.instanceMatrix=new THREE.InstancedBufferAttribute(source.instanceMatrix.array,16,false,form.tables.count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.customDepthMaterial=form.depth;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=true;
    this.owners.register(mesh,'brush-template');mesh.name='gpu-brush-'+key;mesh.raycast=()=>{};mesh.boundingBox=new THREE.Box3();mesh.boundingSphere=new THREE.Sphere();this.group.add(mesh);item={mesh,wind,matrixVersion:-1,windVersion:-1,source};this.batches.set(key,item);
   }
   const mesh=item.mesh;mesh.count=source.count*form.tables.count;mesh.visible=source.visible;
   if(item.matrixVersion!==source.instanceMatrix.version){mesh.instanceMatrix.needsUpdate=true;item.matrixVersion=source.instanceMatrix.version;}
   const windSource=source.geometry.attributes.aTreeRootWind.data;
   if(item.windVersion!==windSource.version){item.wind.needsUpdate=true;item.windVersion=windSource.version;}
   // Source is bounded using the complete original crown, not the placeholder
   // template or root*brushCount matrices (only root matrices are stored).
   if(!source.boundingBox||!source.boundingSphere)throw new Error('GPU spruce requires complete root crown bounds');
   if(!mesh.boundingBox.equals(source.boundingBox)||!mesh.boundingSphere.equals(source.boundingSphere)){mesh.boundingBox.copy(source.boundingBox);mesh.boundingSphere.copy(source.boundingSphere);}
   roots+=source.count;instances+=mesh.count;
  }
  for(const [key,item]of this.batches)if(!wanted.has(key)){this.group.remove(item.mesh);this.owners.release(item.mesh);this.batches.delete(key);}
  Object.assign(this.stats,{batches:this.batches.size,roots,brushInstances:instances,triangles:instances*GPU_BRUSH_TRIANGLES});return this.stats;
 }
 dispose(){for(const {mesh}of this.batches.values()){this.group.remove(mesh);this.owners.release(mesh);}this.batches.clear();this.owners.dispose();this.template.dispose();for(const f of this.forms){f.tables.dispose();f.depth.dispose();}this.group.clear();}
}
