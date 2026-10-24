import { ShaderChunk } from 'three';
// GLTF metallicRoughness can clone textures while sharing the exact image source.
// The sampler is shared, but each existing UV varying is retained: no texture
// values, UV transform, filtering, map content or material response changes.
export function sharedOrmSamplerEligible(material){
  const a=material.roughnessMap,b=material.metalnessMap;
  if(!a||!b)return false;
  if(a===b)return true;
  // GLTF assigns independent UV transforms to clones. Keep both original UV
  // varyings; only share sampling when image storage and GPU state are equal.
  if(a.source!==b.source||a.isRenderTargetTexture||b.isRenderTargetTexture)return false;
  const keys=['mapping','wrapS','wrapT','wrapR','magFilter','minFilter','anisotropy','format','internalFormat','type','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace','compareFunction','isDataTexture','isData3DTexture','isDataArrayTexture','isCompressedTexture','isCubeTexture'];
  return keys.every(k=>a[k]===b[k])&&a.mipmaps.length===b.mipmaps.length&&a.mipmaps.every((m,i)=>m===b.mipmaps[i]);
}
export function installSharedOrmSampler(shader){
  const pars='#include <metalnessmap_pars_fragment>', fragment='#include <metalnessmap_fragment>';
  if(!shader.fragmentShader.includes(pars)||!shader.fragmentShader.includes(fragment))throw new Error('Shared ORM shader contract changed');
  shader.fragmentShader=shader.fragmentShader.replace(pars,'// metalness shares the roughnessMap sampler')
    .replace(fragment,ShaderChunk.metalnessmap_fragment.replace(/\bmetalnessMap\b/g,'roughnessMap'));
}
