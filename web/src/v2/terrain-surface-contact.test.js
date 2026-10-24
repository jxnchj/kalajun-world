import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrainSurfaceContact} from './terrain-surface-contact.js';
function node(x,z,size,heights=[0,1,2,4],alternate=false){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,heights[0],0,size,heights[1],0,0,heights[2],size,size,heights[3],size],3));g.setIndex(alternate?[0,2,3,0,3,1]:[0,2,1,1,2,3]);const mesh=new THREE.Mesh(g);mesh.position.set(x,0,z);mesh.userData.terrainTile={spacing:size};return {x,z,size,mesh,split:false,dead:false};}
test('actual indices, hidden batched leaves, morph and replacement all update contact without touching roots',()=>{
 const a=node(-20,30,2),terrain={roots:[a]},contact=createTerrainSurfaceContact(terrain),points=[{x:-19.5,z:30.5}],bound=contact.bind(points);assert.equal(bound.samples()[0].height,.75);assert.equal(bound.changed(),false);
 a.mesh.visible=false;assert.equal(contact.sample(-19.5,30.5).height,.75,'submission-only hidden mesh stays authoritative');
 a.mesh.geometry.setIndex([0,2,3,0,3,1]);a.mesh.geometry.index.needsUpdate=true;assert.equal(bound.changed(),true);assert.equal(bound.samples()[0].height,1);assert.equal(bound.changed(),false);
 a.mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,2,0,0,2,0,0,2,0,0,2,0],3)];a.mesh.geometry.morphTargetsRelative=true;a.mesh.morphTargetInfluences=[.5];assert.equal(bound.changed(),true);assert.equal(bound.samples()[0].height,2);
 a.split=true;a.children=[node(-20,30,1,[3,3,3,3]),node(-19,30,1),node(-20,31,1),node(-19,31,1)];assert.equal(bound.changed(),true);assert.equal(bound.samples()[0].height,3);assert.equal(bound.changed(),false);
 a.children[0].dead=true;a.split=false;assert.equal(bound.changed(),true);assert.equal(bound.samples()[0].height,2);
 assert.deepEqual(points,[{x:-19.5,z:30.5}]);
});
