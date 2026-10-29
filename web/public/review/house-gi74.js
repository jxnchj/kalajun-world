// Read-only acceptance collector. Never changes doors, camera, time or hold.
const fields=['sky','secondSky','solar','secondSolar','apertures','contact'];
const binding=f=>f?{sourceSHA256:f.sourceSHA256??null,derivedGeometry:f.derivedGeometry??null}:null;
const group=b=>b?Object.fromEntries(fields.filter(k=>b[k]).map(k=>[k,binding(b[k])])):null;
const plain=o=>o==null?null:JSON.parse(JSON.stringify(o));
async function save(name,snapshot){if(!/^[a-zA-Z0-9_-]{1,90}$/.test(name))throw Error('Invalid evidence name');const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot})});if(!r.ok)throw Error('GI74 evidence HTTP '+r.status);}
export function readHouseGI74(app){
 const d=app.debug,f=d.settlements.indirect.field,key=f.key,b=f.householdBundles.get(key),closed=f.doors.fields.get(key)?.data,angles=f.angleDoors,tea=key==='house_a-entry-tea-34',owner=tea?angles.tea:angles.pastoral,children=tea?owner.children:owner.rooms.get(key)?.children;
 const contact=d.settlements.indirect.contact;
 const result={key,time:app.getSnapshot().time,visibility:document.visibilityState,cloth:plain(d.structures._houseTextiles62?.stats),open:group(b),solar:binding(f.solar.data[key]),secondSolar:binding(f.solar.secondData[key]),contact:binding(contact.data[contact.key]),closed:group(closed),angles:children?[...children].map(([degree,child])=>({degree,fields:group(child.fields.get(key)?.data)})):[],doorFraction:f.doorFraction,doorStats:plain(d.doors.stats.active),household:plain(f.stats.household),angleStats:plain(owner.stats),bracket:plain(owner.bracket),weights:plain(owner.weights),errors:app.getSnapshot().errors};
 const all=[...Object.values(result.open??{}),...Object.values(result.closed??{}),result.solar,result.secondSolar,result.contact,...result.angles.flatMap(a=>Object.values(a.fields??{}))].filter(Boolean);
 const ids=[...new Set(all.map(a=>a.derivedGeometry?.geometrySHA256??'original'))];
 result.sourceSummary={records:all.length,geometryHashes:ids,allDerived:all.length>0&&ids.length===1&&ids[0]!=='original',model:ids.length===1&&ids[0]!=='original'?'nine-mesh textile geometry included in finite baked door-state GI; not arbitrary dynamic GI':'original or mixed/not-ready room sources; no textile rebake claim'};
 return result;
}
export async function saveHouseGI74(app,name='house-gi74-state'){const r=readHouseGI74(app);await save(name,r);return r;}
export function startHouseGI74(app,{prefix='house-gi74-native',maxMs=20000,maxFrames=1800}={}){
 const start=performance.now(),states=[],rows=[];let raf=0,done=false,last='',resolve;const finished=new Promise(r=>resolve=r);
 function finish(){if(done)return;done=true;cancelAnimationFrame(raf);resolve({scope:'native interaction observed only; collector never toggles doors or hold',milliseconds:performance.now()-start,states,rows});}
 function sample(){if(done)return;try{const r=readHouseGI74(app),signature=JSON.stringify({key:r.key,source:r.sourceSummary,angles:r.angles.map(a=>a.degree)});if(signature!==last){last=signature;states.push(r);}rows.push({ms:performance.now()-start,key:r.key,door:r.doorStats,source:r.sourceSummary,bracket:r.bracket,weights:r.weights,ready:r.household?.ready,hidden:r.visibility!=='visible',errors:r.errors});if(rows.length>=maxFrames||performance.now()-start>=maxMs)finish();else raf=requestAnimationFrame(sample);}catch(error){rows.push({error:String(error.stack)});finish();}}
 raf=requestAnimationFrame(sample);return{finished,stop:finish,async save(){finish();const r=await finished;await save(prefix,r);return r;}};
}
export function houseDoorGuide74(app){
 const d=app.debug,camera=d.camera??d.controls.camera;if(!camera)throw Error('No actual camera');
 const position=camera.position,forward=position.clone();camera.getWorldDirection(forward);
 const entries=[...d.doors.entries.values()].filter(e=>e.assetId==='house_a').sort((a,b)=>a.center.distanceToSquared(position)-b.center.distanceToSquared(position)),e=entries[0];if(!e)throw Error('No loaded house door');
 const delta=e.center.clone().sub(position),horizontal=position.clone().sub(e.center);horizontal.y=0;if(horizontal.length()<.01)throw Error('Camera lies at hinge center');horizontal.normalize().multiplyScalar(1.6);
 const suggested=e.center.clone().add(horizontal);suggested.y=position.y;const aim=e.center.clone().sub(suggested);return{entity:e.id,center:e.center.toArray(),distance:delta.length(),facingDot:delta.clone().normalize().dot(forward),actualActive:d.doors.active?.id??null,interaction:'F or visible door button; center distance<3m and forward dot>0.1',suggestedSameSidePosition:suggested.toArray(),yaw:Math.atan2(-aim.x,-aim.z)*180/Math.PI,pitch:Math.atan2(aim.y,Math.hypot(aim.x,aim.z))*180/Math.PI,limit:'derived along current interior-camera side; not moved or collision-tested; stay clear of leaf sweep'};
}
