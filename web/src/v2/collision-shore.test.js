import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WorldCollision,collisionTriangles} from './collision.js';
import {createShoreStones,createShoreRockGeometry,shoreStoneMatrix} from './shore-stones.js';
function fixture(){
 const a={x:0,z:0,distance:0,width:4,level:-.08,depth:.3,flowX:1,flowZ:0},b={...a,x:4,distance:4};
 const segment={id:'river-shore-collision:13',index:1,a,b,length:4,flowX:1,flowZ:0};
 const world={entities:[],surface:{heightAt:()=>0},hydrology:{nearSegments:()=>[segment],sampleAt:()=>({wetness:.8,waterLevel:-.08,insideWater:false,flowX:1,flowZ:0})}};
 return {world,records:createShoreStones(world,[segment])};
}
test('walking shore bodies use every triangle of the rendered scanned stone and identical instance transforms',async()=>{
 const {world,records}=fixture(),p=new T.Vector3(0,1.6,-6),c=new WorldCollision(world);await c.enable(p);
 const g=createShoreRockGeometry();assert.equal(c.stats.activeShoreStones,records.length);assert.equal(c.stats.shoreTriangles,records.length*g.index.count/3);
 for(const r of records){const item=c.stones.get(r.id),expected=collisionTriangles([{geometry:g}],shoreStoneMatrix(r),c.origin);assert.deepEqual(Array.from(item.c.vertices()),Array.from(expected.vertices));assert.deepEqual(Array.from(item.c.indices()),Array.from(expected.indices));}
 c.disable();assert.equal(c.stones.size,0);assert.equal(c.stats.activeShoreStones,0);c.dispose();g.dispose();
});
test('continuous motion follows or slides around a scanned bank stone without intersecting its body',async t=>{
 const {world,records}=fixture(),g=createShoreRockGeometry(),r=records.filter(r=>r.sourceSide!==0).sort((a,b)=>b.scale*b.sy-a.scale*a.sy)[0],box=g.boundingBox.clone().applyMatrix4(shoreStoneMatrix(r));
 assert.ok(box.max.y>.28,'stone must be taller than autostep');
 const start=new T.Vector3(box.min.x-1,1.6,r.z),c=new WorldCollision(world);await c.enable(start);
 let maxY=start.y,contacts=0;const unobstructedX=start.x+4;
 for(let i=0;i<50;i++){c.move(start,new T.Vector3(.08,0,0),.05);maxY=Math.max(maxY,start.y);contacts+=c.stats.collisions;assert.equal(c.overlaps(start),false,'the swept capsule must never occupy the scanned shell');}
 assert.ok(start.x<unobstructedX-.3,'collision changes the free horizontal trajectory');assert.ok(Math.abs(start.z-r.z)>.2,'real inclined rock slides the body sideways');assert.ok(maxY>1.8,'walk follows the real sloping rock rather than cutting through it');assert.ok(contacts>0);
 t.diagnostic(JSON.stringify({id:r.id,height:box.max.y,stopped:start.toArray(),triangles:c.stats.shoreTriangles}));c.dispose();g.dispose();
});
test('walking shore physics streams out distant originals and restores them after rebase without accumulating colliders',async()=>{
 const {world,records}=fixture(),p=new T.Vector3(0,1.6,-6),c=new WorldCollision(world);await c.enable(p);const count=c.physics.colliders.len();
 p.x=600;c.move(p,new T.Vector3(),.05);assert.equal(c.stats.activeShoreStones,0);
 p.x=0;c.move(p,new T.Vector3(),.05);assert.equal(c.stats.activeShoreStones,records.length);assert.equal(c.physics.colliders.len(),count);assert.equal(c.stats.rebases,2);c.dispose();
});
