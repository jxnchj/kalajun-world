import test from 'node:test';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import * as THREE from 'three';
import {createSpruceLoader} from './spruce-loading.js';import {createVolumeSpruceFoliage,createFarSpruceVolumeGeometry,applySpruceVolume,indexSpruceVolume} from './spruce-volume.js';import {createFarSpruceGeometry,SPRUCE_SPEC,spruceRadius} from './spruce-geometry.js';import {createNearShell} from './spruce-near-shell.js';import {deriveBranchDetail} from './spruce-branch-detail.js';import {configureSpruceMaterial,installNeedleSurface,needleOptics} from './spruce-material.js';import {installGpuNeedleStations} from './spruce-gpu-stations.js';import {attachEcologyWind} from './ecology.js';
const loader=createSpruceLoader();loader.register(()=>({name:'TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const load=async lod=>{const b=await readFile(new URL('../../public/assets/v2/schrenk-spruce-'+lod+'.glb',import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};const hi=await load('hi'),mid=await load('mid'),recipe=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url))));
const uvArea=g=>{const u=g.attributes.uv,ix=g.index?.array||Array.from({length:u.count},(_,i)=>i);let total=0;for(let j=0;j<ix.length;j+=3){const[a,b,c]=ix.slice(j,j+3);total+=Math.abs((u.getX(b)-u.getX(a))*(u.getY(c)-u.getY(a))-(u.getY(b)-u.getY(a))*(u.getX(c)-u.getX(a)))/2;}return total;};
const moments=g=>{const u=g.attributes.uv,ix=g.index?.array||Array.from({length:u.count},(_,i)=>i),sum=[0,0,0,0];for(let j=0;j<ix.length;j+=3){const[a,b,c]=ix.slice(j,j+3),area=Math.abs((u.getX(b)-u.getX(a))*(u.getY(c)-u.getY(a))-(u.getY(b)-u.getY(a))*(u.getX(c)-u.getX(a)))/2;for(let k=0;k<4;k++){const attr=g.attributes[k<3?'_plant_wind':'_crown_occlusion'],component=k<3?k:0;sum[k]+=area*(attr.array[a*attr.itemSize+component]+attr.array[b*attr.itemSize+component]+attr.array[c*attr.itemSize+component])/3;}}return sum;};
test('v13 branch volume partitions every UV triangle, preserves endpoints, wind/AO and finite bounded normals',()=>{
 for(const[source,isMid]of[[hi,false],[mid,true]])for(const name of Object.keys(recipe.forms)){
  const old=source.scene.getObjectByName(name+'_frond').geometry,copy=old.attributes.position.array.slice(),g=createVolumeSpruceFoliage(old,{mid:isMid});assert.deepEqual(old.attributes.position.array,copy);const ma=moments(old),mb=moments(g);for(let k=0;k<4;k++)assert.ok(Math.abs(ma[k]-mb[k])<Math.max(1e-5,Math.abs(ma[k])*1e-7),'UV-weighted wind/AO field preserved');assert.equal(g.userData.clusters,recipe.forms[name].sourceTriangles.length);assert.ok(Math.abs(uvArea(g)-uvArea(old))<3e-5);assert.ok(g.userData.maxShift>.1&&g.userData.maxShift<.34);
  const ends=new Map();for(let i=0;i<old.attributes.position.count;i++){const v=old.attributes.uv.getY(i);if(v===0||v===1){const key=Array.from(copy.subarray(i*3,i*3+3)).join(',');ends.set(key,true);}}
  for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));for(let i=0;i<g.attributes.position.count;i++){const v=g.attributes.uv.getY(i);if(v===0||v===1)assert.ok(ends.has(Array.from(g.attributes.position.array.subarray(i*3,i*3+3)).join(',')),'fixed root/tip row');const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i);assert.ok(Math.abs(n.length()-1)<2e-6);assert.ok(g.boundingBox.containsPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)));}g.dispose();
 }
});
test('near v13 photos keep the same original needle removals, readiness identities and UV coverage as v12',()=>{
 for(const[name,form]of Object.entries(recipe.forms)){const source=hi.scene.getObjectByName(name+'_frond').geometry,detail=deriveBranchDetail(source,form,Object.keys(recipe.forms).indexOf(name)),old=createNearShell(source,form,{volume:false,branchDetail:detail}),next=createNearShell(source,form,{volume:true,branchDetail:detail});assert.ok(Math.abs(uvArea(old)-uvArea(next))<3e-5);assert.equal(next.attributes.aSprayLod.count,next.attributes.position.count);assert.ok(next.attributes.position.count<old.attributes.position.count,'v13 needs fewer photo vertices than the old 3x3 lower shell');const codes=g=>[...new Set(Array.from({length:g.attributes.aSprayLod.count},(_,i)=>g.attributes.aSprayLod.getW(i)))].sort((a,b)=>a-b);assert.deepEqual(codes(next),codes(old));old.dispose();next.dispose();}
});
test('far v13 keeps all 104 triangles, four layered masses, identical rooted trunk and closed lit seams',()=>{
 const old=createFarSpruceGeometry(),g=createFarSpruceVolumeGeometry({enabled:true}),p=g.attributes.position,n=g.attributes.normal;assert.equal(g.index.count,312);assert.deepEqual(g.index.array,old.index.array);assert.deepEqual(p.array.slice(63*3),old.attributes.position.array.slice(63*3));assert.deepEqual(g.attributes.color.array,old.attributes.color.array);
 for(let j=0;j<=8;j++)for(const a of[p,n])assert.ok(new THREE.Vector3().fromBufferAttribute(a,j*7).distanceTo(new THREE.Vector3().fromBufferAttribute(a,j*7+6))<1e-6);
 for(const form of SPRUCE_SPEC.variants)for(let k=0;k<6;k++){let notches=0;const r=[];for(let j=0;j<=8;j++){const i=j*7+k,t=p.getY(i)/18,y=form.base+(18-form.base)*t,radius=spruceRadius(form,y),len=Math.hypot(p.getX(i),p.getZ(i)),asym=1+form.side*p.getX(i)/len,world=new THREE.Vector3(p.getX(i)*radius*asym+form.lean*y,y,p.getZ(i)*radius*asym);assert.ok(g.boundingBox.containsPoint(world));r.push(len*radius);}for(let j=1;j<8;j++)if(r[j]<r[j-1]&&r[j]<r[j+1])notches++;assert.ok(notches>=2);}
 old.dispose();g.dispose();
});
test('station optics is a uniform-only lighting A/B: no geometry, alpha, attribute or shadow changes',()=>{
 for(const depth of[false,true]){const m=depth?new THREE.MeshDepthMaterial({alphaTest:.45}):configureSpruceMaterial(new THREE.MeshStandardMaterial({alphaTest:.45,normalMap:new THREE.Texture()}));attachEcologyWind(m,{},12,false,true);if(!depth)installNeedleSurface(m);installGpuNeedleStations(m,{branches:true});const shader={uniforms:{},vertexShader:THREE.ShaderLib[depth?'depth':'standard'].vertexShader,fragmentShader:THREE.ShaderLib[depth?'depth':'standard'].fragmentShader};m.onBeforeCompile(shader);assert.doesNotMatch(shader.fragmentShader,/[^\s]#(?:if|else|endif)/);assert.match(shader.vertexShader,/side\*\(corner==0\?-.00115:.00115\)/);assert.equal(m.alphaTest,.45);assert.equal(m.alphaToCoverage,false);const slots=[...shader.vertexShader.matchAll(/attribute \w+ ([^;]+);/g)].reduce((n,m)=>n+m[1].split(',').length,0);assert.equal(slots,7,'same v12 station/root attributes');assert.equal(slots+4+3,14,'including mat4 and conservative inactive Three defaults');if(!depth){assert.strictEqual(shader.uniforms.uNeedleOptics,needleOptics);assert.match(shader.fragmentShader,/float needleSpan=fwidth/);assert.match(shader.fragmentShader,/normal=normalize\(nonPerturbedNormal\*sqrt/);assert.match(shader.fragmentShader,/roughnessFactor=max/);assert.match(shader.vertexShader,/varying vec2 vNeedleSection/);}else{assert.doesNotMatch(shader.vertexShader,/vNeedleSection/);assert.doesNotMatch(shader.fragmentShader,/uNeedleOptics/);}m.normalMap?.dispose();m.dispose();}
});

test('complete-attribute indexing reproduces every old candidate triangle corner bit for bit in colour and depth geometry',()=>{
 for(const[source,isMid]of[[hi,false],[mid,true]])for(const[name,form]of Object.entries(recipe.forms)){
  const g=source.scene.getObjectByName(name+'_frond').geometry;
  for(const near of isMid?[false]:[false,true]){
   const options={mid:isMid,...(near?{form,branchDetail:deriveBranchDetail(g,form,Object.keys(recipe.forms).indexOf(name))}:{})},old=createVolumeSpruceFoliage(g,{...options,optimize:false}),next=createVolumeSpruceFoliage(g,options),roundtrip=next.toNonIndexed();
   assert.ok(next.index);assert.ok(next.attributes.position.count<old.attributes.position.count*.5);assert.equal(next.index.count,old.attributes.position.count,'no merge may lose a non-affine original wind/AO control point');
   for(const[name,a]of Object.entries(old.attributes))assert.deepEqual(new Uint8Array(roundtrip.attributes[name].array.buffer),new Uint8Array(a.array.buffer),name+' triangle corners remain bit-exact');
   assert.ok(next.boundingBox.equals(old.boundingBox));assert.ok(next.boundingSphere.equals(old.boundingSphere));assert.equal(next.userData.clusters,old.userData.clusters);
   const object=new THREE.Mesh(next,new THREE.MeshStandardMaterial());object.customDepthMaterial=new THREE.MeshDepthMaterial();assert.strictEqual(object.geometry.index,next.index,'colour/shadow share the exact indexed geometry');object.material.dispose();object.customDepthMaterial.dispose();old.dispose();next.dispose();roundtrip.dispose();
  }
 }
});
test('only an attribute-affine coplanar split can merge; UV and wind/AO discontinuities remain vertices',()=>{
 const build=()=>{const g=new THREE.BufferGeometry(),points=[[0,1,0],[-1,0,0],[0,0,0],[0,1,0],[0,0,0],[1,0,0]];g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setAttribute('normal',new THREE.Float32BufferAttribute(points.flatMap(()=>[0,0,1]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(points.flatMap(p=>[(p[0]+1)/2,p[1]]),2));g.setAttribute('_plant_wind',new THREE.Float32BufferAttribute(points.flatMap(p=>[p[1],.2,.4]),3));g.setAttribute('_crown_occlusion',new THREE.Float32BufferAttribute(points.map(()=>.6),1));return g;};
 const g=build(),r=indexSpruceVolume(g,[[0,6]]);assert.equal(g.index.count,3);assert.equal(g.attributes.position.count,3);assert.equal(r.coplanarTrianglesRemoved,1);assert.ok(Object.values(r.maximumMergeAttributeError).every(x=>x<1e-6));g.dispose();
 for(const name of['uv','_plant_wind','_crown_occlusion']){const g=build(),a=g.attributes[name];a.setX(2,a.getX(2)+.02);a.setX(4,a.getX(4)+.02);const report=indexSpruceVolume(g,[[0,6]]);assert.equal(report.coplanarTrianglesRemoved,0,name+' is part of the complete interpolation contract');assert.equal(g.index.count,6);g.dispose();}
});

test('cold-build reuse preserves all 15 crowns, every typed attribute/index and bounds exactly',()=>{
 for(const lod of ['hi','mid','near'])for(const [i,[name,form]]of Object.entries(recipe.forms).entries()){
  const source=(lod==='mid'?mid:hi).scene.getObjectByName(name+'_frond').geometry;
  const options={mid:lod==='mid',...(lod==='near'?{form,branchDetail:deriveBranchDetail(source,form,i)}:{})};
  const original=createVolumeSpruceFoliage(source,{...options,reuse:false}),shared=createVolumeSpruceFoliage(source,{...options,reuse:true});
  for(const key of [...Object.keys(original.attributes),'index']){
   const a=key==='index'?original.index:original.attributes[key],b=key==='index'?shared.index:shared.attributes[key];
   assert.equal(a.array.constructor,b.array.constructor);assert.equal(a.itemSize,b.itemSize);assert.equal(a.normalized,b.normalized);
   assert.deepEqual(new Uint8Array(b.array.buffer,b.array.byteOffset,b.array.byteLength),new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),lod+'/'+name+'/'+key);
  }
  assert.deepEqual(shared.userData,original.userData);assert.ok(shared.boundingBox.equals(original.boundingBox));assert.ok(shared.boundingSphere.equals(original.boundingSphere));original.dispose();shared.dispose();
 }
});

// Captured from the complete round-35 output before changing index storage.
// A non-indexed comparison alone would miss changed row/index ordering.
test('v36 dense indexing retains all 15 round-35 attribute and index byte streams',()=>{
 const expected={
  "hi/column": "e9b713e9846ef795b46cb77d6abbf3bece0ea1ebfd328fe3c5fed8531fe98339",
  "hi/edge": "33bb5f4bc56978fca96cddb492488c9d8c8238bda0849cf6d96265784d725848",
  "hi/old": "34a02a95fd8f0e9fda0cee5ec779eb72899ee29e1aa742705857ac24ffd2b557",
  "hi/pencil": "121ab5988d93b9fe4f37bdde870086f5f30190c6f3a29dcd398f6cfd72471556",
  "hi/young": "dccdc9453f53cd6edbc19ecd1a2ded215b6b0b343b18610eb7ca07e08b9b2329",
  "mid/column": "fc00b9ada84df8ff8b0c11f86ab71d60241c8eecbe0e1340f09579b27a0e981f",
  "mid/edge": "54cd211fcc3b921070e94855876911d3ca046d2a35ca564019f18db649e744d7",
  "mid/old": "d1f3a5f81be9f0647be7233a665d56ae030187f7724e7925a163d205107579e2",
  "mid/pencil": "e6e2e4d0f4bc2abf1a7d23e05b7cfa5684a9158b24a22ca18db13eaf74462e6f",
  "mid/young": "93c3e568f2f85b981a4ead07884b149085ad8f76f5a547b31a9eca3ce146b5f7",
  "near/column": "e02a5bb6e954f4cd97ab643f70ddac820bd9b0e9d701bfd83408cad5ad10328a",
  "near/edge": "1e51bad1b0012be8121e2fded75e8ec78d50bab3fb90d62fbdad2f3c1728ad8e",
  "near/old": "4dc76edabb4d14848365cb7b908638885cd315467bd6470faf297e70e058383e",
  "near/pencil": "37501c854d28428a590878dddab97d80c992d0503469b9fd2dd0eddd1f6cbbf4",
  "near/young": "fde99e0f726d00c9980852a7dffc55724c5ab281dc6c1139df068f56d038a233"
};
 for(const lod of ['hi','mid','near'])for(const [i,[name,form]]of Object.entries(recipe.forms).entries()){
  const source=(lod==='mid'?mid:hi).scene.getObjectByName(name+'_frond').geometry;
  const options={mid:lod==='mid',...(lod==='near'?{form,branchDetail:deriveBranchDetail(source,form,i)}:{})};
  const g=createVolumeSpruceFoliage(source,options),hash=createHash('sha256');
  for(const key of [...Object.keys(g.attributes).sort(),'index']){
   const a=key==='index'?g.index:g.attributes[key];hash.update(key);hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  }
  assert.equal(hash.digest('hex'),expected[lod+'/'+name],lod+'/'+name+' preserves exact geometry, normals, UV, wind, occlusion, readiness and index order');g.dispose();
 }
});
