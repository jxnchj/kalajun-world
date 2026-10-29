// Served one-page acceptance helper. No production import and no new GPU page.
const next=()=>new Promise(r=>requestAnimationFrame(r));
async function save(name,png,snapshot){const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,png,snapshot})});if(!r.ok)throw Error('Evidence save '+r.status);}
export function reach73Poses(){return [
 {name:'root-mat',position:[-3617.8525177268957,2328.681789377489,4804.100191430216],yaw:89.2232800066879,pitch:-30.255864781470965},
 {name:'pool-cross',position:[-3615.042952009888,2328.9339792115034,4808.171080365821],yaw:-75.00270622544625,pitch:-35.49410676629518},
 {name:'whole-bend',position:[-3618.613451214993,2329.1348867802844,4801.611106420018],yaw:156.57083120044828,pitch:-19.615258339625512}
];}
function contacts(d){const c=d.ecology.reachBankCover39,roots=c.pools.flatMap(p=>p.records);return{roots:roots.length,pending:c.stats.pending,stats:structuredClone(c.stats),failures:roots.filter(r=>r.contactFailure).map(r=>({id:r.id,failure:r.contactFailure})),notReady:roots.filter(r=>!r.contactReady).map(r=>r.id),identity:roots.map(r=>({id:r.id,kind:r.kind,x:r.x,z:r.z,y:r.y,s:r.s,sy:r.sy,rot:r.rot,vertices:r.coverAsset.geometry.attributes.position.count,indices:r.coverAsset.geometry.index.count}))};}
async function settle(app,d){
 const end=performance.now()+240000;let stable=0;
 while(performance.now()<end){await next();if(document.visibilityState!=='visible')throw Error('Hidden page invalidates acceptance');const s=app.getSnapshot();if(s.errors.length)throw Error(JSON.stringify(s.errors));const c=d.ecology.reachBankCover39;if(!s.preparing&&s.terrain.queuedTiles===0&&d.terrain.morphs.size===0&&c.stats.built&&c.stats.pending===0){if(++stable===5)return;}else stable=0;}
 throw Error('Actual geometry/contact did not settle within240s');
}
export async function captureReach73(app,{label='original',poses:fixedPoses,prefix='reach-design73'}={}){
 if(!['original','candidate','restored'].includes(label))throw Error('label');
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(prefix))throw Error('prefix');
 const d=app.debug;if(!d)throw Error('debug=1 required');const s=app.getSnapshot();
 if(s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1)throw Error('Set actual1280x800 DPR1 before capture');
 if(s.time!==870)throw Error('time870 required');
 const reachStats=app.world.hydrology.forestReach39.stats,design73=reachStats.design73??null,candidate=Boolean(design73);if(candidate!==(label==='candidate'))throw Error('Wrong source variant');if(reachStats.profile48||reachStats.design50)throw Error('Old profile48 and design50 must be OFF');
 const owner=d.reachDesign73Owner;if(candidate&&(!owner||owner.uniform?.value!==1||owner.stats?.revision!==design73||s.reachDesign73?.revision!==design73))throw Error('73 material owner must be enabled and match the actual world');if(!candidate&&owner?.uniform?.value)throw Error('Default source cannot use enabled 73 material');
 // Both builds use these original-world absolute poses; never recompute from candidate height.
 const poses=structuredClone(fixedPoses??reach73Poses());
 if(poses.length!==3||poses.some(p=>!Array.isArray(p.position)||p.position.length!==3||![...p.position,p.yaw,p.pitch].every(Number.isFinite)))throw Error('Invalid fixed poses');
 const runId=Date.now().toString(36);const summary={label,candidate,design73,runId,poses,frames:[],scope:'geometry/art correctness only, not performance'};
 d.setReviewHold(false);
 try{
  for(const p of poses){
   d.controls.setPose(p.position[0],p.position[2],0,p.yaw,p.pitch,p.position[1]);await settle(app,d);
   const count=2;
   for(let n=0;n<count;n++){
    if(n)for(let j=0;j<20;j++)await next();
    const contact=contacts(d);let png;
    try{d.setReviewHold(true);d.renderFrozenWorld();png=d.renderer.domElement.toDataURL('image/png');}finally{d.setReviewHold(false);}
    const record={pose:p,windFrame:n,design73,runId,contact,snapshot:app.getSnapshot()};
    await save(prefix+'-'+label+'-'+p.name+'-'+n,png,record);summary.frames.push({name:p.name,windFrame:n,roots:contact.roots,failures:contact.failures,notReady:contact.notReady,errors:record.snapshot.errors});
    if(contact.roots!==521||contact.failures.length||contact.notReady.length)throw Error('Actual contact/complete-root check failed; saved frame');
   }
  }
  await save(prefix+'-'+label+'-summary',null,summary);return summary;
 }catch(e){await save(prefix+'-'+label+'-failure-'+runId,null,{...summary,error:String(e.stack),snapshot:app.getSnapshot(),contacts:contacts(d)});throw e;}
 finally{d.setReviewHold(false);}
}
