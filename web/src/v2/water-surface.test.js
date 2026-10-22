import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {WATER_SURFACE,waterSlopePixels,sampleWaterSlope,waterOpticalPath,bindWaterSlopeField,waterFlowResponse,waterReflectionResponse} from "./water-surface.js";
import {createWaterMaterial,createWaterGeometry,createRiverPhaseData,createShoreRockMaterial} from "./water.js";
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,a+" != "+b);
const shader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader});

test("slope bake is a bounded zero-mean periodic gradient with two directionally distributed bands",()=>{
  const field=waterSlopePixels(),n=WATER_SURFACE.size;
  assert.strictEqual(field,waterSlopePixels());assert.equal(field.data.byteLength,262144);
  assert.deepEqual(field.bands.map(b=>b.length),[16,24]);
  for(const band of field.bands){
    let xx=0,yy=0;
    for(const m of band){assert.ok(Number.isInteger(m.x)&&Number.isInteger(m.y));xx+=m.dx*m.dx*m.amplitude*m.amplitude;yy+=m.dy*m.dy*m.amplitude*m.amplitude;}
    assert.ok(xx/yy>.5&&xx/yy<2,"slope energy must not collapse into parallel cross-river rows");
    const frequencies=band.map(m=>Math.hypot(m.x,m.y));
    assert.ok(Math.max(...frequencies)/Math.min(...frequencies)>2.5);
  }
  for(let c=0;c<4;c++){
    let sum=0,min=255,max=0;
    for(let i=c;i<field.data.length;i+=4){sum+=field.data[i]/255*2-1;min=Math.min(min,field.data[i]);max=Math.max(max,field.data[i]);}
    assert.ok(Math.abs(sum/(n*n))<.0001);assert.ok(max-min>180);
  }
  for(const [u,v] of [[-.81,17.311],[0,0],[.999999,.5],[.13,-.26]]){
    const a=sampleWaterSlope(u,v),b=sampleWaterSlope(u+1,v-2);a.forEach((value,c)=>close(value,b[c]));
  }
  for(const [x,y]of [[0,0],[92,131],[255,255]]){
    const f=sampleWaterSlope((x+.5)/n,(y+.5)/n);
    f.forEach((value,c)=>close(value,field.data[(y*n+x)*4+c]/255*2-1));
  }
  for(const axis of [0,1]){const a=[.17,.31],b=[.17,.31];a[axis]=-.0000001;b[axis]=.0000001;
    sampleWaterSlope(...a).forEach((value,c)=>assert.ok(Math.abs(value-sampleWaterSlope(...b)[c])<.0001));}
  field.variance.forEach(v=>assert.ok(v>.05&&v<.3));
});
test("one water-only texture is shared, mip filtered and freed after its last owning material",()=>{
  const a=new THREE.MeshPhysicalMaterial(),b=new THREE.MeshPhysicalMaterial(),ua=bindWaterSlopeField(a),ub=bindWaterSlopeField(b),map=ua.uRiverSlopeMap.value;
  assert.strictEqual(ua,bindWaterSlopeField(a));assert.strictEqual(map,ub.uRiverSlopeMap.value);
  assert.equal(map.colorSpace,THREE.NoColorSpace);assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(map.generateMipmaps,true);
  assert.deepEqual(ua.uRiverSlopeVariance.value.toArray(),waterSlopePixels().variance);
  let disposed=0;map.addEventListener("dispose",()=>disposed++);
  a.dispose();a.dispose();assert.equal(disposed,0);b.dispose();assert.equal(disposed,1);
  const next=new THREE.MeshPhysicalMaterial();assert.notEqual(bindWaterSlopeField(next).uRiverSlopeMap.value,map);next.dispose();
  const rock=createShoreRockMaterial(),s=shader();rock.onBeforeCompile(s);
  assert.equal(s.uniforms.uRiverSlopeMap,undefined);assert.ok(!s.fragmentShader.includes("uniform sampler2D uRiverSlopeMap"));rock.dispose();
});
test("submerged optical path is finite at grazing views and absorption remains passive",()=>{
  for(const depth of [0,.006,.03,.18,.8,1.5]){
    let previous=Infinity;
    for(let i=0;i<=100;i++){
      const path=waterOpticalPath(depth,i/100);assert.ok(Number.isFinite(path));assert.ok(path>=depth-1e-12);
      assert.ok(path<=depth*1.513+1e-12);assert.ok(path<=previous+1e-12);previous=path;
      const transmitted=WATER_SURFACE.absorption.map(c=>Math.exp(-c*path));
      transmitted.forEach(t=>assert.ok(t>0&&t<=1));
      assert.ok(transmitted[0]<=transmitted[1]&&transmitted[1]<=transmitted[2]);
    }
    close(waterOpticalPath(depth,1),depth);
  }
  close(waterOpticalPath(0,0),0);
});
test("both representations retain shared Float32 travel phase and interpolated speed at bends",()=>{
  const nodes=[{x:100,z:120,distance:0,level:100,width:1.2,depth:.2,flowX:1,flowZ:0},
    {x:104,z:120,distance:4,level:99.9,width:1.6,depth:.3,flowX:.8,flowZ:.6},
    {x:108,z:123,distance:9,level:99.2,width:2.2,depth:.45,flowX:.8,flowZ:.6}];
  const line={nodes},phase=createRiverPhaseData([line]),segments=nodes.slice(1).map((b,i)=>({id:"section:"+i,a:nodes[i],b,length:b.distance-nodes[i].distance,slope:(nodes[i].level-b.level)/(b.distance-nodes[i].distance)}));
  for(const detail of [false,true]){
    const left=createWaterGeometry([segments[0]],{detail,phaseData:phase}),right=createWaterGeometry([segments[1]],{detail,phaseData:phase}),rows=detail?5:2;
    assert.equal(left.attributes.aRiverPhase.itemSize,3);
    for(let side=0;side<rows;side++){
      const a=left.attributes.aRiverPhase,b=right.attributes.aRiverPhase;
      for(let c=0;c<3;c++)assert.equal(a.getComponent(a.count-rows+side,c),b.getComponent(side,c));
      assert.equal(a.getZ(a.count-rows+side),Math.fround(phase.get(nodes[1]).speed));
    }
    left.dispose();right.dispose();
  }
});
test("new water path uses two pre-discard filtered slope taps and retains independently switchable legacy lighting",()=>{
  const controls={uWaterSurfaceDetail:{value:1}},near=createWaterMaterial(controls),far=createWaterMaterial(controls,{overview:true});
  const shaders=[near,far].map(m=>{const s=shader();m.onBeforeCompile(s);return s;});
  assert.strictEqual(shaders[0].uniforms.uWaterSurfaceDetail,controls.uWaterSurfaceDetail);assert.strictEqual(shaders[1].uniforms.uWaterSurfaceDetail,controls.uWaterSurfaceDetail);
  assert.strictEqual(shaders[0].uniforms.uRiverSlopeMap.value,shaders[1].uniforms.uRiverSlopeMap.value);
  for(const s of shaders){
    const f=s.fragmentShader,split=f.indexOf("}else{",f.indexOf("if(uWaterSurfaceDetail>.5){"));
    assert.equal((f.match(/texture2D\(uRiverSlopeMap/g)||[]).length,2);
    assert.ok(f.indexOf("texture2D(uRiverSlopeMap,fineUV)")<f.indexOf("discard;"));
    assert.ok(f.indexOf("fwidth(vRiverWorld.xz)")<f.indexOf("discard;"));
    assert.ok(f.slice(split,f.indexOf("// Evaluate derivatives")).includes("cos(riverPhase)"),"A/B keeps the prior three-wave surface");
    for(const code of ["#include <lights_fragment_begin>","max(.045,riverDepth)","riverOpticalPath(riverDepth,cosView)","sqrt(riverUnresolved)*1.8",
      "localReflection.rgb*riverFresnel-reflectedLight.indirectSpecular","min(.22,min(bankRoom","reflectionOffset*=1.0-smoothstep(.12,.5,riverPixelFootprint)","reflectionBorder"])
      assert.ok(f.includes(code),code);
    assert.equal((f.match(/uniform sampler2D uRiverSlopeMap;/g)||[]).length,1);
    assert.ok(!f.includes("gl_FragDepth"));assert.doesNotMatch(f,/uniform sampler2D (tDepth|tDiffuse)\b/);
  }
  controls.uWaterSurfaceDetail.value=0;assert.equal(shaders[1].uniforms.uWaterSurfaceDetail.value,0);
  assert.equal(near.transmission,0);assert.equal(near.ior,1.333);near.dispose();far.dispose();
});

test("water detail composes with the live CSM, cloud and aerial hooks with optional scene-depth capture",async()=>{
  const {WorldEnvironment}=await import("./environment.js"),{CSM}=await import("three/addons/csm/CSM.js");
  const {createCloudUniforms}=await import("./cloud-field.js"),{createAerialUniforms}=await import("./aerial-perspective.js");
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.25,150000);camera.updateMatrixWorld();
  const csm=new CSM({camera,parent:scene,cascades:3,maxFar:500,shadowMapSize:256});
  const env={csm,registered:new Set(),clouds:createCloudUniforms(),aerial:createAerialUniforms(new THREE.Vector3(0,1,0))};
  const materials=[createWaterMaterial({}),createWaterMaterial({},{overview:true})];
  WorldEnvironment.prototype.register.call(env,materials);
  for(const m of materials){
    const s=shader();m.onBeforeCompile(s);
    assert.equal((s.vertexShader.match(/void main\(\)/g)||[]).length,1);
    assert.equal((s.fragmentShader.match(/uniform sampler2D uRiverSlopeMap;/g)||[]).length,1);
    assert.match(s.fragmentShader,/cloudDirectAttenuation = cloudTransmittance/);
    assert.match(s.fragmentShader,/applyAerialPerspective\(gl_FragColor.rgb, vCloudWorld\)/);
    assert.match(s.fragmentShader,/IncidentLight directLight/);
    assert.strictEqual(s.uniforms.uWorldCSMView.value,camera.matrixWorldInverse);
    assert.ok(s.uniforms.uRiverSlopeMap.value.isDataTexture);
  }
  materials.forEach(m=>m.dispose());csm.remove();csm.dispose();
});


