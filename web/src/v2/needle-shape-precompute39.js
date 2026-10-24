import * as THREE from 'three';

export function needleShapeLayout39(stations,maxTextureSize=16384){
 if(!Number.isInteger(stations)||stations<1)throw new RangeError('Invalid needle station count');
 const needles=stations*5,width=Math.min(1024,maxTextureSize),height=Math.ceil(needles/width);
 if(height>maxTextureSize)throw new RangeError('Needle shape table exceeds native texture size');
 return{stations,needles,width,height,attachmentBytes:width*height*32,logicalBytes:needles*32};
}
// These are the original station construction expressions, including operation
// order. Actual GPU readback still must prove equality across compiler programs.
export function needleShapeBakeVertex39(branches){return `
precision highp float;precision highp int;
in vec4 aNeedleFrame0,aNeedleFrame1,aNeedleFrame2,aNeedleFrame3;
${branches?'in vec4 aSprayLod;uniform sampler2D uBranchVariation;uniform int uBranchOriginalBrushes;':'in vec4 aNeedleVariation0,aNeedleVariation1,aNeedleVariation2;'}
uniform ivec2 uShapeSize;
flat out vec4 vDeltaSide;flat out vec4 vSide;
void main(){
 int needle=gl_VertexID;vec2 al;
 ${branches?`int station=gl_InstanceID%288;int variationBrush=aSprayLod.w>.5?uBranchOriginalBrushes+int(mod(aSprayLod.w-1.,16.)+.5):gl_InstanceID/288;int j=variationBrush*1440+station*5+needle;vec4 pair=texelFetch(uBranchVariation,ivec2((j/2)%1024,(j/2)/1024),0);al=j%2==0?pair.xy:pair.zw;`:`if(needle==0)al=aNeedleVariation0.xy;else if(needle==1)al=aNeedleVariation0.zw;else if(needle==2)al=aNeedleVariation1.xy;else if(needle==3)al=aNeedleVariation1.zw;else al=aNeedleVariation2.xy;`}
 vec3 delta=(${branches?'normalize(cross(aNeedleFrame2.xyz,aNeedleFrame1.xyz))':'aNeedleFrame3.xyz'}*cos(al.x)+aNeedleFrame2.xyz*sin(al.x))*al.y+aNeedleFrame1.xyz*(al.y*.36);
 vec3 side=normalize(cross(delta,aNeedleFrame1.xyz));
 vDeltaSide=vec4(delta,side.x);vSide=vec4(side.yz,0.,0.);
 int index=gl_InstanceID*5+needle;ivec2 pixel=ivec2(index%uShapeSize.x,index/uShapeSize.x);
 gl_Position=vec4((vec2(pixel)+.5)/vec2(uShapeSize)*2.-1.,0.,1.);gl_PointSize=1.;
}`;}
const FRAGMENT=`precision highp float;
flat in vec4 vDeltaSide;flat in vec4 vSide;
layout(location=0)out vec4 outDeltaSide;layout(location=1)out vec4 outSide;
void main(){outDeltaSide=vDeltaSide;outSide=vSide;}`;

// Explicit review/prepare call only, never invoked by a render callback. The
// resulting local shape table has no root, camera, time, wind or LOD dependency.
// Each lazy packet owns its own result; callers must dispose on packet eviction.
export function bakeNeedleShape39(renderer,form,{branches=form.stationGeometry.hasAttribute('aSprayLod')}={}){
 const gl=renderer.getContext();
 if(!renderer.extensions.has('EXT_color_buffer_float')||gl.getParameter(gl.MAX_DRAW_BUFFERS)<2)throw Error('RGBA32F two-target needle bake unavailable');
 const source=form.stationGeometry,layout=needleShapeLayout39(source.userData.stationCount,renderer.capabilities.maxTextureSize);
 const geometry=new THREE.InstancedBufferGeometry(),borrowed=[];
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(15),3));
 const names=['aNeedleFrame0','aNeedleFrame1','aNeedleFrame2','aNeedleFrame3',...(branches?['aSprayLod']:['aNeedleVariation0','aNeedleVariation1','aNeedleVariation2'])];
 for(const name of names){const attribute=source.getAttribute(name);if(!attribute)throw Error('Missing station input '+name);geometry.setAttribute(name,attribute);borrowed.push(name);}
 geometry.instanceCount=layout.stations;
 const variation=form.material?.userData.spruceBranchVariation||form.tables?.branchVariations;
 if(branches&&!variation)throw Error('Missing source branch variations');
 const target=new THREE.WebGLRenderTarget(layout.width,layout.height,{count:2,type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,depthBuffer:false,stencilBuffer:false});
 target.textures.forEach((t,i)=>{t.name='needle-local-shape39-'+i;t.colorSpace=THREE.NoColorSpace;});
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:needleShapeBakeVertex39(branches),fragmentShader:FRAGMENT,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,uniforms:{uShapeSize:{value:new THREE.Vector2(layout.width,layout.height)},uBranchVariation:{value:variation},uBranchOriginalBrushes:{value:form.material?.userData.spruceBranchOriginalBrushes??form.tables?.originalBrushes??0}}});
 const scene=new THREE.Scene(),camera=new THREE.Camera(),points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);
 const state={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),auto:renderer.autoClear,color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),xr:renderer.xr.enabled,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest()};
 const started=performance.now();let success=false;
 try{
  renderer.xr.enabled=false;renderer.autoClear=false;renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.render(scene,camera);success=true;
  return{target,layout,branches,source,stats:{...layout,submissionMs:performance.now()-started,gpuMs:null},dispose(){target.dispose();}};
 }finally{
  renderer.setClearColor(state.color,state.alpha);renderer.setViewport(state.viewport);renderer.setScissor(state.scissor);renderer.setScissorTest(state.scissorTest);renderer.setRenderTarget(state.target,state.face,state.mip);renderer.autoClear=state.auto;renderer.xr.enabled=state.xr;
  for(const name of borrowed)geometry.deleteAttribute(name);geometry.dispose();material.dispose();scene.clear();if(!success)target.dispose();
 }
}
