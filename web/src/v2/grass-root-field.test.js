import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WebGLAttributes } from "three/src/renderers/webgl/WebGLAttributes.js";
import { WebGLGeometries } from "three/src/renderers/webgl/WebGLGeometries.js";
import { GrassRootField, createGrassFieldGeometry, disposeGrassFieldGeometry, markGrassFieldRendered } from "./grass-root-field.js";
import { meadowFieldPixels, MEADOW_SURFACE, MEADOW_FIELD_MEAN, meadowWorldSamples, sampleMeadowField } from "./meadow-surface.js";
import { WorldEcology } from "./ecology.js";
const world=()=>({entities:[],objects:{},landcoverAt:()=>({r:0,g:0,b:0,a:0}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}});
const camera=(x=0,z=0)=>({position:new THREE.Vector3(x,101.7,z)});
const values=(a,i)=>Array.from(a.array.slice(i*4,i*4+4));
const fieldAtMatrix=(mesh,i)=>{
  const a=mesh.instanceMatrix.array;
  return Array.from(new Float32Array(sampleMeadowField(a[i*16+12],a[i*16+14])));
};

test("grass field caches the aperiodic RGBA8 blend at actual Float32 roots",()=>{
  const sampler=new GrassRootField(),data=meadowFieldPixels(),n=MEADOW_SURFACE.size;
  for(const [x,z]of [[.125,.125],[-.125,-.125],[-128.125,128.125],[0,0],[128,256],[.124999999,.125000001],[40959.9997,-38001.3333],[-1302.1357,1987.9876]]){
    const root={x,z},field=sampler.sample(root),matrix=new Float32Array(16);matrix[12]=x;matrix[14]=z;
    // Independent four-texel interpolation for each world-cell transform.
    // Cache coordinates follow the uploaded Float32 matrix, not double roots.
    const samples=meadowWorldSamples(matrix[12],matrix[14]),raw=[0,0,0,0],macro=[0,0,0,0];
    for(const sample of samples){
      const uv=[sample.x/128,sample.z/128].map(v=>(v-Math.floor(v))*n-.5);
      const lo=uv.map(Math.floor),f=uv.map((v,i)=>v-lo[i]),wrap=v=>(v+n)%n;
      for(let c=0;c<4;c++){
        let value=0;
        for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++)
          value+=data[(wrap(lo[1]+dz)*n+wrap(lo[0]+dx))*4+c]/255*(dx?f[0]:1-f[0])*(dz?f[1]:1-f[1]);
        raw[c]+=value*sample.weight;macro[c]+=sample.seed[c]*sample.weight;
      }
    }
    const gain=1/Math.sqrt(samples.reduce((sum,s)=>sum+s.weight*s.weight,0));
    const reference=raw.map((v,c)=>MEADOW_FIELD_MEAN[c]+(v-MEADOW_FIELD_MEAN[c])*gain);
    reference[0]+=(macro[2]-.5)*.48;reference[2]+=(.5-macro[2])*.24+(macro[3]-.5)*.10;reference[3]+=(macro[0]-.5)*.24;
    reference.forEach((v,c)=>assert.equal(field[c],Math.fround(Math.max(0,Math.min(1,v)))));
    assert.strictEqual(sampler.sample(root),field,"unchanged root reuses one sample");
  }
  assert.equal(sampler.samples,8);
  const root={x:1000,z:2000},before=sampler.sample(root),count=sampler.samples;
  root.x+=1e-7;assert.strictEqual(sampler.sample(root),before);assert.equal(sampler.samples,count);
  root.x+=.5;const moved=sampler.sample(root);assert.notStrictEqual(moved,before);assert.notDeepEqual(moved,before);assert.equal(sampler.samples,count+1);
  sampler.dispose();assert.notStrictEqual(sampler.sample(root),moved);
});

