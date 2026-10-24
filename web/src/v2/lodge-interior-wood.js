import * as THREE from 'three';
import {LODGE_CHAIRS_SOURCE,lodgeChairsEnabled} from './lodge-chairs-definition.js';
import {prepareLodgeWood,loadLodgeWoodTexture} from './lodge-wood.js';
export function lodgeInteriorWoodEnabled(search=globalThis.location?.search??''){
 const p=new URLSearchParams(search),explicit=p.get('lodgeInteriorWood38');if(explicit==='0')return false;
 if(!lodgeChairsEnabled(search)){if(explicit==='1')throw Error('lodgeInteriorWood38 requires the matching lodgeChairs38 complete source');return false;}
 return true;
}
// GLTFLoader decodes the shared images without vertical flipping; the additional
// channel must use the same image orientation, without touching chair textures.
export const loadLodgeInteriorRoughness=(record,channel)=>loadLodgeWoodTexture(record,channel,{imageOrientation:'none',colorSpaceConversion:'none'});
const textureState=t=>JSON.stringify({wrapS:t.wrapS,wrapT:t.wrapT,colorSpace:t.colorSpace,flipY:t.flipY,repeat:t.repeat.toArray(),offset:t.offset.toArray(),rotation:t.rotation,anisotropy:t.anisotropy,minFilter:t.minFilter,magFilter:t.magFilter,channel:t.channel});
export async function prepareLodgeInteriorWood(assetId,scene,{enabled=lodgeInteriorWoodEnabled(),sourceSHA256,sourceDefinition=LODGE_CHAIRS_SOURCE,layoutOverride,textureLoader=loadLodgeInteriorRoughness}={}){
 if(!enabled||assetId!=='gh_lanchuan_lodge')return {active:false};
 if(sourceSHA256!==sourceDefinition.sourceSHA256)throw Error('Interior wood complete source differs');
 const [{default:originalLayout},{default:surfaces}]=await Promise.all([import('./generated/lodge-interior-wood-38.json',{with:{type:'json'}}),import('./generated/lodge-wood-surfaces-38.json',{with:{type:'json'}})]);
 const layout=layoutOverride||originalLayout;
 for(const name of ['pine','plank'])if(surfaces.giTargetLinear.some((v,i)=>Math.abs(v-sourceDefinition.materialReflectance[name][i])>1e-10))throw Error('Interior wood diffuse GI mean differs');
 const found=new Map();scene.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.name==='chair38 calibrated oak'||m.name==='chair38 real endgrain')found.set(m.name,m);});
 const oak=found.get('chair38 calibrated oak'),end=found.get('chair38 real endgrain');
 const borrowed={color:oak?.map,normal:oak?.normalMap,end:end?.map};
 for(const [name,t]of Object.entries(borrowed))if(!t||t.wrapS!==THREE.RepeatWrapping||t.wrapT!==THREE.RepeatWrapping||t.colorSpace!==(name==='normal'?THREE.NoColorSpace:THREE.SRGBColorSpace)||t.flipY!==false)throw Error('Interior wood shared texture contract differs: '+name);
 const states=Object.fromEntries(Object.entries(borrowed).map(([k,t])=>[k,textureState(t)]));
 // Only the absent roughness map is fetched. Borrowed chair textures retain all
 // sampler/colour/UV state and stay in the owner's existing texture pool.
 const roughness=await textureLoader(surfaces.maps.roughness,'roughness');
 try{
  const textures={...borrowed,roughness},legacyMaps=new Map(layout.nodes.map(record=>[record.name,scene.getObjectByName(record.name)?.material.map]));
  const result=await prepareLodgeWood(assetId,scene,{enabled:true,sourceSHA256,load:async()=>[layout,surfaces],textureLoader:async(_record,channel)=>textures[channel]});
  // Include the actual legacy fallback texture in the existing material key.
  // Identical fallback images may still batch; different ones must not merge.
  for(const record of layout.nodes)scene.getObjectByName(record.name).material.lodgeLegacyFallbackMap=legacyMaps.get(record.name);
  for(const [k,t]of Object.entries(borrowed))if(textureState(t)!==states[k])throw Error('Interior wood mutated shared chair texture: '+k);
  return {...result,sharedTextureCount:3,additionalTextureBytes:surfaces.maps.roughness.bytes,sharedTextureStatesUnchanged:true,model:'same complete chairs geometry and calibrated diffuse mean; existing three-pose low-frequency GI retained; fine texture variation not spatially rebaked'};
 }catch(error){roughness?.dispose();throw error;}
}
