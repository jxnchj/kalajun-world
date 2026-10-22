import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {inflateSync} from "node:zlib";
import * as THREE from "three";
import {configureSpruceMaterial,installNeedleSurface} from "./spruce-material.js";
import {attachEcologyWind} from "./ecology.js";
const ROOT=new URL("../../../",import.meta.url),BACKUP="assets/src/v2/spruce/backup-20261019-193321-before-needle-surface/";
const file=p=>readFile(new URL(p,ROOT));
function glb(bytes){
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
 const view=i=>{const v=json.bufferViews[i];return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
 return{json,bin,view};
}
function pixels(bytes){
 let width,height,channels;const chunks=[];
 for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+size);
  if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);channels=d[9]===2?3:4;}if(type==="IDAT")chunks.push(d);p+=size+12;
 }
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,out=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
  const i=y*stride+x,f=raw[y*(stride+1)],a=x>=channels?out[i-channels]:0,b=y?out[i-stride]:0,c=y&&x>=channels?out[i-stride-channels]:0;
  out[i]=(raw[y*(stride+1)+x+1]+(f===0?0:f===1?a:f===2?b:f===3?(a+b)>>1:paeth(a,b,c)))&255;
 }return{width,height,channels,data:out};
}
test("hi surface changes only material relief, retains every trimmed vertex and old image, and adds no triangles",async()=>{
 const old=glb(await file(BACKUP+"schrenk-spruce-hi.glb")),now=glb(await file("web/public/assets/v2/schrenk-spruce-hi.glb"));
 assert.equal(now.json.meshes.length,15);
 for(const mesh of old.json.meshes){
  const next=now.json.meshes.find(m=>m.name===mesh.name);assert.ok(next);
  for(let i=0;i<mesh.primitives.length;i++){
   const a=mesh.primitives[i],b=next.primitives[i];
   assert.deepEqual(Object.keys(b.attributes),Object.keys(a.attributes),"no added per-vertex tangent or lost wind attribute");
   for(const [aa,bb]of [[a.indices,b.indices],...Object.keys(a.attributes).map(k=>[a.attributes[k],b.attributes[k]])]){
    const x=old.json.accessors[aa],y=now.json.accessors[bb];assert.equal(x.count,y.count);assert.equal(x.type,y.type);assert.equal(x.componentType,y.componentType);
    assert.deepEqual(now.view(y.bufferView),old.view(x.bufferView),"all geometry bytes must remain unchanged");
   }
  }
 }
 for(const image of old.json.images){const next=now.json.images.find(i=>i.name===image.name);assert.ok(next);assert.deepEqual(now.view(next.bufferView),old.view(image.bufferView));}
 const leaf=now.json.materials.find(m=>m.name==="frond");
 assert.equal(leaf.alphaMode,"MASK");assert.ok(Math.abs(leaf.alphaCutoff-.45)<1e-6);assert.ok(Math.abs(leaf.normalTexture.scale-.65)<1e-6);
 assert.equal(now.json.images[now.json.textures[leaf.normalTexture.index].source].name,"needle-surface-normal");
 assert.deepEqual(await file("web/public/assets/v2/schrenk-spruce-mid.glb"),await file(BACKUP+"schrenk-spruce-mid.glb"),"mid retains its exact bytes");
 assert.deepEqual(await file("assets/src/v2/spruce/shared-skeleton.json"),await file(BACKUP+"shared-skeleton.json"));
});
test("needle data has bounded slopes, high roughness and distance convergence before any hi/mid blending",async t=>{
 const p=pixels(await file("assets/src/v2/spruce/needle-surface-normal.png"));assert.equal(p.width,1024);assert.equal(p.height,512);assert.equal(p.channels,3);
 let maximum=0,nonflat=0;
 for(let i=0;i<p.data.length;i+=3){
  const x=p.data[i]/127.5-1,y=p.data[i+1]/127.5-1,z=p.data[i+2]/127.5-1;
  assert.ok(z>.97,"no flipped or grazing needle normal");assert.ok(Math.abs(Math.hypot(x,y,z)-1)<.007);
  maximum=Math.max(maximum,Math.atan2(Math.hypot(x*.65,y*.65),z)*180/Math.PI);if(Math.hypot(x,y)>.035)nonflat++;
 }
 assert.ok(maximum<7.2);assert.equal(nonflat,61345,"deterministic non-flat needle texels, with untouched empty atlas area");t.diagnostic("bounded applied normal tilt "+maximum.toFixed(2)+" degrees; 1024x512 RGB/mipmapped texture, hi only");
 const m=configureSpruceMaterial(new THREE.MeshStandardMaterial({alphaTest:.45,roughness:.88,normalMap:new THREE.Texture(),map:new THREE.Texture()}));
 attachEcologyWind(m,{uWorldViewer:{value:new THREE.Vector3()},uWindTime:{value:1}},5,false,true);installNeedleSurface(m);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/1.-smoothstep\(10.,38.,vPlantDistance\)/);assert.match(shader.fragmentShader,/nonPerturbedNormal/);
 assert.match(shader.fragmentShader,/roughnessFactor\*=mix\(1.,mix\(.96,1.04/);assert.ok(!shader.fragmentShader.includes("fbm"));assert.equal(m.alphaTest,.45);
 assert.ok(m.roughness*.96>.84);m.normalMap.dispose();m.map.dispose();m.dispose();
});
