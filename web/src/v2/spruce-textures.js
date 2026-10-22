// Deliberately scoped to the two editable spruce LOD exports. Reuse requires
// identical glTF declarations, texture state AND embedded image bytes; a shared
// material or image name alone never establishes equivalence.
const SAME_TEXTURE_FIELDS=["mapping","channel","wrapS","wrapT","magFilter","minFilter","anisotropy","format","internalFormat","type","colorSpace","flipY","premultiplyAlpha","unpackAlignment","generateMipmaps","rotation","matrixAutoUpdate","compareFunction"];
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stateEqual=(a,b)=>SAME_TEXTURE_FIELDS.every(k=>a[k]===b[k])&&["offset","repeat","center","matrix"].every(k=>a[k].equals(b[k]));
const textureSlots=material=>Object.entries(material).filter(([,value])=>value?.isTexture);
function materials(gltf){
 const found=new Set();gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])found.add(m);});return [...found];
}
function embedded(gltf,texture){
 const index=gltf.parser.associations.get(texture)?.textures,def=gltf.parser.json.textures?.[index];
 const image=gltf.parser.json.images?.[def?.source];
 if(!def||!image||image.bufferView===undefined||image.uri)return null;
 return{def,image};
}
function mipBytes(texture){
 let width=texture.image?.width||0,height=texture.image?.height||0,total=0;
 if(!width||!height)return 0;
 do{total+=width*height*4;if(!texture.generateMipmaps||width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}while(true);
 return total;
}
export async function reuseNeedleTextures(hi,needle){
 const hiMaterials=materials(hi),nearMaterials=materials(needle),unused=new Set(),compared=new Map();
 const stats={reusedSlots:0,releasedTextures:0,closedImages:0,duplicateEmbeddedBytes:0,avoidedTextureRGBABytes:0};
 for(const material of nearMaterials){
  const candidates=hiMaterials.filter(m=>m.name===material.name);if(candidates.length!==1)continue;
  const source=candidates[0],sourceIndex=hi.parser.associations.get(source)?.materials,nearIndex=needle.parser.associations.get(material)?.materials;
  if(sourceIndex===undefined||nearIndex===undefined||!jsonEqual(hi.parser.json.materials[sourceIndex],needle.parser.json.materials[nearIndex]))continue;
  for(const [slot,texture]of textureSlots(material)){
   const shared=source[slot];if(!shared?.isTexture||shared===texture||!stateEqual(texture,shared))continue;
   const a=embedded(hi,shared),b=embedded(needle,texture);
   if(!a||!b||!jsonEqual(a.def,b.def)||a.image.mimeType!==b.image.mimeType)continue;
   const key=a.image.bufferView+":"+b.image.bufferView;
   if(!compared.has(key)){
    const [sourceBytes,nearBytes]=await Promise.all([hi.parser.getDependency("bufferView",a.image.bufferView),needle.parser.getDependency("bufferView",b.image.bufferView)]);
    const left=new Uint8Array(sourceBytes),right=new Uint8Array(nearBytes);
    compared.set(key,{same:left.length===right.length&&left.every((v,i)=>v===right[i]),bytes:right.length});
   }
   if(!compared.get(key).same)continue;
   material[slot]=shared;unused.add(texture);stats.reusedSlots++;
  }
 }
 const remaining=new Set([...hiMaterials,...nearMaterials].flatMap(m=>textureSlots(m).map(([,t])=>t)));
 const images=new Set([...remaining].map(t=>t.image)),countedImages=new Set(),closed=new Set();
 for(const texture of unused){
  if(remaining.has(texture))continue;
  const image=embedded(needle,texture)?.image;
  if(image&&!countedImages.has(image.bufferView)){
   stats.duplicateEmbeddedBytes+=needle.parser.json.bufferViews[image.bufferView].byteLength;countedImages.add(image.bufferView);
  }
  stats.avoidedTextureRGBABytes+=mipBytes(texture);texture.dispose();stats.releasedTextures++;
  if(texture.image?.close&&!images.has(texture.image)&&!closed.has(texture.image)){texture.image.close();closed.add(texture.image);stats.closedImages++;}
 }
 // Byte counters describe duplicate compressed payload already downloaded and
 // nominal RGBA8+mips avoided, not measured driver memory or a GPU speedup.
 return stats;
}
