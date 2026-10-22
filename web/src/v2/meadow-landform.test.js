import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {getMeadowLandform,meadowLandformResponse,meadowLandformVariation,setMeadowLandformVariation,MEADOW_LANDFORM_GLSL,meadowFieldPixels} from "./meadow-surface.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {WorldTerrain} from "./terrain.js";
import {WorldEcology} from "./ecology.js";
import {GrassRootField,createGrassFieldGeometry,disposeGrassFieldGeometry} from "./grass-root-field.js";
import {decodeHeightBytes,makeRaster,sampleRaster} from "./world-data.js";

const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function fixture(height=(x,z)=>2300+.08*x-.11*z+18*Math.sin(x/600)*Math.cos(z/800)){
  return {meta:{far:{size:81920},core:{size:20480}},surface:{heightAt:height,geographicHeightAt:height,normalAt(x,z,e){
    const a=height(x-e,z)-height(x+e,z),b=height(x,z-e)-height(x,z+e),n=Math.hypot(a,2*e,b);return{x:a/n,y:2*e/n,z:b/n};}},
    landcoverAt:(x,z)=>({r:Math.max(0,Math.sin(x/600))*.6,g:Math.max(0,Math.cos(z/500))*.2,b:Math.max(0,Math.sin(z/12000))*.12,a:1})};
}
const dispose=surface=>{surface.material.dispose();Object.values(surface.textures).forEach(t=>t.dispose());};

test("extracted landform retains the previous geographic values and original coarse colours exactly",()=>{
  const world=fixture(),field=getMeadowLandform(world);
  // Captured from the pre-change implementation, including Float32 grid storage
  // and core/far blending. These protect the actual extraction, not a new formula.
  const expected=[[0,0,.7086772918701172,.08243435621261597],[-1980,3420,.703357026563026,.08371242976136273],
    [1300,-2567,.7111359302361961,.0988608613715769],[10100,7,.7091064586499952,.09943051322734447],
    [10240,9,.7089046253822744,.10201302166387904],[18000,-19000,.672313980612671,.08575163508794503],
    [-40960,40960,.7327052354812622,.07406430691480637]];
  for(const [x,z,a,b]of expected){const value=field.sample(x,z);assert.equal(value.x,a);assert.equal(value.y,b);}
  const terrain=new WorldTerrain(world),hash=createHash("sha256");
  for(const node of terrain.roots)hash.update(Buffer.from(node.mesh.geometry.attributes.color.array.buffer));
  assert.equal(hash.digest("hex"),"3860f3d249ec6c5f898c7b9fa4477ed4077f1f469d56e7c384696d027e62ea96");
  assert.strictEqual(terrain.landform,field);assert.strictEqual(new GrassRootField(world).landform,field);
  const before=field.stats.demSamples;field.sample(-1980,3420);field.sample(-1980,3420);
  assert.equal(field.stats.demSamples,before,"both consumers reuse geographic stencil values");
  assert.equal(terrain.sampleCache.attributeComponents,22);
  assert.equal(terrain.sampleCache.stats.bytes,65536*113,"22 float components include the new shared shore distance; original geographic fields and exact bounded cache accounting remain");
  terrain.dispose();assert.equal(terrain.landform,null);assert.equal(terrain.sampleCache.stats.bytes,0);
});

