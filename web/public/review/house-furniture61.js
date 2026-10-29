// Served acceptance helper only; no production import. Fixed absolute source poses.
const next=()=>new Promise(r=>requestAnimationFrame(r));
async function save(name,png,snapshot){const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,png,snapshot})});if(!r.ok)throw Error('Evidence save '+r.status);}
export function furniture61Poses(){return [
 {name:'whole-room',position:[-1741.3161458968743,2117.468597447125,3610.814826865227],yaw:-128.8693,pitch:-11.2819},
 {name:'bed-chest',position:[-1742.6724236494395,2116.973714882025,3610.3560206206166],yaw:-144.2298969276747,pitch:-11.83353447106364},
 {name:'window-bench',position:[-1741.8771579919826,2116.9737009254322,3614.0424853386235],yaw:81.48847743115763,pitch:-29.752733414112768}
];}
async function settle(app,d){const end=performance.now()+240000;let stable=0;while(performance.now()<end){await next();const s=app.getSnapshot();if(document.visibilityState!=='visible')throw Error('Hidden page invalidates capture');if(s.errors.length)throw Error(JSON.stringify(s.errors));if(!s.preparing&&s.terrain.queuedTiles===0&&d.terrain.morphs.size===0){if(++stable===5)return;}else stable=0;}throw Error('Scene did not settle within240s');}
export async function captureFurniture61(app,{label='original',poses:fixedPoses}={}){
 if(!['original','candidate','restored'].includes(label))throw Error('label');
 const d=app.debug;if(!d)throw Error('debug=1 required');const s=app.getSnapshot();
 if(s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1)throw Error('Set actual1280x800 DPR1');if(s.time!==870)throw Error('time870 required');
 const poses=structuredClone(fixedPoses??furniture61Poses());if(poses.length!==3||poses.some(p=>!Array.isArray(p.position)||p.position.length!==3||![...p.position,p.yaw,p.pitch].every(Number.isFinite)))throw Error('Invalid fixed poses');
 const runId=Date.now().toString(36),summary={label,runId,poses,frames:[],scope:'fixed-camera visual correctness only; scripted flight positioning, not walking acceptance'};
 d.setReviewHold(false);
 try{for(const p of poses){d.controls.setPose(p.position[0],p.position[2],0,p.yaw,p.pitch,p.position[1]);await settle(app,d);
 const owner=d.structures._houseFurniture58,active=Boolean(owner);if(active!==(label==='candidate'))throw Error('Wrong Furniture58 variant');if(active&&(owner.stats.nodes!==6||owner.stats.vertices!==10800))throw Error('Incomplete furniture source');
 for(let n=0;n<2;n++){if(n)for(let j=0;j<20;j++)await next();let png;try{d.setReviewHold(true);d.renderFrozenWorld();png=d.renderer.domElement.toDataURL('image/png');}finally{d.setReviewHold(false);}
 const snapshot=app.getSnapshot(),record={pose:p,frame:n,runId,active,furniture58:owner?.stats??null,snapshot};await save('house-furniture61-'+label+'-'+p.name+'-'+n,png,record);summary.frames.push({name:p.name,frame:n,active,position:snapshot.position,roomLight:snapshot.roomLight,roomSkyBounce:snapshot.roomSkyBounce,roomContact:snapshot.roomContact,doors:snapshot.doors,errors:snapshot.errors});if(snapshot.errors.length)throw Error(JSON.stringify(snapshot.errors));}}
 await save('house-furniture61-'+label+'-summary',null,summary);return summary;
 }catch(e){await save('house-furniture61-'+label+'-failure-'+runId,null,{...summary,error:String(e.stack),snapshot:app.getSnapshot()});throw e;}finally{d.setReviewHold(false);}
}
