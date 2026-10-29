import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
import {useProjectedShadowDepth} from './room-shadow.js';
import {coverageProgramFamily52} from './shadow-program-family52.js';
import * as T from 'three';
import {wholeStaticSourceView42,selectWholeRoots42,sliceBrushSource42} from './shadow-window-geometry42.js';
// Existing resident mode-12 batches have the actual per-root wind layout. Their
// inactive prefix must not prevent compilation before they enter the light view.
export function residentNeedleProgramSources61(ecology,registry){const result=[],seen=new Set(registry);for(const batch of ecology?.nearTreeBatches?.values()||[]){const source=batch.mesh;if(batch.mode!==12||!batch.records?.length||seen.has(source)||!source?.isInstancedMesh||!source.customDepthMaterial||source.morphTexture||Array.isArray(source.material)||source.instanceMatrix.count<1)continue;useProjectedShadowDepth(source.customDepthMaterial);seen.add(source);result.push(source);}return result;}
// All mode12 template resources are already loaded, even when one tree form
// has no root inside the unchanged 28 m prefetch radius. Build only its exact
// native per-root geometry container, never a world root or scene publication.
export function templateNeedleProgramSources63(ecology,represented){const sources=[];try{for(const part of ecology?.nearParts||[]){const template=part.mesh;if(part.mode!==12||!template?.isInstancedMesh||!template.customDepthMaterial)continue;if(represented.some(s=>s.customDepthMaterial===template.customDepthMaterial&&(s.geometry===template.geometry||s.geometry.userData.treeWindSource===template.geometry)))continue;
 const geometry=createTreeWindGeometry(template.geometry,1),mesh=new T.InstancedMesh(geometry,template.material,1);mesh.name='compile-only-mode12-'+part.variant;mesh.customDepthMaterial=useProjectedShadowDepth(template.customDepthMaterial);mesh.morphTargetInfluences=template.morphTargetInfluences;mesh.frustumCulled=false;mesh.updateMatrixWorld();sources.push(mesh);
 }return{sources,dispose(){for(const s of sources){disposeTreeWindGeometry(s.geometry);s.dispose();}sources.length=0;}};}catch(error){for(const s of sources){disposeTreeWindGeometry(s.geometry);s.dispose();}throw error;}}
// Compile-only representatives of every CURRENT native source, not just selected
// window views. Source variants not yet resident cannot be guaranteed prepared.
export function nativeProgramViews42(sources,terrain,depth,{accept=()=>true,allowDormant=new Set()}={}){const reference=new T.Scene(),mask=new T.Scene(),views=[],skipped=[];try{for(const source of sources){
 const brush=/^gpu-(needle|twig)-/.test(source.name),address=brush?'brush':source.isInstancedMesh?'root':null;
 const dormant=source.isInstancedMesh&&source.count===0&&allowDormant.has(source);if(source.count===0&&!dormant||source.geometry.instanceCount===0)continue;
 if(source.isInstancedMesh&&source.morphTexture||!source.isInstancedMesh&&source.geometry.isInstancedBufferGeometry){skipped.push({id:source.id,name:source.name,reason:'unsupported representative; actual selected compile remains required'});continue;}
 for(const kind of terrain.has(source.material)?['reference','receiver']:['caster']){const material=depth(source,kind,address);if(!accept(source,kind,address,material))continue;let view;
 if(brush)view=sliceBrushSource42(source,0,1,material);
 else if(source.isInstancedMesh){let representative=source;if(dormant){representative=source.clone(false);representative.instanceMatrix=source.instanceMatrix;representative.instanceColor=source.instanceColor;representative.customDepthMaterial=source.customDepthMaterial;representative.count=1;representative.visible=true;}view=selectWholeRoots42(representative,[0],material);}
 else if(source.isSkinnedMesh){const mesh=source.clone(false);mesh.material=material;mesh.skeleton=source.skeleton;mesh.bindMatrix.copy(source.bindMatrix);mesh.bindMatrixInverse.copy(source.bindMatrixInverse);mesh.morphTargetInfluences=source.morphTargetInfluences;view={mesh,source,sync(){},dispose(){}};}
 else view=wholeStaticSourceView42(source,material);
 views.push(view);(kind==='reference'?reference:mask).add(view.mesh);
 }}return{reference,mask,views,skipped,dispose(){reference.clear();mask.clear();for(const view of views)view.dispose();}};}catch(error){for(const view of views)view.dispose();throw error;}}