test("rough local reflections preserve Three's DFG energy and never remove the sun or multiple scattering",async t=>{
  const {getDFGLUT}=await import("three/src/renderers/shaders/DFGLUTData.js"),lut=getDFGLUT().image;
  assert.equal(lut.width,16);assert.equal(lut.height,16);
  // Use all 256 actual half-float DFG entries, not a made-up Fresnel fixture.
  // A local source equal to the environment must not alter any shaded result.
  let maxLegacyRatio=0;
  for(let i=0;i<lut.data.length;i+=2){
    const dfg=[THREE.DataUtils.fromHalfFloat(lut.data[i]),THREE.DataUtils.fromHalfFloat(lut.data[i+1])];
    const {single,multi,coverage}=waterReflectionResponse(dfg);
    assert.ok(single>=0&&multi>=-1e-5&&coverage>=0&&coverage<=1);
    const cosView=(Math.floor(i/2/16)+.5)/16,roughness=((i/2)%16+.5)/16;
    if(roughness<=.35)maxLegacyRatio=Math.max(maxLegacyRatio,(.02037+.97963*(1-cosView)**5)/single);
    for(const sun of [0,.03,2,80])for(const environment of [.03,1,9])for(const weight of [0,.25,.5,1]){
      const irradiance=environment*.7,original=sun+environment*single+irradiance*multi;
      const same=original+weight*(environment-environment)*single;close(same,original);
      const darkLocal=original+weight*(0-environment)*single;
      close(darkLocal,sun+(1-weight)*environment*single+irradiance*multi,1e-12);
      // A few RG16F DFG entries sum slightly above 1, so Three's unchanged
      // multiple-scatter term can be minutely negative. Isolate the actual direct
      // term instead of assuming that quantized indirect energy is always >= 0.
      const darkWithoutSun=environment*single+irradiance*multi-weight*environment*single;
      close(darkLocal-darkWithoutSun,sun,1e-12);
      const local=4.5,result=original+weight*(local-environment)*single;
      close(result,sun+((1-weight)*environment+weight*local)*single+irradiance*multi,1e-12);
    }
  }
  assert.ok(maxLegacyRatio>2,"fixture must cover the original grazing roughness mismatch");
  t.diagnostic("Actual DFG LUT: old smooth-Fresnel local lobe reaches "+maxLegacyRatio.toFixed(3)+"x the rough IBL lobe within roughness <= .35; this is a response mismatch, not a screenshot brightness claim.");
  const chunk=THREE.ShaderChunk.lights_physical_pars_fragment;
  assert.ok(chunk.includes("vec3 indirectSpecular = radiance * singleScattering"));
  assert.ok(chunk.includes("indirectSpecular += multiScattering * cosineWeightedIrradiance"));
});

