import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
globalThis.location={search:'?legacyRoomLazy=1'};
const {RoomIndirectLight}=await import('./room-lighting.js');const {SETTLEMENT_ASSETS}=await import('./settlement-assets.js');const {legacyRooms}=await import('./legacy-room-loader.js');
const item=(source,key,id=key)=>({id,asset:{...SETTLEMENT_ASSETS[source],bounceField:key},pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}});
const night={sun:new T.Vector3(0,-1,0),color:new T.Color(1,1,1),intensity:0,visibility:0};
test('independent cold-night contact loads complete household dependency without enabling sky or solar',async()=>{
 assert.equal(legacyRooms.stats.requests,0);const r=new RoomIndirectLight(),room=item('house_a','house_a-living-1');
 try{r.setRoom(room,0,night,[],1);assert.equal(r.field.key,null);assert.equal(r.contact.stats.active,false);await r.field.prepare();
 assert.equal(r.field.key,null);assert.equal(r.uniforms.uRoomFieldActive.value,0);assert.equal(r.uniforms.uRoomBounceActive.value,0);assert.equal(r.uniforms.uRoomAmbientActive.value,0);assert.equal(r.field.solar.stats.active,false);assert.equal(r.contact.stats.active,true);assert.equal(r.contact.stats.field,'house_a-living-1');assert.equal(legacyRooms.stats.requests,1);
 r.setRoom(room,0,night,[],1);assert.equal(r.contact.stats.active,true);r.clear();assert.equal(r.contact.stats.active,false);
 }finally{r.dispose();}
});
test('leaving or disposing during cold-yurt contact preparation cannot install stale room',async()=>{
 const r=new RoomIndirectLight(),room=item('yurt','yurt');r.setRoom(room,0,night,[],1);const pending=r.field.prepare();r.clear();await pending;assert.equal(r.contact.stats.active,false);assert.equal(r.field.key,null);
 r.setRoom(room,0,night,[],1);await r.field.prepare();assert.equal(r.contact.stats.active,true);assert.equal(r.field.uniforms.uRoomFieldActive.value,0);r.dispose();assert.equal(r.contact.cache.size,0);
 const q=new RoomIndirectLight();q.setRoom(item('house_a','house_a-living-2'),0,night,[],1);const p=q.field.prepare();q.dispose();await p;assert.equal(q.contact.cache.size,0);assert.equal(q.contact.stats.active,false);
});
test('cold contact failure stays observable after pending settles; explicit room retry restores contact only',async()=>{
 const r=new RoomIndirectLight(),room=item('house_a','house_a-living-0'),original=r.field.prepareHousehold.bind(r.field);r.field.prepareHousehold=()=>Promise.reject(Error('contact unavailable'));
 try{r.setRoom(room,0,night,[],1);await assert.rejects(r.field.prepare(),/contact unavailable/);await assert.rejects(r.field.prepare(),/contact unavailable/);assert.equal(r.contact.stats.active,false);
 r.field.prepareHousehold=original;r.setRoom(room,0,night,[],1);await r.field.prepare();assert.equal(r.contact.stats.active,true);assert.equal(r.field.uniforms.uRoomFieldActive.value,0);
 }finally{r.dispose();}
});
