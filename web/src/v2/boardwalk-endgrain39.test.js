import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBoardwalkMaterials} from './boardwalk-material.js';
import {boardwalkEndGrain39Enabled} from './boardwalk-endgrain39.js';
import {timberGeometry} from './boardwalk-timber.js';
test('endgrain defaults on with explicit old-material fallback; independent material transform preserves complete original mesh',async()=>{
 assert.equal(boardwalkEndGrain39Enabled(),true);const previous=globalThis.location;try{globalThis.location={search:'?boardwalkEndGrain39=0'};assert.equal(boardwalkEndGrain39Enabled(),false);}finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
 const before=['plank','bearer','post'].map(k=>timberGeometry(k));
 const a=createBoardwalkMaterials({loadTexture:async()=>new THREE.Texture(),endGrain39:false});const b=createBoardwalkMaterials({loadTexture:async()=>new THREE.Texture(),endGrain39:true});await Promise.all([a.load(),b.load()]);
 assert.equal(a.materials[1].map.repeat.x,1);assert.equal(b.materials[1].map.colorSpace,THREE.SRGBColorSpace);
 assert.deepEqual(a.materials[0].color,b.materials[0].color);assert.equal(b.materials[0].map.repeat.x,1);
 for(const[k,idx]of [['plank',0],['bearer',1],['post',2]]){const g=timberGeometry(k);for(const n of Object.keys(g.attributes))assert.deepEqual(g.attributes[n].array,before[idx].attributes[n].array);assert.deepEqual(g.index.array,before[idx].index.array);assert.deepEqual(g.groups,before[idx].groups);g.dispose();before[idx].dispose();}
 // The same sawn surface covers 0.29/.42 UV horizontally rather than .261.
 const tex=b.materials[1].map;assert.ok(Math.abs(.29*.9*tex.repeat.x-.29/.42)<1e-12);
 assert.ok(Math.abs(.67*tex.repeat.x+tex.offset.x-.5)<1e-12);
 assert.ok(Math.abs(.62*tex.repeat.y+tex.offset.y-.55)<1e-12);
 a.dispose();b.dispose();
});
