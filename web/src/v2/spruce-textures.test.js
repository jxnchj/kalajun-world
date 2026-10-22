import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {reuseNeedleTextures} from "./spruce-textures.js";

function fixture(){
 const scene=new THREE.Scene(),associations=new Map(),map=new THREE.Texture(),normalMap=new THREE.Texture();
 map.image={width:8,height:4};normalMap.image={width:8,height:4};
 const material=new THREE.MeshStandardMaterial({map,normalMap});material.name="frond";
 associations.set(material,{materials:0});associations.set(map,{textures:0});associations.set(normalMap,{textures:1});
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);scene.add(mesh);
 const payload=[new Uint8Array([7,8,9]),new Uint8Array([1,2,3,4])];
 const json={materials:[{name:"frond",alphaMode:"MASK",alphaCutoff:.45,pbrMetallicRoughness:{baseColorTexture:{index:0}},normalTexture:{index:1}}],
  textures:[{source:0},{source:1}],images:[{bufferView:0,mimeType:"image/png"},{bufferView:1,mimeType:"image/png"}],bufferViews:[{byteLength:3},{byteLength:4}]};
 return{scene,material,map,normalMap,payload,parser:{associations,json,getDependency:async(type,i)=>{assert.equal(type,"bufferView");return payload[i].buffer;}}};
}
test("needle texture reuse needs actual identical bytes and releases each unused copy once",async()=>{
 const hi=fixture(),near=fixture(),old=[near.map,near.normalMap];let disposed=0,closed=0;
 for(const t of old){t.addEventListener("dispose",()=>disposed++);t.image.close=()=>closed++;}
 const stats=await reuseNeedleTextures(hi,near);
 assert.strictEqual(near.material.map,hi.map);assert.strictEqual(near.material.normalMap,hi.normalMap);
 assert.deepEqual(stats,{reusedSlots:2,releasedTextures:2,closedImages:2,duplicateEmbeddedBytes:7,avoidedTextureRGBABytes:344});
 assert.equal(disposed,2);assert.equal(closed,2);
 assert.deepEqual(await reuseNeedleTextures(hi,near),{reusedSlots:0,releasedTextures:0,closedImages:0,duplicateEmbeddedBytes:0,avoidedTextureRGBABytes:0});
});
test("name equality cannot merge changed image bytes, sampler, UV transform or glTF material declarations",async()=>{
 for(const mutate of [
  n=>n.payload[0][1]++,
  n=>n.map.wrapS=THREE.RepeatWrapping,
  n=>n.map.repeat.x=2,
  n=>n.map.channel=1,
  n=>n.map.colorSpace=THREE.SRGBColorSpace,
  n=>n.map.matrix.elements[0]=2,
  n=>n.parser.json.materials[0].alphaCutoff=.5,
  n=>n.parser.json.textures[0].sampler=1
 ]){
  const hi=fixture(),near=fixture();mutate(near);const original=near.material.map;let disposed=0;original.addEventListener("dispose",()=>disposed++);
  await reuseNeedleTextures(hi,near);assert.strictEqual(near.material.map,original);assert.equal(disposed,0);
 }
});
test("a texture still referenced in a mismatched slot or material is not disposed",async()=>{
 const hi=fixture(),near=fixture(),extra=new THREE.MeshStandardMaterial({map:near.map});extra.name="unmatched";
 near.scene.add(new THREE.Mesh(new THREE.BufferGeometry(),extra));let disposed=0;near.map.addEventListener("dispose",()=>disposed++);
 const stats=await reuseNeedleTextures(hi,near);assert.strictEqual(near.material.map,hi.map);assert.strictEqual(extra.map,near.map);
 assert.equal(disposed,0);assert.equal(stats.releasedTextures,1);
});
