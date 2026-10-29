// Injected exclusively by the independent review build's transformIndexHtml.
(()=>{
 const panel=document.createElement('section');panel.id='shadow-cpu-review42-panel';panel.style.cssText='position:fixed;top:12px;left:12px;z-index:2147483647;background:#101820ed;color:white;padding:12px;border:1px solid #8ac;border-radius:8px;font:13px monospace;max-width:620px;max-height:70vh;overflow:auto;pointer-events:auto';
 panel.innerHTML='<strong>阴影 CPU 独立诊断</strong><pre data-status>等待世界初始化</pre><button type="button">采样阴影CPU</button><pre data-result>未运行；默认关闭计时</pre>';document.body.append(panel);
 const status=panel.querySelector('[data-status]'),result=panel.querySelector('[data-result]'),button=panel.querySelector('button');let busy=false;
 const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const snapshot=()=>globalThis.kalajunV2?.getSnapshot();
 function refresh(){if(busy)return;const s=snapshot(),api=globalThis.shadowCPUReview42;status.textContent=`API ${api?'存在':'缺失'} | ready ${s?.ready??false}\nq ${s?.terrain?.queuedTiles??'?'} / m ${s?.terrain?.morphingGroups??'?'} / ecology ${s?.ecology?.pending??'?'}\nviewport ${s?JSON.stringify(s.viewport):'?'} | errors ${s?.errors?.length??'?'}`;button.disabled=!api||!s?.ready||!globalThis.kalajunV2?.debug;}
 const timer=setInterval(refresh,1000);refresh();
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;const api=globalThis.shadowCPUReview42,app=globalThis.kalajunV2,groups=[],before=snapshot();let previousHold=false;
 try{
  if(document.hidden)throw Error('诊断页不可见');
  previousHold=app.debug.setReviewHold(false);
  for(const mode of ['pass','detail','pass']){
   status.textContent=`采样 ${groups.length+1}/3 ${mode}，8 个实际阴影 pass`;
   api.start(mode,8);const start=performance.now();
   while(api.remaining>0){await raf();if(performance.now()-start>30000)throw Error('30 秒内未得到8个实际阴影pass');}
   const samples=structuredClone(api.snapshot().samples);if(samples.length!==8)throw Error('样本数错误');
   const stages={};for(const s of samples)for(const[k,v]of Object.entries(s.stages))stages[k]=(stages[k]||0)+v/8;
   groups.push({mode,samples,meanTotal:samples.reduce((n,s)=>n+s.total,0)/8,meanExclusive:samples.reduce((n,s)=>n+s.exclusiveTraversal,0)/8,meanStages:stages});
   result.textContent=groups.map((g,i)=>`${i+1}. ${g.mode}: total ${g.meanTotal.toFixed(3)} ms/pass\nexclusive ${g.meanExclusive.toFixed(3)}; ${Object.entries(g.meanStages).map(([k,v])=>k+' '+v.toFixed(3)).join(' / ')}`).join('\n\n');
   for(let i=0;i<10;i++)await raf();
  }
  const evidence={scope:'Independent native shadow CPU diagnostic. Detail clocks/wrappers perturb execution; compare pass/detail/pass, not optimization benefit. Total excludes shadow RT setup and clear.',before,after:snapshot(),groups,clockLowerBound:api.calibration(),url:location.href};
  const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'shadow42-native-cpu-stages',snapshot:evidence})});
  if(!response.ok)throw Error('保存 HTTP '+response.status+' '+await response.text());
  result.textContent+='\n\n保存 HTTP '+response.status+' 成功：shadow42-native-cpu-stages';
 }catch(error){result.textContent+='\n失败：'+error.message;}finally{api.stop();app.debug.setReviewHold(previousHold);busy=false;button.disabled=false;refresh();}
 };
 addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
