import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {createTerrainMaterial} from './terrain-material.js';import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {installReachDesign73Material,reachDesign73Roles,reachDesign73MaterialSource,projectReachDesign73} from './reach-design73-material.js';
const world=actualForestWorld(undefined,'rgba',{reachDesign73:'bend'});const compile=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
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

test('73 dormant OFF restores exact original hook, no extra sampler, geometry or water shader',()=>{
 const f=fixture(),before=compile(f.m),original=f.m.onBeforeCompile,key=f.m.customProgramCacheKey,owner=installReachDesign73Material(f.m,{world,assets:f.asset});try{
 assert.equal(f.m.onBeforeCompile,original);assert.deepEqual(compile(f.m),before);owner.setEnabled(true);const next=compile(f.m);assert.equal(next.vertexShader,before.vertexShader);
 const count=(s,r)=>(s.match(r)||[]).length;assert.equal(count(next.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g),count(before.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g));assert.equal(count(next.fragmentShader,/\btextureGrad\s*\(/g),count(before.fragmentShader,/\btextureGrad\s*\(/g)+2);
 assert.ok(next.fragmentShader.includes('reachRoots41=mix(reachRoots41,reachLandform73.x,reachActive73)'));assert.ok(next.fragmentShader.includes('reachBankGradient73'));assert.ok(next.fragmentShader.includes('reachBankRough73'));
 const clean=next.fragmentShader.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'');assert.ok(!/--\s*[\d.]/.test(clean));assert.ok(!/\b(?:float|int|bool)\s+(?:flat|smooth|input|output)\b|[,;]\s*flat\s*=/.test(clean));assert.ok(!clean.includes('undefined'));assert.ok(!clean.includes('NaN'));
 const a=next.uniforms.terrainScanColors.value,b=next.uniforms.terrainScanNormals.value;let disposed=0;a.addEventListener('dispose',()=>disposed++);b.addEventListener('dispose',()=>disposed++);owner.setEnabled(false);assert.equal(owner.uniform.value,0);owner.dispose();owner.dispose();assert.equal(disposed,2);assert.equal(f.m.onBeforeCompile,original);assert.equal(f.m.customProgramCacheKey,key);assert.deepEqual(compile(f.m),before);
 }finally{owner.dispose();f.dispose();}
});
test('continuous geometry roles classify steep bank as cohesive soil, not rock; coarse preserved in bounded lenses',()=>{
 const cut=reachDesign73Roles(-2.5,-.95,.08),opposite=reachDesign73Roles(-2.5,.82,.02),pool=reachDesign73Roles(-2.5,0,-.18);
 assert.ok(cut.cut>.5&&cut.bank>.95&&cut.coarse<.15);assert.ok(opposite.bank>.95&&opposite.coarse<.15);assert.ok(pool.fine>.85);
 assert.ok(reachDesign73Roles(5,.02,-.06).coarse>.9);let coarse=0,total=0;for(let along=-15;along<15;along+=.1)for(let d=-.6;d<.6;d+=.05){const r=reachDesign73Roles(along,d,-.05);assert.ok(Object.values(r).every(v=>Number.isFinite(v)&&v>=0&&v<=1));coarse+=+(r.coarse>.5);total++;}assert.ok(coarse/total<.15);
});
test('material projection covers actual turning transverse source, same section axis as geometry',t=>{
 const source=reachDesign73MaterialSource(world),r=world.hydrology.forestReach39;let maxOffset=0,maxAcross=0,samples=0;
 for(const s of source.segments)for(const u of [.1,.3,.5,.7,.9]){const q=r.waterSectionAt(s,u);for(const f of [-.9,-.4,0,.4,.9]){const d=f*(f<0?q.left:q.right),x=q.x-q.fz*d,z=q.z+q.fx*d,p=r.queryAt(x,z),v=projectReachDesign73(source,x,z);maxOffset=Math.max(maxOffset,Math.abs(v[0]-(p.section.distance-r.origin)));maxAcross=Math.max(maxAcross,Math.abs(v[1]-p.signed));samples++;}}
 assert.ok(maxOffset<.001);assert.ok(maxAcross<.001);t.diagnostic(JSON.stringify({samples,maxOffset,maxAcross}));
});
