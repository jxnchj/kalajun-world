import test from 'node:test';
import assert from 'node:assert/strict';
import {DataUtils,Matrix3,Vector3,Color}from 'three';
import data from './room-exterior-ground-data.js';
import indirect from './room-exterior-terrain-data.js';
import {RoomExteriorGround,validateGroundDirect}from './room-exterior-ground.js';
import {decodeSolarDirection}from './room-solar-transport.js';
const count=data.size.reduce((a,b)=>a*b,1),lighting={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1},matrix=new Matrix3();
const values=a=>Array.from(a,DataUtils.fromHalfFloat);
function run(g,options={}){
 const out=new Uint16Array(count*16);for(let i=3;i<out.length;i+=4)out[i]=DataUtils.toHalfFloat(1);
 g.apply(out,{daylight:1,scale:1,fraction:1,lighting,normalToLocal:matrix,...options});return out;
}
test('direct ground data contains only zero-interior-bounce paths with genuine terrain shadow and aperture identities',()=>{
 validateGroundDirect(data,indirect);
 assert.throws(()=>validateGroundDirect({...data,interiorBounceOrder:1},indirect),/path/);
 assert.throws(()=>validateGroundDirect({...data,pose:{...data.pose,x:0}},indirect),/source/);
 assert.equal(data.apertureSamples,36);assert.equal(data.groundSkySamples,64);
 assert.ok(data.summary[0].groundPathsByOpening[2]>0);assert.equal(data.summary[1].groundPathsByOpening[0],0);
 assert.ok(data.summary.every(s=>Math.min(...s.litGroundHitCounts)===0&&Math.max(...s.litGroundHitCounts)>1000));
 const dark=decodeSolarDirection(data.states.open.solar,11),bright=decodeSolarDirection(data.states.open.solar,80);
 assert.ok(dark.every(v=>v===0),'actually fully shadowed ground direction carries no sunlight');
 assert.ok(bright.some(v=>v>0));
});
test('solar ground return follows physical source strength, cloud visibility and terrain shadows rather than room-aperture block',()=>{
 const g=new RoomExteriorGround();g.setData(data,indirect);
 const base=values(run(g,{lighting:{...lighting,intensity:0}}));
 const one=values(run(g,{lighting:{...lighting,intensity:1}})),two=values(run(g,{lighting:{...lighting,intensity:2}}));
 let response=0;
 for(let i=0;i<base.length;i++)if(i%4!==3){const a=one[i]-base[i],b=two[i]-base[i];assert.ok(Math.abs(b-2*a)<.00008);response+=Math.abs(a);}
 assert.ok(response>.01);
 assert.deepEqual(run(g,{lighting:{...lighting,visibility:0,exteriorVisibility:1}}),run(g),'room blocked sun does not remove independently lit external terrain');
 assert.deepEqual(run(g,{lighting:{...lighting,visibility:0,exteriorVisibility:0}}),run(g,{lighting:{...lighting,intensity:0}}),'cloud/source visibility still suppresses reflected sunlight');
 assert.deepEqual(run(g,{lighting:{...lighting,sun:new Vector3(0,-1,0)}}),run(g,{lighting:{...lighting,intensity:0}}));
 g.dispose();
});
test('direct ground preserves normalization, door endpoints, alpha and existing night fixture RGB without a GPU texture',()=>{
 const g=new RoomExteriorGround();g.setData(data,indirect);
 const a=values(run(g)),b=values(run(g,{scale:.5}));
 for(let i=0;i<a.length;i++)if(i%4!==3)assert.ok(Math.abs(a[i]-.5*b[i])<.00008);else assert.equal(a[i],b[i]);
 const closed=run(g,{fraction:0}),open=run(g,{fraction:1}),middle=values(run(g,{fraction:.5})),c=values(closed),o=values(open);
 assert.notDeepEqual(closed,open);for(let i=0;i<c.length;i++)if(i%4!==3)assert.ok(Math.abs(middle[i]-(c[i]+o[i])/2)<.00008);
 const night=new Uint16Array(count*16);night[0]=DataUtils.toHalfFloat(.23);night[3]=DataUtils.toHalfFloat(1);const old=night.slice();
 g.apply(night,{daylight:0,scale:.08,fraction:1,lighting,normalToLocal:matrix});assert.deepEqual(night,old);
 assert.ok(g.cache.size<=12);g.dispose();
});
