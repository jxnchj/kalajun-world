import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from 'node:fs/promises';import {createHash}from 'node:crypto';import * as T from 'three';
globalThis.location={search:'?guestLiving39=0'};
const {prepareGuestVanityRoom,validateGuestVanityGI,guestVanityRoomKey}=await import('./guest-vanity-gi.js');
const {SettlementRuntime}=await import('./settlements.js');const {ROOM_BOUNCE_DATA}=await import('./room-bounce-registry.js');const {decodeRoomField}=await import('./room-bounce-field.js');const {decodeSolarDirection}=await import('./room-solar-transport.js');const {decodeRoomContact}=await import('./room-contact.js');
const sum=data=>data.reduce((n,v,i)=>n+(i%4===3?0:Math.abs(T.DataUtils.fromHalfFloat(v))),0);
function world(){return new SettlementRuntime({entities:[{id:'guest',assetId:'gh_lanchuan'}],surface:{heightAt:()=>2100,buildingPose:()=>({x:0,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}})}});}
test('all eight real-baked fields retain candidate source/grid, full directions and bathroom probes',async()=>{
 for(let n=1;n<=3;n++){const key=`lanchuan-freedom-${n}-vanity38`,b=await prepareGuestVanityRoom(key);validateGuestVanityGI(key,b);
 for(const [path,hash]of [['../../public/'+b.sky.sourceGLB,b.sky.sourceSHA256],['../../../'+b.sky.sourceBlend,b.sky.blendSHA256]])assert.equal(createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex'),hash);
 const base=decodeRoomField(b.sky),second=decodeRoomField(b.secondSky);assert.ok(base.every(v=>Number.isFinite(T.DataUtils.fromHalfFloat(v))));assert.ok(second.every(v=>Number.isFinite(T.DataUtils.fromHalfFloat(v))));
 const [nx,ny,nz]=b.sky.size,f=b.definition.floor;let bathValid=0;for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const px=b.sky.bounds[0][0]+(b.sky.bounds[1][0]-b.sky.bounds[0][0])*x/(nx-1),pz=b.sky.bounds[0][2]+(b.sky.bounds[1][2]-b.sky.bounds[0][2])*z/(nz-1);if(px>f.x1-1.86&&pz<f.z0+2.41&&base[((z*ny+y)*nx+x)*4+3])bathValid++;}assert.ok(bathValid>10);
 for(const name of ['solar','secondSolar','fixtures','secondFixtures'])for(let i=0;i<b[name].directions.length;i++)assert.ok(decodeSolarDirection(b[name],i).every(Number.isFinite));assert.equal(decodeRoomContact(b.contact).length,b.contact.size[0]*b.contact.size[1]*2);
 assert.throws(()=>validateGuestVanityGI(key,{...b,secondSolar:{...b.secondSolar,sourceSHA256:'old'}}),/source mismatch/);assert.throws(()=>validateGuestVanityGI(key,{...b,key:'lanchuan-freedom-1'}),/key mismatch/);
 }
});
test('actual three-room runtime keeps independent tables, daytime and lamp-only midnight RGB, leaving clears',async()=>{
 const runtime=world(),camera=new T.PerspectiveCamera();try{for(let n=1;n<=3;n++){
  const old=`lanchuan-freedom-${n}`,key=old+'-vanity38',v=runtime.viewpoints.find(v=>v.roomId===old);camera.position.set(v.x,v.y,v.z);camera.updateMatrixWorld();runtime.update(camera,0,65);await runtime.indirect.field.prepare();runtime.update(camera,0,65);
  const f=runtime.indirect.field;assert.equal(f.key,key);assert.equal(f.uniforms.uRoomFieldActive.value,1);assert.ok(sum(f.uniforms.uRoomBounceField.value.image.data)>0);assert.equal(runtime.indirect.uniforms.uRoomExcludeActive.value,0);assert.equal(f.solar.secondData[key].sourceSHA256,ROOM_BOUNCE_DATA[key].sourceSHA256);
  runtime.update(camera,0,-8);await f.prepare();runtime.update(camera,0,-8);assert.equal(f.fixtures.stats.active,true);assert.equal(f.secondFixtures.stats.active,true);assert.equal(f.solar.stats.active,false);assert.equal(sum(f.dayData.get(key).data),0);assert.ok(sum(f.uniforms.uRoomBounceField.value.image.data)>0);assert.equal(runtime.indirect.contact.stats.field,key);
  const data=f.uniforms.uRoomBounceField.value.image.data.slice();runtime.update(camera,0,-8);assert.deepEqual(f.uniforms.uRoomBounceField.value.image.data,data);
 }camera.position.set(1000,2500,1000);camera.updateMatrixWorld();runtime.update(camera,0,-8);assert.equal(runtime.indirect.field.uniforms.uRoomFieldActive.value,0);assert.equal(runtime.indirect.contact.stats.active,false);
 }finally{runtime.dispose();}
});
test('explicit old-source room definitions and old table keys are untouched',()=>{const before=location.search;location.search='?guestVanity38=0';const r=world();try{for(let n=1;n<=3;n++){const old=`lanchuan-freedom-${n}`;assert.equal(r.guestRooms[n-1].asset.bounceField,old);assert.ok(r.guestRooms[n-1].asset.excludedBounds);assert.equal(guestVanityRoomKey(old,false),old);}}finally{r.dispose();location.search=before;}});
