import {createOwnedMatrixArithmetic42} from './owned-matrix-arithmetic42.js';
// Real normal RAF cadence. Never forces shadow updates or freezes wind while
// sampling. A owns no candidate hooks; scene timer is identical in both arms.
export async function measureOwnedMatrixABBA42(app,{warm=30,samples=120,create=createOwnedMatrixArithmetic42,nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve))}={}){
 const d=app.debug??app,scene=d.scene,tracker=d.environment?.shadowCasters;
 if(!scene||!tracker||typeof d.setReviewHold!=='function')throw Error('Requires current world and shadow tracker');
 if(!Number.isInteger(warm)||warm<1||!Number.isInteger(samples)||samples<1)throw Error('Invalid RAF sample count');
 const oldHold=d.setReviewHold(true),original=scene.updateMatrixWorld,groups=[],result={method:'Normal RAF ABBA; A disposed/no candidate owners, B exact arithmetic owned groups; identical top-level scene matrix timer; original shadow cadence and wind',warm,samples,groups};
 let owner=null,depth=0,windowMs=0,windowCalls=0,lastTimestamp=null;
 function hook(...args){if(depth)return original.apply(this,args);const start=performance.now();depth++;try{return original.apply(this,args);}finally{depth--;windowMs+=performance.now()-start;windowCalls++;}}
 const remove=()=>{owner?.dispose();owner=null;};
 try{
  scene.updateMatrixWorld=hook;
  for(const mode of ['A','B','B','A']){
   d.setReviewHold(true);remove();
   if(mode==='B')owner=await create(app,{enabled:true});
   const group={mode,frames:[]};groups.push(group);windowMs=0;windowCalls=0;lastTimestamp=null;d.setReviewHold(false);
   for(let i=0;i<warm+samples;i++){
    const timestamp=await nextFrame(),frameMs=lastTimestamp===null?null:timestamp-lastTimestamp;lastTimestamp=timestamp;
    const s=tracker.stats;
    const row={frameMs,matrixCPUms:windowMs,matrixCalls:windowCalls,shadow:{frame:s.frames,lastMs:s.lastMs,visited:s.visited,objectScans:s.objectScans,skippedCascades:s.skippedCascades?.slice(),phases:s.phases?{...s.phases}:null}};
    windowMs=0;windowCalls=0;if(i>=warm)group.frames.push(row);
   }
   d.setReviewHold(true);group.candidate=owner?structuredClone(owner.stats):null;remove();
  }
  const median=a=>{a.sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;},mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,p95=a=>{a.sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.floor(a.length*.95))]:null;};
  for(const g of groups)g.summary={frameMeanMs:mean(g.frames.map(f=>f.frameMs)),frameMedianMs:median(g.frames.map(f=>f.frameMs)),frameP95Ms:p95(g.frames.map(f=>f.frameMs)),matrixMeanMs:mean(g.frames.map(f=>f.matrixCPUms)),matrixMedianMs:median(g.frames.map(f=>f.matrixCPUms)),matrixCalls:g.frames.reduce((n,f)=>n+f.matrixCalls,0),shadowMeanMs:mean(g.frames.map(f=>f.shadow.lastMs)),distinctShadowFrames:new Set(g.frames.map(f=>f.shadow.frame)).size};
  return result;
 }finally{
  d.setReviewHold(true);remove();if(scene.updateMatrixWorld===hook)scene.updateMatrixWorld=original;
  try{d.renderFrozenWorld?.();}finally{d.setReviewHold(oldHold);}
 }
}
