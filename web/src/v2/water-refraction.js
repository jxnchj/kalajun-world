import * as THREE from "three";

export function createWaterRefractionUniforms(){
  return {uWaterRefraction:{value:1},uRiverRefractionValid:{value:0},uRiverSceneColor:{value:null},uRiverSceneDepth:{value:null},
    uRiverSceneSize:{value:new THREE.Vector2(1,1)},uRiverSceneProjection:{value:new THREE.Matrix4()},uRiverSceneInverse:{value:new THREE.Matrix4()}};
}
export function supportsWaterRefraction(renderer,camera,source){
  return Boolean(renderer.capabilities.reversedDepthBuffer&&!renderer.capabilities.logarithmicDepthBuffer&&camera?.isPerspectiveCamera&&camera.reversedDepth&&
    source?.isWebGLRenderTarget&&source.texture.type===THREE.HalfFloatType&&source.texture.format===THREE.RGBAFormat&&source.texture.colorSpace===THREE.LinearSRGBColorSpace&&
    source.depthTexture?.type===THREE.FloatType&&source.depthTexture.format===THREE.DepthFormat&&source.textures.length===1&&!source.scissorTest&&
    source.viewport.x===0&&source.viewport.y===0&&source.viewport.z===source.width&&source.viewport.w===source.height);
}
// Reference helpers test real reversed projection/Snell geometry independently
// of shader string checks. Only the above Float32 0..1 path is enabled at runtime.
export function waterViewFromDepth(camera,uv,depth){
  const p=new THREE.Vector4(uv.x*2-1,uv.y*2-1,depth,1).applyMatrix4(camera.projectionMatrixInverse);
  return new THREE.Vector3(p.x,p.y,p.z).multiplyScalar(1/p.w);
}
export function waterRefractedRay(incident,normal,ior=1.333){
  const eta=1/ior,c=normal.dot(incident),k=1-eta*eta*(1-c*c);
  return k<0?new THREE.Vector3():incident.clone().multiplyScalar(eta).addScaledVector(normal,-eta*c-Math.sqrt(k));
}

// Capture after opaque, before ALL transparent surfaces. The marker draws zero
// vertices and never participates in shadows/reflections. The main scene and
// its shadow maps are not re-rendered. This is one color+depth MSAA resolve into
// a separate single-sample target, never a read from the active water target.
export class WaterRefractionCapture{
  constructor(uniforms){
    this.uniforms=uniforms;this.target=null;this.camera=null;this.source=null;this.disposed=false;this.blocked=false;this.captured=false;
    this.stats={enabled:false,captures:0,failures:0,width:0,height:0,attachmentBytes:0,reason:"not-prepared"};
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(new Float32Array(3),3));geometry.setDrawRange(0,0);
    const material=new THREE.MeshBasicMaterial({transparent:true,colorWrite:false,depthWrite:false,depthTest:false,toneMapped:false,fog:false});
    this.marker=new THREE.Mesh(geometry,material);this.marker.name="opaque-water-snapshot";this.marker.frustumCulled=false;this.marker.renderOrder=-1000000000;this.marker.visible=false;
    this.marker.userData.compileRenderHook=true;this.marker.userData.waterReflectionSurface=true;this.marker.onBeforeRender=(renderer,scene,camera)=>this.capture(renderer,camera);
  }
  _invalidate(reason){this.uniforms.uRiverRefractionValid.value=0;this.marker.visible=false;this.stats.enabled=false;this.stats.reason=reason;}
  _release(){
    this.uniforms.uRiverSceneColor.value=null;this.uniforms.uRiverSceneDepth.value=null;
    if(this.target){const depth=this.target.depthTexture;this.target.depthTexture=null;this.target.dispose();depth.dispose();this.target=null;}
    this.stats.attachmentBytes=0;
  }
  setSize(width,height){
    if(this.disposed)throw new Error("Water refraction disposed");
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new TypeError("Water refraction needs positive physical pixel dimensions");
    width=Math.floor(width);height=Math.floor(height);
    if(this.target&&this.target.width===width&&this.target.height===height)return false;
    this._invalidate("resized");this._release();this.blocked=false;this.checked=false;
    const depth=new THREE.DepthTexture(width,height,THREE.FloatType);depth.name="river-opaque-float-depth";depth.minFilter=depth.magFilter=THREE.NearestFilter;
    this.target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,colorSpace:THREE.LinearSRGBColorSpace,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,depthBuffer:true,stencilBuffer:false,depthTexture:depth,samples:0});
    this.target.texture.name="river-opaque-linear-color";
    this.uniforms.uRiverSceneColor.value=this.target.texture;this.uniforms.uRiverSceneDepth.value=depth;this.uniforms.uRiverSceneSize.value.set(width,height);
    Object.assign(this.stats,{width,height,attachmentBytes:width*height*12});return true;
  }
  prepare(renderer,camera,source,{nearWater=true}={}){
    if(this.disposed)return false;
    this._invalidate("disabled");this.captured=false;
    if(this.uniforms.uWaterRefraction.value<=0||!nearWater)return false;
    if(!supportsWaterRefraction(renderer,camera,source)){this._invalidate("unsupported-frame");return false;}
    if(this.source!==source)this.blocked=false;
    this.source=source;this.camera=camera;
    const resized=this.setSize(source.width,source.height);
    if(this.blocked&&!resized){this._invalidate("capture-failed");return false;}
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
    try{
      renderer.initRenderTarget(this.target);
      if(!renderer.properties.get(this.target).__webglFramebuffer)throw new Error("Missing refraction framebuffer");
    }catch(error){this.blocked=true;this.stats.failures++;this._invalidate("allocation-failed: "+error.message);return false;}
    finally{renderer.setRenderTarget(previous,face,level);}
    this.uniforms.uRiverSceneProjection.value.copy(camera.projectionMatrix);this.uniforms.uRiverSceneInverse.value.copy(camera.projectionMatrixInverse);
    this.marker.layers.mask=camera.layers.mask;this.marker.visible=true;this.stats.reason="awaiting-opaque";return true;
  }
  capture(renderer,camera){
    if(this.disposed||this.captured||camera!==this.camera||renderer.getRenderTarget()!==this.source)return false;
    const gl=renderer.getContext(),state=renderer.state;
    const read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),scissor=gl.isEnabled(gl.SCISSOR_TEST);
    const destination=renderer.properties.get(this.target).__webglFramebuffer;
    try{
      if(!draw||draw===destination)throw new Error("Unsafe refraction framebuffer source");
      state.bindFramebuffer(gl.READ_FRAMEBUFFER,draw);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,destination);state.setScissorTest(false);
      if(!this.checked){if(gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error("Incomplete refraction framebuffer");this.checked=true;}
      gl.blitFramebuffer(0,0,this.target.width,this.target.height,0,0,this.target.width,this.target.height,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
      this.captured=true;this.uniforms.uRiverRefractionValid.value=1;this.stats.enabled=true;this.stats.reason="opaque-color-depth";this.stats.captures++;return true;
    }catch(error){this.blocked=true;this.stats.failures++;this._invalidate("capture-failed: "+error.message);return false;}
    finally{state.bindFramebuffer(gl.READ_FRAMEBUFFER,read);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);state.setScissorTest(scissor);}
  }
  dispose(){if(this.disposed)return;this._invalidate("disposed");this._release();this.marker.removeFromParent();this.marker.geometry.dispose();this.marker.material.dispose();this.source=null;this.camera=null;this.disposed=true;}
}

