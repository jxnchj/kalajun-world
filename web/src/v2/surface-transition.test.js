import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {surfaceTransitionStructure,surfaceTransitionCoverage,surfaceTransitionVariation,setSurfaceTransitionVariation,SURFACE_TRANSITION_GLSL} from "./surface-transition.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {createHydrology} from "./hydrology.js";
import {sampleMeadowField} from "./meadow-surface.js";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const dispose=t=>{t.material.dispose();Object.values(t.textures).forEach(x=>x.dispose());};

test("material coverage preserves pure classes, neutral patches and ordering without extending its mask",()=>{
 for(const signal of [-2,-1,-.7,0,.3,1,2])for(const strength of [-1,0,.6,.9,2]){
  assert.equal(surfaceTransitionCoverage(0,signal,strength),0);
  assert.equal(surfaceTransitionCoverage(1,signal,strength),1);
  let previous=-1;
  for(let i=0;i<=1000;i++){
   const coverage=i/1000,c=surfaceTransitionCoverage(coverage,signal,strength);
   assert.ok(c>=0&&c<=1&&c>=previous,"no inverse bands or disconnected coverage along a constant-structure section");
   assert.ok(Math.abs(c-coverage)<=.225+1e-12);
   assert.equal(surfaceTransitionCoverage(coverage,signal,0),coverage);
   assert.equal(surfaceTransitionCoverage(coverage,0,strength),coverage);
   previous=c;
  }
 }
});

test("subpixel tufts resolve to the same broad slope patch without changing patch scale",()=>{
 for(const broad of [0,.2,.4696247624,.8,1]){
  const average=surfaceTransitionStructure(broad,.5112955131,0);
  for(const footprint of [3.5,10,100])for(const canopy of [0,.3,1])near(surfaceTransitionStructure(broad,canopy,footprint),average);
  let before=Infinity;
  for(let footprint=0;footprint<4;footprint+=.01){
   const contrast=Math.abs(surfaceTransitionStructure(broad,.9,footprint)-surfaceTransitionStructure(broad,.1,footprint));
   assert.ok(contrast<=before+1e-12);before=contrast;
  }
 }
 assert.equal(surfaceTransitionStructure(.4696247624,.5112955131,0),0);
});

test("real shared meadow samples break the bank ribbon inside the existing hydraulic footprint",t=>{
 const height=(x,z)=>100-x*.015+Math.abs(z)*.05;
 const hydrology=createHydrology({streamData:{lines:[Array.from({length:51},(_,i)=>[i*4,0,2])]},heightAt:height});
 let varied=0,maximum=0,sum=0,count=0;
 for(let x=10;x<190;x+=2.25)for(let z=-5;z<=5;z+=.025){
  const h=hydrology.sampleAt(x,z,{includeDepth:false}),source=smoothstep(.55,.95,h.riverBed);
  const field=sampleMeadowField(x,z),signal=surfaceTransitionStructure(field[0],field[1],.1);
  const result=surfaceTransitionCoverage(source,-signal,.9);
  if(source===0||source===1)assert.equal(result,source,"dry outside and saturated inner bed are exact");
  if(source>0&&source<1){
   const difference=result-source;maximum=Math.max(maximum,Math.abs(difference));sum+=difference;count++;
   if(Math.abs(difference)>.035)varied++;
  }
  assert.ok(Number.isFinite(result));
 }
 assert.ok(varied>count*.25,"existing metre and meso fields visibly vary mixed coverage");
 assert.ok(maximum>.12&&maximum<=.225);
 assert.ok(Math.abs(sum/count)<.055,"not a uniform widening or narrowing of the bank");
 t.diagnostic(JSON.stringify({mixedSamples:count,meaningfullyVaried:varied,maxWeightChange:maximum,meanWeightChange:sum/count}));
});

test("CPU and shipped shader transition equations agree for all field and footprint domains",()=>{
 const translated=SURFACE_TRANSITION_GLSL.replace(/uniform float \w+;/g,"")
  .replace(/float\s+(\w+)\s*\(([^)]*)\)\s*\{/g,(_,name,args)=>`function ${name}(${args.replace(/float\s+/g,"")}){`)
  .replace(/\bfloat\s+/g,"let ");
 const gpu=new Function("clamp","smoothstep",translated+";return {surfaceTransitionStructure,surfaceTransitionCoverage};")(clamp,smoothstep);
 for(const broad of [-.2,0,.37,.5,.87,1,1.2])for(const canopy of [0,.2,.5112955131,.8,1])for(const footprint of [0,.3,1,1.75,3.5,20]){
  const structure=surfaceTransitionStructure(broad,canopy,footprint);near(gpu.surfaceTransitionStructure(broad,canopy,footprint),structure);
  for(const coverage of [0,.01,.1,.3,.5,.9,.99,1])for(const strength of [0,.6,.65,.9,1])near(gpu.surfaceTransitionCoverage(coverage,structure,strength),surfaceTransitionCoverage(coverage,structure,strength));
 }
});

test("terrain transitions share one live switch without extra samplers, maps, geometry or recompilation",()=>{
 const terrain=createTerrainMaterial(),material=terrain.material;
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
 const original=createHash("sha256").update(terrain.textures.packed.image.data).digest("hex"),key=material.customProgramCacheKey(),version=material.version;
 assert.strictEqual(shader.uniforms.uSurfaceTransitionVariation,surfaceTransitionVariation);
 assert.strictEqual(material.userData.surfaceTransitionVariation,surfaceTransitionVariation);
 assert.doesNotMatch(SURFACE_TRANSITION_GLSL,/sampler|texture\w*\(|noise\w*\(|sin\(|cos\(/);
 assert.ok(!shader.vertexShader.includes(SURFACE_TRANSITION_GLSL));
 // The same coverage symbols feed surface colour, normal and roughness below.
 assert.match(shader.fragmentShader,/terrainSoilGradient, terrainSoilWeight/);
 assert.match(shader.fragmentShader,/terrainSoilColor, terrainSoilWeight/);
 assert.match(shader.fragmentShader,/terrainCanopyRoughness,\.96,terrainSoilWeight/);
 try{
  for(const on of [false,true,false,true]){setSurfaceTransitionVariation(on);assert.equal(shader.uniforms.uSurfaceTransitionVariation.value,Number(on));}
  assert.equal(material.version,version);assert.equal(material.customProgramCacheKey(),key);
  assert.equal(createHash("sha256").update(terrain.textures.packed.image.data).digest("hex"),original);
  assert.throws(()=>setSurfaceTransitionVariation(1),/boolean/);
 }finally{setSurfaceTransitionVariation(true);dispose(terrain);}
});


test("soil, rock and bank tuft boundaries resolve with the same canopy colour and height footprint",()=>{
 for(const broad of [.1,.4696247624,.8]){
  for(const footprint of [1.3,1.8,3.5]){
   assert.equal(surfaceTransitionStructure(broad,.05,footprint),surfaceTransitionStructure(broad,.95,footprint),"subpixel turf does not leave detached soil or rock speckles");
  }
  assert.ok(Math.abs(surfaceTransitionStructure(broad,.95,.3)-surfaceTransitionStructure(broad,.05,.3))>.4,"resolved near detail remains strong");
 }
});
