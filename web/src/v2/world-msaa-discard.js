// Owned WorldFrame transient attachments only. The resolved texture and the
// separate opaque refraction snapshot are never invalidated. No UA policy.
export function discardResolvedWorldMSAA(renderer,target){
 if(!(target.samples>0)||renderer.getRenderTarget()!==target)return 'not-current-msaa';
 // WorldFrame forces autoClear=true, but honours these component policies.
 // Partial-frame/scissored callers retain their attachments unchanged.
 if(!renderer.autoClear||renderer.autoClearColor!==true||renderer.autoClearDepth!==true||target.scissorTest)return 'persistent-or-partial';
 const gl=renderer.getContext(),props=renderer.properties.get(target),ms=props.__webglMultisampledFramebuffer;
 // Multisampled-render-to-texture has no separate throw-away renderbuffers.
 if(!ms||ms===props.__webglFramebuffer)return 'no-separate-msaa';
 const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
 try{
  renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,ms);
  const attachments=target.textures.map((_,i)=>gl.COLOR_ATTACHMENT0+i);
  if(target.depthBuffer)attachments.push(target.stencilBuffer?gl.DEPTH_STENCIL_ATTACHMENT:gl.DEPTH_ATTACHMENT);
  gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER,attachments);
  return 'discarded';
 }finally{
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,read);
  renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);
 }
}
