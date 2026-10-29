import {combineHouseTimberTextures48,sourceTimberMean48} from './house-timber-textures48.js';
import * as T from 'three';
export const HOUSE_TIMBER48_ENTITY='cabins:-1743,3612:30f9adc9fb584805';
export const houseTimber48Enabled=(search=globalThis.location?.search??'')=>new URLSearchParams(search).get('houseTimber48')!=='0';
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
export async function prepareHouseTimber48(assetId,scene,world,{enabled=houseTimber48Enabled(),load=async()=>{const r=await fetch('./assets/v2/house-timber48/fields.json');if(!r.ok)throw Error('House timber field HTTP '+r.status);return r.json();},combineTextures=combineHouseTimberTextures48,textureLoader=async(file,kind)=>{const t=await new T.TextureLoader().loadAsync('./assets/v2/boardwalk/'+file);t.colorSpace=kind==='color'||kind==='end'?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;t.flipY=true;return t;}}={}){
 const entity=world.entities.find(e=>e.id===HOUSE_TIMBER48_ENTITY&&e.assetId==='house_a');if(!enabled||assetId!=='house_a'||!entity)return null;
 const data=await load(),names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',TANGENT:'tangent'},materials=new Set(),pending=[];if(data.version!==48||data.entityId!==entity.id)throw Error('House timber source identity mismatch');
 for(const r of data.nodes){const n=scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(r.name));if(!n?.isMesh||Array.isArray(n.material))throw Error('House timber missing source '+r.name);for(const [k,v]of Object.entries(r.binding)){const a=k==='index'?n.geometry.index:n.geometry.attributes[names[k]];if(!a||await hash(a)!==v)throw Error('House timber original buffer differs '+r.name+'/'+k);}const raw=Uint8Array.from(atob(r.field),x=>x.charCodeAt(0)),field=new Float32Array(raw.buffer);if(field.length!==r.count*4||!field.every(Number.isFinite))throw Error('House timber invalid field');materials.add(n.material);pending.push({n,field});}
 let textures={};try{for(const[k,f]of Object.entries({color:'rough_wood_diff_1k.jpg',normal:'rough_wood_nor_gl_1k.jpg',rough:'rough_wood_rough_1k.jpg',end:'wood_end.png'}))textures[k]=await textureLoader(f,k);const originals=textures;textures=combineTextures(originals);Object.values(originals).forEach(t=>t.dispose());}catch(e){Object.values(textures).forEach(t=>t.dispose());throw e;}
 for(const {n,field}of pending)n.geometry.setAttribute('aHouseTimber48',new T.Float32BufferAttribute(field,4));
 scene.traverse(n=>{if(!n.isMesh||n.geometry.hasAttribute('aHouseTimber48'))return;const field=new Float32Array(n.geometry.attributes.position.count*4);for(let i=2;i<field.length;i+=4)field[i]=-1;n.geometry.setAttribute('aHouseTimber48',new T.Float32BufferAttribute(field,4));});
 const pose=world.surface.buildingPose(entity),matrix=new T.Matrix4().compose(new T.Vector3(pose.x,pose.y,pose.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),pose.rot),new T.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));scene.updateMatrixWorld(true);
 const anchors=[new T.Vector3(pose.x,pose.y,pose.z)];scene.traverse(n=>{if(/^house_a_door\d+$/.test(n.name))anchors.push(new T.Vector3().setFromMatrixPosition(n.matrixWorld).applyMatrix4(matrix));});if(anchors.length!==2)throw Error('House timber expects one original dynamic door');
 return {data,materials,textures,anchors,stats:{enabled:true,entityId:entity.id,nodes:pending.length,vertices:pending.reduce((v,x)=>v+x.field.length/4,0),interior:'planed normal .07, roughness .44-.66; original mean colour',exterior:'rough normal .23, roughness .70-.95',preparedMode:'source-reprepare when combined'}};
}
export function installHouseTimber48(material,source,owner){if(!owner?.materials.has(source))return false;const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),factor=owner.data.materialFactors[source.name+'/long']??[1,1,1],endFactor=owner.data.materialFactors[source.name+'/end']??factor,finished=sourceTimberMean48(source.map),scanMean=owner.textures.color.userData.linearMean48??[1,1,1];
 material.onBeforeCompile=(s,...args)=>{previous.call(material,s,...args);Object.assign(s.uniforms,{uHouseWood48:{value:owner.textures.color},uHouseNumeric48:{value:owner.textures.numeric},uHouseFinishedBase48:{value:new T.Vector3(...finished)},uHouseScanMean48:{value:new T.Vector3(...scanMean)},uHouseFactor48:{value:new T.Vector3(...factor)},uHouseEndFactor48:{value:new T.Vector3(...endFactor)},uHouseAnchors48:{value:owner.anchors}});
 // GLTF ORM channels share the exact same Texture; retain metallic UV and B channel.
 if(material.roughnessMap&&material.roughnessMap===material.metalnessMap)s.fragmentShader=s.fragmentShader.replace('#include <metalnessmap_fragment>',T.ShaderChunk.metalnessmap_fragment.replace('texture2D( metalnessMap,','texture2D( roughnessMap,'));
 s.vertexShader='attribute vec4 aHouseTimber48; varying vec4 vHouseTimber48; varying float vHouseTarget48; uniform vec3 uHouseAnchors48[2];\n'+s.vertexShader;
 s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vHouseTimber48=aHouseTimber48;
vec4 houseOrigin48=vec4(0.,0.,0.,1.);
#ifdef USE_INSTANCING
houseOrigin48=instanceMatrix*houseOrigin48;
#endif
houseOrigin48=modelMatrix*houseOrigin48;
vHouseTarget48=min(distance(houseOrigin48.xyz,uHouseAnchors48[0]),distance(houseOrigin48.xyz,uHouseAnchors48[1]))<.025?1.:0.;`);
 s.fragmentShader=`varying vec4 vHouseTimber48;varying float vHouseTarget48;uniform highp sampler2DArray uHouseWood48;uniform sampler2D uHouseNumeric48;uniform vec3 uHouseFactor48,uHouseEndFactor48,uHouseFinishedBase48,uHouseScanMean48;
vec3 houseNormal48(vec3 n,vec2 uv,vec3 viewPos){vec3 dp1=dFdx(-viewPos),dp2=dFdy(-viewPos);vec2 du1=dFdx(uv),du2=dFdy(uv);vec3 p2=cross(dp2,n),p1=cross(n,dp1);vec3 t=p2*du1.x+p1*du2.x,b=p2*du1.y+p1*du2.y;float f=inversesqrt(max(max(dot(t,t),dot(b,b)),1e-12));vec3 q=texture2D(uHouseNumeric48,uv).xyz*2.-1.;q.xy*=mix(.23,.07,vHouseTimber48.w);return normalize(mat3(t*f,b*f,n)*normalize(q));}
`+s.fragmentShader;
 s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
if(vHouseTarget48>.5&&vHouseTimber48.z>-.5){vec3 wood=vHouseTimber48.z>.5?texture(uHouseWood48,vec3(vHouseTimber48.xy/4.,1.)).rgb*uHouseEndFactor48:texture(uHouseWood48,vec3(vHouseTimber48.xy,0.)).rgb*uHouseFactor48;if(vHouseTimber48.w>.5&&vHouseTimber48.z<.5){vec3 fibre=texture(uHouseWood48,vec3(vHouseTimber48.xy,0.)).rgb/max(uHouseScanMean48,vec3(.0001));wood=uHouseFinishedBase48*mix(vec3(1.),fibre,.24);}diffuseColor.rgb=diffuse*wood;}`);
 s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
if(vHouseTarget48>.5&&vHouseTimber48.z>-.5){float scan=texture2D(uHouseNumeric48,vHouseTimber48.xy).a;roughnessFactor=vHouseTimber48.z>.5?mix(.9,.6,vHouseTimber48.w):mix(.70+.25*scan,.44+.22*scan,vHouseTimber48.w);}`);
 s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
if(vHouseTarget48>.5&&vHouseTimber48.z>-.5&&vHouseTimber48.z<.5)normal=houseNormal48(normal,vHouseTimber48.xy,vViewPosition);`);
 };material.customProgramCacheKey=()=>key+'-house-timber48';material.userData.houseTimber48=owner.stats;return true;
}
