import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {LodgeInteriorStream,lodgeInteriorStreamEnabled,loadLodgeStreamPackage} from './lodge-interior-stream.js';
import {LODGE_DOOR} from './lodge-door.js';import {LODGE_CHAIRS_SOURCE} from './lodge-chairs-definition.js';
import {WorldStructures} from './structures.js';
import {LODGE_TABLES_SOURCE} from './lodge-tables-definition.js';
const entity={id:LODGE_DOOR.entityId,assetId:'gh_lanchuan_lodge'},world={entities:[entity],surface:{buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
test('browser default adopts current source while ordinary/offline structures remain full',()=>{
 assert.equal(lodgeInteriorStreamEnabled('?lodgeTables38=1'),true);assert.equal(lodgeInteriorStreamEnabled('?lodgeTables38=1&lodgeInteriorStream38=0'),false);
 assert.equal(lodgeInteriorStreamEnabled(''),true);assert.equal(lodgeInteriorStreamEnabled('?lodgeInteriorStream38=0'),false);assert.equal(lodgeInteriorStreamEnabled('?lodgeInteriorStream38=1'),true);
 for(const q of ['lodgeChairs38=0','lodgeWood=1','lodgeFurniture=0']){assert.equal(lodgeInteriorStreamEnabled('?'+q),false);assert.throws(()=>lodgeInteriorStreamEnabled('?lodgeInteriorStream38=1&'+q),/requires/);}
 const original=globalThis.location;try{globalThis.location={search:'?lodgeInteriorStream38=1'};const full=new WorldStructures(world);assert.equal(full.lodgeStream.enabled,false);full.dispose();const browser=new WorldStructures(world,{lodgeInteriorStream:lodgeInteriorStreamEnabled()});assert.equal(browser.lodgeStream.enabled,true);browser.dispose();}finally{globalThis.location=original;}
});
test('full building bounds gate offscreen shadow/reflection range and distant window views',()=>{
 const gate=new LodgeInteriorStream(world,{enabled:true});gate.setBounds([[-13,0,-4],[13,6,4]]);
 const camera=new T.PerspectiveCamera(52,1,.25,150000);camera.position.set(0,3,2000);camera.lookAt(0,3,0);camera.updateMatrixWorld();
 assert.equal(gate.needs(camera.position,camera),true);camera.lookAt(0,3,4000);camera.updateMatrixWorld();assert.equal(gate.needs(camera.position,camera),false);
 assert.equal(gate.needs(new T.Vector3(0,3,300),camera),true);assert.equal(gate.needs(new T.Vector3(0,3,500),camera),false);
});
test('one shared load waits for material/GI/shader finalization and prevents incomplete collision',async()=>{
 let resolveLoad,resolveFinal,loads=0;const stage={};const gate=new LodgeInteriorStream(world,{enabled:true,load:()=>{loads++;return new Promise(r=>resolveLoad=r);},finalize:()=>new Promise(r=>resolveFinal=r)});
 const first=gate.ensure(),second=gate.ensure();assert.equal(first,second);assert.throws(()=>gate.assertCollision(entity),/not ready/);resolveLoad(stage);await Promise.resolve();assert.equal(gate.stats.status,'preparing');assert.equal(gate.ready,false);resolveFinal();await first;assert.equal(loads,1);gate.assertCollision(entity);assert.equal(gate.ready,true);
});
test('load failures retry fresh, finalize failures retain stage without duplicate load/install',async()=>{
 let loads=0,final=0;const stage={};const gate=new LodgeInteriorStream(world,{enabled:true,load:async()=>{if(++loads===1)throw Error('HTTP');return stage;},finalize:async()=>{if(++final===1)throw Error('compile');}});
 await assert.rejects(gate.ensure(),/HTTP/);assert.equal(gate.ready,false);await assert.rejects(gate.ensure(),/compile/);assert.equal(gate.stage,stage);await gate.ensure();assert.equal(loads,2);assert.equal(final,2);assert.equal(gate.ready,true);
});
test('dispose during in-flight load disposes late stage without publishing it',async()=>{let resolve,disposed=0;const gate=new LodgeInteriorStream(world,{enabled:true,load:()=>new Promise(r=>resolve=r)}),pending=gate.ensure();gate.dispose();resolve({dispose(){disposed++;}});await assert.rejects(pending,/disposed/);assert.equal(disposed,1);assert.equal(gate.ready,false);});
test('package loader verifies transfer and full source before parser; errors never use old source',async()=>{
 const bytes=new Uint8Array([1,2,3]),sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');let parses=0;
 const manifest={sourceSHA256:LODGE_CHAIRS_SOURCE.sourceSHA256,packages:{shell:{url:'fake.glb',sha256:sha,bytes:3}}},loader={parseAsync:async()=>{parses++;return{scene:new T.Group()};}};
 const options={manifestLoader:async()=>manifest,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})};await loadLodgeStreamPackage('shell',loader,options);assert.equal(parses,1);
 manifest.packages.shell.sha256='bad';await assert.rejects(loadLodgeStreamPackage('shell',loader,options),/checksum/);assert.equal(parses,1);
 manifest.sourceSHA256='old';await assert.rejects(loadLodgeStreamPackage('shell',loader,options),/complete source/);
 manifest.sourceSHA256=LODGE_TABLES_SOURCE.sourceSHA256;manifest.packages.shell.sha256=sha;await assert.rejects(loadLodgeStreamPackage('shell',loader,options),/complete source/);await loadLodgeStreamPackage('shell',loader,{...options,sourceBinding:LODGE_TABLES_SOURCE});assert.equal(parses,2);
});
test('incremental installation is idempotent and preserves shell template, resources and matrix ownership',()=>{
 const parent=new WorldStructures(world,{lodgeInteriorStream:false}),stage=new WorldStructures(world,{lodgeInteriorStream:false});
 const key='gh_lanchuan_lodge:',shell={},interior={},geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial(),mesh=new T.Mesh(geometry,material);
 parent._templates.set(key,[shell]);stage._templates.set(key,[interior]);stage.group.add(mesh);stage._geometries.add(geometry);stage.materials.push(material);stage.stats.triangles=12;stage.stats.instances=1;
 parent.installLodgeInterior(stage);parent.installLodgeInterior(stage);assert.deepEqual(parent._templates.get(key),[shell,interior]);assert.equal(parent.group.children.length,1);assert.equal(parent.stats.triangles,12);assert.equal(parent.materials.length,1);assert.equal(stage._geometries.size,0);assert.equal(stage.materials.length,0);stage.dispose();assert.equal(parent.group.children[0],mesh);parent.dispose();
});

test('door GI rejected loader can retry without old failed promise blocking streamed entry',async()=>{
 const {LodgeDoorGI}=await import('./lodge-door-gi.js');let calls=0;
 const field=new LodgeDoorGI({enabled:true,key:'fixture',load:async()=>{calls++;throw Error('offline '+calls);}});
 await assert.rejects(field.prepare('fixture'),/offline 1/);assert.equal(field.pending,null);
 await assert.rejects(field.prepare('fixture'),/offline 2/);assert.equal(calls,2);assert.equal(field.ready,false);field.dispose();
});

test('collision preparation checks the actual requested position instead of preparing a different camera',async()=>{
 const {assertLodgeCollisionCamera}=await import('./lodge-interior-stream.js');const gate=new LodgeInteriorStream(world,{enabled:true}),inside=new T.Vector3(0,2,0),far=new T.Vector3(2000,2,0);
 assert.throws(()=>assertLodgeCollisionCamera(gate,inside,far),/active camera/);assertLodgeCollisionCamera(gate,inside,inside.clone());assertLodgeCollisionCamera(gate,far,inside);gate.ready=true;assertLodgeCollisionCamera(gate,inside,far);
});
