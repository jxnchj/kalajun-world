import * as THREE from 'three';
import {useProjectedShadowDepth} from './room-shadow.js';

// Opt-in, bounded review candidate. Source meshes/attributes and all LOD, shape,
// root-force and shadow scheduling policies remain owned by the existing world.
const CALL='vec2 ecoOffset=ecoBend(brushPosition.y,ecoWeights,ecoRoot());';
const INPUTS=['aNeedleFrame1','aNeedleFrame2','aNeedleFrame3','aTreeRootWind','aTreeRootEddy'];
const f=Math.fround;
export function stationWindLayout62(stations,maxSize=16384){
 if(!Number.isInteger(stations)||stations<1)throw new RangeError('Invalid station count');
 const width=Math.min(1024,maxSize),height=Math.ceil(stations/width);
 if(height>maxSize)throw new RangeError('Station wind cache exceeds RGBA32F texture limit');
 return{stations,width,height,logicalBytes:stations*16,attachmentBytes:width*height*16,sourceVertices:stations*15};
}
export const STATION_WIND_COEFFICIENTS62=`
 vec4 field=vec4(aTreeRootWind.zw,aTreeRootEddy+.5,.5);
 vec2 direction=aTreeRootWind.xy;
 float current=mix(field.r,field.g,weights.x*.48);
 float previous=field.g;
 float returning=(current-previous)*.32;
 float eddy=field.b-.5;
 vec2 A=direction*(current+returning);
 float branch=weights.y*(sin(t*.85+weights.z)*.018+(previous-current)*.12);
 vec2 B=direction*branch+vec2(-direction.y,direction.x)*eddy*weights.y*.018;
`;
const CACHE_DECLARATIONS=`
uniform sampler2D uStationWind62;
uniform int uStationWindWidth62;
uniform float uStationWindValid62;
`;
const CACHE_EVAL=`vec2 ecoOffset;
if(uStationWindValid62>.5){
 vec4 coefficients=texelFetch(uStationWind62,ivec2(gl_InstanceID%uStationWindWidth62,gl_InstanceID/uStationWindWidth62),0);
 float h=min(max(brushPosition.y,0.),20.);
 ecoOffset=coefficients.xy*h*h*.0014;
 ecoOffset+=coefficients.zw;
}else{ecoOffset=ecoBend(brushPosition.y,ecoWeights,ecoRoot());}`;
function extractFunction(source,name){
 const match=new RegExp('(?:float|vec[234]|void) '+name+'\\(').exec(source);if(!match)throw Error('Missing source function '+name);
 const begin=match.index,brace=source.indexOf('{',begin);let level=1,i=brace+1;
 for(;i<source.length&&level;i++){if(source[i]==='{')level++;else if(source[i]==='}')level--;}
 if(level)throw Error('Unclosed source function '+name);return source.slice(begin,i);
}
export function stationWindShader62(source){
 if(source.includes('// STATION_WIND_CACHE62'))return source;
 if(source.split(CALL).length!==2)throw Error('Station wind cache requires unchanged mode12 station wind call');
 const bend=extractFunction(source,'ecoBend');
 for(const part of ['float current=mix(field.r,field.g,weights.x*.48);','float returning=(current-previous)*.32;','float eddy=field.b-.5;','vec2 trunk=direction*(current+returning)*h*h*.0014;','float branch=weights.y*(sin(t*.85+weights.z)*.018+(previous-current)*.12);','trunk+=direction*branch+vec2(-direction.y,direction.x)*eddy*weights.y*.018;'])if(!bend.includes(part))throw Error('Source wind formula changed: '+part);
 if(!source.includes('const float uPlantMode=12.0;'))throw Error('Station wind cache is restricted to mode12');
 return '// STATION_WIND_CACHE62\n'+CACHE_DECLARATIONS+source.replace(CALL,CACHE_EVAL);
}
// Float32 scalar oracle, not a claim about GPU compiler fusion or sin accuracy.
export function stationWindCoefficients62(w,weights,time){
 const dir=w.slice(0,2).map(f),r=f(w[2]),g=f(w[3]),eddy=f(f(f(w[4])+.5)-.5),t=f(time);
 const a=f(f(weights[0])*f(.48)),current=f(f(r*f(1-a))+f(g*a)),previous=g,returning=f(f(current-previous)*f(.32));
 const branch=f(f(weights[1])*f(f(f(Math.sin(f(f(t*f(.85))+f(weights[2]))))*f(.018))+f(f(previous-current)*f(.12))));
 const A=dir.map(d=>f(d*f(current+returning)));
 const B=dir.map((d,i)=>f(f(d*branch)+f(f(f((i===0?-dir[1]:dir[0])*eddy)*f(weights[1]))*f(.018))));
 return[...A,...B];
}
export function stationWindApply62(c,y){const h=f(Math.min(Math.max(f(y),0),20));return[0,1].map(i=>f(f(f(f(c[i]*h)*h)*f(.0014))+c[i+2]));}
function compileSource(material,renderer){
 const lib=THREE.ShaderLib[material.isMeshDepthMaterial?'depth':'standard'];
 const shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
 material.onBeforeCompile.call(material,shader,renderer);stationWindShader62(shader.vertexShader);return shader;
}
function cloneConsumer(original,uniforms,renderer){
 if(!original?.userData.solidNeedleStations||!Object.hasOwn(original.defines||{},'ECO_ROOT_WIND'))throw Error('Selected material does not use mode12 root-force stations');
 compileSource(original,renderer);
 // Material.copy JSON-serializes userData. Avoid serializing shared variation
 // texture pixels (or unrelated cyclic diagnostics); never mutate the source.
 const copySource=Object.create(original);copySource.userData={};
 const clone=new original.constructor().copy(copySource);clone.userData={...original.userData,stationWindCache62:true};
 const previous=original.onBeforeCompile,key=original.customProgramCacheKey();
 clone.onBeforeCompile=function(shader,r){previous.call(original,shader,r);shader.vertexShader=stationWindShader62(shader.vertexShader);Object.assign(shader.uniforms,uniforms);};
 clone.customProgramCacheKey=()=>key+'-station-wind62';
 if(clone.isMeshDepthMaterial)useProjectedShadowDepth(clone);
 return clone;
}
// Full mutable attribute layout + version; immutable frame contents follow
// Three's needsUpdate contract. Five root-force scalars and 16 root-matrix
// scalars are also compared, without scanning the large immutable frame arrays.
function attributeStamp(out,a){
 out.push(a,a?.data,a?.array,a?.data?.array,a?.version,a?.data?.version,a?.itemSize,a?.offset,a?.normalized,a?.gpuType,a?.count,a?.meshPerAttribute,a?.data?.stride,a?.data?.meshPerAttribute,a?.data?.count);
}
export function stationWindStamp62(mesh,timeUniform){
 const g=mesh.geometry,out=[g,g?.index,mesh.count,g?.drawRange.start,g?.drawRange.count,mesh.parent,timeUniform,f(timeUniform?.value)];
 for(const name of INPUTS)attributeStamp(out,g?.getAttribute(name));
 attributeStamp(out,mesh.instanceMatrix);out.push(...mesh.instanceMatrix.array);
 for(const name of ['aTreeRootWind','aTreeRootEddy']){const a=g.getAttribute(name);for(let c=0;c<a.itemSize;c++)out.push(a.data.array[a.offset+c]);}
 return out;
}
function same(a,b){return a?.length===b?.length&&a.every((x,i)=>Object.is(x,b[i]));}
function materialStamp(m){return[m,m.onBeforeCompile,m.customProgramCacheKey,m.customProgramCacheKey(),m.version];}
function floatTarget(width,height,count=1){const t=new THREE.WebGLRenderTarget(width,height,{count,type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,depthBuffer:false,stencilBuffer:false});for(const texture of t.textures){texture.colorSpace=THREE.NoColorSpace;texture.name='station-wind62-native-rgba32f';}return t;}
// Independent offscreen scene; do not touch world scene/camera/CSM. Render epoch
// remains monotonic so Three's shared-buffer upload bookkeeping stays correct.
export function withStationRenderState62(renderer,draw){
 const state={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),auto:renderer.autoClear,color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),xr:renderer.xr.enabled,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),currentViewport:renderer.getCurrentViewport?.(new THREE.Vector4()),info:{...renderer.info.render},infoAuto:renderer.info.autoReset,shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate};
 const debug=renderer.debug,check=debug?.checkShaderErrors,onError=debug?.onShaderError;let failed=false;
 if(debug){debug.checkShaderErrors=true;debug.onShaderError=(...args)=>{failed=true;onError?.(...args);};}
 try{renderer.xr.enabled=false;renderer.autoClear=false;renderer.info.autoReset=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setScissorTest(false);const value=draw();if(failed)throw Error('Station wind GPU shader failed');return value;}
 finally{if(debug){debug.checkShaderErrors=check;debug.onShaderError=onError;}renderer.setClearColor(state.color,state.alpha);renderer.setScissorTest(state.scissorTest);renderer.setRenderTarget(state.target,state.face,state.mip);if(state.currentViewport)renderer.state.viewport(state.currentViewport);renderer.autoClear=state.auto;renderer.xr.enabled=state.xr;renderer.shadowMap.autoUpdate=state.shadowAuto;renderer.shadowMap.needsUpdate=state.shadowNeeds;renderer.info.autoReset=state.infoAuto;for(const [k,v]of Object.entries(state.info))if(k!=='frame')renderer.info.render[k]=v;}
}
export function createStationWindBake62(renderer,mesh){
 if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('RGBA32F renderable targets unavailable');
 const layout=stationWindLayout62(mesh.count,renderer.capabilities.maxTextureSize),geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(3),3));
 for(const name of INPUTS){const a=mesh.geometry.getAttribute(name);if(!a)throw Error('Missing station input '+name);geometry.setAttribute(name,a);}
 geometry.instanceCount=mesh.count;
 const compact=mesh.geometry.getAttribute('aNeedleFrame3').itemSize===1;
 const uniforms={uWindTime:{value:0},uSize:{value:new THREE.Vector2(layout.width,layout.height)}};
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,uniforms,vertexShader:`precision highp float;precision highp int;
in vec4 aNeedleFrame1,aNeedleFrame2,aNeedleFrame3,aTreeRootWind;in float aTreeRootEddy;
uniform float uWindTime;uniform ivec2 uSize;flat out vec4 vCoefficients;
void main(){vec3 weights=vec3(aNeedleFrame1.w,aNeedleFrame2.w,aNeedleFrame3.${compact?'x':'w'});float t=uWindTime;
${STATION_WIND_COEFFICIENTS62}
vCoefficients=vec4(A,B);int i=gl_InstanceID;ivec2 pixel=ivec2(i%uSize.x,i/uSize.x);gl_Position=vec4((vec2(pixel)+.5)/vec2(uSize)*2.-1.,0.,1.);gl_PointSize=1.;}`,fragmentShader:'precision highp float;flat in vec4 vCoefficients;out vec4 outCoefficients;void main(){outCoefficients=vCoefficients;}'});
 const target=floatTarget(layout.width,layout.height),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1),points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);let closed=false;
 return{target,layout,update(time){if(closed)throw Error('Disposed wind bake');uniforms.uWindTime.value=f(time);return withStationRenderState62(renderer,()=>{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.render(scene,camera);});},dispose(){if(closed)return;closed=true;for(const name of INPUTS)geometry.deleteAttribute(name);geometry.dispose();material.dispose();target.dispose();scene.clear();}};
}
export function selectStationMeshes62(runtime,camera,maxBatches=2){
 if(!runtime?.batches||!camera)return[];
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
 const selected=[];
 for(const item of runtime.batches.values())for(const mesh of item.meshes||[]){
  if(!mesh.visible||!mesh.material?.visible||!mesh.material?.userData.solidNeedleStations||!mesh.count||!mesh.geometry.hasAttribute('aNeedleFrame1'))continue;
  let visible=true;for(let p=mesh.parent;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible||!mesh.layers.test(camera.layers))continue;
  const root=mesh.instanceMatrix.array;if(Math.hypot(f(root[12])-f(camera.position.x),f(root[14])-f(camera.position.z))>=15)continue;
  if(mesh.frustumCulled&&!(mesh.intersectsFrustum?mesh.intersectsFrustum(frustum):frustum.intersectsObject(mesh)))continue;
  selected.push(mesh);
 }
 // Largest useful main-view batches first; deterministic ties, no density edit.
 return selected.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,Math.min(2,maxBatches));
}
export class NeedleStationWindCache62{
 constructor({enabled=false,maxBatches=2,createBake=createStationWindBake62}={}){
  this.enabled=!!enabled;this.maxBatches=Math.max(0,Math.min(2,maxBatches));this.createBake=createBake;this.records=new Map();this.failures=new Map();this.closed=false;this.contextLost=false;
  this.stats={enabled:this.enabled,selected:[],stations:0,attachmentBytes:0,logicalBytes:0,bakes:0,cacheHits:0,fallbackDraws:0,validDraws:0,submissionMs:0,lastSubmissionMs:0,lastBakeCalls:0,lastBakeStations:0,gpuMs:null,errors:[],verifiedGPU:null};
 }
 setEnabled(value){if(this.closed&&value)throw Error('Disposed station wind cache');this.enabled=!!value;if(!this.enabled)this.clear();this.refresh();return this.stats;}
 retry(){this.failures.clear();for(const r of this.records.values())r.error=null;this.stats.errors=[];}
 bind(renderer){if(this.renderer&&this.renderer!==renderer)throw Error('Station cache cannot cross WebGL contexts');if(this.renderer)return;this.renderer=renderer;this.onLost=()=>{this.contextLost=true;this.clear();};this.onRestore=()=>{this.contextLost=false;this.clear();this.stats.errors=[];};renderer.domElement?.addEventListener('webglcontextlost',this.onLost);renderer.domElement?.addEventListener('webglcontextrestored',this.onRestore);}
 valid(r){try{return !this.closed&&this.enabled&&!this.contextLost&&!!r.result&&!!r.stamp&&r.mesh.material===r.material&&r.mesh.customDepthMaterial===r.depth&&same(r.stamp,stationWindStamp62(r.mesh,r.time))&&same(r.materialSource,materialStamp(r.originalMaterial))&&same(r.depthSource,materialStamp(r.originalDepth));}catch{return false;}}
 register(mesh,time,renderer){
  const uniforms={uStationWind62:{value:null},uStationWindWidth62:{value:1},uStationWindValid62:{value:0}};
  const r={mesh,time,uniforms,originalMaterial:mesh.material,originalDepth:mesh.customDepthMaterial,originalRender:mesh.onBeforeRender,originalShadow:mesh.onBeforeShadow,result:null,stamp:null,error:null,observedGeometry:null,observedRenderer:null};
  try{r.material=cloneConsumer(r.originalMaterial,uniforms,renderer);r.depth=cloneConsumer(r.originalDepth,uniforms,renderer);}
  catch(error){r.material?.dispose();r.depth?.dispose();throw error;}
  r.materialSource=materialStamp(r.originalMaterial);r.depthSource=materialStamp(r.originalDepth);
  const update=(args,shadow)=>{const matching=args[0]===this.renderer&&args[shadow?4:3]===mesh.geometry&&args[shadow?5:4]===(shadow?r.depth:r.material);if(matching){r.observedGeometry=mesh.geometry;r.observedRenderer=args[0];}const valid=matching&&this.valid(r);uniforms.uStationWindValid62.value=valid?1:0;this.stats[valid?'validDraws':'fallbackDraws']++;};
  r.render=function(...args){r.originalRender.apply(this,args);update(args,false);};r.shadow=function(...args){r.originalShadow.apply(this,args);update(args,true);};
  // One original-formula draw must register this geometry with Three before
  // a bake borrows its VBOs. Retiring before that draw allocates no GPU table.
  r.onDispose=()=>this.unregister(mesh);mesh.addEventListener('dispose',r.onDispose);mesh.material=r.material;mesh.customDepthMaterial=r.depth;mesh.onBeforeRender=r.render;mesh.onBeforeShadow=r.shadow;this.records.set(mesh,r);return r;
 }
 unregister(mesh){const r=this.records.get(mesh);if(!r)return;r.uniforms.uStationWindValid62.value=0;mesh.removeEventListener('dispose',r.onDispose);if(mesh.material===r.material)mesh.material=r.originalMaterial;if(mesh.customDepthMaterial===r.depth)mesh.customDepthMaterial=r.originalDepth;if(mesh.onBeforeRender===r.render)mesh.onBeforeRender=r.originalRender;if(mesh.onBeforeShadow===r.shadow)mesh.onBeforeShadow=r.originalShadow;r.result?.dispose();r.material.dispose();r.depth.dispose();this.records.delete(mesh);}
 clear(){this.failures.clear();for(const mesh of [...this.records.keys()])this.unregister(mesh);this.refresh();}
 prepare(renderer,runtime,camera,time){
  this.stats.lastBakeCalls=this.stats.lastBakeStations=this.stats.lastSubmissionMs=0;
  if(!this.enabled||this.closed||this.contextLost)return this.stats;
  if(!time||!Number.isFinite(time.value))throw Error('A finite shared uWindTime uniform is required');
  this.bind(renderer);const meshes=selectStationMeshes62(runtime,camera,this.maxBatches),wanted=new Set(meshes),start=performance.now();for(const mesh of this.failures.keys())if(!wanted.has(mesh))this.failures.delete(mesh);
  for(const [mesh,r]of this.records)if(!wanted.has(mesh)||mesh.material!==r.material||mesh.customDepthMaterial!==r.depth||r.time!==time||!same(r.materialSource,materialStamp(r.originalMaterial))||!same(r.depthSource,materialStamp(r.originalDepth)))this.unregister(mesh);
  for(const mesh of meshes){if(this.failures.has(mesh))continue;let r=this.records.get(mesh);
   try{
    if(!r)r=this.register(mesh,time,renderer);
    r.uniforms.uStationWindValid62.value=0;if(r.error||r.observedGeometry!==mesh.geometry||r.observedRenderer!==renderer)continue;
    const stamp=stationWindStamp62(mesh,time);
    if(same(stamp,r.stamp)&&r.result){r.uniforms.uStationWindValid62.value=1;this.stats.cacheHits++;continue;}
    // A root force/version change needs a fresh evaluation, not reallocation.
    const sources=[mesh.geometry,mesh.count,...INPUTS.flatMap(n=>{const a=mesh.geometry.getAttribute(n);return[a,a.data,a.data?.array,a.array,a.offset,a.itemSize,a.normalized,a.data?.stride,a.data?.meshPerAttribute];})];
    if(!r.result||!same(sources,r.sources)){r.result?.dispose();r.result=null;r.sources=sources;r.result=this.createBake(renderer,mesh);r.uniforms.uStationWind62.value=r.result.target.texture;r.uniforms.uStationWindWidth62.value=r.result.layout.width;}
    r.result.update(f(time.value));r.stamp=stamp;r.uniforms.uStationWindValid62.value=1;this.stats.bakes++;this.stats.lastBakeCalls++;this.stats.lastBakeStations+=mesh.count;
   }catch(error){if(!r)this.failures.set(mesh,String(error.message||error));if(r){r.stamp=null;r.uniforms.uStationWindValid62.value=0;r.error=String(error.message||error);}const message=mesh.name+': '+String(error.message||error);if(!this.stats.errors.includes(message))this.stats.errors.push(message);}
  }
  this.stats.lastSubmissionMs=performance.now()-start;this.stats.submissionMs+=this.stats.lastSubmissionMs;this.refresh();return this.stats;
 }
 refresh(){const rs=[...this.records.values()];Object.assign(this.stats,{enabled:this.enabled,awaitingFirstDraw:rs.filter(r=>r.observedGeometry!==r.mesh.geometry||r.observedRenderer!==this.renderer).length,selected:rs.map(r=>({id:r.mesh.id,name:r.mesh.name,stations:r.mesh.count,valid:this.valid(r),error:r.error})),stations:rs.reduce((n,r)=>n+r.mesh.count,0),attachmentBytes:rs.reduce((n,r)=>n+(r.result?.layout.attachmentBytes||0),0),logicalBytes:rs.reduce((n,r)=>n+(r.result?.layout.logicalBytes||0),0)});}
 verifyGPU(renderer,{maxStations=512}={}){if(renderer!==this.renderer)throw Error('Prepare before GPU verification');const result=[];for(const r of this.records.values()){if(!this.valid(r))throw Error('Stale wind cache before GPU oracle');result.push(verifyStationWindGPU62(renderer,r,{maxStations}));}this.stats.verifiedGPU={results:result,bitwiseEqual:result.length>0&&result.every(r=>r.bitMismatches===0),note:'Offset and bent normal readback only; full-world colour/depth image and GPU timing still require browser acceptance.'};return this.stats.verifiedGPU;}
 dispose(){if(this.closed)return;this.closed=true;this.enabled=false;this.clear();this.renderer?.domElement?.removeEventListener('webglcontextlost',this.onLost);this.renderer?.domElement?.removeEventListener('webglcontextrestored',this.onRestore);this.renderer=null;}
}

