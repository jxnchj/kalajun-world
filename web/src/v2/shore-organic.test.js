import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {shoreOrganicCover,shoreEcotoneCover,SHORE_MATERIAL_GLSL} from "./shore-material.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {sampleMeadowField} from "./meadow-surface.js";
import {surfaceTransitionStructure} from "./surface-transition.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {riverSectionAt} from "./river-section.js";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

test("organic horizons keep immersed/dry/nonforest/rock endpoints exact and retain mineral windows",()=>{
 for(const wet of [0,.04,.25,.65,1])for(const h of [-1,0,.001,.015,.035,.2,1])for(const slope of [0,.2,.5,.7,.95,1])for(const forest of [0,.2,.8,1])for(const structure of [-1,-.3,0,.25,1]){
  const v=shoreOrganicCover(wet,h,slope,forest,structure);
  assert.ok(v>=0&&v<=.95,"mineral windows survive even in the strongest organic patch");
  if(wet<=.04||h<=.001||slope>=.95||forest===0)assert.equal(v,0);
 }
 assert.equal(shoreEcotoneCover(1,.08,.65,.4),0,"living turf excludes a steep cut face");
 assert.ok(shoreOrganicCover(1,.08,.65,1,.4)>.9,"an exposed forest cut can still retain organic soil");
 assert.ok(shoreOrganicCover(1,.08,.1,1,-1)<.5,"low-community pockets retain predominantly mineral ground");
 for(const structure of [-.4,0,.4]){let old=0;for(let i=0;i<=100;i++){
  const next=shoreOrganicCover(.8,i*.001,.4,1,structure);assert.ok(next>=old&&next-old<.043);old=next;
 }}
});
test("actual shipped arithmetic agrees with CPU and reuses resolved rather than screen-random structure",()=>{
 const body=SHORE_MATERIAL_GLSL.match(/float shoreOrganicCover\([^]*?\n}/)[0]
  .replace(/float shoreOrganicCover\(([^)]*)\)/,(_,a)=>`function shoreOrganicCover(${a.replace(/float /g,"")})`);
 const fn=new Function("smoothstep","clamp",body+";return shoreOrganicCover;")(smoothstep,clamp);
 for(const wet of [0,.05,.3,.7,1])for(const h of [-.1,.002,.02,.05,.3])for(const slope of [0,.4,.8,1])for(const forest of [0,.5,1])for(const broad of [.2,.47,.8])for(const footprint of [0,.35,.7,1.3,3]){
  const structure=surfaceTransitionStructure(broad,.7,footprint);
  assert.equal(fn(wet,h,slope,forest,structure),shoreOrganicCover(wet,h,slope,forest,structure));
 }
 assert.doesNotMatch(body,/sampler|texture|noise|sin|cos|camera|distance/);
 assert.equal(surfaceTransitionStructure(.47,.7,1.3),surfaceTransitionStructure(.47,.1,1.3),"unresolved tufts cannot create distant organic speckle");
});
test("a single live cover controls mineral classification, organic colour, normal and roughness",()=>{
 const t=createTerrainMaterial(),m=t.material,s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{m.onBeforeCompile(s);assert.strictEqual(s.uniforms.terrainOrganicBank,m.userData.terrainOrganicBank);
  const version=m.version,key=m.customProgramCacheKey();m.userData.terrainOrganicBank.value=0;
  assert.equal(s.uniforms.terrainOrganicBank.value,0);assert.equal(m.version,version);assert.equal(m.customProgramCacheKey(),key);
  assert.match(s.fragmentShader,/terrainOrganicCover=terrainOrganicBank\*mix/);
  assert.match(s.fragmentShader,/terrainShoreFootprint\)\*\(1\.-terrainSnow\)/);
  assert.match(s.fragmentShader,/terrainRockWeight\*=1\.-terrainOrganicCover/);
  assert.match(s.fragmentShader,/terrainLayeredColor=mix\(terrainLayeredColor,terrainOrganicColor,terrainOrganicCover\)/);
  assert.match(s.fragmentShader,/terrainGradient=mix\(terrainGradient,mix\(terrainForestGradient,terrainSoilGradient,terrainOrganicFace\),terrainOrganicCover\)/);
  assert.match(s.fragmentShader,/roughnessFactor=mix\(roughnessFactor,terrainOrganicWetRoughness,terrainOrganicCover\)/);
  assert.equal((s.fragmentShader.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3);
  assert.equal((s.fragmentShader.match(/textureGrad\(terrainScan/g)||[]).length,4);
 }finally{m.dispose();Object.values(t.textures).forEach(x=>x.dispose());}
});
function actual(){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}
test("real forest-reach sections exercise exposed horizon coverage and exact submerged preservation",t=>{
 const w=actual(),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest");let submerged=0,exposed=0,missedTurf=0,organicSum=0;
 // Forest=1 isolates material response at real physical forest-reach sections;
 // this diagnostic does not claim to measure the source landcover raster.
 for(const s of w.hydrology.nearSegments(view.x,view.z,80))for(const u of [.2,.5,.8]){
  const q=riverSectionAt(s,u);for(const side of [-1,1])for(let i=0;i<=40;i++){
   const d=q.outer*i/40,x=q.x-q.fz*side*d,z=q.z+q.fx*side*d,hydro=w.hydrology.sampleAt(x,z);
   if(hydro.id!==s.id)continue;
   const h=w.surface.heightAt(x,z)-hydro.surfaceLevel,n=w.surface.normalAt(x,z,.2),field=sampleMeadowField(x,z),structure=surfaceTransitionStructure(field[0],field[1],.1),slope=1-n.y;
   const organic=shoreOrganicCover(hydro.wetness,h,slope,1,structure);
   if(h<=.001){assert.equal(organic,0);submerged++;}
   else if(h<=.3&&hydro.wetness>.2){exposed++;organicSum+=organic;if(shoreEcotoneCover(hydro.wetness,h,slope,structure)<.1&&organic>.3)missedTurf++;}
  }
 }
 assert.ok(submerged>100&&exposed>100&&missedTurf>20);
 t.diagnostic(JSON.stringify({submerged,exposed,missedTurf,meanOrganicCoverage:organicSum/exposed,forestResponseAssumption:1}));
});
