import * as T from 'three';
import {createMeadowPatchReference38} from './meadow-patch-reference-v38.js';
export function reduceSurface42(source,size,outSize){
 if(size%outSize)throw Error('Integral surface reduction required');const step=size/outSize,out=new Uint16Array(outSize*outSize*4);
 for(let y=0;y<outSize;y++)for(let x=0;x<outSize;x++)for(let c=0;c<4;c++){let sum=0;for(let j=0;j<step;j++)for(let i=0;i<step;i++)sum+=T.DataUtils.fromHalfFloat(source[((y*step+j)*size+x*step+i)*4+c]);out[(y*outSize+x)*4+c]=T.DataUtils.toHalfFloat(sum/(step*step));}return out;
}
export async function bakeMeadowSurface42(renderer,data,{resolution=1024,outputSize=256}={}){
 if(![1024,2048].includes(resolution)||!renderer.extensions.has('EXT_color_buffer_float'))throw Error('Full float colour attachment and 1024/2048 capture required');
 const lab=createMeadowPatchReference38(data,{lod:'middle',resolution:32}),original=lab.mesh.material.onBeforeCompile;
 lab.mesh.material.onBeforeCompile=(s,r)=>{original(s,r);s.fragmentShader=s.fragmentShader.replace('else gl_FragColor=vec4(1.);','else if(referencePass<7.5)gl_FragColor=vec4(referenceNormal*referenceNormal,1.);\nelse gl_FragColor=vec4(vec3(roughnessFactor),1.);');};
 lab.mesh.material.customProgramCacheKey=()=> 'meadow-surface-moments42';
 const camera=new T.OrthographicCamera(-data.size/2,data.size/2,data.size/2,-data.size/2,.1,256);camera.up.set(0,0,-1);camera.position.set(data.center[0],data.center[1]+128,data.center[2]);camera.lookAt(...data.center);camera.updateMatrixWorld();camera.updateProjectionMatrix();
 const target=new T.WebGLRenderTarget(resolution,resolution,{type:T.HalfFloatType,format:T.RGBAFormat,samples:4,depthBuffer:true});target.texture.colorSpace=T.NoColorSpace;
 const saved={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),shadow:renderer.shadowMap.enabled,tone:renderer.toneMapping},maps=[],raw=[],stats={resolution,outputSize,roots:data.roots.length,size:data.size,center:data.center,wind:'source zero-wind freeze',sourceTriangles:lab.mesh.geometry.index.count/3*data.roots.length,channels:['linear-premultiplied-albedo-coverage','encoded-world-normal-first-moment-coverage','world-normal-diagonal-second-moment-coverage','source-roughness-coverage'],scope:'Top-down ground material moments, not a multi-view grass impostor; silhouettes/occlusion at grazing views are not preserved'};
 try{
  renderer.shadowMap.enabled=false;renderer.toneMapping=T.NoToneMapping;renderer.setClearColor(0,0);
  const passModes=['albedo','normal'];
  for(let pass=0;pass<4;pass++){
   if(pass<2)lab.setReferencePass(passModes[pass]);else {
    // Reference exposes the diagnostic uniform through the actual compiled shader.
    lab.setReferencePass('coverage');
   }
   if(pass===2||pass===3){const hook=lab.mesh.onBeforeRender;lab.mesh.onBeforeRender=(...args)=>{hook?.apply(lab.mesh,args);};}
   // Change only the existing reference uniform, without recompilation.
   if(pass===0){const hook=lab.mesh.material.onBeforeCompile;lab.mesh.material.onBeforeCompile=(s,r)=>{hook(s,r);lab.surfaceShader42=s;};}
   if(pass>=2)lab.surfaceShader42.uniforms.referencePass.value=pass===2?7:8;
   renderer.setRenderTarget(target);renderer.clear();renderer.render(lab.scene,camera);
   const pixels=new Uint16Array(resolution*resolution*4);renderer.readRenderTargetPixels(target,0,0,resolution,resolution,pixels);
   const reduced=reduceSurface42(pixels,resolution,outputSize);raw.push(reduced);const texture=new T.DataTexture(reduced,outputSize,outputSize,T.RGBAFormat,T.HalfFloatType);texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;maps.push(texture);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  let coverage=0,nonzero=0;for(let i=3;i<raw[0].length;i+=4){const a=T.DataUtils.fromHalfFloat(raw[0][i]);coverage+=a;if(a>0)nonzero++;}
  stats.meanCoverage=coverage/(outputSize*outputSize);stats.nonzeroTexels=nonzero;stats.textureBytes=raw.reduce((n,a)=>n+a.byteLength,0)*4/3;
  const error=renderer.getContext().getError();if(error)throw Error('Surface bake GL error '+error);
  return {data,maps,raw,stats,dispose(){maps.forEach(m=>m.dispose());}};
 }catch(error){maps.forEach(m=>m.dispose());throw error;}finally{lab.dispose();target.dispose();renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.clear,saved.alpha);renderer.shadowMap.enabled=saved.shadow;renderer.toneMapping=saved.tone;}
}
export function createSurfaceGround42(bake,{enabled=true}={}){
 const {data,maps}=bake,g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.ground.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(data.ground.normals,3));g.setIndex(data.ground.indices);
 const active={value:enabled?1:0},material=new T.MeshStandardMaterial({color:0x6b8d45,roughness:.93,side:T.DoubleSide});
 material.onBeforeCompile=s=>{Object.assign(s.uniforms,{surfaceAlbedo42:{value:maps[0]},surfaceNormal42:{value:maps[1]},surfaceSecond42:{value:maps[2]},surfaceRough42:{value:maps[3]},surfaceRegion42:{value:new T.Vector3(data.center[0],data.center[2],data.size)},surfaceEnabled42:active});
  s.vertexShader='varying vec2 vSurfaceXZ42;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSurfaceXZ42=(modelMatrix*vec4(position,1.)).xz;');
  s.fragmentShader='varying vec2 vSurfaceXZ42; uniform vec3 surfaceRegion42; uniform float surfaceEnabled42; uniform sampler2D surfaceAlbedo42,surfaceNormal42,surfaceSecond42,surfaceRough42;\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 suv42=vec2(vSurfaceXZ42.x-surfaceRegion42.x,surfaceRegion42.y-vSurfaceXZ42.y)/surfaceRegion42.z+.5;
