import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {selectTextileGI73,validateTextileGI73,textileGI73Enabled} from './house-textiles-gi73.js';
const keys=['house_a',...Array.from({length:3},(_,i)=>'house_a-living-'+i),'house_a-entry-tea-34'];
test('OFF and unrelated rooms never load textile fields; missing ON fields fail',async()=>{
 assert.equal(textileGI73Enabled(''),false);assert.equal(textileGI73Enabled('?houseTextiles62=0'),false);assert.equal(textileGI73Enabled('?houseTextiles62=1'),true);
 let reads=0;const original={old:true},fallback=()=>original,loaders={house_a:()=>{reads++;throw Error('unexpected');}};
 assert.equal(await selectTextileGI73('house_a',fallback,{enabled:false,loaders}),original);
 assert.equal(await selectTextileGI73('yurt',fallback,{enabled:true,loaders}),original);assert.equal(reads,0);
 await assert.rejects(selectTextileGI73('house_a',fallback,{enabled:true,loaders:{}}),/Missing textile/);
});
test('all actual baked house states bind exact runtime geometry and reject mixed old fields',async()=>{
 const hash=createHash('sha256').update(await readFile(new URL('../../public/assets/v2/house-textiles62/geometry.glb',import.meta.url))).digest('hex');
 for(const key of keys)for(const degree of[null,30,60,90]){
  const b=await selectTextileGI73(key,()=>{throw Error('must not fallback');},{enabled:true,degree});assert.equal(b.key,key);assert.equal(b.derivedGeometry.geometrySHA256,hash);assert.equal(b.derivedGeometry.manifestSHA256,createHash('sha256').update(await readFile(new URL('../../public/assets/v2/house-textiles62/manifest.json',import.meta.url))).digest('hex'));assert.equal(b.sky.blendSHA256,createHash('sha256').update(await readFile(new URL('../../../'+b.sky.sourceBlend,import.meta.url))).digest('hex'));
  for(const st of[b,...b.closed?[b.closed]:[]])for(const f of['sky','secondSky','solar','secondSolar','apertures'])assert.deepEqual(st[f].derivedGeometry,b.derivedGeometry);
  const broken=structuredClone(b);delete broken.solar.derivedGeometry;assert.throws(()=>validateTextileGI73(broken),/derived geometry/);
  const wrong=structuredClone(b);wrong.derivedGeometry.geometrySHA256='wrong';assert.throws(()=>validateTextileGI73(wrong),/derived geometry/);
 }
});
test('fresh ON runtime loads all house families and actual closed/intermediate door owners',()=>{
 const code=`globalThis.location={search:'?houseTextiles62=1'};
 const {legacyRooms}=await import('./web/src/v2/legacy-room-loader.js');await legacyRooms.prepare('house_a');
 const {ROOM_BOUNCE_DATA}=await import('./web/src/v2/room-bounce-registry.js');
 const {prepareHouseholdRoom}=await import('./web/src/v2/household-room-fields.js');
 const {RoomDoorTransport}=await import('./web/src/v2/room-door-transport.js');
 const {PastoralDoorAngles41}=await import('./web/src/v2/room-pastoral-door-angles41.js');
 const {RoomDoorAngles}=await import('./web/src/v2/room-door-angles.js');
 const {RoomBounceField}=await import('./web/src/v2/room-bounce-field.js');
 const {Quaternion,Vector3,Color}=await import('./web/node_modules/three/build/three.module.js');
 const {ROOM_SECOND_SOLAR_LOADERS}=await import('./web/src/v2/room-second-solar-data.js');
 const assert=(await import('node:assert/strict')).default;
 const door=new RoomDoorTransport();await door.prepare('house_a');assert.equal(door.fields.size,1);door.dispose();
 const second=await ROOM_SECOND_SOLAR_LOADERS.house_a();assert.deepEqual(second.derivedGeometry,ROOM_BOUNCE_DATA.house_a.derivedGeometry);
 for(const key of ['house_a','house_a-living-0','house_a-living-1','house_a-living-2','house_a-entry-tea-34']){
  if(key!=='house_a')await prepareHouseholdRoom(key);assert.ok(ROOM_BOUNCE_DATA[key].derivedGeometry);
  const f=new RoomBounceField();f.set({sourceAsset:'house_a',bounceField:key},new Quaternion());await f.prepare();f.setLighting({sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1},1);assert.equal(f.key,key);assert.ok(f.uniforms.uRoomBounceField.value.image.data.length>0);f.dispose();
  if(key.includes('entry')){const a=new RoomDoorAngles();await a.tea.prepare(key);assert.equal(a.tea.ready,true);a.dispose();}
  else{const a=new PastoralDoorAngles41();await a.prepare(key);assert.equal(a.ready,true);assert.equal(a.room.children.size,3);a.dispose();}
 }
 assert.equal(ROOM_BOUNCE_DATA.yurt.derivedGeometry,undefined);console.log('actual house GI owners ready');`;
 const p=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});assert.equal(p.status,0,p.stderr+' '+p.stdout);
});
