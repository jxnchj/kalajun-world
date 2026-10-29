// Independent experiment. No production imports. Same root/time/field, evaluated
// once per root on the GPU instead of once per leaf vertex. Adoption requires
// actual colour AND depth comparisons plus the cache update's measured GPU cost.
import * as T from 'three';
export const MEADOW_ROOT_FIELD41=`vec4 ecoField(vec2 p, float t) {
  vec2 uv=(p-uWindFieldOrigin)/uWindFieldSpan;
  // Outside the local texture, retain a cheap WORLD-position-dependent field.
  // An edge blend keeps far trees moving independently instead of clamping them to one border texel.
  float phase=dot(p,vec2(.023,.017))-t*.4;
  vec4 distant=vec4(.38+.12*sin(phase),.38+.12*sin(phase+.168),.5+.25*sin(phase*.7),.5);
  float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
  if(edge<=0.) return distant;
  vec4 local=mix(texture2D(uWindPrevious,uv),texture2D(uWindCurrent,uv),uWindFieldBlend);
  return mix(distant,local,smoothstep(0.,.08,edge));
}`;
const keys=['uWindTime','uWindPrevious','uWindCurrent','uWindFieldOrigin','uWindFieldSpan','uWindFieldBlend'];
export function createMeadowRootWind41(matrices,uniforms){
 if(!(matrices instanceof Float32Array)||matrices.length%16)throw Error('Expected original Float32 instance matrices');
 for(const key of keys)if(!uniforms[key])throw Error('Missing original field uniform '+key);
 const roots=matrices.length/16,width=Math.min(1024,Math.max(1,2**Math.ceil(Math.log2(Math.sqrt(roots||1))))),height=Math.max(1,Math.ceil(roots/width));
 if(height>4096)throw Error('Root cache diagnostic too large');
 const positions=new Float32Array(roots*3);for(let i=0;i<roots;i++)positions.set(matrices.subarray(i*16+12,i*16+15),i*3);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 const size=new T.Vector2(width,height),target=new T.WebGLRenderTarget(width,height,{type:T.FloatType,format:T.RGBAFormat,minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:false,stencilBuffer:false,samples:0});target.texture.colorSpace=T.NoColorSpace;
 const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,depthWrite:false,depthTest:false,blending:T.NoBlending,uniforms:{...Object.fromEntries(keys.map(k=>[k,uniforms[k]])),cacheSize:{value:size}},vertexShader:`precision highp float;
 in vec3 position;uniform vec2 cacheSize;out vec2 rootXZ;
 void main(){rootXZ=position.xz;float i=float(gl_VertexID);vec2 p=vec2(mod(i,cacheSize.x),floor(i/cacheSize.x));gl_Position=vec4((p+.5)/cacheSize*2.-1.,0.,1.);gl_PointSize=1.;}`,
 fragmentShader:`precision highp float;precision highp int;precision highp sampler2D;in vec2 rootXZ;out vec4 value;
 uniform float uWindTime,uWindFieldSpan,uWindFieldBlend;uniform vec2 uWindFieldOrigin;uniform sampler2D uWindPrevious,uWindCurrent;
 ${MEADOW_ROOT_FIELD41.replaceAll('texture2D(','texture(')}
 void main(){value=ecoField(rootXZ,uWindTime);}`});
 const scene=new T.Scene(),points=new T.Points(geometry,material);points.frustumCulled=false;scene.add(points);const camera=new T.OrthographicCamera(-1,1,1,-1,.1,2);
 let disposed=false;
 return {target,size,roots,uniforms,stats:{roots,width,height,textureBytes:width*height*16,rootPositionBytes:positions.byteLength,scope:'Exact source formula in float32 target; driver-stage equality and net GPU cost NOT yet proven.'},
  updateMatrices(matrices,start=0){if(!(matrices instanceof Float32Array)||matrices.length%16||start<0||start+matrices.length/16>roots)throw Error('Invalid root update');for(let i=0;i<matrices.length/16;i++)positions.set(matrices.subarray(i*16+12,i*16+15),(start+i)*3);geometry.attributes.position.addUpdateRange(start*3,matrices.length/16*3);geometry.attributes.position.needsUpdate=true;},
  update(renderer){if(disposed)throw Error('Disposed root cache');const saved=renderer.getRenderTarget(),clear=renderer.autoClear;try{renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(scene,camera);}finally{renderer.setRenderTarget(saved);renderer.autoClear=clear;}},
  dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();target.dispose();}
 };
}
export function attachMeadowRootWind41(material,cache){
 const hook=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,...args){hook.call(this,shader,...args);
  if(!shader.vertexShader.includes(MEADOW_ROOT_FIELD41)||!shader.vertexShader.includes('vec4 field=ecoField(root.xz,t);'))throw Error('Original grass root-field source changed');
  shader.uniforms.uMeadowRootWind41=cache.textureUniform??{value:cache.target.texture};shader.uniforms.uMeadowRootWindSize41=cache.sizeUniform??{value:cache.size};
  shader.vertexShader='attribute float aMeadowWindRoot41;uniform sampler2D uMeadowRootWind41;uniform vec2 uMeadowRootWindSize41;\n'+shader.vertexShader.replace('vec4 field=ecoField(root.xz,t);','vec2 rootUV41=(vec2(mod(aMeadowWindRoot41,uMeadowRootWindSize41.x),floor(aMeadowWindRoot41/uMeadowRootWindSize41.x))+.5)/uMeadowRootWindSize41;\n  vec4 field=texture2D(uMeadowRootWind41,rootUV41);');
 };
 material.customProgramCacheKey=function(){return key.call(this)+'-root-field41';};material.needsUpdate=true;
 return ()=>{material.onBeforeCompile=hook;material.customProgramCacheKey=key;material.needsUpdate=true;};
}
export function meadowWindRootIndices41(count){if(!Number.isInteger(count)||count<0||count>16777216)throw Error('Unrepresentable root index');return new T.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i),1);}
