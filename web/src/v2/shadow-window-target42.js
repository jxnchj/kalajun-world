import {Vector4} from 'three';
// Restore target attachment AND explicit renderer raster bounds. setRenderTarget
// alone replaces viewport/scissor with target defaults and loses caller overrides.
export function captureWindowTarget42(renderer){
 const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.()??0,level=renderer.getActiveMipmapLevel?.()??0;
 const viewport=renderer.getViewport?.(new Vector4()),scissor=renderer.getScissor?.(new Vector4()),scissorTest=renderer.getScissorTest?.();
 return ()=>{renderer.setRenderTarget(target,face,level);if(viewport)renderer.setViewport(viewport);if(scissor)renderer.setScissor(scissor);if(scissorTest!==undefined)renderer.setScissorTest(scissorTest);};
}
