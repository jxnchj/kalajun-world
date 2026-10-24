import * as T from 'three';
// On-demand, one-off copy of an ALREADY RENDERED shadow depth attachment.
// Original texture parameters, maps, caster membership and wind are untouched.
// A native depth blit preserves the source samples; a nearest-sample shader
// exports the normalized GPU float's IEEE bits into four UNORM8 channels.
export function exportShadowDepth(renderer,csm,{cascade=0,center=null,x=null,y=null,width=512,height=512}={}){
 const light=csm.lights[cascade],source=light?.shadow.map;
 if(!source?.depthTexture)throw new Error('Cascade has no rendered depth attachment');
 if(source.samples>0||source.depthTexture.format!==T.DepthFormat)throw new Error('Shadow diagnostic expects a single-sample 2D depth attachment');
 width=Math.max(1,Math.min(source.width,Math.floor(width)));height=Math.max(1,Math.min(source.height,Math.floor(height)));
 if(center){const v=new T.Vector3(...center).applyMatrix4(light.shadow.matrix);x=Math.floor(v.x*source.width-width*.5);y=Math.floor(v.y*source.height-height*.5);}
 x=Math.max(0,Math.min(source.width-width,Math.floor(x??(source.width-width)*.5)));y=Math.max(0,Math.min(source.height-height,Math.floor(y??(source.height-height)*.5)));
 const depth=new T.DepthTexture(width,height,source.depthTexture.type);depth.format=source.depthTexture.format;depth.compareFunction=null;depth.minFilter=depth.magFilter=T.NearestFilter;
 const snapshot=new T.WebGLRenderTarget(width,height,{depthTexture:depth,depthBuffer:true,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter,generateMipmaps:false});
 const output=new T.WebGLRenderTarget(width,height,{depthBuffer:false,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter,generateMipmaps:false,colorSpace:T.NoColorSpace});
 const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,depthTest:false,depthWrite:false,blending:T.NoBlending,uniforms:{map:{value:depth}},vertexShader:'precision highp float; in vec3 position; out vec2 vUv; void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'precision highp float; precision highp int; uniform highp sampler2D map; in vec2 vUv; out vec4 result; void main(){uint b=floatBitsToUint(texture(map,vUv).r); uvec4 q=uvec4(b,b>>8u,b>>16u,b>>24u)&uvec4(255u);result=vec4(q)/255.;}'});
 const geometry=new T.PlaneGeometry(2,2),scene=new T.Scene();scene.add(new T.Mesh(geometry,material));const camera=createShadowDiagnosticCamera(renderer.capabilities.reversedDepthBuffer);
 const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel(),viewport=renderer.getViewport(new T.Vector4()),scissor=renderer.getScissor(new T.Vector4()),scissorTest=renderer.getScissorTest();
 const bytes=new Uint8Array(width*height*4),gl=renderer.getContext(),state=renderer.state;
 try{
  renderer.initRenderTarget(snapshot);renderer.initRenderTarget(output);
  const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),test=gl.isEnabled(gl.SCISSOR_TEST);
  try{
   const a=renderer.properties.get(source).__webglFramebuffer,b=renderer.properties.get(snapshot).__webglFramebuffer;if(!a||!b)throw new Error('Missing shadow diagnostic framebuffer');
   state.bindFramebuffer(gl.READ_FRAMEBUFFER,a);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,b);state.setScissorTest(false);
   if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE||gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Incomplete shadow diagnostic source/target');
   gl.blitFramebuffer(x,y,x+width,y+height,0,0,width,height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
  }finally{state.bindFramebuffer(gl.READ_FRAMEBUFFER,read);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);state.setScissorTest(test);}
  renderer.setRenderTarget(output);renderer.setScissorTest(false);renderer.render(scene,camera);renderer.readRenderTargetPixels(output,0,0,width,height,bytes);
 }finally{
  renderer.setRenderTarget(target,face,level);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
  snapshot.depthTexture=null;snapshot.dispose();depth.dispose();output.dispose();geometry.dispose();material.dispose();
 }
 const values=decodeShadowDepthBytes(bytes),reversed=light.shadow.camera.reversedDepth,clear=reversed?0:1;
 let min=Infinity,max=-Infinity,occupied=0;for(const v of values)if(v!==clear&&Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);occupied++;}
 let png=null;if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),span=max-min;
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){const v=values[row*width+col],k=((height-row-1)*width+col)*4,q=v===clear?255:Math.round(24+207*(span>0?(v-min)/span:0));image.data[k]=image.data[k+1]=image.data[k+2]=q;image.data[k+3]=255;}
  ctx.putImageData(image,0,0);png=canvas.toDataURL('image/png');
 }
 return {cascade,width,height,sourceDepthType:source.depthTexture.type,sourceSamples:source.samples,sourceSize:[source.width,source.height],roi:[x,y,width,height],reversedDepth:reversed,range:occupied?[min,max]:null,occupied,depth:values,depthBytes:bytes,png,rowOrder:'bottom-to-top',encoding:'RGBA bytes contain little-endian IEEE float32 normalized depth, without PCF; preview is range-stretched',camera:{near:light.shadow.camera.near,far:light.shadow.camera.far,matrixWorld:light.shadow.camera.matrixWorld.toArray(),projection:light.shadow.camera.projectionMatrix.toArray()}};
}
export function decodeShadowDepthBytes(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=new Float32Array(bytes.length/4);for(let i=0;i<result.length;i++)result[i]=view.getFloat32(i*4,true);return result;}

export function createShadowDiagnosticCamera(reversed=false){const camera=new T.OrthographicCamera(-1,1,1,-1,0,1);camera._reversedDepth=!!reversed;camera.updateProjectionMatrix();return camera;}
