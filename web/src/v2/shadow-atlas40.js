import * as T from 'three';

export function nearShadowAtlas40Capability(renderer,{requested=new URLSearchParams(globalThis.location?.search||'').get('nearShadowAtlas40')==='1',mode,cloudArray=false}={}){
 return requested===true&&['micro','contact'].includes(mode)&&cloudArray===true&&renderer.shadowMap.type===T.PCFShadowMap&&renderer.capabilities.maxTextureSize>=(mode==='contact'?8192:12288)&&renderer.capabilities.maxTextures>=16;
}

// Review-only five-CSM owner. No renderer/library patch and no default install.
// Each original light retains its own update cadence, camera, frustum and bias.
export class NearShadowAtlas40 {
 constructor(renderer,csm,{enabled=false}={}){
  this.shaderKey='-near-shadow-atlas40-'+T.MathUtils.generateUUID();this.tiles=csm.lights.length-2;this.enabled=false;this.closed=false;this.depthMaterials=new Map();this.depthOrigin={value:new T.Vector2()};this.csm=csm;this.renderer=renderer;this.records=[];
  this.uniforms={uNearShadowAtlas40:{value:null},uFarShadowA40:{value:null},uFarShadowB40:{value:null}};
  this.stats={enabled:false,cascades:0,samplers:0,width:0,height:0,depthBytes:0,colourBytes:0,reason:enabled?'pending':'default-off'};
  if(!enabled)return;
  if(renderer.shadowMap.type!==T.PCFShadowMap||renderer.capabilities.maxTextureSize<4096*this.tiles||renderer.capabilities.maxTextures<16||![4,5].includes(csm.lights.length)||csm.lights.some((l,i)=>!l.isDirectionalLight||l.shadow.mapSize.x!==(i<this.tiles?4096:2048)||l.shadow.mapSize.y!==l.shadow.mapSize.x))throw Error('Near shadow atlas requires four/five PCF CSM maps, 4096 near and 2048 far, native '+4096*this.tiles+' texture support');
  const reverse=renderer.capabilities.reversedDepthBuffer,depth=new T.DepthTexture(4096*this.tiles,4096,T.UnsignedIntType);depth.format=T.DepthFormat;depth.compareFunction=reverse?T.GreaterEqualCompare:T.LessEqualCompare;depth.minFilter=depth.magFilter=T.LinearFilter;depth.name='near-csm-atlas40-depth';
  this.target=new T.WebGLRenderTarget(4096*this.tiles,4096,{depthTexture:depth,depthBuffer:true,stencilBuffer:false});this.target.texture.name='near-csm-atlas40-colour';this.target.scissorTest=true;
  this.uniforms.uNearShadowAtlas40.value=depth;
  for(const [i,l]of csm.lights.entries()){
   const s=l.shadow,record={s,map:s.map,frame:s._frameExtents.clone(),viewports:s._viewports,update:s.updateMatrices};this.records.push(record);
   if(i<this.tiles){s.camera._reversedDepth=reverse;s.camera.updateProjectionMatrix();s.map=this.target;s._frameExtents.set(this.tiles,1);s._viewports=[new T.Vector4(i,0,1,1)];}
   const owner=this;
   record.hook=function(...args){record.update.apply(this,args);if(i<owner.tiles){owner.assertCompatible();owner.target.scissor.set(i*4096,0,4096,4096);owner.target.scissorTest=true;}owner.refreshUniforms();};
   s.updateMatrices=record.hook;s.needsUpdate=true;
  }
  this.enabled=true;this.installShadowScope();this.stats={enabled:true,cascades:csm.lights.length,samplers:3,width:4096*this.tiles,height:4096,depthBytes:this.tiles*4096*4096*4,colourBytes:this.tiles*4096*4096*4,reason:'review-only'};
 }
 installShadowScope(){
  const owner=this,shadowMap=this.renderer.shadowMap,previous=shadowMap.render;
  if(typeof previous!=='function')return; // CPU ownership fixtures have no renderer.
  this.originalShadowRender=previous;
  this.shadowRender=function(...args){
   owner.assertCompatible();const renderer=owner.renderer,direct=renderer.renderBufferDirect;
   const wrapped=function(camera,scene,geometry,material,...tail){
    const index=owner.csm.lights.findIndex(l=>l.shadow.camera===camera);
    owner.depthOrigin.value.set(index>=0&&index<owner.tiles?index*4096:0,0);
    owner.installDepthMaterial(material);
    return direct.call(this,camera,scene,geometry,material,...tail);
   };
   renderer.renderBufferDirect=wrapped;
   try{return previous.apply(this,args);}finally{if(renderer.renderBufferDirect===wrapped)renderer.renderBufferDirect=direct;owner.depthOrigin.value.set(0,0);}
  };
  shadowMap.render=this.shadowRender;
 }
 installDepthMaterial(material){
  if(!this.enabled)return false;
  if(!material?.isMeshDepthMaterial&&!material?.isMeshDistanceMaterial)throw Error('Atlas40 encountered unsupported shadow caster material');
  if(this.depthMaterials.has(material))return;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey,cacheKey=key.call(material),uniform=this.depthOrigin;
  const hook=function(shader,...args){previous.call(this,shader,...args);installAtlasDepthCoordinates40(shader,uniform);};
  const shaderKey=this.shaderKey,programKey=()=>cacheKey+shaderKey+'-local-depth-pixels';
  const retire=()=>{if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===programKey)material.customProgramCacheKey=key;material.removeEventListener('dispose',retire);this.depthMaterials.delete(material);};
  this.depthMaterials.set(material,{previous,key,hook,programKey,retire});material.addEventListener('dispose',retire);
  material.onBeforeCompile=hook;material.customProgramCacheKey=programKey;material.needsUpdate=true;
 }
 refreshUniforms(){if(!this.enabled)return;this.uniforms.uFarShadowA40.value=this.csm.lights[this.tiles].shadow.map?.depthTexture||null;this.uniforms.uFarShadowB40.value=this.csm.lights[this.tiles+1].shadow.map?.depthTexture||null;}
 assertCompatible(){if(!this.enabled)return;if(this.closed||this.renderer.shadowMap.type!==T.PCFShadowMap||this.csm.lights.slice(0,this.tiles).some(l=>l.shadow.map!==this.target||l.shadow.mapSize.x!==4096||l.shadow.mapSize.y!==4096))throw Error('Near shadow atlas contract changed; reload the default scene before rendering');}
 dispose(){if(this.closed)return;this.closed=true;if(this.renderer.shadowMap.render===this.shadowRender)this.renderer.shadowMap.render=this.originalShadowRender;for(const [m,r]of this.depthMaterials){r.retire();m.needsUpdate=true;}this.depthMaterials.clear();for(const [i,r]of this.records.entries()){if(r.s.updateMatrices===r.hook)r.s.updateMatrices=r.update;if(i<this.tiles){if(r.s.map===this.target)r.s.map=r.map;r.s._frameExtents.copy(r.frame);r.s._viewports=r.viewports;}r.s.needsUpdate=true;}if(this.target){this.target.depthTexture.dispose();this.target.depthTexture=null;this.target.dispose();}this.target=null;this.enabled=false;this.stats.enabled=false;for(const u of Object.values(this.uniforms))u.value=null;}
}

