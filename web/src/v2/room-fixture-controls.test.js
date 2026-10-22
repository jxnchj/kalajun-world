import test from "node:test";
import assert from "node:assert/strict";
import {MeshStandardMaterial,ShaderLib,UniformsUtils} from "three";
import {RoomFixtureControls} from "./room-fixture-controls.js";

const room=(id,x=0)=>({id,pose:{x,y:0,z:0,rot:.4,scale:{x:1,y:1,z:1}},asset:{floor:{x0:-2,x1:4,z0:-4,z1:3.25}}});

test("room controls preserve automatic power, keep per-instance state and cycle independently",()=>{
  const a=room("A:1"),b=room("B:1",50),c=new RoomFixtureControls([a,b]);
  assert.equal(c.power(a.id,0),.018);assert.equal(c.power(a.id,1),.018+.462);
  assert.equal(c.cycle(),undefined);c.setActive(a);assert.equal(c.cycle(),"on");assert.equal(c.power(a.id,0),.48);
  assert.equal(c.cycle(),"off");assert.equal(c.power(a.id,1),0);assert.equal(c.uniforms.uRoomFixtureEnabled.value[0],0);
  c.setActive(b);assert.equal(c.mode(b.id),"auto");assert.equal(c.power(b.id,1),.018+.462);
  c.setActive(null);c.setActive(a);assert.equal(c.mode(a.id),"off");assert.equal(c.cycle(),"auto");
  assert.throws(()=>c.setMode("missing","off"));assert.throws(()=>c.setMode(a.id,"invalid"));c.dispose();
});

test("switch masks only the authored fixture emissive material and includes instanced world position",()=>{
  const c=new RoomFixtureControls([room("A:1"),room("B:1",50)]),glow=new MeshStandardMaterial(),wood=new MeshStandardMaterial();
  glow.userData.sourceMaterialNames=["v2_glow"];wood.userData.sourceMaterialNames=["v2_oak"];
  const woodCompile=wood.onBeforeCompile;let previous=false;glow.onBeforeCompile=()=>{previous=true;};
  c.register([glow,wood]);c.register([glow]);
  const shader={uniforms:UniformsUtils.clone(ShaderLib.standard.uniforms),vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
  glow.onBeforeCompile(shader);assert.equal(previous,true);assert.equal(wood.onBeforeCompile,woodCompile);
  assert.ok(shader.vertexShader.includes("fixtureWorldVertex=instanceMatrix*fixtureWorldVertex"));
  assert.equal(shader.fragmentShader.match(/totalEmissiveRadiance\*=uRoomFixtureEnabled/g).length,1);
  c.setMode("B:1","off");assert.deepEqual(shader.uniforms.uRoomFixtureEnabled.value,[1,0]);c.dispose();
});

test("room switch UI obeys keyboard focus, repeated keys and disposal",()=>{
  const a=room("A:1"),handlers=new Map(),button={style:{},setAttribute(){},addEventListener(type,fn){handlers.set(type,fn);},remove(){this.removed=true;}};
  const panel={querySelector(){return null;},insertBefore(){}};
  const doc={querySelector(){return panel;},createElement(){return button;}};
  const events={addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);}};
  const c=new RoomFixtureControls([a],{document:doc,eventTarget:events});assert.equal(button.hidden,true);
  c.setActive(a);assert.equal(button.hidden,false);let prevented=false;
  const e={code:"KeyL",target:{tagName:"BODY"},preventDefault(){prevented=true;}};
  handlers.get("keydown")({...e,repeat:true});handlers.get("keydown")({...e,target:{tagName:"INPUT"}});assert.equal(c.mode(a.id),"auto");
  handlers.get("keydown")(e);assert.equal(prevented,true);assert.equal(c.mode(a.id),"on");assert.ok(button.textContent.includes("开启"));
  handlers.get("click")();assert.equal(c.mode(a.id),"off");
  c.setActive(null);assert.equal(button.hidden,true);handlers.get("keydown")(e);assert.equal(c.mode(a.id),"off");
  c.dispose();assert.equal(handlers.has("keydown"),false);assert.equal(button.removed,true);
});
