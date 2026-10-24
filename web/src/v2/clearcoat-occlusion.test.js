import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installAssetOcclusion} from './asset-occlusion.js';
import {RoomIndirectLight} from './room-lighting.js';

function compiled(asset){
 const material=new THREE.MeshPhysicalMaterial({clearcoat:.22,clearcoatRoughness:.3});
 if(asset)installAssetOcclusion(material);
 const light=new RoomIndirectLight();light.register([material]);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 material.onBeforeCompile(shader);light.dispose();material.dispose();return shader.fragmentShader;
}
test('installed Three uses independent direct and indirect clearcoat accumulators with AO before final physical combination',()=>{
 assert.match(THREE.ShaderChunk.lights_physical_pars_fragment,/clearcoatSpecularIndirect \+= clearcoatRadiance/);
 assert.match(THREE.ShaderChunk.aomap_fragment,/#if defined\( USE_CLEARCOAT \)\s+clearcoatSpecularIndirect \*= ambientOcclusion/);
 const physical=THREE.ShaderLib.physical.fragmentShader;
 assert.ok(physical.indexOf('#include <lights_fragment_end>')<physical.indexOf('#include <aomap_fragment>'));
 assert.ok(physical.indexOf('#include <aomap_fragment>')<physical.indexOf('clearcoatSpecularDirect + clearcoatSpecularIndirect'));
});
for(const asset of[false,true])test('physical room shader attenuates only external clearcoat before room GI; asset AO '+asset,()=>{
 const shader=compiled(asset),boundary=shader.indexOf('if(uRoomAmbientActive>.5)'),total=shader.indexOf('vec3 totalDiffuse =');
 const coat=shader.indexOf('clearcoatSpecularIndirect *=');
 const contactCoat=shader.indexOf('clearcoatSpecularIndirect*=');
 assert.ok((asset?coat:contactCoat)>0&&(asset?coat:contactCoat)<boundary);
 const pre=shader.slice(0,boundary),room=shader.slice(boundary,total);
 assert.equal((pre.match(/clearcoatSpecularIndirect\s*\*=/g)||[]).length,1,'contact must not multiply the physical coat twice');
 assert.doesNotMatch(shader,/clearcoatSpecularDirect\s*\*=/);
 assert.doesNotMatch(room,/skyAccess|vAssetOcclusion.y|clearcoatSpecularIndirect\s*\*=/);
 assert.match(room,/RE_IndirectSpecular\(roomRadiance,roomIrradiance,roomRadiance/);
 assert.match(pre,/#ifdef USE_CLEARCOAT\s+\/\/[\s\S]*?clearcoatSpecularIndirect\s*\*=/);
 // Execute the exact injected scalar statement, with an independent room return
 // added afterward, to catch moving attenuation after room transport.
 const statement=pre.match(/clearcoatSpecularIndirect\s*\*=([^;]+);/)[0];
 const run=new Function('assetAO','skyAccess','roomContactAO','mix','let clearcoatSpecularIndirect=10;let clearcoatSpecularDirect=7;'+statement+';clearcoatSpecularIndirect+=3;return [clearcoatSpecularIndirect,clearcoatSpecularDirect];');
 const r=run(.25,.1,.4,(a,b,t)=>a+(b-a)*t);
 assert.deepEqual(r,[asset?10*(.22+.78*.025)+3:7,7]);
 assert.deepEqual(run(1,1,1,(a,b,t)=>a+(b-a)*t),[13,7]);
});
