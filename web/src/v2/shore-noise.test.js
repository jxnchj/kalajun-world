import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import * as THREE from 'three';
import {createShoreRockMaterial,createRiverGravel} from './water.js';
import {createWorldData,decodeHeightBytes} from './world-data.js';
const shaderFor=scanned=>{const material=createShoreRockMaterial({scanned}),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);material.dispose();return shader;};
// Independent float32 models of the former scalar dot/hash and the lane form.
// This verifies arithmetic/order equivalence; physical GPU FMA behaviour and
// compile time remain browser checks, not claims made by this CPU oracle.
const F=Math.fround,add=(a,b)=>F(a+b),sub=(a,b)=>F(a-b),mul=(a,b)=>F(a*b),fract=a=>sub(a,Math.floor(a));
const mix=(a,b,t)=>add(mul(a,sub(1,t)),mul(b,t));
const scalarHash=point=>{let p=point.map(v=>fract(mul(v,F(.1031))));const dot=add(add(mul(p[0],add(p[1],F(33.33))),mul(p[1],add(p[2],F(33.33)))),mul(p[2],add(p[0],F(33.33))));p=p.map(v=>add(v,dot));return fract(mul(add(p[0],p[1]),p[2]));};
const laneHash=a=>{let x=[0,1,0,1].map(v=>fract(mul(add(a[0],v),F(.1031)))),y=[0,0,1,1].map(v=>fract(mul(add(a[1],v),F(.1031)))),z=Array(4).fill(fract(mul(a[2],F(.1031))));const d=x.map((v,i)=>add(add(mul(v,add(y[i],F(33.33))),mul(y[i],add(z[i],F(33.33)))),mul(z[i],add(v,F(33.33)))));x=x.map((v,i)=>add(v,d[i]));y=y.map((v,i)=>add(v,d[i]));z=z.map((v,i)=>add(v,d[i]));return x.map((v,i)=>fract(mul(add(v,y[i]),z[i])));};
function noise(point,lane){const p=point.map(F),a=p.map(Math.floor),f=p.map(fract).map(v=>mul(mul(v,v),sub(3,mul(2,v))));const values=lane?[...laneHash(a),...laneHash([a[0],a[1],add(a[2],1)])]:[0,1].flatMap(z=>[0,1].flatMap(y=>[0,1].map(x=>scalarHash([add(a[0],x),add(a[1],y),add(a[2],z)]))));return mix(mix(mix(values[0],values[1],f[0]),mix(values[2],values[3],f[0]),f[1]),mix(mix(values[4],values[5],f[0]),mix(values[6],values[7],f[0]),f[1]),f[2]);}
test('generated stone shader keeps all eight noise corners and scalar interpolation with two lane hashes',()=>{
 const source=shaderFor(false).fragmentShader;
 assert.match(source,/vec4 x=fract\(\(a\.x\+vec4\(0\.,1\.,0\.,1\.\)\)\*\.1031\)/);assert.match(source,/vec4 y=fract\(\(a\.y\+vec4\(0\.,0\.,1\.,1\.\)\)\*\.1031\)/);assert.match(source,/vec4 z=fract\(vec4\(a\.z\)\*\.1031\)/);
 assert.match(source,/vec4 d=x\*\(y\+33\.33\)\+y\*\(z\+33\.33\)\+z\*\(x\+33\.33\)/);assert.match(source,/x\+=d;y\+=d;z\+=d/);assert.match(source,/return fract\(\(x\+y\)\*z\)/);
 assert.equal((source.match(/shoreHash4\(/g)||[]).length,3,'one function and two calls, not eight scalar expansions');assert.doesNotMatch(source,/shoreHash\(/);
 assert.match(source,/vec4 lo=shoreHash4\(a\),hi=shoreHash4\(a\+vec3\(0\.,0\.,1\.\)\)/);
 assert.match(source,/mix\(mix\(mix\(lo\.x,lo\.y,f\.x\),mix\(lo\.z,lo\.w,f\.x\),f\.y\),\s*mix\(mix\(hi\.x,hi\.y,f\.x\),mix\(hi\.z,hi\.w,f\.x\),f\.y\),f\.z\)/);
 assert.equal((source.match(/shoreNoise\(vShoreWorld/g)||[]).length,2,'retain broad and millimetre noise fields');assert.equal((shaderFor(true).fragmentShader.match(/shoreNoise\(vShoreWorld/g)||[]).length,0,'scanned material still uses its authored texture');
});
test('float32 four-corner noise equals the former scalar hash at negative, large and lattice-boundary coordinates',t=>{
 let state=40993,cases=0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const check=p=>{assert.equal(noise(p,true),noise(p,false),p.join(','));const a=p.map(F).map(Math.floor);for(const z of[0,1]){const base=[a[0],a[1],add(a[2],z)];assert.deepEqual(laneHash(base),[0,1].flatMap(y=>[0,1].map(x=>scalarHash([add(base[0],x),add(base[1],y),base[2]]))));}cases++;};
 for(let i=0;i<10000;i++)check(Array.from({length:3},()=>F((random()-.5)*9000000)));
 for(const coordinate of[-4500000,-397180,-3611,-1,0,1,2332,528705,4500000])for(const offset of[-.125,-.000001,0,.000001,.125])for(const axis of[0,1,2]){const p=[-12276.482,17489.625,16340.55];p[axis]=coordinate+offset;check(p);}
 t.diagnostic('Exact equality in the explicit float32 CPU arithmetic model for '+cases+' positions and all '+(cases*8)+' hashed corners.');
});
test('actual river-gravel broad and fine mineral coordinates preserve values and relief differences',t=>{
 const base=new URL('../../public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base))));const meta=json('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 // Physical gravel placement uses the actual DEM/river/objects; landcover is not consumed.
 const world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});let cases=0;
 for(const view of world.hydrology.viewpoints){const rocks=createRiverGravel(world,world.hydrology.nearSegments(view.x,view.z,68),view);assert.ok(rocks.length>0);for(const r of rocks)for(const scales of[[3.4,7.5,3.4],[110,110,110]]){const p=[r.x,r.y,r.z].map((v,i)=>mul(F(v),F(scales[i])));assert.equal(noise(p,true),noise(p,false));for(const axis of[0,2]){const q=p.slice();q[axis]=add(q[axis],F(scales[axis]*.001));assert.equal(sub(noise(q,true),noise(p,true)),sub(noise(q,false),noise(p,false)));}cases++;}}
 assert.ok(cases>1000);t.diagnostic('Matched '+cases+' real gravel field samples and their 1 mm finite differences across all three representative creeks.');
});
