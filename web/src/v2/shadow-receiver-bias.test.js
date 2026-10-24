import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderChunk } from 'three';
import { directionalReceiverBias, receiverBiasMode } from './shadow-receiver-bias.js';

const visible=(receiver,stored,bias,reversed)=>reversed?receiver+bias>=stored:receiver+bias<=stored;
test('receiver offset removes small self-depth error without removing a distinct occluder in either depth convention',()=>{
 for(const magnitude of [5e-7,2e-6])for(const reversed of [false,true]){
  const map=z=>reversed?1-z:z,stored=map(.5),receiver=map(.5+magnitude*.4);
  const corrected=directionalReceiverBias(magnitude,reversed),legacy=directionalReceiverBias(magnitude,reversed,'legacy');
  assert.equal(visible(receiver,stored,corrected,reversed),true,'same plane remains lit within the existing precision margin');
  assert.equal(visible(receiver,stored,legacy,reversed),false,'old offset deepens the same-plane error');
  assert.equal(visible(map(.5+magnitude*10),stored,corrected,reversed),false,'a separated occluder still blocks light');
  assert.equal(Math.abs(corrected),magnitude);
 }
});
test('CPU comparisons are tied to the actual r186 PCF source convention, not the Basic/VSM bias branches',()=>{
 const source=ShaderChunk.shadowmap_pars_fragment,start=source.indexOf('float getShadow( sampler2DShadow shadowMap,'),end=source.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )',start);
 assert.ok(start>=0&&end>start);const pcf=source.slice(start,end);
 assert.match(pcf,/shadowCoord\.z \+= shadowBias;/);
 assert.doesNotMatch(pcf,/shadowCoord\.z -= shadowBias;/);
 assert.equal((pcf.match(/texture\( shadowMap,/g)||[]).length,5);
});
test('rollback is explicit and malformed magnitude/mode cannot silently change shadow behavior',()=>{
 assert.equal(receiverBiasMode(''),'corrected');assert.equal(receiverBiasMode('?shadowReceiverBias=legacy'),'legacy');
 assert.equal(receiverBiasMode('?shadowReceiverBias=other'),'corrected');
 for(const value of [-1,NaN,Infinity])assert.throws(()=>directionalReceiverBias(value,false),/magnitude/);
 assert.throws(()=>directionalReceiverBias(1e-6,false,'unknown'),/mode/);
});
