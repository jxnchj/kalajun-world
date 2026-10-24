import { Float32BufferAttribute } from "three";
// lib.py:bake_vertex_ao writes (AO, AO, sky visibility), in linear data.
// Preserve that meaning without treating the channels as painted surface colour.
export function preserveAssetOcclusion(geometry,hasSkyVisibility) {
  const source=geometry.getAttribute("color"),count=geometry.getAttribute("position").count;
  const values=new Float32Array(count*2);
  for(let i=0;i<count;i++){
    values[i*2]=source?Math.max(0,Math.min(1,source.getX(i))):1;
    values[i*2+1]=source&&hasSkyVisibility?Math.max(0,Math.min(1,source.getZ(i))):1;
  }
  geometry.setAttribute("assetOcclusion",new Float32BufferAttribute(values,2));
  geometry.deleteAttribute("color");
}
export function installAssetOcclusion(material,{interiorBounce=.16}={}){
  const bounce=Math.min(.5,Math.max(0,interiorBounce)).toFixed(3);
  material.onBeforeCompile=shader=>{
    shader.vertexShader="attribute vec2 assetOcclusion; varying vec2 vAssetOcclusion;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvAssetOcclusion=assetOcclusion;");
    shader.fragmentShader="varying vec2 vAssetOcclusion;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <aomap_fragment>",`#include <aomap_fragment>
float assetAO=clamp(vAssetOcclusion.x,0.0,1.0);
float skyAccess=clamp(vAssetOcclusion.y,0.0,1.0);
// Residual interior bounce is a provisional approximation until room lightmaps.
reflectedLight.indirectDiffuse *= assetAO * mix(${bounce},1.0,skyAccess);
reflectedLight.indirectSpecular *= mix(.22,1.0,assetAO*skyAccess);
#ifdef USE_CLEARCOAT
// Separate physical IBL accumulator: attenuate the existing external sky only.
// Room-return transport is added later and must not receive sky attenuation.
clearcoatSpecularIndirect *= mix(.22,1.0,assetAO*skyAccess);
#endif`);
  };
  material.customProgramCacheKey=()=>"world-asset-occlusion-v3-clearcoat-"+bounce;
}
