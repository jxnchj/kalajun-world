import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LODGE_TABLES_SOURCE as SOURCE,LODGE_TABLES_KEY,lodgeTablesEnabled} from './lodge-tables-definition.js';
import {loadLodgeTables,lodgeTablesCollision} from './lodge-tables-loader.js';
import {originalLodgeChairsCollision} from './lodge-chairs-loader.js';
const raw=readFileSync(new URL('../../../assets/src/v2/settlements/lodge-tables-v38/lodge-tables-complete.glb',import.meta.url));
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const fetchImpl=async()=>new Response(raw);
test('tables default selects complete independent source and preserves legacy comparisons',()=>{
 assert.equal(lodgeTablesEnabled(''),true);assert.equal(lodgeTablesEnabled('?lodgeTables38=0'),false);assert.equal(lodgeTablesEnabled('?lodgeTables38=1'),true);
 for(const q of ['lodgeChairs38=0','lodgeFurniture=0','lodgeWood=1']){assert.equal(lodgeTablesEnabled('?'+q),false);assert.throws(()=>lodgeTablesEnabled('?lodgeTables38=1&'+q),/complete/);}
 assert.equal(LODGE_TABLES_KEY,'gh_lanchuan_lodge-tables-whole');assert.notEqual(SOURCE.sourceSHA256,SOURCE.originalSHA256);
});
test('tables rejects corrupt bytes before parse, no old source fallback',async()=>{
 let parses=0;await assert.rejects(loadLodgeTables('./unregistered.glb',{parseAsync(){parses++;}},{fetchImpl:async()=>new Response(raw.subarray(1))}),/checksum/);assert.equal(parses,0);
 await assert.rejects(loadLodgeTables('./unregistered.glb',{parseAsync(){parses++;}},{fetchImpl:async()=>new Response('',{status:503})}),/503/);
});
test('actual new geometry collision includes grounded tea feet and identical 24-chair proxies',async()=>{
 const g=await loadLodgeTables('./unregistered.glb',new GLTFLoader(),{fetchImpl});
 let total=0;const chairs=new Set();g.scene.traverse(n=>{if(n.isMesh){total+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;if(n.userData.lodgeChair38)chairs.add(n.userData.lodgeChair38.split('_')[1]);}});
 assert.equal(total,128328);assert.equal(chairs.size,24);
 const parts=await lodgeTablesCollision(g),old=await originalLodgeChairsCollision(),kept=parts.filter(p=>!p.tableReplacement),added=parts.filter(p=>p.tableReplacement);
 assert.equal(kept.length,old.length);for(let i=0;i<old.length;i++){assert.deepEqual(kept[i].geometry.attributes.position.array,old[i].geometry.attributes.position.array);assert.deepEqual(kept[i].geometry.index.array,old[i].geometry.index.array);}
 assert.equal(added.reduce((n,p)=>n+p.triangles,0),14560);
 const feet=new Map();for(const p of added){p.geometry.computeBoundingBox();if(p.names[0].startsWith('tablecraft38_tea_support_')){const b=p.geometry.boundingBox;if(!feet.has(p.names[0]))feet.set(p.names[0],b.clone());else feet.get(p.names[0]).union(b);}}
 assert.equal(feet.size,3);for(const b of feet.values()){assert.ok(Math.abs(b.min.y-.026)<1e-6);assert.ok(b.min.x>=4.84981&&b.max.x<=5.73712);assert.ok(b.min.z>=-.83009&&b.max.z<=.04291);}
 // Exact geometric ray checks, not a claim of character-controller/browser walk acceptance.
 const meshes=added.map(p=>{const m=new THREE.Mesh(p.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.updateMatrixWorld();return m;});
 const hit=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0),0,3).intersectObjects(meshes).length;
 for(const [x,z]of [[-10.4,1.4],[-6.4,1.4],[-10.4,-1.7],[-6.4,-1.7],[.3,.52],[5.3,-.4]])assert.ok(hit(x,z)>0);
 for(const [x,z]of [[-8.4,1.4],[-8.4,-1.7],[-8.4,0],[-2.3,0],[-2.3,2.5]])assert.equal(hit(x,z),0,'new joinery does not obstruct existing circulation sample');
 await assert.rejects(lodgeTablesCollision({scene:g.scene,userData:{}}),/matching source/);
 for(const p of [...parts,...old])p.geometry.dispose();
});
test('actual new dining table, reception and supported tea table block a swept Rapier walking body while aisle remains traversable',async()=>{
 const R=await import('@dimforge/rapier3d-compat');await R.init();
 const g=await loadLodgeTables('./unregistered.glb',new GLTFLoader(),{fetchImpl}),parts=await lodgeTablesCollision(g),world=new R.World({x:0,y:-9.81,z:0});
 try{
 world.createCollider(R.ColliderDesc.cuboid(30,.02,20).setTranslation(0,0,0));
 for(const p of parts.filter(p=>p.tableReplacement)){const a=p.geometry.attributes.position,idx=p.geometry.index;world.createCollider(R.ColliderDesc.trimesh(new Float32Array(a.array),new Uint32Array(idx.array)));}
 const body=world.createCollider(R.ColliderDesc.capsule(.605,.22).setTranslation(0,.86,0));world.step();
 const controller=world.createCharacterController(.015);controller.enableAutostep(.28,.18,false);controller.enableSnapToGround(.22);
 const move=(start,target)=>{body.setTranslation({x:start[0],y:.86,z:start[1]});world.step();let blocked=0;for(let i=0;i<160;i++){const p=body.translation(),dx=target[0]-p.x,dz=target[1]-p.z,d=Math.hypot(dx,dz);if(d<.05)return {reached:true,p,blocked};controller.computeColliderMovement(body,{x:dx/d*Math.min(.035,d),y:-.02,z:dz/d*Math.min(.035,d)});const m=controller.computedMovement();blocked+=controller.numComputedCollisions();body.setTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step();}return{reached:false,p:body.translation(),blocked};};
 for(const[label,start,end]of [['dining',[-8.7,1.4],[-10.4,1.4]],['reception',[.3,1.5],[.3,.5]],['tea',[5.3,1.0],[5.3,-.4]]]){const r=move(start,end);assert.equal(r.reached,false,label);assert.ok(r.blocked>0,label);}
 const r=move([-8.4,2.5],[-8.4,-2.5]);assert.equal(r.reached,true,'unchanged central dining aisle');
 }finally{world.free();for(const p of parts)p.geometry.dispose();}
});
