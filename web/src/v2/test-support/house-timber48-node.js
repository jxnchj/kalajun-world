import assert from 'node:assert/strict';
import {HOUSE_TIMBER48_ENTITY} from '../house-timber48.js';
import {timberLinearMean48} from '../house-timber-textures48.js';
// Node physics tests use real source fields/geometry. Pixels remain mocked just
// like their existing createImageBitmap stubs; this is not a visual acceptance.
import {readFile} from 'node:fs/promises';
import {Texture,DataArrayTexture,DataTexture} from 'three';
export const houseTimberNodeOptions48={
 load:async()=>JSON.parse(await readFile(new URL('../../../public/assets/v2/house-timber48/fields.json',import.meta.url),'utf8')),
 textureLoader:async()=>new Texture(),
 combineTextures:()=>{
  const color=new DataArrayTexture();
  // Same 128-grey pixel stub as the canvas below: this only supplies the
  // required linear-mean field, not decoded source-image or visual evidence.
  color.userData.linearMean48=timberLinearMean48(new Uint8ClampedArray([128,128,128,255]));
  return {color,numeric:new DataTexture()};
 },
};
export const houseFurnitureNodeOptions58={
 load:async()=>JSON.parse(await readFile(new URL('../../../public/assets/v2/house-furniture58/fields.json',import.meta.url),'utf8')),
};
export function installHouseTimberNodeCanvas48(){
 if(globalThis.document)return;
 // Original GLTF bitmap stubs have no decoded pixels. Permit source-mean reads
 // only; no DOM UI or production image decoding is simulated here.
 globalThis.document={querySelector:()=>null,createElement(tag){if(tag!=='canvas')throw Error('Unexpected Node DOM request '+tag);return {width:0,height:0,getContext(){return {drawImage(){},getImageData(){return {data:new Uint8ClampedArray([128,128,128,255])};}};}};}};
}

export function assertDefaultHouseTimber48(owner){if(!owner.world.entities.some(e=>e.id===HOUSE_TIMBER48_ENTITY))return;assert.equal(owner.houseTimber48,true);assert.equal(owner._houseTimber48?.stats.enabled,true);assert.equal(owner._houseTimber48.stats.entityId,HOUSE_TIMBER48_ENTITY);assert.equal(owner._houseTimber48.stats.nodes,159);assert.equal(owner._houseTimber48.stats.vertices,69295);assert.ok(owner._templates.get('house_a:').some(p=>p.geometry.hasAttribute('aHouseTimber48')));}

export function assertDefaultHouseFurniture58(owner){
 if(!owner.world.entities.some(e=>e.id===HOUSE_TIMBER48_ENTITY&&e.assetId==='house_a'))return;
 assert.equal(owner.houseFurniture58,true);assert.equal(owner._houseFurniture58?.stats.enabled,true);
 assert.equal(owner._houseFurniture58.stats.entityId,HOUSE_TIMBER48_ENTITY);
 assert.equal(owner._houseFurniture58.stats.nodes,6);assert.equal(owner._houseFurniture58.stats.vertices,10800);
 assert.equal(owner._houseFurniture58.stats.sourceGeometryChanged,false);
 assert.strictEqual(owner._houseFurniture58.textures,owner._houseTimber48.textures);
 assert.ok(owner._templates.get('house_a:').some(p=>p.geometry.hasAttribute('aHouseFurniture58')));
}
