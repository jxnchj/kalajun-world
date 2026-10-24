import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {getMeadowLandform,MeadowLandformField,meadowCommunityWeights,meadowCommunityVariation,setMeadowCommunityVariation,MEADOW_COMMUNITY_GLSL,meadowFieldPixels} from "./meadow-surface.js";
import {WorldTerrain} from "./terrain.js";
import {WorldEcology} from "./ecology.js";
import {GrassRootField} from "./grass-root-field.js";
import {decodeHeightBytes,makeRaster,sampleRaster} from "./world-data.js";
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function world(height=(x,z)=>2300+.00025*x*x-.1*z,cover=()=>({r:0,g:0,b:0})){
 return {entities:[],objects:{},meta:{core:{size:20480},far:{size:81920}},landcoverAt:cover,surface:{heightAt:height,geographicHeightAt:height,
  normalAt(x,z,e){const a=height(x-e,z)-height(x+e,z),b=height(x,z-e)-height(x,z+e),l=Math.hypot(a,2*e,b);return{x:a/l,y:2*e/l,z:b/l};}}};
}
const compile=material=>{const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);return shader;};

test("community hierarchy follows exposed shoulders, sheltered valleys, forest edge and altitude without random patches",()=>{
 assert.deepEqual(meadowCommunityWeights(),[0,0,0,0],"flat low grass has no invented community bands");
 const shoulder=meadowCommunityWeights({exposure:1,position:-.07,slope:.15});
 const plainSlope=meadowCommunityWeights({exposure:1,position:0,slope:.15});
 const valley=meadowCommunityWeights({exposure:.4,hollow:.8,position:.07,slope:.1});
 const cliff=meadowCommunityWeights({exposure:.4,hollow:.8,position:.07,slope:.8});
 assert.ok(shoulder[0]>.9&&plainSlope[0]<.3);assert.ok(valley[1]>.8);assert.deepEqual(cliff,[0,0,0,0]);
 const wetSunny=meadowCommunityWeights({exposure:1,position:-.07,wetness:1});
 assert.ok(wetSunny[1]>.9&&wetSunny[0]<.1,"known water margins override dry shoulder tendency");
 const edge=meadowCommunityWeights({forestNearby:1}),forest=meadowCommunityWeights({forestNearby:1,cover:{r:1}});
 assert.ok(edge[2]>.7);assert.deepEqual(forest,[0,0,0,0],"forest itself retains authored forest surface");
 assert.equal(meadowCommunityWeights({altitude:2700})[3],0);assert.ok(meadowCommunityWeights({altitude:3500})[3]>.99);
 for(const exposure of [0,.5,1])for(const position of [-.1,0,.1])for(const altitude of [2300,3000,3600]){
  const c=meadowCommunityWeights({exposure,position,altitude,hollow:.8,wetness:.6,forestNearby:.8});
  assert.ok(c.every(v=>v>=0&&v<=1));assert.ok(c.reduce((a,b)=>a+b,0)<=1+1e-12,"communities cannot accumulate into excessive colour multipliers");
  assert.deepEqual(meadowCommunityWeights({exposure,position,altitude,cover:{b:1}}),[0,0,0,0]);
 }
});

