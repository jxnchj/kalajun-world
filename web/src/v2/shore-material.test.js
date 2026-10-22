import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {CSM} from "three/addons/csm/CSM.js";
import {WorldEnvironment} from "./environment.js";
import {createAerialUniforms} from "./aerial-perspective.js";
import {createCloudUniforms} from "./cloud-field.js";
import {shoreZones,shoreWaterFilm,shoreWetAlbedo,shoreWetRoughness,shoreMaterialVariation,setShoreMaterialVariation,SHORE_MATERIAL_GLSL} from "./shore-material.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {createHydrology} from "./hydrology.js";
import {WorldWater,createShoreRockMaterial,createWaterMaterial} from "./water.js";
const compile=m=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);return shader;};
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function world(){
 const source={lines:[Array.from({length:51},(_,i)=>[i*4,0,2])]},height=(x,z)=>100-x*.06+Math.abs(z)*.05;
 const h=createHydrology({streamData:source,heightAt:height}),w={hydrology:h,surface:{heightAt:(x,z)=>h.bedHeightAt(x,z),uncarvedHeightAt:height}};
 h.bindSurface(w.surface.heightAt);return w;
}
test("shore response distinguishes damp ground from a saturated film and never changes dry surfaces",()=>{
 for(const grain of [0,.25,.5,.75,1])for(const dry of [.62,.85,.96]){
  assert.equal(shoreWetAlbedo(0,grain),1);assert.equal(shoreWetRoughness(dry,0,grain),dry);
  assert.deepEqual(shoreZones(0,0,.1,grain),[0,0,0]);
  assert.equal(shoreWetRoughness(dry,.4,grain),dry,"damp porous surfaces do not acquire a water film gloss");
  let color=1,rough=dry;
  for(let i=0;i<=100;i++){
   const c=shoreWetAlbedo(i/100,grain),r=shoreWetRoughness(dry,i/100,grain);
   assert.ok(c>=.68-1e-12&&c<=color+1e-12);assert.ok(r>=.34-1e-12&&r<=rough+1e-12);color=c;rough=r;
  }
  assert.equal(shoreZones(1,1,.1,grain)[2],0,"no living grass mat is painted on the submerged bed");
  assert.equal(shoreZones(.4,.3,.8,grain)[2],0,"steep rock faces do not gain a flat moss carpet");
 }
 assert.ok(shoreZones(.4,.3,.1,.5)[2]>.4);
 assert.ok(shoreWetAlbedo(.4,.5)>.9,"outer bank detail survives instead of a uniform dark multiplier");
});

test("known channel cross-section yields smooth mineral, damp and living zones inside its original footprint",()=>{
 const w=world(),hydro=w.hydrology;
 let previous=null,sawLiving=false,sawFilm=false,sawDry=false;
 for(let z=0;z<5;z+=.01){
  const h=hydro.sampleAt(40,z,{includeDepth:false}),zones=shoreZones(h.wetness,h.riverBed,.1,.5);
  sawLiving ||= zones[2]>.1;sawFilm ||= zones[1]>.9;sawDry ||= h.wetness===0;
  if(previous)zones.forEach((v,i)=>assert.ok(Math.abs(v-previous[i])<.04,"no hard shoreline ring"));
  if(!h.id){assert.deepEqual(zones,[0,0,0]);assert.equal(shoreWetAlbedo(h.wetness,.5),1);}
  assert.ok(zones.every(Number.isFinite));previous=zones;
 }
 assert.ok(sawLiving&&sawFilm&&sawDry);
});

