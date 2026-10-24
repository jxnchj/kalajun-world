import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import * as THREE from "three";
import {meadowDirectionalPosition} from "./meadow-relief.js";
import {MeadowLandformField,meadowFieldPixels} from "./meadow-surface.js";
import {GrassRootField} from "./grass-root-field.js";
import {WorldTerrain} from "./terrain.js";
import {WorldEcology} from "./ecology.js";
import {decodeHeightBytes,makeRaster,sampleRaster} from "./world-data.js";
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const sample=(height,x=0,z=0,spacing=384)=>meadowDirectionalPosition({center:height(x,z),spacing,
 west:height(x-spacing,z),east:height(x+spacing,z),north:height(x,z-spacing),south:height(x,z+spacing),
 northWest:height(x-spacing,z-spacing),northEast:height(x+spacing,z-spacing),southWest:height(x-spacing,z+spacing),southEast:height(x+spacing,z+spacing)});
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const world=height=>({entities:[],objects:{},meta:{core:{size:20480},far:{size:81920}},landcoverAt:()=>({r:0,g:0,b:0}),surface:{heightAt:height,geographicHeightAt:height,normalAt(x,z,e){const a=height(x-e,z)-height(x+e,z),b=height(x,z-e)-height(x,z+e),l=Math.hypot(a,2*e,b);return{x:a/l,y:2*e/l,z:b/l};}}});

test("transverse relief distinguishes an elongated hollow from a longitudinal roll without compass-aligned noise",()=>{
 const curvature=.00004,e=384;
 const old=(2*curvature*e*e)/(4*e);
 for(const angle of [0,.17,.71,1.2,Math.PI/2,2.4,Math.PI]){
  const c=Math.cos(angle),s=Math.sin(angle),trough=(x,z)=>2300+curvature*(c*x+s*z)**2-.18*(-s*x+c*z);
  const roll=(x,z)=>2300+curvature*(-s*x+c*z)**2-.18*(-s*x+c*z);
  close(sample(trough),old*1.85);
  close(sample(roll),old*.15);
  // Rotate the full quadratic surface, not just its coordinates in a lookup.
  // The cross derivative from the diagonal samples removes cardinal preference.
  close(sample((x,z)=>4600-trough(x,z)),-old*1.85);
 }
 for(const spacing of [128,384,1152]){
  close(sample((x,z)=>2300+.27*x-.19*z,127,-338,spacing),0,1e-10);
  close(sample((x,z)=>2300+curvature*(x*x+z*z),0,0,spacing),curvature*spacing);
 }
});

test("new fixed-world field reuses scalar grids and serves terrain and all grass LODs without moving roots",()=>{
 const source=world((x,z)=>2300+.00004*x*x-.18*z),a=new MeadowLandformField(source),b=new MeadowLandformField(source,{relief:"v35"});
 assert.equal(a.stats.bytes,b.stats.bytes);
 const p=[0,0],inputs={traits:{x:.5,y:.5},altitude:2300,cover:{r:0,g:0,b:0},wetness:0};
 assert.ok(a.community(...p,inputs)[1]>b.community(...p,inputs)[1]+.08,"a long DEM hollow receives one continuous moist community");
 const counts={...a.stats};for(let i=0;i<40;i++)a.community(...p,inputs);assert.deepEqual(a.stats,counts,"stationary queries cannot repeat DEM work");
 assert.equal(a.stats.reliefDemSamples,a.stats.communityPoints*8);assert.equal(b.stats.reliefDemSamples,0);
 for(const [x,z]of [[-128,0],[0,-512],[9640,34],[10240,34]])for(const axis of [0,1]){
  const l=[x,z],r=[x,z];l[axis]-=.001;r[axis]+=.001;a.community(...l).forEach((v,k)=>close(v,a.community(...r)[k],2e-5));
 }
 const terrain=new WorldTerrain(source),eco=new WorldEcology(source),roots=new GrassRootField(source),camera={position:new THREE.Vector3(0,2302,0)};
 assert.strictEqual(roots.landform,terrain.landform);assert.strictEqual(eco.grassRootField.landform,terrain.landform);
 const tile=eco.buildGrassTile(0,0,camera),ids=tile.list.map(r=>r.id),positions=tile.list.map(r=>[r.x,r.y,r.z]);
 const textureHash=createHash("sha256").update(meadowFieldPixels()).digest("hex");
 for(const mesh of tile.meshes)for(let i=0;i<tile.list.length;i++){
  const root=tile.list[i],attribute=mesh.geometry.attributes.aMeadowCommunity;
  assert.deepEqual(attribute.array.slice(i*4,i*4+4),roots.sampleCommunity(root));
 }
 assert.deepEqual(tile.list.map(r=>r.id),ids);assert.deepEqual(tile.list.map(r=>[r.x,r.y,r.z]),positions);
 assert.equal(createHash("sha256").update(meadowFieldPixels()).digest("hex"),textureHash);
 for(const cover of [{r:1,g:0,b:0},{r:0,g:0,b:1}])assert.deepEqual(a.community(0,0,{...inputs,cover}),[0,0,0,0]);
 roots.dispose();eco.dispose();terrain.dispose();
});

