import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import {Quaternion,Vector3,Color,DataUtils}from'three';
import{PastoralDoorAngles41,PASTORAL_ANGLE_KEYS41,pastoralAngleWeights41,validatePastoralAngle41}from'./room-pastoral-door-angles41.js';
import{RoomBounceField}from'./room-bounce-field.js';import{ROOM_BOUNCE_DATA}from'./room-bounce-registry.js';import{prepareHouseholdRoom}from'./household-room-fields.js';import{legacyRooms}from'./legacy-room-loader.js';
const light={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1};
const leaves=(key,degrees)=>(key==='yurt'?['yurt_door0_out','yurt_door1_out']:['house_a_door0']).map((name,i)=>({name,angle:degrees[i]*Math.PI/180*(i===1?-1:1),open:102*Math.PI/180*(i===1?-1:1)}));
const prepare=key=>key.includes('living')?prepareHouseholdRoom(key):legacyRooms.prepare(key);
const hash=async p=>createHash('sha256').update(await readFile(new URL(p,import.meta.url))).digest('hex');
test('real authored pastoral angle fields preserve source, grid, samples and original validity',async()=>{
 for(const key of PASTORAL_ANGLE_KEYS41){await prepare(key);const base=ROOM_BOUNCE_DATA[key];const poses=key==='yurt'?[0,51,102].flatMap(a=>[0,51,102].map(b=>[a,b])).filter(a=>!a.every(d=>d===0)&&!a.every(d=>d===102)):[30,60,90].map(d=>[d]);
  assert.equal(await hash('../../public/'+base.sourceGLB),base.sourceSHA256);assert.equal(await hash('../../../'+base.sourceBlend),base.blendSHA256);
  for(const ext of base.externalSources??[]){assert.equal(await hash('../../public/'+ext.sourceGLB),ext.sourceSHA256);assert.equal(await hash('../../../'+ext.sourceBlend),ext.blendSHA256);}
  for(const degrees of poses){const data=(await import('./room-pastoral-door-data41/'+key+'-'+degrees.join('-')+'.js')).default;validatePastoralAngle41(data,key,degrees);
   for(const field of[data.sky,data.secondSky]){const a=Buffer.from(field.data,'base64'),b=Buffer.from(base.data,'base64');assert.equal(a.length,b.length);for(let i=6;i<a.length;i+=8)assert.equal(a.readUInt16LE(i),b.readUInt16LE(i));}
   assert.throws(()=>validatePastoralAngle41({...data,key:'other'},key,degrees),/identity/);assert.throws(()=>validatePastoralAngle41({...data,solar:{...data.solar,sourceSHA256:'wrong'}},key,degrees),/source/);
  }
 }
});
test('independent leaf lattice preserves all exact endpoints and continuous nonnegative partition weights',()=>{
 for(const angles of[[0,0],[0,102],[51,0],[51,51],[102,0],[102,102]])assert.deepEqual(pastoralAngleWeights41('yurt',angles),[{degrees:angles,weight:1}]);
 for(let a=0;a<=102;a+=7)for(let b=0;b<=102;b+=11){const w=pastoralAngleWeights41('yurt',[a,b]);assert.ok(w.every(t=>t.weight>=0));assert.ok(Math.abs(w.reduce((n,t)=>n+t.weight,0)-1)<1e-12);for(let i=0;i<2;i++)assert.ok(Math.abs(w.reduce((n,t)=>n+t.weight*t.degrees[i],0)-[a,b][i])<1e-10);}
});
test('adopted pose lattice retains explicit controls and requires original named hinges, directions and open angle',()=>{
 assert.equal(new PastoralDoorAngles41().enabled,true);const old=globalThis.location;try{for(const search of['?roomPastoralDoorAngles41=0','?roomDoorAngles=0','?roomPastoralDoorAngles41=1&roomDoorAngles=0']){globalThis.location={search};assert.equal(new PastoralDoorAngles41().enabled,false);}}finally{globalThis.location=old;}const p=new PastoralDoorAngles41({enabled:true});p.setState(leaves('yurt',[23,81]));assert.equal(p.supports('yurt'),true);p.setState([{angle:.5,open:1.78},{angle:.7,open:-1.78}]);assert.equal(p.supports('yurt'),false);p.setState(leaves('yurt',[23,81]).map(l=>({...l,open:1})));assert.equal(p.supports('yurt'),false);p.dispose();
});
test('actual room composition handles independent blocked leaves and preserves open/closed controls without GPU allocation',async()=>{
 const old=globalThis.location;globalThis.location={search:'?roomPastoralDoorAngles41=1'};
 try{for(const key of['house_a-living-1','yurt']){const f=new RoomBounceField();try{f.set({sourceAsset:key==='yurt'?'yurt':'house_a',bounceField:key},new Quaternion());await f.prepare();const texture=f.uniforms.uRoomBounceField.value;
  const sample=(degrees,enabled=true)=>{f.setDoorAngles(enabled?leaves(key,degrees):null);f.setDoorOpenness(degrees.reduce((n,d)=>n+Math.min(1,d/90),0)/degrees.length);f.setLighting(light,1);return texture.image.data.slice();};
  const closed=key==='yurt'?[0,0]:[0],open=key==='yurt'?[102,102]:[102];assert.deepEqual(sample(closed),sample(closed,false));assert.deepEqual(sample(open),sample(open,false));
  const mid=key==='yurt'?[51,0]:[60];assert.notDeepEqual(sample(mid),sample(mid,false));if(key==='yurt')assert.notDeepEqual(sample([51,0]),sample([0,51]),'asymmetric blocked leaves must not share averaged transport');
  for(const knot of key==='yurt'?[51]:[30,60,90]){const a=sample(key==='yurt'?[knot-.001,24]:[knot-.001]),b=sample(key==='yurt'?[knot+.001,24]:[knot+.001]);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(DataUtils.fromHalfFloat(a[i])-DataUtils.fromHalfFloat(b[i])));assert.ok(max<.001,'continuous door pose interpolation '+max);}
  assert.strictEqual(f.uniforms.uRoomBounceField.value,texture);f.setLighting({...light,visibility:0},1);const blocked=texture.image.data.slice();f.uniforms.uRoomSunTransport.value=0;f.setLighting(light,1);assert.deepEqual(texture.image.data,blocked,'blocking sun must not change diffuse sky');f.setLighting(light,0);assert.equal(f.uniforms.uRoomFieldDayScale.value,0,'night has no invented ambient');f.clear();assert.equal(f.uniforms.uRoomFieldActive.value,0);assert.equal(f.angleDoors.stats.active,false);
 }finally{f.dispose();}}}finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;}
});

test('dispatcher diagnostics do not retain tea brackets when switching to pastoral lattice',async()=>{const{RoomDoorAngles}=await import('./room-door-angles.js');const d=new RoomDoorAngles(),reference=d.stats;d.tea.stats.bracket={lo:90,hi:102,weight:1};d.sync();assert.ok(d.stats.bracket);d.current=d.pastoral;Object.assign(d.pastoral.stats,{active:true,key:'house_a',degrees:[0],weights:[{degrees:[0],weight:1}]});d.sync();assert.equal(d.stats,reference);assert.equal('bracket' in d.stats,false);assert.deepEqual(d.stats.degrees,[0]);d.clearActive();assert.equal(d.stats.key,null);assert.equal(d.stats.degrees,null);assert.equal(d.stats.weights,null);d.current=d.tea;d.sync();assert.equal('weights' in d.stats,false);d.dispose();});