vec4 sa42=texture2D(surfaceAlbedo42,suv42);float footprint42=max(length(dFdx(vSurfaceXZ42)),length(dFdy(vSurfaceXZ42)));float blend42=surfaceEnabled42*smoothstep(.10,.40,footprint42);float cover42=clamp(sa42.a,0.,1.);diffuseColor.rgb=mix(diffuseColor.rgb,sa42.rgb/max(cover42,.00001),blend42*cover42);`);
  s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
vec4 sn42=texture2D(surfaceNormal42,suv42);vec3 mean42=sn42.rgb/max(sn42.a,.00001)*2.-1.;vec4 s242=texture2D(surfaceSecond42,suv42);vec3 second42=s242.rgb/max(s242.a,.00001);float variance42=max(0.,dot(second42,vec3(1.))-dot(mean42,mean42));vec4 sr42=texture2D(surfaceRough42,suv42);float leafRough42=sr42.r/max(sr42.a,.00001);roughnessFactor=mix(roughnessFactor,sqrt(clamp(leafRough42*leafRough42+variance42,0.,1.)),blend42*cover42);`);
  s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
if(cover42>.0001){vec3 leafNormal42=normalize((viewMatrix*vec4(normalize(mean42),0.)).xyz);normal=normalize(mix(normal,leafNormal42,blend42*cover42));}`);
 };material.customProgramCacheKey=()=> 'source-meadow-ground-moments42';const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;return {mesh,setEnabled:v=>active.value=v?1:0,dispose(){g.dispose();material.dispose();}};
}
export function surfacePreview42(bytes,size,{channel='color'}={}){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,j=((size-1-y)*size+x)*4,a=T.DataUtils.fromHalfFloat(bytes[i+3]);for(let c=0;c<3;c++){let value=channel==='coverage'?a:T.DataUtils.fromHalfFloat(bytes[i+c])/Math.max(.00001,a);if(channel==='color')value=value<=.0031308?12.92*value:1.055*Math.pow(value,1/2.4)-.055;image.data[j+c]=255*Math.max(0,Math.min(1,value));}image.data[j+3]=255;}ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
}
