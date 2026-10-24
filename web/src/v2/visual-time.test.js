import {ReachBankCover39} from './forest-reach-cover39.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {WorldEcology,attachEcologyWind}from './ecology.js';
import {WorldWater}from './water.js';
import {WorldEnvironment}from './environment.js';
import {MeadowWindField}from './wind-field.js';
import {SpruceRootWind}from './spruce-wind.js';
import {ForestFloorBatches}from './forest-floor-batches.js';
import {createCloudUniforms}from './cloud-field.js';
import {createHydrology}from './hydrology.js';
import {visualDelta}from './visual-time.js';
import {WorldShadowDepth} from './room-shadow.js';
const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
const frameSource=main.slice(main.indexOf('  function frame(now){'),main.indexOf('  const firstFrameGeneration=viewGeneration;'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
async function systems(){
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,101,0);
 const submission=new ForestFloorBatches(new THREE.Group(),new Map(),{enabled:false});
 const field=new MeadowWindField({resolution:8}),rootWind=new SpruceRootWind();
 const source=new THREE.BoxGeometry(1,1,1),geometry=rootWind.createGeometry(source,2,'visual-time');
 const material=new THREE.MeshBasicMaterial(),mesh=new THREE.InstancedMesh(geometry,material,2);
 mesh.count=2;
 const roots=[{id:'one',x:0,y:100,z:0,s:1,rot:0},{id:'two',x:5,y:100,z:7,s:1,rot:.2}];
 const ecology=Object.create(WorldEcology.prototype);
 Object.assign(ecology,{uniforms:{...field.uniforms,uWindTime:{value:0},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:180}},treeWindCoefficients:{value:false},windField:field,treeRootWind:rootWind,nearTreeBatches:new Map([['visual-time',{mesh,activeRecords:roots}]]),treeBatchRevision:1,last:new THREE.Vector2(0,0),nearLast:new THREE.Vector2(0,0),nearY:101,queue:[],tiles:new Map(),grassQueue:[],stats:{treeNeedleShellTriangles:0},syncActiveTrees(){},updateMeadow(){},reachBankCover39:new ReachBankCover39({}, {enabled:false}),forestFloor:{submission,update(){},stats:{pending:0}}});
 const grass=new THREE.MeshStandardMaterial();attachEcologyWind(grass,ecology.uniforms,1,true);
 const grassShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};grass.onBeforeCompile(grassShader);
 assert.strictEqual(grassShader.uniforms.uWindTime,ecology.uniforms.uWindTime);
 const raw=(x,z)=>100-x*.02+Math.abs(z)*.01;
 const hydrology=createHydrology({streamData:{lines:[[[0,0,2],[4,0,2],[8,0,2],[12,0,2]]]},heightAt:raw});
 const world={hydrology,surface:{heightAt:(x,z)=>hydrology.bedHeightAt(x,z),uncarvedHeightAt:raw}};hydrology.bindSurface(world.surface.heightAt);
 const water=new WorldWater(world);await water.load({textures:false});water.renderReflection=()=>false;
 const env=Object.create(WorldEnvironment.prototype);
 Object.assign(env,{elapsed:0,camera,sky:{position:new THREE.Vector3(),material:{uniforms:{time:{value:0}}}},cloudOrigin:new THREE.Vector3(),clouds:createCloudUniforms(),cloudCache:{update(){}},csm:{update(){},lights:[{color:new THREE.Color(),intensity:1}]},sun:new THREE.Vector3(0,1,0),renderer:{shadowMap:{type:THREE.PCFShadowMap}},shadowReceivers:{update(){}},shadowCasters:{update:()=>({revisions:[]})},shadowScheduler:{setSceneState(){},update(){}},forceShadowUpdate:false,pendingEnv:false,lastEnvironmentTime:0,lastEnvironmentOrigin:camera.position.clone()});
 const controlSteps=[],steps=[],control={update:(first,second)=>steps.push(typeof first==="number"?first:second)},element={open:false},context={visualDelta,shadowDepth:new WorldShadowDepth(new THREE.Scene()),seatingUI:{update(){}},running:true,document:{visibilityState:'visible'},last:0,preparing:false,renderReviewHold:false,gpuExtension:false,gpuPassProfile:null,controls:{update:dt=>controlSteps.push(dt)},terrain:control,structures:{...control,lodgeStream:{needs:()=>false}},ecology,water,pasture:control,doors:control,settlements:control,environment:env,camera,syncShadowState(){},withPreparedWorldMatrices:(_s,render)=>render(),scene:{},renderer:{},renderWorld(){},preparedMatrices:false,performance:{now:()=>context.last},counter:0,frames:[],uiClock:0,$:()=>element,world,drawMap(){},requestAnimationFrame(){},fail:e=>{throw e;}};
 const frame=vm.runInNewContext('('+frameSource+')',context);
 return {frame,context,ecology,water,env,steps,controlSteps,roots,grassShader,geometry,dispose(){ecology.reachBankCover39.dispose();context.shadowDepth.dispose();water.dispose();submission.dispose();field.dispose();rootWind.dispose();geometry.dispose();source.dispose();material.dispose();grass.dispose();}};
}
function timestamps(total,step){const result=[];for(let t=step;t<total;t+=step)result.push(t);result.push(total);return result;}
test('actual frame and grass/tree/water/cloud systems preserve elapsed phase at 60, 10, 2 fps and irregular cadence',async()=>{
 const all=[];
 try{
  for(const times of [timestamps(2.731,1/60),timestamps(2.731,.1),timestamps(2.731,.5),[.016,.128,.503,1.619,1.635,2.731]]){
   const f=await systems();all.push(f);const roots=structuredClone(f.roots);
   for(const t of times)f.frame(t*1000);
   near(f.ecology.uniforms.uWindTime.value,2.731);near(f.water.uniforms.uWaterTime.value,2.731);
   near(f.env.clouds.uCloudTime.value,2.731);near(f.env.sky.material.uniforms.time.value,2.731);
   assert.ok(f.steps.every(dt=>dt>=0&&dt<=.05),'terrain/doors keep bounded dt');
   near(f.controlSteps.reduce((a,b)=>a+b,0),2.731);assert.equal(f.controlSteps.length,times.length);
   for(let i=0;i<times.length;i++)near(f.controlSteps[i],times[i]-(times[i-1]??0));
   assert.deepEqual(f.roots,roots,'wind changes phase, never root placement');
   near(f.grassShader.uniforms.uWindTime.value,2.731);
  }
  for(const f of all.slice(1)){
   for(const name of ['previous','current'])assert.deepEqual(f.ecology.windField[name].image.data,all[0].ecology.windField[name].image.data);
   const a=f.geometry.attributes.aTreeRootWind.data.array,b=all[0].geometry.attributes.aTreeRootWind.data.array;
   for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-6);
  }
 }finally{for(const f of all)f.dispose();}
});
test('actual update methods reject invalid and backward delta without poisoning grass, water or cloud uniforms',async()=>{
 const f=await systems();
 try{
  f.ecology.update(f.context.camera,.731);f.water.update(f.context.camera,.731);f.env.update(.731);
  for(const dt of [NaN,Infinity,-Infinity,-1,undefined,null,'0.1']){
   f.ecology.update(f.context.camera,dt);f.water.update(f.context.camera,dt);f.env.update(dt);
   near(f.ecology.uniforms.uWindTime.value,.731);near(f.water.uniforms.uWaterTime.value,.731);near(f.env.elapsed,.731);
  }
 }finally{f.dispose();}
});
test('actual frame does not advance hidden or preparation time or catch up the skipped interval',async()=>{
 const f=await systems();
 try{
  f.frame(100);f.context.document.visibilityState='hidden';f.frame(10000);
  near(f.ecology.uniforms.uWindTime.value,.1);near(f.water.uniforms.uWaterTime.value,.1);near(f.env.elapsed,.1);
  f.context.document.visibilityState='visible';f.frame(10016);
  near(f.ecology.uniforms.uWindTime.value,.116);
  f.context.preparing=true;f.frame(20000);near(f.ecology.uniforms.uWindTime.value,.116);
  f.context.preparing=false;f.frame(20016);
  near(f.ecology.uniforms.uWindTime.value,.132);near(f.water.uniforms.uWaterTime.value,.132);near(f.env.elapsed,.132);
 }finally{f.dispose();}
});
