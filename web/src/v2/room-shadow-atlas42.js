import * as T from 'three';

const SIZE=512, GRID=3, COUNT=9;
// Scoped to the representative three-room building. Original spot cameras,
// native PCF taps and each light's static update owner remain authoritative.
export class RoomShadowAtlas42 {
 constructor(renderer,lights,{enabled=false}={}){
  this.renderer=renderer;this.lights=[...lights];this.enabled=enabled;this.active=false;this.closed=false;this.records=[];this.materials=new Map();this.depthMaterials=new Map();this.origin={value:new T.Vector2()};
  this.key='room-atlas42-'+T.MathUtils.generateUUID();this.uniforms={uRoomShadowAtlas42:{value:null},uRoomShadowSlots42:{value:Float32Array.from({length:COUNT},(_,i)=>i)},uRoomSpotBoundsValid42:{value:0},uRoomSpotBoundsMin42:{value:new T.Vector3()},uRoomSpotBoundsMax42:{value:new T.Vector3()}};
  this.stats={enabled,active:false,samplers:0,width:0,height:0,shadowLights:0,reason:enabled?'inactive':'default-off'};
  if(enabled)this.validateLights();
 }
 validateLights(){
  if(this.lights.length!==COUNT||new Set(this.lights).size!==COUNT||this.renderer.shadowMap.type!==T.PCFShadowMap||this.renderer.capabilities.maxTextureSize<SIZE*GRID)throw Error('Room atlas requires nine unique 512 PCF spot lights and native 1536 texture support');
  for(const l of this.lights)if(!l.isSpotLight||l.map||l.shadow.mapSize.x!==SIZE||l.shadow.mapSize.y!==SIZE||l.shadow.getViewportCount()!==1)throw Error('Room atlas requires original untextured 512 spot projections');
 }
 setActive(value){
  if(this.closed)throw Error('Room atlas disposed');value=Boolean(value)&&this.enabled;if(value===this.active)return;
  if(value){
   this.validateLights();const reverse=this.renderer.capabilities.reversedDepthBuffer;
   const depth=new T.DepthTexture(SIZE*GRID,SIZE*GRID,T.UnsignedIntType);depth.format=T.DepthFormat;depth.compareFunction=reverse?T.GreaterEqualCompare:T.LessEqualCompare;depth.minFilter=depth.magFilter=T.LinearFilter;
   this.target=new T.WebGLRenderTarget(SIZE*GRID,SIZE*GRID,{depthTexture:depth,depthBuffer:true,stencilBuffer:false});this.target.texture.name='guest-room-atlas42';this.target.scissorTest=true;this.uniforms.uRoomShadowAtlas42.value=depth;
   for(const [i,l]of this.lights.entries()){
    const s=l.shadow,r={s,map:s.map,frame:s._frameExtents.clone(),viewports:s._viewports,update:s.updateMatrices,reverse:s.camera._reversedDepth};this.records.push(r);
    s.map=this.target;s._frameExtents.set(GRID,GRID);s._viewports=[new T.Vector4(i%GRID,Math.floor(i/GRID),1,1)];s.camera._reversedDepth=reverse;s.camera.updateProjectionMatrix();
    const owner=this;r.hook=function(...args){r.update.apply(this,args);owner.prepare();owner.target.scissor.set((i%GRID)*SIZE,Math.floor(i/GRID)*SIZE,SIZE,SIZE);owner.target.scissorTest=true;};s.updateMatrices=r.hook;s.needsUpdate=true;
   }
   this.active=true;this.refreshBounds();this.installScope();
  }else this.release();
  for(const m of this.materials.keys())m.needsUpdate=true;
  Object.assign(this.stats,{active:this.active,samplers:this.active?1:0,width:this.active?SIZE*GRID:0,height:this.active?SIZE*GRID:0,reason:this.active?'candidate':'inactive'});
 }
 prepare(scene=null,camera=null){if(!this.active)return false;this.validateLights();if(this.records.some(r=>r.s.map!==this.target||r.s.updateMatrices!==r.hook))throw Error('Room atlas shadow ownership changed');if(scene){const spots=[];scene.traverseVisible(l=>{if(l.isSpotLight&&l.castShadow&&(!camera||l.layers.test(camera.layers)))spots.push(l);});this.mapSlots(spots);this.stats.activeOwnedLights=spots.length;this.refreshBounds(camera);}return true;}
 mapSlots(spots){if(spots.length>COUNT||spots.some(l=>!this.lights.includes(l)||l.map))throw Error('Room atlas cannot replace foreign spot shadow samplers');spots.forEach((l,i)=>this.uniforms.uRoomShadowSlots42.value[i]=this.lights.indexOf(l));this.stats.shadowLights=spots.length;}
 refreshBounds(camera=null){
  const u=this.uniforms;u.uRoomSpotBoundsValid42.value=0;
  const lo=u.uRoomSpotBoundsMin42.value,hi=u.uRoomSpotBoundsMax42.value;lo.set(Infinity,Infinity,Infinity);hi.set(-Infinity,-Infinity,-Infinity);
  let magnitude=1;
  if(camera){camera.updateWorldMatrix(true,false);const e=camera.matrixWorld.elements;magnitude=Math.max(magnitude,Math.abs(e[12]),Math.abs(e[13]),Math.abs(e[14]));}
  for(const light of this.lights){
   // Keep the native finite distance support; zero/negative/infinite distance
   // means the original full loop must run everywhere.
   const d=light.distance;if(!(Number.isFinite(d)&&d>0))return false;
   light.updateWorldMatrix(true,false);const e=light.matrixWorld.elements,x=e[12],y=e[13],z=e[14];if(![x,y,z].every(Number.isFinite))return false;
   lo.set(Math.min(lo.x,x-d),Math.min(lo.y,y-d),Math.min(lo.z,z-d));hi.set(Math.max(hi.x,x+d),Math.max(hi.y,y+d),Math.max(hi.z,z+d));magnitude=Math.max(magnitude,Math.abs(x)+d,Math.abs(y)+d,Math.abs(z)+d);
  }
  // Expand, never shrink: cover Float32 world/view subtraction and interpolation
  // rounding at the finite cutoff. The exact native loop remains inside.
  const guard=Math.max(.001,128*2**-23*magnitude);lo.addScalar(-guard);hi.addScalar(guard);u.uRoomSpotBoundsValid42.value=1;this.stats.receiverBoundsGuard=guard;return true;
 }
 installScope(){
  const owner=this,shadow=this.renderer.shadowMap,previous=shadow.render;this.originalRender=previous;
  if(typeof previous!=='function')return;
  this.shadowRender=function(lights,...args){
   owner.prepare();owner.refreshBounds(args[1]);const spots=lights.filter(l=>l.isSpotLight&&l.castShadow);
   owner.mapSlots(spots);owner.stats.lastShadowPassLights=spots.length;
   // WebGLLights stable-sorts untextured shadow spots equally, preserving the
   // renderer's scene traversal order. Registry order need not match that order.

   const direct=owner.renderer.renderBufferDirect;
   const wrapped=function(camera,scene,geometry,material,...tail){
    const i=owner.lights.findIndex(l=>l.shadow.camera===camera);owner.origin.value.set(i<0?0:(i%GRID)*SIZE,i<0?0:Math.floor(i/GRID)*SIZE);
    owner.installDepthMaterial(material);return direct.call(this,camera,scene,geometry,material,...tail);
   };
   owner.renderer.renderBufferDirect=wrapped;
   try{return previous.call(this,lights,...args);}finally{if(owner.renderer.renderBufferDirect===wrapped)owner.renderer.renderBufferDirect=direct;owner.origin.value.set(0,0);}
  };shadow.render=this.shadowRender;
 }
 installDepthMaterial(material){
  if(this.depthMaterials.has(material))return;
  if(!material?.isMeshDepthMaterial&&!material?.isMeshDistanceMaterial)throw Error('Room atlas encountered unsupported depth material');
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey,owner=this,cache=key.call(material);
  // Same local-pixel convention as atlas40, but a separate uniform. Nested
  // owners contribute zero origin on one another's cameras.
  const hook=function(shader,...args){previous.call(this,shader,...args);installRoomAtlasDepth42(shader,owner.origin);};
  const programKey=()=>cache+'-'+this.key+'-depth';
  const retire=()=>{if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===programKey)material.customProgramCacheKey=key;material.removeEventListener('dispose',retire);this.depthMaterials.delete(material);};
  this.depthMaterials.set(material,{retire});material.addEventListener('dispose',retire);material.onBeforeCompile=hook;material.customProgramCacheKey=programKey;material.needsUpdate=true;
 }
 installMaterial(material){
  if(!this.enabled||this.closed||this.materials.has(material))return false;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey,owner=this;
  const hook=function(shader,...args){previous.call(this,shader,...args);if(owner.active)installRoomShadowAtlas42(shader,owner);};
  const programKey=function(){return key.call(this)+'-'+owner.key+(owner.active?'-active':'-inactive');};
  const retire=()=>{if(material.onBeforeCompile===hook)material.onBeforeCompile=previous;if(material.customProgramCacheKey===programKey)material.customProgramCacheKey=key;material.removeEventListener('dispose',retire);this.materials.delete(material);};
  this.materials.set(material,{retire});material.addEventListener('dispose',retire);material.onBeforeCompile=hook;material.customProgramCacheKey=programKey;material.needsUpdate=true;return true;
 }
 release(){
  if(this.renderer.shadowMap.render===this.shadowRender)this.renderer.shadowMap.render=this.originalRender;
  for(const [m,r]of this.depthMaterials){r.retire();m.needsUpdate=true;}this.depthMaterials.clear();
  for(const r of this.records){if(r.s.map===this.target)r.s.map=r.map;if(r.s.updateMatrices===r.hook)r.s.updateMatrices=r.update;r.s._frameExtents.copy(r.frame);r.s._viewports=r.viewports;r.s.camera._reversedDepth=r.reverse;r.s.camera.updateProjectionMatrix();r.s.needsUpdate=true;}this.records=[];
  if(this.target){this.target.depthTexture.dispose();this.target.depthTexture=null;this.target.dispose();}this.target=null;this.uniforms.uRoomShadowAtlas42.value=null;this.uniforms.uRoomSpotBoundsValid42.value=0;this.active=false;
 }
 dispose(){if(this.closed)return;this.release();for(const [m,r]of this.materials){r.retire();m.needsUpdate=true;}this.materials.clear();this.closed=true;this.stats.active=false;}
}

