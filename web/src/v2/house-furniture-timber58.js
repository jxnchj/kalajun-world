import * as T from 'three';
import {HOUSE_TIMBER48_ENTITY} from './house-timber48.js';
import {sourceTimberMean48,timberLinearMean48} from './house-timber-textures48.js';
export const HOUSE_FURNITURE58_NAMES=Object.freeze(['pastoral_house_sleep_platform','pastoral_house_chest_body','pastoral_house_chest_lid','pastoral_house_window_bench','pastoral_house_bench_leg','pastoral_house_bench_leg.001']);
// Adopted after build61 desktop visual, door/GI and neighbor-isolation acceptance.
// Explicit 0 restores the original furniture; the timber48 rollback also keeps
// its original complete appearance unless furniture is explicitly requested.
export const houseFurniture58Enabled=(search=globalThis.location?.search??'',timberEnabled=new URLSearchParams(search).get('houseTimber48')!=='0')=>{
 const value=new URLSearchParams(search).get('houseFurniture58');
 return value==='1'||(value===null&&timberEnabled);
};
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
// Independent API only. Caller integrates after accepted timber48 preparation,
// propagates the added source attribute through its existing near/far assembler,
// and owns the borrowed texture lifetime. No global/runtime installation here.
export async function prepareHouseFurniture58(assetId,scene,world,{enabled=houseFurniture58Enabled(),timberOwner,load=async()=>{const r=await fetch('./assets/v2/house-furniture58/fields.json');if(!r.ok)throw Error('Furniture58 HTTP '+r.status);return r.json();}}={}){
 if(!enabled||assetId!=='house_a'||!world.entities.some(e=>e.id===HOUSE_TIMBER48_ENTITY&&e.assetId==='house_a'))return null;
 if(!timberOwner?.textures?.color||!timberOwner.textures.numeric||!timberOwner.anchors?.[0])throw Error('Furniture58 requires accepted timber48 texture owner');
 const data=await load(),names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',TANGENT:'tangent'},pending=[],materials=new Set();
 if(data.version!==58||data.entityId!==HOUSE_TIMBER48_ENTITY||data.nodes?.length!==HOUSE_FURNITURE58_NAMES.length)throw Error('Furniture58 source identity');
 const seen=new Set();
 for(const record of data.nodes){
  if(!HOUSE_FURNITURE58_NAMES.includes(record.name)||seen.has(record.name))throw Error('Furniture58 source node set');seen.add(record.name);
  const mesh=scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(record.name));
  if(!mesh?.isMesh||Array.isArray(mesh.material))throw Error('Furniture58 missing actual node '+record.name);
  for(const [key,value]of Object.entries(record.binding)){const attr=key==='index'?mesh.geometry.index:mesh.geometry.attributes[names[key]];if(!attr||await hash(attr)!==value)throw Error('Furniture58 original buffer differs '+record.name+'/'+key);}
  for(const key of ['POSITION','NORMAL','TEXCOORD_0','COLOR_0','index'])if(!record.binding[key])throw Error('Furniture58 incomplete binding '+key);
  const raw=Uint8Array.from(atob(record.field),x=>x.charCodeAt(0)),field=new Float32Array(raw.buffer);
  if(record.count!==mesh.geometry.attributes.position.count||field.length!==record.count*4||!field.every(Number.isFinite))throw Error('Furniture58 invalid field');
  for(let i=2;i<field.length;i+=4)if(field[i]!==0&&field[i]!==1)throw Error('Furniture58 invalid face kind');
  pending.push({mesh,field});materials.add(mesh.material);
 }
 const array=timberOwner.textures.color,raw=array.image?.data,size=array.image?.width*array.image?.height*4;
 const endMean=data.endLinearMean??(raw&&size?timberLinearMean48(raw.subarray(size,size*2)):null);
 const longMean=array.userData.linearMean48;
 if(![endMean,longMean].every(v=>v?.length===3&&v.every(n=>Number.isFinite(n)&&n>0)))throw Error('Furniture58 missing physical texture means');
 // Publish only after every actual node and all original buffers validate.
 for(const {mesh,field}of pending)mesh.geometry.setAttribute('aHouseFurniture58',new T.Float32BufferAttribute(field,4));
 scene.traverse(mesh=>{if(!mesh.isMesh||mesh.geometry.hasAttribute('aHouseFurniture58'))return;const a=new Float32Array(mesh.geometry.attributes.position.count*4);for(let i=2;i<a.length;i+=4)a[i]=-1;mesh.geometry.setAttribute('aHouseFurniture58',new T.Float32BufferAttribute(a,4));});
 return {data,materials,textures:timberOwner.textures,anchor:timberOwner.anchors[0],longMean,endMean,stats:{enabled:true,entityId:HOUSE_TIMBER48_ENTITY,nodes:pending.length,vertices:pending.reduce((n,p)=>n+p.field.length/4,0),borrowedTextures:true,sourceGeometryChanged:false},dispose(){/* Borrowed textures and source geometry remain caller-owned. */}};
}
export function installHouseFurniture58(material,source,owner,{sourceMean=sourceTimberMean48}={}){
 if(!owner?.materials.has(source))return false;
 const prior=material.onBeforeCompile,key=material.customProgramCacheKey(),shared=Boolean(material.userData.houseTimber48),mean=sourceMean(source.map);
 if(!mean?.every(v=>Number.isFinite(v)&&v>=0))throw Error('Furniture58 source colour mean');
 material.onBeforeCompile=(s,...args)=>{
  prior.call(material,s,...args);
  if(shared&&(s.uniforms.uHouseWood48?.value!==owner.textures.color||s.uniforms.uHouseNumeric48?.value!==owner.textures.numeric))throw Error('Furniture58 shared texture owner mismatch');
  if(!shared){s.uniforms.uHouseWood48={value:owner.textures.color};s.uniforms.uHouseNumeric48={value:owner.textures.numeric};s.fragmentShader='uniform highp sampler2DArray uHouseWood48;uniform sampler2D uHouseNumeric48;\n'+s.fragmentShader;
   if(material.roughnessMap&&material.roughnessMap===material.metalnessMap)s.fragmentShader=s.fragmentShader.replace('#include <metalnessmap_fragment>',T.ShaderChunk.metalnessmap_fragment.replace('texture2D( metalnessMap,','texture2D( roughnessMap,'));
  }
  Object.assign(s.uniforms,{uFurnitureAnchor58:{value:owner.anchor},uFurnitureBase58:{value:new T.Vector3(...mean)},uFurnitureLongMean58:{value:new T.Vector3(...owner.longMean)},uFurnitureEndMean58:{value:new T.Vector3(...owner.endMean)}});
  s.vertexShader='attribute vec4 aHouseFurniture58;varying vec4 vFurniture58;varying float vFurnitureTarget58;uniform vec3 uFurnitureAnchor58;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vFurniture58=aHouseFurniture58;
vec4 furnitureOrigin58=vec4(0.,0.,0.,1.);
#ifdef USE_INSTANCING
furnitureOrigin58=instanceMatrix*furnitureOrigin58;
#endif
vFurnitureTarget58=distance((modelMatrix*furnitureOrigin58).xyz,uFurnitureAnchor58)<.025?1.:0.;`);
  s.fragmentShader=s.fragmentShader.replace('uniform highp sampler2DArray uHouseWood48;','').replace('uniform sampler2D uHouseNumeric48;','');
  s.fragmentShader=`uniform highp sampler2DArray uHouseWood48;uniform sampler2D uHouseNumeric48;varying vec4 vFurniture58;varying float vFurnitureTarget58;uniform vec3 uFurnitureBase58,uFurnitureLongMean58,uFurnitureEndMean58;
vec3 furnitureNormal58(vec3 n,vec2 uv,vec3 viewPos){vec3 dp1=dFdx(-viewPos),dp2=dFdy(-viewPos);vec2 du1=dFdx(uv),du2=dFdy(uv);vec3 p2=cross(dp2,n),p1=cross(n,dp1);vec3 t=p2*du1.x+p1*du2.x,b=p2*du1.y+p1*du2.y;float f=inversesqrt(max(max(dot(t,t),dot(b,b)),1e-12));vec3 q=texture2D(uHouseNumeric48,uv).xyz*2.-1.;q.xy*=.07;return normalize(mat3(t*f,b*f,n)*normalize(q));}
`+s.fragmentShader;
  // Insert AFTER previous timber48 work, not before an anchor it overrides.
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`if(vFurnitureTarget58>.5&&vFurniture58.z>-.5){bool end58=vFurniture58.z>.5;vec3 fibre58=texture(uHouseWood48,vec3(end58?vFurniture58.xy/4.:vFurniture58.xy,end58?1.:0.)).rgb/max(end58?uFurnitureEndMean58:uFurnitureLongMean58,vec3(.0001));diffuseColor.rgb=diffuse*uFurnitureBase58*mix(vec3(1.),fibre58,end58?.32:.24);}
#include <color_fragment>`);
  // Finalize after prior timber48 normals/roughness, regardless of its ORM alias.
  s.fragmentShader=s.fragmentShader.replace('#include <clearcoat_normal_fragment_begin>',`if(vFurnitureTarget58>.5&&vFurniture58.z>-.5){roughnessFactor=vFurniture58.z>.5?.62:.44+.22*texture2D(uHouseNumeric48,vFurniture58.xy).a;if(vFurniture58.z<.5)normal=furnitureNormal58(normal,vFurniture58.xy,vViewPosition);}
#include <clearcoat_normal_fragment_begin>`);
 };
 material.customProgramCacheKey=()=>key+'-house-furniture58';material.userData.houseFurniture58=owner.stats;return true;
}
