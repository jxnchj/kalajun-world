// Paste as one Runtime.evaluate expression on DEV ?profile=0. Runs only real frames.
(() => {
 const d=window.kalajunV2?.debug;if(!d)throw Error('DEV debug world required');
 if(window.__gpuSegments38?.running)throw Error('Segment probe already running');
 const r=d.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 if(!ext)throw Error('GPU timer unavailable');
 if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Another GPU timer is active; use profile=0');
 const state=window.__gpuSegments38={running:true,frames:0,targetFrames:30,samples:[],pending:0,errors:[],disjoint:false,started:performance.now()};
 const originalRender=r.render,originalShadow=r.shadowMap.render,pending=[],stack=[];
 let active=null,recording=true,finishQueued=false;
 const end=()=>{if(!active)return;gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);state.pending=pending.length;active=null;};
 const begin=label=>{if(!recording)return;if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))throw Error('Unexpected nested external GPU query');const query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);active={query,label,frame:state.frames};};
 const enter=label=>{end();stack.push(label);begin(label);};
 const leave=()=>{end();stack.pop();if(stack.length)begin(stack.at(-1));};
 function render(scene,camera,...rest){
  const label=scene===d.scene?(camera===d.camera?'main':'reflection'):'output';
  if(label==='main')state.frames++;
  enter(label+'.colour');
  try{return originalRender.call(this,scene,camera,...rest);}finally{
   leave();if(state.frames>=state.targetFrames&&!finishQueued){finishQueued=true;setTimeout(finish,0);}
  }
 }
 function shadow(...args){
  const parent=stack.at(-1)?.split('.')[0]||'other';
  enter(parent+'.shadow');try{return originalShadow.apply(this,args);}finally{leave();}
 }
 function restore(){if(r.render===render)r.render=originalRender;if(r.shadowMap.render===shadow)r.shadowMap.render=originalShadow;}
 function drain(){
  state.disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);
  for(let i=pending.length-1;i>=0;i--){const item=pending[i];if(!gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE))continue;
   state.samples.push({frame:item.frame,label:item.label,ms:gl.getQueryParameter(item.query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(item.query);pending.splice(i,1);
  }state.pending=pending.length;
 }
 function finish(){
  recording=false;end();restore();state.submissionFinished=performance.now();
  const poll=()=>{drain();if(pending.length&&performance.now()-state.submissionFinished<10000){setTimeout(poll,50);return;}
   if(pending.length){state.errors.push('GPU query drain timeout');for(const item of pending)gl.deleteQuery(item.query);pending.length=0;}
   state.pending=0;state.running=false;state.ended=performance.now();
   const totals={};for(const sample of state.samples){const key=sample.frame+':'+sample.label;totals[key]=(totals[key]||0)+sample.ms;}
   state.perFrame=Object.entries(totals).map(([key,ms])=>{const i=key.indexOf(':');return{frame:Number(key.slice(0,i)),label:key.slice(i+1),ms};});
  };poll();
 }
 r.render=render;r.shadowMap.render=shadow;
 state.cancel=()=>{state.errors.push('cancelled');finish();};
 setTimeout(()=>{if(recording){state.errors.push('frame collection timeout');finish();}},30000);
 return {started:true,targetFrames:state.targetFrames};
})()
