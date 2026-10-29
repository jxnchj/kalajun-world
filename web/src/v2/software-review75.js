import {softwareReviewPolicy75} from './software-review-policy75.js';

// This owns only QA scheduling, never renderer methods, world preparation,
// material/shadow/reflection owners, input keys or control/physics speeds.
export class SoftwareReview75 {
 constructor({gl,canvas,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),timeoutMs=210000,pollMs=100,inputGapMs=0,beforeFence=()=>{},onAbort=()=>{},onChange=()=>{}}){
  if(!gl?.fenceSync||!gl?.clientWaitSync||!gl?.deleteSync||!gl?.flush)throw Error('Software QA requires WebGL2 fence support');
  if(!(timeoutMs>0)||!(pollMs>0)||!Number.isFinite(timeoutMs)||!Number.isFinite(pollMs)||![0,250].includes(inputGapMs))throw Error('Invalid software QA timing');
  Object.assign(this,{gl,canvas,now,setTimer,clearTimer,timeoutMs,pollMs,inputGapMs,beforeFence,onAbort,onChange});
  this.phase='preparing';this.manualPaused=false;this.remaining=3;this.delta=0;this.readyAt=0;this.reservation=null;this.pending=null;this.closed=false;this.error=null;
  this.counts={submittedWorldFrames:0,completedWorldFrames:0,completedPreparationFences:0};this.lastCompleted=null;this.completedFrameSimulationSeconds=0;
  this.lost=()=>this.abort(Error('Software QA WebGL context lost; reload required'));
  canvas?.addEventListener('webglcontextlost',this.lost);
 }
 snapshot(){return {enabled:true,mode:'finite-software-QA-NOT-realtime-performance',backend:this.backend??null,phase:this.phase,...this.counts,remaining:this.remaining,inFlight:Boolean(this.pending),reserved:Boolean(this.reservation),inputGapMs:this.inputGapMs,fenceTimeoutMs:this.timeoutMs,completedFrameSimulationSeconds:this.completedFrameSimulationSeconds,stepSeconds:this.delta,lastCompleted:this.lastCompleted?structuredClone(this.lastCompleted):null,error:this.error};}
 emit(){this.onChange(this.snapshot());}
 assertOpen(){if(this.closed)throw Error(this.error||'Software QA disposed');}
 waitForIdle(){this.assertOpen();return this.pending?.promise??Promise.resolve();}
 async drain(label='preparation'){
  await this.waitForIdle();this.assertOpen();
  return this.fence({kind:'preparation',label});
 }
 fence(record){
  this.assertOpen();if(this.pending)throw Error('Software QA rejects overlapping GPU frame groups');
  const gl=this.gl;let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const p={promise,resolve,reject,sync:null,timer:null,started:this.now(),record};this.pending=p;this.phase='owner-settle';
  const finish=(error)=>{
   if(this.pending!==p)return;
   if(p.timer!==null)this.clearTimer(p.timer);
   if(p.sync){try{gl.deleteSync(p.sync);}catch{/* Lost context cleanup must still settle. */}}
   this.pending=null;
   if(error){this.closed=true;this.error=String(error.message||error);this.phase='failed';this.remaining=0;this.reservation=null;this.failureCleanup();p.reject(error);}
   else{
    if(record.kind==='world'){
     this.counts.completedWorldFrames++;this.remaining=Math.max(0,this.remaining-1);this.completedFrameSimulationSeconds+=record.delta;
     this.lastCompleted={...record.signature,draw:this.counts.completedWorldFrames,delta:record.delta,fenceWallMs:this.now()-p.started,completedAtMs:this.now()};
    }else this.counts.completedPreparationFences++;
    this.readyAt=this.now()+this.inputGapMs;this.phase=record.kind==='preparation'?'preparing':this.remaining?'ready':'held';p.resolve();
   }
   this.emit();
  };
  p.finish=finish;
  const poll=()=>{
   p.timer=null;
   try{
    if(gl.isContextLost?.())throw Error('Software QA WebGL context lost; reload required');
    if(this.now()-p.started>=this.timeoutMs)throw Error('Software QA GPU fence timeout; no further frames submitted');
    if(!p.sync){p.timer=this.setTimer(poll,this.pollMs);return;}
    const result=gl.clientWaitSync(p.sync,0,0); // Never blocks the JS/input thread.
    if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED){finish();return;}
    if(result!==gl.TIMEOUT_EXPIRED)throw Error('Software QA GPU fence wait failed');
    p.timer=this.setTimer(poll,this.pollMs);
   }catch(error){finish(error);}
  };
  p.timer=this.setTimer(poll,0);
  Promise.resolve().then(()=>this.beforeFence()).then(()=>{
   if(this.pending!==p)return;
   try{if(gl.isContextLost?.())throw Error('Software QA WebGL context lost');p.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!p.sync)throw Error('Software QA could not create GPU fence');gl.flush();this.phase='gpu-wait';this.emit();}catch(error){finish(error);}
  },finish);
  this.emit();return promise;
 }
 completeInitial(signature){this.assertOpen();this.counts.submittedWorldFrames++;return this.fence({kind:'world',delta:0,signature});}
 beginFrame({paused=false,visible=true}={}){
  if(this.closed||this.pending||this.reservation||paused||!visible||this.phase==='preparing'||!this.remaining||this.now()<this.readyAt)return null;
  this.reservation={delta:this.delta};this.phase='submitting';return this.reservation;
 }
 endFrame(token,{submitted=false,error=null,signature=null}={}){
  if(token!==this.reservation)return Promise.resolve();this.reservation=null;
  if(error){this.abort(error);return Promise.reject(error);}
  if(!submitted){this.phase='ready';return Promise.resolve();}
  this.counts.submittedWorldFrames++;return this.fence({kind:'world',delta:token.delta,signature});
 }
 request({frames=1,delta=1/60}={}){
  this.assertOpen();if(this.pending||this.reservation||this.phase==='preparing')return false;
  if(![1,3,60].includes(frames)||![0,1/60].includes(delta))throw Error('Software QA requires a finite 1, 3 or 60 frame request at 0 or 1/60 simulation seconds');
  this.manualPaused=false;this.remaining=frames;this.delta=delta;this.phase='ready';this.emit();return true;
 }
 pause(){if(this.closed)return;this.manualPaused=true;this.remaining=0;if(!this.pending&&!this.reservation&&this.phase!=='preparing')this.phase='held';this.emit();}
 preparing(){this.assertOpen();if(this.pending||this.reservation)throw Error('Preparation began before the previous QA frame completed');this.phase='preparing';this.emit();}
 destinationReady(){this.assertOpen();this.remaining=this.manualPaused?0:3;this.delta=0;this.phase=this.remaining?'ready':'held';this.emit();}
 abort(error){
  if(this.closed)return;
  if(this.pending){this.pending.finish(error);return;}
  this.closed=true;this.error=String(error.message||error);this.phase='failed';this.remaining=0;this.reservation=null;this.failureCleanup();this.emit();
 }
 failureCleanup(){this.canvas?.removeEventListener('webglcontextlost',this.lost);try{this.onAbort();}catch{/* Cleanup must still settle fence rejection. */}}
 dispose(){if(!this.closed)this.abort(Error('Software QA page disposed'));this.canvas?.removeEventListener('webglcontextlost',this.lost);}
}

