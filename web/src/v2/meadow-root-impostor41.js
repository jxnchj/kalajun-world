// Independent upper-bound experiment, never production. Captures each actual
// root at the requested wind phase; dynamic shared-pose transport is NOT solved.
import * as T from 'three';
import {perspectiveRootCapture42,perspectiveRootDepth42} from './meadow-perspective-capture42.js';
import {installMeadowHit42} from './meadow-impostor-hit42.js';
import {createMeadowPatchReference38} from './meadow-patch-reference-v38.js';
export function rootCaptureViews41(camera,root,{exact=false}={}){
 const center=new T.Vector3(root.x,root.y+.5*(root.sy??root.s),root.z),d=camera.position.clone().sub(center),yaw=((Math.atan2(d.z,d.x)/(Math.PI*2)*16)%16+16)%16,el=Math.round(Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI/22.5)*22.5;
 return {center,size:1.25*Math.max(root.s,root.sy??root.s),blend:exact?0:yaw-Math.floor(yaw),angles:exact?[yaw*Math.PI/8,yaw*Math.PI/8]:[Math.floor(yaw)*Math.PI/8,(Math.floor(yaw)+1)*Math.PI/8],elevation:exact?Math.atan2(d.y,Math.hypot(d.x,d.z)):T.MathUtils.clamp(el,-67.5,67.5)*Math.PI/180};
}

