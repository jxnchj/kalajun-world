import test from 'node:test';
import assert from 'node:assert/strict';
import {monotoneHeight,sampleMonotoneHeight} from './terrain-height-interpolation.js';
import {riverBankRise} from './river-section.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('monotone DEM preserves samples, ramps and range without inventing peaks',()=>{
  for(const p of [[0,1,2,3],[8,3,2,-5],[0,3,1,7],[-5,2,2,9]]){
    near(monotoneHeight(...p,0),p[1]);near(monotoneHeight(...p,1),p[2]);
    for(let t=0;t<=1;t+=.01){const h=monotoneHeight(...p,t);assert.ok(h>=Math.min(p[1],p[2])-1e-9&&h<=Math.max(p[1],p[2])+1e-9);}
  }
  for(let t=0;t<=1;t+=.01)near(monotoneHeight(0,1,2,3,t),1+t);
});
test('DEM reconstruction shares derivative on cell boundaries and retains 2D data points',()=>{
  const p=[1,3,8,12,19],e=1e-5;
  near((monotoneHeight(...p.slice(1),e)-p[2])/e,(p[2]-monotoneHeight(...p.slice(0,4),1-e))/e,1e-3);
  const n=5,r={n,res:10,x0:0,z0:0,data:new Float32Array(n*n).map((_,i)=>i*i%31)};
  for(let z=0;z<n;z++)for(let x=0;x<n;x++)near(sampleMonotoneHeight(r,x*10+5,z*10+5),r.data[z*n+x]);
  assert.throws(()=>sampleMonotoneHeight(r,NaN,0));
});
test('v38 bank has distinct nonzero contact angles, monotone rise and unchanged envelope',()=>{
  for(const bar of [.08,.4,.94]){
    const section={weight:1,barLeft:bar,barRight:bar,shoulderLeft:.8,shoulderRight:.6};
    for(const side of [-1,1]){
      near(riverBankRise(section,side,0,'v38'),0);near(riverBankRise(section,side,1,'v38'),1);
      let prev=0;for(let u=0;u<=1;u+=.001){const h=riverBankRise(section,side,u,'v38');assert.ok(h>=prev-1e-10&&h<=1);prev=h;}
      assert.ok(riverBankRise(section,side,.00001,'v38')>.000005);
    }
  }
});

test('authored footprint protection has exact interior and continuous outer release',async()=>{
  const {createAuthoredHeightProtection}=await import('./terrain-height-interpolation.js');
  const weight=createAuthoredHeightProtection([{x:0,z:0,assetId:'house',scale:{x:1,z:1},source:{}}],{house:{bounds:{min:[-3,0,-4],max:[3,5,4]}}});
  for(const x of [0,5,20,37])assert.equal(weight(x,0),0);
  assert.equal(weight(61,0),1);assert.equal(weight(1000,1000),1);
  let previous=0;for(let x=37;x<=61;x+=.1){const w=weight(x,0);assert.ok(w>=previous&&w<=1);previous=w;}
  assert.ok(weight(37.001,0)<1e-8);assert.ok(1-weight(60.999,0)<1e-8);
});
