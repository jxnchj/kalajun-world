import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTerrainMaterial} from './terrain-material.js';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {REACH_SURFACE41_PATCHES} from './forest-reach-surface41.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
import {reachBedFacies64Pockets,reachBedFacies64Mix,reachBedFacies64Weights,
 REACH_BED_FACIES64_PATCHES,REACH_BED_FACIES64_MIX_GLSL,installReachBedFacies64} from './reach-bed-facies64.js';
const compile=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
const release=r=>{r.material.dispose();Object.values(r.textures).forEach(t=>t.dispose());};
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=p=>({x:p.x,z:p.z,clearance:-.045,shoreDistance:-.12,slope:.015,wetness:1,meso:.5});

test('default OFF leaves the entire adopted shader/key/hooks untouched; live switch and disposal restore it',()=>{
 const r=createTerrainMaterial(),m=r.material,before=compile(m),hook=m.onBeforeCompile,key=m.customProgramCacheKey,version=m.version,o=installReachBedFacies64(m);
 try{
  assert.equal(o.uniform.value,0);assert.equal(m.onBeforeCompile,hook);assert.equal(m.customProgramCacheKey,key);assert.equal(m.version,version);
  assert.deepEqual(compile(m),before);o.setEnabled(true);const active=compile(m);
  assert.equal(active.vertexShader,before.vertexShader);assert.equal(active.uniforms.uReachBedFacies64,o.uniform);
  assert.equal(active.uniforms.uReachFacies44.value,1,'accepted exterior-bank recovery remains active');
  const count=(s,regex)=>(s.match(regex)||[]).length;
  assert.equal(count(active.fragmentShader,/uniform\s+sampler\w+/g),count(before.fragmentShader,/uniform\s+sampler\w+/g));
  assert.equal(count(active.fragmentShader,/\btexture(?:Grad|Lod)?\s*\(/g),count(before.fragmentShader,/\btexture(?:Grad|Lod)?\s*\(/g));
  for(const token of ['reachBed41*=1.-reachRecovery44;','reachRoots41=max(reachRoots41,reachRecovery44);','scanUV41=reachLocal41/2.9+vec2(.173,.481);','terrainGradient=mix(terrainGradient,terrainForestGradient+terrainReferenceGradient,reachRoots41);'])assert.ok(active.fragmentShader.includes(token),token);
  for(const token of ['reachBedColor41*reachMix64.x','reachGradient41*reachMix64.x','reachBedRough64*reachMix64.x'])assert.ok(active.fragmentShader.includes(token),token);
  assert.ok(active.fragmentShader.includes('if(reachMix64.y+reachMix64.z>0.)'));
  assert.ok(!active.vertexShader.includes('reachMix64'));o.setDiagnostic(true);assert.equal(o.diagnostic.value,1);
  o.setEnabled(false);assert.equal(o.uniform.value,0);o.dispose();assert.equal(m.onBeforeCompile,hook);assert.equal(m.customProgramCacheKey,key);assert.deepEqual(compile(m),before);
  assert.throws(()=>o.setEnabled(true));assert.throws(()=>o.setDiagnostic(true));o.dispose();
 }finally{o.dispose();release(r);}
});

test('source mismatch/duplicate installation is explicit and disposal preserves newer hook ownership',()=>{
 assert.throws(()=>installReachBedFacies64(new T.MeshStandardMaterial()),/surface41/);
 const r=createTerrainMaterial(),m=r.material,o=installReachBedFacies64(m,{enabled:true});
 try{
  assert.throws(()=>installReachBedFacies64(m),/already/);assert.throws(()=>o.setEnabled(1),/boolean/);
  const later=function(){},laterKey=()=> 'later';m.onBeforeCompile=later;m.customProgramCacheKey=laterKey;o.dispose();assert.equal(m.onBeforeCompile,later);assert.equal(m.customProgramCacheKey,laterKey);
 }finally{o.dispose();release(r);}
 const fake=new T.MeshStandardMaterial();fake.userData.reachSurface41='root-organic-facies-v5';const f=installReachBedFacies64(fake,{enabled:true});try{assert.throws(()=>compile(fake),/source contract changed/);}finally{f.dispose();fake.dispose();}
});

test('CPU and emitted GLSL material mixing share exact scalar formulas, bounded partition and protected gravel cores',()=>{
 const glslBody=REACH_BED_FACIES64_MIX_GLSL.slice(REACH_BED_FACIES64_MIX_GLSL.indexOf('{')+1,REACH_BED_FACIES64_MIX_GLSL.lastIndexOf('}')).replace(/\bfloat\b/g,'let');
 const glsl=new Function('pockets','shallow','shelf','domain','clamp','smoothstep','vec3',glslBody);
 for(let a=0;a<=10;a++)for(let b=0;b<=10;b++)for(const shallow of [0,.25,.8,1])for(const domain of [0,.3,1]){
  const p=[a/10,b/10,(a*7%11)/10,(b*3%11)/10],cpu=reachBedFacies64Mix(p,shallow,.65,domain),gpu=glsl({x:p[0],y:p[1],z:p[2],w:p[3]},shallow,.65,domain,clamp,smooth,(...v)=>v);
  assert.deepEqual(cpu,gpu);assert.ok(Math.abs(cpu.reduce((s,x)=>s+x,0)-1)<3e-16);for(const w of cpu)assert.ok(w>=0&&w<=1);
 }
 const gravel=REACH_BED_FACIES64_PATCHES.find(p=>p.kind==='gravel');assert.deepEqual(reachBedFacies64Weights(base(gravel)),[1,0,0]);
 const sand=REACH_BED_FACIES64_PATCHES.find(p=>p.kind==='sand'),s=reachBedFacies64Weights(base(sand));assert.ok(s[1]>.6);assert.ok(s[2]<.05);
 const quiet=REACH_BED_FACIES64_PATCHES.find(p=>p.kind==='humus'),q=reachBedFacies64Weights(base(quiet));assert.ok(q[1]>.4&&q[2]>.15);
});

test('new material uses the original eight landform anchors, remains water-side and fades continuously at boundaries',()=>{
 assert.equal(REACH_BED_FACIES64_PATCHES.length,8);
 for(const p of REACH_BED_FACIES64_PATCHES){const original=REACH_SURFACE41_PATCHES.find(q=>q.offset===p.offset);for(const k of ['x','z','offset','side','fx','fz','kind'])assert.equal(p[k],original[k]);assert.equal(p.sourceAlong,original.along);assert.equal(p.sourceAcross,original.across);}
 const p=base(REACH_BED_FACIES64_PATCHES.find(p=>p.kind==='sand'));
 for(const update of [{shoreDistance:0},{shoreDistance:.4},{clearance:.2},{wetness:.2},{snow:1},{x:0,z:0}])assert.deepEqual(reachBedFacies64Weights({...p,...update}),[1,0,0]);
 assert.throws(()=>reachBedFacies64Weights({...p,x:NaN}),/Finite/);
 const at=x=>reachBedFacies64Weights({...p,shoreDistance:x})[1];
 assert.ok(Math.abs(at(-1e-7)-at(0))<1e-10);assert.ok(Math.abs(at(-.06+1e-7)-at(-.06-1e-7))<1e-9);
 const w=reachBedFacies64Pockets(p.x,p.z,.5);assert.equal(w.length,4);for(const k of w)assert.ok(k>=0&&k<=1);
});

test('actual default river sections contain fine shelves and unchanged coarse exposure while 521 prepared roots/heights/water data remain intact',t=>{
 const saved=globalThis.location;let world;try{globalThis.location={search:''};world=actualForestWorld(undefined,'rgba');}finally{globalThis.location=saved;}
 assert.equal(world.hydrology.forestReach39.stats.design50,null);
 const sourcePath=new URL('./generated/forest-reach-cover41-source.json',import.meta.url),packedPath=new URL('../../public/data/v2/reach-cover-prepared42.json.gz',import.meta.url);
 const sourceBytes=fs.readFileSync(sourcePath),packedBytes=fs.readFileSync(packedPath),prepared=JSON.parse(gunzipSync(packedBytes));
 assert.equal(prepared.records.length,521);assert.equal(new Set(prepared.records.map(r=>r.root.id)).size,521);
 const sourceHash=hash(sourceBytes),preparedHash=hash(packedBytes),r=world.hydrology.forestReach39,segments=world.hydrology.segments.filter(s=>s.lineId===r.lineId),samples=[];
 const buckets={inlet:{wet:0,sumFine:0,highFine:0,coarse:0},middle:{wet:0,sumFine:0,highFine:0,coarse:0},outlet:{wet:0,sumFine:0,highFine:0,coarse:0}};let dry=0;
 const started=performance.now();
 for(let offset=-17.5;offset<=17.5;offset+=.5){const d=r.origin+offset,s=segments.find(s=>s.a.distance<=d&&s.b.distance>=d),q=r.waterSectionAt(s,(d-s.a.distance)/(s.b.distance-s.a.distance));
  for(const u of [-1.35,-1.05,-.95,-.75,-.5,-.25,0,.25,.5,.75,.95,1.05,1.35]){
   const across=u*(u<0?q.left:q.right),x=q.x-q.fz*across,z=q.z+q.fx*across,y=world.surface.heightAt(x,z),hydro=world.hydrology.sampleAt(x,z,{includeDepth:false}),normal=world.surface.normalAt(x,z,.2);
   const input={x,z,clearance:y-hydro.surfaceLevel,shoreDistance:hydro.shoreDistance,wetness:hydro.wetness,slope:1-normal.y,meso:.5},weights=reachBedFacies64Weights(input),fine=weights[1]+weights[2];
   if(hydro.shoreDistance>=0){dry++;assert.deepEqual(weights,[1,0,0]);}
   else{const bucket=buckets[offset< -6?'inlet':offset<=6?'middle':'outlet'];bucket.wet++;bucket.sumFine+=fine;if(fine>.6)bucket.highFine++;if(weights[0]>.95)bucket.coarse++;}
   samples.push({offset,u,x,z,y,segment:s,t:(d-s.a.distance)/(s.b.distance-s.a.distance),width:q.width,left:q.left,right:q.right,level:q.level,input,weights});
  }
 }
 const material=createTerrainMaterial(),before=compile(material.material),owner=installReachBedFacies64(material.material,{enabled:true});
 try{
  assert.equal(compile(material.material).vertexShader,before.vertexShader);
  for(const p of samples){assert.equal(world.surface.heightAt(p.x,p.z),p.y);const water=r.waterSectionAt(p.segment,p.t);for(const key of ['width','left','right','level'])assert.equal(water[key],p[key]);}
  owner.dispose();assert.deepEqual(compile(material.material),before);
 }finally{owner.dispose();release(material);}
 assert.equal(hash(fs.readFileSync(sourcePath)),sourceHash);assert.equal(hash(fs.readFileSync(packedPath)),preparedHash);
 for(const [name,b] of Object.entries(buckets)){assert.ok(b.wet>100,name);assert.ok(b.highFine>0,name);assert.ok(b.coarse>0,name);b.meanFine=b.sumFine/b.wet;delete b.sumFine;}
 const selected=REACH_BED_FACIES64_PATCHES.map(p=>{const nearest=samples.reduce((best,q)=>Math.hypot(q.x-p.x,q.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)?q:best,samples[0]);return {kind:p.kind,offset:p.offset,sampledOffset:nearest.offset,acrossFraction:nearest.u,clearance:nearest.input.clearance,shoreDistance:nearest.input.shoreDistance,weights:nearest.weights};});
 t.diagnostic('REACH64_DISTRIBUTION='+JSON.stringify({scope:'CPU actual default49 71 stations x 13 transverse samples; meso fixed .5 for classification, not a rendered image or GPU measurement',samples:samples.length,dryUnchanged:dry,buckets,selected,sourceRootCount:JSON.parse(sourceBytes).records.length,preparedRoots:prepared.records.length,sourceSHA256:sourceHash,preparedSHA256:preparedHash,elapsedMs:performance.now()-started}));
});
