// Forest scans retain their authored metre scale. The second projection is
// only 3.7% smaller; a non-periodic blend comes from the EXISTING meadow field.
export const FOREST_SCAN_SCALE=1.037;
export const FOREST_SCAN_ROTATION=Object.freeze([Math.cos(Math.PI*.35),Math.sin(Math.PI*.35)]);
const LINEAR=new Float64Array(256);
for(let i=0;i<256;i++){const s=i/255;LINEAR[i]=s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}
export function forestScanMean(rgba){
  if(!rgba.length||rgba.length%4)throw new RangeError("Forest scan pixels must be RGBA");
  const mean=[0,0,0];for(let i=0;i<rgba.length;i+=4)for(let k=0;k<3;k++)mean[k]+=LINEAR[rgba[i+k]];
  return mean.map(v=>v/(rgba.length/4));
}
const rotate=([x,z],c,s)=>[c*x-s*z,s*x+c*z];
export function forestScanProjection(point,period,leaf=false,secondary=false,gradient=false){
  let p=leaf?rotate(point,.8,.6):point.slice();p=p.map(v=>v/period);
  if(secondary){p=rotate(p,...FOREST_SCAN_ROTATION).map(v=>v*FOREST_SCAN_SCALE);
    if(!gradient)p=p.map((v,i)=>v+[.371,.819][i]);}
  return p;
}
export function forestScanSlope(normal,leaf=false,secondary=false){
  let p=normal.slice(0,2).map(v=>-v/Math.max(.35,normal[2]));
  if(secondary)p=rotate(p,FOREST_SCAN_ROTATION[0],-FOREST_SCAN_ROTATION[1]).map(v=>v*FOREST_SCAN_SCALE);
  return leaf?rotate(p,.8,-.6):p;
}
export function forestScanVarianceGain(blend){return 1/Math.sqrt((1-blend)**2+blend**2);}
// A scan fade must lose high-frequency detail, not its DC (mean albedo).
// Keep the resolved near endpoint exactly equal to the accepted v25 blend;
// only the residual is faded, so crossing 32--90 m cannot recolour the soil.
export function forestScanDistanceColor(base,mean,sample,cover,fade){
  return base.map((v,i)=>v+(mean[i]-v)*.76*cover+(sample[i]-mean[i])*.76*cover*fade);
}
export const FOREST_SCAN_GLSL=/* glsl */`
uniform float terrainForestContinuity;
uniform float terrainForestMeanContinuity;
uniform vec3 terrainScanMean[2];
void terrainForestScan(float layer,vec2 uv,vec2 dx,vec2 dy,float blend,out vec3 colour,out vec2 slope){
  mat2 turn=mat2(.4539904997,.8910065242,-.8910065242,.4539904997);
  mat2 inverseTurn=mat2(.4539904997,-.8910065242,.8910065242,.4539904997);
  vec3 a=textureGrad(terrainScanColors,vec3(uv,layer),dx,dy).rgb;
  vec3 b=textureGrad(terrainScanColors,vec3(turn*uv*1.037+vec2(.371,.819),layer),turn*dx*1.037,turn*dy*1.037).rgb;
  vec3 na=textureGrad(terrainScanNormals,vec3(uv,layer),dx,dy).xyz*2.-1.;
  vec3 nb=textureGrad(terrainScanNormals,vec3(turn*uv*1.037+vec2(.371,.819),layer),turn*dx*1.037,turn*dy*1.037).xyz*2.-1.;
  // Independent projections otherwise lose fine variance when crossfaded.
  // Restore it about the measured LINEAR image mean, rather than blurring or
  // baking light into the scan. Normal slopes are rotated back before blending.
  float gain=inversesqrt((1.-blend)*(1.-blend)+blend*blend);
  vec3 mean=terrainScanMean[int(layer)];
  colour=clamp(mean+(mix(a,b,blend)-mean)*gain,vec3(0.),vec3(1.));
  slope=mix(-na.xy/max(.35,na.z),inverseTurn*(-nb.xy/max(.35,nb.z))*1.037,blend)*gain;
}
`;
