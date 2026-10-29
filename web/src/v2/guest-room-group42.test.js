import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {packRoomTextures42,groupRoomGLSL42,GuestRoomGroup42,guestRoomGroup42Enabled} from './guest-room-group42.js';
import {RoomIndirectLight} from './room-lighting.js';
test('three-room adoption defaults on and explicit zero retains original path',()=>{assert.equal(guestRoomGroup42Enabled(''),true);assert.equal(guestRoomGroup42Enabled('?guestRoomGroup42=1'),true);assert.equal(guestRoomGroup42Enabled('?guestRoomGroup42=0'),false);});
test('three room SH atlas preserves every original texel and centre with unequal grids',()=>{
 const textures=[[2,3,4],[3,2,8],[1,2,4]].map(([w,h,d],i)=>({image:{width:w,height:h,depth:d,data:Uint16Array.from({length:w*h*d*4},(_,j)=>1000*i+j)}}));
 const p=packRoomTextures42(textures,{volume:true});assert.equal(p.depth,16);let oz=0;
 textures.forEach((t,i)=>{const q=t.image;for(let z=0;z<q.depth;z++)for(let y=0;y<q.height;y++)for(let x=0;x<q.width;x++)for(let c=0;c<4;c++)assert.equal(p.data[(((z+oz)*p.height+y)*p.width+x)*4+c],q.data[((z*q.height+y)*q.width+x)*4+c]);assert.equal((.5/q.depth*p.transforms[i].scale[2]+p.transforms[i].offset[2])*p.depth,oz+.5);oz+=q.depth;});
});
test('contact atlas retains original floor and upper contact texels without resampling',()=>{
 const t=[[2,3],[3,2],[4,1]].map(([w,h],i)=>({image:{width:w,height:h,data:Uint8Array.from({length:w*h*2},(_,j)=>i*30+j)}})),p=packRoomTextures42(t);let ox=0;
 t.forEach((t,i)=>{const q=t.image;for(let y=0;y<q.height;y++)for(let x=0;x<q.width;x++)for(let c=0;c<2;c++)assert.equal(p.data[(y*p.width+x+ox)*2+c],q.data[(y*q.width+x)*2+c]);assert.equal((.5/q.width*p.transforms[i].scale[0]+p.transforms[i].offset[0])*p.width,ox+.5);ox+=q.width;});
});
test('group shader preserves original sampler count and six-opening uniforms',()=>{
 const base=new RoomIndirectLight({openingCapacity:6}),group=new GuestRoomGroup42(base,{enabled:true,createRoom:()=>new RoomIndirectLight({openingCapacity:6})});
 try{const source=base.shaderSource(),g=groupRoomGLSL42(source);assert.equal((g.source.match(/uniform (?:highp )?sampler/g)||[]).length,2);assert.ok(g.source.includes('uRoomOpeningsRooms42[18]'));const m=new THREE.MeshStandardMaterial();base.register([m]);group.register([m],source);const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'void main() {\n#include <aomap_fragment>\nvec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n}'};const original=structuredClone(shader);const prior=new THREE.MeshStandardMaterial();base.register([prior]);prior.onBeforeCompile(original,{});m.onBeforeCompile(shader,{});assert.equal(shader.fragmentShader,original.fragmentShader);assert.equal(shader.vertexShader,original.vertexShader);assert.strictEqual(shader.uniforms.uRoomBounceField,base.uniforms.uRoomBounceField);assert.ok(!shader.uniforms.uGuestGroup42);const inactiveKey=m.customProgramCacheKey();group.setActive(true);assert.notEqual(m.customProgramCacheKey(),inactiveKey);const active={uniforms:{},vertexShader:"#include <project_vertex>",fragmentShader:"void main() {\n#include <aomap_fragment>\nvec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n}"};m.onBeforeCompile(active,{});group.setActive(false);assert.equal(m.customProgramCacheKey(),inactiveKey);const restored={uniforms:{},vertexShader:"#include <project_vertex>",fragmentShader:"void main() {\n#include <aomap_fragment>\nvec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;\n}"};m.onBeforeCompile(restored,{});assert.equal(restored.fragmentShader,original.fragmentShader);assert.strictEqual(restored.uniforms.uRoomContactMap,base.uniforms.uRoomContactMap);assert.ok(!restored.uniforms.uGuestGroup42);Object.assign(shader,active);assert.ok(shader.fragmentShader.includes('selectGuestRoom42(vRoomWorldPosition)'));assert.strictEqual(shader.uniforms.uRoomBounceField.value,base.uniforms.uRoomBounceField.value);assert.equal(shader.uniforms.uGuestGroup42.value,0);}finally{group.dispose();base.dispose();}
});

