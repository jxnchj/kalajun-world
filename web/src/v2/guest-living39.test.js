import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {createHash}from'node:crypto';import {gunzipSync}from'node:zlib';import * as T from 'three';import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import {guestLivingEnabled,GUEST_LIVING_SOURCE as S}from'./guest-living-definition.js';import {loadGuestLiving,guestLivingURL}from'./guest-living-loader.js';import {WorldStructures}from'./structures.js';import {WorldCollision}from'./collision.js';
const raw=readFileSync(new URL('../../public/'+S.sourceGLB,import.meta.url)),gz=readFileSync(new URL('../../public/'+S.sourceGLB+'.gz',import.meta.url)),fetcher=async u=>new Response(u.includes('.gz?')?gz:raw);
const e={assetId:'gh_lanchuan',id:'guest'},world={entities:[e],manifest:{assetMetadata:{}},surface:{buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
const loader=()=>{const l=new GLTFLoader();l.register(()=>({name:'test-texture',loadTexture:async()=>new T.Texture()}));return l;};
test('living defaults on with explicit original comparisons, conflicts fail, lossless bytes/source verified before parse',async()=>{assert.equal(guestLivingEnabled(''),true);assert.equal(guestLivingEnabled('?guestLiving39=0'),false);assert.equal(guestLivingEnabled('?guestVanity38=0'),false);assert.equal(guestLivingEnabled('?guestLiving39=1'),true);assert.throws(()=>guestLivingEnabled('?guestLiving39=1&guestVanity38=0'),/requires/);assert.deepEqual(gunzipSync(gz),raw);assert.equal(createHash('sha256').update(raw).digest('hex'),S.sourceSHA256);const g=await loadGuestLiving(guestLivingURL(),loader(),{fetchImpl:fetcher});assert.equal(g.userData.guestLiving.sourceSHA256,S.sourceSHA256);assert.equal(g.userData.assetTransport.encoding,'gzip');let n=0;g.scene.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});assert.equal(n,S.triangles);let parses=0;await assert.rejects(loadGuestLiving('unregistered',{parseAsync:()=>parses++},{fetchImpl:async()=>new Response(new Uint8Array(40))}),/checksum/);assert.equal(parses,0);});
test('new joinery uses actual collision while retained vanity proxy and repaired shower persist; all rooms walk to bathroom and back',async()=>{
 const s=new WorldStructures(world,{guestLivingFetch:fetcher,cooperativePreparation:false});s.loader.register(()=>({name:'test-texture',loadTexture:async()=>new T.Texture()}));await s.load();
 try{assert.equal(s.stats.triangles,S.triangles);assert.equal(s.stats.assetPreparation.assets.gh_lanchuan.guestLiving.sourceSHA256,S.sourceSHA256);const parts=s.collisionPartsFor(e);assert.ok(parts.some(p=>p.names?.some(n=>n.includes('living39_'))));assert.equal(parts.filter(p=>p.vanityReplacement).length,0);assert.equal(s._guestVanityCollision.reduce((n,p)=>n+p.triangles,0),3552);
 for(const [i,x,bx,wx]of [[1,3.3,.6,-1.41],[2,8.9,5.9,4.74],[3,13.85,12,10.34]]){
 const w={entities:[{assetId:'house_a',id:'probe'}],surface:{buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}),heightAt:()=>0}},c=new WorldCollision(w,{structures:{collisionPartsFor:()=>parts}}),p=new T.Vector3(x-.13,1.6,2.2);await c.enable(p);
 const walk=(tx,tz,max=500)=>{for(let j=0;j<max;j++){let dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);if(d<.035)return true;c.move(p,new T.Vector3(dx/d*Math.min(.025,d),0,dz/d*Math.min(.025,d)),1/60);}return false;};
 try{assert.ok(walk(x,-2.85),`room${i} bathroom entrance ${p.toArray()}`);assert.equal(walk(x,-3.55,160),false);assert.ok(walk(x-.13,2.2));assert.equal(c.overlaps(p),false);
 // From original clear aisle approach the footboard, then wardrobe face. No
 // collider bypass: both targets are inside real new joinery and must stop.
 assert.ok(walk(bx,.4));assert.equal(walk(bx,-2.55,160),false,`room${i} bed blocks`);assert.ok(p.z> -1.5);assert.ok(walk(bx,.4));assert.ok(walk(wx+.85,.4));assert.equal(walk(wx,.6,100),false,`room${i} wardrobe blocks`);assert.equal(c.overlaps(p),false);
 }finally{c.dispose();}
 }
 }finally{s.dispose();}
});
