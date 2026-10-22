// Material coverage only: hydrology, terrain geometry and plant roots retain
// their source data. Reuse the existing 16 m meadow and metre-scale canopy
// samples; no new noise, texture reads or camera-dependent placement.
// Fine material edges must follow resolved tufts, independently of whether the
// ecological colour field has small spots or connected meadow masses. Reuse the
// exact retained canopy channel; beyond its footprint the extra term vanishes.
export const SURFACE_TUFT_RESPONSE=new URLSearchParams(globalThis.location?.search||"").get("surfaceStructure")==="v20"?.6:1.2;
// All channels describing the same 2.4 m tufts use the same pixel footprint.
// v24 retained subpixel soil/rock islands after canopy colour/height resolved.
export const SURFACE_FOOTPRINT=new URLSearchParams(globalThis.location?.search||"").get("surfaceFootprint")==="v24"?[1,3.5]:[.35,1.3];
export const surfaceTransitionVariation={value:1};
export function setSurfaceTransitionVariation(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Surface transition expects a boolean");
  surfaceTransitionVariation.value=enabled?1:0;return enabled;
}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function surfaceTransitionStructure(broad,canopy,footprint){
  // Subpixel tuft structure resolves to its mean. Broad patches already come
  // from the same mip-filtered field used by ground and standing grass.
  return clamp((broad-.4696247624)*1.7
    +(canopy-.5112955131)*SURFACE_TUFT_RESPONSE*(1-smooth(...SURFACE_FOOTPRINT,footprint)),-1,1);
}
export function surfaceTransitionCoverage(coverage,structure,strength){
  // A monotone redistribution inside mixed pixels. Pure classes remain exact;
  // signed strength <= .9 cannot fold, overshoot, or make detached islands
  // outside the original mask. Neutral structure preserves the original mix.
  const c=clamp(coverage),s=clamp(structure,-1,1)*clamp(strength,0,.9);
  return c+c*(1-c)*s;
}
export const SURFACE_TRANSITION_GLSL=/* glsl */`
uniform float uSurfaceTransitionVariation;
float surfaceTransitionStructure(float broad,float canopy,float footprint){
  return clamp((broad-.4696247624)*1.7
    +(canopy-.5112955131)*${SURFACE_TUFT_RESPONSE.toFixed(1)}*(1.-smoothstep(${SURFACE_FOOTPRINT[0].toFixed(2)},${SURFACE_FOOTPRINT[1].toFixed(2)},footprint)),-1.,1.);
}
float surfaceTransitionCoverage(float coverage,float structure,float strength){
  float c=clamp(coverage,0.,1.),s=clamp(structure,-1.,1.)*clamp(strength,0.,.9);
  return c+c*(1.-c)*s;
}
`;