function rootGroundPlane41(data,root,center){
 const p=data.ground.positions,ix=data.ground.indices;
 for(let k=0;k<ix.length;k+=3){
  const a=new T.Vector3().fromArray(p,ix[k]*3),b=new T.Vector3().fromArray(p,ix[k+1]*3),c=new T.Vector3().fromArray(p,ix[k+2]*3);
  const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(det)<1e-12)continue;
  const u=((b.z-c.z)*(root.x-c.x)+(c.x-b.x)*(root.z-c.z))/det,v=((c.z-a.z)*(root.x-c.x)+(a.x-c.x)*(root.z-c.z))/det;
  if(u< -1e-6||v< -1e-6||u+v>1.000001)continue;
  const plane=new T.Plane().setFromCoplanarPoints(a,b,c);if(plane.normal.y<0)plane.negate();return [...plane.normal.toArray(),plane.distanceToPoint(center)];
 }
 throw Error('Root outside actual reference terrain');
}
export function captureRootImpostors41(renderer,data,camera,{time=0,resolution=128,exact=false,groundCapture=false,joint=false,hitDiagnostic=false,perspectiveCapture=false,depthAudit=false}={}){
 if(depthAudit&&(!hitDiagnostic||!perspectiveCapture))throw Error('Depth audit only for perspective hit diagnostic');
 if(perspectiveCapture&&(!joint||!exact||!groundCapture))throw Error('Perspective crop requires exact joint foreground capture');
 const started=performance.now(),layers=data.roots.length*2,normalBytes=new Uint8Array(resolution*resolution*layers*4),normalUpBytes=joint?null:new Uint8Array(normalBytes.length),colorDepth=depthAudit?new Float32Array(normalBytes.length):new Uint16Array(normalBytes.length),records=[],phase={value:time};
 const saved={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),shadow:renderer.shadowMap.enabled};
 const target=new T.WebGLRenderTarget(resolution,resolution,{samples:joint?0:4}),depthTarget=joint?new T.WebGLRenderTarget(resolution,resolution,{type:T.FloatType,samples:0}):target;let drawCount=0;const depthAuditStats={samples:0,maxLocalHalfError:0,maxProjectedHalfError:0,maxProjectedFloat32Error:0,maxDecodeReprojectError:0};
 try{
 renderer.shadowMap.enabled=false;renderer.setClearColor(0,0);
 for(let i=0;i<data.roots.length;i++){
  const root=data.roots[i],view=rootCaptureViews41(camera,root,{exact});view.ground=rootGroundPlane41(data,root,view.center);records.push(view);
  const lab=createMeadowPatchReference38({...data,roots:[root]},{lod:'middle',resolution}),hook=lab.mesh.material.onBeforeCompile;let shader;
  lab.scene.background=null;lab.ground.visible=groundCapture;lab.mesh.castShadow=false;
  lab.mesh.material.onBeforeCompile=(s,r)=>{hook(s,r);shader=s;s.vertexShader=s.vertexShader.replace('vec2 ecoOffset=vec2(0.);','vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());');s.uniforms.uWindTime=phase;s.fragmentShader=s.fragmentShader.replace('packDepthToRGBA(gl_FragCoord.z)','vec4(vec3(gl_FragCoord.z),1.)');};lab.mesh.material.customProgramCacheKey=()=> 'meadow-root-capture41';
  if(hitDiagnostic)installMeadowHit42(lab.mesh,{rootOffset:i,capture:true});
  try{for(let j=0;j<2;j++){
   const a=view.angles[j],e=view.elevation,dir=new T.Vector3(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)),captureDistance=joint&&groundCapture?camera.position.distanceTo(view.center):3*view.size,captureNear=joint&&groundCapture?.1:view.size,captureFar=captureDistance+2*view.size,legacyCam=new T.OrthographicCamera(-view.size,view.size,view.size,-view.size,captureNear,captureFar);legacyCam.position.copy(view.center).addScaledVector(dir,captureDistance);legacyCam.lookAt(view.center);legacyCam.updateMatrixWorld();
   const crop=perspectiveCapture?perspectiveRootCapture42(camera,view.center,view.size):null,cam=crop?.camera??legacyCam;view.projection42=crop?.projection??[0,0,0];if(crop)dir.setFromMatrixColumn(cam.matrixWorld,2);
   const right=new T.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(cam.matrixWorld,1);view['right'+j]=right;view['up'+j]=up;view['dir'+j]=dir;
   const render=pass=>{if(shader)shader.uniforms.referencePass.value=pass;else lab.setReferencePass('albedo');const active=pass===2?depthTarget:target;renderer.setRenderTarget(active);renderer.clear();renderer.render(lab.scene,cam);const bytes=pass===2&&joint?new Float32Array(resolution*resolution*4):new Uint8Array(resolution*resolution*4);renderer.readRenderTargetPixels(active,0,0,resolution,resolution,bytes);drawCount++;return bytes;};
   const color=render(0),normal=render(1),depth=render(2),offset=(i*2+j)*resolution*resolution*4;
   normalBytes.set(normal,offset);if(normalUpBytes)for(let k=0;k<normal.length;k+=4)if(normal[k+1]>=normal[k+3]*.5)normalUpBytes.set(normal.subarray(k,k+4),offset+k);
   for(let k=0;k<color.length;k+=4){
    const encoded=joint?(2.-(perspectiveCapture?perspectiveRootDepth42(depth[k],cam,view.projection42[2]):captureDistance-captureNear-depth[k]*(captureFar-captureNear))/view.size)/4.:depth[k]/255,half=T.DataUtils.toHalfFloat(encoded);
    for(let c=0;c<3;c++){const h=T.DataUtils.toHalfFloat(color[k+c]/255);colorDepth[offset+k+c]=depthAudit?T.DataUtils.fromHalfFloat(h):h;}
    colorDepth[offset+k+3]=depthAudit?encoded:half;
    if(depthAudit){colorDepth[offset+k+1]=T.DataUtils.fromHalfFloat(half);if(normal[k+3]===255){const rawLocal=(2.-4.*encoded)*view.size,halfLocal=(2.-4.*T.DataUtils.fromHalfFloat(half))*view.size,floatLocal=(2.-4.*Math.fround(encoded))*view.size,e=cam.projectionMatrix.elements,D=view.projection42[2],project=z=>((e[10]*(z-D)+e[14])/(D-z))*.5+.5;depthAuditStats.samples++;depthAuditStats.maxLocalHalfError=Math.max(depthAuditStats.maxLocalHalfError,Math.abs(halfLocal-rawLocal));depthAuditStats.maxProjectedHalfError=Math.max(depthAuditStats.maxProjectedHalfError,Math.abs(project(halfLocal)-depth[k]));depthAuditStats.maxProjectedFloat32Error=Math.max(depthAuditStats.maxProjectedFloat32Error,Math.abs(project(floatLocal)-depth[k]));depthAuditStats.maxDecodeReprojectError=Math.max(depthAuditStats.maxDecodeReprojectError,Math.abs(project(rawLocal)-depth[k]));}}
   }
  }}finally{lab.dispose();}
 }
 }finally{renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.clear,saved.alpha);renderer.shadowMap.enabled=saved.shadow;target.dispose();if(depthTarget!==target)depthTarget.dispose();}
 const tex=(bytes,type)=>{const t=new T.DataArrayTexture(bytes,resolution,resolution,layers);t.type=type;t.format=T.RGBAFormat;t.colorSpace=T.NoColorSpace;t.minFilter=joint?T.NearestMipmapNearestFilter:T.LinearMipmapLinearFilter;t.magFilter=joint?T.NearestFilter:T.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
 const normals=tex(normalBytes,T.UnsignedByteType),normalsUp=normalUpBytes?tex(normalUpBytes,T.UnsignedByteType):normals,colors=tex(colorDepth,depthAudit?T.FloatType:T.HalfFloatType),g=new T.InstancedBufferGeometry(),plane=new T.PlaneGeometry(2,2);g.index=plane.index;g.attributes=plane.attributes;
 const attr=(name,size,values)=>g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(values),size));
 attr('rootProjection42',3,records.flatMap(r=>r.projection42));
 attr('rootGround',4,records.flatMap(r=>r.ground));attr('rootCenter',3,records.flatMap(r=>r.center.toArray()));attr('rootShape',3,records.flatMap((r,i)=>[r.size,r.blend,i*2]));
 for(const key of['right0','up0','dir0','right1','up1','dir1'])attr(key,3,records.flatMap(r=>r[key].toArray()));g.instanceCount=records.length;
 const uniforms={normals:{value:normals},normalsUp:{value:normalsUp},colors:{value:colors},cameraRight:{value:new T.Vector3()},cameraUp:{value:new T.Vector3()},lightDirection:{value:new T.Vector3(.45,.8,.3).normalize()},mode:{value:0},groundClamp:{value:groundCapture?1:0},sampleFour:{value:0},sampleIndex:{value:-1},sampleOffsets:{value:[new T.Vector2(-.25,-.25),new T.Vector2(.25,-.25),new T.Vector2(-.25,.25),new T.Vector2(.25,.25)]},depthAudit42:{value:depthAudit?1:0},depthFloat42:{value:1},hitRootFilter42:{value:0},manualGround:{value:0}};
 const material=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms,side:T.DoubleSide,alphaToCoverage:true,depthWrite:true,toneMapped:false,vertexShader:`
 in vec3 rootProjection42;out vec3 vProjection42;in vec4 rootGround;out vec4 vGround;in vec3 rootCenter,rootShape,right0,up0,dir0,right1,up1,dir1;
 uniform vec3 cameraRight,cameraUp;
 out vec3 vCenter,vOffset,vShape,vRight0,vUp0,vDir0,vRight1,vUp1,vDir1;
 void main(){vProjection42=rootProjection42;vGround=rootGround;vCenter=rootCenter;vShape=rootShape;vOffset=(cameraRight*position.x+cameraUp*position.y)*rootShape.x;vRight0=right0;vUp0=up0;vDir0=dir0;vRight1=right1;vUp1=up1;vDir1=dir1;gl_Position=projectionMatrix*viewMatrix*vec4(vCenter+vOffset,1.);}
 `,fragmentShader:`
 precision highp sampler2DArray;
#include <packing>
uniform float hitRootFilter42,depthAudit42,depthFloat42;
 uniform sampler2DArray normals,normalsUp,colors;uniform vec3 lightDirection;uniform float mode,groundClamp,sampleFour,manualGround,sampleIndex;uniform vec2 sampleOffsets[4];in vec4 vGround;uniform mat4 projectionMatrix;out vec4 fragColor;float hitResidual42=0.;
 in vec3 vProjection42;in vec3 vCenter,vOffset,vShape,vRight0,vUp0,vDir0,vRight1,vUp1,vDir1;
 vec2 rootUV42(vec3 point,vec3 right,vec3 up,vec3 forward){vec2 xy=vec2(dot(point,right),dot(point,up));if(vProjection42.z>0.)xy=(xy+vProjection42.xy)*vProjection42.z/(vProjection42.z-dot(point,forward))-vProjection42.xy;return xy/(2.*vShape.x)+.5;}
 vec4 auditDepth42(vec4 v,float layer){if(depthAudit42>.5){v.a=mix(v.g,v.a,depthFloat42);v.g=(floor(layer*.5)+1.)/255.;}return v;}
 vec4 sourceSample(sampler2DArray tex,vec3 uv){return sampleFour>.5?textureLod(tex,uv,0.):texture(tex,uv);}
void sampleView(vec3 offset,float layer,vec3 right,vec3 up,vec3 forward,out vec4 c,out vec3 n,out vec3 upper,out vec3 point){
  vec2 uv=rootUV42(offset,right,up,forward);
  vec4 nr=sourceSample(normals,vec3(uv,layer)),cd=auditDepth42(sourceSample(colors,vec3(uv,layer)),layer);
  float depth=(2.-4.*cd.a/max(.00001,nr.a))*vShape.x;
  vec3 ray=normalize(cameraPosition-vCenter-offset);
  point=offset+ray*((depth-dot(offset,forward))/max(.01,dot(ray,forward)));
  uv=rootUV42(point,right,up,forward);
  nr=sourceSample(normals,vec3(uv,layer));cd=auditDepth42(sourceSample(colors,vec3(uv,layer)),layer);
  float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  c=vec4(cd.rgb,nr.a)*inside;n=(nr.rgb-.5*nr.a)*2.*inside;upper=vec3(0.);if(mode>1.5&&mode<2.5&&sampleFour<.5){vec4 nu=texture(normalsUp,vec3(uv,layer));upper=(nu.rgb-.5*nu.a)*2.*inside;}
  depth=(2.-4.*cd.a/max(.00001,nr.a))*vShape.x;
  point=offset+ray*((depth-dot(offset,forward))/max(.01,dot(ray,forward)));
  vec2 finalUV42=rootUV42(point,right,up,forward);
  hitResidual42=length((finalUV42-uv)*vec2(textureSize(colors,0).xy));
  if(manualGround>.5&&dot(vGround.xyz,point)+vGround.w<0.){c=vec4(0.);n=vec3(0.);upper=vec3(0.);}
 }
 void main(){
 if(hitRootFilter42>.5 && abs(vShape.z*.5+1.-hitRootFilter42)>.1)discard;
 if(sampleFour>.5){
  vec3 dx=dFdx(vOffset),dy=dFdy(vOffset);vec4 sum=vec4(0.);
  for(int j=0;j<4;j++){
   if(sampleIndex>=0.&&abs(float(j)-sampleIndex)>.1)continue;
   vec3 offset=vOffset+dx*sampleOffsets[j].x+dy*sampleOffsets[j].y;
   vec4 a,b;vec3 na,nb,ua,ub,pa,pb;sampleView(offset,vShape.z,vRight0,vUp0,vDir0,a,na,ua,pa);
   if(vShape.y>.00001)sampleView(offset,vShape.z+1.,vRight1,vUp1,vDir1,b,nb,ub,pb);else{b=a;nb=na;}
   float w=vShape.y,coverage=mix(a.a,b.a,w);vec3 color=mix(a.rgb,b.rgb,w);
   if(mode>.5&&mode<1.5)color=mix(na,nb,w)*.5+.5*coverage;
   if(mode>1.5&&mode<2.5)color=vec3(mix(max(0.,dot(na,lightDirection)),max(0.,dot(nb,lightDirection)),w));
   if(mode>2.5&&mode<3.5)color=vec3(coverage);
   if(mode>3.5&&mode<4.5)color=mix(a.rgb,b.rgb,w);
   if(mode>4.5&&mode<5.5)color=vec3(mix(a.b,b.b,w));
   if(mode>5.5)color=vec3(min(hitResidual42/16.,1.)*coverage);
   if(sampleIndex>=0.){if(coverage<.5)discard;vec4 clip=projectionMatrix*viewMatrix*vec4(vCenter+pa,1.);gl_FragDepth=clip.z/clip.w*.5+.5;fragColor=mode>6.5?packDepthToRGBA(gl_FragDepth):vec4(color/coverage,1.);return;}
   sum+=vec4(color,coverage);
  }
  if(sum.a<.0001)discard;fragColor=vec4(sum.rgb/sum.a,sum.a*.25);gl_FragDepth=gl_FragCoord.z;return;
 }
 vec4 a,b;vec3 na,nb,ua,ub,pa,pb;sampleView(vOffset,vShape.z,vRight0,vUp0,vDir0,a,na,ua,pa);sampleView(vOffset,vShape.z+1.,vRight1,vUp1,vDir1,b,nb,ub,pb);
 float w=vShape.y,coverage=mix(a.a,b.a,w);if(coverage<.0001)discard;
 vec3 color=mix(a.rgb,b.rgb,w)/coverage;
 if(mode>.5&&mode<1.5)color=mix(na,nb,w)/coverage*.5+.5;
 if(mode>1.5&&mode<2.5)color=vec3(mix(max(0.,dot(ua,lightDirection))+max(0.,dot(na-ua,lightDirection)),max(0.,dot(ub,lightDirection))+max(0.,dot(nb-ub,lightDirection)),w)/coverage);
 if(mode>2.5)color=vec3(1.);
 vec3 localPoint=a.a*(1.-w)>=b.a*w?pa:pb;
 if(groundClamp>.5){vec3 ray=normalize(cameraPosition-vCenter-vOffset);float denom=dot(vGround.xyz,ray),height=dot(vGround.xyz,localPoint)+vGround.w;if(height<.0001&&denom>.001)localPoint+=ray*((.0001-height)/denom);}
 vec3 point=localPoint+vCenter;vec4 clip=projectionMatrix*viewMatrix*vec4(point,1.);gl_FragDepth=clip.z/clip.w*.5+.5;
 fragColor=vec4(color,coverage);
 }
 `});
 const mesh=new T.Mesh(g,material);mesh.frustumCulled=false;mesh.castShadow=false;
 return {mesh,material,stats:{depthAudit,depthAuditStats,perspectiveCapture,roots:records.length,triangles:records.length*2,captureDraws:drawCount,exactView:exact,groundCapture,joint,depthCapture:joint?'float32-to-float16':'unorm8-to-float16',captureMs:performance.now()-started,resolution,decodedBytes:normalBytes.byteLength+(normalUpBytes?.byteLength??0)+colorDepth.byteLength,textureFetchesPerFragment:{albedoCoverage:8,response:10},scope:'Actual per-root phase-matched upper-bound capture; no production wind-pose sharing or transport claim.'},updateCamera(c){uniforms.cameraRight.value.setFromMatrixColumn(c.matrixWorld,0);uniforms.cameraUp.value.setFromMatrixColumn(c.matrixWorld,1);},setChannel(name){uniforms.mode.value={albedo:0,normal:1,response:2,coverage:3,hit:4,direct:5,residual:6,depth:7}[name];},dispose(){g.dispose();material.dispose();normals.dispose();if(normalsUp!==normals)normalsUp.dispose();colors.dispose();}};
}

