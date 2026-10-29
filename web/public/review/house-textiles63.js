import {readHouseGI74} from './house-gi74.js';
import {furniture61Poses} from './house-furniture61.js';
const next=()=>new Promise(r=>requestAnimationFrame(r));
const save=async(name,snapshot,png=null)=>{const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot,png})});if(!r.ok)throw Error('Save '+r.status);};
export async function captureTextiles63(app,{label='candidate',prefix='house-textiles63'}={}){
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(prefix))throw Error('Invalid prefix');
 if(!['candidate','original','restored'].includes(label))throw Error('Invalid variant');
 const d=app.debug,records=[],s=app.getSnapshot();
 if(s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1||s.time!==870)throw Error('Require1280x800/DPR1/time870');
 if(Boolean(d.structures._houseTextiles62)!==(label==='candidate'))throw Error('Wrong cloth variant');
 if(d.structures._houseFurniture58?.stats.nodes!==6)throw Error('Keep adopted furniture58 in all comparisons');
 d.setReviewHold(false);
 for(const pose of furniture61Poses()){
  d.controls.setPose(pose.position[0],pose.position[2],0,pose.yaw,pose.pitch,pose.position[1]);
  let stable=0;const deadline=performance.now()+240000;
  while(stable<5){await next();const s=app.getSnapshot();if(s.errors.length||document.visibilityState!=='visible')throw Error('Invalid visible runtime');if(performance.now()>deadline)throw Error('Terrain settle timeout');stable=!s.preparing&&s.terrain.queuedTiles===0&&d.terrain.morphs.size===0?stable+1:0;}
  for(let frame=0;frame<2;frame++){
   if(frame)for(let n=0;n<20;n++)await next();let png;
   const prior=d.setReviewHold(true);try{d.renderFrozenWorld();png=d.renderer.domElement.toDataURL('image/png');}finally{d.setReviewHold(prior);}
   const snapshot=app.getSnapshot(),record={label,pose,frame,snapshot,scope:'scripted fixed-camera flight capture, not native walking; GI status is read from actual loaded sources',gi:readHouseGI74(app).sourceSummary};
   await save(prefix+'-'+label+'-'+pose.name+'-'+frame,record,png);records.push({pose:pose.name,frame,cloth:snapshot.structures.houseTextiles62??null,errors:snapshot.errors});
  }
 }
 const result={label,records};await save(prefix+'-'+label+'-summary',result);return result;
}
