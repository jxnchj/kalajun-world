import test from "node:test";
import assert from "node:assert/strict";
import {worldViewpoints,initialViewpoint,floorClearance} from "./viewpoints.js";
test("world navigation retains old links and resolves stable room/water links",()=>{
  const places=worldViewpoints({water:[{id:"brook",name:"溪岸",x:1,z:2,above:2,yaw:30,pitch:-2}],rooms:[{id:"room",name:"客房",x:2,y:100,z:4,yaw:10,pitch:0}],life:[{id:"pasture-sheep",name:"羊群",category:"牧居生活",x:3,z:8,above:1.9,yaw:20,pitch:-4}]});
  assert.equal(initialViewpoint(new URLSearchParams("place=4"),places),4);
  assert.equal(places[initialViewpoint(new URLSearchParams("view=room"),places)].id,"room");
  assert.equal(initialViewpoint(new URLSearchParams("view=unknown&place=NaN"),places),0);
  assert.equal(places[initialViewpoint(new URLSearchParams("view=pasture-sheep"),places)].id,"pasture-sheep");
  assert.throws(()=>worldViewpoints({life:[{...places[0]}]}),/duplicate/);
  assert.throws(()=>worldViewpoints({rooms:[{...places[0]}]}),/duplicate/);
});
test("room floors support the eye above cut terrain without lifting it to a roof",()=>{
  const world={surface:{heightAt:()=>99.8}};
  assert.equal(floorClearance(world,()=>100.035,0,0),101.585);
  assert.equal(floorClearance(world,()=>null,0,0),101.5);
  assert.equal(floorClearance(world,()=>98,0,0),101.5);
});
