import test from "node:test";
import assert from "node:assert/strict";
import { MeadowWindField,windAt } from "./wind-field.js";
import {sampleTreeWind} from "./spruce-wind.js";
test("coherent wind is deterministic, bounded and continuous at grid boundaries",()=>{
  for(const [x,z,t] of [[0,0,0],[-3000,3500,21],[-1,1,.1],[126,512,70]]){
    const v=windAt(x,z,t);assert.deepEqual(v,windAt(x,z,t));
    for(const c of v)assert.ok(c>=0&&c<=1);
    const w=windAt(x+.001,z,t+.001);for(let i=0;i<4;i++)assert.ok(Math.abs(v[i]-w[i])<.002);
  }
});
test("wind textures refresh only on cadence or spatial rebase and share uniform identities",()=>{
  const field=new MeadowWindField({resolution:16,span:64});
  const originUniform=field.uniforms.uWindFieldOrigin;
  assert.equal(field.update(0,{x:-3,z:2}),true);assert.equal(field.revisions,1);
  const first=field.current,copy=first.image.data.slice();
  assert.equal(field.update(.05,{x:-3,z:2}),false);assert.equal(field.uniforms.uWindFieldBlend.value,.5);assert.deepEqual(first.image.data,copy);
  assert.equal(field.update(.11,{x:-3,z:2}),true);assert.strictEqual(field.previous,first);assert.equal(field.revisions,2);
  assert.equal(field.update(.12,{x:25,z:2}),true);assert.strictEqual(field.uniforms.uWindFieldOrigin,originUniform);
  const n=field.resolution,step=field.span/n,x=field.origin.x+.5*step,z=field.origin.y+.5*step,expected=windAt(x,z,.2);
  for(let c=0;c<4;c++)assert.ok(Math.abs(field.current.image.data[c]/255-expected[c])<=.5/255+1e-8);
  assert.throws(()=>field.update(NaN,{x:0,z:0}),/finite/);field.dispose();
});

const forceSample=(field,time,position={x:0,z:0})=>{field.update(time,position);return Array.from(sampleTreeWind(field,2,2,time));};
test("wind initialization and each cadence boundary have no backward step",()=>{
  const field=new MeadowWindField({resolution:16,span:64}),epsilon=1e-7;
  for(const time of [0,.1,.2,.3,1,10]){
    const a=forceSample(field,time-epsilon),b=forceSample(field,time),c=forceSample(field,time+epsilon);
    for(let k=0;k<4;k++){
      assert.ok(Math.abs(a[k]-b[k])<1e-6,`left continuity at ${time}/${k}`);
      assert.ok(Math.abs(b[k]-c[k])<1e-6,`right continuity at ${time}/${k}`);
    }
  }
  field.dispose();
});
test("identical physical timestamps produce identical wind across regular, irregular, skipped and rewound frames",()=>{
  const target=[.013,.11,.247,.501,.999,1.017,3.4,.06],direct=new MeadowWindField({resolution:16,span:64}),stepped=new MeadowWindField({resolution:16,span:64});
  let previous=0;
  for(const t of target){
    if(t>previous)for(let i=previous;i<t;i+=.017+(Math.floor(i*1000)%7)*.004)forceSample(stepped,i);
    const expected=forceSample(direct,t),actual=forceSample(stepped,t);
    assert.deepEqual(actual,expected,`frame-history independent at ${t}`);
    assert.equal(direct.lastUpdate,Math.floor(t/direct.interval)*direct.interval);previous=t;
  }
  direct.dispose();stepped.dispose();
});
test("wind texture recycling preserves the endpoint and aligned spatial rebase preserves common samples",()=>{
  const field=new MeadowWindField({resolution:16,span:64});field.update(.073,{x:0,z:0});
  const endpoint=field.current,endpointData=endpoint.image.data.slice();field.update(.105,{x:0,z:0});
  assert.strictEqual(field.previous,endpoint);assert.deepEqual(field.previous.image.data,endpointData);
  const before=forceSample(field,.125),uniforms=Object.values(field.uniforms);
  const after=forceSample(field,.125,{x:20,z:0});assert.deepEqual(after,before);
  assert.deepEqual(Object.values(field.uniforms),uniforms);field.dispose();
});
