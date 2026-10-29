// Standalone lossless native depth-copy cost diagnostic. No cache owner, shader
// replacement or receiver change. WebGL2 does not expose raw depth readPixels;
// final RGBA equality is reported separately, never called a raw depth bit proof.
export async function measureShadowDepthBlit42(app,{warm=3,samples=10,gpu=true,pause=()=>new Promise(r=>setTimeout(r,0)),pixels}={}){
 const d=app.debug??app,r=d.renderer,lights=d.environment?.csm?.lights,profile=d.gpuPassProfile;
 if(!r||lights?.length!==3||lights.some(l=>!l.shadow.map?.depthTexture)||!r.initRenderTarget||!r.copyTextureToTexture)throw Error('Requires initialized original three-CSM depth textures');
 if(profile?.frame||profile?.active)throw Error('Main GPU profile active');
 if(!Number.isInteger(warm)||warm<0||!Number.isInteger(samples)||samples<1)throw Error('Invalid sample count');
 const gl=r.getContext(),ext=gpu?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 if(ext&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign timer query active');
 const oldHold=d.setReviewHold(true),oldTarget=r.getRenderTarget(),oldFace=r.getActiveCubeFace(),oldLevel=r.getActiveMipmapLevel();
 const viewport=r.getViewport(lights[0].shadow.map.viewport.clone()),scissor=r.getScissor(lights[0].shadow.map.scissor.clone()),scissorTest=r.getScissorTest();
 const oldAuto=r.shadowMap.autoUpdate,oldNeeds=r.shadowMap.needsUpdate,lightState=lights.map(l=>({auto:l.shadow.autoUpdate,needs:l.shadow.needsUpdate,map:l.shadow.map}));
 const baselineTextures=r.info.memory.textures,caches=[],pending=[],groups=[],errors=[],result={method:'Native same-format depth blit; original->copy->original, no receiver changes',rawDepthBitsVerified:false,rgba:null,cascades:[],groups,errors,textureCountBefore:baselineTextures};let active=null;
 const capture=pixels??(()=>{const c=document.createElement('canvas');c.width=r.domElement.width;c.height=r.domElement.height;const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(r.domElement,0,0);return context.getImageData(0,0,c.width,c.height).data;});
 const restoreTarget=()=>{r.setRenderTarget(oldTarget,oldFace,oldLevel);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);};
 const check=label=>{let e;for(let i=0;i<16&&(e=gl.getError())!==gl.NO_ERROR;i++)errors.push({label,error:e});if(errors.length)throw Error('GL error '+JSON.stringify(errors));};
 const force=()=>{r.shadowMap.needsUpdate=true;for(const l of lights)l.shadow.needsUpdate=true;};
 const copy=direction=>{for(let i=0;i<3;i++){const original=lights[i].shadow.map.depthTexture,cache=caches[i].depthTexture;r.copyTextureToTexture(direction==='out'?original:cache,direction==='out'?cache:original);}restoreTarget();};
 const collect=()=>{if(!ext)return;const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(disjoint||gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE)){if(disjoint)p.sample.gpuInvalid=true;else p.sample.gpuMs=gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.q);pending.splice(i,1);}}};
 try{
  check('before');force();d.renderFrozenWorld();check('full-original-render');
  // No shadow updates during the image pair or copy samples: all uniforms/wind
  // remain frozen, and native scheduled redraws cannot hide a corrupt copy.
  r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;for(const l of lights){l.shadow.autoUpdate=false;l.shadow.needsUpdate=false;}
  const before=capture();
  for(const l of lights){const source=l.shadow.map,cache=source.clone();caches.push(cache);r.initRenderTarget(cache);r.setRenderTarget(cache);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete depth-copy framebuffer');result.cascades.push({width:source.width,height:source.height,type:source.depthTexture.type,format:source.depthTexture.format,compareFunction:source.depthTexture.compareFunction,reversed:l.shadow.camera.reversedDepth,samples:source.samples,cacheDepthIsIndependent:cache.depthTexture!==source.depthTexture});if(cache.depthTexture===source.depthTexture)throw Error('Cache must not alias original depth texture');for(const key of ['type','format','compareFunction','minFilter','magFilter'])if(cache.depthTexture[key]!==source.depthTexture[key])throw Error('Depth sampling contract changed: '+key);const sourceGL=r.properties?.get(source.depthTexture)?.__webglTexture,cacheGL=r.properties?.get(cache.depthTexture)?.__webglTexture;if(sourceGL&&cacheGL){result.cascades.at(-1).independentGPUStorage=sourceGL!==cacheGL;if(sourceGL===cacheGL)throw Error('Depth GPU storage alias');}}
  restoreTarget();check('allocate');result.textureCountAllocated=r.info.memory.textures;
  copy('out');copy('back');check('first-roundtrip');d.renderFrozenWorld();const after=capture();let changed=0,maxDelta=0;if(before.length!==after.length)throw Error('Canvas changed size');for(let i=0;i<before.length;i++){const delta=Math.abs(before[i]-after[i]);if(delta)changed++;maxDelta=Math.max(maxDelta,delta);}result.rgba={components:before.length,changed,maxDelta};if(changed)throw Error('Depth roundtrip changed final RGBA: '+JSON.stringify(result.rgba));
  for(const mode of ['roundtrip','restore-only']){const group={mode,frames:[]};groups.push(group);for(let i=0;i<warm+samples;i++){
   collect();const sample={cpuMs:0};let q=null;if(ext&&pending.length<8){if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Foreign query appeared');q=gl.createQuery();if(q){try{gl.beginQuery(ext.TIME_ELAPSED_EXT,q);active=q;}catch(error){gl.deleteQuery(q);throw error;}}}else if(ext)sample.gpuSkipped=true;
   const start=performance.now();try{if(mode==='roundtrip')copy('out');copy('back');}finally{sample.cpuMs=performance.now()-start;if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);active=null;pending.push({q,sample});}}
   check(mode);if(i>=warm)group.frames.push(sample);await pause();
  }}
  const until=performance.now()+2000;while(pending.length&&performance.now()<until){collect();if(pending.length)await new Promise(resolve=>setTimeout(resolve,10));}
  const median=a=>{a.sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};for(const group of groups)group.summary={cpuMedian:median(group.frames.map(f=>f.cpuMs)),gpuMedian:median(group.frames.filter(f=>f.gpuMs!==undefined&&!f.gpuInvalid).map(f=>f.gpuMs)),gpuSamples:group.frames.filter(f=>f.gpuMs!==undefined&&!f.gpuInvalid).length};
  return result;
 }finally{
  if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);}for(const p of pending)gl.deleteQuery(p.q);
  for(const cache of caches){cache.dispose();cache.depthTexture?.dispose();}restoreTarget();
  try{r.shadowMap.autoUpdate=oldAuto;force();d.renderFrozenWorld();check('restored-original-render');}finally{r.shadowMap.autoUpdate=oldAuto;r.shadowMap.needsUpdate=oldNeeds;lights.forEach((l,i)=>{l.shadow.autoUpdate=lightState[i].auto;l.shadow.needsUpdate=lightState[i].needs;});restoreTarget();d.setReviewHold(oldHold);result.textureCountAfter=r.info.memory.textures;result.resourcesReleased=result.textureCountAfter===baselineTextures;}
 }
}
