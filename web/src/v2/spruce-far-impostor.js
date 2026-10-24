import {installFarRectGate39} from './spruce-far-rect-gate39.js';
import * as THREE from "three";
import bundledManifest from "../../public/assets/v2/spruce/far-v14/impostor-manifest.json" with {type:"json"};
import albedoTransport38 from "../../public/assets/v2/spruce/far-v14/albedo-lossless-v38.json" with {type:"json"};
import {decodeGzipBytes} from "./world-data.js";
import {FAR_NORMAL_TRANSPORT,FAR_ALBEDO_TRANSPORT,farAlbedoTransport38,restoreFarAlbedoRGBA,verifyFarAlbedoPayload38,farTransportFile,restoreFarNormalRGBA,validateFarTransport} from "./spruce-far-transport.js";
const DEFAULT_URL="./assets/v2/spruce/far-v14/impostor-manifest.json";
export const FAR_SPRUCE_FORMS=Object.freeze(["column","edge","old","pencil","young"]);
const installed=new WeakSet();
const clock=()=>globalThis.performance?.now?.()??Date.now();
function abort(signal){if(signal?.aborted)throw signal.reason??new DOMException("Far spruce loading aborted","AbortError");}
export function validateFarSpruceManifest(m){
  if(m?.version!==1||!m.encoding?.includes("premultiplied")||m.width!==128||m.height!==384||m.layers!==120||m.yawCount!==8||JSON.stringify(m.forms)!==JSON.stringify(FAR_SPRUCE_FORMS)||JSON.stringify(m.elevations)!=="[0,22.5,45]")throw new Error("Unsupported far spruce capture contract");
  if(m.frames?.length!==120||m.formRects?.length!==5||m.files?.length!==2)throw new Error("Incomplete far spruce capture");
  for(let i=0;i<120;i++){const f=m.frames[i];if(f.layer!==i||f.formIndex!==Math.floor(i/24)||f.yaw!==(i%8)*45||f.elevation!==m.elevations[Math.floor(i/8)%3])throw new Error("Far spruce frame order mismatch");
    const r=f.rect;if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[2]<=r[0]||r[3]<=r[1])throw new Error("Invalid far spruce projected rectangle");
    if(!f.rootUv||Math.abs(f.rootUv[0]+r[0]/(r[2]-r[0]))>1e-6||Math.abs(f.rootUv[1]+r[1]/(r[3]-r[1]))>1e-6)throw new Error("Far spruce root projection mismatch");
    const u=m.formRects[f.formIndex];if(!u?.every(Number.isFinite)||r[0]<u[0]-1e-6||r[1]<u[1]-1e-6||r[2]>u[2]+1e-6||r[3]>u[3]+1e-6)throw new Error("Far spruce union rectangle excludes a frame");
  }
  for(const kind of ["albedo","normal"]){const f=m.files.find(f=>f.kind===kind);if(!f||typeof f.url!=="string"||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.decodedBytes!==m.width*m.height*m.layers*4)throw new Error("Missing far spruce texture payload");validateFarTransport(f,m.width*m.height*m.layers);}
  return m;
}
function resourceTimingFor(performanceAPI,url,requestStart){
  // Only this request's entry: never report an older cached load as this load.
  const entries=performanceAPI?.getEntriesByName?.(url,"resource")??[];
  const entry=entries.filter(e=>e.entryType==="resource"&&e.startTime>=requestStart-.001).sort((a,b)=>b.startTime-a.startTime)[0];
  if(!entry)return null;
  const size=key=>Number.isFinite(entry[key])&&entry[key]>=0?entry[key]:null;
  return {startTime:entry.startTime,duration:entry.duration,transferSize:size("transferSize"),encodedBodySize:size("encodedBodySize"),decodedBodySize:size("decodedBodySize"),deliveryType:entry.deliveryType??null};
}
export async function loadFarSpruceAssets({url=DEFAULT_URL,signal,onProgress,fetch:fetcher=globalThis.fetch,performance:performanceAPI=globalThis.performance,manifest=new URLSearchParams(globalThis.location?.search??"").get("farManifest")??"bundled",farLossless38=new URLSearchParams(globalThis.location?.search??"").get("farLossless38")!=="0",transport=new URLSearchParams(globalThis.location?.search??"").get("farTransport")??"v27"}={}){
  const start=clock(),textures=[];abort(signal);
  // The canonical capture is part of this exact build, like the GLB transport
  // manifest. Its payload requests can start immediately, before busy terrain
  // preparation delays the asynchronous manifest reply. Custom captures still
  // fetch their own authoritative manifest; the network path remains an A/B.
  const useBundled=url===DEFAULT_URL&&manifest!=="network";
  let metadata;
  if(useBundled)metadata=validateFarSpruceManifest(structuredClone(bundledManifest));
  else{const response=await fetcher(url,{signal});if(!response.ok)throw new Error(`Far spruce manifest ${response.status}: ${url}`);metadata=validateFarSpruceManifest(await response.json());}
  abort(signal);const manifestMs=clock()-start;
  const files=metadata.files.map(f=>farLossless38&&f.kind==="albedo"?farAlbedoTransport38(metadata,albedoTransport38):farTransportFile(f,transport));
  const base=new URL(url,globalThis.location?.href??"http://localhost/");const stats={representation:"same-source 5×8×3 upright normal-lit impostor",manifestMs,manifestMode:useBundled?"bundled":"network",transportMode:transport,farLossless38:Boolean(farLossless38),albedoRestoreMs:0,payloadVerificationMs:0,rgbaRestoreMs:0,fetchMs:0,decodeMs:0,textureSetupMs:0,encodedBytes:files.reduce((n,f)=>n+f.bytes,0),responseBodyBytes:0,decodedBytes:0,gpuTextureBytes:0,applicationGzipDecodes:0,byteScope:"two texture payloads; manifest excluded",resourceTiming:{entries:[],complete:false,transferSize:null,encodedBodySize:null,decodedBodySize:null}};
  try{
    const records=await Promise.all(files.map(async f=>{
      abort(signal);const requestURL=new URL(f.url+(f.gzipSHA256?"?v="+f.gzipSHA256:""),base).href,t0=clock(),r=await fetcher(requestURL,{signal});if(!r.ok)throw new Error(`Far spruce ${f.kind} ${r.status}`);const raw=new Uint8Array(await r.arrayBuffer());abort(signal);const t1=clock(),gzip=raw[0]===0x1f&&raw[1]===0x8b;
      // Fetch already removes HTTP Content-Encoding. Count explicit application
      // gzip work only when compressed bytes actually reach JavaScript.
      if(f.encoding===FAR_ALBEDO_TRANSPORT){const v0=clock();await verifyFarAlbedoPayload38(raw,f,gzip);stats.payloadVerificationMs+=clock()-v0;abort(signal);}
      const data=gzip?await decodeGzipBytes(raw):raw;abort(signal);const t2=clock(),timing=resourceTimingFor(performanceAPI,r.url||requestURL,t0);
      if(data.length!==f.decodedBytes)throw new Error(`Far spruce ${f.kind} byte count mismatch`);
      onProgress?.({phase:"far-spruce-texture",kind:f.kind,responseBodyBytes:raw.byteLength,encodedBytes:f.bytes});return {f,data,bytes:raw.byteLength,fetchMs:t1-t0,decodeMs:gzip?t2-t1:0,gzip,timing};
    }));abort(signal);
    const albedoRecord=records.find(r=>r.f.kind==="albedo");
    if(albedoRecord.f.encoding===FAR_ALBEDO_TRANSPORT){const t=clock();albedoRecord.data=restoreFarAlbedoRGBA(albedoRecord.data,metadata.width*metadata.height*metadata.layers);stats.albedoRestoreMs=clock()-t;stats.rgbaRestoreMs+=stats.albedoRestoreMs;albedoRecord.decodeMs+=stats.albedoRestoreMs;abort(signal);}
    const normalRecord=records.find(r=>r.f.kind==="normal");
    if(normalRecord.f.encoding===FAR_NORMAL_TRANSPORT){
      const t=clock();normalRecord.data=restoreFarNormalRGBA(normalRecord.data,records.find(r=>r.f.kind==="albedo").data,metadata.width*metadata.height*metadata.layers);
      const restoreMs=clock()-t;stats.rgbaRestoreMs+=restoreMs;normalRecord.decodeMs+=restoreMs;abort(signal);
    }
    const t0=clock(),out={metadata,stats};
    for(const {f,data,bytes,fetchMs,decodeMs,gzip,timing}of records){
      const t=new THREE.DataArrayTexture(data,metadata.width,metadata.height,metadata.layers);textures.push(t);t.name="far-spruce-"+f.kind;t.format=THREE.RGBAFormat;t.type=THREE.UnsignedByteType;t.colorSpace=f.kind==="albedo"?THREE.SRGBColorSpace:THREE.NoColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.flipY=false;t.unpackAlignment=1;t.needsUpdate=true;out[f.kind]=t;
      stats.responseBodyBytes+=bytes;stats.decodedBytes+=data.byteLength;stats.fetchMs=Math.max(stats.fetchMs,fetchMs);stats.decodeMs+=decodeMs;stats.applicationGzipDecodes+=Number(gzip);
      if(timing)stats.resourceTiming.entries.push({kind:f.kind,...timing});
      let w=metadata.width,h=metadata.height;while(true){stats.gpuTextureBytes+=w*h*4*metadata.layers;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}
    }
    const rt=stats.resourceTiming;
    rt.complete=rt.entries.length===metadata.files.length&&rt.entries.every(e=>e.transferSize!==null&&e.encodedBodySize>0&&e.decodedBodySize>0);
    // A zero transferSize is valid for a browser cache hit. Missing/restricted
    // byte measurements remain null, never an invented zero or manifest total.
    if(rt.complete)for(const key of ["transferSize","encodedBodySize","decodedBodySize"])rt[key]=rt.entries.reduce((n,e)=>n+e[key],0);
    stats.textureSetupMs=clock()-t0;stats.loadMs=clock()-start;let disposed=false;out.dispose=()=>{if(disposed)return;disposed=true;for(const t of textures){t.dispose();t.image.data=null;}};return out;
  }catch(error){for(const t of textures)t.dispose();throw error;}
}
export function farSpruceBounds(metadata){
  validateFarSpruceManifest(metadata);let r=0,lo=Infinity,hi=-Infinity;
  for(const q of metadata.formRects){r=Math.max(r,Math.abs(q[0]),Math.abs(q[2]));lo=Math.min(lo,q[1]);hi=Math.max(hi,q[3]);}
  // Expand a little for Float32 vertex arithmetic; the batch adds the existing wind bound.
  return new THREE.Box3(new THREE.Vector3(-r-.002,lo-.002,-r-.002),new THREE.Vector3(r+.002,hi+.002,r+.002));
}
export function createFarSpruceImpostorGeometry(assets){
  const p=[],uv=[],ix=[];for(let j=0;j<=4;j++)for(let k=0;k<2;k++){p.push(k-.5,j/4,0);uv.push(k,j/4);}
  for(let j=0;j<4;j++){const a=j*2;ix.push(a,a+1,a+2,a+1,a+3,a+2);}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setAttribute("normal",new THREE.Float32BufferAttribute(Array.from({length:10},()=>[0,0,1]).flat(),3));g.setIndex(ix);
  g.boundingBox=farSpruceBounds(assets.metadata);g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());g.userData.farImpostor=true;g.userData.farCapture=assets.metadata.sourceSha256;return g;
}
export function setFarSpruceImpostorAttributes(g,records){
  const values=Float32Array.from(records,r=>{if(!Number.isInteger(r.variant)||r.variant<0||r.variant>=5)throw new RangeError("Unknown far spruce form");return r.variant;});g.setAttribute("aFarForm",new THREE.InstancedBufferAttribute(values,1));return g;
}
// Pure selection oracle: x/z are inverse-root camera coordinates; y is the
// inverse-root camera height MINUS the same 9m crown centre used by the shader.
export function selectFarSpruceFrames(form,x,y,z){
  if(!Number.isInteger(form)||form<0||form>=5||![x,y,z].every(Number.isFinite))throw new TypeError("Invalid far spruce viewpoint");
  const radius=Math.hypot(x,z),yaw=radius>1e-6?((Math.atan2(x,z)/(Math.PI*2)*8)%8+8)%8:0;
  const elevation=THREE.MathUtils.clamp(Math.atan2(y,radius)*180/Math.PI/22.5,0,2),y0=Math.floor(yaw),e0=Math.min(1,Math.floor(elevation)),fy=yaw-y0,fe=elevation-e0;
  return {layers:[form*24+e0*8+y0,form*24+e0*8+(y0+1)%8,form*24+(e0+1)*8+y0,form*24+(e0+1)*8+(y0+1)%8],weights:[(1-fy)*(1-fe),fy*(1-fe),(1-fy)*fe,fy*fe],right:radius>1e-6?[z/radius,0,-x/radius]:[1,0,0]};
}
const VERTEX=`
attribute float aFarForm;
uniform vec4 uFarFormRects[5];
varying vec2 vFarPlane;
varying vec4 vFarSelection;
varying float vFarForm;
varying mat3 vFarNormalMatrix;
varying vec2 vFarBendSlope;
`;
const FRAGMENT=`
precision highp sampler2DArray;
uniform highp sampler2DArray uFarAlbedo;
uniform highp sampler2DArray uFarNormal;
uniform vec4 uFarFrameRects[120];
uniform float uFarMultisample;
uniform float uFarZeroWeightLayers;
uniform float uFarDeferredNormal;
vec2 farPlaneDx,farPlaneDy;
varying vec2 vFarPlane;
varying vec4 vFarSelection;
varying float vFarForm;
varying mat3 vFarNormalMatrix;
varying vec2 vFarBendSlope;
void farSample(float layer,out vec4 c,out vec3 n){
 vec4 rect=uFarFrameRects[int(layer+.1)];vec2 st=(vFarPlane-rect.xy)/(rect.zw-rect.xy);
 // Always sample before the domain mask, so derivatives are defined across borders.
 if(uFarZeroWeightLayers>.5||uFarDeferredNormal>.5){
  vec2 dx=farPlaneDx/(rect.zw-rect.xy),dy=farPlaneDy/(rect.zw-rect.xy);
  c=textureGrad(uFarAlbedo,vec3(st,layer),dx,dy);n=vec3(0.);
  if(uFarDeferredNormal<.5)n=textureGrad(uFarNormal,vec3(st,layer),dx,dy).xyz*2.-1.;
 }else{
  c=texture(uFarAlbedo,vec3(st,layer));n=texture(uFarNormal,vec3(st,layer)).xyz*2.-1.;
 }
 float inside=step(0.,st.x)*step(st.x,1.)*step(0.,st.y)*step(st.y,1.);c*=inside;n*=inside;
}
vec3 farSurvivingNormal(float layer){
 vec4 rect=uFarFrameRects[int(layer+.1)];vec2 st=(vFarPlane-rect.xy)/(rect.zw-rect.xy);
 vec2 dx=farPlaneDx/(rect.zw-rect.xy),dy=farPlaneDy/(rect.zw-rect.xy);
 vec3 n=textureGrad(uFarNormal,vec3(st,layer),dx,dy).xyz*2.-1.;
 float inside=step(0.,st.x)*step(st.x,1.)*step(0.,st.y)*step(st.y,1.);
 return n*inside;
}
`;
export function installFarSpruceImpostor(material,assets){
  if(installed.has(material))return material;validateFarSpruceManifest(assets.metadata);installed.add(material);
  material.vertexColors=false;material.alphaTest=.003;material.alphaToCoverage=true;material.side=THREE.DoubleSide;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),before=material.onBeforeRender;
  const uniforms={uFarAlbedo:{value:assets.albedo},uFarNormal:{value:assets.normal},uFarFrameRects:{value:assets.metadata.frames.map(f=>new THREE.Vector4(...f.rect))},uFarFormRects:{value:assets.metadata.formRects.map(r=>new THREE.Vector4(...r))},uFarMultisample:{value:1},uFarZeroWeightLayers:{value:new URLSearchParams(globalThis.location?.search??"").get("farZeroWeightLayers")==="1"?1:0},uFarDeferredNormal:{value:new URLSearchParams(globalThis.location?.search??"").get("farDeferredNormal")==="1"?1:0}};
  const rectGate=new URLSearchParams(globalThis.location?.search??"").get("farRectGate39")==="1"?{value:2}:null;
  if(rectGate)uniforms.uFarRectGate39=rectGate;
  material.userData.farImpostorUniforms=uniforms;
  material.onBeforeRender=function(renderer,...rest){before?.call(this,renderer,...rest);uniforms.uFarMultisample.value=(renderer.getRenderTarget()?.samples??0)>1?1:0;};
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);shader.vertexShader=VERTEX+shader.vertexShader;
    if(!shader.vertexShader.includes("vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());"))throw new Error("Far spruce impostor requires attachEcologyWind before install");
    shader.vertexShader=shader.vertexShader.replace("vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());",`
vec4 farRect=uFarFormRects[int(aFarForm+.1)];
vec2 farPlane=mix(farRect.xy,farRect.zw,uv);
vec3 farWorldX=(modelMatrix*vec4(instanceMatrix[0].xyz,0.)).xyz;
vec3 farWorldY=(modelMatrix*vec4(instanceMatrix[1].xyz,0.)).xyz;
vec3 farWorldZ=(modelMatrix*vec4(instanceMatrix[2].xyz,0.)).xyz;
vec3 farDelta=cameraPosition-ecoRoot();
vec3 farLocalView=vec3(dot(farDelta,farWorldX)/dot(farWorldX,farWorldX),dot(farDelta,farWorldY)/dot(farWorldY,farWorldY)-9.,dot(farDelta,farWorldZ)/dot(farWorldZ,farWorldZ));
float farRadius=length(farLocalView.xz);
vec2 farDirection=farRadius>.000001?farLocalView.xz/farRadius:vec2(0.,1.);
vec3 farRight=vec3(farDirection.y,0.,-farDirection.x);
float farYaw=mod(atan(farDirection.x,farDirection.y)*1.273239544735163+8.,8.);
float farElevation=clamp(atan(farLocalView.y,max(farRadius,.000001))*2.546479089470326,0.,2.);
float farY0=floor(farYaw),farE0=min(1.,floor(farElevation));
vFarSelection=vec4(farY0,farE0,farYaw-farY0,farElevation-farE0);vFarForm=aFarForm;vFarPlane=farPlane;
mat3 farIM=mat3(instanceMatrix);farIM[0]/=dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz);farIM[1]/=dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz);farIM[2]/=dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz);vFarNormalMatrix=normalMatrix*farIM;
ecoWeights.x=clamp(farPlane.y/18.,0.,1.);
vec2 ecoOffset=ecoBend(farPlane.y,ecoWeights,ecoRoot());
vFarBendSlope=ecoOffset*2./max(.15,farPlane.y);
`);
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\ntransformed=farRight*farPlane.x+vec3(0.,farPlane.y,0.);").replace("ecoOffset*2./max(.15,position.y)","ecoOffset*2./max(.15,farPlane.y)");
    shader.fragmentShader=FRAGMENT+shader.fragmentShader;
    // Before clipping, ecological LOD discards or view-dependent branches.
    // Layer rectangles are constant per instance, so st derivatives equal the
    // plane derivatives divided by that layer's own rectangle extent.
    const main=/void\s+main\s*\(\s*\)\s*\{/;
    if(!main.test(shader.fragmentShader))throw new Error("Missing far spruce fragment main");
    shader.fragmentShader=shader.fragmentShader.replace(main,"$&\nfarPlaneDx=dFdx(vFarPlane);farPlaneDy=dFdy(vFarPlane);\n");
    shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`
float farBase=vFarForm*24.+vFarSelection.y*8.;
vec4 farC0,farC1,farC2,farC3;vec3 farN0,farN1,farN2,farN3;
float farNext=mod(vFarSelection.x+1.,8.);
vec4 farColour;vec3 farNormal;
// Only clamped exact endpoints: no epsilon changes to elevation blending.
if(uFarZeroWeightLayers>.5 && vFarSelection.w<=0.){
 farSample(farBase+vFarSelection.x,farC0,farN0);farSample(farBase+farNext,farC1,farN1);
 farColour=mix(farC0,farC1,vFarSelection.z);farNormal=mix(farN0,farN1,vFarSelection.z);
}else if(uFarZeroWeightLayers>.5 && vFarSelection.w>=1.){
 farSample(farBase+8.+vFarSelection.x,farC2,farN2);farSample(farBase+8.+farNext,farC3,farN3);
 farColour=mix(farC2,farC3,vFarSelection.z);farNormal=mix(farN2,farN3,vFarSelection.z);
}else{
 farSample(farBase+vFarSelection.x,farC0,farN0);farSample(farBase+farNext,farC1,farN1);
 farSample(farBase+8.+vFarSelection.x,farC2,farN2);farSample(farBase+8.+farNext,farC3,farN3);
 farColour=mix(mix(farC0,farC1,vFarSelection.z),mix(farC2,farC3,vFarSelection.z),vFarSelection.w);
 farNormal=mix(mix(farN0,farN1,vFarSelection.z),mix(farN2,farN3,vFarSelection.z),vFarSelection.w);
}
diffuseColor.rgb*=farColour.rgb/max(farColour.a,.0001);diffuseColor.a*=farColour.a;
`);
    // Preserve integrated coverage rather than rethresholding filtered mip alpha.
    shader.fragmentShader=shader.fragmentShader.replace("#include <alphatest_fragment>",`
if(diffuseColor.a<.003)discard;
if(uFarMultisample<.5){float farAlphaNoise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))+ .381966));if(diffuseColor.a<farAlphaNoise)discard;diffuseColor.a=1.;}

`);
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
// Coverage is EXACTLY the existing alpha/A2C policy. Only surviving fragments
// read normal layers; all gradients were computed before any discard/branch.
if(uFarDeferredNormal>.5){
 if(uFarZeroWeightLayers>.5 && vFarSelection.w<=0.){
  farN0=farSurvivingNormal(farBase+vFarSelection.x);farN1=farSurvivingNormal(farBase+farNext);
  farNormal=mix(farN0,farN1,vFarSelection.z);
 }else if(uFarZeroWeightLayers>.5 && vFarSelection.w>=1.){
  farN2=farSurvivingNormal(farBase+8.+vFarSelection.x);farN3=farSurvivingNormal(farBase+8.+farNext);
  farNormal=mix(farN2,farN3,vFarSelection.z);
 }else{
  farN0=farSurvivingNormal(farBase+vFarSelection.x);farN1=farSurvivingNormal(farBase+farNext);
  farN2=farSurvivingNormal(farBase+8.+vFarSelection.x);farN3=farSurvivingNormal(farBase+8.+farNext);
  farNormal=mix(mix(farN0,farN1,vFarSelection.z),mix(farN2,farN3,vFarSelection.z),vFarSelection.w);
 }
}
farNormal.y-=dot(vFarBendSlope,farNormal.xz);
normal=normalize(vFarNormalMatrix*farNormal+vec3(.000001));
`);
    if(rectGate)installFarRectGate39(shader,rectGate);
  };
  material.customProgramCacheKey=()=>key+"-far-spruce-impostor-v38-deferred-normal-optin"+(rectGate?"-rect-gate39":"");material.needsUpdate=true;return material;
}