test("south aspect, sheltered concavity and wet banks form bounded ecological colour and roughness",()=>{
  const north=getMeadowLandform({...fixture((x,z)=>2300+.3*z),landcoverAt:()=>({r:0,g:0,b:0})});
  const south=getMeadowLandform({...fixture((x,z)=>2300-.3*z),landcoverAt:()=>({r:0,g:0,b:0})});
  const n=north.response(0,0),s=south.response(0,0);
  assert.ok(north.sample(0,0).x<.1&&south.sample(0,0).x>.9,"world +z points south");
  assert.ok(n[0]<s[0]&&n[2]>s[2],"north slope stays cooler and green, south warmer");
  assert.ok(n[3]<s[3],"moist foliage is less rough without becoming glossy");
  assert.deepEqual(meadowLandformResponse(.5,0),[1,1,1,0],"flat low meadow has no invented compass stripe");
  const hollow=meadowLandformResponse(.5,1),wet=meadowLandformResponse(.8,0,{wetness:1});
  assert.ok(hollow[0]<1&&hollow[2]>1&&hollow[3]<0);
  assert.ok(wet[2]>1&&wet[3]<0,"known wet margins override dry-aspect tendency");
  for(let exposure=0;exposure<=1;exposure+=.1)for(let hollow=0;hollow<=1;hollow+=.1)for(const wetness of [0,.5,1]){
    const response=meadowLandformResponse(exposure,hollow,{altitude:3600,wetness});
    response.slice(0,3).forEach(c=>assert.ok(c>=.82&&c<=1.19));
    assert.ok(.93+response[3]>=.88&&.93+response[3]<=.97);
  }
  for(const cover of [{r:1,g:0,b:0},{r:0,g:0,b:1}])
    assert.deepEqual(meadowLandformResponse(1,0,{cover}),[1,1,1,0],"forest and snow are not repainted as meadow");
});

test("negative grid edges and the core/far transition are continuous without LOD coordinates",()=>{
  const field=getMeadowLandform(fixture());
  for(const [x,z]of [[0,0],[-128,-256],[512,-1024],[9640,100],[10240,-40],[-10240,80],[40960,-40960]]){
    for(const axis of [0,1]){
      const a=[x,z],b=[x,z];a[axis]-=.001;b[axis]+=.001;
      const left=field.sample(...a),right=field.sample(...b);
      near(left.x,right.x,1e-5);near(left.y,right.y,1e-5);
    }
  }
  const stats={...field.stats},options={traits:field.sample(10,20),altitude:2400,wetness:.2,cover:{r:0,g:0,b:0}};
  const before=field.stats.demSamples;field.response(10,20,options);
  assert.equal(field.stats.demSamples,before,"terrain reuses already sampled traits, altitude, cover and wetness");
  assert.ok(stats.bytes<=1536*1024,"two derived grids stay bounded, not per-root DEM stencils");
});

function triangleValue(mesh,x,z,name){
  const node=mesh.userData.terrainTile,g=mesh.geometry,step=node.size/32,fx=(x-node.x)/step,fz=(z-node.z)/step;
  const i=Math.min(31,Math.floor(fx)),j=Math.min(31,Math.floor(fz)),indices=g.index.array,attribute=g.attributes[name];
  for(let tri=0;tri<2;tri++){
    const ids=Array.from(indices.slice((j*32+i)*6+tri*3,(j*32+i)*6+tri*3+3));
    const p=ids.map(k=>[k%33,Math.floor(k/33)]),den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);
    const a=((p[1][1]-p[2][1])*(fx-p[2][0])+(p[2][0]-p[1][0])*(fz-p[2][1]))/den;
    const b=((p[2][1]-p[0][1])*(fx-p[2][0])+(p[0][0]-p[2][0])*(fz-p[2][1]))/den,c=1-a-b;
    if(Math.min(a,b,c)>=-1e-7)return Array.from({length:4},(_,axis)=>ids.reduce((sum,k,n)=>sum+attribute.array[k*4+axis]*[a,b,c][n],0));
  }
  throw new Error("No triangle at sample");
}
test("terrain response preserves parent samples, caches and the full first morph frame",()=>{
  const terrain=new WorldTerrain(fixture()),parent=terrain.roots[27];
  terrain._camera.set(parent.x+parent.size+500,2500,parent.z+parent.size/2);parent.wantsSplit=true;terrain._refine(parent);
  for(const child of parent.children){const job=child.job;while(job.row<=32)terrain._buildRow(job);terrain._finish(job);}
  for(const child of parent.children){
    const g=child.mesh.geometry,p=g.attributes.position,h=g.attributes.terrainLandform,d=g.attributes.terrainLandformDelta;
    assert.equal(h.array.byteLength,1217*4*4);assert.equal(d.array.byteLength,1217*4*4);
    for(let k=0;k<1089;k++){
      const x=child.x+p.getX(k),z=child.z+p.getZ(k),expected=triangleValue(parent.mesh,x,z,"terrainLandform");
      for(let axis=0;axis<4;axis++)near(h.array[k*4+axis]+d.array[k*4+axis],expected[axis],8e-8);
      if(!(k%33&1)&&!(Math.floor(k/33)&1))for(let axis=0;axis<4;axis++)assert.equal(h.array[k*4+axis],expected[axis]);
    }
  }
  const child=parent.children[0],saved=child.mesh.geometry.attributes.terrainLandform.array.slice();
  terrain._requestMerge(parent);terrain._advanceMorphs(1);
  parent.wantsSplit=true;terrain._refine(parent);
  for(const child of parent.children){const job=child.job;while(job.row<=32)terrain._buildRow(job);terrain._finish(job);}
  assert.deepEqual(parent.children[0].mesh.geometry.attributes.terrainLandform.array,saved,"tile revisits restore response arrays");
  terrain.dispose();
});

