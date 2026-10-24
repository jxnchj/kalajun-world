import * as THREE from 'three';
import {loadLodgeWoodTexture} from './lodge-wood.js';
import {cabinWindowTarget} from './cabin-window-glass.js';
export const cabinTimberEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('cabinTimber')!=='0';
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
export async function prepareCabinTimber(assetId,scene,{enabled=false,sourceSHA256,textureLoader=loadLodgeWoodTexture,load=()=>Promise.all([import('./generated/cabin-timber-38.json',{with:{type:'json'}}),import('./generated/lodge-wood-surfaces-38.json',{with:{type:'json'}})]).then(a=>a.map(m=>m.default))}={}){
 if(!enabled||assetId!=='cabin_small')return null;
 const [layout,surfaces]=await load();if(sourceSHA256!==layout.sourceSHA256)throw Error('Cabin timber original source SHA differs');
 const attrs={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',TANGENT:'tangent'},nodes=[];
 for(const r of layout.nodes){const node=scene.getObjectByName(r.name);if(!node?.isMesh)throw Error('Cabin timber node missing');
  for(const [key,digest]of Object.entries(r.binding)){const a=key==='index'?node.geometry.index:node.geometry.attributes[attrs[key]];if(!a||a.isInterleavedBufferAttribute||await sha(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))!==digest)throw Error('Cabin timber original geometry/AO mismatch '+r.name+'/'+key);}
  const bytes=Uint8Array.from(atob(r.field),c=>c.charCodeAt(0));if(bytes.length!==r.count*16)throw Error('Cabin timber field mismatch');nodes.push({node,field:new Float32Array(bytes.buffer),record:r});
 }
 const textures={},results=await Promise.allSettled(['color','normal','roughness'].map(async key=>textures[key]=await textureLoader(surfaces.maps[key],key)));
 if(results.some(r=>r.status==='rejected')){Object.values(textures).forEach(t=>t.dispose());throw new AggregateError(results.filter(r=>r.status==='rejected').map(r=>r.reason),'Cabin timber texture load failed');}
 // Additional sampling coordinates only: original indices, position, normal, UV and AO remain byte-identical.
 for(const {node,field}of nodes)node.geometry.setAttribute('aCabinTimber',new THREE.Float32BufferAttribute(field,4));
 // Original door planks share the roof-plank material when doors are not captured.
 // Neutral fields preserve that exact original merge/index order and collision buffer.
 scene.traverse(node=>{if(!node.isMesh||node.geometry.hasAttribute('aCabinTimber')||!nodes.some(r=>r.node.material===node.material))return;const field=new Float32Array(node.geometry.attributes.position.count*4);for(let i=2;i<field.length;i+=4)field[i]=-1;node.geometry.setAttribute('aCabinTimber',new THREE.Float32BufferAttribute(field,4));});
 return {layout,surfaces,textures,stats:{active:true,sourceOriginalCase:'cabin_small.glb',sourceSHA256:layout.sourceSHA256,entityId:layout.entityId,components:5,textureBytes:['color','normal','roughness'].reduce((n,k)=>n+surfaces.maps[k].bytes,0),endTreatment:layout.endTreatment}};
}
export const isCabinTimberPart=(part,data)=>Boolean(data&&part.geometry.hasAttribute('aCabinTimber')&&data.layout.nodes.some(r=>part.names.includes(r.name)));
export const cabinTimberTarget=cabinWindowTarget;
export function createCabinTimberMaterial(source,part,data){
 const record=data.layout.nodes.find(r=>part.names.includes(r.name)),m=source.clone(),previous=source.onBeforeCompile,key=source.customProgramCacheKey();
 m.normalMap=data.textures.normal;m.roughnessMap=data.textures.roughness;m.userData={...source.userData,cabinTimber:data.stats};
 m.onBeforeCompile=(shader,...args)=>{previous.call(m,shader,...args);
  Object.assign(shader.uniforms,{uCabinTimberMap:{value:data.textures.color},uCabinTimberFactor:{value:new THREE.Vector3(...record.materialMean.map((v,i)=>v/data.surfaces.sourceLinearMean[i]))},uCabinTimberMetres:{value:data.surfaces.metres}});
  shader.vertexShader='attribute vec4 aCabinTimber; varying vec4 vCabinTimber;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vCabinTimber=aCabinTimber;
#ifdef USE_INSTANCING
 vec3 timberScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
 vCabinTimber.xy*=aCabinTimber.z<.5?vec2(timberScale.x,length(vec2(timberScale.z*.8660254,timberScale.y*.5))):vec2(sqrt(timberScale.y*timberScale.z),timberScale.x);
#endif`);
  shader.fragmentShader=`varying vec4 vCabinTimber;
uniform sampler2D uCabinTimberMap; uniform vec3 uCabinTimberFactor; uniform float uCabinTimberMetres;
vec2 cabinTimberUv(){return vCabinTimber.xy/uCabinTimberMetres+fract(vec2(vCabinTimber.w*17.31,vCabinTimber.w*31.73));}
`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
 if(vCabinTimber.z>-.5){
  // Replace only this component's albedo. Do not divide by the legacy dark knots.
  diffuseColor=vec4(diffuse,opacity)*vec4(texture2D(uCabinTimberMap,cabinTimberUv()).rgb*uCabinTimberFactor,1.);
 }
#endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=roughness;
if(vCabinTimber.z>-.5)roughnessFactor=.70+.22*texture2D(roughnessMap,cabinTimberUv()).g;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`if(vCabinTimber.z>-.5){
 vec3 n=texture2D(normalMap,cabinTimberUv()).xyz*2.-1.;n.xy*=.22;
 mat3 frame=getTangentFrame(-vViewPosition,normal,vCabinTimber.xy);
 #ifdef DOUBLE_SIDED
 frame[0]*=faceDirection;frame[1]*=faceDirection;
 #endif
 normal=normalize(frame*normalize(n));
}`);
 };
 m.customProgramCacheKey=()=>key+'-cabin-timber-38-'+record.name;return m;
}
