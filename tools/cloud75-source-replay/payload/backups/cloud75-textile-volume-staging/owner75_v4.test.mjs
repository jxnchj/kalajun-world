// Run only after resource release and generation. Missing staged files fail; never skip.
import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import * as T from '../../web/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {HOUSE_TEXTILES62_NAMES,prepareHouseTextiles62,houseTextiles62Enabled} from '../../web/src/v2/house-textiles62.js';
globalThis.self=globalThis;
const base=new URL('../../',import.meta.url);assert.ok(process.env.TEXTILE_CANDIDATE_DIR,'Explicit staged candidate directory required');const target=path.resolve(process.env.TEXTILE_CANDIDATE_DIR);assert.equal(path.dirname(target),fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/,''));const candidate=pathToFileURL(target+'/');const audit=JSON.parse(fs.readFileSync(new URL('audit.json',candidate)));assert.equal(audit.candidateVersion,4);assert.ok(audit.protectedInputsUnchanged);for(const name of ['geometry.glb','manifest.json','textile-volume75.blend'])assert.equal(createHash('sha256').update(fs.readFileSync(new URL(name,candidate))).digest('hex'),audit.outputSHA256[name]);
async function load(url){const l=new GLTFLoader();l.register(()=>({name:'texture-fixture',loadTexture:()=>Promise.resolve(new T.Texture())}));const b=fs.readFileSync(url);return l.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
test('staged volume75 OFF never requests geometry or manifest',async()=>{
 assert.equal(houseTextiles62Enabled(''),false);assert.equal(houseTextiles62Enabled('?houseTextiles62=0'),false);
 const fail=()=>{throw Error('unexpected OFF request');};assert.equal(await prepareHouseTextiles62('house_a',null,{enabled:false,loadAsset:fail,loadManifest:fail}),null);
});
test('staged volume75 nine real owners retain materials and transforms, restore and dispose exactly once',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',candidate)));
 const scene=(await load(new URL('web/public/assets/v2/house_a_lived.glb',base))).scene;
 const before=new Map();scene.traverse(n=>{if(n.isMesh)before.set(n.name,{g:n.geometry,m:n.material,matrix:n.matrix.clone()});});
 const owner=await prepareHouseTextiles62('house_a',scene,{enabled:true,loadManifest:async()=>manifest,loadAsset:()=>load(new URL('geometry.glb',candidate))});
 assert.equal(owner.stats.nodes,9);assert.equal(owner.stats.texturesAdded,0);
 const disposals=new Map(owner.geometries.map(g=>[g,0]));for(const g of disposals.keys())g.addEventListener('dispose',()=>disposals.set(g,disposals.get(g)+1));
 scene.traverse(n=>{if(!n.isMesh)return;const a=before.get(n.name);assert.equal(n.material,a.m);assert.deepEqual(n.matrix,a.matrix);if(HOUSE_TEXTILES62_NAMES.includes(n.name)){assert.notEqual(n.geometry,a.g);assert.ok(n.geometry.index.count);assert.ok(n.geometry.attributes.uv);assert.ok(n.geometry.attributes.color);}else assert.equal(n.geometry,a.g);});
 owner.restore();owner.restore();scene.traverse(n=>{if(n.isMesh)assert.equal(n.geometry,before.get(n.name).g);});for(const count of disposals.values())assert.equal(count,1);
});
