import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {houseFurniture58Enabled,HOUSE_FURNITURE58_NAMES,prepareHouseFurniture58,installHouseFurniture58} from './house-furniture-timber58.js';
import {installHouseTimber48,HOUSE_TIMBER48_ENTITY} from './house-timber48.js';
const bytes=fs.readFileSync(new URL('../../public/assets/v2/house_a_lived.glb',import.meta.url));globalThis.self=globalThis;
async function source(){const loader=new GLTFLoader();loader.register(()=>({name:'texture-test',loadTexture:()=>Promise.resolve(new T.Texture())}));return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;}
const world={entities:[{assetId:'house_a',id:HOUSE_TIMBER48_ENTITY}]};
const hash=async a=>Buffer.from(await crypto.subtle.digest('SHA-256',new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))).toString('hex');
async function bindingFixture(scene){const data=JSON.parse(fs.readFileSync(new URL('../../public/assets/v2/house-furniture58/fields.json',import.meta.url)));for(const name of HOUSE_FURNITURE58_NAMES)assert.ok(scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(name)),'actual source '+name);return data;}
function timber(scene){const materials=new Set(HOUSE_FURNITURE58_NAMES.map(n=>scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(n)).material)),color=new T.DataArrayTexture(),numeric=new T.DataTexture();color.userData.linearMean48=[.25,.25,.25];return{materials,textures:{color,numeric},anchors:[new T.Vector3(),new T.Vector3()],data:{materialFactors:{}},stats:{}};}
test('OFF path does no load and source binding validates all six actual objects before publication',async()=>{
 assert.equal(houseFurniture58Enabled(''),true);assert.equal(houseFurniture58Enabled('?houseFurniture58=0'),false);assert.equal(houseFurniture58Enabled('?houseTimber48=0'),false);assert.equal(houseFurniture58Enabled('',false),false);assert.equal(houseFurniture58Enabled('?houseFurniture58=1',false),true);assert.equal(houseFurniture58Enabled('?houseFurniture58=1'),true);assert.equal(houseFurniture58Enabled('?houseFurniture58=bad'),false);
 const scene=await source(),parent=timber(scene),data=await bindingFixture(scene);
 assert.equal(await prepareHouseFurniture58('house_a',scene,world,{enabled:false,load:()=>{throw Error('must not load')}}),null);
 scene.getObjectByName(HOUSE_FURNITURE58_NAMES.at(-1).replace('.','')).geometry.attributes.uv.setX(0,9);
 await assert.rejects(prepareHouseFurniture58('house_a',scene,world,{enabled:true,timberOwner:parent,load:async()=>data}),/original buffer/);
 scene.traverse(m=>{if(m.isMesh)assert.equal(m.geometry.hasAttribute('aHouseFurniture58'),false);});
 parent.textures.color.dispose();parent.textures.numeric.dispose();
});
test('exported Blender fields on real GLB preserve all source buffers and borrowed texture lifetime; not browser art acceptance',async()=>{
 const scene=await source(),parent=timber(scene),data=await bindingFixture(scene),old=new Map();
 scene.traverse(m=>{if(m.isMesh)old.set(m,{index:m.geometry.index.array.slice(),attrs:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,v.array.slice()]))});});
 const owner=await prepareHouseFurniture58('house_a',scene,world,{enabled:true,timberOwner:parent,load:async()=>data});assert.equal(owner.stats.nodes,6);assert.equal(owner.stats.vertices,10800);
 for(const [m,s]of old){assert.deepEqual(m.geometry.index.array,s.index);for(const [k,a]of Object.entries(s.attrs))assert.deepEqual(m.geometry.attributes[k].array,a);assert.ok(m.geometry.hasAttribute('aHouseFurniture58'));}
 let disposed=0;for(const t of Object.values(parent.textures))t.addEventListener('dispose',()=>disposed++);owner.dispose();assert.equal(disposed,0);parent.textures.color.dispose();parent.textures.numeric.dispose();
});
test('accepted timber48 chain shares its two samplers, retains AO and applies furniture after existing timber',async()=>{
 const scene=await source(),parent=timber(scene),data=await bindingFixture(scene),owner=await prepareHouseFurniture58('house_a',scene,world,{enabled:true,timberOwner:parent,load:async()=>data});
 for(const source of owner.materials){
  const material=source.clone();installHouseTimber48(material,source,parent);installHouseFurniture58(material,source,owner,{sourceMean:()=>[.3,.2,.1]});
  const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};material.onBeforeCompile(s,{});
  assert.equal((s.fragmentShader.match(/uniform highp sampler2DArray uHouseWood48;/g)||[]).length,1);assert.equal((s.fragmentShader.match(/uniform sampler2D uHouseNumeric48;/g)||[]).length,1);
  assert.equal(s.uniforms.uHouseWood48.value,parent.textures.color);assert.equal(s.uniforms.uHouseNumeric48.value,parent.textures.numeric);
  assert.ok(s.fragmentShader.indexOf('uniform sampler2D uHouseNumeric48')<s.fragmentShader.indexOf('vec3 furnitureNormal58'));
  assert.ok(s.fragmentShader.indexOf('diffuseColor.rgb=diffuse*uFurnitureBase58')>s.fragmentShader.indexOf('diffuseColor.rgb=diffuse*wood'));
  assert.ok(s.fragmentShader.includes('#include <aomap_fragment>'));assert.ok(s.fragmentShader.includes('#include <color_fragment>'));
  assert.ok(s.vertexShader.includes('vFurnitureTarget58=distance'));material.dispose();
 }
 parent.textures.color.dispose();parent.textures.numeric.dispose();
});

test('actual exported components retain original joinery axes instead of PCA guesses',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../../assets/src/v2/pastoral/furniture58/house-a-furniture58-coordinates.json',import.meta.url)));
 assert.equal(data.objects.length,6);assert.equal(data.objects.reduce((n,o)=>n+o.components.length,0),50);
 const body=data.objects.find(o=>o.name==='pastoral_house_chest_body'),lid=data.objects.find(o=>o.name==='pastoral_house_chest_lid');
 assert.equal(body.components.length,16);assert.equal(lid.components.length,5);
 for(const o of data.objects)for(const c of o.components){assert.ok([0,1,2].includes(c.axisIndex));assert.equal(Math.abs(c.axis[c.axisIndex]),1);}
 assert.deepEqual(lid.components.map(c=>c.axisIndex).sort(),[0,0,0,1,1]);
 assert.equal(body.components.filter(c=>c.axisIndex===2).length,8,'four posts and four vertical recessed panels');
 assert.equal(body.components.filter(c=>c.axisIndex===1).length,2,'two actual side panels');
});