test("cached directional two-scale neighbourhood adds sixteen DEM and eight cover reads per new fixed grid point",()=>{
 let dem=0,cover=0;
 const w=world((x,z)=>{dem++;return 2300+.00025*x*x-.1*z;},x=>{cover++;return{r:x< -90?1:0,g:0,b:0};});
 const f=getMeadowLandform(w),traits=f.sample(0,0),inputs={traits,altitude:2300,cover:{r:0,g:0,b:0},wetness:0};
 const beforeDem=dem,beforeCover=cover,c=f.community(0,0,inputs),created=f.stats.communityPoints;
 assert.equal(created,8);assert.equal(dem-beforeDem,created*16);assert.equal(f.stats.regionalDemSamples,created*4);assert.equal(f.stats.reliefDemSamples,created*8);assert.equal(cover-beforeCover,created*8);
 assert.ok(c[2]>0,"supplied forest neighbourhood reaches the meadow edge");
 const counts=[dem,cover];assert.deepEqual(f.community(0,0,inputs),c);assert.deepEqual([dem,cover],counts);
 assert.equal(f.community(384,0)[2],0,"no forest edge invented away from source cover");
 assert.equal(f.community(-384,0)[2],0,"fully forested pixels retain the forest material");
 for(const [x,z]of [[-128,-512],[0,0],[9640,0],[10240,0],[-10240,0]])for(const axis of [0,1]){
  const a=[x,z],b=[x,z];a[axis]-=.001;b[axis]+=.001;
  const l=f.community(...a),r=f.community(...b);l.forEach((v,k)=>near(v,r[k],2e-4));
 }
 assert.equal(f.stats.bytes,1487864,"fixed two-grid allocation stays bounded across the whole world");
});

function interpolated(mesh,x,z,name){
 const node=mesh.userData.terrainTile,g=mesh.geometry,step=node.size/32,fx=(x-node.x)/step,fz=(z-node.z)/step;
 const i=Math.min(31,Math.floor(fx)),j=Math.min(31,Math.floor(fz)),a=g.attributes[name];
 for(let tri=0;tri<2;tri++){
  const ids=Array.from(g.index.array.slice((j*32+i)*6+tri*3,(j*32+i)*6+tri*3+3));
  const p=ids.map(k=>[k%33,Math.floor(k/33)]),d=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);
  const u=((p[1][1]-p[2][1])*(fx-p[2][0])+(p[2][0]-p[1][0])*(fz-p[2][1]))/d;
  const v=((p[2][1]-p[0][1])*(fx-p[2][0])+(p[0][0]-p[2][0])*(fz-p[2][1]))/d,w=1-u-v;
  if(Math.min(u,v,w)>=-1e-7)return Array.from({length:4},(_,c)=>ids.reduce((n,k,b)=>n+a.array[k*4+c]*[u,v,w][b],0));
 }
 throw Error("sample outside triangle");
}
test("community attributes follow parent triangles, skirts and tile cache, while geometry remains unchanged",()=>{
 const terrain=new WorldTerrain(world((x,z)=>2300+18*Math.sin(x/500)*Math.cos(z/600)-.07*z)),parent=terrain.roots[27];
 const original=parent.mesh.geometry.attributes.position.array.slice();
 terrain._camera.set(parent.x+parent.size+500,2500,parent.z+parent.size/2);parent.wantsSplit=true;terrain._refine(parent);
 for(const child of parent.children){const job=child.job;while(job.row<=32)terrain._buildRow(job);terrain._finish(job);}
 for(const child of parent.children){
  const g=child.mesh.geometry,p=g.attributes.position,c=g.attributes.terrainCommunity,d=g.attributes.terrainCommunityDelta;
  assert.equal(c.array.byteLength,19472);assert.equal(d.array.byteLength,19472);
  for(let k=0;k<1089;k++){
   const x=child.x+p.getX(k),z=child.z+p.getZ(k),target=interpolated(parent.mesh,x,z,"terrainCommunity");
   for(let axis=0;axis<4;axis++)near(c.array[k*4+axis]+d.array[k*4+axis],target[axis],8e-8);
   if(!(k%33&1)&&!(Math.floor(k/33)&1))for(let axis=0;axis<4;axis++)assert.equal(c.array[k*4+axis],target[axis]);
  }
  assert.ok(c.array.every(Number.isFinite));assert.ok(d.array.every(Number.isFinite));
 }
 assert.deepEqual(parent.mesh.geometry.attributes.position.array,original);
 const first=parent.children[0].mesh.geometry,values=first.attributes.terrainCommunity.array.slice();
 terrain._requestMerge(parent);terrain._advanceMorphs(1);parent.wantsSplit=true;terrain._refine(parent);
 for(const child of parent.children){const job=child.job;while(job.row<=32)terrain._buildRow(job);terrain._finish(job);}
 assert.deepEqual(parent.children[0].mesh.geometry.attributes.terrainCommunity.array,values);
 terrain.dispose();assert.equal(terrain.tileCache.stats.bytes,0);assert.equal(terrain.sampleCache.stats.bytes,0);
});

