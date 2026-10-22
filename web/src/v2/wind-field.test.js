import test from "node:test";
import assert from "node:assert/strict";
import { MeadowWindField,windAt } from "./wind-field.js";
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
  const n=field.resolution,step=field.span/n,x=field.origin.x+.5*step,z=field.origin.y+.5*step,expected=windAt(x,z,.12);
  for(let c=0;c<4;c++)assert.ok(Math.abs(field.current.image.data[c]/255-expected[c])<=.5/255+1e-8);
  assert.throws(()=>field.update(NaN,{x:0,z:0}),/finite/);field.dispose();
});
