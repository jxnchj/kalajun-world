import {CompileTextureQueue} from "./compile-textures.js";
const STALL_MS=5000,POLL_MS=25;
const clock={now:()=>performance.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)};

function linkFailure(gl,program){
 const safe=read=>{try{return read()||'';}catch(error){return '[diagnostic unavailable: '+error.message+']';}};
 const programLog=safe(()=>gl.getProgramInfoLog(program.program));
 const vertexLog=program.vertexShader?safe(()=>gl.getShaderInfoLog(program.vertexShader)):'';
 const fragmentLog=program.fragmentShader?safe(()=>gl.getShaderInfoLog(program.fragmentShader)):'';
 const error=new Error('Shader link failed: '+(program.name||'unnamed')+' (program '+program.id+')\nProgram: '+programLog+'\nVertex: '+vertexLog+'\nFragment: '+fragmentLog);
 error.name='ShaderLinkError';error.programId=program.id;error.programLog=programLog;error.vertexLog=vertexLog;error.fragmentLog=fragmentLog;return error;
}

// Public compile() starts Three's asynchronous GPU linking synchronously while
// the caller's HDR target is still bound. Own the polling timer so failures and
// completion have a real cleanup path, unlike an uncancellable compileAsync().
export function compilePreparedWorld(renderer,input,camera,scene,{scheduler=clock,prepareTextures=new URLSearchParams(globalThis.location?.search||'').get('texturePreparation')==='1'}={}){
 const start=scheduler.now(),stats=input.userData.compileReadiness={elapsedMs:0,probes:0,maxProbeMs:0,probeTotalMs:0,programCount:0,verifiedPrograms:0,stalledProbes:0,status:'compiling'};
 let programs,gl,textures;
 try{
  const before=new Set(renderer.info?.programs||[]),materials=renderer.compile(input,camera,scene);
  programs=new Set((renderer.info?.programs||[]).filter(program=>!before.has(program)));
  // Include all variants of requested materials, not only currentProgram:
  // transparent DoubleSide materials need both front/back programs.
  for(const material of materials){
   const state=renderer.properties?.get(material);
   if(!state?.programs)throw new Error('Installed Three does not expose compiled material program variants.');
   for(const program of state.programs.values())programs.add(program);
  }
  stats.programCount=programs.size;gl=renderer.getContext();stats.status='waiting';
  if(prepareTextures){textures=new CompileTextureQueue(renderer,materials,scheduler.now);stats.textures=textures.stats;}
 }catch(error){stats.status='failed';stats.elapsedMs=scheduler.now()-start;throw error;}
 return new Promise((resolve,reject)=>{
  let timer=null,settled=false,lastProgress=scheduler.now(),recovering=false,texturesMayRun=false;
  const finish=error=>{
   if(settled)return;settled=true;if(timer!==null){scheduler.clear(timer);timer=null;}
   if(error)textures?.fail();
   stats.elapsedMs=scheduler.now()-start;stats.status=error?'failed':'complete';
   if(error)reject(error);else resolve(input);
  };
  const verify=(program,stalled)=>{
   if(!program?.program)throw new Error('Shader program was disposed before link verification.');
   if(gl.isContextLost())throw new Error('WebGL context lost during shader preparation.');
   const at=scheduler.now();let linked;
   try{linked=gl.getProgramParameter(program.program,gl.LINK_STATUS);}
   finally{const duration=scheduler.now()-at;stats.probes++;stats.stalledProbes+=stalled?1:0;stats.probeTotalMs+=duration;stats.maxProbeMs=Math.max(stats.maxProbeMs,duration);}
   if(gl.isContextLost())throw new Error('WebGL context lost during shader link confirmation.');
   if(linked!==true)throw linkFailure(gl,program);
   programs.delete(program);stats.verifiedPrograms++;lastProgress=scheduler.now();
  };
  const check=()=>{
   timer=null;if(settled)return;
   try{
    if(gl.isContextLost())throw new Error('WebGL context lost during shader preparation.');
    for(const program of programs){
     if(!program?.program)throw new Error('Shader program was disposed before link verification.');
     if(program.isReady())verify(program,false);
    }
    if(programs.size&&scheduler.now()-lastProgress>=STALL_MS)recovering=true;
    // A stalled extension status is not a failed link. Confirm at most ONE
    // unready program per task, then yield. LINK_STATUS may block; measured
    // probe time is recorded, and no hard upper latency bound is promised.
    if(programs.size&&recovering)verify(programs.values().next().value,true);
    // Defer the first upload until a later task so all colour/depth/output
    // compile kickoffs can start linking before any upload blocks the thread.
    if(texturesMayRun&&textures?.pending)textures.step();
    texturesMayRun=true;
    stats.elapsedMs=scheduler.now()-start;
    if(!programs.size&&!textures?.pending){finish();return;}
    timer=scheduler.set(check,textures?.pending?0:POLL_MS);
   }catch(error){finish(error);}
  };
  check();
 });
}
