// Served one-page acceptance helper. No production import and no new GPU page.
const next=()=>new Promise(r=>requestAnimationFrame(r));
async function save(name,png,snapshot){const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,png,snapshot})});if(!r.ok)throw Error('Evidence save '+r.status);}
export function bank50Poses(app){
 const h=app.world.hydrology,r=h.forestReach39,segs=h.segments.filter(s=>r.activeSegment(s));
 const section=o=>{const distance=r.origin+o,s=segs.find(s=>s.a.distance<=distance&&s.b.distance>=distance);if(!s)throw Error('Actual reach section missing');return r.waterSectionAt(s,(distance-s.a.distance)/(s.b.distance-s.a.distance));};
 const point=(q,extra)=>({x:q.x+q.fz*(q.left+extra),z:q.z-q.fx*(q.left+extra)});
 const targetQ=section(-9.35),target=point(targetQ,.32),poses=[];
 for(const [name,offset,extra,height]of [['near-left',-9.35,1.35,1.35],['bend-route',-12.5,1.2,1.7]]){
  const q=section(offset),p=point(q,extra),y=app.world.surface.heightAt(p.x,p.z)+height,dx=target.x-p.x,dz=target.z-p.z;
  poses.push({name,position:[p.x,y,p.z],yaw:(Math.atan2(dx,-dz)*180/Math.PI+360)%360,pitch:Math.atan2(targetQ.level+.08-y,Math.hypot(dx,dz))*180/Math.PI,target:[target.x,targetQ.level+.08,target.z]});
 }
 const initial=app.getSnapshot();poses.push({name:'whole',position:initial.position,yaw:initial.yaw,pitch:initial.pitch});return poses;
}
function contacts(d){const c=d.ecology.reachBankCover39,roots=c.pools.flatMap(p=>p.records);return{roots:roots.length,pending:c.stats.pending,stats:structuredClone(c.stats),failures:roots.filter(r=>r.contactFailure).map(r=>({id:r.id,failure:r.contactFailure})),notReady:roots.filter(r=>!r.contactReady).map(r=>r.id),identity:roots.map(r=>({id:r.id,kind:r.kind,x:r.x,z:r.z,y:r.y,s:r.s,sy:r.sy,rot:r.rot,vertices:r.coverAsset.geometry.attributes.position.count,indices:r.coverAsset.geometry.index.count}))};}
async function settle(app,d){
 const end=performance.now()+180000;let stable=0;
 while(performance.now()<end){await next();if(document.visibilityState!=='visible')throw Error('Hidden page invalidates acceptance');const s=app.getSnapshot();if(s.errors.length)throw Error(JSON.stringify(s.errors));const c=d.ecology.reachBankCover39;if(!s.preparing&&s.terrain.queuedTiles===0&&d.terrain.morphs.size===0&&c.stats.built&&c.stats.pending===0){if(++stable===5)return;}else stable=0;}
 throw Error('Actual geometry/contact did not settle within180s');
}
export async function captureBank50(app,{label='original',poses:fixedPoses}={}){
 if(!['original','candidate','restored'].includes(label))throw Error('label');
 const d=app.debug;if(!d)throw Error('debug=1 required');const s=app.getSnapshot();
 if(s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1)throw Error('Set actual1280x800 DPR1 before capture');
 if(s.time!==870)throw Error('time870 required');
 const candidate=app.world.hydrology.forestReach39.stats.profile48==='left-hermite';if(candidate!==(label==='candidate'))throw Error('Wrong source variant');
 if(label!=='original'&&!fixedPoses)throw Error('Reuse original absolute poses for candidate/restored');
 const poses=structuredClone(fixedPoses??bank50Poses(app));
 if(poses.length!==3||poses.some(p=>!Array.isArray(p.position)||p.position.length!==3||![...p.position,p.yaw,p.pitch].every(Number.isFinite)))throw Error('Invalid fixed poses');
 const summary={label,candidate,poses,frames:[],scope:'geometry/art correctness only, not performance'};
 d.setReviewHold(false);
 try{
  for(const p of poses){
   d.controls.setPose(p.position[0],p.position[2],0,p.yaw,p.pitch,p.position[1]);await settle(app,d);
   const count=p.name==='near-left'?3:1;
   for(let n=0;n<count;n++){
    if(n)for(let j=0;j<20;j++)await next();
    const contact=contacts(d);let png;
    try{d.setReviewHold(true);d.renderFrozenWorld();png=d.renderer.domElement.toDataURL('image/png');}finally{d.setReviewHold(false);}
    const record={pose:p,windFrame:n,contact,snapshot:app.getSnapshot()};
    await save('reach-bank50-'+label+'-'+p.name+'-'+n,png,record);summary.frames.push({name:p.name,windFrame:n,roots:contact.roots,failures:contact.failures,notReady:contact.notReady,errors:record.snapshot.errors});
    if(contact.roots!==521||contact.failures.length||contact.notReady.length)throw Error('Actual contact/complete-root check failed; saved frame');
   }
  }
  await save('reach-bank50-'+label+'-summary',null,summary);return summary;
 }catch(e){await save('reach-bank50-'+label+'-failure',null,{...summary,error:String(e.stack),snapshot:app.getSnapshot(),contacts:contacts(d)});throw e;}
 finally{d.setReviewHold(false);}
}