test("existing asymmetric shallows drive bounded flow and wave energy without creating a fast white bank ribbon",async()=>{
  const {riverSectionDepth}=await import("./river-section.js");
  for(const centerDepth of [.18,.4,.8])for(const speed of [.4,.9,1.8])for(const slope of [0,.02,.15])for(const weight of [0,1]){
    const section={depth:centerDepth,weight,barLeft:.15,barRight:.9};
    for(const sign of [-1,1]){
      let previousSpeed=Infinity;
      for(let k=0;k<=1000;k++){
        const across=sign*k/1000,depth=riverSectionDepth(section,across),r=waterFlowResponse(depth,centerDepth,across,speed,slope);
        assert.ok(Object.values(r).every(Number.isFinite));
        assert.ok(r.localSpeed>=0&&r.localSpeed<=speed*1.12+1e-9);
        assert.ok(r.localSpeed<=previousSpeed+1e-9);previousSpeed=r.localSpeed;
        assert.ok(r.riffle>=0&&r.riffle<=1);assert.ok(r.coarse>=.06&&r.fine>=.04);
        assert.ok(r.normalDamping>=0&&r.normalDamping<=1);
        if(k===1000){close(r.localSpeed,0);close(r.riffle,0);}
      }
    }
  }
  const deep=waterFlowResponse(.8,.8,0,.7,0),shoal=waterFlowResponse(.1,.4,.65,.9,.02),film=waterFlowResponse(.002,.4,.99,.9,.02);
  assert.ok(shoal.riffle>deep.riffle+.25);assert.ok(shoal.fine>deep.fine*2);
  assert.ok(film.riffle<.001&&film.localSpeed<.01);assert.equal(film.normalDamping,0);
});

