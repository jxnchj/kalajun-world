import {auditTerrainBatchGeometry42} from './terrain-batch-audit42.js';
const compare=(a,b)=>{if(a.length!==b.length)throw Error('Image dimensions changed');let changed=0,max=0,sum=0,pixels=0;const thresholds={2:0,4:0,8:0,16:0,32:0};for(let i=0;i<a.length;i+=4){let peak=0;for(let j=0;j<4;j++){const d=Math.abs(a[i+j]-b[i+j]);if(d)changed++;max=Math.max(max,d);peak=Math.max(peak,d);sum+=d;}if(peak)pixels++;for(const t in thresholds)if(peak>=Number(t))thresholds[t]++;}return{changed,max,meanComponent:sum/a.length,pixels,thresholdPixels:thresholds};};
const half=v=>{const s=v&32768?-1:1,e=(v>>10)&31,m=v&1023;return s*(e===0?2**-14*m/1024:e===31?(m?NaN:Infinity):2**(e-15)*(1+m/1024));};
function reflectionPreview(bytes,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,k=((h-1-y)*w+x)*4;for(let j=0;j<3;j++){const v=Math.max(0,half(bytes[i+j])),s=v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;im.data[k+j]=Math.round(255*Math.min(1,s));}im.data[k+3]=255;}ctx.putImageData(im,0,0);return c.toDataURL('image/png');}
export async function compareTerrainBatchImages42(app,{name='terrain42-reflection-fixed',expectedGroups=235,maxPrepareFrames=2000,originalTileShadows=false}={}){
 const d=app.debug??app,b=d.terrain?.submissionBatches,r=d.renderer,reflection=d.water?.reflection;
 if(!b||b.enabled||b.records.size||!reflection||!('boundedBuild42'in b))throw Error('Requires updated clean OFF batcher and actual water reflection owner');
 const hold=d.setReviewHold(true),bounded=b.boundedBuild42,oldStats=structuredClone(b.stats),oldShadow={auto:r.shadowMap.autoUpdate,needs:r.shadowMap.needsUpdate},lights=d.environment.csm.lights,oldNeeds=lights.map(l=>l.shadow.needsUpdate),rows=[],images=[];const now=performance.now()/1000;
 const save=async(name,snapshot,png)=>{const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot,png})});if(!response.ok)throw Error('Evidence save failed '+response.status+' '+await response.text());};
 const clear=()=>{b.enabled=false;b.dispose();};
 const fullShadow=()=>{d.scene.updateMatrixWorld(true);d.environment.csm.update();for(const l of lights)l.shadow.needsUpdate=true;r.shadowMap.needsUpdate=true;d.renderFrozenWorld();};
 function capture(label){
  if(originalTileShadows){
   const visibility=[];try{for(const q of b.records.values()){visibility.push([q.mesh,q.mesh.visible]);q.mesh.visible=false;for(const m of q.sources){visibility.push([m,m.visible]);m.visible=true;}}fullShadow();}finally{for(const [m,v]of visibility)m.visible=v;}
  }else fullShadow();
  const shadowAuto=r.shadowMap.autoUpdate,shadowNeeds=r.shadowMap.needsUpdate,needs=lights.map(l=>l.shadow.needsUpdate);
  try{
  if(originalTileShadows){r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;for(const l of lights)l.shadow.needsUpdate=false;}
  reflection.lastCapture=-Infinity;
  const captures=reflection.stats.captures,captured=d.water.renderReflection(r,d.scene,d.camera,{now,lightingRevision:d.environment.minutes});
  if(!captured||reflection.stats.captures!==captures+1)throw Error('Actual reflection was not captured: '+reflection.stats.reason);
  const target=reflection.target;if(!target||target.texture.type!==1016)throw Error('Expected real HalfFloat reflection target');
  const mirror=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,mirror);
  d.renderFrozenWorld();const gl=r.getContext(),width=r.domElement.width,height=r.domElement.height,main=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,main);const png=r.domElement.toDataURL('image/png');const error=gl.getError();if(error)throw Error('GL error '+error);
  return{main,mirror,png,mirrorPNG:reflectionPreview(mirror,target.width,target.height),row:{label,width,height,reflectionSize:[target.width,target.height],captured,batch:structuredClone(b.stats),reflection:structuredClone(reflection.stats),errors:app.getSnapshot?.().errors??null,originalTileShadows}};
  }finally{if(originalTileShadows){r.shadowMap.autoUpdate=shadowAuto;r.shadowMap.needsUpdate=shadowNeeds;lights.forEach((l,i)=>l.shadow.needsUpdate=needs[i]);}}
 }
 try{
  for(const label of ['original','candidate','restored']){
   clear();let prepared=0;
   if(label==='candidate'){
    b.boundedBuild42=true;b.enabled=true;let stable=0;
    while(stable<10){b.restore();b.update(d.terrain.liveNodes);prepared++;const s=b.stats;stable=s.groups===expectedGroups&&s.fullChecks===0&&s.rebuilds===0&&s.budgetDeferred===0?stable+1:0;if(prepared>=maxPrepareFrames&&stable<10)throw Error('Candidate did not stabilize at '+expectedGroups);if(prepared%20===0)await new Promise(resolve=>setTimeout(resolve,0));}
   }
   const im=capture(label);im.row.prepareIterations=prepared;if(label==='candidate')im.row.geometryAudit=auditTerrainBatchGeometry42(app);images.push(im);rows.push(im.row);
   await save(name+'-'+label,im.row,im.png);await save(name+'-'+label+'-reflection',{...im.row,preview:'HalfFloat decoded to clamped sRGB PNG for visual inspection only; raw Uint16 comparisons are unchanged'},im.mirrorPNG);
  }
  const metrics={originalTileShadows,rows,main:compare(images[0].main,images[1].main),reflectionHalfBits:compare(images[0].mirror,images[1].mirror),restoredMain:compare(images[0].main,images[2].main),restoredReflectionHalfBits:compare(images[0].mirror,images[2].mirror),scope:'Held identical wind/time/camera; actual full CSM refresh plus actual reflection each arm. HalfFloat differences compare encoded Uint16 values, not linear radiance distances.'};await save(name+'-comparison',metrics);return metrics;
 }finally{
  d.setReviewHold(true);clear();b.boundedBuild42=bounded;Object.assign(b.stats,oldStats);
  try{fullShadow();reflection.lastCapture=-Infinity;d.water.renderReflection(r,d.scene,d.camera,{now,lightingRevision:d.environment.minutes});d.renderFrozenWorld();}finally{r.shadowMap.autoUpdate=oldShadow.auto;r.shadowMap.needsUpdate=oldShadow.needs;lights.forEach((l,i)=>l.shadow.needsUpdate=oldNeeds[i]);d.setReviewHold(hold);}
 }
}
