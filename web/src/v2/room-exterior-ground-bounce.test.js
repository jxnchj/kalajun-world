import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {DataUtils,Matrix3,Vector3,Color,Quaternion}from 'three';
import data from './room-exterior-ground-bounce-data.js';
import indirect from './room-exterior-terrain-data.js';
import {RoomExteriorGroundBounce,validateGroundBounces}from './room-exterior-ground-bounce.js';
import {decodeSolarDirection}from './room-solar-transport.js';
import {RoomBounceField}from './room-bounce-field.js';
import {EXTERIOR_ROOM_KEY,EXTERIOR_ROOM_ENTITY}from './room-exterior-terrain.js';
const base=data.states.open.first,count=base.size.reduce((a,b)=>a*b,1);
const lighting={sun:new Vector3(0,1,0),color:new Color(1,.8,.6),intensity:3,visibility:1};
const values=a=>Array.from(a,DataUtils.fromHalfFloat);
function run(g,options={}){
 const out=new Uint16Array(count*16);for(let i=3;i<out.length;i+=4)out[i]=DataUtils.toHalfFloat(1);
 g.apply(out,{daylight:1,scale:1,fraction:1,lighting,normalToLocal:new Matrix3(),...options});return out;
}
test('every 81-direction first/second table retains original probes, source binding and nonoverlapping path identity',()=>{
 validateGroundBounces(data,indirect);assert.deepEqual(data.interiorBounceOrders,[1,2]);
 assert.equal(data.samples,96);assert.equal(data.surfaceSamples,32);assert.equal(base.validProbes,239);
 assert.throws(()=>validateGroundBounces({...data,interiorBounceOrders:[0,1]},indirect),/path/);
 assert.throws(()=>validateGroundBounces({...data,pose:{...data.pose,z:0}},indirect),/entity/);
 const bytes=Uint8Array.from(atob(indirect.states.open.sky.first.data),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
 const valid=Array.from({length:count},(_,i)=>DataUtils.fromHalfFloat(view.getUint16((i*4+3)*2,true))>0);
 for(const state of ['open','closed'])for(const order of ['first','second'])for(let d=0;d<81;d++){
  const f=decodeSolarDirection(data.states[state][order],d);assert.equal(f.length,count*12);
  for(let p=0;p<count;p++)for(let c=0;c<3;c++){
   assert.ok(f[p*3+c]>=0,'mean irradiance cannot be negative');
   if(!valid[p])for(let band=0;band<4;band++)assert.equal(f[(band*count+p)*3+c],0,'invalid probes stay empty');
  }
 }
 assert.ok(data.summary.every(s=>s.secondLinks>700000&&s.groundHits>290000));
 assert.equal(data.summary[1].pathsByOpening[0],0,'closed door contributes no entering source path');
 for(const s of data.terrainSources)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+s.path,import.meta.url))).digest('hex'),s.sha256);
});
test('physical source scale and first/second controls match the actual direction fields without nonlinear source mixing',()=>{
 const g=new RoomExteriorGroundBounce();g.setData(data,indirect);
 const a=values(run(g)),first=decodeSolarDirection(data.states.open.first,80),second=decodeSolarDirection(data.states.open.second,80);
 const firstOnly=values(run(g,{secondWeight:0})),double=values(run(g,{lighting:{...lighting,intensity:6}})),normalized=values(run(g,{scale:.5}));
 let firstEnergy=0,secondEnergy=0;
 for(let i=0;i<a.length;i++){
  const c=i%4;if(c===3){assert.equal(a[i],1);continue;}
  const j=Math.floor(i/4)*3+c,scale=[1,.8,.6][c]*3/2.4;
  assert.ok(Math.abs(a[i]-(first[j]+second[j])*scale)<.000004);
  assert.ok(Math.abs(firstOnly[i]-first[j]*scale)<.000004);
  assert.ok(Math.abs(double[i]-2*a[i])<.000004);assert.ok(Math.abs(normalized[i]-2*a[i])<.000004);
  if(i<a.length/4){firstEnergy+=firstOnly[i];secondEnergy+=a[i]-firstOnly[i];}
 }
 assert.ok(firstEnergy>0&&secondEnergy>0);assert.ok(g.stats.cacheBytes>0);g.dispose();
});
test('terrain sun respects shadow, night, lamp preservation, door interpolation and explicit opt-out',()=>{
 const g=new RoomExteriorGroundBounce();g.setData(data,indirect);
 const lit=run(g),closed=values(run(g,{fraction:0})),open=values(lit),middle=values(run(g,{fraction:.5}));
 for(let i=0;i<middle.length;i++)if(i%4!==3)assert.ok(Math.abs(middle[i]-(closed[i]+open[i])*.5)<.000004);
 assert.notDeepEqual(closed,open);
 assert.deepEqual(run(g,{lighting:{...lighting,visibility:0,exteriorVisibility:1}}),lit);
 const dark=run(g,{lighting:{...lighting,intensity:0}});
 assert.deepEqual(run(g,{lighting:{...lighting,exteriorVisibility:0}}),dark);
 assert.deepEqual(run(g,{lighting:{...lighting,sun:new Vector3(0,-1,0)}}),dark);
 assert.deepEqual(run(g,{solarEnabled:0}),dark);
 const lamps=lit.slice(),old=lamps.slice();g.apply(lamps,{daylight:0,scale:.08});assert.deepEqual(lamps,old);
 g.enabled=false;assert.deepEqual(run(g),dark);g.dispose();
});
test('real RoomBounceField composes added orders once into the same GPU texture and restores prior result when disabled',async()=>{
 const f=new RoomBounceField();
 try{
  f.exterior.enabled=true;f.exterior.setRoom({id:EXTERIOR_ROOM_ENTITY,pose:data.pose});
  f.set({sourceAsset:'house_a',bounceField:EXTERIOR_ROOM_KEY},new Quaternion());await f.prepare();
  const texture=f.uniforms.uRoomBounceField.value;
  f.setLighting(lighting,1);const on=texture.image.data.slice();
  assert.equal(f.exterior.groundBounce.stats.active,true);
  f.setLighting(lighting,1);assert.deepEqual(texture.image.data,on,'same light must not accumulate energy repeatedly');
  f.exterior.groundBounce.enabled=false;f.setLighting(lighting,1);const off=texture.image.data.slice();
  assert.notDeepEqual(on,off);
  f.exterior.groundBounce.enabled=true;f.setLighting(lighting,1);assert.deepEqual(texture.image.data,on);
  f.exterior.ground.solarEnabled=false;f.setLighting(lighting,1);assert.equal(f.exterior.groundBounce.stats.active,false);
  f.setLighting({...lighting,intensity:0},0);assert.ok(texture.image.data.every((v,i)=>i%4===3||v===0));
  assert.strictEqual(f.uniforms.uRoomBounceField.value,texture);
 }finally{f.dispose();}
});
