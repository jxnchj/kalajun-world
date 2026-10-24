import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM_FIELD_GLSL} from './room-bounce-field.js';
import {assertRoomFieldSamplingContract} from './room-field-contract.assert.js';
test('actual legacy room uniforms stay on four-tap branch and dining uses one guarded fifth tap',()=>assertRoomFieldSamplingContract());
test('contract rejects an unconditional fifth tap, widened branch or second sampler',()=>{
 assert.throws(()=>assertRoomFieldSamplingContract(ROOM_FIELD_GLSL.replace('if(uRoomFieldSlabs>4.5)','')),/dining-only/);
 assert.throws(()=>assertRoomFieldSamplingContract(ROOM_FIELD_GLSL.replace('uRoomFieldSlabs>4.5','uRoomFieldSlabs>3.5')),/dining-only/);
 assert.throws(()=>assertRoomFieldSamplingContract(ROOM_FIELD_GLSL+'\nvec4 bad=texture(uRoomBounceField,vec3(0.0));'),/four unconditional/);
 assert.throws(()=>assertRoomFieldSamplingContract(ROOM_FIELD_GLSL+'\nuniform sampler3D bad;'),/original sampler/);
});