test("terrain and every grass representation share Float32 community samples and live A/B without resampling",()=>{
 const w=world(),eco=new WorldEcology(w),terrain=new WorldTerrain(w),cam={position:new THREE.Vector3(0,2301.7,0)};
 eco.uniforms.uWorldViewer.value.copy(cam.position);const tile=eco.buildGrassTile(0,0,cam),roots=tile.list;
 assert.ok(roots.length>100);
 for(const mesh of tile.meshes){
  const c=mesh.geometry.attributes.aMeadowCommunity;
  assert.equal(Object.values(mesh.geometry.attributes).reduce((n,a)=>n+Math.ceil(a.itemSize/4),4),12);
  for(let i=0;i<roots.length;i++)assert.deepEqual(c.array.slice(i*4,i*4+4),new Float32Array(terrain.landform.community(mesh.instanceMatrix.array[i*16+12],mesh.instanceMatrix.array[i*16+14])));
 }
 const pool=eco.baseGrass;
 eco.syncPool(pool,new Map(roots.slice(0,6).map(r=>[r.id,r])));
 eco.syncPool(pool,new Map([roots[0],roots[2],roots[4],roots[5]].map(r=>[r.id,r])));
 for(const r of pool.records)assert.deepEqual(pool.meadowCommunity.array.slice(r.slot*4,r.slot*4+4),eco.grassRootField.sampleCommunity(roots.find(p=>p.id===r.id)));
 const counts={...terrain.landform.stats},rootCache=eco.grassRootField.landformSamples;
 const sourcePixels=createHash("sha256").update(meadowFieldPixels()).digest("hex"),cached=pool.meadowCommunity.array.slice();
 const materials=[terrain.material,...eco.grassMaterials,eco.baseGrassMaterial],shaders=materials.map(compile);
 for(let i=0;i<materials.length;i++){
  assert.strictEqual(shaders[i].uniforms.uMeadowCommunityVariation,meadowCommunityVariation);
  assert.strictEqual(materials[i].userData.meadowCommunityVariation,meadowCommunityVariation);
  assert.ok(shaders[i].fragmentShader.includes(MEADOW_COMMUNITY_GLSL));
 }
 assert.match(shaders[0].vertexShader,/vTerrainCommunity \+= terrainCommunityDelta \* morphTargetInfluences\[0\]/);
 assert.doesNotMatch(MEADOW_COMMUNITY_GLSL,/texture\w*\(|noise\w*\(|sin\(|cos\(/);
 assert.match(MEADOW_COMMUNITY_GLSL,/if\(uMeadowCommunityVariation<\.5\)return field/);
 assert.doesNotMatch(MEADOW_COMMUNITY_GLSL,/field\.(?:g|a)\s*=/,"metre canopy and source blend detail stay identical");
 try{
  for(const on of [false,true,false,true]){setMeadowCommunityVariation(on);assert.equal(shaders[0].uniforms.uMeadowCommunityVariation.value,Number(on));}
  assert.deepEqual(pool.meadowCommunity.array,cached);assert.deepEqual(terrain.landform.stats,counts);assert.equal(eco.grassRootField.landformSamples,rootCache);
  assert.equal(createHash("sha256").update(meadowFieldPixels()).digest("hex"),sourcePixels);assert.throws(()=>setMeadowCommunityVariation(0),/boolean/);
 }finally{setMeadowCommunityVariation(true);eco.dispose();terrain.dispose();}
});

test("actual DEM yields geographically organised communities with unchanged source heights",async t=>{
 const root=new URL("../../public/data/",import.meta.url),meta=JSON.parse(await readFile(new URL("scene.json",root),"utf8"));
 const [core,far]=await Promise.all(["core","far"].map(async name=>makeRaster(decodeHeightBytes(gunzipSync(await readFile(new URL(name+"_height.bin.gz",root))),meta[name].n,meta.height_scale),meta[name])));
 const height=(x,z)=>{const w=smooth(0,600,meta.core.size/2-Math.max(Math.abs(x),Math.abs(z)));return sampleRaster(core,x,z)*w+sampleRaster(far,x,z)*(1-w);};
 const source=world(height),field=getMeadowLandform(source),counts=[0,0,0,0],sum=[0,0,0,0];let n=0;
 for(let z=-9000;z<9000;z+=281.25)for(let x=-9000;x<9000;x+=281.25){
  const h=height(x,z),c=field.community(x,z);assert.equal(height(x,z),h);assert.ok(c.every(Number.isFinite));
  c.forEach((v,k)=>{if(v>.2)counts[k]++;sum[k]+=v;});n++;
 }
 assert.ok(counts[0]>200&&counts[1]>400&&counts[3]>150,"real topography has distinct shoulders, valley meadows and high terrain");
 assert.equal(counts[2],0,"this test omits landcover, so it must not invent forest borders");
 assert.equal(field.stats.communityDemSamples,field.stats.communityPoints*4);
 t.diagnostic(JSON.stringify({samples:n,communityAbovePoint2:counts,mean:sum.map(v=>v/n),gridBytes:field.stats.bytes}));
});


test("regional terrain position joins broad valley and shoulder communities without moving local detail or roots",()=>{
 // A broad valley floor is nearly planar in the short stencil but has higher
 // terrain around it at 1152 m. It must not be classified as an unrelated
 // independent patch merely because the 96 m hollow response is small.
 const source=world((x,z)=>2300+150*(1-Math.exp(-(x*x)/(900*900)))-.025*z);
 const current=new MeadowLandformField(source),legacy=new MeadowLandformField(source,{landscape:"v19"});
 for(const [x,z]of [[0,0],[-640,0],[640,0],[9640,100],[10240,100]]){
  assert.deepEqual(current.sample(x,z),legacy.sample(x,z));
  assert.deepEqual(current.response(x,z),legacy.response(x,z),"existing local albedo response is unchanged");
 }
 const wetCurrent=[],wetLegacy=[];
 for(let x=-512;x<=512;x+=32){wetCurrent.push(current.community(x,0)[1]);wetLegacy.push(legacy.community(x,0)[1]);}
 assert.ok(wetCurrent[16]>wetLegacy[16]+.15,"regional valley adds a connected community on a locally gentle floor");
 assert.ok(wetCurrent.slice(8,25).every(v=>v>.15),"the core is a broad coherent region, not a new noise field");
 assert.ok(wetCurrent.every((v,i)=>!i||Math.abs(v-wetCurrent[i-1])<.09));
 const stats={...current.stats};for(let i=0;i<50;i++)current.community(0,0);assert.deepEqual(current.stats,stats,"cached stationary queries add no DEM work");
 assert.equal(legacy.stats.regionalDemSamples,0);assert.equal(legacy.stats.bytes,1275312);
 for(const cover of [{r:1,g:0,b:0},{r:0,g:0,b:1}]){
  assert.deepEqual(current.community(0,0,{cover}),[0,0,0,0],"pure forest and snow stay outside meadow reclassification");
 }
 const plane=world((x,z)=>2300+.04*x-.1*z);
 const a=new MeadowLandformField(plane),b=new MeadowLandformField(plane,{landscape:"v19"});
 for(const [x,z]of [[-700,-1000],[0,0],[400,200],[10000,300]])a.community(x,z).forEach((v,k)=>near(v,b.community(x,z)[k],1e-6));
});
