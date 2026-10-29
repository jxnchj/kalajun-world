import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {MEADOW_ROOT_FIELD41,createMeadowRootWind41,attachMeadowRootWind41,meadowWindRootIndices41} from './meadow-root-wind41.js';
import {attachEcologyWind} from './ecology.js';
test('GPU root field retains verbatim original field and every Float32 root address',()=>{
 assert.ok(fs.readFileSync(new URL('./ecology.js',import.meta.url),'utf8').includes(MEADOW_ROOT_FIELD41));
 const matrices=new Float32Array(257*16);for(let i=0;i<257;i++){matrices[i*16+12]=i*.13-2000;matrices[i*16+13]=2100;matrices[i*16+14]=3400+i*.8;}
 const uniforms=Object.fromEntries(['uWindTime','uWindPrevious','uWindCurrent','uWindFieldOrigin','uWindFieldSpan','uWindFieldBlend'].map(k=>[k,{value:null}])),cache=createMeadowRootWind41(matrices,uniforms),ids=meadowWindRootIndices41(257);assert.equal(cache.roots,257);assert.equal(ids.count,257);assert.equal(ids.getX(256),256);assert.ok(cache.size.x*cache.size.y>=257);assert.equal(cache.target.texture.type,T.FloatType);
 const material=attachEcologyWind(new T.MeshStandardMaterial(),uniforms,4,true),old=material.onBeforeCompile,undo=attachMeadowRootWind41(material,cache),shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,{});assert.equal((shader.vertexShader.match(/vec4 field=texture2D\(uMeadowRootWind41/g)||[]).length,1);assert.ok(shader.vertexShader.includes('float local=sin(t*(.7+seed*.7)+fract(weights.z)*4.+seed*10.)*.5;'));assert.equal(shader.uniforms.uMeadowRootWind41.value,cache.target.texture);undo();assert.equal(material.onBeforeCompile,old);cache.dispose();material.dispose();
});
