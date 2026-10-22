const ATTRIBUTES={alpha:false,depth:true,stencil:false,powerPreference:'high-performance'};
function reversedFloat(context){return Boolean(context?.getExtension('EXT_clip_control')&&context?.getExtension('EXT_color_buffer_float'));}
function worldSamples(context){
 const cap=Math.min(4,context.getParameter(context.MAX_SAMPLES));
 const color=context.getInternalformatParameter(context.RENDERBUFFER,context.RGBA16F,context.SAMPLES);
 const depth=new Set(context.getInternalformatParameter(context.RENDERBUFFER,context.DEPTH_COMPONENT32F,context.SAMPLES));
 return Math.max(0,...Array.from(color).filter(n=>n<=cap&&depth.has(n)));
}
function release(context){try{context?.getExtension('WEBGL_lose_context')?.loseContext();}catch{/* A lost probe must never prevent the conservative AA path. */}}
function probeWorldTarget(createCanvas){
 let probe,context;
 try{
  probe=createCanvas();probe.width=probe.height=1;
  context=probe.getContext('webgl2',{...ATTRIBUTES,antialias:false});
  // Without explicit release support do not opt into an extra context strategy.
  return Boolean(context?.getExtension('WEBGL_lose_context')&&reversedFloat(context)&&worldSamples(context)>=2);
 }catch{return false;}
 finally{release(context);if(probe)probe.width=probe.height=0;}
}

// The HDR WorldFrame already antialiases the complete world. Its screen pass is
// one full-screen triangle, so a second multisampled canvas is redundant. Probe
// before selecting immutable context attributes, then recheck the real context.
// This must run before controls or other canvas listeners are installed.
export function createWorldContext(original,{search=globalThis.location?.search||'',createCanvas=()=>document.createElement('canvas')}={}){
 const params=new URLSearchParams(search),logDepth=params.get('depth')==='log',legacy=params.get('screenMSAA')==='1';
 const eligible=!logDepth&&!legacy&&probeWorldTarget(createCanvas);
 let canvas=original,context,antialias=!eligible,fallback=false;
 try{context=canvas.getContext('webgl2',{...ATTRIBUTES,antialias});}
 catch(error){if(!eligible)throw error;}
 if(eligible){
  let verified=false;
  try{verified=Boolean(reversedFloat(context)&&worldSamples(context)>=2&&!context.isContextLost?.());}catch{/* Use the original canvas-AA behavior below. */}
  if(!verified){
   // getContext cannot change attributes on an existing canvas. Clone its DOM
   // attributes (id, class, style, dimensions, accessibility) before listeners
   // exist, obtain the conservative context, then replace the unused element.
   const replacement=original.cloneNode(false);
   release(context);context=null;
   try{context=replacement.getContext('webgl2',{...ATTRIBUTES,antialias:true});if(!context)throw new Error('WebGL2 context unavailable after AA fallback');}
   catch(error){release(context);throw error;}
   original.replaceWith(replacement);canvas=replacement;antialias=true;fallback=true;
  }
 }
 if(!context)throw new Error('WebGL2 context unavailable');
 const reversedDepth=!logDepth&&reversedFloat(context);
 return {canvas,context,reversedDepth,stats:{screenAntialias:context.getContextAttributes?.()?.antialias??antialias,requestedScreenAntialias:antialias,worldTargetSamples:reversedDepth?worldSamples(context):null,probeEligible:eligible,fallback}};
}
