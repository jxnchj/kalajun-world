// Independent source-capture laboratory. Never imported by main/terrain.
import * as T from 'three';
import {attachEcologyWind,installGrassSurface} from './ecology.js';
import {decodeGzipBytes} from './world-data.js';
export async function loadMeadowPatchReference38(url='./assets/v2/meadow-reference-v38/source.json.gz'){
 const response=await fetch(url);if(!response.ok)throw Error('Meadow reference HTTP '+response.status);
 const data=JSON.parse(new TextDecoder().decode(await decodeGzipBytes(new Uint8Array(await response.arrayBuffer()))));
 if(data.version!==38||data.size!==8||!data.roots.length)throw Error('Invalid meadow reference');return data;
}
export function createMeadowPatchReference38(data,{lod='middle',resolution=128}={}){
 if(!['near','middle'].includes(lod)||!Number.isInteger(resolution)||resolution<32||resolution>512)throw Error('Invalid capture options');
 const scene=new T.Scene(),group=new T.Group();scene.add(group);const center=new T.Vector3(...data.center),pass={value:0},lightDirection={value:new T.Vector3(.45,.8,.3).normalize()};
 const source=data.geometry[lod],g=new T.InstancedBufferGeometry();for(const[k,a]of Object.entries(source.attributes))g.setAttribute(k,new T.Float32BufferAttribute(a.array,a.itemSize));g.setIndex(source.index);
 for(const[name,key]of[['aMeadowRootField','field'],['aMeadowLandform','landform'],['aMeadowCommunity','community']])g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(data.roots.flatMap(r=>r[key])),4));
 const mat=installGrassSurface(attachEcologyWind(new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.93}),{uWorldViewer:{value:center},uWindTime:{value:0},uPlantRange:{value:100}},lod==='near'?2:4,true));
 function freeze(shader){shader.vertexShader=shader.vertexShader.replace('vPlantDistance=distance(ecoRoot().xz,uWorldViewer.xz);',`vPlantDistance=${lod==='near'?'10.':'40.'};`).replace('vec2 ecoOffset=ecoBend(position.y,ecoWeights,ecoRoot());','vec2 ecoOffset=vec2(0.);');}
 const hook=mat.onBeforeCompile;mat.onBeforeCompile=(shader,renderer)=>{hook(shader,renderer);freeze(shader);shader.uniforms.referencePass=pass;shader.uniforms.referenceLight=lightDirection;
  if(!shader.fragmentShader.includes('#include <packing>'))shader.fragmentShader='#include <packing>\n'+shader.fragmentShader;
  shader.fragmentShader='uniform float referencePass;uniform vec3 referenceLight;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
vec3 referenceNormal=normalize(inverseTransformDirection(normal,viewMatrix));
float referenceVisibility=getShadowMask();
if(referencePass<.5)gl_FragColor=vec4(diffuseColor.rgb,1.);
else if(referencePass<1.5)gl_FragColor=vec4(referenceNormal*.5+.5,1.);
else if(referencePass<2.5)gl_FragColor=packDepthToRGBA(gl_FragCoord.z);
else if(referencePass<3.5)gl_FragColor=vec4(vec3(max(0.,dot(referenceNormal,referenceLight))*referenceVisibility),1.);
else if(referencePass<4.5)gl_FragColor=vec4(vec3(referenceVisibility),1.);
else if(referencePass<5.5)gl_FragColor=vec4(0.,0.,0.,1.);
else gl_FragColor=vec4(1.);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','').replace('#include <colorspace_fragment>','').replace('#include <fog_fragment>','').replace('#include <dithering_fragment>','');
 };mat.customProgramCacheKey=()=>`meadow-reference38-v5-${lod}`;
 const mesh=new T.InstancedMesh(g,mat,data.roots.length),object=new T.Object3D();for(let i=0;i<data.roots.length;i++){const r=data.roots[i];object.position.set(r.x,r.y,r.z);object.rotation.set(0,r.rot,0);object.scale.set(r.s,r.sy??r.s,r.s);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);}mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
 const depth=attachEcologyWind(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}),{uWorldViewer:{value:center},uWindTime:{value:0},uPlantRange:{value:100}},lod==='near'?2:4,true),dh=depth.onBeforeCompile;depth.onBeforeCompile=(s,r)=>{dh(s,r);freeze(s);};depth.customProgramCacheKey=()=>`meadow-reference-depth38-v5-${lod}`;mesh.customDepthMaterial=depth;group.add(mesh);
 const gg=new T.BufferGeometry();gg.setAttribute('position',new T.Float32BufferAttribute(data.ground.positions,3));gg.setAttribute('normal',new T.Float32BufferAttribute(data.ground.normals,3));gg.setIndex(data.ground.indices);const gm=new T.MeshBasicMaterial({color:0xffffff,colorWrite:false,side:T.DoubleSide,toneMapped:false}),ground=new T.Mesh(gg,gm);ground.renderOrder=-1;ground.castShadow=true;group.add(ground);
 const light=new T.DirectionalLight(0xffffff,1);light.position.copy(center).addScaledVector(lightDirection.value,20);light.target.position.copy(center);light.castShadow=true;Object.assign(light.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:40});light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.00001;scene.add(light,light.target);
 const target=new T.WebGLRenderTarget(resolution,resolution,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:true,samples:4});target.texture.colorSpace=T.NoColorSpace;
 const depthTarget=new T.WebGLRenderTarget(resolution,resolution,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:true,samples:0});depthTarget.texture.colorSpace=T.NoColorSpace;
 function capture(renderer,{elevations=[10,25,45],azimuths=[0,90,180,270],lightDirections=[[.45,.8,.3],[-.45,.8,-.3],[.8,.2,.2]],singleSample=false,perspectiveDistance=null}={}){
  if(perspectiveDistance!==null&&(!Number.isFinite(perspectiveDistance)||perspectiveDistance<=12))throw Error('Invalid perspective capture distance');
  if(renderer.capabilities?.logarithmicDepthBuffer)throw Error('Reference capture requires linear window depth');
  const saved={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear,shadow:renderer.shadowMap.enabled,shadowType:renderer.shadowMap.type,shadowAuto:renderer.shadowMap.autoUpdate,tone:renderer.toneMapping,xr:renderer.xr.enabled},frames=[];
  try{renderer.xr.enabled=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.BasicShadowMap;renderer.shadowMap.autoUpdate=true;renderer.toneMapping=T.NoToneMapping;renderer.autoClear=true;renderer.setClearColor(0,0);
   for(const elevation of elevations)for(const azimuth of azimuths){const e=elevation*Math.PI/180,a=azimuth*Math.PI/180,dir=new T.Vector3(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)),cam=perspectiveDistance===null?new T.OrthographicCamera(-6,6,6,-6,.1,40):new T.PerspectiveCamera(2*Math.atan(6/perspectiveDistance)*180/Math.PI,1,.1,perspectiveDistance+20);cam.position.copy(center).addScaledVector(dir,perspectiveDistance??20);cam.lookAt(center);cam.updateMatrixWorld();cam.updateProjectionMatrix();
    const frame={elevation,azimuth,perspectiveDistance,viewMatrix:cam.matrixWorldInverse.toArray(),projectionMatrix:cam.projectionMatrix.toArray(),channels:[],lights:[]};
    const render=p=>{pass.value=p;const destination=(singleSample||p===2||p===6)?depthTarget:target;renderer.setRenderTarget(destination);renderer.clear();renderer.render(scene,cam);const bytes=new Uint8Array(resolution*resolution*4);renderer.readRenderTargetPixels(destination,0,0,resolution,resolution,bytes);return bytes;};
    for(let p=0;p<3;p++)frame.channels.push(render(p));
    frame.channels.push(render(6)); // Center coverage validates the separate, unaveraged packed depth.
    frame.projectionMatrix=cam.projectionMatrix.toArray();frame.zeroToOneDepth=cam.reversedDepth===true;frame.depthSamples=0;frame.colorSamples=singleSample?0:4;
    gm.colorWrite=true;frame.groundTransmission=render(5);gm.colorWrite=false;
    for(const vector of lightDirections){lightDirection.value.fromArray(vector).normalize();light.position.copy(center).addScaledVector(lightDirection.value,20);light.shadow.needsUpdate=true;frame.lights.push({direction:lightDirection.value.toArray(),response:render(3),visibility:render(4)});}
    frames.push(frame);
   }
   return{version:38,lod,resolution,roots:data.roots.length,center:data.center,frames,cost:{textureBytes:frames.length*resolution*resolution*4*4,sourceTriangles:g.index.count/3*data.roots.length,captureDraws:renderer.info.render.calls},scope:'Exact original shader pigment, 14% stem selection and double-sided normals at zero wind; full un-faded LOD reference. Ground depth occludes leaves; alpha complements visible ground only inside projected patch. Light response/visibility are diagnostics, never stored in albedo.'};
  }finally{gm.colorWrite=false;renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.clear,saved.alpha);renderer.autoClear=saved.auto;renderer.shadowMap.enabled=saved.shadow;renderer.shadowMap.type=saved.shadowType;renderer.shadowMap.autoUpdate=saved.shadowAuto;renderer.toneMapping=saved.tone;renderer.xr.enabled=saved.xr;}
 }
 return{scene,mesh,ground,light,center,capture,setReferenceLight(direction){lightDirection.value.copy(direction).normalize();},setReferencePass(name){const modes={albedo:0,normal:1,response:3,visibility:4,coverage:6};if(!(name in modes))throw Error('Unknown reference display');pass.value=modes[name];},dispose(){target.dispose();depthTarget.dispose();g.dispose();mat.dispose();depth.dispose();gg.dispose();gm.dispose();light.shadow.map?.dispose();}};
}
export function analyzeMeadowCapture38(capture){
 const cases=[];for(const frame of capture.frames){const normal=frame.channels[1],albedo=frame.channels[0],ground=frame.groundTransmission;let leafPixels=0,groundPixels=0;
  for(let i=0;i<normal.length;i+=4){leafPixels+=albedo[i+3]/255;groundPixels+=ground[i]/255;}
  for(const light of frame.lights){let reference=0,prediction=0,error2=0,count=0,max=0;
   for(let i=0;i<normal.length;i+=4){const a=normal[i+3]/255;if(a<.01)continue;const n=[0,1,2].map(k=>(normal[i+k]/255/a-.5)*2),response=light.response[i]/255,visibility=light.visibility[i]/255;
    const predicted=Math.max(0,n.reduce((v,x,k)=>v+x*light.direction[k],0))*visibility;
    reference+=response;prediction+=predicted;if(a>.99){const error=Math.abs(response-predicted);error2+=error*error;max=Math.max(max,error);count++;}
   }
   cases.push({elevation:frame.elevation,azimuth:frame.azimuth,direction:light.direction,leafProjectedPixels:leafPixels,groundVisiblePixels:groundPixels,referenceProjectedEnergy:reference,predictedProjectedEnergy:prediction,relativeEnergyError:Math.abs(reference-prediction)/Math.max(1,reference),opaqueRMSE:Math.sqrt(error2/Math.max(1,count)),opaqueMax:max,opaquePixels:count});
  }
 }
 return{scope:'Quantized first-hit normals plus independently captured visibility reproduce original shader unit diffuse response; not a hemispherical BRDF, not validation for unseen view or light. Clamped subpixel normals and visibility correlation are measured errors.',accepted:cases.every(c=>c.relativeEnergyError<=.04&&c.opaqueRMSE<=.04),limits:{relativeEnergyError:.04,opaqueRMSE:.04},cases};
}
export async function downloadMeadowCapture38(capture){
 const entries=[],buffers=[];let offset=0;const add=(name,bytes)=>{entries.push({name,offset,bytes:bytes.length});buffers.push(bytes);offset+=bytes.length;};
 capture.frames.forEach((f,i)=>{f.channels.forEach((b,j)=>add(`${i}/${['albedo','normal','depth','centerCoverage'][j]}`,b));add(`${i}/ground`,f.groundTransmission);f.lights.forEach((l,j)=>{add(`${i}/light${j}/response`,l.response);add(`${i}/light${j}/visibility`,l.visibility);});});
 const raw=new Blob(buffers),gz=await new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const metadata={...capture,frames:capture.frames.map(({channels,groundTransmission,lights,...f})=>({...f,lights:lights.map(({direction})=>({direction}))})),entries,analysis:analyzeMeadowCapture38(capture),transportBytes:gz.size,decodedBytes:offset,encoding:'bottom-up RGBA8 linear albedo and encoded world normals premultiplied by multisample coverage; single-sample Three packDepthToRGBA window depth plus center coverage; per-frame zeroToOneDepth records clip convention; no baked illumination in first 3 channels',runtimeCost:{atlasBytesWithoutMips:capture.frames.length*capture.resolution**2*4*4,localBillboardTriangles:2,localBillboardDraws:1,textureFetchesPerFragment:4,note:'nearest captured direction only; interpolation/scene shadowing and novel-view holes not yet accepted'}};
 const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};download(gz,`meadow-reference-v38-${capture.lod}.bin.gz`);download(new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'}),`meadow-reference-v38-${capture.lod}.json`);return{transportBytes:gz.size,decodedBytes:offset,analysis:metadata.analysis};
}
// Exact captured-view local probe. This is intentionally not a world LOD:
// probe excludes mixed-coverage edge pixels; single-sample depth is not an averaged surface.
// source roots/geometry remain in the parent world, and no unvalidated blending
// between capture directions or terrain pigment is installed.
export function createMeadowCaptureProbe38(capture,index=0){
 const f=capture.frames[index];if(!f)throw Error('Unknown capture frame');
 if(f.depthSamples!==0||typeof f.zeroToOneDepth!=='boolean'||f.channels.length!==4)throw Error('Probe requires unaveraged depth and explicit clip convention');
 const tex=f.channels.map(bytes=>{const t=new T.DataTexture(bytes,capture.resolution,capture.resolution,T.RGBAFormat);t.colorSpace=T.NoColorSpace;t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;});
 const inverseProjection=new T.Matrix4().fromArray(f.projectionMatrix).invert(),cameraWorld=new T.Matrix4().fromArray(f.viewMatrix).invert();
 const m=new T.ShaderMaterial({transparent:true,depthWrite:true,side:T.DoubleSide,uniforms:{albedo:{value:tex[0]},normals:{value:tex[1]},depth:{value:tex[2]},centerCoverage:{value:tex[3]},captureZeroToOne:{value:f.zeroToOneDepth?1:0},captureInverseProjection:{value:inverseProjection},captureCameraWorld:{value:cameraWorld},referenceLight:{value:new T.Vector3(.45,.8,.3).normalize()},mode:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
#include <packing>
varying vec2 vUv;uniform sampler2D albedo;uniform sampler2D normals;uniform sampler2D depth;uniform sampler2D centerCoverage;uniform float captureZeroToOne;uniform mat4 captureInverseProjection;uniform mat4 captureCameraWorld;uniform mat4 projectionMatrix;uniform vec3 referenceLight;uniform float mode;
void main(){vec4 c=texture2D(albedo,vUv);if(c.a<.999||texture2D(centerCoverage,vUv).r<.999)discard;vec4 n=texture2D(normals,vUv);vec3 normal=(n.rgb/max(.001,n.a)-.5)*2.;float d=unpackRGBAToDepth(texture2D(depth,vUv));vec4 p=captureInverseProjection*vec4(vUv*2.-1.,mix(d*2.-1.,d,captureZeroToOne),1.);p/=p.w;vec4 world=captureCameraWorld*p;vec4 clip=projectionMatrix*viewMatrix*world;
#ifdef USE_REVERSED_DEPTH_BUFFER
gl_FragDepth=clip.z/clip.w;
#else
gl_FragDepth=clip.z/clip.w*.5+.5;
#endif
vec3 color=c.rgb/max(.001,c.a);if(mode>.5)color=vec3(max(0.,dot(normal,referenceLight)));gl_FragColor=vec4(color,c.a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const g=new T.PlaneGeometry(12,12),mesh=new T.Mesh(g,m);mesh.position.fromArray(capture.center);mesh.quaternion.setFromRotationMatrix(cameraWorld);mesh.frustumCulled=false;
 return{mesh,material:m,textures:tex,dispose(){g.dispose();m.dispose();tex.forEach(t=>t.dispose());}};
}