import {SettlementRuntime} from './settlements.js';
import {GUEST_DOORS41} from './guest-doors41.js';
test('canonical three rooms keep independent lamps and doors across the porch and release fields on exit',async()=>{
 const pose={x:0,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}},entity={id:GUEST_DOORS41.entityId,assetId:'gh_lanchuan'},world={entities:[entity],surface:{heightAt:()=>2100,buildingPose:()=>pose}};
 const rooms=new SettlementRuntime(world),camera=new THREE.PerspectiveCamera(70,1.6,.05,100),seen=[];
 const sun={elevation:-10,sun:new THREE.Vector3(.1,-.2,.8).normalize(),color:new THREE.Color(1,.8,.6),intensity:0};
 rooms.setDoorOpenness(id=>{seen.push(id);return id.endsWith('-2')?0:1;},id=>[{angle:id.endsWith('-2')?0:GUEST_DOORS41.open,open:GUEST_DOORS41.open}]);
 const move=(x,z)=>{camera.position.set(x,2101.6,z);camera.lookAt(x,2101.2,-1);camera.updateMatrixWorld();rooms.update(camera,0,sun);};
 try{move(7.5,12);await rooms.prepareLighting();move(7.5,12);assert.equal(rooms.groupRooms42.length,3);assert.equal(rooms.lights.filter(l=>l.visible&&l.castShadow).length,9);assert.equal(rooms.guestGroup42.rooms.length,3);assert.ok(rooms.guestGroup42.stats.textureBytes>0);
  const anchors=rooms.lights.map(l=>l.userData.anchor),fields=rooms.guestGroup42.rooms.map(r=>r.light),before=fields.map(r=>r.uniforms.uRoomBounceField.value.image.data.slice());
  rooms.lights.forEach(l=>l.shadow.needsUpdate=false);move(1.5,11);assert.deepEqual(rooms.lights.map(l=>l.userData.anchor),anchors);assert.ok(rooms.lights.every(l=>!l.shadow.needsUpdate));assert.deepEqual(rooms.guestGroup42.rooms.map(r=>r.light),fields);
  const room2=rooms.guestRooms[1];rooms.fixtureControls.setMode(room2.id,'off');move(1.5,11);assert.ok(rooms.lights.slice(3,6).every(l=>l.intensity===0&&l.visible&&l.castShadow));assert.ok(rooms.lights.slice(0,3).every(l=>l.intensity>0));assert.ok(rooms.lights.slice(6).every(l=>l.intensity>0));assert.deepEqual(fields[0].uniforms.uRoomBounceField.value.image.data,before[0]);assert.deepEqual(fields[2].uniforms.uRoomBounceField.value.image.data,before[2]);assert.equal(fields[1].uniforms.uRoomAmbientActive.value,0);assert.ok(seen.includes(room2.id));
  move(80,80);assert.equal(rooms.guestGroup42.stats.active,false);assert.equal(rooms.guestGroup42.rooms.length,0);assert.equal(rooms.guestGroup42.stats.textureBytes,0);assert.ok(rooms.lights.every(l=>!l.visible));assert.equal(rooms.fixtureControls.mode(room2.id),'off');
 }finally{rooms.dispose();}
});
test('three-room daytime fields equal original single-room composition at independent real door poses',async()=>{
 let heightQueries=0;const pose={x:100,y:2100,z:200,rot:.31,scale:{x:1,y:1,z:1}},entity={id:GUEST_DOORS41.entityId,assetId:'gh_lanchuan'},world={entities:[entity],surface:{heightAt:()=>{heightQueries++;return 2100;},buildingPose:()=>pose}},rooms=new SettlementRuntime(world,{guestGroup42:true}),single=new SettlementRuntime(world,{guestGroup42:false}),camera=new THREE.PerspectiveCamera(65,1.6,.05,100);
 const sun={elevation:35,sun:new THREE.Vector3(.1,.6,.8).normalize(),color:new THREE.Color(1,.8,.6),intensity:3},angle=id=>id.endsWith('-1')?0:id.endsWith('-2')?GUEST_DOORS41.open*.5:GUEST_DOORS41.open;
 for(const runtime of [rooms,single])runtime.setDoorOpenness(id=>Math.abs(angle(id)/GUEST_DOORS41.open),id=>[{angle:angle(id),open:GUEST_DOORS41.open}]);
 const move=(x,z)=>{const c=Math.cos(pose.rot),s=Math.sin(pose.rot);camera.position.set(pose.x+c*x+s*z,2101.6,pose.z-s*x+c*z);camera.lookAt(pose.x+c*x-s,2101.2,pose.z-s*x-c);camera.updateMatrixWorld();};
 try{move(7.5,12);rooms.update(camera,0,sun);await rooms.prepareLighting();rooms.update(camera,0,sun);
  const queries=heightQueries,updates=rooms.guestGroup42.rooms.map(r=>r.terrainSun.stats.updates);for(let i=0;i<12;i++)rooms.update(camera,0,sun);assert.equal(heightQueries,queries,"room-local solar cache must not retrace the terrain every frame");assert.deepEqual(rooms.guestGroup42.rooms.map(r=>r.terrainSun.stats.updates),updates);
  for(let i=0;i<3;i++){move([2.7,8,14][i],2);single.update(camera,0,sun);await single.prepareLighting();single.update(camera,0,sun);const group=rooms.guestGroup42.rooms[i].light;assert.equal(group.field.key,single.indirect.field.key);assert.deepEqual(group.uniforms.uRoomBounceField.value.image.data,single.indirect.uniforms.uRoomBounceField.value.image.data);assert.deepEqual(group.uniforms.uRoomContactMap.value.image.data,single.indirect.uniforms.uRoomContactMap.value.image.data);}
 }finally{rooms.dispose();single.dispose();}
});

