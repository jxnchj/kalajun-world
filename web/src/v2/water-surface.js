import * as THREE from "three";

// Two periodic, multi-direction slope bands. The bake is a kinematic surface
// approximation, not a shallow-water or Navier-Stokes simulation. It replaces
// three coherent crests with many different wavelengths and directions.
export const WATER_SURFACE=Object.freeze({size:256,coarseSpan:14,fineSpan:3.9,coarseMaxFrequency:12,fineMaxFrequency:27,ior:1.333,
  absorption:Object.freeze([.52,.18,.11])});
const fract=x=>x-Math.floor(x);
const hash=(n,seed)=>{let x=Math.imul(n^seed,1597334677);x=Math.imul(x^(x>>>16),2246822519);return((x^(x>>>13))>>>0)/4294967296;};
let baked;
function spectrum(count,min,max,seed){
  const modes=[],used=new Set();
  for(let i=0;modes.length<count;i++){
    const angle=(i*.618033988749895+hash(i,seed)*.28)*Math.PI*2,radius=min+(max-min)*hash(i,seed+17);
    const x=Math.round(Math.cos(angle)*radius),y=Math.round(Math.sin(angle)*radius),key=x+","+y;
    if(used.has(key)||used.has((-x)+","+(-y))||(!x&&!y))continue;
    used.add(key);const length=Math.hypot(x,y);
    modes.push({x,y,dx:x/length,dy:y/length,phase:hash(i,seed+39)*Math.PI*2,amplitude:(.65+.35*hash(i,seed+51))/Math.sqrt(count)});
  }
  return modes;
}
export function waterSlopePixels(){
  if(baked)return baked;
  const n=WATER_SURFACE.size,values=new Float32Array(n*n*4),data=new Uint8Array(values.length);
  const bands=[spectrum(16,3,11,157),spectrum(24,7,26,719)],peaks=[0,0],variance=[0,0];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n,index=(y*n+x)*4;
    for(let band=0;band<2;band++){
      let gx=0,gy=0;
      for(const m of bands[band]){
        const wave=-Math.sin((m.x*u+m.y*v)*Math.PI*2+m.phase)*m.amplitude;
        gx+=m.dx*wave;gy+=m.dy*wave;
      }
      values[index+band*2]=gx;values[index+band*2+1]=gy;
      peaks[band]=Math.max(peaks[band],Math.abs(gx),Math.abs(gy));
    }
  }
  for(let i=0;i<values.length;i++){
    const band=(i%4)>>1,value=values[i]/peaks[band];
    data[i]=Math.round((value*.5+.5)*255);
    variance[band]+=(data[i]/255*2-1)**2/(n*n);
  }
  baked={data,variance,bands};return baked;
}
export function sampleWaterSlope(u,v){
  const {data}=waterSlopePixels(),n=WATER_SURFACE.size,x=fract(u)*n-.5,y=fract(v)*n-.5;
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,wrap=i=>(i+n)%n;
  const at=(a,b,c)=>data[(wrap(b)*n+wrap(a))*4+c]/255*2-1;
  return Array.from({length:4},(_,c)=>(at(ix,iy,c)*(1-fx)+at(ix+1,iy,c)*fx)*(1-fy)+(at(ix,iy+1,c)*(1-fx)+at(ix+1,iy+1,c)*fx)*fy);
}
export function waterOpticalPath(depth,cosView){
  const n=WATER_SURFACE.ior,c=Math.max(0,Math.min(1,cosView));
  return Math.max(0,depth)/Math.sqrt(1-(1-c*c)/(n*n));
}
// CPU references for the bounded shader response; these do not change channel
// geometry, flow travel time or the river network's physical depth.
const clamp01=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};
export function waterFlowResponse(depth,centerDepth,across,speed,slope){
  const depthRatio=clamp01(depth/Math.max(.045,.025+centerDepth));
  const bankDrag=smooth(0,.12,1-Math.abs(across));
  const localSpeed=Math.max(.25,speed)*(.30+.82*smooth(0,.45,depthRatio))*bankDrag;
  const froude=localSpeed/Math.sqrt(9.81*Math.max(.045,depth));
  const wet=smooth(.001,.025,depth)*bankDrag;
  const riffle=clamp01(Math.max(0,slope)*4.5+smooth(.40,1.05,froude)*.65)*wet;
  return {localSpeed,riffle,coarse:.060+.065*riffle,fine:.040+.190*riffle,
    normalDamping:smooth(.003,.055,depth)};
}
export function waterReflectionResponse(dfg){
  const f0=((WATER_SURFACE.ior-1)/(WATER_SURFACE.ior+1))**2;
  const single=f0*dfg[0]+dfg[1],lost=1-dfg[0]-dfg[1],average=f0+(1-f0)/21;
  const multi=single*average/(1-lost*average)*lost;
  return {single,multi,coverage:clamp01(single+multi)};
}
const bindings=new WeakMap();let texture=null,references=0;
export function bindWaterSlopeField(material){
  if(bindings.has(material))return bindings.get(material);
  const field=waterSlopePixels();
  if(!texture){
    texture=new THREE.DataTexture(field.data,WATER_SURFACE.size,WATER_SURFACE.size,THREE.RGBAFormat);
    texture.name="river-multidirectional-slope-bands";texture.colorSpace=THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  }
  const uniforms={uRiverSlopeMap:{value:texture},uRiverSlopeVariance:{value:new THREE.Vector2(...field.variance)}};
  bindings.set(material,uniforms);references++;
  const release=()=>{material.removeEventListener("dispose",release);bindings.delete(material);if(--references===0){texture.dispose();texture=null;}};
  material.addEventListener("dispose",release);return uniforms;
}
export const WATER_SURFACE_GLSL=`
uniform float uWaterSurfaceDetail;
uniform float uWaterOpticsDetail;
uniform sampler2D uRiverSlopeMap;
uniform vec2 uRiverSlopeVariance;
// Snell limits the submerged path even at a grazing view. This is an analytic
// clear-water thickness approximation using the existing designed river bed;
// it does not sample/refract the framebuffer or pretend to solve caustics.
// The bank loses streamwise momentum before becoming a dry boundary. Using the
// channel-centre speed at every depth would falsely turn the whole bank into a
// fast riffle. This is a bounded profile approximation, not a flow simulation.
vec3 riverFlowResponse(float depth,float centerDepth,float across,float speed,float slope){
  float depthRatio=clamp(depth/max(.045,.025+centerDepth),0.0,1.0);
  float bankDrag=smoothstep(0.0,.12,1.0-abs(across));
  float localSpeed=max(.25,speed)*(.30+.82*smoothstep(0.0,.45,depthRatio))*bankDrag;
  float froude=localSpeed/sqrt(9.81*max(.045,depth));
  float wet=smoothstep(.001,.025,depth)*bankDrag;
  float riffle=clamp(max(0.0,slope)*4.5+smoothstep(.40,1.05,froude)*.65,0.0,1.0)*wet;
  return vec3(localSpeed,riffle,smoothstep(.003,.055,depth));
}
float riverOpticalPath(float depth,float cosView){
  return max(0.0,depth)/sqrt(1.0-(1.0-cosView*cosView)/(1.333*1.333));
}
`;
