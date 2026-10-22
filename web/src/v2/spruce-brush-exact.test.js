import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createSpruceLoader} from './spruce-loading.js';
import {deriveBranchDetail} from './spruce-branch-detail.js';
import {buildBrushPacket} from './spruce-brush-packet.js';
import digests from './fixtures/spruce-packet-v19-digests.json' with {type:'json'};

test('complete five-form compact packets remain byte-identical to v19, including lazy branch variations',async()=>{
 const root=new URL('../../public/assets/v2/',import.meta.url);
 const recipe=JSON.parse(gunzipSync(await readFile(new URL('schrenk-spruce-needle.recipe.json.gz',root))));
 const loader=createSpruceLoader();loader.register(()=>({name:'TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const bytes=await readFile(new URL('schrenk-spruce-hi.glb',root));
 const hi=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 for(const [i,form]of ['column','edge','old','pencil','young'].entries()){
  const detail=deriveBranchDetail(hi.scene.getObjectByName(form+'_frond').geometry,recipe.forms[form],i),variants=new Map();
  for(const r of detail.extras)if(!variants.has(r.variationKey))variants.set(r.variationKey,r);
  const packet=buildBrushPacket([...detail.instances.slice(0,detail.originalBrushes),...variants.values()]);
  for(const [key,expected]of Object.entries(digests[form])){
   const array=packet[key];assert.equal(array.constructor.name,expected.type);assert.equal(array.length,expected.length);
   const hash=createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
   assert.equal(hash,expected.sha256,form+'/'+key);
  }
 }
});
