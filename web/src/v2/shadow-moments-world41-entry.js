import './main.js';
import {updateTreeWindCoefficientPhase} from './tree-wind-coefficients.js';
import {ShadowMomentsWorld41} from './shadow-moments-world41.js';
const status=document.createElement('pre');status.style.cssText='position:fixed;right:8px;top:8px;z-index:100;max-width:420px;background:#fffE;color:#111;font:11px monospace;pointer-events:none';document.body.appendChild(status);status.textContent='独立近级矩阴影候选，非默认世界；等待原世界准备';
function attach(){const api=window.kalajunV2;if(!api?.debug){requestAnimationFrame(attach);return;}try{const owner=new ShadowMomentsWorld41(api,{format:new URLSearchParams(location.search).get('momentFormat')==='float'?'float':'half',encoding:new URLSearchParams(location.search).get('groundCDF')==='1'?'cdf':'moments'});window.momentWorld41=owner;setInterval(()=>status.textContent=JSON.stringify(owner.stats,null,2),500);}catch(e){status.textContent=String(e.stack||e);throw e;}}requestAnimationFrame(attach);

// Same source wind times for visual acceptance; saves the rendered canvas, not
// a diagnostic mask. Caller chooses a fixed camera before this routine.
window.captureMomentWorld41=async function({name='mom-world41',frames=16,start=4,step=.08}={}){
 const api=window.kalajunV2,d=api.debug,owner=window.momentWorld41;
 if(!owner)throw Error('Candidate not attached');
 const previousHold=d.setReviewHold(true),wind=d.ecology.uniforms.uWindTime.value,enabled=owner.enabled;
 const setWind=time=>{const e=d.ecology;e.uniforms.uWindTime.value=time;updateTreeWindCoefficientPhase(e.treeWindPhase,time);e.windField.update(time,d.camera.position);e.syncTreeDynamics(d.camera);};
 const geometryState=()=>{const rows=[];d.scene.traverse(o=>{if(o.isMesh)rows.push([o.id,o.geometry.id,o.count??1,o.geometry.instanceCount??1]);});return JSON.stringify(rows);};setWind(start);const sourceGeometry=geometryState();
 const rows=[];try{for(const mode of[false,true]){owner.setEnabled(mode);for(let i=0;i<frames;i++){
  const time=start+i*step;setWind(time);if(geometryState()!==sourceGeometry)throw Error('Source geometry changed during frozen wind sequence');d.environment.forceShadowUpdate=true;d.environment.update(0);d.renderFrozenWorld();
  const png=d.renderer.domElement.toDataURL('image/png'),snapshot={mode:mode?(owner.encoding==='cdf'?'cdf':'moments'):'native',time,frame:i,position:d.camera.position.toArray(),quaternion:d.camera.quaternion.toArray(),geometryCountStable:true,sourceMeshCount:JSON.parse(sourceGeometry).length,candidate:{...owner.stats},render:{...d.renderer.info.render}};
  const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name+'-'+snapshot.mode+'-'+String(i).padStart(2,'0'),snapshot,png})});if(!response.ok)throw Error('Evidence save failed '+response.status+' '+await response.text());rows.push(snapshot);await new Promise(requestAnimationFrame);
 }}return rows;}finally{setWind(wind);owner.setEnabled(enabled);d.setReviewHold(previousHold);}
};

window.captureCDFApplication41=async function(name='cdf41-application'){
 const d=window.kalajunV2.debug,owner=window.momentWorld41,r=d.renderer,previousHold=d.setReviewHold(true),tone=r.toneMapping,diagnostic=owner.uniforms.momentDiagnostic41.value;
 if(owner.encoding!=='cdf')throw Error('CDF diagnostic requires CDF candidate');
 try{
  // Read the diagnostic through the same screen path but without ACES mixing
  // channels. Restore the exact original mapping before any visual judgement.
  r.toneMapping=0;owner.uniforms.momentDiagnostic41.value=1;d.renderFrozenWorld();
  const gl=r.getContext(),pixels=new Uint8Array(r.domElement.width*r.domElement.height*4);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let ground=0,applied=0,full=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]===0&&pixels[i+2]===255){ground++;if(pixels[i]>0)applied++;if(pixels[i]===255)full++;}
  const snapshot={ground,applied,full,fraction:ground?applied/ground:null,candidate:{...owner.stats},scope:'Diagnostic only; output tone mapping temporarily disabled, original rendering restored; blue terrain, red actual CDF use'};
  const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot,png:r.domElement.toDataURL('image/png')})});if(!response.ok)throw Error('Evidence save failed '+response.status);return snapshot;
 }finally{r.toneMapping=tone;owner.uniforms.momentDiagnostic41.value=diagnostic;d.renderFrozenWorld();d.setReviewHold(previousHold);}
};