import {RoomShadowAtlas42} from './room-shadow-atlas42.js';
test('adopted group releases atlas and restores original three opening slots in cabin, yurt and exterior',()=>{
 const entities=[{id:GUEST_DOORS41.entityId,assetId:'gh_lanchuan',x:0},{id:'house',assetId:'house_a',x:60},{id:'tent',assetId:'yurt',x:120}],world={entities,surface:{heightAt:()=>2100,buildingPose:e=>({x:e.x,y:2100,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
 const rooms=new SettlementRuntime(world),camera=new THREE.PerspectiveCamera(70,1.6,.05,200),renderer={capabilities:{maxTextureSize:4096},shadowMap:{type:THREE.PCFShadowMap,render(){}}},atlas=new RoomShadowAtlas42(renderer,rooms.lights,{enabled:rooms.guestGroup42.enabled});
 const move=(x,z)=>{camera.position.set(x,2101.6,z);camera.lookAt(x,2101.2,-1);camera.updateMatrixWorld();rooms.update(camera,0,65);atlas.setActive(Boolean(rooms.groupRooms42));};
 try{
  for(const x of [60,120]){
   move(7.5,12);assert.equal(atlas.active,true);const target=atlas.target;let disposed=0;target.addEventListener('dispose',()=>disposed++);assert.equal(rooms.lights.filter(l=>l.visible&&l.castShadow).length,9);
   move(x,0);assert.equal(atlas.active,false);assert.equal(atlas.target,null);assert.equal(disposed,1);assert.equal(rooms.guestGroup42.stats.textureBytes,0);assert.equal(rooms.portalLights.length,3);assert.ok(rooms.lights.slice(3).every(l=>!l.visible&&!l.castShadow&&l.intensity===0));assert.ok(rooms.portalLights.some(l=>l.visible&&l.castShadow));
   move(200,80);assert.ok(rooms.lights.every(l=>!l.visible&&!l.castShadow));assert.equal(rooms.indirect.uniforms.uRoomBounceActive.value,0);
  }
 }finally{atlas.dispose();rooms.dispose();}
 const comparison=new SettlementRuntime(world,{guestGroup42:guestRoomGroup42Enabled('?guestRoomGroup42=0')});try{assert.equal(comparison.lights.length,3);assert.equal(comparison.guestGroup42.enabled,false);}finally{comparison.dispose();}
 const unrelated=new SettlementRuntime({...world,entities:entities.slice(1)});try{assert.equal(unrelated.lights.length,3);assert.equal(unrelated.guestGroup42.enabled,false);}finally{unrelated.dispose();}
});
