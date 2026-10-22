import test from "node:test";
import assert from "node:assert/strict";
import {DirectionalLight,PerspectiveCamera,Scene,Mesh,BoxGeometry,MeshStandardMaterial} from "three";
import {SunShadowCasters} from "./sun-shadow-casters.js";
import {SunShadowScheduler} from "./sun-shadow-scheduler.js";
function fixture(){
 const lights=[40,160,500].map(span=>{const l=new DirectionalLight();Object.assign(l.shadow.camera,{left:-span/2,right:span/2,bottom:-span/2,top:span/2});l.shadow.mapSize.set(2048,2048);l.shadow.map={};return l;});
 return {lights,camera:new PerspectiveCamera(),scheduler:new SunShadowScheduler(lights)};
}
const rendered=lights=>lights.forEach(l=>l.shadow.needsUpdate=false);
test("stationary cascades retain full resolution and limit wind drift below a shadow texel",()=>{
 const {lights,camera,scheduler}=fixture(),original=lights.map(l=>l.shadow.mapSize.toArray());
 scheduler.update(1/60,camera);rendered(lights);scheduler.update(1/60,camera);
 assert.equal(lights[0].shadow.needsUpdate,true);assert.equal(lights[2].shadow.needsUpdate,false);
 for(let n=0;n<60;n++){rendered(lights);scheduler.update(1/60,camera);}
 for(let i=0;i<lights.length;i++){
  assert.deepEqual(lights[i].shadow.mapSize.toArray(),original[i]);
  const texel=(lights[i].shadow.camera.right-lights[i].shadow.camera.left)/2048;
  assert.ok(scheduler.states[i].interval*1.25<=texel*.3+1e-12);
 }
 assert.ok(scheduler.stats.cascades[2].updates<scheduler.stats.cascades[0].updates);
});
test("camera, sun, resize, streaming and terrain morph invalidate reused maps immediately",()=>{
 const {lights,camera,scheduler}=fixture();
 scheduler.update(0,camera);
 const invalidate=fn=>{rendered(lights);fn();scheduler.update(0,camera);assert.ok(lights.every(l=>l.shadow.needsUpdate));};
 invalidate(()=>camera.position.x+=.001);
 invalidate(()=>camera.rotation.y+=.001);
 invalidate(()=>{camera.aspect=2;camera.updateProjectionMatrix();});
 invalidate(()=>lights.forEach(l=>l.position.x+=1));
 invalidate(()=>scheduler.setSceneState("new-casters"));
 invalidate(()=>scheduler.setSceneState("new-casters",true));
 rendered(lights);scheduler.update(0,camera);assert.ok(lights.every(l=>!l.shadow.needsUpdate));
 scheduler.dispose();assert.ok(lights.every(l=>l.shadow.autoUpdate));
});

test("caster revisions invalidate only their own cascade",()=>{
 const {lights,camera,scheduler}=fixture();
 scheduler.setSceneState([1,1,1]);scheduler.update(0,camera);rendered(lights);
 scheduler.setSceneState([1,2,1]);scheduler.update(0,camera);
 assert.deepEqual(lights.map(l=>l.shadow.needsUpdate),[false,true,false]);
});

test('due prediction never skips a map which the scheduler would reuse',()=>{
 const {lights,camera,scheduler}=fixture();
 for(const dt of [0,.001,.016,.05,.02,.12,.001,.03,.016]){
  rendered(lights);const due=scheduler.dueCascades(dt);scheduler.update(dt,camera);
  due.forEach((yes,i)=>{if(yes)assert.equal(lights[i].shadow.needsUpdate,true);});
 }
 const before=scheduler.elapsed;scheduler.dueCascades(.1);assert.equal(scheduler.elapsed,before);
});