test("landform A/B preserves original detail pixels and uses no new fragment samples",()=>{
  const pixels=meadowFieldPixels(),hash=createHash("sha256").update(pixels).digest("hex"),surface=createTerrainMaterial();
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};surface.material.onBeforeCompile(shader);
  assert.strictEqual(shader.uniforms.uMeadowLandformVariation,meadowLandformVariation);
  assert.strictEqual(surface.material.userData.meadowLandformVariation,meadowLandformVariation);
  assert.doesNotMatch(MEADOW_LANDFORM_GLSL,/texture|noise|sin\(/);
  assert.match(shader.vertexShader,/vTerrainLandform \+= terrainLandformDelta \* morphTargetInfluences\[0\]/);
  assert.match(shader.fragmentShader,/terrainGrassColor\*=meadowLandformTint\(vTerrainLandform\)/);
  const key=surface.material.customProgramCacheKey(),version=surface.material.version;
  try{setMeadowLandformVariation(false);assert.equal(shader.uniforms.uMeadowLandformVariation.value,0);
    assert.equal(surface.material.version,version);assert.equal(surface.material.customProgramCacheKey(),key);
    assert.equal(createHash("sha256").update(meadowFieldPixels()).digest("hex"),hash);
    assert.throws(()=>setMeadowLandformVariation(0),/boolean/);
  }finally{setMeadowLandformVariation(true);dispose(surface);}
});

test("grass response uses final Float32 roots once, sharing the terrain field and complete geometry lifetime",()=>{
  const world=fixture(),cache=new GrassRootField(world),field=getMeadowLandform(world),root={x:-1980.12345,z:3420.54321};
  const source=new THREE.PlaneGeometry(),geometry=createGrassFieldGeometry(source,2,true);
  cache.write(geometry.attributes.aMeadowRootField,0,root,geometry.attributes.aMeadowLandform);
  const expected=new Float32Array(field.response(Math.fround(root.x),Math.fround(root.z)));
  assert.deepEqual(geometry.attributes.aMeadowLandform.array.slice(0,4),expected);
  const calls=field.stats.responses,old=cache.sampleLandform(root);cache.sampleLandform(root);assert.equal(field.stats.responses,calls);
  root.x+=1e-8;assert.strictEqual(cache.sampleLandform(root),old);
  root.x+=.5;assert.notStrictEqual(cache.sampleLandform(root),old);assert.equal(cache.landformSamples,2);
  const slots=Object.values(geometry.attributes).reduce((n,a)=>n+Math.ceil(a.itemSize/4),4);assert.ok(slots<=16);
  let disposed=0;geometry.addEventListener("dispose",()=>disposed++);disposeGrassFieldGeometry(geometry);assert.equal(disposed,1);
  cache.dispose();assert.equal(cache.landform,null);
});

