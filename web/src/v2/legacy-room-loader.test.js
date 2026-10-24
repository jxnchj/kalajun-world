import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
// This file has its own Node test process, matching a fresh candidate navigation.
globalThis.location={search:'?legacyRoomLazy=1'};
const {createLegacyRoomLoader,legacyRooms,legacyRoomRegistry,LEGACY_ROOM_TABLES}=await import('./legacy-room-loader.js');
const {RoomBounceField}=await import('./room-bounce-field.js');
const {RoomContactField}=await import('./room-contact.js');
const {ROOM_BOUNCE_DATA}=await import('./room-bounce-registry.js');
const {SETTLEMENT_ASSETS}=await import('./settlement-assets.js');
test('outdoor module load and preparation request no legacy room; registry identity is stable',async()=>{
 assert.strictEqual(ROOM_BOUNCE_DATA,legacyRoomRegistry.ROOM_BOUNCE_DATA);assert.equal(legacyRooms.stats.requests,0);const f=new RoomBounceField();await f.prepare();assert.equal(legacyRooms.stats.requests,0);f.dispose();
});
test('same key shares load, failure publishes nothing and explicit retry restores all five tables',async()=>{
 const bundle=(await import('./legacy-room-data/house_a.js')).default;let calls=0,release;
 const l=createLegacyRoomLoader({loaders:{house_a:async()=>{calls++;if(calls===1)throw Error('network down');await new Promise(r=>release=r);return bundle;}}});
 const first=l.prepare('house_a');assert.strictEqual(first,l.prepare('house_a'));await assert.rejects(first,/network down/);for(const t of LEGACY_ROOM_TABLES)assert.deepEqual(l.registry[t],{});
 const second=l.prepare('house_a');assert.strictEqual(second,l.prepare('house_a'));await Promise.resolve();release();await second;assert.equal(calls,2);for(const t of LEGACY_ROOM_TABLES)assert.strictEqual(l.registry[t].house_a,bundle[t]);assert.equal(l.stats.loadedRooms,1);
 const bad=createLegacyRoomLoader({loaders:{house_a:async()=>({...bundle,ROOM_CONTACT_DATA:{...bundle.ROOM_CONTACT_DATA,sourceSHA256:'wrong'}})}});await assert.rejects(bad.prepare('house_a'),/source differs/);for(const t of LEGACY_ROOM_TABLES)assert.deepEqual(bad.registry[t],{});
});
test('indoor startup waits for actual complete sky/solar/aperture/contact, switch and leave keep current selection',async()=>{
 const f=new RoomBounceField(),contact=new RoomContactField(),asset=SETTLEMENT_ASSETS.house_a,rotation=new T.Matrix3(),item={asset,pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}};
 try{f.set(asset,rotation);assert.equal(f.key,'house_a');assert.equal(f.uniforms.uRoomFieldActive.value,0);await Promise.all([f.prepare(),f.prepare()]);assert.equal(f.uniforms.uRoomFieldActive.value,1);assert.ok(f.solar.secondData.house_a);assert.ok(f.doors.fields.has('house_a'));contact.set(item);assert.equal(contact.stats.active,true);for(const t of LEGACY_ROOM_TABLES)assert.ok(legacyRoomRegistry[t].house_a);
 const before=legacyRooms.stats.requests;f.set(SETTLEMENT_ASSETS.yurt,rotation);const p=f.prepare();f.clear();await p;assert.equal(f.key,null);assert.equal(f.uniforms.uRoomFieldActive.value,0);assert.equal(legacyRooms.stats.requests,before+1);
 f.set(SETTLEMENT_ASSETS.yurt,rotation);await f.prepare();assert.equal(f.key,'yurt');assert.equal(f.uniforms.uRoomFieldActive.value,1);
 }finally{f.dispose();contact.dispose();}
});

test('field load errors stay visible and prepare retries without publishing another room',async()=>{
 const original=legacyRooms.prepare;let attempts=0;legacyRooms.prepare=function(key){if(key==='lanchuan-freedom-1'&&attempts++===0)return Promise.reject(Error('test unavailable'));return original(key);};
 const f=new RoomBounceField(),asset={bounceField:'lanchuan-freedom-1'};
 try{f.set(asset,new T.Matrix3());await assert.rejects(f.prepare(),/test unavailable/);assert.equal(f.uniforms.uRoomFieldActive.value,0);assert.throws(()=>f.setLighting({},1),/test unavailable/);await f.prepare();assert.equal(f.key,'lanchuan-freedom-1');assert.equal(f.uniforms.uRoomFieldActive.value,1);assert.ok(f.solar.secondData[f.key]);
 for(const key of ['lanchuan-freedom-2','lanchuan-freedom-3']){f.set({bounceField:key},new T.Matrix3());await f.prepare();assert.equal(f.uniforms.uRoomFieldActive.value,1);for(const table of LEGACY_ROOM_TABLES)assert.ok(legacyRoomRegistry[table][key]);}
 }finally{legacyRooms.prepare=original;f.dispose();}
});
test('all split payloads retain exact original bake values in all five source tables',async()=>{
 const tables={'room-bounce-data':'ROOM_BOUNCE_DATA','room-second-bounce-data':'ROOM_SECOND_BOUNCE_DATA','room-transport-data':'ROOM_TRANSPORT_DATA','room-contact-data':'ROOM_CONTACT_DATA','room-aperture-data':'ROOM_APERTURE_DATA'};
 for(const [file,table]of Object.entries(tables)){const original=(await import('./'+file+'.js'))[table];for(const key of Object.keys(original))assert.deepEqual(legacyRoomRegistry[table][key],original[key],table+'/'+key);}
});
