import {houseTimberNodeOptions48,houseFurnitureNodeOptions58,installHouseTimberNodeCanvas48,assertDefaultHouseTimber48,assertDefaultHouseFurniture58} from './test-support/house-timber48-node.js';
installHouseTimberNodeCanvas48();
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,inflateSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {WorldStructures} from './structures.js';
import {WorldDoors} from './doors.js';
import {WorldCollision,WALK_BODY,walkingViewpoints} from './collision.js';
import {householdEntryStepRecipes,HOUSEHOLD_ENTRY_ASSET,validateHouseholdEntrySource} from './household-entry-steps.js';
import {createHash} from 'node:crypto';
const root=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,root))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
function rgbPNG(name){
 const file=readFileSync(new URL(name,root)),parts=[];let width,height;
 for(let i=8;i<file.length;){const n=file.readUInt32BE(i),tag=file.toString("ascii",i+4,i+8),data=file.subarray(i+8,i+8+n);
  if(tag==="IHDR"){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],2);assert.equal(data[12],0);}
  if(tag==="IDAT")parts.push(data);i+=n+12;
 }
 const packed=inflateSync(Buffer.concat(parts)),stride=width*3,decoded=new Uint8Array(stride*height),data=new Uint8Array(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=packed[y*(stride+1)];for(let x=0;x<stride;x++){
  const a=x<3?0:decoded[y*stride+x-3],b=y?decoded[(y-1)*stride+x]:0,c=y&&x>=3?decoded[(y-1)*stride+x-3]:0;
  const prediction=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):NaN;assert.ok(Number.isFinite(prediction));
  decoded[y*stride+x]=(packed[y*(stride+1)+x+1]+prediction)&255;
 }}
 for(let i=0;i<width*height;i++){data.set(decoded.subarray(i*3,i*3+3),i*4);data[i*4+3]=255;}
 return{width,height,data};
}
const worlds=new Map();
function actual(riverMeanders,demInterpolation="bilinear"){
 const key=String(riverMeanders)+"/"+demInterpolation;
 if(worlds.has(key))return worlds.get(key);
 const meta=json("data/scene.json");
 const world=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
  coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
  detailBytes:bin("data/detail.bin.gz"),coreLandcover:rgbPNG("data/core_landcover.png"),farLandcover:rgbPNG("data/far_landcover.png"),riverMeanders,demInterpolation});
 worlds.set(key,world);return world;
}
globalThis.location={search:''};globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
const lodgeFurnitureFetch=async url=>new Response(readFileSync(new URL(url.replace(/^\.\//,'').split('?')[0],root)));
// Preserve the real default timber path, validating local texture bytes with its production loader.
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,...args)=>String(url).startsWith('./assets/')?lodgeFurnitureFetch(url):nativeFetch(url,...args);
const parse=async url=>{const b=readFileSync(new URL(url.replace(/^\.\//,''),root));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const toWorld=(pose,x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z)));

test('actual ground gap gets only the missing level stone courses, preserving existing assets and terrain',async t=>{
 const w=actual(),recipes=householdEntryStepRecipes(w);assert.equal(recipes.length,3);assert.equal(recipes.filter(r=>r.courses.length).length,1);let triangles=0;
 for(const r of recipes){
  if(!r.courses.length){assert.ok(r.existingTreadGap<=.19);continue;}
  assert.ok(r.existingTreadGap>.6);assert.ok(r.courses.length>=3);assert.ok(r.courses.at(-1).groundRise<=.19);
  let last=-.19;for(const c of r.courses){assert.ok((last-c.top)*r.pose.scale.y<=.170001);assert.ok((c.z1-c.z0)*r.pose.scale.z>=.35999);assert.ok((c.x1-c.x0)*r.pose.scale.x>WALK_BODY.radius*2+.5);assert.ok(c.bottom<c.top);
   for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=8;iz++){
    const p=toWorld(r.pose,c.x0+(c.x1-c.x0)*ix/8,0,c.z0+(c.z1-c.z0)*iz/8),g=w.surface.heightAt(p.x,p.z),top=r.pose.y+c.top*r.pose.scale.y,bottom=r.pose.y+c.bottom*r.pose.scale.y;
    assert.ok(top>g+.015,'level tread must remain above actual ground '+JSON.stringify({ix,iz,top,g,c}));assert.ok(bottom<g-.045,'closed stone bases must enter real ground, not float');
   }
   last=c.top;}
  const gltf=await parse('./assets/'+HOUSEHOLD_ENTRY_ASSET.url);gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,1,'all full stones combine into one draw, not simplified geometry');
  const meta=meshes[0].userData;assert.doesNotThrow(()=>validateHouseholdEntrySource(meta,r));for(const change of[m=>m.geometryRevision='initial-10mm',m=>delete m.instanceScale[1],m=>m.courseContract[3]=null,m=>m.courseContract.pop(),m=>m.instanceScale[0]*=1.1,m=>m.entityId='another-house']){const bad=structuredClone(meta);change(bad);assert.throws(()=>validateHouseholdEntrySource(bad,r),/entry source|terrain\/pose/);}
  const geometry=meshes[0].geometry;triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;assert.ok(triangles>1000,'retain the actual separate split stones and support courses');
  const color=geometry.attributes.color;assert.ok(color&&color.count===geometry.attributes.position.count,'export actual baked AO and sky fields');const values=Array.from({length:color.count},(_,i)=>[color.getX(i),color.getY(i),color.getZ(i)]).flat();assert.ok(values.some(v=>v<.9)&&values.every(v=>v>=0&&v<=1),'normalized exported AO/sky stays in range');
  geometry.computeBoundingBox();const bounds=geometry.boundingBox;assert.ok(bounds.max.y<-.19&&bounds.min.z>=4.76-1e-6,'below and in front of retained wooden tread');assert.ok(bounds.min.x>=.23-1e-6&&bounds.max.x<=1.77+1e-6,'same verified vegetation and walking footprint');
  const ray=new THREE.Raycaster();for(const c of r.courses)for(let i=0;i<=10;i++)for(const t of [.2,.5,.8]){
   const x=.48+i*.104,z=c.z0+(c.z1-c.z0)*t;ray.set(new THREE.Vector3(x,c.top+.10,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,'no open hole in walking strip');assert.ok(hit.point.y<=c.top+.001);const joint=r.courses.indexOf(c)%2===0?.76:1.31;if(hit.point.y<c.top-.03){assert.ok(Math.abs(x-joint)*r.pose.scale.x<.025,'only the narrow authored joint may expose the bedding');assert.ok(hit.point.y>=c.top-.12,'the joint still has closed supporting stonework');}
  }
  for(const m of meshes){m.geometry.dispose();m.material.dispose();}
 }
 t.diagnostic(JSON.stringify({sites:recipes.map(r=>({entityId:r.entityId,gap:r.existingTreadGap,courses:r.courses.length,groundRise:r.courses.at(-1)?.groundRise})),triangles}));
});

test('default editable, closed-shadow candidate and explicit v33 use complete render/Rapier meshes with all three real household entry/exit/door gates',async t=>{
 const previous=globalThis.location;let editableGeometrySignature=null;try{for(const [mode,shadowMode,search] of [['v33','standard','?householdEntry=v33&householdEntryShadow=closed'],['editable','standard',''],['editable','closed','?householdEntryShadow=closed']]){
 globalThis.location={search};
 const w=actual(),doors=new WorldDoors(),structures=new WorldStructures(w,{houseTimber48Options:houseTimberNodeOptions48,houseFurniture58Options:houseFurnitureNodeOptions58,doors,lodgeInteriorWood:false,loadAsset:parse,lodgeFurnitureFetch,lodgeTablesFetch:lodgeFurnitureFetch,lodgeChairsFetch:lodgeFurnitureFetch,guestLivingFetch:lodgeFurnitureFetch,guestVanityFetch:lodgeFurnitureFetch});await structures.load();assertDefaultHouseTimber48(structures);assertDefaultHouseFurniture58(structures);await structures.loadHouseholdLiving({loadAsset:parse});const reports=[];assert.equal(structures.householdEntrySteps.stats.mode,mode);assert.equal(structures.householdEntrySteps.stats.shadowMode,shadowMode);assert.equal(structures.householdEntrySteps.stats.drawMeshes,1);assert.equal(structures.householdEntrySteps.stats.triangles,mode==='editable'?2752:176);
 try{
  for(const r of householdEntryStepRecipes(w)){
   const entity=w.entities.find(e=>e.id===r.entityId),parts=structures.householdEntrySteps.partsFor(entity),mesh=structures.householdEntrySteps.group.children.find(m=>m.userData.entityId===r.entityId);
   if(parts.length){assert.strictEqual(mesh.geometry,parts[0].geometry);assert.ok(structures.collisionPartsFor(entity).includes(parts[0]));assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);assert.ok(mesh.customDepthMaterial);}
   if(parts.length&&mode==='editable'){
    const signature=Object.fromEntries([...Object.entries(mesh.geometry.attributes),['index',mesh.geometry.index]].map(([name,a])=>[name,{count:a.count,itemSize:a.itemSize,normalized:a.normalized,sha:createHash('sha256').update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex')}]));
    if(editableGeometrySignature)assert.deepEqual(signature,editableGeometrySignature,'candidate retains every full geometry/AO/UV/normal/index byte');else editableGeometrySignature=signature;
    const canonical=structures.materials.find(m=>m.userData.sourceMaterialNames?.includes('stone'));assert.strictEqual(mesh.material,canonical);assert.equal(canonical.side,THREE.DoubleSide);assert.equal(canonical.shadowSide,null);assert.equal(structures.householdEntrySteps.stats.newMaterials,0);assert.equal(structures.householdEntrySteps.stats.newTextures,0);
    if(shadowMode==='closed'){
     assert.equal(mesh.customDepthMaterial.side,THREE.BackSide);assert.equal(structures.householdEntrySteps.stats.closedShadow.geometry.components,32);const args=[{},mesh,{}, {},mesh.geometry,mesh.customDepthMaterial,null];mesh.customDepthMaterial.side=canonical.side;mesh.onBeforeShadow(...args);assert.equal(mesh.customDepthMaterial.side,THREE.BackSide);mesh.onAfterShadow(...args);assert.equal(structures.householdEntrySteps.stats.closedShadow.completedDraws,1);
    }else{assert.strictEqual(mesh.onBeforeShadow,THREE.Object3D.prototype.onBeforeShadow);assert.equal(mesh.customDepthMaterial.side,THREE.DoubleSide);}
   }
   if(parts.length){
    const before=new WorldCollision(w,{structures:{collisionPartsFor:e=>structures.collisionPartsFor(e).filter(p=>!structures.householdEntrySteps.partsFor(e).includes(p))},doors}),p0=toWorld(r.pose,1,0,7.6);p0.y=w.surface.heightAt(p0.x,p0.z)+WALK_BODY.eye+.04;await before.enable(p0);
    const direction=new THREE.Vector3(-Math.sin(r.pose.rot),0,-Math.cos(r.pose.rot)).multiplyScalar(.025);for(let i=0;i<260;i++)before.move(p0,direction,1/30);
    const local0=p0.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);local0.z/=r.pose.scale.z;assert.ok(local0.z>4.76,'same actual entrance blocks without new steps '+local0.toArray());t.diagnostic('Baseline without stones blocked at local z='+local0.z);before.dispose();
   }
   const collision=new WorldCollision(w,{structures,doors}),p=toWorld(r.pose,1,0,7.6);p.y=w.surface.heightAt(p.x,p.z)+WALK_BODY.eye+.04;
   await collision.enable(p);const start=p.clone(),toward=new THREE.Vector3(-Math.sin(r.pose.rot),0,-Math.cos(r.pose.rot)).multiplyScalar(.025);
   const editableRoute=mode==='editable'&&parts.length>0,limit=editableRoute?300:260,forward=toward.clone().normalize();let maxFoot=start.y-WALK_BODY.eye,contacts=0,entryFrames=0,minProgress=Infinity,maxDrift=0,atOriginalDeadline=null;
   // Retain the original .75m/s diagnostic deadline as well as deeper progress.
   // Production crouch/walk cadence coverage is separate below.
   for(let i=0;i<limit;i++){
    const before=p.clone();collision.move(p,toward,1/30);maxFoot=Math.max(maxFoot,p.y-WALK_BODY.eye);contacts+=collision.stats.collisions;entryFrames=i+1;if(i===259){atOriginalDeadline=p.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);atOriginalDeadline.z/=r.pose.scale.z;}
    if(editableRoute){
     const progress=p.clone().sub(before).dot(forward),q=p.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);q.x/=r.pose.scale.x;q.z/=r.pose.scale.z;const drift=Math.abs((q.x-1)*r.pose.scale.x);minProgress=Math.min(minProgress,progress);maxDrift=Math.max(maxDrift,drift);
     assert.ok(progress>.0001,'no entry plateau at frame '+i);assert.ok(drift<.01,'no capsule drift out of centered entry');if(q.z<1.5)break;
    }
   }
   const local=p.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);local.x/=r.pose.scale.x;local.z/=r.pose.scale.z;
   if(editableRoute)await t.test('editable '+shadowMode+' shadow retains the original z<2 at260 same-input timing gate',()=>assert.ok(atOriginalDeadline.z<2,'original timing gate FAILED at local z='+atOriginalDeadline.z));
   assert.ok(local.z<(editableRoute?1.5:2),'must walk up from actual ground into open house '+mode+' '+r.entityId+' '+local.toArray());assert.ok(maxFoot>r.pose.y-.02,'must reach actual indoor floor');
   for(let i=0;i<260;i++)collision.move(p,toward.clone().negate(),1/30);const end=p.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);end.z/=r.pose.scale.z;
   assert.ok(end.z>7.0,'must walk back down to exterior');assert.ok(Math.abs(p.y-WALK_BODY.eye-w.surface.heightAt(p.x,p.z))<.2,'return to ground');reports.push({mode,entryFrames,originalTimingGate:{frames:260,targetZ:2,observedZ:atOriginalDeadline?.z,passed:atOriginalDeadline?.z<2},minProgress:editableRoute?minProgress:null,maxDrift:editableRoute?maxDrift:null,entityId:r.entityId,courses:r.courses.length,enteredLocal:local.toArray(),exitedLocal:end.toArray(),contacts,maxFootAboveHouse:maxFoot-r.pose.y});collision.dispose();
   doors.toggle(r.entityId);for(let i=0;i<25;i++)doors.update(null,.1);assert.equal(doors.openness(r.entityId),0,'retained door can close fully without stone overlap');
   const closed=new WorldCollision(w,{structures,doors}),p2=toWorld(r.pose,1,0,7.6);p2.y=w.surface.heightAt(p2.x,p2.z)+WALK_BODY.eye+.04;await closed.enable(p2);for(let i=0;i<260;i++)closed.move(p2,toward,1/30);const local2=p2.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);local2.z/=r.pose.scale.z;assert.ok(local2.z>2.65&&local2.z<3.3,'closed original door still blocks, not new stones');closed.dispose();doors.toggle(r.entityId);for(let i=0;i<25;i++)doors.update(null,.1);
  }
  t.diagnostic(JSON.stringify({stats:structures.householdEntrySteps.stats,reports}));
 }finally{structures.dispose();doors.dispose();}
 }}finally{globalThis.location=previous;}
});


test('entry exports retain editable-source provenance, existing full material and no duplicated images',()=>{
 const meta=JSON.parse(readFileSync(new URL('../../../assets/src/v2/pastoral/household-entry-tea-34.metadata.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex'),source=readFileSync(new URL('../../../'+meta.sourceBlend,import.meta.url)),raw=readFileSync(new URL('../../public/'+meta.sourceGLB,import.meta.url)),doc=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
 assert.equal(source.toString('ascii',0,7),'BLENDER');assert.equal(sha(source),meta.blendSHA256);assert.equal(sha(raw),meta.sourceSHA256);assert.equal(meta.entityId,HOUSEHOLD_ENTRY_ASSET.entityId);assert.equal(meta.newTextures,0);assert.equal(meta.geometryRevision,'front-bevel-17p111mm');assert.ok(meta.stones.length>20);assert.equal(meta.stones.filter(s=>s.kind==='tread').length,8);assert.equal((doc.images||[]).length,0);assert.equal(doc.meshes.length,1);
 for(const[path,digest]of Object.entries(meta.unchangedOriginalSources))assert.equal(sha(readFileSync(new URL('../../../'+path,import.meta.url))),digest,'original source must stay byte-identical');
 if(meta.localSourceBinding){const proof=JSON.parse(readFileSync(new URL('../../../'+meta.localSourceBinding.verification,import.meta.url)));assert.equal(proof.pairs.length,2);for(const pair of proof.pairs){assert.equal(pair.renderGIInputsEqual,true);assert.equal(meta.handoffOriginalSources[pair.path],pair.handoffSHA256);assert.equal(meta.unchangedOriginalSources[pair.path],pair.canonicalSHA256);}}
});

// controls.js uses these speeds and clamps horizontal input dt to .05 seconds.
test('actual production crouch and walk inputs cross the real entry at30 and60Hz with closed-door blocking',async t=>{
 const previous=globalThis.location;try{
const results=[];
for(const mode of ['v33','editable']){
 globalThis.location={search:'?householdEntry='+(mode==='v33'?'v33':'editable')};const w=actual(),doors=new WorldDoors(),structures=new WorldStructures(w,{houseTimber48Options:houseTimberNodeOptions48,houseFurniture58Options:houseFurnitureNodeOptions58,doors,lodgeInteriorWood:false,loadAsset:parse,lodgeFurnitureFetch,lodgeTablesFetch:lodgeFurnitureFetch,lodgeChairsFetch:lodgeFurnitureFetch,guestLivingFetch:lodgeFurnitureFetch,guestVanityFetch:lodgeFurnitureFetch});await structures.load();assertDefaultHouseTimber48(structures);assertDefaultHouseFurniture58(structures);await structures.loadHouseholdLiving({loadAsset:parse});const r=householdEntryStepRecipes(w).find(r=>r.courses.length),toLocal=p=>{const q=p.clone().sub(new THREE.Vector3(r.pose.x,r.pose.y,r.pose.z)).applyAxisAngle(new THREE.Vector3(0,1,0),-r.pose.rot);q.x/=r.pose.scale.x;q.z/=r.pose.scale.z;return q;};
 for(const crouch of [true,false])for(const hz of [30,60]){
  const speed=crouch?1.4:2.8,dt=1/hz,eye=crouch?WALK_BODY.crouchEye:WALK_BODY.eye,dir=new THREE.Vector3(-Math.sin(r.pose.rot),0,-Math.cos(r.pose.rot)).multiplyScalar(speed*Math.min(dt,.05)),axis=dir.clone().normalize(),p=toWorld(r.pose,1,0,7.6);p.y=w.surface.heightAt(p.x,p.z)+WALK_BODY.eye+.04;const collision=new WorldCollision(w,{structures,doors});await collision.enable(p);collision.setCrouching(crouch,p);let plateau=0,longestPlateau=0,maxDrift=0,entryFrames=0;
  for(let i=0;i<10*hz;i++){const before=p.clone();collision.move(p,dir,dt,{crouch});const q=toLocal(p),forward=p.clone().sub(before).dot(axis);plateau=forward<.0001?plateau+1:0;longestPlateau=Math.max(longestPlateau,plateau);maxDrift=Math.max(maxDrift,Math.abs((q.x-1)*r.pose.scale.x));entryFrames=i+1;if(q.z<1.5)break;}
  assert.ok(toLocal(p).z<1.5,mode+' production-speed entry');assert.ok(longestPlateau<.5*hz,'no sustained entry stall');const entered=toLocal(p).toArray();let exitFrames=0;
  for(;exitFrames<10*hz;exitFrames++){collision.move(p,dir.clone().negate(),dt,{crouch});if(toLocal(p).z>7.2)break;}assert.ok(toLocal(p).z>7.2,'production-speed exit');assert.ok(Math.abs(p.y-eye-w.surface.heightAt(p.x,p.z))<.2,'returns to actual ground');const exited=toLocal(p).toArray();collision.dispose();doors.toggle(r.entityId);for(let i=0;i<25;i++)doors.update(null,.1);
  const p2=toWorld(r.pose,1,0,7.6);p2.y=w.surface.heightAt(p2.x,p2.z)+WALK_BODY.eye+.04;const closed=new WorldCollision(w,{structures,doors});await closed.enable(p2);closed.setCrouching(crouch,p2);let stationary=0,closedFrames=0;
  for(;closedFrames<10*hz;closedFrames++){const before=p2.clone();closed.move(p2,dir,dt,{crouch});stationary=p2.clone().sub(before).dot(axis)<.0001?stationary+1:0;const q=toLocal(p2);if(stationary>=Math.ceil(.4*hz)&&q.z>2.65&&q.z<3.3)break;}
  const blocked=toLocal(p2).toArray();assert.ok(blocked[2]>2.65&&blocked[2]<3.3,'closed door still blocks at real speeds');assert.ok(stationary>=Math.ceil(.4*hz));closed.dispose();doors.toggle(r.entityId);for(let i=0;i<25;i++)doors.update(null,.1);
  results.push({mode,speed,crouch,hz,dt,requestedMetresPerFrame:dir.length(),entryFrames,entrySeconds:entryFrames/hz,exitFrames:exitFrames+1,exitSeconds:(exitFrames+1)/hz,longestPlateau,maxDrift,entered,exited,closedDoor:blocked,stationaryClosedFrames:stationary});
 }
 structures.dispose();doors.dispose();
}
t.diagnostic(JSON.stringify(results));
 }finally{globalThis.location=previous;}
});

// This menu entry must reproduce the same actual exterior starting point used
// by the full-geometry Rapier route, instead of the different legacy household.
test('tea walking menu starts on the real exterior ground facing its authored door',()=>{
 const w=actual(),r=householdEntryStepRecipes(w).find(r=>r.entityId===HOUSEHOLD_ENTRY_ASSET.entityId);
 const v=walkingViewpoints(w).find(v=>v.id==='walk-household-tea');assert.ok(v);
 const p=toWorld(r.pose,1,0,7.6);assert.ok(Math.hypot(v.x-p.x,v.z-p.z)<1e-9);
 assert.ok(Math.abs(v.y-w.surface.heightAt(v.x,v.z)-WALK_BODY.eye-.04)<1e-9);
 assert.equal(v.yaw,-r.pose.rot*180/Math.PI);
});


test('continuous DEM preserves every authored pose and exact entry source contract',async()=>{
 const original=actual(),candidate=actual(undefined,'monotone');
 for(const e of original.entities){
  assert.deepEqual(candidate.surface.buildingPose(e.id),original.surface.buildingPose(e.id),e.id);
 }
 const a=householdEntryStepRecipes(original),b=householdEntryStepRecipes(candidate);
 assert.deepEqual(b,a,'do not adjust stone source tolerance or stretch entry geometry');
 const gltf=await parse('./assets/'+HOUSEHOLD_ENTRY_ASSET.url);
 gltf.scene.traverse(node=>{if(node.isMesh){
  const recipe=b.find(r=>r.entityId===node.userData.entityId);
  assert.doesNotThrow(()=>validateHouseholdEntrySource(node.userData,recipe));
  node.geometry.dispose();node.material.dispose();
 }});
});