export function installRoomShadowAtlas42(shader,owner){
 if(!owner?.active||shader.uniforms.uRoomShadowAtlas42)return false;
 let source=shader.fragmentShader;const chunk=T.ShaderChunk.shadowmap_pars_fragment;
 if(source.includes('#include <shadowmap_pars_fragment>'))source=source.replace('#include <shadowmap_pars_fragment>',chunk);
 if(!/uniform sampler2DShadow spotShadowMap\[ NUM_SPOT_LIGHT_SHADOWS \];/.test(source))throw Error('Room atlas requires native PCF spot declarations');
 source=source.replace(/uniform sampler2D(?:Shadow)? spotShadowMap\[ NUM_SPOT_LIGHT_SHADOWS \];/g,'// room spots share one atlas sampler');
 const begin=chunk.indexOf('float getShadow( sampler2DShadow'),end=chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',begin);
 if(begin<0||end<0)throw Error('Native PCF implementation changed');
 let pcf=chunk.slice(begin,end).trim().replace('float getShadow( sampler2DShadow shadowMap,','float roomAtlasPCF42( int index,');let taps=0;
 pcf=pcf.replace(/texture\( shadowMap, vec3\( shadowCoord.xy \+ vogelDiskSample\( ([0-4]), 5, phi \) \* radius, shadowCoord.z \) \)/g,(_,i)=>{taps++;return `roomAtlasTap42(index,vec3(shadowCoord.xy+vogelDiskSample(${i},5,phi)*radius,shadowCoord.z),shadowMapSize)`;});if(taps!==5)throw Error('Room atlas requires exact native five-tap PCF');
 const helper=`\n#if defined(USE_SHADOWMAP) && defined(SHADOWMAP_TYPE_PCF) && NUM_SPOT_LIGHT_SHADOWS > 0\nuniform sampler2DShadow uRoomShadowAtlas42;\nuniform float uRoomShadowSlots42[9];\nfloat roomAtlasTap42(int index,vec3 p,vec2 size){float slot=uRoomShadowSlots42[index];vec2 tile=vec2(mod(slot,3.),floor(slot/3.));vec2 uv=clamp(p.xy,.5/size,vec2(1.)-.5/size);return texture(uRoomShadowAtlas42,vec3((uv+tile)/3.,p.z));}\n${pcf}\n#endif\n`;
 for(const name of ['lights_fragment_begin','shadowmask_pars_fragment'])source=source.replace(`#include <${name}>`,T.ShaderChunk[name]);
 source=installRoomSpotBounds42(source);
 source=source.replace(/getShadow\( spotShadowMap\[ i \],/g,'roomAtlasPCF42( UNROLLED_LOOP_INDEX,');
 if(/spotShadowMap\s*\[/.test(source))throw Error('Room atlas left native spot sampler references');
 if(!/void\s+main\s*\(/.test(source))throw Error('Room atlas needs a complete colour shader');
 const prototype='\n#if defined(USE_SHADOWMAP) && defined(SHADOWMAP_TYPE_PCF) && NUM_SPOT_LIGHT_SHADOWS > 0\nfloat roomAtlasPCF42(int index,vec2 size,float intensity,float bias,float radius,vec4 coord);\n#endif\n';
 shader.fragmentShader=prototype+source.replace(/void\s+main\s*\(/,helper+'void main(');Object.assign(shader.uniforms,owner.uniforms);return true;
}

export function installRoomAtlasDepth42(shader,uniform){
 if(shader.uniforms.uRoomAtlasOrigin42)return false;shader.uniforms.uRoomAtlasOrigin42=uniform;
 const expand=source=>source.replace(/#include <([\w\d_]+)>/g,(_all,name)=>{if(T.ShaderChunk[name]===undefined)throw Error('Unknown shadow shader include '+name);return expand(T.ShaderChunk[name]);});
 const source=expand(shader.fragmentShader).replace(/\bgl_FragCoord\b/g,'roomAtlasCasterCoord42()');
 shader.fragmentShader='uniform vec2 uRoomAtlasOrigin42;\nvec4 roomAtlasCasterCoord42(){return vec4(gl_FragCoord.xy-uRoomAtlasOrigin42,gl_FragCoord.zw); }\n'+source;return true;
}

// No vertex shortcut: a triangle may cross the light support despite all its
// vertices lying outside the box. Preserve original projected coordinates.
export function installRoomSpotBounds42(source){
 if(!/varying\s+vec3\s+vCloudWorld\s*;/.test(source))return source;
 const loop='for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ )',at=source.indexOf(loop);if(at<0)return source;
 const begin=source.lastIndexOf('#pragma unroll_loop_start',at),finish=source.indexOf('#pragma unroll_loop_end',at);
 if(begin<0||finish<0)throw Error('Room atlas native spot loop changed');
 const end=finish+'#pragma unroll_loop_end'.length,original=source.slice(begin,end);
 const guard=`
#if NUM_SPOT_LIGHTS == 9 && NUM_SPOT_LIGHT_SHADOWS == 9
if(uRoomSpotBoundsValid42<.5 || (all(greaterThanEqual(vCloudWorld,uRoomSpotBoundsMin42)) && all(lessThanEqual(vCloudWorld,uRoomSpotBoundsMax42)))) {
#endif
${original}
#if NUM_SPOT_LIGHTS == 9 && NUM_SPOT_LIGHT_SHADOWS == 9
}
#endif
`;
 return 'uniform float uRoomSpotBoundsValid42;\nuniform vec3 uRoomSpotBoundsMin42,uRoomSpotBoundsMax42;\n'+source.slice(0,begin)+guard+source.slice(end);
}
