// Tool CDP does not support Page.addScriptToEvaluateOnNewDocument. Immediately
// after each goto, assert !window.kalajunV2?.debug and inject this collector ONCE.
// installedMs is recorded; all navigation clocks remain performance.now().
// No full snapshot per RAF, no source/runtime hooks, no app changes.
function reachLazy46Collector({name}){
 const run=window.__reachLazy46={name,phase:'loading',navigationURL:location.href,timeOrigin:performance.timeOrigin,installedMs:performance.now(),cachePolicy:{http:'CDP cacheDisabled=true',indexedDB:'retained; not cleared; cache state reported from application'},firstDebugMs:null,firstFrameSubmittedMs:null,bankBuiltObservedMs:null,ready521ObservedMs:null,terrainQ0ObservedMs:null,settledObservedMs:null,edges:[],errors:[],invalid:[],stable:0,rafCount:0};
 let previous='',stopped=false;
 addEventListener('error',e=>run.errors.push({atMs:performance.now(),message:e.message||'Resource error',file:e.filename||null}));
 addEventListener('unhandledrejection',e=>run.errors.push({atMs:performance.now(),message:String(e.reason?.stack||e.reason)}));
 function finish(reason){
  if(stopped)return;stopped=true;run.endedMs=performance.now();if(reason)run.invalid.push(reason);
  const app=window.kalajunV2,d=app?.debug,c=d?.ecology?.reachBankCover39;
  if(app){run.snapshot=app.getSnapshot();run.firstFrameSubmittedMs=run.snapshot.loadTimings.navigationToFirstFrameSubmittedMs;run.errors.push(...run.snapshot.errors);}
  if(c){
   run.bank=structuredClone(c.stats);run.actualRoots=c.pools.reduce((n,p)=>n+p.records.length,0);run.actualReady=c.pools.reduce((n,p)=>n+p.records.filter(r=>r.contactReady).length,0);
   run.envelopes={getters:0,values:0,lazyFirstReadCalls:Object.hasOwn(c.stats.envelopeLazy46??{},'envelopeMs')?null:0,nonzeroCountInstrumented:false};
   for(const pool of c.pools)for(const root of pool.records){const descriptor=Object.getOwnPropertyDescriptor(root.coverAsset,'envelope');if(descriptor?.get)run.envelopes.getters++;else if(descriptor&&Object.hasOwn(descriptor,'value'))run.envelopes.values++;}
   if(run.actualRoots!==521||run.actualReady!==521)run.invalid.push('Final actual roots/ready must be 521');
   if(c.prepared42?.stats.status!=='ready')run.invalid.push('Prepared source did not load');
  }
  // All sampled state above is already copied. Do not freeze the user page
  // while the evidence POST runs or while a caller waits for this result.
  if(run.errors.length)run.invalid.push('Application errors');run.valid=run.invalid.length===0;run.phase='saving';
  fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:run.name,snapshot:run})}).then(async r=>{if(!r.ok)throw Error('Evidence HTTP '+r.status+': '+await r.text());run.saved=true;run.phase='done';}).catch(e=>{run.saveError=String(e);run.phase='save-failed';});
 }
 function tick(){
  if(stopped)return;run.rafCount++;const now=performance.now(),d=window.kalajunV2?.debug;
  if(now>240000){finish('Navigation did not settle within 240 seconds');return;}
  if(!d){requestAnimationFrame(tick);return;}
  const c=d.ecology.reachBankCover39,s=c.stats,t=d.terrain.stats,total=s.sedges+s.mats,built=!!s.built,ready=built?total-s.pending:0,q=t.queuedTiles,m=t.morphingGroups;
  if(run.firstDebugMs===null){run.firstDebugMs=now;run.firstDebug={built,ready,total,q,m,buildWorkMs:s.buildWorkMs??null};run.bankBuiltBeforeFirstDebug=built;run.ready521BeforeFirstDebug=ready===521;run.phase='observing';}
  if(document.visibilityState!=='visible'){finish('Page lost visibility');return;}
  if(d.renderer.domElement.width!==1280||d.renderer.domElement.height!==800||d.renderer.getPixelRatio()!==1){finish('Viewport changed');return;}
  if(built&&run.bankBuiltObservedMs===null)run.bankBuiltObservedMs=now;
  if(ready===521&&run.ready521ObservedMs===null){const actual=c.pools.reduce((n,p)=>n+p.records.filter(r=>r.contactReady).length,0);if(actual!==521){finish('Ready counter disagrees with actual roots');return;}run.ready521ObservedMs=now;}
  if(q===0&&run.terrainQ0ObservedMs===null)run.terrainQ0ObservedMs=now;
  const key=[built,total,ready,q,m].join('|');
  if(key!==previous){run.edges.push({atMs:now,built,total,ready,q,m,buildWorkMs:s.buildWorkMs??null,envelopeMs:s.envelopeLazy46?.envelopeMs??null,frame:d.renderer.info.render.frame});previous=key;}
  run.current={atMs:now,built,total,ready,q,m};
  if(built&&ready===521&&q===0&&m===0){if(run.stable===0)run.settledObservedMs=now;run.stable++;}else run.stable=0;
  if(run.stable>=60){finish();return;}
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}
