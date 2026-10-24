import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {actualMeadowEcology} from './profile-meadow-v38.mjs';
import {MEADOW_ROOT_VERSION,sourceCells,encodeMeadowRoots,decodeMeadowRoots} from '../web/src/v2/meadow-root-codec.js';
import {meadowRootInputHashes} from '../web/src/v2/meadow-root-cache.js';
import {meadowRootCodeBinding} from '../web/meadow-root-binding.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),anchors=[[-3611.9813305250705,4805.371282289286],[-2216.832094723869,3361.4050159480757]],tiles=new Map(),sourceProfiles=[];let inputs;
for(const [x,z]of anchors){
 const eco=actualMeadowEcology(),camera={position:eco.uniforms.uWorldViewer.value};camera.position.set(x,eco.world.surface.heightAt(x,z)+1.7,z);
 const t=performance.now();for(let i=0;i<90;i++)eco.updateMeadow(camera,{deferPools:true});eco.publishMeadowPools(camera);
 sourceProfiles.push({x,z,tiles:eco.grassTiles.size,roots:eco.stats.grassTufts,grassOnlyMs:performance.now()-t});
 for(const tile of eco.grassTiles.values()){
  const byId=new Map(tile.list.map(root=>[root.id,root])),slots=sourceCells(tile.tx,tile.tz).map(([ix,iz])=>{
   const root=byId.get('grass:'+ix+':'+iz);if(!root)return null;if(root.brookAsset)return true;
   const fields=new Float32Array(12);fields.set(eco.grassRootField.sample(root),0);fields.set(eco.grassRootField.sampleLandform(root),4);fields.set(eco.grassRootField.sampleCommunity(root),8);return {root:{...root},fields};
  });const key=tile.tx+','+tile.tz,record={tx:tile.tx,tz:tile.tz,slots};if(tiles.has(key))assert.deepEqual(tiles.get(key),record);else tiles.set(key,record);
 }
 const current=await meadowRootInputHashes(eco);if(inputs)assert.deepEqual(current,inputs);else inputs=current;eco.dispose();
}
const records=[...tiles.values()],roots=records.reduce((n,t)=>n+t.slots.filter(s=>s&&s!==true).length,0),procedural=records.reduce((n,t)=>n+t.slots.filter(s=>s===true).length,0),raw=encodeMeadowRoots(records),packed=gzipSync(raw,{level:6});
const manifest={version:MEADOW_ROOT_VERSION,url:'data/v2/meadow-roots-38.bin.gz',code:meadowRootCodeBinding(),inputs,tiles:tiles.size,roots,procedural,rawBytes:raw.length,rawSHA256:sha(raw),gzipBytes:packed.length,sha256:sha(packed),anchors,scope:'Exact ordinary final grass source slots, full JS root values and 12 Float32 field values. Wet geometry slots retain the original generator. Flowers and all ranges remain unchanged.'};
const decoded=await decodeMeadowRoots(raw,manifest);for(const source of records){const actual=decoded.get(source.tx+','+source.tz);assert.deepEqual(actual,source,'Every source slot, null, procedural marker, root property and Float32 bit must match');for(let i=0;i<source.slots.length;i++){const entry=source.slots[i];if(entry&&entry!==true)assert.deepEqual(new Uint8Array(actual.slots[i].fields.buffer),new Uint8Array(entry.fields.buffer));}}
const out=new URL('../web/public/data/v2/',import.meta.url);writeFileSync(new URL('meadow-roots-38.bin.gz',out),packed);writeFileSync(new URL('meadow-roots-38.json',out),JSON.stringify(manifest));
const report={...manifest,code:undefined,inputs:undefined,sourceProfiles,allSourceSlotsAndFieldsEqual:true,sourceSlots:records.reduce((n,t)=>n+t.slots.length,0)};writeFileSync(new URL('reports/meadow-root-cache-v38.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
