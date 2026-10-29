import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTerrainMaterial} from './terrain-material.js';
import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {loadReachBedFacies66Assets,extendReachBedFacies66Scans,installReachBedFacies66,
 reachBedFacies66Weights,reachBedFacies66Coarse,reachBedFacies66Mix,REACH_BED_FACIES66_SCOURS,
 REACH_BED_FACIES66_STONES,REACH_BED_FACIES66_MIX_GLSL,REACH_BED_FACIES66_GLSL} from './reach-bed-facies66.js';
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const compile=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
const pixels=(seed,n=16)=>Uint8Array.from({length:n},(_,i)=>(seed+i*17)%256);
function fixture(){
 const r=createTerrainMaterial(),m=r.material,previous=m.onBeforeCompile;
 const color=new T.DataArrayTexture(pixels(2,48),2,2,3),normal=new T.DataArrayTexture(pixels(5,48),2,2,3);
 color.colorSpace=T.SRGBColorSpace;normal.colorSpace=T.NoColorSpace;for(const t of [color,normal]){t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.wrapS=t.wrapT=T.RepeatWrapping;}
 const uniforms={terrainScanColors:{value:color},terrainScanNormals:{value:normal},terrainReferencesReady:{value:1}};
 m.onBeforeCompile=function(s,...args){previous.call(this,s,...args);Object.assign(s.uniforms,uniforms);};
 const asset={width:2,height:2,colorPixels:pixels(9),normalRoughPixels:pixels(11),disposed:false};
 return {r,m,color,normal,uniforms,asset,dispose(){m.dispose();color.dispose();normal.dispose();Object.values(r.textures).forEach(t=>t.dispose());}};
}
test('default OFF is dormant; live candidate has unchanged vertex/draw inputs, zero new samplers and two new scan fetches',()=>{
 const f=fixture(),before=compile(f.m),hook=f.m.onBeforeCompile,key=f.m.customProgramCacheKey,version=f.m.version;
 const owner=installReachBedFacies66(f.m,{assets:f.asset});try{
  assert.equal(f.m.onBeforeCompile,hook);assert.equal(f.m.version,version);assert.deepEqual(compile(f.m),before);
  owner.setEnabled(true);const shader=compile(f.m);assert.equal(shader.vertexShader,before.vertexShader);
  const count=(s,p)=>(s.match(p)||[]).length;assert.equal(count(shader.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g),count(before.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g));
  assert.equal(count(shader.fragmentShader,/\btextureGrad\s*\(/g),count(before.fragmentShader,/\btextureGrad\s*\(/g)+2);
  for(const v of ['reachBedColor41*reachMix66.x+fineColor66*reachMix66.y','reachGradient41*reachMix66.x+reachFineGradient66*reachMix66.y','reachBedRough66*reachMix66.x+reachFineRough66*reachMix66.y','reachBed41*=1.-reachRecovery44;','scanUV41=reachLocal41/2.9+vec2(.173,.481);'])assert.ok(shader.fragmentShader.includes(v),v);
  assert.equal(shader.uniforms.uReachFacies44.value,1);assert.equal(shader.uniforms.uReachBedFacies66,owner.uniform);
  assert.notEqual(shader.uniforms.terrainScanColors,f.uniforms.terrainScanColors);assert.equal(f.uniforms.terrainScanColors.value,f.color);
  const c=shader.uniforms.terrainScanColors.value,n=shader.uniforms.terrainScanNormals.value;
  assert.deepEqual(c.image.data.subarray(0,48),f.color.image.data);assert.deepEqual(n.image.data.subarray(0,48),f.normal.image.data);
  assert.deepEqual(c.image.data.subarray(48),f.asset.colorPixels);assert.deepEqual(n.image.data.subarray(48),f.asset.normalRoughPixels);
  assert.equal(c.colorSpace,T.SRGBColorSpace);assert.equal(n.colorSpace,T.NoColorSpace);assert.equal(c.image.depth,4);
  assert.equal(compile(f.m).uniforms.terrainScanColors.value,c,'recompile does not copy arrays again');
  let cd=0,nd=0,borrowed=0;c.addEventListener('dispose',()=>cd++);n.addEventListener('dispose',()=>nd++);f.color.addEventListener('dispose',()=>borrowed++);
  owner.setEnabled(false);assert.equal(owner.uniform.value,0);assert.equal(compile(f.m).uniforms.terrainScanColors.value,c);owner.setDiagnostic(true);assert.equal(owner.diagnostic.value,1);
  owner.dispose();owner.dispose();assert.equal(cd,1);assert.equal(nd,1);assert.equal(borrowed,0);assert.equal(f.m.onBeforeCompile,hook);assert.equal(f.m.customProgramCacheKey,key);assert.deepEqual(compile(f.m),before);
  assert.equal(f.asset.disposed,false);assert.throws(()=>owner.setEnabled(true));assert.throws(()=>owner.setDiagnostic(false));
 }finally{owner.dispose();f.dispose();}
});
test('source readiness, format, duplicate ownership and missing assets fail explicitly; new hook owner survives disposal',()=>{
 const f=fixture();try{
  assert.throws(()=>installReachBedFacies66(new T.MeshStandardMaterial()),/surface41/);
  assert.throws(()=>installReachBedFacies66(f.m,{enabled:true}),/assets/);
  const o=installReachBedFacies66(f.m,{assets:f.asset,enabled:true});assert.throws(()=>installReachBedFacies66(f.m),/already/);
  f.uniforms.terrainReferencesReady.value=0;assert.throws(()=>compile(f.m),/loadReferences/);f.uniforms.terrainReferencesReady.value=1;
  compile(f.m);const hook=function(){},key=()=> 'later';f.m.onBeforeCompile=hook;f.m.customProgramCacheKey=key;o.dispose();assert.equal(f.m.onBeforeCompile,hook);assert.equal(f.m.customProgramCacheKey,key);
  assert.throws(()=>extendReachBedFacies66Scans(f.color,null,f.asset),/three-layer/);
  assert.throws(()=>extendReachBedFacies66Scans(f.color,f.normal,{...f.asset,disposed:true}),/Live/);
 }finally{f.dispose();}
});
test('loader preserves RGBA rows, binds wrapped fetch safely and reports body bytes; cancellation/failure never silently enables',async()=>{
 const n=1024*1024*4,p=pixels(14,n),seen=[];
 const asset=await loadReachBedFacies66Assets({baseURL:'/candidate/',fetchImpl:async function(url){seen.push({url,thisValue:this});return {ok:true,blob:async()=>new Blob(['pixels'])};},decodeImpl:async()=>({width:1024,height:1024,data:p})});
 assert.equal(seen.length,2);assert.ok(seen.every(x=>x.thisValue===undefined));assert.equal(asset.stats.responseBodyBytes,12);
 assert.deepEqual(asset.colorPixels.subarray(0,4096),p.subarray(n-4096));assert.deepEqual(asset.normalRoughPixels.subarray(n-4096),p.subarray(0,4096));
 asset.dispose();asset.dispose();assert.equal(asset.colorPixels,null);assert.equal(asset.disposed,true);
 const aborted=new AbortController();aborted.abort(new Error('cancel-before'));
 await assert.rejects(loadReachBedFacies66Assets({signal:aborted.signal,fetchImpl:()=>{throw Error('should not fetch');}}),/cancel-before/);
 await assert.rejects(loadReachBedFacies66Assets({fetchImpl:async()=>({ok:false,status:404})}),/HTTP 404/);
 await assert.rejects(loadReachBedFacies66Assets({fetchImpl:async()=>({ok:true,blob:async()=>new Blob()}),decodeImpl:async()=>({width:1,height:1,data:new Uint8Array(4)})}),/dimensions/);
 const during=new AbortController();await assert.rejects(loadReachBedFacies66Assets({signal:during.signal,fetchImpl:async()=>({ok:true,blob:async()=>new Blob()}),decodeImpl:async()=>{during.abort(new Error('cancel-decode'));return {width:1024,height:1024,data:p};}}),/cancel-decode/);
});
test('the shared scalar weights are bounded and CPU/GLSL formulas agree; all original coarse cores remain exact',()=>{
 const body=REACH_BED_FACIES66_MIX_GLSL.slice(REACH_BED_FACIES66_MIX_GLSL.indexOf('{')+1,REACH_BED_FACIES66_MIX_GLSL.lastIndexOf('}')).replace(/\bfloat\b/g,'let');
 const g=new Function('coarse','domain','clamp','vec2',body),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 for(let i=-2;i<=12;i++)for(let j=-2;j<=12;j++){const cpu=reachBedFacies66Mix(i/10,j/10),gpu=g(i/10,j/10,clamp,(...a)=>a);assert.deepEqual(cpu,gpu);assert.equal(cpu[0]+cpu[1],1);for(const w of cpu)assert.ok(w>=0&&w<=1);}
 for(const p of REACH_BED_FACIES66_SCOURS){const x=p.x-p.fz*p.shift,z=p.z+p.fx*p.shift;assert.equal(reachBedFacies66Coarse(x,z),1,p.id);}
 for(const p of REACH_BED_FACIES66_STONES)assert.equal(reachBedFacies66Coarse(p.x,p.z),1,p.id);
 const p={x:-3616.220142186546,z:4805.57814936687,clearance:-.18,shoreDistance:-.4,wetness:1};
 assert.deepEqual(reachBedFacies66Weights(p),[0,1]);assert.deepEqual(reachBedFacies66Weights({...p,clearance:-.04}),[0,1],'deep pool does not default back to coarse');
 for(const patch of [{shoreDistance:.08},{clearance:.018},{wetness:.25},{snow:1},{x:0,z:0}])assert.deepEqual(reachBedFacies66Weights({...p,...patch}),[1,0]);
 const edge=x=>reachBedFacies66Weights({...p,shoreDistance:x})[1];assert.ok(Math.abs(edge(0)-edge(1e-7))<1e-10);assert.ok(Math.abs(edge(.08)-edge(.08-1e-7))<1e-10);
 assert.throws(()=>reachBedFacies66Weights({...p,x:NaN}),/Finite/);
});
test('actual original 36 m reach retains water/ground/521 roots and each third has dominant fine substrate plus coarse exposure',t=>{
 const saved=globalThis.location;let world;try{globalThis.location={search:''};world=actualForestWorld(undefined,'rgba');}finally{globalThis.location=saved;}
 assert.equal(world.hydrology.forestReach39.stats.design50,null);
 const sourcePath=new URL('./generated/forest-reach-cover41-source.json',import.meta.url),preparedPath=new URL('../../public/data/v2/reach-cover-prepared42.json.gz',import.meta.url);
 const sourceBytes=fs.readFileSync(sourcePath),preparedBytes=fs.readFileSync(preparedPath),roots=JSON.parse(gunzipSync(preparedBytes)).records;
 assert.equal(roots.length,521);assert.equal(new Set(roots.map(r=>r.root.id)).size,521);
 const r=world.hydrology.forestReach39,segments=world.hydrology.segments.filter(s=>s.lineId===r.lineId),rows=[],buckets={inlet:[],middle:[],outlet:[]};
 for(let o=-17.5;o<=17.5;o+=.5){const d=r.origin+o,s=segments.find(s=>s.a.distance<=d&&s.b.distance>=d),v=(d-s.a.distance)/(s.b.distance-s.a.distance),q=r.waterSectionAt(s,v);
  for(const u of [-1.35,-1.05,-.95,-.75,-.5,-.25,0,.25,.5,.75,.95,1.05,1.35]){
   const across=u*(u<0?q.left:q.right),x=q.x-q.fz*across,z=q.z+q.fx*across,y=world.surface.heightAt(x,z),h=world.hydrology.sampleAt(x,z,{includeDepth:false}),weights=reachBedFacies66Weights({x,z,clearance:y-h.surfaceLevel,shoreDistance:h.shoreDistance,wetness:h.wetness});
   rows.push({offset:o,u,x,z,y,weights,s,v,width:q.width,left:q.left,right:q.right,level:q.level});
   if(Math.abs(u)<1)buckets[o<-6?'inlet':o>6?'outlet':'middle'].push(weights[1]);
   if(h.shoreDistance>=.08)assert.deepEqual(weights,[1,0]);
  }
 }
 const f=fixture(),owner=installReachBedFacies66(f.m,{assets:f.asset,enabled:true});try{compile(f.m);for(const p of rows){assert.equal(world.surface.heightAt(p.x,p.z),p.y);const q=r.waterSectionAt(p.s,p.v);for(const k of ['width','left','right','level'])assert.equal(q[k],p[k]);}}finally{owner.dispose();f.dispose();}
 assert.equal(hash(fs.readFileSync(sourcePath)),hash(sourceBytes));assert.equal(hash(fs.readFileSync(preparedPath)),hash(preparedBytes));
 const report={scope:'CPU original default49 71 stations x 13 positions; meso=.5. Not screen coverage or visual acceptance.',samples:rows.length,roots:roots.length,sourceSHA256:hash(sourceBytes),preparedSHA256:hash(preparedBytes),buckets:{},hero:rows.filter(p=>p.u===0&&p.offset>=-4&&p.offset<=0).map(({offset,weights})=>({offset,weights}))};
 for(const [name,a] of Object.entries(buckets)){const meanFine=a.reduce((s,n)=>s+n,0)/a.length,fine=a.filter(n=>n>.8).length,coarse=a.filter(n=>n<.1).length;assert.ok(meanFine>.65,name);assert.ok(fine>a.length*.55,name);assert.ok(coarse>=20,name);report.buckets[name]={n:a.length,meanFine,fine,coarse};}
 assert.ok(report.hero.every(p=>p.weights[1]>.9),'correct the failed64 16%-fine hero bed');
 t.diagnostic('REACH66_DISTRIBUTION='+JSON.stringify(report));
});
test('one official scan set is preserved; packed normal RGB/rough alpha decode exactly and adopted source files remain unchanged',()=>{
 const root=new URL('../../../',import.meta.url),meta=JSON.parse(fs.readFileSync(new URL('assets/src/v2/riverbed/facies66/source.json',root)));
 assert.equal(meta.license,'CC0-1.0');assert.equal(meta.metres,2.4800000190734863);
 for(const [name,record] of Object.entries(meta.sourceFiles))assert.equal(hash(fs.readFileSync(new URL('assets/src/v2/riverbed/facies66/'+name,root))),record.sha256);
 for(const [name,record] of Object.entries(meta.runtimeFiles))assert.equal(hash(fs.readFileSync(new URL('web/public/assets/v2/reach-bed-facies66/'+name,root))),record.sha256);
 const script='from PIL import Image\nfrom pathlib import Path\ns=Path("assets/src/v2/riverbed/facies66")\np=Image.open("web/public/assets/v2/reach-bed-facies66/gravelly_sand_normal_rough_1k.png")\nassert p.convert("RGB").tobytes()==Image.open(s/"gravelly_sand_nor_gl_1k.jpg").convert("RGB").tobytes()\nassert p.getchannel("A").tobytes()==Image.open(s/"gravelly_sand_rough_1k.jpg").convert("RGB").getchannel("R").tobytes()\nprint("exact")';
 const python=process.env.PYTHON ?? 'python3';
 assert.equal(execFileSync(python,['-c',script],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8'}).trim(),'exact');
 for(const name of ['forest-reach-surface41.js','reach-facies44.js','terrain-material.js','reach-bed-facies64.js'])assert.deepEqual(fs.readFileSync(new URL('backups/reach-bed-facies66/'+name,root)),fs.readFileSync(new URL('web/src/v2/'+name,root)),name);
});

test('generated signed lens constants are parenthesized and preserve negative shift/curvature arithmetic',()=>{
 const code=REACH_BED_FACIES66_GLSL.replace(/\/\/[^\n]*/g,'');
 assert.ok(!/(?:--|\+\+)\s*[0-9.]/.test(code),'numeric constants must not form decrement/increment tokens');
 assert.ok(code.includes('-(-0.1200000000)'));
 assert.ok(code.includes('-(-0.1300000000)-(-0.0800000000)*t*t'));
 const expressions=[...code.matchAll(/across=(.*?);w=/g)].map(m=>m[1]);
 assert.equal(expressions.length,REACH_BED_FACIES66_SCOURS.length);
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],vec2=(...v)=>v;
 REACH_BED_FACIES66_SCOURS.forEach((p,i)=>{
  const evaluate=new Function('d','t','width','meso','dot','vec2','return '+expressions[i]);
  for(const t of [-.93,-.4,0,.35,.91])for(const cross of [-.6,.1,.7])for(const meso of [0,.5,1]){
   const d=[p.fx*p.along*t-p.fz*cross,p.fz*p.along*t+p.fx*cross],width=p.across*(.36+.64*Math.max(0,1-t*t));
   const expected=(-d[0]*p.fz+d[1]*p.fx-p.shift-p.curve*t*t-(meso-.5)*.06)/width;
   assert.ok(Math.abs(evaluate(d,t,width,meso,dot,vec2)-expected)<1e-8,p.id);
  }
 });
 const f=fixture(),owner=installReachBedFacies66(f.m,{assets:f.asset,enabled:true});
 try{assert.ok(!/(?:--|\+\+)\s*[0-9.]/.test(compile(f.m).fragmentShader.replace(/\/\/[^\n]*/g,'')));}
 finally{owner.dispose();f.dispose();}
});
