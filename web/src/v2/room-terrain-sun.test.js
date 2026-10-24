import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Color} from 'three';
import {RoomTerrainSun} from './room-terrain-sun.js';
const room={id:'test',pose:{x:10,y:100,z:20,rot:0,scale:{x:1,y:1,z:1}},asset:{openings:[{kind:'window',center:[0,2,0],normal:[0,0,1],width:2,height:2}]}};
const lighting=()=>({sun:new Vector3(0,.1,1).normalize(),color:new Color(.8,.7,.6),intensity:3,visibility:.75});
test('flat terrain retains original sunlight without modifying irradiance or sky',()=>{
 const filter=new RoomTerrainSun(()=>99),light=lighting();assert.strictEqual(filter.apply(room,light),light);assert.equal(filter.stats.rays,9);assert.equal(filter.stats.blockedRays,0);
});
test('ridge blocking all aperture samples removes only solar visibility and preserves original lighting',()=>{
 const filter=new RoomTerrainSun((x,z)=>z>40&&z<120?130:99),light=lighting(),result=filter.apply(room,light);
 assert.equal(result.visibility,0);assert.equal(light.visibility,.75);assert.strictEqual(result.sun,light.sun);assert.strictEqual(result.color,light.color);assert.equal(result.intensity,light.intensity);
 assert.equal(filter.stats.blockedRays,9);assert.equal(filter.stats.active,true);
});
test('partial occlusion is explicitly unresolved and does not scale a combined transport table',()=>{
 const filter=new RoomTerrainSun((x,z)=>x<10&&z>40&&z<120?130:99),light=lighting();assert.strictEqual(filter.apply(room,light),light);assert.ok(filter.stats.partial);assert.equal(filter.stats.blockedRays,3);
});
test('cache avoids per-frame terrain scans but refreshes on sun direction and room pose',()=>{
 let n=0;const filter=new RoomTerrainSun(()=>{n++;return 99;}),light=lighting();filter.apply(room,light);const count=n;filter.apply(room,{...light,color:new Color(1,0,0)});assert.equal(n,count);
 const moved={...room,pose:{...room.pose,x:11}};filter.apply(moved,light);assert.ok(n>count);const next=n;filter.apply(moved,{...light,sun:new Vector3(1,.2,1)});assert.ok(n>next);
});
test('world transforms place the aperture at rotated nonuniformly scaled coordinates',()=>{
 const points=[],filter=new RoomTerrainSun((x,z)=>{points.push([x,z]);return 999;});
 filter.apply({...room,pose:{...room.pose,rot:Math.PI/2,scale:{x:2,y:1,z:3}}},lighting());
 assert.equal(points.length,9);assert.ok(points.every(([x])=>Math.abs(x-10)<1e-10));
 assert.deepEqual([...new Set(points.map(([,z])=>Math.round(z)))].sort((a,b)=>a-b),[26,28,30]);
});
test('disabled, no room, night, zenith, or unknown terrain cannot invent a blocking ridge',()=>{
 const light=lighting(),disabled=new RoomTerrainSun(()=>999,{enabled:false});assert.strictEqual(disabled.apply(room,light),light);
 const f=new RoomTerrainSun(()=>NaN);assert.strictEqual(f.apply(null,light),light);assert.strictEqual(f.apply(room,light),light);
 const night={...light,sun:new Vector3(0,-1,0)};assert.strictEqual(f.apply(room,night),night);
 const zenith={...light,sun:new Vector3(0,1,0)};assert.strictEqual(f.apply(room,zenith),zenith);assert.equal(f.stats.heightSamples,0);
});

test('own foundation footprint cannot be misclassified as a distant terrain blocker',()=>{
 const r={...room,asset:{...room.asset,floor:{shape:'rect',x0:-4,x1:4,z0:-4,z1:4}}};
 const f=new RoomTerrainSun((x,z)=>Math.hypot(x-10,z-20)<10?999:99);
 assert.strictEqual(f.apply(r,lighting()).visibility,.75);assert.equal(f.stats.blockedRays,0);assert.ok(f.stats.excludedNearMeters>19);
});
test('clear back-facing window retains sky but cannot inject sunlight around a blocked sun-facing window',()=>{
 const r={...room,asset:{openings:[{kind:'window',center:[0,2,0],normal:[0,0,1],width:2,height:2},{kind:'window',center:[10,2,0],normal:[0,0,-1],width:2,height:2}]}};
 const f=new RoomTerrainSun((x,z)=>x<15&&z>40&&z<120?130:99),light=lighting();
 assert.equal(f.apply(r,light).visibility,0);assert.equal(f.stats.apertures[0].blocked,9);assert.equal(f.stats.apertures[1].blocked,0);assert.equal(f.stats.sunFacingApertures,1);assert.equal(f.stats.allApertureSamplesBlocked,false);assert.equal(light.visibility,.75);
});
test('two sun-facing windows with one clear retain unresolved partial solar transport',()=>{
 const r={...room,asset:{openings:[{kind:'window',center:[0,2,0],normal:[0,0,1],width:2,height:2},{kind:'window',center:[10,2,0],normal:[0,0,1],width:2,height:2}]}};
 const f=new RoomTerrainSun((x,z)=>x<15&&z>40&&z<120?130:99),light=lighting();assert.strictEqual(f.apply(r,light),light);assert.equal(f.stats.sunFacingApertures,2);assert.equal(f.stats.active,false);
});
test('rotated sun-facing boundary follows the opening normal rather than room name or world axis',()=>{
 const f=new RoomTerrainSun(()=>10000),r={...room,pose:{...room.pose,rot:Math.PI/2}};
 const front={...lighting(),sun:new Vector3(1,.3,0)},back={...lighting(),sun:new Vector3(-1,.3,0)},tangent={...lighting(),sun:new Vector3(0,.3,1)};
 assert.equal(f.apply(r,front).visibility,0);assert.strictEqual(f.apply(r,back),back);assert.strictEqual(f.apply(r,tangent),tangent);
});