// Measure this browser/GPU's actual 4x MSAA positions; do not assume a vendor's
// rotated grid or replace it with a regular 2x2 pattern.
export function calibrateMeadowMSAA41(renderer){
 const saved={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha()},target=new T.WebGLRenderTarget(1,1,{samples:4}),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,2),quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0xffffff,toneMapped:false})),bytes=new Uint8Array(4);scene.add(quad);camera.position.z=1;
 try{renderer.setRenderTarget(target);renderer.setClearColor(0,0);
  const count=(x,y)=>{renderer.setRenderTarget(target);quad.scale.set(x,y,1);quad.position.set(x-1,y-1,0);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,bytes);return Math.round(bytes[0]/255*4);};
  const axis=vertical=>{const values=[];let prior=0;for(let i=0;i<16;i++){const threshold=(i+.5)/16,n=vertical?count(1,threshold):count(threshold,1);for(let k=prior;k<n;k++)values.push(i/16);prior=n;}return values;},xs=axis(false),ys=axis(true),points=[];
  if(xs.length!==4||ys.length!==4)throw Error('MSAA sample calibration did not resolve four locations '+JSON.stringify({xs,ys,full:count(1,1),half:count(.5,1)}));
  for(const x of new Set(xs))for(const y of new Set(ys)){const n=count(x+.02,y+.02)-count(x-.02,y+.02)-count(x+.02,y-.02)+count(x-.02,y-.02);for(let k=0;k<n;k++)points.push([x-.5,y-.5]);}
  if(points.length!==4)throw Error('MSAA sample pair calibration mismatch');return points;
 }finally{renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.clear,saved.alpha);target.dispose();quad.geometry.dispose();quad.material.dispose();}
}
