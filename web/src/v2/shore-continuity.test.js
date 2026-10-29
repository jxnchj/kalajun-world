import {createLegacyTerrainMaterial} from './fixtures/legacy-terrain-material.js';
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {shoreRootCover,SHORE_MATERIAL_GLSL} from "./shore-material.js";
import {forestScanDistanceColor} from "./terrain-forest-scan.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {sampleMeadowField} from "./meadow-surface.js";
import {surfaceTransitionStructure} from "./surface-transition.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {riverSectionAt} from "./river-section.js";
const close=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

test("rooted turf interrupts pure exposed bank classes but never covers submerged mud, dry outside or steep rock",()=>{
 for(const wet of [0,.03,.2,.55,.8,1])for(const clearance of [-1,0,.02,.05,.08,.12,1])for(const slope of [0,.2,.52,.65,.8,1])for(const structure of [-1,-.1,0,.2,.45,1]){
  const r=shoreRootCover(wet,clearance,slope,structure);
  assert.ok(r>=0&&r<=1);
  if(wet===0||clearance<=.02||slope>=.8||structure<=-.1)assert.equal(r,0);
 }
 assert.equal(shoreRootCover(1,.2,.4,.5),1,"a rooted patch can interrupt the formerly unbreakable radial bank=1 class");
 assert.equal(shoreRootCover(1,.2,.4,-.2),0,"the same bank retains genuinely bare sediment between rooted patches");
});

test("shipped root shader agrees with CPU and uses only retained physical and meadow inputs",()=>{
 const src=SHORE_MATERIAL_GLSL.match(/float shoreRootCover\([^]*?\n}/)[0]
  .replace(/float shoreRootCover\(([^)]*)\)/,(_,args)=>`function shoreRootCover(${args.replace(/float /g,"")})`);
 const fn=new Function("smoothstep",src+";return shoreRootCover;")(smoothstep);
 for(const w of [0,.1,.6,1])for(const y of [-1,.01,.05,.09,.12,2])for(const s of [0,.3,.6,.9])for(const p of [-.4,0,.3,.8])close(fn(w,y,s,p),shoreRootCover(w,y,s,p));
 assert.doesNotMatch(src,/texture|noise|sin|cos|camera/);
});

test("scan distance split retains exact accepted near albedo and the same mean at every distance",()=>{
 const base=[.04,.09,.06],mean=[.07,.1,.03],samples=[[.01,.06,.02],[.13,.14,.04]];
 for(const cover of [0,.1,.5,1]){
  for(const sample of samples){
   forestScanDistanceColor(base,mean,sample,cover,1).forEach((v,i)=>close(v,base[i]*(1-.76*cover)+sample[i]*.76*cover));
   forestScanDistanceColor(base,mean,sample,0,.5).forEach((v,i)=>assert.equal(v,base[i]));
  }
  const far=forestScanDistanceColor(base,mean,mean,cover,0);
  for(const fade of [0,.1,.5,.9,1]){
   const a=forestScanDistanceColor(base,mean,samples[0],cover,fade),b=forestScanDistanceColor(base,mean,samples[1],cover,fade);
   a.forEach((v,i)=>close((v+b[i])/2,far[i]));
  }
 }
});

test("both continuity switches are live uniforms with no new terrain buffers or texture fetches",()=>{
 const t=createLegacyTerrainMaterial(),m=t.material,s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{
  m.onBeforeCompile(s);
  for(const name of ["terrainShoreRoots","terrainForestMeanContinuity"]){
   assert.strictEqual(m.userData[name],s.uniforms[name]);assert.equal(s.uniforms[name].value,1);
   m.userData[name].value=0;assert.equal(s.uniforms[name].value,0);
  }
  assert.equal((s.fragmentShader.match(/textureGrad\(terrainScan/g)||[]).length,4);
  assert.equal((s.fragmentShader.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3);
  assert.match(s.fragmentShader,/terrainGradient=mix\(terrainGradient,terrainGrassGradient,terrainRootCover\)/);
  assert.match(s.fragmentShader,/roughnessFactor=mix\(roughnessFactor,terrainCanopyRoughness,terrainRootCover\)/);
 }finally{m.dispose();Object.values(t.textures).forEach(x=>x.dispose());}
});

function actual(){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
 const meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),
 coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}
test("actual three representative banks contain both rooted patches and bare pockets, preserving every submerged sample",t=>{
 const w=actual(),rows=[];let rooted=0,bare=0,submerged=0;
 for(const view of w.hydrology.viewpoints){
  const counts={id:view.id,rooted:0,bare:0,submerged:0};
  for(const seg of w.hydrology.nearSegments(view.x,view.z,100))for(const u of [.2,.5,.8]){
   const n=riverSectionAt(seg,u);
   for(const side of [-1,1])for(let i=0;i<=32;i++){
    const d=n.outer*i/32,x=n.x-n.fz*side*d,z=n.z+n.fx*side*d,q=w.hydrology.sampleAt(x,z,{includeDepth:false});
    if(q.id!==seg.id)continue;
    const y=w.surface.heightAt(x,z)-q.surfaceLevel,normal=w.surface.normalAt(x,z,.2),field=sampleMeadowField(x,z),structure=surfaceTransitionStructure(field[0],field[1],.1);
    const r=shoreRootCover(q.wetness,y,1-normal.y,structure);
    if(y<=.02){assert.equal(r,0);counts.submerged++;}
    else if(q.wetness>.1){if(r>.5)counts.rooted++;if(r<.01)counts.bare++;}
   }
  }
  assert.ok(counts.rooted>10&&counts.bare>10&&counts.submerged>100);rooted+=counts.rooted;bare+=counts.bare;submerged+=counts.submerged;rows.push(counts);
 }
 t.diagnostic(JSON.stringify({rooted,bare,submerged,routes:rows}));
});
