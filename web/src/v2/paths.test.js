import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { WorldPaths } from "./paths.js";
test("ribbon faces upward on every heading; wooden routes are solid boards",()=>{
  const paths=[];
  for(let i=0;i<8;i++){const a=i*Math.PI/4;paths.push({width:2,pts:[[0,0],[Math.cos(a)*15,Math.sin(a)*15]]});}
  const layer=new WorldPaths({objects:{tracks:paths,boardwalks:[{width:1.5,pts:[[0,0],[0,-10]]}]},surface:{heightAt:(x,z)=>100+x*.03}});
  for(const mesh of layer.group.children.filter(m=>m.userData.kind==="dirt")){
    const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
    for(let i=0;i<ix.count;i+=3){
      const a=new Vector3().fromBufferAttribute(p,ix.getX(i)),b=new Vector3().fromBufferAttribute(p,ix.getX(i+1)),c=new Vector3().fromBufferAttribute(p,ix.getX(i+2));
      assert.ok(b.sub(a).cross(c.sub(a)).y>0,"path top must face the viewer above it");
    }
  }
  const board=layer.group.children.find(m=>m.userData.kind==="boardwalk");
  assert.ok(board.count>30);assert.equal(board.geometry.index.count,36);
  layer.dispose();
});
