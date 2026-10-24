import * as THREE from "three";
import { cloudUniformGLSL, cloudFieldGLSL } from "./cloud-field.js";

// The smallest cloud-noise wavelength is 125m. Four-metre samples preserve
// its soft shadow edge; a rolling cloud-plane cache covers the near world,
// with the exact analytic field retained outside it.
export const CLOUD_CACHE = Object.freeze({ size:2048, span:8192, step:512, cadence:.5 });
export function cloudCacheOrigin(position,sun,altitude=4400) {
  const travel=Math.max(altitude-position.y,0)/Math.max(sun.y,.008);
  return [Math.floor((position.x+sun.x*travel)/CLOUD_CACHE.step)*CLOUD_CACHE.step-CLOUD_CACHE.span/2,
    Math.floor((position.z+sun.z*travel)/CLOUD_CACHE.step)*CLOUD_CACHE.step-CLOUD_CACHE.span/2];
}
export class CloudShadowCache {
  constructor(renderer,uniforms) {
    this.renderer=renderer;this.uniforms=uniforms;this.targets=[];this.array=Boolean(uniforms.uCloudCacheArray);this.layers=[0,1];
    this.stats={enabled:Boolean(renderer.extensions.has("EXT_color_buffer_float")),array:this.array,attachmentBytes:2*CLOUD_CACHE.size*CLOUD_CACHE.size*2,renders:0,rebases:0,size:CLOUD_CACHE.size,texelMetres:CLOUD_CACHE.span/CLOUD_CACHE.size};
    this.epoch=-Infinity;this.coverage=NaN;this.origin=[Infinity,Infinity];
    if(!this.stats.enabled)return;
    const options={
      type:THREE.HalfFloatType,format:THREE.RedFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
      depthBuffer:false,stencilBuffer:false,generateMipmaps:false
    };
    this.targets=this.array?[new THREE.WebGLArrayRenderTarget(CLOUD_CACHE.size,CLOUD_CACHE.size,2,options)]:Array.from({length:2},()=>new THREE.WebGLRenderTarget(CLOUD_CACHE.size,CLOUD_CACHE.size,options));
    this.bakeUniforms={...uniforms,uCloudTime:{value:0},uBakeOrigin:{value:new THREE.Vector2()},uBakeSpan:{value:CLOUD_CACHE.span}};
    this.material=new THREE.ShaderMaterial({
      uniforms:this.bakeUniforms,depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:cloudUniformGLSL+cloudFieldGLSL+`
uniform vec2 uBakeOrigin;uniform float uBakeSpan;varying vec2 vUv;
void main(){float depth=cloudDepthAt(uBakeOrigin+vUv*uBakeSpan);gl_FragColor=vec4(depth,0.,0.,1.);}
`
    });
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
  }
  bake(target,time,layer=0){
    const r=this.renderer,previous=r.getRenderTarget(),face=r.getActiveCubeFace(),level=r.getActiveMipmapLevel();
    const autoClear=r.autoClear;this.bakeUniforms.uCloudTime.value=time;
    try {r.autoClear=true;r.setRenderTarget(target,layer,0);r.render(this.scene,this.camera);this.stats.renders++;}
    finally {r.setRenderTarget(previous,face,level);r.autoClear=autoClear;}
  }
  update(camera) {
    if(!this.stats.enabled)return;
    const u=this.uniforms,t=u.uCloudTime.value,epoch=Math.floor(t/CLOUD_CACHE.cadence),origin=cloudCacheOrigin(camera.position,u.uCloudSun.value,u.uCloudAltitude.value);
    const moved=origin[0]!==this.origin[0]||origin[1]!==this.origin[1],changed=this.coverage!==u.uCloudCoverage.value||u.uCloudCacheReady.value<.5;
    if(moved||changed||epoch!==this.epoch){
      // Never publish partially updated endpoint pairs after a failed bake.
      u.uCloudCacheReady.value=0;
      const nextLayers=[...this.layers];
      if(moved||changed||epoch!==this.epoch+1){
        this.origin=origin;this.bakeUniforms.uBakeOrigin.value.set(...origin);
        this.bake(this.targets[0],epoch*CLOUD_CACHE.cadence,nextLayers[0]);
        this.bake(this.targets[this.array?0:1],(epoch+1)*CLOUD_CACHE.cadence,this.array?nextLayers[1]:0);
        if(moved)this.stats.rebases++;
      } else {
        if(this.array){nextLayers.reverse();this.bake(this.targets[0],(epoch+1)*CLOUD_CACHE.cadence,nextLayers[1]);}
        else {this.bake(this.targets[0],(epoch+1)*CLOUD_CACHE.cadence);this.targets.reverse();}
      }
      this.epoch=epoch;this.coverage=u.uCloudCoverage.value;
      this.layers=nextLayers;
      if(this.array){u.uCloudCacheArray.value=this.targets[0].texture;u.uCloudCacheLayers.value.set(...this.layers);}
      else {u.uCloudCacheA.value=this.targets[0].texture;u.uCloudCacheB.value=this.targets[1].texture;}
      u.uCloudCacheOrigin.value.set(...origin);u.uCloudCacheSpan.value=CLOUD_CACHE.span;u.uCloudCacheReady.value=1;
    }
    u.uCloudCacheBlend.value=(t-epoch*CLOUD_CACHE.cadence)/CLOUD_CACHE.cadence;
  }
  dispose(){
    this.uniforms.uCloudCacheReady.value=0;
    this.targets.forEach(t=>t.dispose());this.targets.length=0;
    this.quad?.geometry.dispose();this.material?.dispose();this.scene?.clear();
  }
}
