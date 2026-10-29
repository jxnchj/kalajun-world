import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {reduceSurface42,createSurfaceGround42} from './meadow-surface-bake42.js';
test('moment reduction averages premultiplied coverage and moments before normalisation',()=>{
 const raw=Uint16Array.from([.2,.4,.6,1, 0,0,0,0, .4,.2,.8,1, 0,0,0,0],T.DataUtils.toHalfFloat);
 const reduced=reduceSurface42(raw,2,1),values=Array.from(reduced,T.DataUtils.fromHalfFloat);
 for(const [i,v]of[.15,.15,.35,.5].entries())assert.ok(Math.abs(values[i]-v)<.001);
 assert.throws(()=>reduceSurface42(raw,2,3),/Integral/);
});
test('surface sample uses original source ground and all four maps without changing source data',()=>{
 const data={size:24,center:[-1972,2121,3395],ground:{positions:[0,0,0,1,0,0,0,0,1],normals:[0,1,0,0,1,0,0,1,0],indices:[0,1,2]}};
 const before=JSON.stringify(data),maps=Array.from({length:4},()=>new T.Texture()),surface=createSurfaceGround42({data,maps});
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};surface.mesh.material.onBeforeCompile(shader);
 assert.strictEqual(shader.uniforms.surfaceAlbedo42.value,maps[0]);assert.strictEqual(shader.uniforms.surfaceSecond42.value,maps[2]);assert.match(shader.fragmentShader,/footprint42/);assert.match(shader.fragmentShader,/variance42/);
 surface.setEnabled(false);assert.equal(shader.uniforms.surfaceEnabled42.value,0);assert.equal(JSON.stringify(data),before);assert.deepEqual(Array.from(surface.mesh.geometry.index.array),[0,1,2]);surface.dispose();maps.forEach(m=>m.dispose());
});
