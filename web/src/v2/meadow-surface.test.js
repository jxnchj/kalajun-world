import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MEADOW_SURFACE, MEADOW_PALETTE, meadowFieldPixels, sampleMeadowField, sampleMeadowLegacy, meadowCanopyColor, meadowFilter, bindMeadowField } from "./meadow-surface.js";
import { createTerrainMaterial } from "./terrain-material.js";
import { attachEcologyWind, installGrassSurface, meadowGeometry, basalGrassGeometry, MEADOW } from "./ecology.js";
const shader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader});
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,a+" != "+b);

test("source meadow pixels retain their exact periodic texel-centre reference",()=>{
  const data=meadowFieldPixels(),n=MEADOW_SURFACE.size;
  assert.equal(data.byteLength,1024*1024);assert.strictEqual(data,meadowFieldPixels());
  for(const [x,y]of [[0,0],[87,104],[511,511]]) {
    const f=sampleMeadowLegacy((x+.5)/n*128,(y+.5)/n*128);
    f.forEach((v,c)=>close(v,data[(y*n+x)*4+c]/255));
  }
  for(const [x,z]of [[-253.28,-126.12],[0,0],[333.1,971.83],[-.00001,128.00001]]) {
    const a=sampleMeadowLegacy(x,z),b=sampleMeadowLegacy(x+128,z-256);
    a.forEach((v,c)=>{close(v,b[c]);assert.ok(v>=0&&v<=1);});
  }
  for(const axis of [0,1]) {
    const a=[0,17.8],b=[0,17.8];a[axis]-=.0001;b[axis]+=.0001;
    sampleMeadowLegacy(...a).forEach((v,c)=>assert.ok(Math.abs(v-sampleMeadowLegacy(...b)[c])<.001));
  }
  for(let c=0;c<4;c++){
    let min=1,max=0,sum=0;for(let i=c;i<data.length;i+=4){const v=data[i]/255;min=Math.min(min,v);max=Math.max(max,v);sum+=v;}
    assert.ok(max-min>.5);assert.ok(sum/(n*n)>.3&&sum/(n*n)<.7);
  }
});
test("canopy retains metre-scale structure after leaf microdetail resolves to roughness",()=>{
  const a=meadowFilter(.02),b=meadowFilter(.3),c=meadowFilter(.8),d=meadowFilter(4);
  assert.deepEqual(a,{canopy:1,colour:1,micro:1});
  assert.equal(b.micro,0);assert.equal(b.canopy,1);
  assert.ok(c.canopy>0&&c.canopy<1);assert.equal(c.colour,c.canopy);
  assert.deepEqual(d,{canopy:0,colour:0,micro:0});
  let last={canopy:1,colour:1,micro:1};
  for(let p=0;p<4.1;p+=.013){const next=meadowFilter(p);for(const key of Object.keys(next)){assert.ok(next[key]<=last[key]+1e-12);assert.ok(next[key]>=0);}last=next;}
  for(const p of [[0,0],[30,-24],[80,140]]) {
    const f=sampleMeadowField(...p),color=meadowCanopyColor(f);
    assert.ok(color[1]>color[0]&&color[1]>color[2]);
    color.forEach((v,c)=>assert.ok(v>=Math.min(...Object.values(MEADOW_PALETTE).map(a=>a[c]))-.01&&v<=Math.max(...Object.values(MEADOW_PALETTE).map(a=>a[c]))+.01));
  }
});
test("terrain and three leaf LOD materials share one correctly owned field texture",()=>{
  const terrain=createTerrainMaterial(),a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial(),c=new THREE.MeshStandardMaterial();
  const uniform=bindMeadowField(a);assert.strictEqual(uniform,bindMeadowField(a));
  const s=shader();terrain.material.onBeforeCompile(s);
  assert.strictEqual(s.uniforms.meadowSurfaceField.value,uniform.value);
  for(const m of [b,c])assert.strictEqual(bindMeadowField(m).value,uniform.value);
  const texture=uniform.value;assert.equal(texture.colorSpace,THREE.NoColorSpace);
  assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.generateMipmaps,true);
  let disposed=0;texture.addEventListener("dispose",()=>disposed++);
  a.dispose();a.dispose();b.dispose();terrain.material.dispose();assert.equal(disposed,0);
  c.dispose();assert.equal(disposed,1);
  for(const t of Object.values(terrain.textures))t.dispose();
  const next=new THREE.MeshStandardMaterial();assert.notEqual(bindMeadowField(next).value,texture);next.dispose();
});
test("all meadow LOD shaders use the same root field without altering geometry, wind, dither or shadows",()=>{
  const uniforms={uWindTime:{value:2},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
  const fragments=[];
  for(const mode of [2,4,7]){
    const m=attachEcologyWind(new THREE.MeshStandardMaterial(),uniforms,mode,true),before=shader();
    m.onBeforeCompile(before);installGrassSurface(m);const after=shader();m.onBeforeCompile(after);
    assert.equal((after.vertexShader.match(/texture2D\(meadowSurfaceField/g)||[]).length,1);
    assert.match(after.vertexShader,/attribute vec4 aMeadowRootField/);
    assert.match(after.vertexShader,/if\(uGrassRootField>\.5 && uMeadowWorldVariation>\.5\)vMeadowFeatures=aMeadowRootField/);
    assert.equal(after.uniforms.uGrassRootField.value,1);
    assert.match(after.vertexShader,/vec4\(ecoRoot\(\),1\.\)/,"sampling follows the stable root, not bent tips");
    assert.ok(after.vertexShader.indexOf("ECO_LOD_EARLY_END")<after.vertexShader.indexOf("vMeadowFeatures=meadowFieldAt"));
    for(const tag of ["ECO_LOD_EARLY_BEGIN","ECO_LOD_EARLY_END"])assert.ok(after.vertexShader.includes(tag));
    const early=s=>s.slice(s.indexOf("// ECO_LOD_EARLY_BEGIN"),s.indexOf("// ECO_LOD_EARLY_END"));
    assert.equal(early(after.vertexShader),early(before.vertexShader));
    const wind=s=>s.slice(s.indexOf("vec2 ecoBend"),s.indexOf("#define STANDARD"));
    assert.equal(wind(after.vertexShader),wind(before.vertexShader));
    const dither=s=>s.slice(s.indexOf("float n=fract"),s.indexOf("#include <alphahash_fragment>"));
    assert.equal(dither(after.fragmentShader),dither(before.fragmentShader));
    assert.match(after.fragmentShader,/fwidth\(vUv.x\)/);
    assert.match(after.fragmentShader,/\.66\*\(1\.-grassDry\)/,"authored dry blades and seed heads retain their original colour");
    assert.match(after.fragmentShader,/roughnessFactor=\.93\+\(1\.-grassDetail\)\*\.025/);
    assert.equal((after.fragmentShader.match(/float grassDetail=/g)||[]).length,1);
    fragments.push(after.fragmentShader.match(/vec3 meadowCanopyColor[\s\S]+?float meadowMicroResolved[^\n]+/)[0]);
    m.dispose();
  }
  const terrain=createTerrainMaterial(),ts=shader();terrain.material.onBeforeCompile(ts);
  assert.equal(ts.fragmentShader.match(/vec3 meadowCanopyColor[\s\S]+?float meadowMicroResolved[^\n]+/)[0],fragments[0]);
  assert.equal(fragments[0],fragments[1]);assert.equal(fragments[1],fragments[2]);
  assert.match(ts.fragmentShader,/terrainGrassMicro=meadowMicroResolved\(terrainFootprint\)/);
  assert.match(ts.fragmentShader,/terrainCanopyRoughness=\.93\+\(1\.-terrainGrassMicro\)\*\.025/);
  assert.match(ts.fragmentShader,/if\(terrainForestContinuity<\.5 && terrainForest>\.001\)\{[\s\S]+terrainWarp/,"A/B off retains previous forest patches; active forest edges share the grass-root field");
  const geometries=[meadowGeometry(true),meadowGeometry(false),basalGrassGeometry()];
  assert.deepEqual(geometries.map(g=>g.index.count/3),[245,69,240]);
  assert.deepEqual([MEADOW.nearStart,MEADOW.nearEnd,MEADOW.farStart,MEADOW.farEnd],[23,33,62,78]);
  geometries.forEach(g=>g.dispose());terrain.material.dispose();Object.values(terrain.textures).forEach(t=>t.dispose());
});


test("elongated broad communities retain exact fine canopy and blend, source means and seamless wrapping",()=>{
  const old=meadowFieldPixels("v21"),now=meadowFieldPixels("v23"),sums=[0,0,0,0],previous=[0,0,0,0];
  let changed=0;
  for(let i=0;i<now.length;i+=4){
    assert.equal(now[i+1],old[i+1],"2.4m canopy detail remains bit-identical");
    assert.equal(now[i+3],old[i+3],"surface blend detail remains bit-identical");
    if(now[i]!==old[i])changed++;
    for(let c=0;c<4;c++){sums[c]+=now[i+c];previous[c]+=old[i+c];}
  }
  assert.deepEqual(sums,previous,"shape changes do not shift the overall ecological palette");
  assert.ok(changed>now.length/4*.8,"broad field must actually change");
  for(const axis of [0,1])for(const other of [2.6,17.8,67.7,115.1]){
    const a=axis?[other,-.0001]:[-.0001,other],b=axis?[other,.0001]:[.0001,other];
    sampleMeadowLegacy(...a,"v23").forEach((v,c)=>assert.ok(Math.abs(v-sampleMeadowLegacy(...b,"v23")[c])<.001));
  }
  for(let c=0;c<4;c++){
    const mean=sums[c]/(now.length/4),oldMean=previous[c]/(old.length/4);let variance=0,oldVariance=0;
    for(let i=c;i<now.length;i+=4){variance+=(now[i]-mean)**2;oldVariance+=(old[i]-oldMean)**2;}
    assert.ok(Math.abs(variance/oldVariance-1)<.04,"broad structure retains source variance, not blurred detail");
  }
});


test("v24 maturity forms connected communities while preserving fine pixels and full source variance",t=>{
  const old=meadowFieldPixels("v23"),now=meadowFieldPixels("v24"),count=now.length/4;
  const sums=[0,0,0,0],previous=[0,0,0,0];let energy=0,oldEnergy=0,relation=0,oldRelation=0;
  for(let i=0;i<now.length;i+=4){
    for(const c of [0,1,3])assert.equal(now[i+c],old[i+c],"moisture, 2.4 m canopy and microtexture remain byte-identical");
    for(let c=0;c<4;c++){sums[c]+=now[i+c];previous[c]+=old[i+c];}
    const next=(i+4)%now.length;
    energy+=(now[i+2]-now[next+2])**2;oldEnergy+=(old[i+2]-old[next+2])**2;
    relation+=(now[i]-.4696247624*255)*(now[i+2]-.5171759512*255);
    oldRelation+=(old[i]-.4696247624*255)*(old[i+2]-.5171759512*255);
  }
  assert.deepEqual(sums,previous,"no global ecological mean shift");
  let variance=0,oldVariance=0;
  for(let i=2;i<now.length;i+=4){variance+=(now[i]-sums[2]/count)**2;oldVariance+=(old[i]-previous[2]/count)**2;}
  assert.ok(Math.abs(variance/oldVariance-1)<.04,"maturity contrast is reorganized, not flattened");
  assert.ok(energy<oldEnergy*.55,"independent small dry islands lose their dominance");
  assert.ok(relation<oldRelation,"maturity follows the same moisture community more closely");
  for(const axis of [0,1])for(const other of [2.6,17.8,67.7,115.1]){
    const a=axis?[other,-.0001]:[-.0001,other],b=axis?[other,.0001]:[.0001,other];
    sampleMeadowLegacy(...a,"v24").forEach((v,c)=>assert.ok(Math.abs(v-sampleMeadowLegacy(...b,"v24")[c])<.001));
  }
  assert.deepEqual(meadowFilter(.3),{canopy:1,colour:1,micro:0},"resolved near tufts remain exact");
  assert.equal(meadowFilter(1.3).colour,0,"a 2.4 m tuft no longer appears as a detached sub-two-pixel colour dot");
  t.diagnostic(JSON.stringify({maturityVarianceRatio:variance/oldVariance,maturityAdjacentEnergyRatio:energy/oldEnergy}));
});
