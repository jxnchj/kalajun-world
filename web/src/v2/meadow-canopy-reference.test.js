import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {meadowGeometry} from './ecology.js';
import {canopyReferenceSamples,angularDirection,sourceCanopyResponse,roughDiffuseResponse,fitRoughDiffuse} from './meadow-canopy-reference.js';
test('source geometry is read without mutation and retains near/middle blades',()=>{
 for(const near of [true,false]){const g=meadowGeometry(near),before=Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)])),indices=Array.from(g.index.array),ref=canopyReferenceSamples(g,{rotations:2});
  assert.ok(ref.stats.weightedArea>0);assert.ok(ref.stats.seedArea>0);assert.ok(ref.stats.seedArea<ref.stats.weightedArea*.1);assert.ok(ref.stats.meanNormalY2>0&&ref.stats.meanNormalY2<1);
  assert.deepEqual(Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)])),before);assert.deepEqual(Array.from(g.index.array),indices);g.dispose();}
});
test('source diffuse reference is bounded and continuous over grazing and opposing views',()=>{
 const g=meadowGeometry(false),{samples}=canopyReferenceSamples(g,{rotations:8});
 for(const sun of [1,15,45,89])for(const elevation of [1,20,75,89])for(const azimuth of [0,90,180]){
  const l=angularDirection(sun),v=angularDirection(elevation,azimuth),a=sourceCanopyResponse(samples,l,v),b=sourceCanopyResponse(samples,l,angularDirection(elevation+.0001,azimuth));
  assert.ok(a>=0&&a<=1);assert.ok(Math.abs(a-b)<.001);
 }g.dispose();
});
test('rough diffuse comparator is reciprocal and its hemisphere energy does not exceed one',()=>{
 for(const sigma of [0,.4,.9,Math.PI/2])for(const ve of [2,20,45,89]){
  const v=angularDirection(ve,33);let energy=0;const n=64,m=128;
  for(let j=0;j<n;j++){const mu=(j+.5)/n;for(let k=0;k<m;k++){
   const l=angularDirection(Math.asin(mu)*180/Math.PI,(k+.5)*360/m),response=roughDiffuseResponse(l,v,sigma);
   energy+=response*2/n/m;
   assert.ok(Math.abs(response/mu-roughDiffuseResponse(v,l,sigma)/v[1])<1e-10);
  }}assert.ok(energy<=1.002,`sigma ${sigma}, view ${ve}, energy ${energy}`);
 }
});
test('zero roughness recovers Lambert and fit does not invent a passing result',()=>{
 const rows=[10,30,60,85].map(e=>({light:angularDirection(e),view:angularDirection(25),source:Math.sin(e*Math.PI/180)}));
 assert.equal(fitRoughDiffuse(rows).sigmaDegrees,0);
 for(const r of rows)assert.equal(roughDiffuseResponse(r.light,r.view,0),r.light[1]);
});
test('reference remains excluded from production terrain and cannot affect paths or water',()=>{
 const source=readFileSync(new URL('./terrain-material.js',import.meta.url),'utf8');
 assert.ok(!source.includes('meadow-canopy-reference'));
 // No runtime exclusion mask is claimed tested: this research module is not installed.
});
