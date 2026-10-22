import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {aperturePolygon,finiteApertureIrradiance,finiteApertureEdgeIrradiance,ROOM_FINITE_APERTURE_GLSL} from './room-finite-aperture.js';
import {RoomIndirectLight,ROOM_BOUNCE_GLSL} from './room-lighting.js';
import {SETTLEMENT_ASSETS} from './settlement-assets.js';

// Independent midpoint area quadrature: physical cos(receiver)*cos(source)/r².
function quadrature(d,n,halfU,halfV,resolution=240){
 const normal=new THREE.Vector3(...n).normalize();let value=0;
 for(let x=0;x<resolution;x++)for(let y=0;y<resolution;y++){
  const p=new THREE.Vector3(d[0]+halfU*(2*(x+.5)/resolution-1),d[1]+halfV*(2*(y+.5)/resolution-1),d[2]);
  const r2=p.lengthSq(),cosine=Math.max(0,p.dot(normal))/Math.sqrt(r2);
  value+=cosine*Math.abs(p.z)/Math.sqrt(r2)/r2;
 }
 return value*4*halfU*halfV/resolution**2;
}
test('finite rectangles match independent area integration near, far, oblique and crossing the receiver horizon',()=>{
 const cases=[[[0,0,3],[0,0,1],1,1],[[0,0,.2],[0,0,1],1,.8],[[2,0,3],[1,0,1],1,1],[[.3,0,1],[-1,0,0],1,1],[[0,0,20],[0,0,1],1,.8],[[.2,.5,2],[.1,-.8,.4],.7,1.2]];
 for(const[d,n,u,v]of cases){
  const exact=finiteApertureIrradiance(aperturePolygon(d,[1,0,0],[0,1,0],u,v),n),reference=quadrature(d,n,u,v);
  assert.ok(Math.abs(exact-reference)<.00012,JSON.stringify({d,n,exact,reference}));
  assert.ok(exact>=0&&exact<=Math.PI);
 }
 // A centre-only cosine returns zero here despite a visible part of the window.
 const crossing=finiteApertureIrradiance(aperturePolygon([.3,0,1],[1,0,0],[0,1,0],1,1),[-1,0,0]);
 assert.ok(crossing>.1);
});
test('finite aperture is bounded, orientation invariant, rotation invariant and tends to inverse-square falloff',()=>{
 const p=aperturePolygon([0,0,.0001],[1,0,0],[0,1,0],1,1),n=[0,0,1];
 assert.ok(Math.abs(finiteApertureIrradiance(p,n)-Math.PI)<.000001);
 assert.equal(finiteApertureIrradiance(p,[0,0,-1]),0);
 assert.ok(Number.isFinite(finiteApertureIrradiance(aperturePolygon([1,1,0],[1,0,0],[0,1,0],1,1),n)),"receiver coincident with an aperture corner remains finite");
 assert.ok(Math.abs(finiteApertureIrradiance(p,n)-finiteApertureIrradiance([...p].reverse(),n))<1e-10);
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,2,3).normalize(),1.43),normal=new THREE.Vector3(...n).applyQuaternion(q).toArray();
 assert.ok(Math.abs(finiteApertureIrradiance(p.map(v=>v.clone().applyQuaternion(q)),normal)-finiteApertureIrradiance(p,n))<1e-8);
 const a=finiteApertureIrradiance(aperturePolygon([0,0,100],[1,0,0],[0,1,0],1,1),n),b=finiteApertureIrradiance(aperturePolygon([0,0,200],[1,0,0],[0,1,0],1,1),n);
 assert.ok(Math.abs(a/b-4)<.001);
});
test('crown approximation remains inside authored ellipse and its energy bound',()=>{
 const p=aperturePolygon([0,0,3],[1,0,0],[0,1,0],.8,.8,true);
 assert.equal(p.length,8);
 const got=finiteApertureIrradiance(p,[0,0,1]),disc=Math.PI*.8**2/(3**2+.8**2);
 assert.ok(got<disc&&got/disc>.9,'8-sided crown is explicitly bounded within the physical circle');
});
test('finite sky preserves doorway closure, window area and all baked reflection texture buffers',async()=>{
 const pose={x:0,y:0,z:0,rot:.31,scale:{x:1.2,y:1.1,z:.9}},light=new RoomIndirectLight();
 const item={id:'house',pose,asset:SETTLEMENT_ASSETS.house_a};
 light.setRoom(item,1,null,[],1);await light.field.prepare();light.setRoom(item,1,null,[],1);
 const buffer=light.field.uniforms.uRoomBounceField.value.image.data.slice(),areas=light.uniforms.uRoomOpenings.value.map(v=>v.w);
 light.uniforms.uRoomFiniteAperture.value=0;light.setRoom(item,1,null,[],1);
 assert.deepEqual(light.field.uniforms.uRoomBounceField.value.image.data,buffer);
 assert.equal(light.field.stats.finiteAperture.enabled,false);
 light.uniforms.uRoomFiniteAperture.value=1;light.setRoom(item,1,null,[],0);
 item.asset.openings.forEach((opening,i)=>assert.equal(light.uniforms.uRoomOpenings.value[i].w,opening.kind==='door'?0:areas[i]));
 assert.equal(light.field.stats.finiteAperture.extraTextureSamples,0);assert.equal(light.field.stats.finiteAperture.extraGeometry,0);
 for(const value of[0,'0']){const off=new RoomIndirectLight({finiteAperture:value});assert.equal(off.uniforms.uRoomFiniteAperture.value,0);off.dispose();}
 light.dispose();
});
test('GPU path clips the receiver hemisphere and keeps pre-existing source visibility, GI and daylight normalization',()=>{
 assert.match(ROOM_FINITE_APERTURE_GLSL,/if\(\(da>=0.0\)!=\(db>=0.0\)\)/);
 assert.match(ROOM_FINITE_APERTURE_GLSL,/atan\(s,dot\(a,b\)\)/);
 assert.match(ROOM_BOUNCE_GLSL,/diffuseEnergy\+=diffuseAperture\*apertureVisibility\[i\]/);
 assert.match(ROOM_BOUNCE_GLSL,/visible\*transmission\*roomFiniteSkyIrradiance/);
 assert.match(ROOM_BOUNCE_GLSL,/fieldIrradiance\*2.4\*uRoomFieldDayScale/);
 assert.doesNotMatch(ROOM_FINITE_APERTURE_GLSL,/texture\(|sampler|PointLight|DirectionalLight/);
});

test('streaming raw-edge integral matches independent area integration across the horizon',()=>{
 const cases=[[[0,0,3],[0,0,1],1,1],[[0,0,.2],[0,0,1],1,.8],[[2,0,3],[1,0,1],1,1],[[.3,0,1],[-1,0,0],1,1],[[0,0,20],[0,0,1],1,.8],[[.2,.5,2],[.1,-.8,.4],.7,1.2]];
 for(const[d,n,u,v]of cases){
  const streamed=finiteApertureEdgeIrradiance(aperturePolygon(d,[1,0,0],[0,1,0],u,v),n),reference=quadrature(d,n,u,v);
  assert.ok(Math.abs(streamed-reference)<.00012,JSON.stringify({d,n,streamed,reference}));
 }
});
test('streaming closes the horizon exactly for rotated rectangles and crowns, without changing their approximation',()=>{
 let seed=727;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<2500;i++){
  const d=[(random()-.5)*10,(random()-.5)*10,.01+random()*20],n=[random()-.5,random()-.5,random()-.5];
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,2,3).normalize(),random()*6.28);
  const polygon=aperturePolygon(d,[1,0,0],[0,1,0],.01+random()*3,.01+random()*3,i%2===0).map(v=>v.applyQuaternion(q));
  const expected=finiteApertureIrradiance(polygon,n),streamed=finiteApertureEdgeIrradiance(polygon,n);
  assert.ok(Math.abs(streamed-expected)<1e-10,JSON.stringify({i,expected,streamed}));
  assert.ok(Math.abs(finiteApertureEdgeIrradiance([...polygon].reverse(),n)-expected)<1e-10,'orientation is irrelevant');
 }
 for(const d of [[0,0,.0001],[1,1,0],[0,0,0]])for(const n of [[0,0,1],[0,0,-1],[1,0,0],[1,1,0]]){
  const polygon=aperturePolygon(d,[1,0,0],[0,1,0],1,1);
  const actual=finiteApertureEdgeIrradiance(polygon,n),expected=finiteApertureIrradiance(polygon,n);
  assert.ok(Number.isFinite(actual));assert.ok(Math.abs(actual-expected)<1e-10,JSON.stringify({d,n,actual,expected}));
 }
});
test('streaming AB leaves finite aperture energy, shape and existing GI buffers unchanged',async()=>{
 const light=new RoomIndirectLight({apertureEdges:0}),item={id:'edge-room',pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}},asset:SETTLEMENT_ASSETS.house_a};
 light.setRoom(item,1,null,[],.45);await light.field.prepare();light.setRoom(item,1,null,[],.45);
 const data=light.field.uniforms.uRoomBounceField.value.image.data.slice(),openings=light.uniforms.uRoomOpenings.value.map(v=>v.toArray());
 assert.equal(light.field.stats.finiteAperture.edgeIntegral,false);
 light.uniforms.uRoomApertureEdges.value=1;light.setRoom(item,1,null,[],.45);
 assert.equal(light.field.stats.finiteAperture.edgeIntegral,true);
 assert.deepEqual(light.field.uniforms.uRoomBounceField.value.image.data,data);assert.deepEqual(light.uniforms.uRoomOpenings.value.map(v=>v.toArray()),openings);
 assert.equal(light.uniforms.uRoomFiniteAperture.value,1);light.dispose();
 for(const flag of[0,'0']){const off=new RoomIndirectLight({apertureEdges:flag});assert.equal(off.uniforms.uRoomApertureEdges.value,0);off.dispose();}
 const optimized=ROOM_FINITE_APERTURE_GLSL.split('float roomApertureEdge(')[1];
 assert.doesNotMatch(optimized,/inversesqrt|vec3 clipped\[|for\s*\(/,'optimized kernel has no endpoint normalization or dynamically indexed polygon loop');
});
