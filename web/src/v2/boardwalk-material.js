import {boardwalkEndGrain39Enabled,configureBoardwalkEndGrain39} from './boardwalk-endgrain39.js';
import * as THREE from 'three';
// Existing project Poly Haven rough_wood PBR, plus the existing authored
// end-grain image. No global exposure change or baked shadow amplification.
export function createBoardwalkMaterials({loadTexture,endGrain39=boardwalkEndGrain39Enabled()}={}){
 const maps={wood:new THREE.Texture(),normal:new THREE.Texture(),rough:new THREE.Texture(),end:new THREE.Texture()};
 const wood=new THREE.MeshStandardMaterial({color:new THREE.Color(.78,.64,.49),map:maps.wood,normalMap:maps.normal,normalScale:new THREE.Vector2(.55,.55),roughnessMap:maps.rough,roughness:.96});
 const end=new THREE.MeshStandardMaterial({color:new THREE.Color(.62,.52,.40),map:maps.end,roughness:.97});
 wood.name='boardwalk/rough-wood';end.name='boardwalk/sawn-end';
 const previous=wood.onBeforeCompile;
 wood.onBeforeCompile=(shader,renderer)=>{previous.call(wood,shader,renderer);shader.vertexShader='attribute vec2 aTimberOffset;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
vMapUv+=aTimberOffset;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv+=aTimberOffset;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv+=aTimberOffset;
#endif`);};
 wood.customProgramCacheKey=()=> 'boardwalk-physical-grain-38';
 let promise;const result={materials:[wood,end],ready:false,load(){
  if(promise)return promise;
  if(!loadTexture&&typeof document==='undefined'){result.ready=true;return promise=Promise.resolve(result);}
  const loader=loadTexture??(url=>new THREE.TextureLoader().loadAsync(url));
  promise=Promise.all([['wood','rough_wood_diff_1k.jpg',THREE.SRGBColorSpace],['normal','rough_wood_nor_gl_1k.jpg',THREE.NoColorSpace],['rough','rough_wood_rough_1k.jpg',THREE.NoColorSpace],['end','wood_end.png',THREE.SRGBColorSpace]].map(async([key,file,colorSpace])=>{
   const texture=await loader('./assets/v2/boardwalk/'+file);if(!texture)throw new Error('Missing boardwalk texture '+file);texture.colorSpace=colorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;texture.needsUpdate=true;maps[key].dispose();maps[key]=texture;
  })).then(()=>{wood.map=maps.wood;wood.normalMap=maps.normal;wood.roughnessMap=maps.rough;end.map=maps.end;if(endGrain39)configureBoardwalkEndGrain39(end);wood.needsUpdate=true;end.needsUpdate=true;result.ready=true;return result;});return promise;
 },dispose(){Object.values(maps).forEach(t=>t.dispose());}};return result;
}