export const WATER_REFRACTION_GLSL=/* glsl */`
uniform float uWaterRefraction,uRiverRefractionValid;
uniform sampler2D uRiverSceneColor,uRiverSceneDepth;
uniform vec2 uRiverSceneSize;
uniform mat4 uRiverSceneProjection,uRiverSceneInverse;
vec3 riverSceneView(vec2 uv,float depth){
  vec4 p=uRiverSceneInverse*vec4(uv*2.0-1.0,depth,1.0);
  return p.xyz/p.w;
}
// Four nearest-depth taps enclose the color texture's bilinear footprint.
// The nearest reversed depth rejects reeds/rocks above the local water plane:
// bilinear color must never drag their dry silhouette into a neighbouring ripple.
float riverNearestFootprintDepth(vec2 uv){
  vec2 p=(floor(uv*uRiverSceneSize-.5)+.5)/uRiverSceneSize,texel=1.0/uRiverSceneSize;
  return max(max(texture2D(uRiverSceneDepth,p).r,texture2D(uRiverSceneDepth,p+vec2(texel.x,0.0)).r),
             max(texture2D(uRiverSceneDepth,p+vec2(0.0,texel.y)).r,texture2D(uRiverSceneDepth,p+texel).r));
}
void riverSceneRefraction(vec3 surfaceView,vec3 surfaceNormal,vec3 hydraulicNormal,float maximumDepth,
                          out vec3 bedColor,out float path,out float valid){
  bedColor=vec3(0.0);path=0.0;valid=0.0;
  vec2 uv=gl_FragCoord.xy/uRiverSceneSize;
  float depth=texture2D(uRiverSceneDepth,uv).r;
  if(depth<=0.0)return; // Clear depth is sky, never a submerged bed.
  vec3 base=riverSceneView(uv,depth);
  float thickness=-dot(base-surfaceView,hydraulicNormal);
  if(base.z>=surfaceView.z-.001||thickness<=.001||thickness>maximumDepth)return;
  vec3 incident=normalize(surfaceView),ray=refract(incident,surfaceNormal,1.0/1.333);
  float under=-dot(ray,hydraulicNormal);
  if(under<=.15)return;
  float travel=thickness/under;
  vec4 projected=uRiverSceneProjection*vec4(surfaceView+ray*travel,1.0);
  if(projected.w<=0.0)return;
  vec2 candidate=projected.xy/projected.w*.5+.5;
  vec2 border=min(candidate,1.0-candidate)*uRiverSceneSize;
  float edge=smoothstep(1.5,5.0,min(border.x,border.y));
  if(edge<=0.0)return;
  float hitDepth=riverNearestFootprintDepth(candidate);
  if(hitDepth<=0.0)return;
  vec3 hit=riverSceneView(candidate,hitDepth);
  float wetDepth=-dot(hit-surfaceView,hydraulicNormal);
  // This hit is on a DIFFERENT camera ray from surfaceView. A submerged
  // rising bank may be closer in view Z than the original water fragment.
  // Signed distance to the water plane tests that candidate ray's own crossing;
  // comparing hit.z with surfaceView.z incorrectly rejects those shallow beds.
  // Dry foreground remains rejected by the nearest footprint's plane distance.
  if(wetDepth<=.001||wetDepth>maximumDepth)return;
  float mismatch=abs(dot(hit-(surfaceView+ray*travel),hydraulicNormal));
  float confidence=1.0-smoothstep(max(.035,thickness*.35),max(.10,thickness*1.1),mismatch);
  path=min(4.0,wetDepth/under);valid=edge*confidence*smoothstep(.001,.018,wetDepth);
  bedColor=texture2D(uRiverSceneColor,candidate).rgb;
}
`;