test("actual source DEM produces finite stable landform variation without changing heights",async()=>{
  const root=new URL("../../public/data/",import.meta.url),meta=JSON.parse(await readFile(new URL("scene.json",root),"utf8"));
  const buffers=await Promise.all(["core","far"].map(async name=>decodeHeightBytes(gunzipSync(await readFile(new URL(name+"_height.bin.gz",root))),meta[name].n,meta.height_scale)));
  const [core,far]=buffers.map((data,i)=>makeRaster(data,meta[i?"far":"core"]));
  const height=(x,z)=>{const w=smooth(0,600,meta.core.size/2-Math.max(Math.abs(x),Math.abs(z)));return sampleRaster(core,x,z)*w+sampleRaster(far,x,z)*(1-w);};
  const world={meta,surface:{heightAt:height,geographicHeightAt:height},landcoverAt:()=>({r:0,g:0,b:0})},field=getMeadowLandform(world);
  let lo=Infinity,hi=-Infinity;
  for(let z=-9000;z<9000;z+=281.25)for(let x=-9000;x<9000;x+=281.25){
    const before=height(x,z),value=field.response(x,z);assert.equal(height(x,z),before);
    assert.ok(value.every(Number.isFinite));lo=Math.min(lo,value[0]/value[2]);hi=Math.max(hi,value[0]/value[2]);
  }
  assert.ok(hi-lo>.15,"actual slopes retain a non-flat ecological chroma range");
  assert.ok(field.stats.gridPoints<4096*8,"grid corners are reused across actual geographic samples");
});

test("live near/far/basal grass copies, uploads and disables the same response without moving roots",()=>{
  const world={...fixture(),entities:[],objects:{}},ecology=new WorldEcology(world),camera={position:new THREE.Vector3(0,2301.7,0)};
  ecology.uniforms.uWorldViewer.value.copy(camera.position);
  const tile=ecology.buildGrassTile(0,0,camera),roots=tile.list.slice(),field=getMeadowLandform(world);
  assert.ok(roots.length>100);
  const original=roots.map(p=>[p.id,p.x,p.y,p.z]);
  for(const mesh of tile.meshes){
    const attribute=mesh.geometry.attributes.aMeadowLandform;
    const slots=Object.values(mesh.geometry.attributes).reduce((n,a)=>n+Math.ceil(a.itemSize/4),4);
    assert.equal(slots,12,"standard grass geometry plus mat4 and three vec4 instance fields");
    for(let i=0;i<roots.length;i++){
      const m=mesh.instanceMatrix.array,x=m[i*16+12],z=m[i*16+14];
      assert.deepEqual(attribute.array.slice(i*4,i*4+4),new Float32Array(field.response(x,z)));
    }
  }
  const pool=ecology.baseGrass,selection=roots.slice(0,6),wanted=list=>new Map(list.map(p=>[p.id,p]));
  ecology.syncPool(pool,wanted(selection));const samples=ecology.grassRootField.landformSamples;
  ecology.syncPool(pool,wanted([selection[0],selection[2],selection[4],selection[5]]));
  assert.equal(ecology.grassRootField.landformSamples,samples,"slot compaction does not resample DEM or hydrology");
  for(const record of pool.records){const expected=ecology.grassRootField.sampleLandform(roots.find(p=>p.id===record.id));
    assert.deepEqual(pool.meadowLandform.array.slice(record.slot*4,record.slot*4+4),expected);}
  ecology.grassAnchor=ecology.baseGrassAnchor=ecology.flowerNearAnchor="0,0";ecology.grassRootsChanged=false;
  const version=pool.meadowLandform.version;ecology.updateMeadow(camera);
  assert.equal(pool.meadowLandform.version,version+1);
  assert.deepEqual(pool.meadowLandform.updateRanges,[{start:0,count:24}]);
  ecology.updateMeadow(camera);assert.equal(pool.meadowLandform.version,version+1);
  assert.equal(ecology.stats.grassLandformBytes,ecology.stats.grassFieldBytes);
  const terrain=createTerrainMaterial(),materials=[terrain.material,...ecology.grassMaterials,ecology.baseGrassMaterial];
  try{
    const shaders=materials.map(material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;});
    for(const shader of shaders)assert.strictEqual(shader.uniforms.uMeadowLandformVariation,meadowLandformVariation);
    const data=pool.meadowLandform.array.slice();setMeadowLandformVariation(false);
    assert.ok(shaders.every(s=>s.uniforms.uMeadowLandformVariation.value===0));
    assert.deepEqual(pool.meadowLandform.array,data,"A/B neutralises response without stale/rebuilt caches");
    assert.deepEqual(roots.map(p=>[p.id,p.x,p.y,p.z]),original);
  }finally{setMeadowLandformVariation(true);dispose(terrain);ecology.dispose();}
});