test("near, far and basal grass share root samples and preserve original vertex/index data",()=>{
  const ecology=new WorldEcology(world()),cam=camera(-1,-1),tile=ecology.buildGrassTile(-1,-1,cam);
  assert.ok(tile.list.length>500);assert.equal(ecology.grassRootField.samples,tile.list.length);
  const original=tile.list.map(p=>({...p}));
  ecology.syncBasalGrass(cam);assert.ok(ecology.baseGrass.records.length>100);
  assert.equal(ecology.grassRootField.samples,tile.list.length,"basal copies do not resample roots");
  for(const [lod,mesh]of tile.meshes.entries()){
    const source=ecology.grassGeometries[lod],field=mesh.geometry.attributes.aMeadowRootField;
    assert.equal(field.itemSize,4);assert.equal(field.meshPerAttribute,1);assert.equal(field.count,tile.list.length);
    assert.strictEqual(mesh.geometry.index,source.index);
    for(const [key,a]of Object.entries(source.attributes))assert.strictEqual(mesh.geometry.attributes[key],a);
    for(let i=0;i<mesh.count;i++)assert.deepEqual(values(field,i),fieldAtMatrix(mesh,i));
  }
  for(const record of ecology.baseGrass.records)
    assert.deepEqual(values(ecology.baseGrass.meadowField,record.slot),fieldAtMatrix(ecology.baseGrass.mesh,record.slot));
  assert.deepEqual(tile.list,original);
  assert.equal(ecology.uniforms.uGrassRootField.value,1);
  for(const material of [...ecology.grassMaterials,ecology.baseGrassMaterial]){
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);assert.strictEqual(shader.uniforms.uGrassRootField,ecology.uniforms.uGrassRootField);
  }
  ecology.uniforms.uGrassRootField.value=0;
  assert.equal(ecology.uniforms.uGrassRootField.value,0);ecology.dispose();
});

test("basal slot compaction, empty refill and uploads move fields with matrices without resampling",()=>{
  const ecology=new WorldEcology(world()),pool=ecology.baseGrass;
  const roots=Array.from({length:6},(_,i)=>({id:"test:"+i,x:-140+i*6.234,y:100,z:18+i*9.421,s:1,sy:1,rot:i*.4}));
  ecology.syncPool(pool,new Map(roots.map(p=>[p.id,p])));
  const initial=pool.meadowField.array.slice(),samples=ecology.grassRootField.samples;
  ecology.syncPool(pool,new Map([roots[0],roots[2],roots[4],roots[5]].map(p=>[p.id,p])));
  assert.equal(ecology.grassRootField.samples,samples);
  assert.equal(pool.records.length,4);
  assert.deepEqual(pool.records.map(p=>p.id),["test:0","test:4","test:2","test:5"]);
  for(const p of pool.records){assert.deepEqual(values(pool.meadowField,p.slot),fieldAtMatrix(pool.mesh,p.slot));assert.deepEqual(values(pool.meadowField,p.slot),Array.from(initial.slice(Number(p.id.slice(5))*4,Number(p.id.slice(5))*4+4)));}
  ecology.syncPool(pool,new Map());assert.equal(pool.records.length,0);
  ecology.syncPool(pool,new Map([roots[3],roots[1]].map(p=>[p.id,p])));
  assert.equal(ecology.grassRootField.samples,samples);
  for(const p of pool.records)assert.deepEqual(values(pool.meadowField,p.slot),fieldAtMatrix(pool.mesh,p.slot));
  // Execute the real pool upload path without producing unrelated tiles.
  ecology.grassAnchor="0,0";ecology.baseGrassAnchor="0,0";ecology.flowerNearAnchor="0,0";
  const version=pool.meadowField.version;
  ecology.updateMeadow(camera());
  assert.equal(pool.mesh.count,2);assert.equal(pool.meadowField.version,version+1);
  assert.deepEqual(pool.meadowField.updateRanges,[{start:0,count:24}]);
  const settledVersion=pool.meadowField.version;ecology.updateMeadow(camera());
  assert.equal(pool.meadowField.version,settledVersion,"stationary frames do not upload the static field again");
  ecology.dispose();
});

