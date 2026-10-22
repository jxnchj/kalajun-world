import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {MEADOW_FIELD_MEAN,MEADOW_FIELD_GLSL,meadowFieldPixels,sampleMeadowLegacy,sampleMeadowField,meadowWorldSamples,meadowWorldVariation,setMeadowWorldVariation} from "./meadow-surface.js";
import {createTerrainMaterial} from "./terrain-material.js";
import {WorldEcology,attachEcologyWind,installGrassSurface} from "./ecology.js";
import {GrassRootField} from "./grass-root-field.js";
const compile=m=>{const s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,a+" != "+b);
const atWorld=(p,q)=>[.8*p-.6*q,.6*p+.8*q];
const moments=values=>{
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 return {mean,sd:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)};
};
test("world-cell seed matches unsigned 32-bit GLSL semantics, including negative and far coordinates",()=>{
 const mask=0xffffffffn,seed=(x,z)=>{
  let h=((BigInt(x)&mask)*374761393n)^((BigInt(z)&mask)*668265263n)^2246822519n;
  h&=mask;h=((h^(h>>13n))*1274126177n)&mask;h=(h^(h>>16n))&mask;
  return [0n,8n,16n,24n].map(shift=>Math.fround(Number((h>>shift)&255n)/255));
 };
 for(const [x,z]of [[0,0],[-97.13,-392.77],[40959.997,-38001.333],[-40960,40960],[1024,-2048]]){
  const f=Math.fround,px=f(f(f(x)*f(.8))+f(f(z)*f(.6))),pz=f(f(f(z)*f(.8))-f(f(x)*f(.6)));
  const ix=Math.floor(px/96),iz=Math.floor(pz/96),samples=meadowWorldSamples(x,z);
  close(samples.reduce((sum,s)=>sum+s.weight,0),1);
  for(let j=0;j<4;j++){
   assert.deepEqual(samples[j].seed,seed(ix+j%2,iz+Math.floor(j/2)));
   assert.ok(samples[j].weight>=0&&samples[j].weight<=1);assert.ok(samples[j].scale>=.9-1e-7&&samples[j].scale<=1.1+1e-7);
  }
  assert.deepEqual(sampleMeadowField(x,z),sampleMeadowField(x,z));
  for(const v of sampleMeadowField(x,z))assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
 }
});
test("quintic world blending has no field seam at positive/negative cells and corners",()=>{
 const macro=(p,q)=>meadowWorldSamples(...atWorld(p,q)).reduce((sum,s)=>sum+s.seed[2]*s.weight,0);
 for(const boundary of [-384,-96,0,96,384])for(const along of [-133.31,-17.32,0,51.17]){
  for(const axis of [0,1]){
   const point=[boundary,along],left=[...point],right=[...point];if(axis===1)point.reverse(),left.reverse(),right.reverse();
   left[axis]-=.001;right[axis]+=.001;
   const a=sampleMeadowField(...atWorld(...left)),b=sampleMeadowField(...atWorld(...right));
   a.forEach((v,c)=>assert.ok(Math.abs(v-b[c])<.003,"cell edge must not jump"));
   const h=.05,l=[...point],r=[...point];l[axis]-=h;r[axis]+=h;
   const dl=(macro(...point)-macro(...l))/h,dr=(macro(...r)-macro(...point))/h;
   // The world->rotated-cell round trip is Float32, as on the GPU. At
   // hundreds of metres its ULP can perturb the *tangential* coordinate while
   // probing a normal derivative. Bound that error using quintic's maximum
   // slope (1.875/cell), rather than treating quantization as a grid seam.
   const world=atWorld(...point),ulp=Math.max(1,...world.map(Math.abs))*2**-23;
   const derivativeError=4*ulp*(1.875/96)/h+1e-7;
   assert.ok(Math.abs(dl-dr)<derivativeError,"macro derivative exceeds the Float32 coordinate error bound");
  }
 }
});
test("128 m repeated signatures disappear without flattening colour or metre-scale canopy detail",t=>{
 const old=[[],[],[],[]],now=[[],[],[],[]],deltas=[0,0,0];
 let oldDetail=0,newDetail=0;
 for(let z=-384;z<384;z+=6)for(let x=-384;x<384;x+=6){
  const p=[x+.37,z+.13],a=sampleMeadowLegacy(...p),b=sampleMeadowField(...p);
  for(let c=0;c<4;c++){old[c].push(a[c]);now[c].push(b[c]);}
  for(const [i,[dx,dz]]of [[128,0],[0,128],[256,-128]].entries()){
   close(a[0],sampleMeadowLegacy(p[0]+dx,p[1]+dz)[0],1e-10);
   deltas[i]+=Math.abs(b[0]-sampleMeadowField(p[0]+dx,p[1]+dz)[0]);
  }
  oldDetail+=Math.abs(a[1]-sampleMeadowLegacy(p[0]+.5,p[1])[1]);
  newDetail+=Math.abs(b[1]-sampleMeadowField(p[0]+.5,p[1])[1]);
 }
 const count=old[0].length,before=old.map(moments),after=now.map(moments);
 for(let c=0;c<4;c++){
  assert.ok(Math.abs(before[c].mean-after[c].mean)<.055);
  assert.ok(after[c].sd>before[c].sd*.85&&after[c].sd<before[c].sd*1.35,"detail variance must survive texture blending");
 }
 deltas.forEach(v=>assert.ok(v/count>.15,"old periodic offsets cannot reconstruct the new field"));
 assert.ok(newDetail>oldDetail*.85&&newDetail<oldDetail*1.4,"no blur or oversized texture scale hides fine structure");
 t.diagnostic(JSON.stringify({samples:count,oldSD:before.map(v=>v.sd),newSD:after.map(v=>v.sd),repeatOffsetMAD:deltas.map(v=>v/count),halfMetreCanopyDifference:[oldDetail/count,newDetail/count]}));
});
test("actual source means preserve unresolved mip averages and explicit gradients survive cell discontinuities",()=>{
 const pixels=meadowFieldPixels(),sum=[0,0,0,0];
 for(let i=0;i<pixels.length;i++)sum[i%4]+=pixels[i]/255;
 sum.forEach((s,c)=>close(s/(pixels.length/4),MEADOW_FIELD_MEAN[c],1e-12));
 for(const p of [[0,0],[32,32],[-58.3,147.1]]){
  const samples=meadowWorldSamples(...p),gain=1/Math.sqrt(samples.reduce((s,v)=>s+v.weight*v.weight,0));
  for(const mean of MEADOW_FIELD_MEAN)close(mean+(samples.reduce((s,v)=>s+mean*v.weight,0)-mean)*gain,mean);
 }
 assert.match(MEADOW_FIELD_GLSL,/textureGrad\(meadowSurfaceField,q\/128\.,sampleDX\*scale\/128\.,sampleDY\*scale\/128\.\)/);
 assert.ok(MEADOW_FIELD_GLSL.indexOf("dx=dFdx(p)")<MEADOW_FIELD_GLSL.indexOf("ivec2 cell=ivec2(floor(g))"));
 assert.match(MEADOW_FIELD_GLSL,/macro=mix\(vec4\(\.5\),macro,1\.-smoothstep\(32\.,128\.,max\(length\(dx\),length\(dy\)\)\)\)/);
 assert.ok(!/\b(?:sin|cos|terrainNoise)\s*\(/.test(MEADOW_FIELD_GLSL),"world variation introduces no per-pixel trigonometry/FBM");
});
test("live A/B changes terrain and all grass LODs together while retaining CPU root caches",()=>{
 const terrain=createTerrainMaterial(),s=compile(terrain.material),rootSampler=new GrassRootField(),root={x:-177.34,z:892.1};
 const cached=rootSampler.sample(root),uniforms={uWindTime:{value:1},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
 const materials=[];
 for(const mode of [2,4,7]){
  const material=installGrassSurface(attachEcologyWind(new THREE.MeshStandardMaterial(),uniforms,mode,true)),grass=compile(material);materials.push(material);
  assert.strictEqual(grass.uniforms.uMeadowWorldVariation,meadowWorldVariation);
  assert.strictEqual(material.userData.meadowWorldVariation,s.uniforms.uMeadowWorldVariation);
  assert.match(grass.vertexShader,/if\(uGrassRootField>\.5 && uMeadowWorldVariation>\.5\)vMeadowFeatures=aMeadowRootField/);
  assert.match(grass.vertexShader,/else vMeadowFeatures=meadowFieldAt/,"legacy A/B bypasses new cached root values");
  assert.ok(grass.vertexShader.includes(MEADOW_FIELD_GLSL));
 }
 const key=terrain.material.customProgramCacheKey(),version=terrain.material.version;
 for(const value of [false,true,false,true]){
  setMeadowWorldVariation(value);assert.equal(s.uniforms.uMeadowWorldVariation.value,Number(value));
  assert.strictEqual(rootSampler.sample(root),cached);assert.equal(rootSampler.samples,1);
 }
 assert.equal(terrain.material.customProgramCacheKey(),key);assert.equal(terrain.material.version,version);
 assert.match(s.fragmentShader,/#define MEADOW_FRAGMENT/);assert.match(s.fragmentShader,/terrainMeadowFeatures=meadowCommunityFeatures\(meadowFieldAt\(terrainXZ\),vTerrainCommunity\)/);
 assert.throws(()=>setMeadowWorldVariation(0),/boolean/);
 materials.forEach(m=>m.dispose());terrain.material.dispose();Object.values(terrain.textures).forEach(t=>t.dispose());rootSampler.dispose();
});


test("continuous cell rotations remove common texture axes without scaling or adding texture reads",t=>{
 const result={};
 for(const rotation of ["v17","continuous"]){
  let real=0,imaginary=0,count=0;const angles=new Set();
  for(let x=-1000;x<=1000;x+=96)for(let z=-1000;z<=1000;z+=96){
   const sample=meadowWorldSamples(x,z,rotation)[0],angle=Math.atan2(sample.sine,sample.cosine);
   close(Math.hypot(sample.cosine,sample.sine),1,2e-7);
   real+=Math.cos(4*angle);imaginary+=Math.sin(4*angle);count++;angles.add(angle.toFixed(2));
   // The physical source density is invariant under the orthonormal transform.
   for(const [dx,dz]of [[.01,0],[0,.01],[.006,.008]])close(Math.hypot(sample.cosine*dx-sample.sine*dz,sample.sine*dx+sample.cosine*dz),.01,2e-9);
  }
  result[rotation]={fourfoldOrientation:Math.hypot(real,imaginary)/count,directions:angles.size};
 }
 close(result.v17.fourfoldOrientation,1);
 assert.ok(result.continuous.fourfoldOrientation<.25,"quarter-turn orientation signal must be removed, not concealed by blurring");
 assert.ok(result.continuous.directions>150);
 assert.equal((MEADOW_FIELD_GLSL.match(/textureGrad\(/g)||[]).length,1,"the four-corner shared helper retains one explicit-gradient read");
 assert.match(MEADOW_FIELD_GLSL,/sampleDX=rotation\*dx;sampleDY=rotation\*dy/);
 t.diagnostic(JSON.stringify(result));
});