test('spatial due prediction matches the exact fields used by rendering and preserves stationary reuse',()=>{
 const {lights,camera,scheduler}=fixture();scheduler.update(0,camera);rendered(lights);
 assert.deepEqual(scheduler.dueCascades(0,camera),[false,false,false]);
 const invalidate=(change,expected)=>{
  change();const before=scheduler.elapsed,counts=JSON.stringify(scheduler.stats),signatures=scheduler.states.map(s=>s.signature);
  assert.deepEqual(scheduler.dueCascades(0,camera),expected);
  assert.equal(scheduler.elapsed,before);assert.equal(JSON.stringify(scheduler.stats),counts);assert.deepEqual(scheduler.states.map(s=>s.signature),signatures);
  scheduler.update(0,camera);assert.deepEqual(lights.map(l=>l.shadow.needsUpdate),expected);rendered(lights);
  assert.deepEqual(scheduler.dueCascades(0,camera),[false,false,false]);
 };
 invalidate(()=>camera.position.x+=.0001,[true,true,true]);
 invalidate(()=>camera.rotation.y+=.0001,[true,true,true]);
 invalidate(()=>{camera.aspect=2;camera.updateProjectionMatrix();},[true,true,true]);
 invalidate(()=>lights[1].position.x+=.01,[false,true,false]);
 invalidate(()=>lights[2].target.position.z+=.01,[false,false,true]);
 for(const key of ['left','right','top','bottom','near','far'])invalidate(()=>lights[0].shadow.camera[key]+=.01,[true,false,false]);
 // Layers are intentionally not a scheduler spatial field: the existing caster
 // scan still detects layer-dependent membership. Never skip on an extra field
 // which the render refresh decision does not also track.
 camera.layers.set(3);assert.deepEqual(scheduler.dueCascades(0,camera),[false,false,false]);
 scheduler.update(0,camera);assert.deepEqual(lights.map(l=>l.shadow.needsUpdate),[false,false,false]);
});

test('legacy prediction remains compatible and a force is effective before caster revisions arrive',()=>{
 const {lights,camera,scheduler}=fixture();scheduler.update(0,camera);rendered(lights);
 camera.position.x=2;assert.deepEqual(scheduler.dueCascades(0),[false,false,false]);
 assert.deepEqual(scheduler.dueCascades(0,camera),[true,true,true]);scheduler.update(0,camera);rendered(lights);
 assert.deepEqual(scheduler.dueCascades(0,camera,{force:true}),[true,true,true]);
 scheduler.setSceneState([0,0,0],true);scheduler.update(0,camera);assert.ok(lights.every(l=>l.shadow.needsUpdate));rendered(lights);
 assert.deepEqual(scheduler.dueCascades(0,camera),[false,false,false]);
 scheduler.setSceneState([0,0,0],true);assert.deepEqual(scheduler.dueCascades(0,camera,{force:false}),[true,true,true]);
});

test('prediction cannot skip an update that rendering would reuse across camera, light and cadence sequences',()=>{
 const {lights,camera,scheduler}=fixture();let seed=123456;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 for(let i=0;i<500;i++){
  rendered(lights);const dt=random()*.02;
  if(i%7===0)camera.position.x+=random()*.001;
  if(i%11===0)camera.rotation.y+=random()*.001;
  if(i%13===0)lights[i%3].target.position.x+=.001;
  if(i%17===0)lights[i%3].shadow.camera.far+=.001;
  if(i%19===0){camera.zoom=1+random();camera.updateProjectionMatrix();}
  const due=scheduler.dueCascades(dt,camera);scheduler.update(dt,camera);
  assert.deepEqual(due,lights.map(l=>l.shadow.needsUpdate));
 }
});

test('spatial skip retains scene matrix propagation and the next cacheable frame observes deferred edits',()=>{
 const {lights,camera,scheduler}=fixture(),scene=new Scene();
 for(const light of lights){light.position.set(0,10,0);scene.add(light,light.target);}
 const mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());mesh.castShadow=true;scene.add(mesh);
 const tracker=new SunShadowCasters(scene,lights);
 let result=tracker.update(camera);scheduler.setSceneState(result.revisions);scheduler.update(0,camera);rendered(lights);
 assert.deepEqual(result.counts,[1,1,1]);const revisions=[...result.revisions];
 camera.position.x=.01;mesh.position.x=1;mesh.geometry.attributes.position.needsUpdate=true;
 const skip=scheduler.dueCascades(0,camera);assert.deepEqual(skip,[true,true,true]);
 result=tracker.update(camera,{skipCascades:skip});
 assert.equal(tracker.stats.objectScans,0);assert.equal(mesh.matrixWorld.elements[12],1);
 assert.deepEqual(result.revisions,revisions);
 scheduler.setSceneState(result.revisions);scheduler.update(0,camera);assert.ok(lights.every(l=>l.shadow.needsUpdate));rendered(lights);
 assert.deepEqual(scheduler.dueCascades(0,camera),[false,false,false]);
 result=tracker.update(camera,{skipCascades:scheduler.dueCascades(0,camera)});
 assert.ok(result.revisions.every((n,i)=>n>revisions[i]));
 scheduler.setSceneState(result.revisions);scheduler.update(0,camera);assert.ok(lights.every(l=>l.shadow.needsUpdate));rendered(lights);
 result=tracker.update(camera,{skipCascades:scheduler.dueCascades(0,camera)});
 scheduler.setSceneState(result.revisions);scheduler.update(0,camera);assert.ok(lights.every(l=>!l.shadow.needsUpdate));
 tracker.dispose();scheduler.dispose();mesh.geometry.dispose();mesh.material.dispose();
});
