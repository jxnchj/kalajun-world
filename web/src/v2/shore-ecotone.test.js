import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {shoreEcotoneCover,shoreRootCover,SHORE_MATERIAL_GLSL} from "./shore-material.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {riverSectionAt} from "./river-section.js";
import {sampleMeadowField} from "./meadow-surface.js";
import {surfaceTransitionStructure} from "./surface-transition.js";

const smoothstep=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
test("rooted ecotone preserves immersed bed, dry soil and steep erosion while leaving deposition windows",()=>{
 for(const wet of [0,.3,.8,1])for(const structure of [-1,-.32,0,.18,1]){
  for(const clearance of [-1,-.1,0,.001])assert.equal(shoreEcotoneCover(wet,clearance,.1,structure),0);
  for(const clearance of [.01,.03,.12,1]){
   assert.equal(shoreEcotoneCover(0,clearance,.1,structure),0);
   assert.equal(shoreEcotoneCover(wet,clearance,.64,structure),0);
   assert.equal(shoreEcotoneCover(wet,clearance,.1,-.32),0);
  }
 }
 assert.equal(shoreEcotoneCover(1,.03,.1,.2),1,"shallow rooted patches interrupt even a fully classified bare lip");
 assert.equal(shoreRootCover(1,.02,.1,.2),0,"the previous hard lip could not be interrupted");
 for(const slope of [0,.1,.28,.45,.64,.9])for(const structure of [-1,-.2,0,.2,1]){
  let previous=0;for(let i=0;i<=150;i++){
   const cover=shoreEcotoneCover(.9,i*.001,slope,structure);assert.ok(cover>=previous&&cover<=1);assert.ok(cover-previous<.063);previous=cover;
  }
 }
});
test("CPU reference matches shipped GLSL and the reversible hook shares colour, normal and roughness",()=>{
 const body=SHORE_MATERIAL_GLSL.match(/float shoreEcotoneCover\(float wetness,float clearance,float slope,float structure\)\{([\s\S]*?)\n\}/)[1];
 const gpu=new Function("wetness","clearance","slope","structure","smoothstep",body);
 for(const wet of [0,.2,.55,1])for(const clearance of [-.1,0,.002,.01,.025,.12])for(const slope of [0,.28,.4,.64,1])for(const structure of [-1,-.32,0,.18,1])assert.equal(gpu(wet,clearance,slope,structure,smoothstep),shoreEcotoneCover(wet,clearance,slope,structure));
 const r=createTerrainMaterial(),s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{r.material.onBeforeCompile(s);
  assert.strictEqual(s.uniforms.terrainShoreEcotone,r.material.userData.terrainShoreEcotone);
  assert.match(s.fragmentShader,/terrainSwardHeight\+=\(terrainSward-\.5\)\*\.035\*terrainLipRoots\*terrainSwardResolved/);
  assert.match(s.fragmentShader,/terrainPhysicalBed\*=1\.-terrainLipRoots/);
  assert.match(s.fragmentShader,/terrainRootCover=max\(terrainLipRoots,/);
  assert.match(s.fragmentShader,/terrainLayeredColor=mix\(terrainLayeredColor,terrainShoreLiving,terrainRootCover\)/);
  assert.match(s.fragmentShader,/terrainGradient=mix\(terrainGradient,terrainGrassGradient,terrainRootCover\)/);
  assert.match(s.fragmentShader,/roughnessFactor=mix\(roughnessFactor,terrainCanopyRoughness,terrainRootCover\)/);
  assert.equal((s.fragmentShader.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3);
  const version=r.material.version;r.material.userData.terrainShoreEcotone.value=0;assert.equal(s.uniforms.terrainShoreEcotone.value,0);assert.equal(r.material.version,version);
 }finally{r.material.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
});
function actual(){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}
test("actual representative forest lip has both interrupted root mats and retained sediment, with unchanged world inputs",t=>{
 const w=actual(),v=w.hydrology.viewpoints.find(v=>v.id==="river-forest"),segments=w.hydrology.nearSegments(v.x,v.z,80);let samples=0,oldSum=0,newSum=0,open=0,rooted=0,steep=0;
 for(const s of segments)for(const at of [.2,.5,.8]){const q=riverSectionAt(s,at);for(const side of [-1,1])for(let offset=.01;offset<.8;offset+=.015){
  const across=(side<0?q.left:q.right)+offset,x=q.x-q.fz*side*across,z=q.z+q.fx*side*across,h=w.surface.heightAt(x,z),clearance=h-q.level;
  if(clearance<.002||clearance>.12)continue;
  const hydro=w.hydrology.sampleAt(x,z),n=w.surface.normalAt(x,z,.2),slope=1-Math.max(n.y,0),field=sampleMeadowField(x,z),structure=surfaceTransitionStructure(field[0],field[1],0),old=shoreRootCover(hydro.wetness,clearance,slope,structure),next=Math.max(old,shoreEcotoneCover(hydro.wetness,clearance,slope,structure));
  samples++;oldSum+=old;newSum+=next;if(next<.1)open++;if(next>.5)rooted++;if(slope>.64)steep++;
 }}
 assert.ok(samples>100&&rooted>10&&open>10);assert.ok(newSum>oldSum*1.2);
 t.diagnostic(JSON.stringify({samples,meanOldRootCoverage:oldSum/samples,meanNewRootCoverage:newSum/samples,openSedimentSamples:open,rootedSamples:rooted,steepSamples:steep}));
});
