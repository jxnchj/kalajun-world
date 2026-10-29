// Same-source oracle + six real-wind instants; no hold spans any await/network.
export async function captureShadowWindow51Images(app,{name='shadow51-wind',oracle,intervalMs=300}={}){
 if(typeof oracle!=='function')throw Error('Pass existing compareFullCoverage42 export');
 if(!/^[a-zA-Z0-9_-]{1,50}$/.test(name))throw Error('Invalid evidence name');
 const d=app.debug,r=d.renderer,c=d.localShadowWindow42?.controller;
 if(!c?.enabled)throw Error('Active local shadow controller required');
 const save=async(suffix,snapshot,png)=>{const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name+'-'+suffix,snapshot,png})});if(!response.ok)throw Error('Evidence save HTTP '+response.status);};
 function pixels(){const gl=r.getContext(),canvas=r.domElement,a=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);let lit=0,min=255,max=0;for(let i=0;i<a.length;i+=4){const v=Math.max(a[i],a[i+1],a[i+2]);lit+=v>0?1:0;min=Math.min(min,v);max=Math.max(max,v);}if(!lit||max===min)throw Error('Empty or uniform image; not visual evidence');return{a,png:canvas.toDataURL('image/png'),lit,min,max};}
 function capture(){const hold=d.setReviewHold(true),enabled=c.enabled;let on,off,proof,wind,stats;try{
  if(c.pending||!c.owner?.stats.ready||c.owner.valid())throw Error('Window not ready; do not settle or replace real motion with frozen warmup');
  wind=d.ecology.uniforms.uWindTime.value;d.renderFrozenWorld();on=pixels();stats=structuredClone(c.owner.stats);proof=oracle(c.owner);if(proof.pixels||!proof.fullCovered)throw Error('Full-source oracle differs or is empty: '+JSON.stringify(proof));
  c.setEnabled(false);d.renderFrozenWorld();off=pixels();
 }finally{try{c.setEnabled(enabled);d.renderFrozenWorld();}finally{d.setReviewHold(hold);}}
 let changed=0,max=0;for(let i=0;i<on.a.length;i+=4){let v=0;for(let j=0;j<3;j++)v=Math.max(v,Math.abs(on.a[i+j]-off.a[i+j]));changed+=v?1:0;max=Math.max(max,v);}
 return{on: on.png,off:off.png,record:{at:performance.now(),wind,position:d.camera.position.toArray(),yaw:d.controls.yaw,pitch:d.controls.pitch,viewport:{width:r.domElement.width,height:r.domElement.height,pixelRatio:r.getPixelRatio()},oracle:proof,stats,nonempty:{on:on.lit,off:off.lit},changedPixels:changed,maxDifference:max}};
 }
 const records=[];let last=-Infinity;
 for(let i=0;i<6;i++){
  while(performance.now()-last<intervalMs)await new Promise(requestAnimationFrame);
  const shot=capture();last=shot.record.at;records.push(shot.record);
  await save(String(i)+'-on',shot.record,shot.on);await save(String(i)+'-native',shot.record,shot.off);
 }
 const result={records,realWindChanged:new Set(records.map(v=>v.wind)).size===6,visibleEffect:records.some(v=>v.changedPixels>0),scope:'Six natural RAF wind instants; each same-wind ON/native pair and full-source occlusion oracle is synchronous; hold restored before saving.'};
 await save('summary',result);
 if(!result.realWindChanged||!result.visibleEffect)throw Error('No real wind progression or no visible local shadow effect; inspect saved evidence');
 return result;
}
