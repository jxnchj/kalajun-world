import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldEnvironment} from './environment.js';
import {createCloudUniforms} from './cloud-field.js';
import {createAerialUniforms} from './aerial-perspective.js';
function environment(){
 const e=Object.create(WorldEnvironment.prototype);
 Object.assign(e,{meta:{lat:43.1,lon:82.1},sun:new THREE.Vector3(),clouds:createCloudUniforms(),
  sky:{material:{uniforms:{sunPosition:{value:new THREE.Vector3()}}}},
  csm:{lightDirection:new THREE.Vector3(),lights:Array.from({length:3},()=>({color:new THREE.Color(),intensity:0}))},
  scene:{fog:{color:new THREE.Color(),density:0}},renderer:{toneMappingExposure:0},bounce:{intensity:0}});
 e.aerial=createAerialUniforms(e.sun);return e;
}
test('daylight A/B changes incident lighting coherently without moving sun or altering exposure',()=>{
 const e=environment();e.setTime(870);const position=e.sun.toArray(),exposure=e.renderer.toneMappingExposure;
 const current={sun:e.csm.lights[0].intensity,bounce:e.bounce.intensity,env:e.scene.environmentIntensity};
 e.setLightingProfile('v14');
 assert.deepEqual(e.sun.toArray(),position);assert.equal(e.renderer.toneMappingExposure,exposure);
 assert.ok(e.csm.lights[0].intensity<current.sun);assert.ok(e.bounce.intensity<current.bounce);
 assert.ok(e.scene.environmentIntensity<current.env);assert.ok(e.pendingEnv);
 e.setLightingProfile('v15');assert.deepEqual(e.sun.toArray(),position);
 assert.equal(e.csm.lights[0].intensity,current.sun);assert.equal(e.bounce.intensity,current.bounce);
 for(const light of e.csm.lights)assert.equal(light.intensity,current.sun);
 for(let i=0;i<10;i++)e.setTime(870);
 assert.equal(e.csm.lights[0].intensity,current.sun);assert.equal(e.renderer.toneMappingExposure,exposure);
 assert.throws(()=>e.setLightingProfile('unknown'),RangeError);
});
test('morning and evening retain their solar direction, warm colour and existing exposure curve',()=>{
 const e=environment();
 for(const t of [540,660,870,1110,1260,1305]){
  e.lightingProfile='v14';e.setTime(t);const old={sun:e.sun.toArray(),color:e.csm.lights[0].color.toArray(),exposure:e.renderer.toneMappingExposure};
  e.setLightingProfile('v15');
  assert.deepEqual(e.sun.toArray(),old.sun);assert.deepEqual(e.csm.lights[0].color.toArray(),old.color);
  assert.equal(e.renderer.toneMappingExposure,old.exposure);assert.ok(Number.isFinite(e.bounce.intensity));
 }
});
