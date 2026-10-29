import {GrassShadowRoots41} from './grass-shadow-roots41.js';
import * as T from 'three';
import {createStructureDepth} from './room-shadow.js';
import {createCoverageTarget41} from './grass-shadow-coverage41.js';

const nativeCall='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
export function installWorldCoverage41(material,uniforms){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);if(!shader.fragmentShader.includes(nativeCall))throw Error('Coverage41 requires native CSM visibility hook; incompatible shadow experiment');Object.assign(shader.uniforms,uniforms);
 const helper=`
uniform sampler2D uCoverageMask41,uCoverageGround41;
uniform mat4 uCoverageMatrix41;
uniform vec4 uCoverageParameters41; // enabled, reverse-Z, depth span, UV feather
float coverageShadow41(float nativeVisibility,vec3 world){
 if(uCoverageParameters41.x<.5)return nativeVisibility;
 vec4 clip=uCoverageMatrix41*vec4(world,1.);vec3 q=clip.xyz/clip.w;
 vec2 uv=q.xy*.5+.5;float z=uCoverageParameters41.y>.5?1.-q.z:q.z*.5+.5;
 float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
 float weight=smoothstep(0.,uCoverageParameters41.w,edge);
 if(weight<=0.||z<=0.||z>=1.)return nativeVisibility;
 // A white nearest terrain surface is NOT proof that terrain behind it is lit.
 // Keep original CSM for those receivers instead of losing hill occlusion.
 float terrainDepth=dot(texture2D(uCoverageGround41,uv),vec4(255./256.,255./65536.,255./16777216.,1./16777216.));
 float tolerance=max(.08/uCoverageParameters41.z,1.5*fwidth(z));
 weight*=1.-smoothstep(tolerance,tolerance*2.,abs(z-terrainDepth));
 return mix(nativeVisibility,texture2D(uCoverageMask41,uv).r,weight);
}
`;
 shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n'+helper).split(nativeCall).join('coverageShadow41('+nativeCall+',vCloudWorld)');
 };material.customProgramCacheKey=()=>key+'-world-ground-coverage41';material.needsUpdate=true;
 return()=>{material.onBeforeCompile=previous;material.customProgramCacheKey=()=>key;material.needsUpdate=true;};
}

// Preserve the original depth vertex/wind/alpha hooks. Only output encoding differs.
export function coverageDepth41(source,kind){
 const result=source.clone(),compile=source.onBeforeCompile,key=source.customProgramCacheKey();result.toneMapped=false;result.transparent=false;result.blending=T.NoBlending;
 result.onBeforeCompile=function(shader,renderer){compile.call(source,shader,renderer);
 // A private coverage view is not the source object's observed draw. Keep its
 // original wind formula; never inherit another object's cached-valid flag.
 if(source.userData.stationWindCache62&&shader.uniforms.uStationWindValid62)shader.uniforms.uStationWindValid62={value:0};
 for(const stage of['vertexShader','fragmentShader'])shader[stage]=shader[stage].replace(/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g,'');
 const tail=shader.fragmentShader.lastIndexOf('}');if(tail<0)throw Error('Invalid original depth shader');
 const output=kind==='reference'?`\n#ifdef USE_REVERSED_DEPTH_BUFFER\ngl_FragColor=packDepthToRGBA(1.-vHighPrecisionZW.x/vHighPrecisionZW.y);\n#else\ngl_FragColor=packDepthToRGBA(.5*vHighPrecisionZW.x/vHighPrecisionZW.y+.5);\n#endif\n`:'\ngl_FragColor=vec4('+ (kind==='receiver'?'1.':'0.') +', '+(kind==='receiver'?'1.':'0.')+', '+(kind==='receiver'?'1.':'0.')+',1.);\n';
 shader.fragmentShader=shader.fragmentShader.slice(0,tail)+output+shader.fragmentShader.slice(tail);
 };result.customProgramCacheKey=()=>key+'-coverage41-'+kind;return result;
}