test("optics A/B preserves its slope/reflection samples and keeps scene refraction independently optional",()=>{
  const controls={uWaterOpticsDetail:{value:1},uWaterSurfaceDetail:{value:1}},materials=[createWaterMaterial(controls),createWaterMaterial(controls,{overview:true})];
  for(const m of materials){
    const s=shader();m.onBeforeCompile(s);const f=s.fragmentShader,cut=f.indexOf("discard;");
    assert.strictEqual(s.uniforms.uWaterOpticsDetail,controls.uWaterOpticsDetail);
    assert.equal((f.match(/texture2D\(uRiverSlopeMap/g)||[]).length,2);
    assert.equal((f.match(/textureLod\(uRiverReflectionMap/g)||[]).length,1);
    assert.equal((f.match(/uniform sampler2D uRiver(?:SlopeMap|ReflectionMap);/g)||[]).length,2);
    assert.match(f,/uniform sampler2D uRiverSceneColor,uRiverSceneDepth;/);
    assert.match(f,/if\(uWaterRefraction>.001&&uRiverRefractionValid>.5/);
    assert.ok(f.indexOf("dFdx(uv)*uRiverReflectionSize")<cut);
    assert.ok(f.indexOf("dFdy(uv)*uRiverReflectionSize")<cut);
    assert.doesNotMatch(f.slice(cut),/\b(?:dFdx|dFdy|fwidth)\s*\(/);
    assert.ok(f.includes("max(reflectionLod,riverReflectionFootprintLod)"));
    assert.ok(f.includes("borderSupport=exp2(reflectionLod)"));
    assert.ok(f.includes("localReflection.rgb-radiance)*riverSingleScattering"));
    assert.ok(f.includes("else riverSpecular+=reflectionWeight*(localReflection.rgb*riverFresnel-reflectedLight.indirectSpecular)"));
    assert.ok(f.includes("if(uWaterOpticsDetail<.5)riverEdge="),"old coverage is explicitly preserved");
    assert.ok(f.includes("diffuseColor.a=(.018+.68*bodyAbsorption)*riverEdge"));
    assert.ok(f.includes("diffuseColor.a=.90*bodyAbsorption*riverEdge"));
    assert.ok(f.includes("normal=normalize(normal+(viewMatrix*vec4(-gradient.x"));
    controls.uWaterOpticsDetail.value=0;assert.equal(s.uniforms.uWaterOpticsDetail.value,0);controls.uWaterOpticsDetail.value=1;
    m.dispose();
  }
});

test("zero-depth body tint vanishes continuously while physical path absorption stays monotonic at every view angle",()=>{
  for(const cosView of [0,.02,.1,.3,.7,1]){
    let previous=0;
    for(let i=0;i<=1000;i++){
      const depth=i*.001,path=waterOpticalPath(depth,cosView);
      const tr=WATER_SURFACE.absorption.map(c=>Math.exp(-c*path));
      const opacity=.9*(1-(tr[0]*.2126+tr[1]*.7152+tr[2]*.0722));
      assert.ok(opacity>=previous-1e-12&&opacity>=0&&opacity<1);previous=opacity;
      if(i===0)close(opacity,0);
      if(i===1)assert.ok(opacity<.0004,"no fixed 1.8 percent coloured film at the shoreline");
    }
  }
});
