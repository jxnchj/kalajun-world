import test from 'node:test';import assert from 'node:assert/strict';import {Vector3,Sphere,PerspectiveCamera} from 'three';
import {createLegacyRoomOpeningPrefetch} from './legacy-room-loader.js';
import {RoomViewSelection} from './room-view-selection.js';
const entry=(key,x=0)=>({item:{asset:{sourceAsset:key}},openings:[{sphere:new Sphere(new Vector3(x,0,0),1),normal:new Vector3(-1,0,0)}]});
const turn=()=>new Promise(r=>setImmediate(r));
test('OFF does not fetch; ON starts only actual nearby family even when opening faces away',async()=>{
 const calls=[],loader={ready:new Set(),prepare:async k=>{calls.push(k);}};
 const entries=[entry('house_a'),entry('house_a',4),entry('yurt',100),entry('unrelated',0)];
 const off=createLegacyRoomOpeningPrefetch(entries,{enabled:false,loader});off.update(new Vector3());await turn();assert.deepEqual(calls,[]);
 const p=createLegacyRoomOpeningPrefetch(entries,{enabled:true,loader});p.update(new Vector3(30.01,0,0));await turn();assert.deepEqual(calls,['house_a']); // second actual opening is 26.01m
 p.update(new Vector3(30,0,0));await turn();assert.deepEqual(calls,['house_a']);assert.equal(p.stats.completed,1);
 p.update(new Vector3(70,0,0));await turn();assert.deepEqual(calls,['house_a','yurt']);p.dispose();off.dispose();
});
test('pending deduplicates, failure is inspectable, original loader retry still works; disposal never changes selection',async()=>{
 let release,calls=0;const loader={ready:new Set(),prepare:()=>{calls++;return calls===1?new Promise((_,reject)=>release=reject):Promise.resolve();}};
 const p=createLegacyRoomOpeningPrefetch([entry('house_a')],{enabled:true,loader});p.update(new Vector3());p.update(new Vector3());await Promise.resolve();assert.equal(calls,1);release(Error('offline'));await turn();assert.equal(p.stats.failures,1);assert.equal(p.stats.pending,0);p.update(new Vector3());await turn();assert.equal(calls,1);await loader.prepare('house_a');assert.equal(calls,2);p.dispose();
 let done;const q=createLegacyRoomOpeningPrefetch([entry('yurt')],{enabled:true,loader:{ready:new Set(),prepare:()=>new Promise(r=>done=r)}});q.update(new Vector3());await Promise.resolve();q.dispose();done();await turn();assert.equal(q.stats.completed,0);q.update(new Vector3());assert.equal(q.stats.requests,1);
});
test('look-ahead keeps original 12m selection and 14m retention unmodified',async()=>{
 const item={id:'room',asset:{sourceAsset:'house_a',openings:[{kind:'window',center:[0,0,0],width:1,height:1,normal:[0,0,1]}]},pose:{x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}}};
 const selection=new RoomViewSelection([item]),camera=new PerspectiveCamera(60,1.6,.1,100),calls=[];
 const p=createLegacyRoomOpeningPrefetch(selection.entries,{enabled:true,loader:{ready:new Set(),prepare:async k=>calls.push(k)}});
 const at=z=>{camera.position.set(0,0,z);camera.lookAt(0,0,0);camera.updateMatrixWorld();return selection.select(camera,camera.position,null);};
 p.update(new Vector3(0,0,20));await turn();assert.deepEqual(calls,['house_a']);assert.equal(at(20),null);assert.equal(at(11),item);assert.equal(at(13),item);assert.equal(at(14.1),null);assert.equal(selection.distance,12);assert.equal(selection.retainDistance,14);p.dispose();
});