test("grass wrappers release private buffers and the final shared buffers through Three disposal",()=>{
  const source=new THREE.PlaneGeometry(1,1),a=createGrassFieldGeometry(source,3),b=createGrassFieldGeometry(source,4);
  const removed=[],info={memory:{geometries:0}},webgl=WebGLGeometries({}, {remove:attribute=>removed.push(attribute)},info,{releaseStatesOfGeometry:()=>{}});
  webgl.get(null,a);webgl.get(null,b);markGrassFieldRendered.call({geometry:b});
  const privateA=a.attributes.aMeadowRootField,privateB=b.attributes.aMeadowRootField;
  disposeGrassFieldGeometry(a);assert.deepEqual(removed,[privateA,a.attributes.aMeadowLandform,a.attributes.aMeadowCommunity]);assert.equal(info.memory.geometries,1);
  assert.ok(b.attributes.position.array.length>0);assert.strictEqual(b.attributes.position,source.attributes.position);
  disposeGrassFieldGeometry(b);assert.equal(info.memory.geometries,0);
  assert.ok(removed.includes(privateB));assert.ok(removed.includes(source.index));
  for(const attribute of Object.values(source.attributes))assert.ok(removed.includes(attribute));
  const count=removed.length;disposeGrassFieldGeometry(a);disposeGrassFieldGeometry(b);assert.equal(removed.length,count);
  const next=createGrassFieldGeometry(source,2);webgl.get(null,next);disposeGrassFieldGeometry(next);
  assert.equal(info.memory.geometries,0);assert.equal(removed.filter(x=>x===source.attributes.position).length,2);
  source.dispose();
});

test("grass streaming evicts wrapper fields and leaves resident geometry and fields intact",()=>{
  const ecology=new WorldEcology(world()),cam=camera(),tile=ecology.buildGrassTile(0,0,cam);
  const far=tile.meshes[1],near=tile.meshes[0],field=far.geometry.attributes.aMeadowRootField.array,copy=field.slice();
  let disposed=0;for(const mesh of tile.meshes)mesh.geometry.addEventListener("dispose",()=>disposed++);
  ecology.updateMeadow(cam);assert.strictEqual(far.geometry.attributes.aMeadowRootField.array,field);assert.deepEqual(field,copy);
  cam.position.x=2000;ecology.updateMeadow(cam);
  assert.equal(ecology.grassTiles.has("0,0"),false);assert.equal(disposed,2);
  assert.equal(far.geometry.userData.grassFieldReleased,true);assert.equal(near.geometry.userData.grassFieldReleased,true);
  ecology.dispose();
});

test("initial version-zero field uploads and a final unseen wrapper still releases actual Three buffers",()=>{
  const uploads=[],deleted=[],gl={ARRAY_BUFFER:34962,FLOAT:5126,UNSIGNED_SHORT:5123,
    createBuffer:()=>({}),bindBuffer:()=>{},bufferData:(target,array,usage)=>uploads.push({data:array.slice(),usage}),
    deleteBuffer:buffer=>deleted.push(buffer)};
  const gpu=new WebGLAttributes(gl),info={memory:{geometries:0}},webgl=WebGLGeometries(gl,gpu,info,{releaseStatesOfGeometry:()=>{}});
  const source=new THREE.PlaneGeometry(),rendered=createGrassFieldGeometry(source,1),unseen=createGrassFieldGeometry(source,1);
  const field=rendered.attributes.aMeadowRootField,sampler=new GrassRootField();
  sampler.write(field,0,{x:-133.721,z:1027.553});
  assert.equal(field.version,0);
  webgl.get(null,rendered);webgl.update(rendered);gpu.update(source.index,gl.ARRAY_BUFFER);
  markGrassFieldRendered.call({geometry:rendered});
  assert.deepEqual(uploads.find(u=>u.data.length===4).data,field.array,"initial static buffer is filled without needsUpdate");
  const initialUploads=uploads.length;webgl.update(rendered);assert.equal(uploads.length,initialUploads);
  disposeGrassFieldGeometry(rendered);
  assert.equal(deleted.length,0,"one submitted owner holds shared buffers while an unseen tile remains");
  disposeGrassFieldGeometry(unseen);
  assert.equal(deleted.length,initialUploads);assert.equal(info.memory.geometries,0);
  assert.equal(gpu.get(source.attributes.position),undefined);
  // The source CPU arrays survive and a later tile uploads them normally again.
  const rebuilt=createGrassFieldGeometry(source,1);sampler.write(rebuilt.attributes.aMeadowRootField,0,{x:20,z:-44});
  webgl.get(null,rebuilt);webgl.update(rebuilt);gpu.update(source.index,gl.ARRAY_BUFFER);
  markGrassFieldRendered.call({geometry:rebuilt});
  assert.equal(uploads.length,initialUploads*2);disposeGrassFieldGeometry(rebuilt);
  assert.equal(deleted.length,initialUploads*2);assert.equal(info.memory.geometries,0);source.dispose();
});
