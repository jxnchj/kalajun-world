import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldCollision} from './collision.js';import {Seating39,representativeSeats39,seating39Enabled} from './seating39.js';import source from './generated/seating-39.json' with {type:'json'};
async function parts(path){const bytes=readFileSync(new URL(path,import.meta.url)),l=new GLTFLoader();l.register(()=>({name:'no-textures',loadTexture:async()=>new T.Texture()}));const gltf=await l.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);const out=[];gltf.scene.traverse(n=>{if(n.isMesh&&!/glass/i.test(n.material.name)){const g=n.geometry.clone();g.applyMatrix4(n.matrixWorld);out.push({geometry:g,role:'body'});}});return out;}
test('actual unchanged sofa and porch meshes allow swept sitting and standing; walls and blocked exit remain solid',async()=>{
 for(const dt of [1/30,1/60])for(const def of source.seats){const kind=def.kind,entity={id:def.entityId,assetId:kind==='lodge'?'gh_lanchuan_lodge':'house_a'},all=await parts(kind==='lodge'?'../../public/assets/v2/gh_lanchuan_lodge_tables38.glb':'../../public/assets/v2/house_a_lived.glb'),world={entities:[entity],objects:{boardwalks:[]},surface:{heightAt:()=>-2,buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
 const c=new WorldCollision(world,{structures:{collisionPartsFor:()=>all}}),seat=representativeSeats39(world).find(s=>s.id===def.id),p=seat.position.clone().addScaledVector(seat.front,.85);if(def.id==='sofa-2')p.x-=.45;p.y=1.58;try{await c.enable(p);}catch(e){throw Error(def.id+' '+p.toArray()+' '+e.message);}const controls={physicsPosition:p,yaw:Math.atan2(seat.position.x-p.x,-(seat.position.z-p.z))*180/Math.PI,keys:new Set(),mode:'walk'},s=new Seating39(world,controls,c,{enabled:true});
 try{assert.ok(s.sit(seat),kind+' '+s.stats.blocked);for(let i=0;i<300&&s.state!=='seated';i++)s.step(dt);assert.equal(s.state,'seated',kind+JSON.stringify(s.stats));assert.ok(Math.abs(p.y-seat.position.y-.798)<1e-5);const seated=p.clone();
 const block=c.physics.createCollider(c.R.ColliderDesc.cuboid(.4,.6,.4).setTranslation(s.returnPosition.x,s.returnPosition.y-.3,s.returnPosition.z));c.physics.step();assert.equal(s.stand(),false);assert.equal(s.state,'seated');assert.deepEqual(p,seated);c.physics.removeCollider(block,true);c.physics.step();assert.ok(s.stand());for(let i=0;i<300&&s.active;i++)s.step(dt);assert.equal(s.state,'idle');assert.ok(p.distanceTo(s.returnPosition)<1e-5);assert.equal(c.overlaps(p),false);
 }finally{s.dispose();c.dispose();for(const part of all)part.geometry.dispose();}}
});

test('source anchors are tied to actual editable final sources, accepted feature defaults on',()=>{
 for(const s of source.sources)assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+s.path,import.meta.url))).digest('hex'),s.sha256);
 assert.equal(source.seats.length,3);for(const s of source.seats){assert.ok(s.normal[2]>.99);assert.ok(s.localSeat[1]>.3&&s.localSeat[1]<.6);}
});

test('three seats require the real standing eye band and a forward view, shared by nearest and sit',()=>{
 for(const def of source.seats){const world={entities:[{id:def.entityId}],surface:{buildingPose:()=>({x:0,y:0,z:0,rot:.4,scale:{x:1,y:1,z:1}})}},seat=representativeSeats39(world)[0],p=seat.position.clone().addScaledVector(seat.front,.85);p.y=seat.position.y+1.1;
 const controls={mode:'walk',physicsPosition:p,yaw:Math.atan2(seat.position.x-p.x,-(seat.position.z-p.z))*180/Math.PI},collision={enabled:true,crouching:false},s=new Seating39(world,controls,collision,{enabled:true});
 assert.equal(s.nearest()?.id,seat.id);controls.yaw+=180;assert.equal(s.nearest(),null);assert.equal(s.sit(seat),false);controls.yaw-=180;p.y+=2.5;assert.equal(s.nearest(),null);assert.equal(s.sit(seat),false);p.y-=5;assert.equal(s.nearest(),null);p.y+=2.5;assert.equal(s.nearest()?.id,seat.id);s.dispose();}
});

test('seat-front turn is smooth and frame-rate independent, with immediate lasting user takeover',()=>{
 const run=dt=>{const controls={yaw:0,pitch:-8},s=new Seating39({entities:[]},controls,{},{});s.beginSeatTurn({front:new T.Vector3(0,0,1)});let previous=controls.yaw;for(let t=0;t<2;t+=dt){s.updateSeatTurn(dt);assert.ok(Math.abs(controls.yaw-previous)<9,'no instant turn');previous=controls.yaw;}assert.ok(Math.abs(Math.abs(controls.yaw)-180)<1e-8);return controls.yaw;};assert.equal(run(1/30),run(1/60));
 const controls={yaw:25,pitch:0},s=new Seating39({entities:[]},controls,{},{});s.beginSeatTurn({front:new T.Vector3(0,0,1)});s.updateSeatTurn(.2);s.takeLookControl();controls.yaw=51;for(let i=0;i<120;i++)s.updateSeatTurn(1/60);assert.equal(controls.yaw,51);
 s.beginSeatTurn({front:new T.Vector3(1,0,0)});s.updateSeatTurn(.1);controls.pitch=12;const yaw=controls.yaw;s.updateSeatTurn(.1);assert.equal(controls.yaw,yaw);assert.equal(s.stats.turn,'user');
});

test("accepted seating defaults on and preserves explicit off",()=>{const previous=globalThis.location;try{for(const [search,want] of [["",true],["?seating39=1",true],["?seating39=0",false]]){globalThis.location={search};assert.equal(seating39Enabled(),want);}}finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}});
