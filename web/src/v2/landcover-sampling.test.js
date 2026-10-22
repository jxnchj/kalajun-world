import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRaster,sampleRaster,sampleRasterRGBA} from './world-data.js';
test('shared RGBA coordinates retain every scalar result exactly at interior, clamped and seam positions',()=>{
 for(const Type of [Uint8Array,Float32Array]){
  const data=Type.from({length:19*19*4},(_,i)=>(Math.sin(i*1.975)+1)*127.5),r=makeRaster(data,{n:19,res:2.7,x0:-53.7,z0:29.3,channels:4});
  const points=[[-1e7,1e7],[NaN,1],[Infinity,3]];
  for(let i=0;i<7000;i++)points.push([-81.7+(i%83)*1.7621,18.3+Math.floor(i/83)*.8513]);
  for(let i=0;i<19;i++)points.push([r.x0+(i+.5)*r.res,r.z0+(i+.5)*r.res]);
  for(const [x,z]of points){
   if(!Number.isFinite(x)||!Number.isFinite(z)){assert.throws(()=>sampleRasterRGBA(r,x,z),TypeError);continue;}
   const actual=sampleRasterRGBA(r,x,z);for(const [i,key]of ['r','g','b','a'].entries())assert.ok(Object.is(actual[key],sampleRaster(r,x,z,i)),`${key} differs at ${x},${z}`);
  }
 }
 assert.throws(()=>sampleRasterRGBA(makeRaster(new Uint8Array(4),{n:2,res:1}),0,0),/four channels/);
});
