import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {WorldEcology,TREE_NEEDLES,treeLodMayContribute,attachEcologyWind} from "./ecology.js";
import {configureSpruceMaterial} from "./spruce-material.js";
import {SunShadowCasters} from "./sun-shadow-casters.js";
const world=()=>({entities:[],objects:{},landcoverAt:()=>({r:1,g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}});
const sm=(a,b,d)=>{const t=Math.max(0,Math.min(1,(d-a)/(b-a)));return t*t*(3-2*t);};
const accept=(mode,d,n)=>{
 const needle=1-sm(9,15,d),hi=1-sm(42,62,d),mid=1-sm(165,235,d);
 return mode===12?n<needle:mode===5?n>=needle&&n<hi:mode===1?n>=hi&&n<mid:n>=mid;
};
const compile=(material,depth=false)=>{const lib=depth?THREE.ShaderLib.depth:THREE.ShaderLib.standard,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(s);return s;};
function templates(eco){
 for(const mode of [5,1,12])for(let variant=0;variant<5;variant++)for(let part=0;part<3;part++){
  const geometry=new THREE.BoxGeometry(1,18,1);geometry.translate(0,9,0);
  const material=attachEcologyWind(configureSpruceMaterial(new THREE.MeshStandardMaterial()),eco.uniforms,mode,false,true);
  const depth=attachEcologyWind(configureSpruceMaterial(new THREE.MeshDepthMaterial()),eco.uniforms,mode,false,true);
  const mesh=new THREE.InstancedMesh(geometry,material,mode===12?64:1600);mesh.count=0;mesh.customDepthMaterial=depth;
  eco.nearParts.push({variant,mode,mesh});eco.materials.push(material);
 }
}
test("needle and high LODs partition the same threshold without changing former outer transitions",()=>{
 assert.deepEqual(TREE_NEEDLES,{mode:12,start:9,end:15,prefetch:28});
 for(let i=0;i<=4700;i++){
  const d=i/20,needle=1-sm(9,15,d),hi=1-sm(42,62,d),mid=1-sm(165,235,d);
  for(const n of [0,Number.EPSILON,.001,.1,.3,.5,.8,.999999,needle,hi,mid].filter(n=>n<1)){
   assert.equal([12,5,1,0].filter(mode=>accept(mode,d,n)).length,1,"uncovered or double coverage at "+d+"/"+n);
   if(d>=15)assert.equal(accept(5,d,n),n<hi,"legacy high outer coverage changed");
  }
 }
 const eco=new WorldEcology(world());
 for(const mode of [12,5,1]){
  const color=attachEcologyWind(configureSpruceMaterial(new THREE.MeshStandardMaterial()),eco.uniforms,mode,false,true);
  const depth=attachEcologyWind(configureSpruceMaterial(new THREE.MeshDepthMaterial()),eco.uniforms,mode,false,true);
  const a=compile(color),b=compile(depth,true),dither=s=>s.slice(s.indexOf("float n=fract"),s.indexOf("#include <alphahash_fragment>"));
  assert.equal(dither(a.fragmentShader),dither(b.fragmentShader));
  assert.match(a.fragmentShader,/needleTree=1\.-smoothstep\(9\.0,15\.0,vPlantDistance\)/);
  assert.match(a.fragmentShader,/if\(n<needleTree \|\| n>=nearTree\) discard/);
  assert.match(a.fragmentShader,/else \{ if\(n>=needleTree\) discard; \}/);
  assert.strictEqual(a.uniforms.uWorldViewer,b.uniforms.uWorldViewer);
  assert.strictEqual(a.uniforms.uWindTime,b.uniforms.uWindTime);
  assert.match(a.vertexShader,/uPlantMode>9.5 && uPlantMode<11.5\)return vec2\(0\.\)/);
  assert.match(a.vertexShader,/uPlantMode>11.5\) \{\n    float h=/,"near needles use the same trunk/branch bend");
  assert.match(a.vertexShader,/uPlantMode<11.5 && \(uPlantMode<4.5/,"near needles must not get herb-only vertical sag");
  color.dispose();depth.dispose();
 }
 eco.dispose();
});
test("needle resident pools retain roots, share forces and re-enter at sub-metre boundaries for all passes",()=>{
 const eco=new WorldEcology(world());templates(eco);
 const root={id:"spruce:-9:-9",x:-97,y:100,z:-97,s:1.1,rot:.27,variant:0};
 eco.treeAt=(ix,iz)=>ix===-9&&iz===-9?root:null;
 const cam=new THREE.PerspectiveCamera(55,1,.1,1000);cam.position.set(root.x-12,101.8,root.z);cam.lookAt(root.x,108,root.z);cam.updateMatrixWorld(true);
 eco.uniforms.uWorldViewer.value.copy(cam.position);eco.rebuildNearTrees(cam);
 const batches=[...eco.nearTreeBatches.values()],near=batches.filter(b=>b.mode===12),hi=batches.filter(b=>b.mode===5);
 assert.equal(near.length,3);assert.equal(hi.length,3);
 assert.equal(eco.stats.treeNeedleActiveRoots,1);assert.equal(eco.stats.treeNeedleActiveInstances,3);assert.equal(eco.stats.treeNeedleTriangles,36);
 const allocations=[...eco.treeRootWind.allocations.values()],buffers=batches.map(b=>b.mesh.instanceMatrix.array);
 const update=(distance,time)=>{
  cam.position.x=root.x-distance;eco.uniforms.uWorldViewer.value.copy(cam.position);eco.syncActiveTrees(cam);
  eco.windField.update(time,cam.position);eco.treeRootWind.update(eco.nearTreeBatches,eco.windField,time,eco.treeBatchRevision);
  const expectedNear=treeLodMayContribute(12,root,cam.position),expectedHi=treeLodMayContribute(5,root,cam.position);
  for(const b of batches){assert.equal(b.mesh.count,b.mode===12?Number(expectedNear):Number(expectedHi));assert.strictEqual(b.records[0],root);}
  if(expectedNear&&expectedHi){
   assert.deepEqual(Array.from(near[0].mesh.geometry.attributes.aTreeRootWind.data.array.subarray(0,5)),Array.from(hi[0].mesh.geometry.attributes.aTreeRootWind.data.array.subarray(0,5)));
   assert.equal(eco.treeRootWind.stats.roots,1,"overlap samples each root only once");
  }
  assert.strictEqual(near[0].mesh.geometry.attributes.aTreeRootWind.data,near[1].mesh.geometry.attributes.aTreeRootWind.data);
  assert.equal(eco.treeRootWind.stats.batches,Number(expectedNear)+Number(expectedHi));
 };
 update(12,1);
 const scene=new THREE.Scene();scene.add(eco.group);const light=new THREE.DirectionalLight();light.position.set(-97,230,-97);light.target.position.set(-97,100,-97);
 Object.assign(light.shadow.camera,{left:-100,right:100,top:100,bottom:-100,far:500});scene.add(light,light.target);
 const tracker=new SunShadowCasters(scene,[light]);tracker.update(cam);assert.equal(tracker.update(cam).changed[0],false);
 const revision=eco.treeBatchRevision,versions=batches.map(b=>b.mesh.instanceMatrix.version);
 eco.syncActiveTrees(cam);assert.equal(eco.treeBatchRevision,revision);assert.deepEqual(batches.map(b=>b.mesh.instanceMatrix.version),versions);
 update(15.001,2);assert.equal(eco.stats.treeNeedleActiveInstances,0);assert.equal(tracker.update(cam).changed[0],true);
 update(14.999,3);assert.equal(eco.stats.treeNeedleActiveInstances,3);assert.equal(tracker.update(cam).changed[0],true);
 update(9.001,4);assert.equal(eco.stats.treeHighActiveInstances,3);
 update(8.999,5);assert.equal(eco.stats.treeHighActiveInstances,0);assert.equal(tracker.update(cam).changed[0],true);
 update(9.001,6);assert.equal(eco.stats.treeHighActiveInstances,3);
 update(12,7);assert.deepEqual(batches.map(b=>b.mesh.instanceMatrix.array),buffers);
 const reflected=cam.clone();reflected.position.y=200-cam.position.y;reflected.lookAt(root.x,108,root.z);reflected.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(reflected.projectionMatrix,reflected.matrixWorldInverse));scene.updateMatrixWorld(true);
 assert.equal(near[0].mesh.intersectsFrustum(frustum),true);
 assert.equal(compile(near[0].mesh.material).uniforms.uWorldViewer.value.y,cam.position.y,"mirror cannot change main-viewer LOD");
 tracker.dispose();eco.dispose();
 for(const allocation of allocations)assert.equal(allocation.references,0);
 assert.equal(eco.treeRootWind.allocations.size,0);
});
test("28 metre prefetch covers every possible active needle root until the existing 12 metre rebuild",()=>{
 assert.ok(TREE_NEEDLES.prefetch>TREE_NEEDLES.end+12);
 const eco=new WorldEcology(world());templates(eco);
 const cam={position:new THREE.Vector3(-96,101.8,-96)};eco.rebuildNearTrees(cam);
 const source=[];
 for(let iz=-12;iz<=-4;iz++)for(let ix=-12;ix<=-4;ix++){const p=eco.treeAt(ix,iz);if(p)source.push(p);}
 const resident=new Set([...eco.nearTreeBatches.values()].filter(b=>b.mode===12).flatMap(b=>b.records.map(r=>r.id)));
 for(const [dx,dz]of [[0,0],[12,0],[-12,0],[0,12],[0,-12],[8.48,-8.48]]){
  const viewer={x:cam.position.x+dx,z:cam.position.z+dz};
  for(const p of source)if(treeLodMayContribute(12,p,viewer))assert.ok(resident.has(p.id),"visible root was outside prefetch: "+p.id);
 }
 eco.dispose();
});