export function createSoftwareReview75({search=globalThis.location?.search||'',...options}){
 const policy=softwareReviewPolicy75(search);if(!policy.valid)throw Error('Invalid/conflicting softwareReview75 query parameters');
 return policy.enabled?new SoftwareReview75({...options,inputGapMs:policy.inputGapMs}):null;
}

// Native buttons, not an eval-only debug API. No automatic 60-frame run.
export function installSoftwareReviewUI75(review,{document=globalThis.document,getSnapshot=()=>({softwareReview75:review.snapshot()})}={}){
 if(!review)return()=>{};
 const panel=document.createElement('section'),status=document.createElement('pre'),actions=[];
 panel.id='software-review75';panel.setAttribute('aria-label','软件渲染受控验收');
 panel.style.cssText='position:fixed;right:12px;bottom:44px;z-index:1000;max-width:420px;background:#182020ed;color:white;padding:10px;font:12px system-ui;border:1px solid #ccb56b';
 const title=document.createElement('strong');title.textContent='软件QA · 非实时性能 · 首3完整帧后暂停';panel.append(title,status);
 const button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.style.cssText='margin:3px;padding:5px';b.addEventListener('click',()=>{try{action();}catch(error){review.abort(error);}});panel.append(b);return b;};
 actions.push(button('静帧（0s）',()=>review.request({delta:0})),button('单步（1/60s）',()=>review.request()),button('运行60步（模拟1s）',()=>review.request({frames:60})));
 button('暂停后续帧（准备/首帧仍须完成）',()=>review.pause());
 button('保存诊断JSON',()=>{const blob=new Blob([JSON.stringify(getSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kalajun-software-review75-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);});
 let diagnosticText=null;
 const closeDiagnosticText=()=>{if(!diagnosticText)return;const {box,textarea,label}=diagnosticText;textarea.value='';label.textContent='';box.remove();diagnosticText=null;};
 button('显示诊断JSON',()=>{
  closeDiagnosticText();
  const box=document.createElement('div'),label=document.createElement('p'),textarea=document.createElement('textarea'),close=document.createElement('button');
  label.textContent='本次捕获，不自动刷新。文本框内用 Ctrl/Cmd+A、Ctrl/Cmd+C 手动复制；关闭会清空文本。';
  textarea.readOnly=true;textarea.spellcheck=false;textarea.wrap='off';textarea.setAttribute('aria-label','只读诊断JSON（本次捕获）');
  textarea.style.cssText='display:block;width:100%;box-sizing:border-box;height:180px;max-height:30vh;font:11px monospace';
  // Keep native selection/copy defaults. Keyup must reach the original controls
  // so a movement key held before text focus can still be released normally.
  textarea.addEventListener('keydown',event=>event.stopPropagation());
  close.type='button';close.textContent='关闭诊断文本（清空）';close.addEventListener('click',closeDiagnosticText);
  box.append(label,textarea,close);panel.append(box);diagnosticText={box,textarea,label};
  try{
   const captured=getSnapshot(),json=JSON.stringify(captured,null,2);
   if(typeof json!=='string')throw Error('未获得可序列化的诊断快照');
   textarea.value=json;textarea.focus();
  }catch(error){
   textarea.value='';textarea.hidden=true;label.setAttribute('role','alert');
   let message='未知诊断导出错误';try{message=String(error?.message??error).slice(0,480);}catch{/* Error objects can themselves reject property access/coercion. */}
   label.textContent='诊断文本导出失败：'+message;
  }
 });
 const previous=review.onChange;
 const update=s=>{previous(s);status.textContent=`${s.phase} · 世界GPU完成 ${s.completedWorldFrames}/${s.submittedWorldFrames} · 预热fence ${s.completedPreparationFences}\n剩余 ${s.remaining} · 已完成帧模拟 ${s.completedFrameSimulationSeconds.toFixed(3)}s（不是FPS）\n原WASD/拖动/门/物理不变；暂停仅停主帧。\n原准备流程仍会settle；模拟秒不计准备/中断帧。\n显示图可能落后于输入机位；检查lastCompleted和队列。\n截图用浏览器；原照片重绘在此模式禁用。${s.error?'\n失败：'+s.error:''}`;panel.dataset.snapshot=JSON.stringify(getSnapshot());for(const b of actions)b.disabled=s.inFlight||s.reserved||s.phase==='preparing'||Boolean(s.error);};
 review.onChange=update;document.body.append(panel);update(review.snapshot());
 const photo=document.querySelector('#photo-save'),block=e=>{e.preventDefault();e.stopImmediatePropagation();};photo?.addEventListener('click',block,true);
 return()=>{closeDiagnosticText();photo?.removeEventListener('click',block,true);if(review.onChange===update)review.onChange=previous;panel.remove();};
}
