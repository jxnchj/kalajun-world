// Inject this expression with Runtime.evaluate in ?debug=1&profile=0.
// Optional: window.__gpuDifferentialOptions38={families:['crown-photo','grass','twig'],samplesPerBlock:3}.
// Every A/B/A block is submitted synchronously with unchanged camera, wind, shadow and reflection.
(() => {
 const d=window.kalajunV2?.debug;
 if(!d?.renderFrozenWorld)throw Error('debug.renderFrozenWorld is required');
 if(new URLSearchParams(location.search).get('profile')==='1')throw Error('Use profile=0; do not nest the normal GPU profiler');
 if(window.__gpuFamilies38?.running||window.__gpuSegments38?.running||window.__gpuDifferential38?.running)throw Error('Another GPU diagnostic is running');
 const r=d.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)throw Error('Timer query extension unavailable');
 if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('External timer query is active');
 const options=window.__gpuDifferentialOptions38||{},families=[...new Set(options.families||['crown-photo','grass','twig'])];
 if(!families.length||families.some(f=>!['crown-photo','grass','twig','needle'].includes(f)))throw Error('Unknown or empty family selection');
 const samplesPerBlock=Math.min(5,Math.max(3,Math.floor(options.samplesPerBlock||3)));
 const state=window.__gpuDifferential38={running:true,config:{families,samplesPerBlock},started:performance.now(),queriesCreated:0,queriesResolved:0,samples:[],summary:[],errors:[],disjoint:false,
  scope:'One query around real main scene + HDR output; original shadow and reflection textures frozen. No systems.update, readback or photo capture during submission.',
  limitation:'B removes only selected main-colour draws. Delta includes changed depth/occlusion/early-Z and is NOT pure family shader time or whole animated-frame cost. Synchronous batches may change driver scheduling; A-return drift is recorded.',
  camera:{position:d.camera.position.toArray(),quaternion:d.camera.quaternion.toArray()},minutes:d.environment.minutes};
 const originalDraw=r.renderBufferDirect,shadowFlags={autoUpdate:r.shadowMap.autoUpdate,needsUpdate:r.shadowMap.needsUpdate};
 const grassMaterials=new Set(d.ecology.grassMaterials||[]);grassMaterials.add(d.ecology.baseGrassMaterial);
 const classified=new WeakMap(),pending=[];let activeQuery=null,current=null,omitFamily=null;
 function family(object){
  if(classified.has(object))return classified.get(object);
  const name=object.name||'',m=object.material;let found='other';
  if(name.startsWith('gpu-twig-'))found='twig';
  else if(name.startsWith('gpu-needle-')||name.startsWith('gpu-brush-')||m?.userData?.solidNeedleStations)found='needle';
  else if(grassMaterials.has(m)||object===d.ecology.baseGrass?.mesh)found='grass';
  else if(/^spruce-(1|5)-/.test(name)&&(m?.alphaTest||0)>0)found='crown-photo';
  classified.set(object,found);return found;
 }
 function draw(camera,scene,geometry,material,object,group){
  const main=scene===d.scene&&camera===d.camera;
  if(main&&current)current.mainDraws++;
  if(main&&omitFamily&&family(object)===omitFamily){if(current)current.omittedDraws++;return;}
  return originalDraw.call(this,camera,scene,geometry,material,object,group);
 }
 function sample(family,block,index){
  if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('External timer query appeared');
  const query=gl.createQuery();if(!query)throw Error('Cannot allocate GPU query');
  current={family,block,index,mainDraws:0,omittedDraws:0};omitFamily=block==='B'?family:null;
  const item={query,data:current};activeQuery=query;
  gl.beginQuery(ext.TIME_ELAPSED_EXT,query);state.queriesCreated++;
  try{d.renderFrozenWorld();}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);activeQuery=null;pending.push(item);current=null;}
 }
 try{
  r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;r.renderBufferDirect=draw;
  // Untimed warmup uses exactly the normal scene and render path; shaders must already exist.
  d.renderFrozenWorld();d.renderFrozenWorld();
  for(const family of families)for(const block of ['A-before','B','A-after'])for(let i=0;i<samplesPerBlock;i++)sample(family,block,i);
 }catch(error){state.errors.push(error.message);}
 finally{
  if(activeQuery&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)===activeQuery){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(activeQuery);}
  r.renderBufferDirect=originalDraw;r.shadowMap.autoUpdate=shadowFlags.autoUpdate;r.shadowMap.needsUpdate=shadowFlags.needsUpdate;
  // The last successful block is A-after, so normal scene appearance has already been restored.
  state.submissionFinished=performance.now();state.hooksRestored=true;
 }
 function poll(){
  state.disjoint ||= Boolean(gl.getParameter(ext.GPU_DISJOINT_EXT));
  for(let i=pending.length-1;i>=0;i--){const item=pending[i];if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
   state.samples.push({...item.data,ms:gl.getQueryParameter(item.query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(item.query);pending.splice(i,1);state.queriesResolved++;
  }
  if(pending.length&&performance.now()-state.submissionFinished<15000){setTimeout(poll,50);return;}
  if(pending.length){state.errors.push('GPU query collection timed out');for(const item of pending)gl.deleteQuery(item.query);pending.length=0;}
  const mean=rows=>rows.reduce((sum,x)=>sum+x.ms,0)/rows.length;
  for(const family of families){
   const before=state.samples.filter(s=>s.family===family&&s.block==='A-before'),after=state.samples.filter(s=>s.family===family&&s.block==='A-after'),excluded=state.samples.filter(s=>s.family===family&&s.block==='B');
   const full=before.length===samplesPerBlock&&after.length===samplesPerBlock&&excluded.length===samplesPerBlock;
   const a0=mean(before),a1=mean(after),b=mean(excluded),baseline=(a0+a1)/2;
   state.summary.push({family,complete:full,baselineBeforeMs:a0,baselineAfterMs:a1,excludedMs:b,netDeltaMs:baseline-b,baselineDriftMs:a1-a0,baselineDriftFraction:(a1-a0)/baseline,omittedDraws:excluded.map(s=>s.omittedDraws),valid:full&&!state.disjoint&&!state.errors.length&&excluded.every(s=>s.omittedDraws>0)});
  }
  state.running=false;state.ended=performance.now();
 }
 setTimeout(poll,0);
 return {submitted:true,queries:state.queriesCreated,result:'window.__gpuDifferential38',scope:state.scope};
})()