// Per-owner compile certificate. Geometry/VBO identity stays in the exact cache.
// A second certificate shares only already compiled shader layouts for the SAME
// depth material object (including its source-bound hook closure), target and
// renderer flags. No geometry, source bounds or visibility certificates are shared.
// Attribute storage formats and morph/instance layouts remain explicit.
// Ordinary array length and vertexAttribDivisor are draw/VAO state, not GLSL.
// Each source/view still owns its original attributes and binding state;
// this cache never shares geometry, VAOs, divisors or uniforms.
// retain morph stream counts conservatively because morph texture layouts differ. Shader edits
// must follow Three's material.version/customProgramCacheKey contract.
export class NativeProgramCache42{
 constructor(){this.entries=new WeakMap();this.layouts=new WeakMap();}
 signature(source,material,kind,address,renderer,camera,target,layout=false){const g=source.geometry,family=layout?coverageProgramFamily52(material):null,out=[layout?'compiled-layout50':g,family||material,material.version,family||material.onBeforeCompile,family||material.customProgramCacheKey,material.customProgramCacheKey(),kind,address,target,target.texture?.type,target.texture?.format,target.texture?.colorSpace,renderer.outputColorSpace,renderer.toneMapping,renderer.localClippingEnabled,renderer.shadowMap.type,camera.reversedDepth,renderer.capabilities?.logarithmicDepthBuffer,source.isInstancedMesh===true,source.isSkinnedMesh===true,source.isBatchedMesh===true,source.isPoints===true,source.instanceColor!==null&&source.instanceColor!==undefined,source.morphTexture!==null&&source.morphTexture!==undefined,source._colorsTexture!==null&&source._colorsTexture!==undefined,g.isInstancedBufferGeometry===true,g.morphTargetsRelative];
 for(const key of Object.keys(material).sort()){if(family&&['id','uuid','name'].includes(key))continue;const v=material[key];if(v===null||['boolean','number','string'].includes(typeof v))out.push(key,v);else if(v?.isTexture)out.push(key,v,v.channel,v.colorSpace,v.mapping);}
 out.push(JSON.stringify(material.defines||{}),material.clippingPlanes?.length??0,material.clipIntersection);
 // A newly created coverage copy must not reuse an older source generation.
 if(family)out.push('source-generation61',family.version,family.onBeforeCompile,family.customProgramCacheKey);
 const attr=(a,morph=false)=>{out.push(layout?a?.constructor:a,a?.itemSize,a?.normalized,a?.gpuType,layout&&!morph?'vertex-binding-offset':a?.offset,layout?a?.data?.constructor:a?.data,layout&&!morph?'vertex-binding-stride':a?.data?.stride,a?.isInstancedBufferAttribute,layout?'vertex-binding-divisor':a?.meshPerAttribute,layout?'vertex-binding-divisor':a?.data?.meshPerAttribute);if(layout)out.push(morph?a?.count:null,(a?.array??a?.data?.array)?.constructor,a?.isGLBufferAttribute,a?.type,a?.elementSize);};
 for(const key of Object.keys(g.attributes).sort()){out.push(key);attr(g.attributes[key]);}
 for(const key of Object.keys(g.morphAttributes).sort()){out.push(key,g.morphAttributes[key].length);for(const a of g.morphAttributes[key])attr(a,true);}if(!layout)out.layout50=this.signature(source,material,kind,address,renderer,camera,target,true);return out;
 }
 has(source,signature){const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);if((this.entries.get(source.geometry)||[]).some(old=>equal(old,signature)))return true;const layout=signature.layout50;return !!layout&&(this.layouts.get(layout[1])||[]).some(old=>equal(old,layout));}
 explain(source,signature){
  const exact=this.entries.get(source.geometry)||[],layout=signature.layout50,candidates=this.layouts.get(layout[1])||[];
  if(!candidates.length)return{reason:exact.length?'different-material-identity':'no-completed-material-certificate',materialId:signature[1]?.id,exactGeometryCertificates:exact.length};
  const describe=v=>v===undefined?'undefined':v===null?null:typeof v==='function'?('function:'+v.name):typeof v==='object'?{type:v.constructor?.name,id:v.id??null}:v;
  const ranked=candidates.map(old=>{const differences=[];for(let i=0;i<Math.max(old.length,layout.length);i++)if(old[i]!==layout[i])differences.push(i);return{old,differences};}).sort((a,b)=>a.differences.length-b.differences.length),best=ranked[0];
  return{reason:'compiled-layout-changed',materialId:signature[1]?.id,differenceCount:best.differences.length,differences:best.differences.slice(0,6).map(i=>({index:i,before:describe(best.old[i]),after:describe(layout[i]),context:layout.slice(Math.max(0,i-3),i).map(describe)}))};
 }
 add(source,signature){const entries=this.entries.get(source.geometry)||[];if(!entries.some(old=>old.length===signature.length&&old.every((v,i)=>v===signature[i]))){entries.push(signature);if(entries.length>32)entries.shift();this.entries.set(source.geometry,entries);}const layout=signature.layout50;if(layout){const list=this.layouts.get(layout[1])||[];if(!list.some(old=>old.length===layout.length&&old.every((v,i)=>v===layout[i]))){list.push(layout);if(list.length>32)list.shift();this.layouts.set(layout[1],list);}}}
}
