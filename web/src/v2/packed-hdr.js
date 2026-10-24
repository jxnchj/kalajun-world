// Precision-changing HDR candidate. No fallback to fewer samples or LDR.
export function probePackedHDR4(gl){
 if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Packed HDR requires EXT_color_buffer_float');
 const colorSamples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.R11F_G11F_B10F,gl.SAMPLES)),depthSamples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,gl.SAMPLES));
 if(!colorSamples.includes(4)||!depthSamples.includes(4))throw Error('Packed HDR requires native 4x color and Float32 depth; refusing sample reduction');
 const saved={read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),rb:gl.getParameter(gl.RENDERBUFFER_BINDING),tex:gl.getParameter(gl.TEXTURE_BINDING_2D),scissor:gl.isEnabled(gl.SCISSOR_TEST),mask:gl.getParameter(gl.COLOR_WRITEMASK)};
 const fb=gl.createFramebuffer(),resolved=gl.createFramebuffer(),color=gl.createRenderbuffer(),depth=gl.createRenderbuffer(),texture=gl.createTexture();
 try{
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.bindRenderbuffer(gl.RENDERBUFFER,color);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.R11F_G11F_B10F,2,2);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,color);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,4,gl.DEPTH_COMPONENT32F,2,2);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Packed HDR native MSAA FBO incomplete');
  gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);gl.clearBufferfv(gl.COLOR,0,new Float32Array([.25,.5,2,1]));
  gl.bindFramebuffer(gl.FRAMEBUFFER,resolved);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texStorage2D(gl.TEXTURE_2D,1,gl.R11F_G11F_B10F,2,2);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Packed HDR resolve FBO incomplete');
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);gl.blitFramebuffer(0,0,2,2,0,0,2,2,gl.COLOR_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,resolved);const pixel=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);const error=gl.getError();
  if(error!==gl.NO_ERROR||pixel.some((v,i)=>Math.abs(v-[.25,.5,2,1][i])>.001))throw Error('Packed HDR native resolve/readback failed: '+error);
  return {format:'R11F_G11F_B10F',samples:4,colorSamples,depthSamples,complete:true,resolvedHDR:Array.from(pixel),precisionChanging:true};
 }finally{
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,saved.read);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,saved.draw);gl.bindRenderbuffer(gl.RENDERBUFFER,saved.rb);gl.bindTexture(gl.TEXTURE_2D,saved.tex);gl.colorMask(...saved.mask);if(saved.scissor)gl.enable(gl.SCISSOR_TEST);else gl.disable(gl.SCISSOR_TEST);gl.deleteFramebuffer(fb);gl.deleteFramebuffer(resolved);gl.deleteRenderbuffer(color);gl.deleteRenderbuffer(depth);gl.deleteTexture(texture);
 }
}
