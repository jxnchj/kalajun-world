import {Vector3} from 'three';
// One metre BEFORE the first cutoff: retain the original closest-map extent
// and texel pitch. The second map gains receiver support; no caster is removed.
export function csmFadeEdge(csm,edge){
 const state=csm.closeShadowOverlap;
 return state?.enabled&&edge===csm.breaks[0]?edge-state.uniform.value.z*.5:edge;
}
export function csmFadeMargin(csm,edge){
 const state=csm.closeShadowOverlap;
 return state?.enabled&&edge===csm.breaks[0]?Math.max(.25*edge*edge,state.uniform.value.z):.25*edge*edge;
}
export function installCloseShadowOverlap(csm,{enabled=false,widthMeters=1}={}){
 if(!Number.isFinite(widthMeters)||widthMeters<=0)throw new RangeError('Positive overlap width required');
 const state={enabled:!!enabled,widthMeters,uniform:{value:new Vector3()},original:csm._initCascades};
 csm.closeShadowOverlap=state;
 const refresh=()=>{const span=Math.min(csm.maxFar,csm.camera.far)-csm.camera.near,edge=csm.breaks[0];state.uniform.value.set(edge,edge-widthMeters/span*.5,widthMeters/span);};
 const init=function(){
  state.original.call(this);refresh();if(!state.enabled)return;
  if(this.frustums.length<2||widthMeters>this.breaks[0]*(Math.min(this.maxFar,this.camera.far)-this.camera.near)*.5)throw new RangeError('Overlap exceeds first-cascade support');
  const span=Math.min(this.maxFar,this.camera.far)-this.camera.near;
  const depth=Math.max(this.camera.near,(csmFadeEdge(this,this.breaks[0])-csmFadeMargin(this,this.breaks[0])*.5)*span);
  const main=this.mainFrustum.vertices,near=-main.near[0].z,far=-main.far[0].z,alpha=(depth-near)/(far-near);
  for(let j=0;j<4;j++)this.frustums[1].vertices.near[j].lerpVectors(main.near[j],main.far[j],alpha);
 };
 if(state.enabled)csm._initCascades=init;
 csm.updateFrustums();refresh();
 return {state,dispose(){if(csm._initCascades===init)csm._initCascades=state.original;if(csm.closeShadowOverlap===state)delete csm.closeShadowOverlap;csm.updateFrustums();}};
}
export function installCloseShadowOverlapShader(shader,handle,debug=null){
 const state=handle?.state;if(!state||(!state.enabled&&!debug))return;
 shader.uniforms.uCloseShadowOverlap=state.uniform;
 const enabled=state.enabled?'1.0':'0.0';
 const helpers=`uniform vec3 uCloseShadowOverlap;
float closeCSMEdge(float e){return ${enabled}>.5 && abs(e-uCloseShadowOverlap.x)<1e-7?uCloseShadowOverlap.y:e;}
float closeCSMMargin(float e){return ${enabled}>.5 && abs(e-uCloseShadowOverlap.y)<1e-7?max(.25*uCloseShadowOverlap.x*uCloseShadowOverlap.x,uCloseShadowOverlap.z):.25*e*e;}
`;
 const edge='cascade = CSM_cascades[ i ];',margin='margin = 0.25 * pow( closestEdge, 2.0 );';
 if(!shader.fragmentShader.includes(edge)||!shader.fragmentShader.includes(margin))throw new Error('Unsupported CSM fade shader');
 shader.fragmentShader=helpers+shader.fragmentShader.replace(edge,edge+' cascade=vec2(closeCSMEdge(cascade.x),closeCSMEdge(cascade.y));').replace(margin,'margin = closeCSMMargin( closestEdge );');
 if(debug){
  shader.uniforms.uWorldCascadeDebug=debug;
  shader.fragmentShader='uniform float uWorldCascadeDebug;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
#if defined(USE_CSM) && defined(CSM_FADE)
if(uWorldCascadeDebug>.5){
 vec3 cascadeColour=vec3(0.);float weightSum=0.;
 for(int k=0;k<CSM_CASCADES;k++){
  vec2 edges=CSM_cascades[k];edges=vec2(closeCSMEdge(edges.x),closeCSMEdge(edges.y));
  float e=linearDepth<(edges.x+edges.y)*.5?edges.x:edges.y,m=closeCSMMargin(e);
  float lo=edges.x-m*.5,hi=edges.y+m*.5;
  float w=linearDepth>=lo&&(linearDepth<hi||k==CSM_CASCADES-1)?(m>0.?clamp(min(linearDepth-lo,hi-linearDepth)/m,0.,1.):1.):0.;
  if(k==CSM_CASCADES-1&&linearDepth>(edges.x+edges.y)*.5)w=1.;
  vec3 c=k==0?vec3(1.,.12,.08):k==1?vec3(.08,1.,.12):k==2?vec3(.1,.2,1.):vec3(1.,.1,1.);
  cascadeColour+=c*w;weightSum+=w;
 }
 gl_FragColor=vec4(uWorldCascadeDebug>1.5?vec3(weightSum):cascadeColour,1.);
}
#endif`);
 }
}