const args='directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ]';
const standardCall=`getShadow( directionalShadowMap[ i ], ${args} )`;
const footprintCall=`worldClosestReceiverShadow( directionalShadowMap[ i ], ${args}, UNROLLED_LOOP_INDEX )`;
export function installNearShadowAtlas40(shader,owner){
 if(!owner?.enabled)return false;if(shader.uniforms.uNearShadowAtlas40)return false;
 if(shader.uniforms.uCloseSolarDepth)throw Error('Atlas40 does not accept the independent solar-depth experiment');
 const guard='defined(USE_SHADOWMAP) && defined(SHADOWMAP_TYPE_PCF) && NUM_DIR_LIGHT_SHADOWS == '+owner.csm.lights.length;
 let source=shader.fragmentShader;
 if(!source.includes('#include <shadowmap_pars_fragment>'))throw Error('Atlas40 requires original Three shadow declarations');
 // Copy the installed PCF function verbatim, changing only the tap address.
 const chunk=T.ShaderChunk.shadowmap_pars_fragment,begin=chunk.indexOf('float getShadow( sampler2DShadow'),end=chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',begin);
 if(begin<0||end<0)throw Error('Three PCF implementation changed');
 let pcf=chunk.slice(begin,end).trim();pcf=pcf.replace('float getShadow( sampler2DShadow shadowMap,','float worldAtlasPCF40( int layer,');
 const tap=/texture\( shadowMap, vec3\( shadowCoord.xy \+ vogelDiskSample\( ([0-4]), 5, phi \) \* radius, shadowCoord.z \) \)/g;let taps=0;
 pcf=pcf.replace(tap,(_,i)=>{taps++;return `worldAtlasTap40(layer,vec3(shadowCoord.xy+vogelDiskSample(${i},5,phi)*radius,shadowCoord.z),shadowMapSize)`;});if(taps!==5)throw Error('Atlas40 requires the exact five-tap native PCF');
 const helper=`
#if ${guard}
uniform sampler2DShadow uNearShadowAtlas40,uFarShadowA40,uFarShadowB40;
float worldAtlasTap40(int layer,vec3 p,vec2 size){
 vec2 uv=clamp(p.xy,.5/size,vec2(1.)-.5/size);
 return texture(uNearShadowAtlas40,vec3((uv.x+float(layer))/${owner.tiles}.,uv.y,p.z));
}
${pcf}
float worldAtlasShadow40(int index,vec2 size,float intensity,float bias,float radius,vec4 coord){
 if(index<${owner.tiles})return worldAtlasPCF40(index,size,intensity,bias,radius,coord);
 if(index==${owner.tiles})return getShadow(uFarShadowA40,size,intensity,bias,radius,coord);
 return getShadow(uFarShadowB40,size,intensity,bias,radius,coord);
}
#endif
`;
 const hadFootprint=!!shader.uniforms.uCloseShadowFootprint;
 const footprint=hadFootprint?`
#if ${guard}
float worldAtlasPixel40(float intensity,float bias,vec3 p,vec3 dx,vec3 dy){
 p.z+=bias;bool inside=p.x>=0.&&p.x<=1.&&p.y>=0.&&p.y<=1.&&p.z<=1.;float visibility=1.;
 if(inside)visibility=(worldAtlasTap40(0,p-dx*.25-dy*.25,vec2(4096.))+worldAtlasTap40(0,p+dx*.25-dy*.25,vec2(4096.))+worldAtlasTap40(0,p-dx*.25+dy*.25,vec2(4096.))+worldAtlasTap40(0,p+dx*.25+dy*.25,vec2(4096.)))*.25;
 return mix(1.,visibility,intensity);
}
#define worldAtlasClosest40(index,size,intensity,bias,radius,coord) ((index==0&&uCloseShadowFootprint>.5)?worldAtlasPixel40(intensity,bias,worldReceiverCoord,worldReceiverDx,worldReceiverDy):worldAtlasShadow40(index,size,intensity,bias,radius,coord))
#endif
`:'';
 let declarations=chunk.replace(/uniform sampler2D(?:Shadow)? directionalShadowMap\[ NUM_DIR_LIGHT_SHADOWS \];/g,'// directional maps are the three explicit atlas/far samplers');
 source=source.replace('#include <shadowmap_pars_fragment>',declarations+helper);
 // The footprint uniform is declared after shadow pars; append its adapter
 // immediately before main so it is in scope, while derivatives remain in main.
 if(hadFootprint)source=source.replace(/void\s+main\s*\(\s*\)\s*\{/,m=>footprint+m);
 const calls=(source.split(standardCall).length-1)+(source.split(footprintCall).length-1);
 if(calls<2)throw Error('Atlas40 requires installed CSM fade and nonfade calls');
 source=source.split(standardCall).join(`worldAtlasShadow40( UNROLLED_LOOP_INDEX, ${args} )`).split(footprintCall).join(`worldAtlasClosest40( UNROLLED_LOOP_INDEX, ${args} )`);
 // These supported world materials do not use ShadowMaterial's mask chunk.
 // Do not leave a hidden sampler array in any future unsupported material.
 if(source.includes('#include <shadowmask_pars_fragment>'))throw Error('Atlas40 does not accept ShadowMaterial');
 if(/directionalShadowMap\s*\[/.test(source))throw Error('Atlas40 left an original directional sampler reference');
 shader.fragmentShader=source;Object.assign(shader.uniforms,owner.uniforms);return true;
}

// Expand native chunks too: alpha/dither helper code can live inside includes.
// This hook is installed only on actual depth/distance draw materials, never
// on a main/reflection colour material. z/w retain original depth semantics.
export function installAtlasDepthCoordinates40(shader,uniform){
 shader.uniforms.uShadowAtlasOrigin40=uniform;
 if(shader.fragmentShader.includes('// ATLAS40_LOCAL_CASTER_PIXELS'))return false;
 const expand=source=>source.replace(/#include <([\w\d_]+)>/g,(_all,name)=>{if(T.ShaderChunk[name]===undefined)throw Error('Unknown shadow shader include '+name);return expand(T.ShaderChunk[name]);});
 const source=expand(shader.fragmentShader).replace(/\bgl_FragCoord\b/g,'atlasCasterCoord40()');
 shader.fragmentShader=`// ATLAS40_LOCAL_CASTER_PIXELS
uniform vec2 uShadowAtlasOrigin40;
vec4 atlasCasterCoord40(){return vec4(gl_FragCoord.xy-uShadowAtlasOrigin40,gl_FragCoord.zw);}
`+source;return true;
}