// Explicit diagnostic only. It uses the real compiled source's station and
// ecoBend functions, all 15 distinct vertex heights/normals, and the actual GPU
// coefficients. No readback or reference target exists during ordinary frames.
export function verifyStationWindGPU62(renderer,r,{maxStations=512}={}){
 const gl=renderer.getContext();if(gl.getParameter(gl.MAX_DRAW_BUFFERS)<2)throw Error('GPU oracle requires two RGBA32F attachments');
 const source=compileSource(r.originalMaterial,renderer),v=source.vertexShader,stations=Math.min(r.mesh.count,maxStations),vertices=stations*15,width=1024,height=Math.ceil(vertices/width);
 if(!Number.isInteger(stations)||stations<1||height>renderer.capabilities.maxTextureSize)throw Error('Invalid GPU oracle sample size');
 const geometry=new THREE.InstancedBufferGeometry(),borrowed=[];geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(45),3));
 for(const [name,a]of Object.entries(r.mesh.geometry.attributes))if(name.startsWith('aNeedle')||name==='aSprayLod'||name.startsWith('aTreeRoot')){geometry.setAttribute(name,a);borrowed.push(name);}geometry.instanceCount=stations;
 const uniforms={...source.uniforms,...r.uniforms,uStationWindValid62:{value:0},uSize:{value:new THREE.Vector2(width,height)},uOracleRoot:{value:new THREE.Vector3().fromArray(r.mesh.instanceMatrix.array,12)}};
 const shader=`precision highp float;precision highp int;
#define ECO_TREE
#define ECO_ROOT_WIND
const float uPlantMode=12.0;
in vec4 aNeedleFrame0,aNeedleFrame1,aNeedleFrame2,aNeedleFrame3,aNeedleVariation0,aNeedleVariation1,aNeedleVariation2,aTreeRootWind,aSprayLod;in float aTreeRootEddy;
uniform float uWindTime;uniform sampler2D uBranchVariation;uniform int uBranchOriginalBrushes;uniform ivec2 uSize;uniform vec3 uOracleRoot;
vec2 vNeedleSection;flat out vec4 vOffset;flat out vec4 vNormal;
${CACHE_DECLARATIONS}
${extractFunction(v,'readNeedleStation')}
${extractFunction(v,'ecoHash')}
${extractFunction(v,'ecoBend')}
vec3 ecoRoot(){return uOracleRoot;}
void main(){vec3 brushPosition,objectNormal,ecoWeights;float ao;vec2 uv;readNeedleStation(brushPosition,objectNormal,ecoWeights,ao,uv);
${CACHE_EVAL}
vec2 ecoSlope=ecoOffset*2./max(.15,brushPosition.y);
objectNormal=normalize(vec3(objectNormal.x,objectNormal.y-dot(ecoSlope,objectNormal.xz),objectNormal.z));
vOffset=vec4(ecoOffset,brushPosition.y,1.);vNormal=vec4(objectNormal,1.);int i=gl_InstanceID*15+gl_VertexID;ivec2 pixel=ivec2(i%uSize.x,i/uSize.x);gl_Position=vec4((vec2(pixel)+.5)/vec2(uSize)*2.-1.,0.,1.);gl_PointSize=1.;}`;
 const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:shader,fragmentShader:'precision highp float;flat in vec4 vOffset;flat in vec4 vNormal;layout(location=0)out vec4 outOffset;layout(location=1)out vec4 outNormal;void main(){outOffset=vOffset;outNormal=vNormal;}',uniforms,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
 const target=floatTarget(width,height,2),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1),points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);const outputs=[];
 try{withStationRenderState62(renderer,()=>{for(const active of [0,1]){uniforms.uStationWindValid62.value=active;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.render(scene,camera);const pair=[];for(let i=0;i<2;i++){const data=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,data,0,i);pair.push(data);}outputs.push(pair);}});
  for(const pair of outputs)for(const data of pair)for(let i=0;i<vertices;i++)if(data[i*4+3]!==1)throw Error('GPU oracle did not write every vertex: '+i);
  let bitMismatches=0,maxAbs=0,nonFinite=0;const mismatches=[];for(let attachment=0;attachment<2;attachment++){const a=outputs[0][attachment],b=outputs[1][attachment],ab=new Uint32Array(a.buffer),bb=new Uint32Array(b.buffer);for(let i=0;i<vertices*4;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))nonFinite++;if(ab[i]!==bb[i]){bitMismatches++;maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));if(mismatches.length<8)mismatches.push({attachment,vertex:Math.floor(i/4),component:i%4,original:a[i],cached:b[i]});}}}
  if(nonFinite)throw Error('Nonfinite GPU oracle result');return{name:r.mesh.name,stations,vertices,bitMismatches,maxAbs,firstMismatches:mismatches};
 }finally{for(const name of borrowed)geometry.deleteAttribute(name);geometry.dispose();material.dispose();target.dispose();scene.clear();}
}
