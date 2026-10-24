// Runtime.evaluate expression. Real scene only; use ?debug=1&profile=0.
// Optional before injection: window.__gpuFamilyOptions38={families:['needle','grass'],framesPerFamily:3,maxRunsPerPass:6,runOffset:0};
// Read window.__gpuFamilies38 after .running becomes false. No draw is removed.
(() => {
 const d=window.kalajunV2?.debug;if(!d)throw Error('World debug handle required (?debug=1)');
 if(new URLSearchParams(location.search).get('profile')==='1')throw Error('Use profile=0: the normal profiler owns elapsed queries');
 if(window.__gpuFamilies38?.running||window.__gpuSegments38?.running)throw Error('Another diagnostic is running');
 const r=d.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)throw Error('EXT_disjoint_timer_query_webgl2 unavailable');
 if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('An external elapsed query is active');
 const requested=window.__gpuFamilyOptions38||{},allowed=['needle','twig','crown-photo','grass','far-forest','terrain','crown-solid','forest-floor','other'];
 const families=requested.families||allowed.slice(0,6);if(!families.length||families.some(f=>!allowed.includes(f)))throw Error('Unknown/empty family selection');
 const config={families:[...new Set(families)],warmupFrames:2,framesPerFamily:Math.max(1,Math.min(5,requested.framesPerFamily||3)),maxRunsPerPass:Math.max(1,Math.min(12,requested.maxRunsPerPass||6)),runOffset:Math.max(0,Math.floor(requested.runOffset||0))};
 const state=window.__gpuFamilies38={running:true,config,frame:0,queriesCreated:0,queriesResolved:0,maxPending:0,samples:[],draws:[],frames:[],errors:[],disjoint:false,started:performance.now(),instrumentationCpuMs:0,
  caveat:'Queries partition the real command stream and may perturb tile resolves/driver scheduling. Partial family timings are lower bounds; never sum sampled family means as whole-frame GPU time.'};
 const originalRender=r.render,originalShadow=r.shadowMap.render,originalDraw=r.renderBufferDirect;
 const cache=new WeakMap(),grassMaterials=new Set(d.ecology.grassMaterials||[]),pending=[],contexts=[],drawRows=new Map(),frameRows=new Map(),passRuns=new Map(),examples=new Map();
 grassMaterials.add(d.ecology.baseGrassMaterial);
 const shadowIndices=new Map(d.environment.csm.lights.map((l,i)=>[l.shadow.camera,i]));
 let active=null,recording=true,finishing=false,finishQueued=false,lastMain=null,lastLabel=null;
 const ancestor=(o,group)=>{if(!group)return false;for(let p=o;p;p=p.parent)if(p===group)return true;return false;};
 function classify(object){
  let value=cache.get(object);if(value)return value;
  const name=object.name||'',g=object.geometry,m=object.material;
  if(name.startsWith('gpu-needle-')||m?.userData?.solidNeedleStations)value={family:'needle',kind:'stations'};
  else if(name.startsWith('gpu-twig-'))value={family:'twig',kind:'shared-twig'};
  else if(name.startsWith('gpu-brush-'))value={family:'needle',kind:'legacy-brush'};
  else if(grassMaterials.has(m)||object===d.ecology.baseGrass?.mesh)value={family:'grass',kind:object===d.ecology.baseGrass?.mesh?'basal':m===d.ecology.grassMaterials?.[0]?'near':'middle'};
  else if(g?.userData?.farTreeAllocation)value={family:'far-forest',kind:g.attributes?.aFarTreeShape?'volume':'impostor-or-volume'};
  else if(/^spruce-(1|5)-/.test(name))value={family:(m?.alphaTest||0)>0?'crown-photo':'crown-solid',kind:(m?.alphaTest||0)>0?'photo-frond':'bark-or-core'};
  else if(ancestor(object,d.terrain.group))value={family:'terrain',kind:'resident-terrain'};
  else if(ancestor(object,d.ecology.forestFloor?.group))value={family:'forest-floor',kind:'understory'};
  else value={family:'other',kind:'other'};
  cache.set(object,value);
  const key=value.family+':'+value.kind;if(!examples.has(key))examples.set(key,{family:value.family,kind:value.kind,name,objectId:object.id,geometryId:g?.id,materialId:m?.id,attributes:Object.keys(g?.attributes||{})});
  return value;
 }
 function end(){
  if(!active)return;const item=active;active=null;
  if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)!==item.query){state.errors.push('Query ownership changed unexpectedly');recording=false;gl.deleteQuery(item.query);return;}
  gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(item);state.maxPending=Math.max(state.maxPending,pending.length);
 }
 function queueFinish(){if(finishQueued)return;finishQueued=true;setTimeout(finish,0);}
 function begin(label,family,run){
  if(!recording)return;
  if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){state.errors.push('External query detected; diagnostic stopped without ending it');recording=false;queueFinish();return;}
  const query=gl.createQuery();if(!query){state.errors.push('GPU query allocation failed');recording=false;queueFinish();return;}
  gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active={query,label,family,run,frame:state.frame,draws:0,calls:0,triangles:0,kinds:{}};state.queriesCreated++;
 }
 function passLabel(camera){const c=contexts.at(-1);if(!c)return 'outside';return c.pass+(c.shadow?'.shadow.c'+(shadowIndices.get(camera)??'other'):'.colour');}
 function draw(camera,scene,geometry,material,object,group){
  const started=performance.now(),info=classify(object),label=passLabel(camera),frame=frameRows.get(state.frame),key=state.frame+'|'+label+'|'+info.family;
  let row=drawRows.get(key);if(!row){row={frame:state.frame,label,family:info.family,draws:0,calls:0,triangles:0,timedDraws:0,runs:0,timedRuns:0,kinds:{}};drawRows.set(key,row);}
  const currentLabel=label+'|'+info.family,selected=recording&&frame?.family===info.family&&label.startsWith('main.');
  if(currentLabel!==lastLabel){end();lastLabel=currentLabel;row.runs++;
   if(selected){const capKey=label.startsWith('main.shadow')?'shadow':'colour',runKey=state.frame+'|'+capKey,run=passRuns.get(runKey)||0;passRuns.set(runKey,run+1);
    if(run>=config.runOffset&&run<config.runOffset+config.maxRunsPerPass){begin(label,info.family,run);if(active)row.timedRuns++;}
   }
  }
  const measured=active&&active.frame===state.frame&&active.label===label&&active.family===info.family;
  const calls=r.info.render.calls,triangles=r.info.render.triangles;state.instrumentationCpuMs+=performance.now()-started;
  let value;try{value=originalDraw.call(this,camera,scene,geometry,material,object,group);}catch(error){end();state.errors.push('Original renderBufferDirect threw: '+error.message);queueFinish();throw error;}
  const tail=performance.now(),deltaCalls=r.info.render.calls-calls,deltaTriangles=r.info.render.triangles-triangles;
  row.draws++;row.calls+=deltaCalls;row.triangles+=deltaTriangles;row.kinds[info.kind]=(row.kinds[info.kind]||0)+1;
  if(measured&&active){row.timedDraws++;active.draws++;active.calls+=deltaCalls;active.triangles+=deltaTriangles;active.kinds[info.kind]=(active.kinds[info.kind]||0)+1;}
  state.instrumentationCpuMs+=performance.now()-tail;return value;
 }
 function render(scene,camera,...rest){
  end();lastLabel=null;const pass=scene===d.scene?(camera===d.camera?'main':'reflection'):'output';
  if(pass==='main'){
   state.frame++;const now=performance.now(),index=state.frame-config.warmupFrames-1,family=index>=0&&index<config.families.length*config.framesPerFamily?config.families[index%config.families.length]:null;
   const row={frame:state.frame,family,intervalMs:lastMain===null?null:now-lastMain,startedMs:now};state.frames.push(row);frameRows.set(state.frame,row);lastMain=now;
  }
  contexts.push({pass,shadow:false});try{return originalRender.call(this,scene,camera,...rest);}finally{
   end();lastLabel=null;contexts.pop();if(pass==='main'&&state.frame>=config.warmupFrames+config.families.length*config.framesPerFamily)queueFinish();
  }
 }
 function shadow(...args){end();lastLabel=null;const c=contexts.at(-1),old=c?.shadow;if(c)c.shadow=true;try{return originalShadow.apply(this,args);}finally{end();lastLabel=null;if(c)c.shadow=old;}}
 function restore(){if(r.render===render)r.render=originalRender;if(r.shadowMap.render===shadow)r.shadowMap.render=originalShadow;if(r.renderBufferDirect===draw)r.renderBufferDirect=originalDraw;}
 function drain(){
  state.disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);
  for(let i=pending.length-1;i>=0;i--){const item=pending[i];if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
   const {query,...data}=item;state.samples.push({...data,ms:gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(query);pending.splice(i,1);state.queriesResolved++;
  }state.pending=pending.length;
 }
 function finish(){
  if(finishing)return;finishing=true;recording=false;end();restore();state.submissionFinished=performance.now();
  const poll=()=>{drain();if(pending.length&&performance.now()-state.submissionFinished<10000){setTimeout(poll,50);return;}
   if(pending.length){state.errors.push('query drain timeout');for(const item of pending)gl.deleteQuery(item.query);pending.length=0;}
   state.draws=[...drawRows.values()];state.examples=[...examples.values()];state.pending=0;state.running=false;state.ended=performance.now();
   const summary=new Map();for(const sample of state.samples){const key=sample.frame+'|'+sample.label+'|'+sample.family;let row=summary.get(key);if(!row){row={frame:sample.frame,label:sample.label,family:sample.family,ms:0,queries:0,timedDraws:0,timedCalls:0,timedTriangles:0};summary.set(key,row);}row.ms+=sample.ms;row.queries++;row.timedDraws+=sample.draws;row.timedCalls+=sample.calls;row.timedTriangles+=sample.triangles;}
   state.perFrame=[...summary.values()].map(row=>{const total=drawRows.get(row.frame+'|'+row.label+'|'+row.family);return{...row,totalDraws:total?.draws||0,totalCalls:total?.calls||0,totalTriangles:total?.triangles||0,coverage:total?.draws?row.timedDraws/total.draws:0,complete:row.timedDraws===total?.draws};});
  };poll();
 }
 r.render=render;r.shadowMap.render=shadow;r.renderBufferDirect=draw;
 state.cancel=()=>{state.errors.push('cancelled');finish();};
 setTimeout(()=>{if(recording){state.errors.push('frame collection timeout');finish();}},20000);
 return {started:true,config,maxExpectedQueries:config.families.length*config.framesPerFamily*config.maxRunsPerPass*2,result:'window.__gpuFamilies38'};
})()
