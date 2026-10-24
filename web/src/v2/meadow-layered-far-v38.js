// Independent local far-grass candidate; never installed into the world.
// Four single-sample source hits per output texel retain distinct normals,
// pigment, coverage and depth. They are not four averaged normal maps.
import * as T from 'three';
export function validateLayeredCapture38(capture,index=0){
 const frame=capture.frames[index];
 if(!frame||frame.colorSamples!==0||frame.depthSamples!==0||frame.channels.length!==4||capture.resolution%2||typeof frame.zeroToOneDepth!=='boolean')throw Error('Layered grass requires even-sized single-sample color/depth capture');
 return frame;
}
export function analyzeLayeredCapture38(capture,index=0){
 const f=validateLayeredCapture38(capture,index),[color,normal,,valid]=f.channels,cases=[];
 for(const light of f.lights){let reference=0,predicted=0,error2=0,count=0,covered=0;
  // Sum independently shaded source samples, including partial output texels.
  // Dividing by four converts supersampled hits to final projected pixels.
  for(let i=0;i<color.length;i+=4){if(valid[i]<255)continue;covered++;const n=[0,1,2].map(k=>normal[i+k]/255*2-1),response=light.response[i]/255,visibility=light.visibility[i]/255;
   const value=Math.max(0,n.reduce((v,x,k)=>v+x*light.direction[k],0))*visibility;
   reference+=response/4;predicted+=value/4;error2+=(response-value)**2;count++;
  }
  cases.push({direction:light.direction,coveredSamples:covered,projectedPixels:covered/4,referenceEnergy:reference,predictedEnergy:predicted,relativeEnergyError:Math.abs(predicted-reference)/Math.max(1,reference),sampleRMSE:Math.sqrt(error2/Math.max(1,count))});
 }
 return{accepted:cases.length>0&&cases.every(c=>c.relativeEnergyError<.04&&c.sampleRMSE<.04),cases,scope:'Four independent sample responses, including silhouette coverage. This validates captured-view response only; no unseen-view or novel occluder equivalence claim.'};
}
export function createMeadowLayeredFar38(capture,index=0){
 const f=validateLayeredCapture38(capture,index),size=capture.resolution;
 const textures=f.channels.map(bytes=>{const t=new T.DataTexture(bytes,size,size,T.RGBAFormat);t.colorSpace=T.NoColorSpace;t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;});
 const cameraWorld=new T.Matrix4().fromArray(f.viewMatrix).invert();
 const uniforms={albedo:{value:textures[0]},normals:{value:textures[1]},depth:{value:textures[2]},coverage:{value:textures[3]},sourceSize:{value:size},captureInverseProjection:{value:new T.Matrix4().fromArray(f.projectionMatrix).invert()},captureCameraWorld:{value:cameraWorld},captureZeroToOne:{value:f.zeroToOneDepth?1:0},referenceLight:{value:new T.Vector3(.45,.8,.3).normalize()},directColor:{value:new T.Color(1,1,1)},ambientColor:{value:new T.Color(0,0,0)},mode:{value:2},liveShadow:{value:null},liveShadowMatrix:{value:new T.Matrix4()},shadowEnabled:{value:0},shadowBias:{value:0},shadowNormalBias:{value:0},shadowIntensity:{value:1}};
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
#include <common>
#include <packing>
varying vec2 vUv;
uniform sampler2D albedo,normals,depth,coverage,liveShadow;
uniform float sourceSize,captureZeroToOne,mode,shadowEnabled,shadowBias,shadowNormalBias,shadowIntensity;
uniform mat4 captureInverseProjection,captureCameraWorld,projectionMatrix,liveShadowMatrix;
uniform vec3 referenceLight,directColor,ambientColor;
float visibility(vec3 world,vec3 normal){
 if(shadowEnabled<.5)return 1.;
 vec4 s=liveShadowMatrix*vec4(world+normal*shadowNormalBias,1.);s.xyz/=s.w;
 if(any(lessThan(s.xy,vec2(0.)))||any(greaterThan(s.xy,vec2(1.)))||s.z>1.||s.z<0.)return 1.;
 float stored=texture2D(liveShadow,s.xy).r;
#ifdef USE_REVERSED_DEPTH_BUFFER
 float lit=step(stored,s.z-shadowBias);
#else
 float lit=step(s.z+shadowBias,stored);
#endif
 return mix(1.,lit,shadowIntensity);
}
void main(){
 // Integrate the actual projected pixel footprint, not a fixed 2x2 atlas cell.
 vec2 footprint=(abs(dFdx(vUv))+abs(dFdy(vUv)))*sourceSize;
 vec2 lo=vUv*sourceSize-footprint*.5,hi=vUv*sourceSize+footprint*.5;
 vec2 base=floor(lo);vec3 sum=vec3(0.);float covered=0.;
 if(any(greaterThan(footprint,vec2(7.)))){gl_FragColor=vec4(1.,0.,1.,1.);return;}

#ifdef USE_REVERSED_DEPTH_BUFFER
 float nearestDepth=0.;
#else
 float nearestDepth=1.;
#endif
 // Runtime bounds avoid expanding 64 copies of texture/depth/shadow code.
 // A footprint <=7 texels intersects at most 8 cells per dimension.
 ivec2 extent=clamp(ivec2(ceil(hi)-base),ivec2(0),ivec2(8));
 for(int y=0;y<extent.y;y++)for(int x=0;x<extent.x;x++){
  vec2 cell=base+vec2(float(x),float(y));
  vec2 overlap=max(vec2(0.),min(cell+1.,hi)-max(cell,lo));
  float weight=overlap.x*overlap.y/max(.000001,footprint.x*footprint.y);
  if(weight<=0.||any(lessThan(cell,vec2(0.)))||any(greaterThanEqual(cell,vec2(sourceSize))))continue;
  vec2 uv=(cell+.5)/sourceSize;
  if(texture2D(coverage,uv).r<.999)continue;
  vec4 c=texture2D(albedo,uv);vec3 n=texture2D(normals,uv).rgb*2.-1.;
  float d=unpackRGBAToDepth(texture2D(depth,uv));
  vec4 local=captureInverseProjection*vec4(uv*2.-1.,mix(d*2.-1.,d,captureZeroToOne),1.);local/=local.w;
  vec4 world=captureCameraWorld*local;vec4 clip=projectionMatrix*viewMatrix*world;
#ifdef USE_REVERSED_DEPTH_BUFFER
  nearestDepth=max(nearestDepth,clip.z/clip.w);
#else
  nearestDepth=min(nearestDepth,clip.z/clip.w*.5+.5);
#endif
  float response=max(0.,dot(n,referenceLight))*visibility(world.xyz,n);
  sum+=(mode>2.5?vec3(1.):mode<.5?c.rgb:(mode<1.5?vec3(response):c.rgb*(ambientColor+directColor*response)))*weight;covered+=weight;
 }
 if(covered<.0001)discard;
 gl_FragDepth=nearestDepth;
 gl_FragColor=vec4(sum/covered,covered);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const geometry=new T.PlaneGeometry(12,12),mesh=new T.Mesh(geometry,material);mesh.position.fromArray(capture.center);mesh.quaternion.setFromRotationMatrix(cameraWorld);mesh.frustumCulled=false;
 function updateLight(light){
  // BasicShadowMap exposes native unfiltered depth. Do not silently sample
  // a PCF comparison sampler as an ordinary texture or bake old visibility.
  const texture=light.shadow?.map?.depthTexture;
  if(!texture||texture.compareFunction!==null)throw Error('Layered local candidate needs a rendered BasicShadowMap depth texture');
  light.getWorldPosition(uniforms.referenceLight.value);const target=new T.Vector3();light.target.getWorldPosition(target);uniforms.referenceLight.value.sub(target).normalize();
  uniforms.liveShadow.value=texture;uniforms.liveShadowMatrix.value.copy(light.shadow.matrix);uniforms.shadowBias.value=light.shadow.bias;uniforms.shadowNormalBias.value=light.shadow.normalBias;uniforms.shadowIntensity.value=light.shadow.intensity;uniforms.shadowEnabled.value=1;
  uniforms.directColor.value.copy(light.color).multiplyScalar(light.intensity);
 }
 return{mesh,material,textures,updateLight,cost:{textureBytes:size*size*4*4,draws:1,triangles:2,maxTextureFetches:320,usualTextureFetchesAt62to78m:"45–80",footprintLimitTexels:7},limitations:['Only the captured direction is represented; disocclusions need other directions/layers.','Integrates the actual screen-pixel footprint; source supersampling is not assumed identical to hardware MSAA positions. Footprints over 7 texels display magenta instead of silently dropping samples.','One fragment uses nearest hit for depth test; depthWrite is disabled rather than asserting mixed depths are exact.','Live source shadow geometry is still needed for self-shadow validation; source roots are never deleted.'],dispose(){geometry.dispose();material.dispose();textures.forEach(t=>t.dispose());}};
}