test("terrain and scanned/procedural stones share reversible uniform while water optics and sampling stay separate",()=>{
 const terrain=createTerrainMaterial(),materials=[terrain.material,createShoreRockMaterial({scanned:true}),createShoreRockMaterial()];
 const shaders=materials.map(compile),keys=materials.map(m=>m.customProgramCacheKey()),versions=materials.map(m=>m.version);
 const pixels=createHash("sha256").update(terrain.textures.packed.image.data).digest("hex");
 try{
  shaders.forEach((s,i)=>{
   assert.strictEqual(s.uniforms.uShoreMaterialVariation,shoreMaterialVariation);
   assert.strictEqual(materials[i].userData.shoreMaterialVariation,shoreMaterialVariation);
   assert.ok(s.fragmentShader.includes(SHORE_MATERIAL_GLSL));
  });
  assert.doesNotMatch(SHORE_MATERIAL_GLSL,/sampler|texture\w*\(|noise\w*\(|sin\(|cos\(/);
  assert.match(shaders[0].fragmentShader,/mix\(terrainLegacyDamp,terrainShoreDamp,uShoreMaterialVariation\)/);
  assert.match(shaders[0].fragmentShader,/mix\(terrainLegacyWetRoughness,terrainShoreRoughness,uShoreMaterialVariation\)/);
  assert.match(shaders[0].fragmentShader,/uShoreMaterialVariation\*terrainBank/);
  assert.match(shaders[1].fragmentShader,/shoreWetRoughness\(clamp\(roughnessFactor,\.62,\.96\)/,"scan ARM is still the dry roughness source");
  assert.ok(!shaders[1].fragmentShader.includes("stoneGrainNormal"));
  assert.equal((shaders[1].fragmentShader.match(/shoreNoise\(vShoreWorld/g)||[]).length,0);
  assert.match(shaders[1].fragmentShader,/vShoreHydro\.y\+\.13\+stoneBroad\*\.045/);
  assert.match(shaders[1].vertexShader,/instanceMatrix\*shoreWorld/);
  for(const value of [false,true,false,true]){setShoreMaterialVariation(value);shaders.forEach(s=>assert.equal(s.uniforms.uShoreMaterialVariation.value,Number(value)));}
  assert.deepEqual(materials.map(m=>m.customProgramCacheKey()),keys);assert.deepEqual(materials.map(m=>m.version),versions);
  assert.equal(createHash("sha256").update(terrain.textures.packed.image.data).digest("hex"),pixels);
  assert.throws(()=>setShoreMaterialVariation(0),/boolean/);
  const water=createWaterMaterial({});const ws=compile(water);assert.equal(ws.uniforms.uShoreMaterialVariation,undefined);
  assert.ok(!ws.fragmentShader.includes(SHORE_MATERIAL_GLSL));water.dispose();
 }finally{setShoreMaterialVariation(true);materials.forEach(m=>m.dispose());Object.values(terrain.textures).forEach(t=>t.dispose());}
});

test("shore hooks preserve CSM, scan normals and real instance records under A/B",async()=>{
 const w=new WorldWater(world());await w.load();const camera=new THREE.PerspectiveCamera();camera.position.set(50,98,8);
 for(let i=0;i<20;i++)w.update(camera,.016);
 const meshes=[...w.active.values()].flatMap(b=>b.rocks?[b.rocks]:[]),buffers=meshes.map(m=>m.instanceMatrix.array.slice()),counts=meshes.map(m=>m.count);
 const scene=new THREE.Scene(),csm=new CSM({camera,parent:scene,cascades:3,maxFar:500});
 const environment=Object.create(WorldEnvironment.prototype);environment.csm=csm;environment.registered=new Set();
 environment.clouds=createCloudUniforms();environment.aerial=createAerialUniforms(new THREE.Vector3(0,1,0));
 try{
  for(const material of [w.rockMaterial,w.gravelMaterial]){
   environment.register([material]);const s=compile(material);
   assert.strictEqual(s.uniforms.uShoreMaterialVariation,shoreMaterialVariation);assert.equal(s.uniforms.CSM_cascades.value.length,3);
   assert.match(s.fragmentShader,/#include <normal_fragment_maps>/);assert.match(s.fragmentShader,/#include <lights_fragment_maps>/);
   assert.match(s.fragmentShader,/reflectedLight.indirectDiffuse\*=stoneContact/);
  }
  setShoreMaterialVariation(false);setShoreMaterialVariation(true);
  meshes.forEach((m,i)=>{assert.equal(m.count,counts[i]);assert.deepEqual(m.instanceMatrix.array,buffers[i]);});
  near(shoreWetRoughness(.9,1,.5),.585);
 }finally{setShoreMaterialVariation(true);csm.remove();csm.dispose();w.dispose();}
});

// This checks the production hook chain lexically; browser GPU compilation is
// still required, since Node shader assembly is not a GLSL compiler.
test("assembled terrain and shore shaders avoid the GLSL reserved identifier patch",()=>{
 const terrain=createTerrainMaterial(),materials=[terrain.material,createShoreRockMaterial({scanned:true}),createShoreRockMaterial()];
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),csm=new CSM({camera,parent:scene,cascades:3,maxFar:500});
 const environment=Object.create(WorldEnvironment.prototype);environment.csm=csm;environment.registered=new Set();
 environment.clouds=createCloudUniforms();environment.aerial=createAerialUniforms(new THREE.Vector3(0,1,0));
 const withoutComments=source=>source.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"");
 try{
  for(const material of materials){
   environment.register([material]);const shader=compile(material);
   assert.equal(shader.uniforms.CSM_cascades.value.length,3);
   assert.match(shader.fragmentShader,/float surfacePatch/);
   for(const stage of ["vertexShader","fragmentShader"]){
    assert.doesNotMatch(withoutComments(shader[stage]),/\bpatch\b/,`${material.type} ${stage}: patch is a reserved GLSL word`);
   }
  }
 }finally{csm.remove();csm.dispose();materials.forEach(m=>m.dispose());Object.values(terrain.textures).forEach(t=>t.dispose());}
});

test("pore-sensitive film keeps saturation endpoints while a merely damp bank stays visibly rough",()=>{
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 for(const grain of [-1,0,.25,.5,.75,1,2])for(const dry of [.62,.85,.9,.96]){
  const g=Math.max(0,Math.min(1,grain));
  assert.equal(shoreWaterFilm(0,grain),0);assert.equal(shoreWaterFilm(1,grain),1);
  near(shoreWetAlbedo(1,grain),.68+.10*g);near(shoreWetRoughness(dry,1,grain),Math.max(.34,dry*(.60+.10*g)));
  assert.equal(shoreWetAlbedo(0,grain),1);assert.equal(shoreWetRoughness(dry,0,grain),dry);
  let previousFilm=0;
  for(let i=0;i<=1000;i++){
   const wet=i/1000,film=shoreWaterFilm(wet,grain),oldFilm=smooth(.45,.96,wet);
   assert.ok(film>=previousFilm-1e-12&&film<=1);assert.ok(film<=oldFilm+1e-12,"no additional glossy band is introduced");previousFilm=film;
  }
 }
 // These wetness values were read from the actual forest reach at 25cm above
 // its two shoreline edges. They are material probes, not a new bed profile.
 for(const wet of [.807,.839]){assert.ok(shoreWetRoughness(.9,wet,.5)>.83);assert.ok(shoreWaterFilm(wet,.5)<.20);}
 assert.ok(shoreWetRoughness(.9,.85,.9)>shoreWetRoughness(.9,.85,.1),"the existing field breaks a uniformly glossy shoulder");
 assert.ok(shoreWetAlbedo(.6,.5)>.88);assert.equal(shoreWaterFilm(.7,.5),0);
});

test("CPU and actual GLSL shore expressions agree across wetness, grain, slope and bed domains",()=>{
 // Evaluate the shipped arithmetic after removing only GLSL type declarations.
 // This is a numeric parity check; the existing production hook tests cover
 // shader composition, while Chrome remains the actual GPU compiler check.
 const functions=SHORE_MATERIAL_GLSL.replace(/uniform float \w+;/g,"")
  .replace(/(?:float|vec3)\s+(\w+)\s*\(([^)]*)\)\s*\{/g,(_,name,args)=>`function ${name}(${args.replace(/float\s+/g,"")}){`)
  .replace(/\bfloat\s+/g,"let ");
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 const glsl=new Function("clamp","mix","smoothstep","vec3","max",functions+";return {shoreWaterFilm,shoreWetAlbedo,shoreWetRoughness,shoreZones};")(clamp,mix,smoothstep,(...v)=>v,Math.max);
 for(const grain of [-.2,0,.13,.5,.87,1,1.2])for(let i=0;i<=200;i++){
  const wet=i/200;near(glsl.shoreWaterFilm(wet,grain),shoreWaterFilm(wet,grain));near(glsl.shoreWetAlbedo(wet,grain),shoreWetAlbedo(wet,grain));
  for(const dry of [.62,.85,.96])near(glsl.shoreWetRoughness(dry,wet,grain),shoreWetRoughness(dry,wet,grain));
  for(const bed of [0,.3,.7,1])for(const slope of [.1,.5,.8]){const cpu=shoreZones(wet,bed,slope,grain),gpu=glsl.shoreZones(wet,bed,slope,grain);gpu.forEach((v,k)=>near(v,cpu[k]));}
 }
});
