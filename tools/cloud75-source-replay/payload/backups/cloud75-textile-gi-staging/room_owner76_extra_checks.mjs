// Prepared extension: real contact class + OFF family/unrelated registry/owner integration.
// No GPU, no asset mutation. Run against candidate data only through reviewed parent checker.
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=p=>pathToFileURL(path.join(ROOT,'web/src/v2',p)).href;
const families=['house_a','house_a-living-0','house_a-living-1','house_a-living-2','house_a-entry-tea-34'];
async function contactInstances(data,keys){
 const {RoomContactField,decodeRoomContact}=await import(source('room-contact.js'));
 const {Vector3}=await import(pathToFileURL(path.join(ROOT,'web/node_modules/three/build/three.module.js')));
 const records=[];
 for(const key of keys){
  const a=new RoomContactField({data}),b=new RoomContactField({data});
  const item={asset:{sourceAsset:'house_a',bounceField:key},pose:{x:4,y:2,z:-3,rot:Math.PI/3,scale:{x:1,y:1,z:1}}};
  a.set(item);b.set({...item,pose:{...item.pose,x:-7,rot:-Math.PI/4}});
  const ta=a.uniforms.uRoomContactMap.value,tb=b.uniforms.uRoomContactMap.value;
  assert.equal(a.key,key);assert.equal(a.instance,item);assert.equal(a.uniforms.uRoomContactActive.value,1);assert.equal(ta.isDataTexture,true);assert.notEqual(ta,tb);
  assert.deepEqual(ta.image.data,decodeRoomContact(data[key]));
  const local=new Vector3(item.pose.x,item.pose.y,item.pose.z).applyMatrix4(a.uniforms.uRoomContactWorldToLocal.value);assert.ok(local.length()<1e-10,'Instance origin must map to its own local origin');
  const otherLocal=new Vector3(item.pose.x,item.pose.y,item.pose.z).applyMatrix4(b.uniforms.uRoomContactWorldToLocal.value);assert.ok(otherLocal.length()>1,'Different instance transform must not leak');
  const frozenB=b.uniforms.uRoomContactWorldToLocal.value.clone();
  const moved={...item,pose:{...item.pose,x:20}};a.set(moved);assert.equal(a.cache.get(key),ta,'Per-family cache is reused within instance');assert.equal(b.uniforms.uRoomContactWorldToLocal.value.equals(frozenB),true);
  let disposals=0;ta.addEventListener('dispose',()=>disposals++);a.clear();assert.equal(a.key,null);assert.equal(a.uniforms.uRoomContactActive.value,0);assert.equal(a.uniforms.uRoomContactMap.value,a.empty);a.dispose();assert.equal(disposals,1);assert.equal(a.cache.size,0);assert.equal(b.key,key);assert.equal(b.uniforms.uRoomContactMap.value,tb);b.dispose();
  records.push({key,actualContactClass:true,instanceTransformIsolation:true,textureIsolation:true,cacheReuse:true,clearAndDispose:true});
 }
 return records;
}
export async function extraOwnerChecks({mode,reads,geometryHash}){
 assert.ok(mode==='ON'||mode==='OFF');
 const {legacyRooms}=await import(source('legacy-room-loader.js'));
 const {prepareHouseholdRoom}=await import(source('household-room-fields.js'));
 const {ROOM_BOUNCE_DATA}=await import(source('room-bounce-registry.js'));
 const {ROOM_CONTACT_DATA}=await import(source('room-contact-registry.js'));
 const {RoomBounceField}=await import(source('room-bounce-field.js'));
 const {Quaternion}=await import(pathToFileURL(path.join(ROOT,'web/node_modules/three/build/three.module.js')));
 const before=reads.size;
 for(const key of families){
  if(key==='house_a')await legacyRooms.prepare(key);else await prepareHouseholdRoom(key);
  for(const map of [ROOM_BOUNCE_DATA,ROOM_CONTACT_DATA]){assert.ok(map[key]);if(mode==='ON')assert.equal(map[key].derivedGeometry.geometrySHA256,geometryHash);else assert.equal(map[key].derivedGeometry,undefined);}
  if(mode==='OFF'){const field=new RoomBounceField();field.set({sourceAsset:'house_a',bounceField:key},new Quaternion());await field.prepare();assert.equal(field.key,key);assert.equal(field.uniforms.uRoomBounceField.value.isData3DTexture,true);field.dispose();}
 }
 if(mode==='OFF')assert.equal(reads.size,0,'All five OFF families must avoid staged GI');
 const contact=await contactInstances(ROOM_CONTACT_DATA,families);
 const existing=Object.fromEntries(families.map(key=>[key,ROOM_BOUNCE_DATA[key]]));
 await legacyRooms.prepare('yurt');assert.equal(ROOM_BOUNCE_DATA.yurt.derivedGeometry,undefined);assert.equal(ROOM_CONTACT_DATA.yurt.derivedGeometry,undefined);
 const unrelated=new RoomBounceField();unrelated.set({sourceAsset:'yurt'},new Quaternion());await unrelated.prepare();assert.equal(unrelated.key,'yurt');assert.equal(unrelated.uniforms.uRoomBounceField.value.isData3DTexture,true);unrelated.dispose();
 for(const key of families)assert.equal(ROOM_BOUNCE_DATA[key],existing[key],'Unrelated room replaced house family');
 assert.equal(reads.size,before,'These already-prepared/OFF families and unrelated yurt must not import extra candidate GI');
 return {mode,contact,offFamilies:mode==='OFF'?families:[],unrelated:'yurt',gpuTested:false,nativeAcceptance:'NOT RUN',contactSourceGuard:'RoomContactField itself has no source hash validation; actual registry/upstream staged guards own source binding'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv[2],'--self-test');globalThis.location={search:'?legacyRoomLazy=1&houseTextiles62=0'};
 const field={size:[2,2],bounds:[[0,0],[1,1]],heightRange:[-.1,.1],encoding:'raw8',data:Buffer.from([255,0,128,80,192,120,64,255]).toString('base64')};
 const result=await contactInstances({synthetic:field},['synthetic']);
 console.log(JSON.stringify({status:'PASS_SYNTHETIC_ACTUAL_CONTACT_CLASS_ONLY',result,candidateAcceptance:false,gpuTested:false,offFamilyIntegration:'NOT RUN',unrelatedRoomIntegration:'NOT RUN'}));
}
