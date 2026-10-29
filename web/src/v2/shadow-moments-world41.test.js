import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ShadowMomentsWorld41} from './shadow-moments-world41.js';
import {csmPhysicalLighting} from './csm-physical.js';

test('world moment depth keeps original wind and alpha shader hooks without changing shared material',()=>{
 const owner=Object.create(ShadowMomentsWorld41.prototype);owner.depthMaterials=new Map();owner.uniforms={momentEncoding41:{value:new T.Vector2()}};
 const source=new T.MeshDepthMaterial({alphaTest:.43});const hook=shader=>{shader.vertexShader+='\n// actual source wind';shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n// original alpha hook');};source.onBeforeCompile=hook;
 const variant=owner.depth(source),shader={vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader,uniforms:{}};
 variant.onBeforeCompile(shader,{});assert.equal(source.onBeforeCompile,hook);assert.equal(variant.alphaTest,.43);assert.match(shader.vertexShader,/actual source wind/);assert.match(shader.fragmentShader,/#include <alphatest_fragment>\n\/\/ original alpha hook/);assert.match(shader.fragmentShader,/depthReference41\(gl_FragCoord.xy\/momentTargetSize41\)/);assert.match(shader.fragmentShader,/\(uv-momentReferenceWindow41.xy\)\/\(momentReferenceWindow41.zw-momentReferenceWindow41.xy\)/);assert.equal(owner.depth(source),variant);assert.equal(owner.depthMaterials.size,1);
});
test('world receiver replaces only nearest CSM visibility, retains original lighting and restores hook',()=>{
 const owner=Object.create(ShadowMomentsWorld41.prototype),material=new T.MeshStandardMaterial();const prior=s=>{s.fragmentShader=s.fragmentShader.replace('#include <lights_fragment_begin>',csmPhysicalLighting);s.uniforms.original={value:1};};material.onBeforeCompile=prior;owner.terrain={materials:[material]};owner.size=2048;owner.uniforms={momentEnabled41:{value:1}};owner.restores=[];
 owner.installReceivers();const shader={uniforms:{},fragmentShader:'#include <shadowmap_pars_fragment>\n#include <lights_fragment_begin>'};material.onBeforeCompile(shader,{});
 assert.equal(shader.uniforms.original.value,1);assert.match(shader.fragmentShader,/cascade==0\?momentNear41/);assert.match(shader.fragmentShader,/:getShadow\(map,size,intensity,bias,radius,coord\)/);assert.match(shader.fragmentShader,/vDirectionalShadowCoord\[ i \], UNROLLED_LOOP_INDEX/);assert.match(shader.fragmentShader,/momentWindow41/);assert.match(shader.fragmentShader,/\(uv-momentReferenceWindow41.xy\)\/\(momentReferenceWindow41.zw-momentReferenceWindow41.xy\)/);assert.match(shader.fragmentShader,/smoothstep/);owner.restores[0]();assert.equal(material.onBeforeCompile,prior);
});