test("actual geographic heights produce different connected hollow and shoulder weights while source detail stays exact",async t=>{
 const root=new URL("../../public/data/",import.meta.url),meta=JSON.parse(await readFile(new URL("scene.json",root),"utf8"));
 const [core,far]=await Promise.all(["core","far"].map(async name=>makeRaster(decodeHeightBytes(gunzipSync(await readFile(new URL(name+"_height.bin.gz",root))),meta[name].n,meta.height_scale),meta[name])));
 const height=(x,z)=>{const w=smooth(0,600,meta.core.size/2-Math.max(Math.abs(x),Math.abs(z)));return sampleRaster(core,x,z)*w+sampleRaster(far,x,z)*(1-w);};
 const source=world(height),candidate=new MeadowLandformField(source),baseline=new MeadowLandformField(source,{relief:"v35"});
 let changed=0,total=0,meanDelta=0,maxDelta=0;
 for(let z=-9000;z<9000;z+=281.25)for(let x=-9000;x<9000;x+=281.25){
  const original=height(x,z),a=candidate.community(x,z),b=baseline.community(x,z);
  assert.equal(height(x,z),original);assert.deepEqual(candidate.sample(x,z),baseline.sample(x,z));
  const delta=a.reduce((sum,v,k)=>sum+Math.abs(v-b[k]),0);if(delta>.02)changed++;total++;meanDelta+=delta;maxDelta=Math.max(maxDelta,delta);
  assert.ok(a.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(a.reduce((n,v)=>n+v,0)<=1+1e-10);
 }
 assert.ok(changed>total*.1,"directional terrain classification must have a real geographic effect, not just a shader/version flag");
 assert.equal(candidate.stats.bytes,baseline.stats.bytes);assert.equal(candidate.stats.reliefDemSamples,candidate.stats.communityPoints*8);
 t.diagnostic(JSON.stringify({samples:total,changedByMoreThanPoint02:changed,meanL1CommunityChange:meanDelta/total,maxL1CommunityChange:maxDelta,gridBytes:candidate.stats.bytes,gpuAttributesAdded:0,gpuTextureReadsAdded:0}));
});


test("reload A/B preserves actual root identities, flower choices, geometry and source texels",()=>{
 const script=String.raw`
  import {createHash} from "node:crypto";
  globalThis.location={search:"?meadowRelief="+process.argv[1]};
  const {WorldEcology}=await import("./ecology.js"),m=await import("./meadow-surface.js");
  const w={entities:[],objects:{},landcoverAt:()=>({r:0,g:0,b:0}),surface:{heightAt:(x,z)=>2300+.00004*x*x-.18*z,normalAt:()=>({x:0,y:1,z:0})}};
  const eco=new WorldEcology(w),roots=[],flowers=[],community=[];
  for(let z=-24;z<24;z++)for(let x=-24;x<24;x++){
   const root=eco.grassAt(x,z);if(root){roots.push(root);community.push(Array.from(eco.grassRootField.sampleCommunity(root)));}
   const flower=eco.flowerChoice(x*.8,z*.8,((x+24)*17+(z+24)*31)%100/100);if(flower)flowers.push([x,z,flower]);
  }
  const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const geometry=eco.grassGeometries.map(g=>[hash(Array.from(g.attributes.position.array)),hash(Array.from(g.index.array))]);
  console.log(JSON.stringify({profile:m.MEADOW_RELIEF,count:roots.length,roots:hash(roots),flowers:hash(flowers),geometry,
   texels:createHash("sha256").update(m.meadowFieldPixels()).digest("hex"),community:hash(community)}));eco.dispose();
 `;
 const run=mode=>JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",script,mode],{cwd:new URL(".",import.meta.url),encoding:"utf8"}));
 const a=run("v35"),b=run("directional");assert.equal(a.profile,"v35");assert.equal(b.profile,"directional");assert.ok(a.count>500);
 for(const key of["count","roots","flowers","geometry","texels"])assert.deepEqual(a[key],b[key],key+" must remain identical");
 assert.notEqual(a.community,b.community,"the reload switch must select the actual cached community model");
});