export class GrassShadowWorld41{
 constructor(renderer,scene,camera,terrain,environment,{enabled=new URLSearchParams(globalThis.location?.search||'').get('grassShadowCoverage41')==='1',size=768,ecology=null}={}){
  this.ecology=ecology;this.frustum=new T.Frustum();this.renderer=renderer;this.sourceScene=scene;this.viewer=camera;this.terrain=terrain;this.environment=environment;this.enabled=enabled;this.records=new Map();this.materials=new Map();this.ownedDepth=new Map();this.maskScene=new T.Scene();this.referenceScene=new T.Scene();this.camera=new T.OrthographicCamera();this.matrix=new T.Matrix4();this.temp=new T.Vector3();this.clear=new T.Color();this.stats={enabled,ready:false,reason:enabled?'pending':'default-off',samples:4,size,extraTerrainSamplers:2,frames:0,casters:0,terrainDraws:0,instances:0,drawCalls:0,triangles:0,cpuMs:0,sourceGeometryCopies:0};
  if(!enabled)return;
  if(renderer.capabilities.maxSamples<4)throw Error('Coverage41 requires actual 4x MSAA; no reduced-sample fallback');
  if(environment.shadowAtlas40.enabled||environment.closeSolarShadow||environment.closeShadowFootprint)throw Error('Coverage41 does not combine with other experimental visibility replacements');
  this.size=size;this.mask=createCoverageTarget41(size,4);this.reference=createCoverageTarget41(size,0);this.reference.texture.minFilter=this.reference.texture.magFilter=T.NearestFilter;
  this.uniforms={uCoverageMask41:{value:this.mask.texture},uCoverageGround41:{value:this.reference.texture},uCoverageMatrix41:{value:this.matrix},uCoverageParameters41:{value:new T.Vector4(0,0,7999,.12)}};
  this.restores=(terrain.materials||[terrain.material]).map(m=>installWorldCoverage41(m,this.uniforms));
  this.stats.attachmentBytesLowerBound=size*size*(4*8+4+8); // MSAA color/depth + resolve + reference color/depth
 }
 depth(source,kind){let variants=this.materials.get(source);if(!variants){variants={};this.materials.set(source,variants);}return variants[kind]??=(coverageDepth41(source,kind));}
 record(source,terrain){let r=this.records.get(source);if(r)return r;
  const sourceMaterial=Array.isArray(source.material)?source.material[0]:source.material;
  let original=source.customDepthMaterial;
  if(!original){original=this.ownedDepth.get(sourceMaterial);if(!original){original=createStructureDepth(sourceMaterial);this.ownedDepth.set(sourceMaterial,original);}}
  const make=kind=>{let p;if(source.isInstancedMesh){p=new T.InstancedMesh(source.geometry,this.depth(original,kind),0);p.instanceMatrix=source.instanceMatrix;p.instanceColor=source.instanceColor;p.morphTexture=source.morphTexture;}else if(source.isSkinnedMesh){p=source.clone(false);p.material=this.depth(original,kind);}else p=new T.Mesh(source.geometry,this.depth(original,kind));
   p.matrixAutoUpdate=false;p.matrixWorldAutoUpdate=false;p.frustumCulled=source.frustumCulled;p.castShadow=false;p.receiveShadow=false;
   p.intersectsFrustum=function(f){const visible=source.intersectsFrustum.call(source,f);p.geometry=source.geometry;return visible;};
   p.onBeforeRender=(renderer,scene,camera,geometry,material,group)=>{source.onBeforeShadow(renderer,source,this.viewer,camera,geometry,original,group);};
   p.onAfterRender=(renderer,scene,camera,geometry,material,group)=>source.onAfterShadow(renderer,source,this.viewer,camera,geometry,original,group);
   return p;};
  r={source,original,terrain,mask:make(terrain?'receiver':'caster'),reference:terrain?make('reference'):null,stamp:0};r.mask.renderOrder=terrain?-1:1;this.maskScene.add(r.mask);if(r.reference)this.referenceScene.add(r.reference);if(source.isInstancedMesh&&source.material===this.ecology?.grassMaterials?.[0])r.roots=new GrassShadowRoots41(source);this.records.set(source,r);return r;
 }
 updateCamera(){const first=this.environment.csm.lights[0].shadow,c=first.camera,pitch=(c.right-c.left)/first.mapSize.x,span=pitch*this.size;
  const cam=this.camera;cam.quaternion.copy(c.quaternion);cam.position.copy(c.position);cam._reversedDepth=this.viewer.reversedDepth;cam.near=c.near;cam.far=c.far;cam.left=cam.bottom=-span/2;cam.right=cam.top=span/2;cam.updateMatrixWorld();
  const anchor=this.temp.copy(this.viewer.position).applyMatrix4(cam.matrixWorldInverse);anchor.x=Math.round(anchor.x/pitch)*pitch;anchor.y=Math.round(anchor.y/pitch)*pitch;anchor.z=0;anchor.applyQuaternion(cam.quaternion);cam.position.add(anchor);cam.updateMatrixWorld();cam.updateProjectionMatrix();this.matrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix,cam.coordinateSystem,cam.reversedDepth);this.uniforms.uCoverageParameters41.value.set(1,this.viewer.reversedDepth?1:0,cam.far-cam.near,.12);this.stats.pitchMeters=pitch;this.stats.spanMeters=span;
 }
 setEnabled(value){if(value&&!this.mask)throw Error('Reload with grassShadowCoverage41=1 before enabling the isolated candidate');this.enabled=!!value;this.stats.enabled=this.enabled;if(!this.enabled&&this.uniforms)this.uniforms.uCoverageParameters41.value.x=0;return this.enabled;}
 render(){this.stats.enabled=this.enabled;if(!this.enabled){if(this.uniforms)this.uniforms.uCoverageParameters41.value.x=0;return;}const start=performance.now(),r=this.renderer;this.uniforms.uCoverageParameters41.value.x=0;if(this.environment.sun.y<=.05){this.stats.reason='sun-below-window';return;}this.updateCamera();const stamp=++this.stats.frames,materials=new Set(this.terrain.materials||[this.terrain.material]);let casters=0,terrainDraws=0,instances=0,grassSourceRoots=0,grassSubmittedRoots=0;
  this.sourceScene.traverseVisible(source=>{if(!source.isMesh)return;const isTerrain=materials.has(source.material);if(!source.castShadow&&!isTerrain)return;const item=this.record(source,isTerrain);item.stamp=stamp;for(const p of[item.mask,item.reference])if(p){p.geometry=source.geometry;p.matrix.copy(source.matrixWorld);p.matrixWorld.copy(source.matrixWorld);p.visible=true;p.morphTargetInfluences=source.morphTargetInfluences;p.morphTexture=source.morphTexture;if(source.isInstancedMesh){p.instanceMatrix=source.instanceMatrix;p.count=source.count;p.boundingSphere=source.boundingSphere;p.boundingBox=source.boundingBox;}}if(item.roots){const roots=item.roots.update(this.frustum,item.mask);grassSourceRoots+=roots.roots;grassSubmittedRoots+=roots.submitted;}if(isTerrain)terrainDraws++;else{casters++;instances+=source.isInstancedMesh?source.count:source.geometry.instanceCount??1;}});
  for(const[source,item]of this.records)if(item.stamp!==stamp){this.maskScene.remove(item.mask);if(item.reference)this.referenceScene.remove(item.reference);item.mask.dispose?.();item.reference?.dispose?.();item.roots?.dispose();this.records.delete(source);}
  const oldTarget=r.getRenderTarget(),shadow=r.shadowMap.enabled,clear=r.getClearColor(this.clear).clone(),alpha=r.getClearAlpha(),auto=r.autoClear,infoAutoReset=r.info.autoReset,before={...r.info.render};let success=false;
  try{r.shadowMap.enabled=false;r.autoClear=true;r.info.autoReset=false;r.setClearColor(0xffffff,1);r.setRenderTarget(this.reference);r.render(this.referenceScene,this.camera);r.setRenderTarget(this.mask);r.render(this.maskScene,this.camera);success=true;}
  finally{r.setRenderTarget(oldTarget);r.setClearColor(clear,alpha);r.autoClear=auto;r.info.autoReset=infoAutoReset;r.shadowMap.enabled=shadow;if(!success)this.uniforms.uCoverageParameters41.value.x=0;}
  Object.assign(this.stats,{ready:true,reason:'candidate-ground-only',casters,terrainDraws,instances,grassSourceRoots,grassSubmittedRoots,drawCalls:r.info.render.calls-before.calls,triangles:r.info.render.triangles-before.triangles,cpuMs:performance.now()-start});
 }
 dispose(){if(!this.mask)return;for(const restore of this.restores)restore();for(const variants of this.materials.values())for(const m of Object.values(variants))m.dispose();for(const d of this.ownedDepth.values())d.dispose();for(const item of this.records.values()){item.mask.dispose?.();item.reference?.dispose?.();item.roots?.dispose();}this.records.clear();this.mask.dispose();this.reference.dispose();}
}
