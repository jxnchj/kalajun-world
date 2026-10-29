import {ShaderChunk,TangentSpaceNormalMap} from 'three';
const END='normal=normalize(mix(nonPerturbedNormal,normal,1.-smoothstep(10.,38.,vPlantDistance)));';
const START='#ifdef USE_NORMALMAP_TANGENTSPACE\nvec2 needleUvDx=dFdx(vNormalMapUv),needleUvDy=dFdy(vNormalMapUv);';
const BEGIN='#include <normal_fragment_begin>';
function once(text,needle){const at=text.indexOf(needle);if(at<0||text.indexOf(needle,at+needle.length)>=0)throw Error('Mode1 normal specialization source changed: '+needle);return at;}
export function specializePhotoMiddleNormal63(shader){
 if(!shader.vertexShader.includes('const float uPlantMode=1.0;')||!shader.vertexShader.includes('if (vPlantDistance<=42. || vPlantDistance>=235.)'))throw Error('Mode1 normal specialization requires the actual 42..235 source gate');
 const f=shader.fragmentShader,start=once(f,START),end=once(f,END)+END.length;if(end<start)throw Error('Invalid normal section');
 once(f,BEGIN);const chunk=ShaderChunk.normal_fragment_begin,beginTbn=once(chunk,'#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )'),endTbn=chunk.indexOf('\n#ifdef USE_CLEARCOAT_NORMALMAP',beginTbn);
 if(endTbn<0)throw Error('Three tangent frame chunk changed');
 // The real vertex gate excludes <=42m; the original normal relief is zero
 // from 38m. Retain its final normalization (including Float32 rounding), the
 // original geometric normal and double-sided sign; remove only unused TBN.
 shader.fragmentShader=(f.slice(0,start)+'normal=normalize(nonPerturbedNormal);'+f.slice(end)).replace(BEGIN,chunk.slice(0,beginTbn)+chunk.slice(endTbn));
 return shader;
}
function supported(material,mode){return mode===1&&material?.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&material.normalMap&&material.normalMapType===TangentSpaceNormalMap&&material.alphaTest>0&&!material.clearcoatNormalMap&&!material.anisotropy&&!material.anisotropyMap&&!material.bumpMap&&!material.userData.solidNeedleStations&&!['USE_ANISOTROPY','USE_CLEARCOAT_NORMALMAP'].some(k=>Object.hasOwn(material.defines||{},k));}
// Explicit review-only installation; no URL/main/default mutation. Use the
// loaded nearParts mode metadata, then validate the actual shader gate as well.
export function installPhotoMiddleNormal63(ecology,{enabled=false}={}){
 const records=[],seen=new Set(),stats={enabled:false,materials:0,compiles:0,skipped:0};
 for(const part of ecology?.nearParts||[]){const material=part.mesh?.material;if(!supported(material,part.mode)){stats.skipped++;continue;}if(seen.has(material))continue;seen.add(material);
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey,record={material,previous,key};
  record.hook=function(shader,renderer){previous.call(this,shader,renderer);specializePhotoMiddleNormal63(shader);stats.compiles++;};record.cacheKey=function(){return key.call(this)+'-photo-middle-normal63';};records.push(record);
 }
 stats.materials=records.length;let disposed=false;
 const setEnabled=value=>{value=!!value;if(disposed&&value)throw Error('Disposed mode1 normal candidate');if(value===stats.enabled)return stats;
  for(const r of records){if(r.material.onBeforeCompile!==(stats.enabled?r.hook:r.previous)||r.material.customProgramCacheKey!==(stats.enabled?r.cacheKey:r.key))throw Error('Mode1 material hook changed after candidate installation');}
  for(const r of records){r.material.onBeforeCompile=value?r.hook:r.previous;r.material.customProgramCacheKey=value?r.cacheKey:r.key;r.material.needsUpdate=true;}stats.enabled=value;return stats;
 };
 if(enabled)setEnabled(true);
 return{stats,setEnabled,dispose(){if(disposed)return;setEnabled(false);disposed=true;}};
}
