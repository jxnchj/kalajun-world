import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createTerrainMaterial, terrainBankExposure, terrainFragmentBedCoverage } from "./terrain-material.js";

const dispose=result=>{result.material.dispose();Object.values(result.textures).forEach(texture=>texture.dispose());};

test("forest surface packs needle, humus and moss detail once in a bounded linear texture",()=>{
  const first=createTerrainMaterial(),second=createTerrainMaterial(),texture=first.textures.packed;
  assert.deepEqual(Object.keys(first.textures),["packed"]);
  assert.equal(texture.image.width,512);assert.equal(texture.image.height,512);
  assert.equal(texture.image.depth,4);assert.equal(texture.image.data.byteLength,4*1024*1024);
  assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.generateMipmaps,true);
  assert.equal(texture.image.data,second.textures.packed.image.data,"CPU pixels are cached rather than regenerated per terrain tile");
  assert.notEqual(texture,second.textures.packed,"worlds own independent disposable GPU textures");
  const data=texture.image.data.subarray(3*1024*1024),classes={moss:0,humus:0,needles:0};
  let slopeEnergy=0;
  for(let i=0;i<data.length;i+=4){
    const a=data[i+3]/255;
    if(a<.3)classes.moss++;else if(a>.75)classes.needles++;else classes.humus++;
    slopeEnergy+=Math.abs(data[i+1]-128)+Math.abs(data[i+2]-128);
  }
  const pixels=data.length/4;
  for(const [name,count]of Object.entries(classes))assert.ok(count/pixels>.04&&count/pixels<.8,name+" must occupy a meaningful part of the surface");
  assert.ok(slopeEnergy/pixels>3&&slopeEnergy/pixels<100,"normal detail stays visible and bounded");
  dispose(first);dispose(second);
});

test("forest ground and meadow canopy use fixed world patches and respect snow and river masks",()=>{
  const result=createTerrainMaterial();
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  result.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.terrainPackedFields.value,result.textures.packed);
  assert.equal((shader.fragmentShader.match(/terrainNoise\(/g)||[]).length,5,"only the four accepted forest patch samples remain, guarded from open meadow");
  assert.equal((shader.fragmentShader.match(/texture\(terrainPackedFields/g)||[]).length,2,"procedural two-projection helper remains shared");
  assert.match(shader.fragmentShader,/if\(terrainForest>\.001\)\{\s*if\(terrainForestContinuity>\.5\) terrainForestValue=terrainSampleGrad\(3\./,"open meadow does not fetch the forest texture");
  assert.match(shader.fragmentShader,/terrainForest\*\(1\.-terrainRockWeight\)\*\(1\.-terrainSnow\)\*\(1\.-terrainRiverBed\)/);
  assert.match(shader.fragmentShader,/terrainWetness\*\.55/,"moss response uses the real wet-bank field");
  assert.match(shader.fragmentShader,/smoothstep\(\.28,\.56,terrainSlope\)/,"steep terrain reduces moss");
  assert.match(shader.fragmentShader,/terrainGrassColor,terrainLowGrass/,"forest edge retains low-grass openings");
  assert.match(shader.fragmentShader,/terrainForestGradient/);
  assert.equal((shader.fragmentShader.match(/uniform highp sampler2DArray/g)||[]).length,3,"packed fields and scan layers share three sampler units");
  assert.equal((shader.fragmentShader.match(/texture\(terrainScan/g)||[]).length,4);
  assert.equal((shader.fragmentShader.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3,"three surface samplers leave room for morph targets and all room/sun inputs");
  assert.match(shader.fragmentShader,/terrainSward=terrainMeadowFeatures.g/);
  assert.match(shader.fragmentShader,/terrainSwardResolved=meadowCanopyResolved\(terrainFootprint\)/);
  assert.match(shader.fragmentShader,/\(1\.-terrainForest\)\*\(1\.-terrainSnow\)\*\(1\.-terrainRockWeight\)/);
  assert.match(shader.fragmentShader,/if\(abs\(terrainDet\)>1e-8\)/,"grazing derivatives remain bounded");
  assert.equal((shader.fragmentShader.match(/vec3 terrainPerturbed =/g)||[]).length,1);
  assert.match(shader.vertexShader,/vTerrainWorldPosition = \(modelMatrix \* vec4\(transformed, 1.0\)\).xyz/);
  dispose(result);
});


test("damp living shoulders recover terrain cover without hiding the wet bed or steep cuts",()=>{
  for(const bank of [0,.15,.5,1])for(const patch of [0,.2,.5,.8,1]){
    assert.equal(terrainBankExposure(bank,1,.05,patch,patch),bank,"actual exposed riverbed remains intact");
    assert.equal(terrainBankExposure(bank,0,.7,patch,patch),bank,"steep eroded cuts remain exposed");
    assert.equal(terrainBankExposure(bank,0,.05,patch,patch,"v22"),bank,"A/B restores previous surface");
    const value=terrainBankExposure(bank,0,.05,patch,patch);
    assert.ok(value>=0&&value<=bank);
  }
  assert.ok(terrainBankExposure(1,0,.05,.8,.8)<.1,"wet turf no longer receives a uniform bare-soil ribbon");
  assert.ok(terrainBankExposure(1,0,.05,.1,.1)>.95,"open sediment pockets remain");
  let previous=1;
  for(let p=0;p<=1;p+=.005){const value=terrainBankExposure(1,0,.05,p,p);assert.ok(value<=previous+1e-12);assert.ok(previous-value<.02);previous=value;}
  const result=createTerrainMaterial(),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  result.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/terrainBankLiving=.*terrainRiverBed/);
  assert.match(shader.fragmentShader,/terrainBank\*=1\.-terrainBankLiving\*\.92/);
  assert.match(shader.fragmentShader,/terrainWetness = clamp\(vTerrainHydrology.x/,"soil moisture is not edited to make the margin disappear");
  dispose(result);
});


test("fragment bank coverage cannot smear riverbed up a dry triangle and keeps immersed detail",()=>{
  let rejected=0;
  for(const a of [-.5,-.02,0,.01])for(const b of [.15,.3,.8])for(let i=0;i<=100;i++){
    const t=i/100,clearance=a+(b-a)*t,interpolatedCoverage=1-t;
    const cover=terrainFragmentBedCoverage(interpolatedCoverage,clearance);
    assert.ok(cover>=0&&cover<=interpolatedCoverage);
    if(clearance<=.02)assert.equal(cover,interpolatedCoverage,"submerged and 2 cm lip retained exactly");
    if(clearance>=.12){assert.equal(cover,0);if(interpolatedCoverage>.1)rejected++;}
    assert.equal(terrainFragmentBedCoverage(interpolatedCoverage,clearance,"v24"),interpolatedCoverage);
  }
  assert.ok(rejected>200,"meaningful formerly smeared bed area is removed from elevated ground");
  const result=createTerrainMaterial(),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  result.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/attribute vec4 terrainHydrology/);
  assert.match(shader.fragmentShader,/terrainPhysicalBed=vTerrainHydrology.y\*\(1\.-smoothstep\(\.02,\.12,vTerrainHydrology.w\)\)/);
  assert.match(shader.fragmentShader,/shoreZones\(terrainWetness,terrainPhysicalBed,/);
  assert.equal((shader.fragmentShader.match(/uniform (?:highp )?sampler2D(?:Array)? terrain\w+;/g)||[]).length,3,"no new sampler or shore atlas");
  dispose(result);
});
