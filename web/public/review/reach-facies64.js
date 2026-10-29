import {bank53Poses} from './reach-bank53.js';
const next=()=>new Promise(r=>requestAnimationFrame(r));
const save=async(name,snapshot,png)=>{const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot,png})});if(!r.ok)throw Error('Evidence save '+r.status);};
export async function captureFacies64(app,owner){
 const d=app.debug,s=app.getSnapshot();if(s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1||s.time!==870)throw Error('Require1280x800/DPR1/time870');
 if(app.world.hydrology.forestReach39.stats.design50==='root-pool'||d.rootMat.enabled)throw Error('Use original bank geometry');
 const records=[];d.setReviewHold(false);
 for(const pose of bank53Poses()){
  d.controls.setPose(pose.position[0],pose.position[2],0,pose.yaw,pose.pitch,pose.position[1]);let stable=0;const deadline=performance.now()+240000;
  while(stable<5){await next();const s=app.getSnapshot(),c=d.ecology.reachBankCover39;if(s.errors.length||document.visibilityState!=='visible')throw Error('Invalid visible runtime');if(performance.now()>deadline)throw Error('Settle timeout');stable=!s.preparing&&!s.terrain.queuedTiles&&!d.terrain.morphs.size&&c.stats.built&&!c.stats.pending?stable+1:0;}
  const roots=d.ecology.reachBankCover39.pools.flatMap(p=>p.records);if(roots.length!==521||roots.some(r=>r.contactFailure||!r.contactReady))throw Error('Incomplete actual roots/contact');
  const identity=JSON.stringify(roots.map(r=>[r.id,r.x,r.y,r.z,r.s,r.sy,r.rot,r.coverAsset.geometry.attributes.position.count,r.coverAsset.geometry.index.count]));
  const images=[],prior=d.setReviewHold(true);try{
   for(const [label,enabled]of [['original',false],['candidate',true],['restored',false]]){
    owner.setEnabled(enabled);d.renderFrozenWorld();d.water.reflection.lastCapture=-Infinity;const reflected=d.water.renderReflection(d.renderer,d.scene,d.camera,{now:performance.now()/1000,lightingRevision:d.environment.minutes});d.renderFrozenWorld();
    images.push({label,enabled,reflected,png:d.renderer.domElement.toDataURL('image/png'),snapshot:app.getSnapshot()});
   }
  }finally{owner.setEnabled(false);d.setReviewHold(prior);}
  if(identity!==JSON.stringify(roots.map(r=>[r.id,r.x,r.y,r.z,r.s,r.sy,r.rot,r.coverAsset.geometry.attributes.position.count,r.coverAsset.geometry.index.count])))throw Error('Root data changed');
  for(const im of images){const record={pose,roots:521,contactReady:true,identity,enabled:im.enabled,reflected:im.reflected,snapshot:im.snapshot,scope:'same-wind material-only compare; original bank50/rootMat OFF; not performance or walking'};await save('reach-facies64-'+im.label+'-'+pose.name,record,im.png);records.push({pose:pose.name,label:im.label,roots:521,errors:im.snapshot.errors});}
 }
 const result={records};await save('reach-facies64-summary',result,null);return result;
}
