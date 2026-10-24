import * as THREE from 'three';
const materialBindings=new WeakMap();
export const lodgeWoodEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('lodgeWood')==='1';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function loadLodgeWoodTexture(record,channel,bitmapOptions={imageOrientation:'flipY'}){
 const response=await fetch('./assets/v2/lodge-wood/'+record.file+'?v='+record.sha256);if(!response.ok)throw Error('Lodge wood texture HTTP '+response.status);
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==record.bytes||await hash(bytes)!==record.sha256)throw Error('Lodge wood texture checksum mismatch');
 const bitmap=await createImageBitmap(new Blob([bytes]),bitmapOptions),texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=['color','end'].includes(channel)?THREE.SRGBColorSpace:THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;texture.needsUpdate=true;texture.addEventListener('dispose',()=>bitmap.close());return texture;
}
export async function prepareLodgeWood(assetId,scene,{enabled=lodgeWoodEnabled(),sourceSHA256,load=()=>Promise.all([import('./generated/lodge-wood-38.json',{with:{type:'json'}}),import('./generated/lodge-wood-surfaces-38.json',{with:{type:'json'}})]).then(a=>a.map(m=>m.default)),textureLoader=loadLodgeWoodTexture}={}){
 if(!enabled||assetId!=='gh_lanchuan_lodge')return {active:false};
 const [layout,surfaces]=await load(),nodes=[];
 if(sourceSHA256!==layout.sourceSHA256)throw Error('Lodge wood source manifest differs');
 const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',TANGENT:'tangent',index:'index'};
 for(const record of layout.nodes){const node=scene.getObjectByName(record.name);if(!node?.isMesh||Array.isArray(node.material)||!['plank','pine'].includes(node.material.name)||Math.abs(node.material.roughness-.9)>1e-5)throw Error('Lodge wood original material/mesh differs');
  for(const [name,digest]of Object.entries(record.binding)){const a=name==='index'?node.geometry.index:node.geometry.attributes[names[name]];if(!a||a.isInterleavedBufferAttribute||await hash(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))!==digest)throw Error('Lodge wood original geometry/AO/UV differs: '+record.name+'/'+name);}
  const b=Uint8Array.from(atob(record.field),c=>c.charCodeAt(0));if(b.length!==record.count*16)throw Error('Lodge wood field length differs');nodes.push({node,record,field:new Float32Array(b.buffer)});
 }
 const textures={},results=await Promise.allSettled(Object.entries(surfaces.maps).map(async([name,record])=>textures[name]=await textureLoader(record,name)));
 const failures=results.filter(r=>r.status==='rejected');if(failures.length){for(const t of Object.values(textures))t.dispose();throw new AggregateError(failures.map(r=>r.reason),'Lodge wood texture preparation failed');}
 for(const {node,field}of nodes){const old=node.material,m=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(m,old);m.clearcoat=1;m.clearcoatRoughness=.3;m.map=textures.color;m.normalMap=textures.normal;m.normalScale.set(1,1);m.roughnessMap=textures.roughness;
  m.userData={...old.userData,lodgeWood:{version:layout.version,giMean:surfaces.giTargetLinear}};materialBindings.set(m,{legacyMap:old.map,legacyRoughness:old.roughness,textures,surfaces});node.material=m;node.geometry.setAttribute('aLodgeWood',new THREE.Float32BufferAttribute(field,4));
 }
 return {active:true,textures:Object.values(textures),version:layout.version,sourceSHA256:layout.sourceSHA256,tables:layout.nodes.flatMap(n=>n.components).filter(c=>c.table).length,components:layout.nodes.reduce((n,r)=>n+r.components.length,0),textureBytes:Object.values(surfaces.maps).reduce((n,m)=>n+m.bytes,0),giMean:surfaces.giTargetLinear,model:'same original material mean; fine texture bounce not spatially baked'};
}
export function installLodgeWood(material,source=material){
 const data=materialBindings.get(source);if(!data)return material;
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),s=data.surfaces;
 material.onBeforeCompile=(shader,...args)=>{previous.call(material,shader,...args);
  Object.assign(shader.uniforms,{uLodgeLegacyMap:{value:data.legacyMap},uLodgeEndMap:{value:data.textures.end},uLodgeWoodFactor:{value:new THREE.Vector3().fromArray(s.factor)},uLodgeEndFactor:{value:new THREE.Vector3().fromArray(s.endFactor)},uLodgeEndMean:{value:new THREE.Vector3().fromArray(s.endMean)},uLodgeWoodMetres:{value:s.metres}});
  shader.vertexShader='attribute vec4 aLodgeWood; varying vec4 vLodgeWood;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLodgeWood=aLodgeWood;');
  shader.fragmentShader=`varying vec4 vLodgeWood;
uniform sampler2D uLodgeLegacyMap; uniform sampler2D uLodgeEndMap;
uniform vec3 uLodgeWoodFactor;uniform vec3 uLodgeEndFactor;uniform vec3 uLodgeEndMean;uniform float uLodgeWoodMetres;
float lodgeBoardHash(float v){return fract(sin(v*127.1+vLodgeWood.w*311.7)*43758.5453);}
vec2 lodgeWoodUv(){
 float width=vLodgeWood.z<.5?.18:vLodgeWood.z<1.5?.14:.18;
 float board=floor(vLodgeWood.x/width),lengthM=vLodgeWood.z<1.5?9.:1.35;
 float join=floor((vLodgeWood.y+lodgeBoardHash(board)*lengthM)/lengthM);
 vec2 q=vLodgeWood.xy/uLodgeWoodMetres;
 q+=vec2(lodgeBoardHash(board+join*3.13),lodgeBoardHash(board+join*3.13+41.));
 return q;
}
float lodgeBoardSeam(){
 float width=vLodgeWood.z<.5?.18:vLodgeWood.z<1.5?.14:.18;
 float across=min(mod(vLodgeWood.x,width),width-mod(vLodgeWood.x,width));
 float board=floor(vLodgeWood.x/width),along=mod(vLodgeWood.y+lodgeBoardHash(board)*1.35,1.35);
 float edge=vLodgeWood.z>1.5?min(across,min(along,1.35-along)):across;
 float aa=max(fwidth(vLodgeWood.x),fwidth(vLodgeWood.y));
 return (1.-smoothstep(.0005,.0016+aa,edge))*(1.-smoothstep(.008,.04,aa));
}
`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
#ifdef USE_MAP
 vec4 sampledDiffuseColor;
 if(vLodgeWood.z<-.5)sampledDiffuseColor=texture2D(uLodgeLegacyMap,vMapUv);
 else if(vLodgeWood.z>2.5){vec3 e=texture2D(uLodgeEndMap,vLodgeWood.xy/.35+vec2(.37,.61)).rgb;sampledDiffuseColor=vec4(mix(uLodgeEndMean,e,.22)*uLodgeEndFactor,1.);}
 else sampledDiffuseColor=vec4(textureGrad(map,lodgeWoodUv(),dFdx(vLodgeWood.xy)/uLodgeWoodMetres,dFdy(vLodgeWood.xy)/uLodgeWoodMetres).rgb*uLodgeWoodFactor,1.);
 diffuseColor*=sampledDiffuseColor;
#endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
float roughnessFactor=roughness;
if(vLodgeWood.z>-.5){
 float r=textureGrad(roughnessMap,lodgeWoodUv(),dFdx(vLodgeWood.xy)/uLodgeWoodMetres,dFdy(vLodgeWood.xy)/uLodgeWoodMetres).g;
 roughnessFactor=vLodgeWood.z<.5?.32+r*.20:vLodgeWood.z<1.5?.62+r*.20:vLodgeWood.z<2.5?.48+r*.24:.68;
 roughnessFactor=mix(roughnessFactor,.92,lodgeBoardSeam()*.65);
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
if(vLodgeWood.z>-.5&&vLodgeWood.z<2.5){
 vec3 woodN=textureGrad(normalMap,lodgeWoodUv(),dFdx(vLodgeWood.xy)/uLodgeWoodMetres,dFdy(vLodgeWood.xy)/uLodgeWoodMetres).xyz*2.-1.;
 woodN.xy*=vLodgeWood.z<.5?.18:.28;
 // Micrometre-scale finished grain; the seam affects normals, never albedo/AO.
 float seam=lodgeBoardSeam(),boardWidth=vLodgeWood.z<1.5&&vLodgeWood.z>.5?.14:.18;
 woodN.x+=sign(mod(vLodgeWood.x,boardWidth)-boardWidth*.5)*seam*.12;
 mat3 woodTbn=getTangentFrame(-vViewPosition,normal,vLodgeWood.xy);
 #ifdef DOUBLE_SIDED
 woodTbn[0]*=faceDirection;woodTbn[1]*=faceDirection;
 #endif
 normal=normalize(woodTbn*normalize(woodN));
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;','material.clearcoat = vLodgeWood.z<-.5?0.:vLodgeWood.z<.5?.22:vLodgeWood.z<1.5?.035:vLodgeWood.z<2.5?.10:0.;'));
 };
 material.customProgramCacheKey=()=>key+'-lodge-wood-38';return material;
}
