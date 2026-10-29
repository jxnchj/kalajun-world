import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const source=readFileSync(new URL('./spruce-gpu-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
test('actual worker reports separate build/packing durations and unchanged transfer buffers',()=>{
 for(const packing of[false,true]){let now=5;const sent=[],packet={frames:new Float32Array(2),variations:new Float32Array(3),wood:new Float32Array(4),sharedVariations:new Float32Array(2),variationKeys:new Int16Array(1)},packed={...packet,frames:new Float32Array(1)},self={postMessage:(...args)=>sent.push(args)};
  new Function('self','performance','buildBrushPacket','precomputeBrushPacket',source)(self,{now:()=>now},records=>{assert.deepEqual(records,[42]);now+=7;return packet;},p=>{assert.strictEqual(p,packet);now+=4;return packed;});
  self.onmessage({data:{id:8,records:[42],packing}});assert.equal(sent.length,1);const [out,transfer]=sent[0];assert.equal(out.id,8);assert.strictEqual(out.packet,packing?packed:packet);assert.deepEqual(out.timing,{generateMs:7,packingMs:packing?4:0});assert.deepEqual(transfer,[out.packet.frames.buffer,packet.variations.buffer,packet.wood.buffer,packet.sharedVariations.buffer,packet.variationKeys.buffer]);
 }
});
test('worker failure reports no successful packet or fabricated timing',()=>{const sent=[],self={postMessage:v=>sent.push(v)};new Function('self','performance','buildBrushPacket','precomputeBrushPacket',source)(self,{now:()=>0},()=>{throw Error('broken');},()=>{});self.onmessage({data:{id:9,records:[]}});assert.equal(sent.length,1);assert.match(sent[0].error,/broken/);assert.equal(sent[0].id,9);assert.equal(sent[0].packet,undefined);assert.equal(sent[0].timing,undefined);});
