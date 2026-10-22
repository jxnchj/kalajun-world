import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {createWaterRefractionUniforms,WaterRefractionCapture,supportsWaterRefraction,waterViewFromDepth,waterRefractedRay} from "./water-refraction.js";
import {createWaterMaterial,createWaterGeometry,createRiverPhaseData} from "./water.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
const close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function camera(){const c=new THREE.PerspectiveCamera(52,1.5,.25,150000);c._reversedDepth=true;c.updateProjectionMatrix();c.position.set(0,2,5);c.lookAt(0,0,0);c.updateMatrixWorld();return c;}
function fixture(){
  const gl={READ_FRAMEBUFFER:1,DRAW_FRAMEBUFFER:2,READ_FRAMEBUFFER_BINDING:3,DRAW_FRAMEBUFFER_BINDING:4,SCISSOR_TEST:5,FRAMEBUFFER_COMPLETE:6,COLOR_BUFFER_BIT:16,DEPTH_BUFFER_BIT:32,NEAREST:7,
    read:{oldRead:true},draw:{oldDraw:true},scissor:true,blits:[],getParameter(k){return k===3?this.read:this.draw;},isEnabled(){return this.scissor;},checkFramebufferStatus(){return this.incomplete?-1:6;},
    blitFramebuffer(...args){if(this.fail)throw new Error("blit failed");this.blits.push({args,read:this.read,draw:this.draw,scissor:this.scissor});}};
  const source=new THREE.WebGLRenderTarget(600,400,{type:THREE.HalfFloatType,colorSpace:THREE.LinearSRGBColorSpace,depthTexture:new THREE.DepthTexture(600,400,THREE.FloatType),samples:4});
  const saved={prior:true},properties=new WeakMap(),get=p=>{if(!properties.has(p))properties.set(p,{});return properties.get(p);};
  get(source).__webglMultisampledFramebuffer={sourceMSAA:true};
  const r={capabilities:{reversedDepthBuffer:true,logarithmicDepthBuffer:false},target:saved,face:2,level:1,properties:{get},
    getContext:()=>gl,getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.level;},
    setRenderTarget(target,face=0,level=0){this.target=target;this.face=face;this.level=level;gl.read=gl.draw=target===source?get(source).__webglMultisampledFramebuffer:saved;},
    initRenderTarget(target){if(this.failInit)throw new Error("allocation failed");get(target).__webglFramebuffer??={snapshot:true};gl.draw={temporary:true};},
    state:{bindFramebuffer(kind,fbo){if(kind===gl.READ_FRAMEBUFFER)gl.read=fbo;else gl.draw=fbo;},setScissorTest(v){gl.scissor=v;}}};
  const uniforms=createWaterRefractionUniforms(),capture=new WaterRefractionCapture(uniforms),c=camera();
  return{r,gl,source,saved,c,uniforms,capture};
}

test("reversed Float32 reconstructs metre depths across the unchanged geographic camera range",()=>{
  const c=camera();
  for(const z of [-.25,-2,-20,-800,-150000])for(const ratio of [-.25,0,.3]){
    const point=new THREE.Vector3(-z*ratio,-z*.1,z),clip=new THREE.Vector4(...point.toArray(),1).applyMatrix4(c.projectionMatrix);
    const uv=new THREE.Vector2(clip.x/clip.w*.5+.5,clip.y/clip.w*.5+.5),depth=Math.fround(clip.z/clip.w),decoded=waterViewFromDepth(c,uv,depth);
    assert.ok(decoded.distanceTo(point)<Math.max(1e-6,point.length()*1e-7));
  }
  assert.equal(c.near,.25);assert.equal(c.far,150000);
});
test("Snell refraction stays in the submerged hemisphere, at normal incidence does not shift",()=>{
  const n=new THREE.Vector3(0,1,0);
  for(let degrees=0;degrees<90;degrees+=.5){const a=degrees*Math.PI/180,i=new THREE.Vector3(Math.sin(a),-Math.cos(a),0),r=waterRefractedRay(i,n);
    close(r.length(),1);assert.ok(r.y<0);close(r.x,Math.sin(a)/1.333);assert.ok(-r.y>.66);
  }
  assert.deepEqual(waterRefractedRay(new THREE.Vector3(0,-1,0),n).toArray(),[0,-1,0]);
});
test("unsupported/log/depth-mismatched frames and A/B off never activate scene sampling",()=>{
  for(const alter of [f=>f.r.capabilities.logarithmicDepthBuffer=true,f=>f.source.depthTexture.type=THREE.UnsignedIntType,f=>f.c._reversedDepth=false,f=>f.source.scissorTest=true]){
    const f=fixture();assert.ok(supportsWaterRefraction(f.r,f.c,f.source));alter(f);assert.equal(supportsWaterRefraction(f.r,f.c,f.source),false);f.capture.dispose();f.source.dispose();
  }
  const f=fixture();
  f.uniforms.uWaterRefraction.value=0;assert.equal(f.capture.prepare(f.r,f.c,f.source),false);assert.equal(f.capture.target,null);assert.equal(f.uniforms.uRiverRefractionValid.value,0);
  f.capture.dispose();f.source.dispose();
});
test("opaque marker resolves current MSAA color+depth once, restores framebuffer/scissor and never renders the scene",()=>{
  const f=fixture();f.r.render=()=>assert.fail("capture must not render another scene");
  assert.equal(f.capture.prepare(f.r,f.c,f.source),true);assert.equal(f.r.target,f.saved);assert.equal(f.r.face,2);assert.equal(f.r.level,1);
  const t=f.capture.target;assert.notEqual(t,f.source);assert.equal(t.samples,0);assert.equal(t.texture.type,THREE.HalfFloatType);assert.equal(t.depthTexture.type,THREE.FloatType);
  assert.equal(t.texture.colorSpace,THREE.LinearSRGBColorSpace);assert.equal(t.depthTexture.minFilter,THREE.NearestFilter);
  f.r.setRenderTarget(f.source);const before={read:f.gl.read,draw:f.gl.draw,scissor:f.gl.scissor};
  assert.equal(f.capture.capture(f.r,f.c),true);assert.equal(f.gl.blits.length,1);assert.equal(f.gl.blits[0].read,before.draw);
  assert.notEqual(f.gl.blits[0].read,f.gl.blits[0].draw);assert.deepEqual(f.gl.blits[0].args,[0,0,600,400,0,0,600,400,48,7]);
  assert.equal(f.gl.blits[0].scissor,false);assert.equal(f.gl.read,before.read);assert.equal(f.gl.draw,before.draw);assert.equal(f.gl.scissor,before.scissor);
  assert.equal(f.uniforms.uRiverRefractionValid.value,1);assert.equal(f.capture.capture(f.r,f.c),false);
  assert.equal(f.capture.capture(f.r,f.c.clone()),false);assert.equal(f.gl.blits.length,1);
  assert.equal(f.capture.marker.material.depthWrite,false);assert.equal(f.capture.marker.castShadow,false);assert.equal(f.capture.marker.userData.waterReflectionSurface,true);
  f.capture.prepare(f.r,f.c,f.source,{nearWater:false});assert.equal(f.uniforms.uRiverRefractionValid.value,0);assert.equal(f.capture.marker.visible,false);
  f.capture.dispose();f.source.dispose();
});
test("allocation and blit failures restore state, invalidate stale data and block repeated failing captures",()=>{
  for(const failure of ["allocation","blit","incomplete"]){
    const f=fixture();if(failure==="allocation")f.r.failInit=true;
    const prepared=f.capture.prepare(f.r,f.c,f.source);assert.equal(f.r.target,f.saved);
    if(failure==="allocation"){assert.equal(prepared,false);assert.equal(f.capture.stats.failures,1);}
    else{
      f.r.setRenderTarget(f.source);const read=f.gl.read,draw=f.gl.draw;
      f.gl.fail=failure==="blit";f.gl.incomplete=failure==="incomplete";
      assert.equal(f.capture.capture(f.r,f.c),false);assert.equal(f.gl.read,read);assert.equal(f.gl.draw,draw);assert.equal(f.gl.scissor,true);
    }
    assert.equal(f.uniforms.uRiverRefractionValid.value,0);assert.equal(f.capture.marker.visible,false);
    assert.equal(f.capture.prepare(f.r,f.c,f.source),false);assert.equal(f.capture.stats.failures,1);
    f.capture.dispose();f.source.dispose();
  }
});
test("physical resize releases both textures, invalidates old capture and disposal is idempotent",()=>{
  const f=fixture();f.capture.prepare(f.r,f.c,f.source);const first=f.capture.target,events=[0,0];
  first.addEventListener("dispose",()=>events[0]++);first.depthTexture.addEventListener("dispose",()=>events[1]++);
  f.r.setRenderTarget(f.source);f.capture.capture(f.r,f.c);f.source.setSize(1200,800);f.capture.prepare(f.r,f.c,f.source);
  assert.deepEqual(events,[1,1]);assert.equal(f.uniforms.uRiverRefractionValid.value,0);assert.equal(f.capture.checked,false);
  assert.equal(f.capture.stats.attachmentBytes,1200*800*12);assert.deepEqual(f.uniforms.uRiverSceneSize.value.toArray(),[1200,800]);
  const next=f.capture.target;let releases=0;next.addEventListener("dispose",()=>releases++);next.depthTexture.addEventListener("dispose",()=>releases++);
  f.capture.dispose();f.capture.dispose();assert.equal(releases,2);assert.equal(f.capture.stats.attachmentBytes,0);assert.equal(f.uniforms.uRiverSceneColor.value,null);assert.equal(f.uniforms.uRiverSceneDepth.value,null);
  assert.equal(f.capture.prepare(f.r,f.c,f.source),false);assert.throws(()=>f.capture.setSize(1,1),/disposed/);f.source.dispose();
});
test("installed Three invokes the marker after opaque but before transparent and before the draw-range path",()=>{
  const source=readFileSync(new URL("../../node_modules/three/src/renderers/WebGLRenderer.js",import.meta.url),"utf8");
  const renderScene=source.slice(source.indexOf("function renderScene("),source.indexOf("function renderTransmissionPass("));
  assert.ok(renderScene.indexOf("renderObjects( opaqueObjects")<renderScene.indexOf("renderObjects( transparentObjects"));
  const renderObject=source.slice(source.indexOf("function renderObject("),source.indexOf("function getProgram("));
  assert.ok(renderObject.indexOf("object.onBeforeRender")<renderObject.indexOf("_this.renderBufferDirect"));
  const lists=readFileSync(new URL("../../node_modules/three/src/renderers/webgl/WebGLRenderLists.js",import.meta.url),"utf8");
  assert.match(lists,/a.renderOrder - b.renderOrder/); // Transparent comparator preserves explicit order.
});
test("water-only scene samplers preserve the PBR light path and composite after aerial before tone mapping",async()=>{
  const {WorldEnvironment}=await import("./environment.js"),{CSM}=await import("three/addons/csm/CSM.js");
  const {createCloudUniforms}=await import("./cloud-field.js"),{createAerialUniforms}=await import("./aerial-perspective.js");
  const scene=new THREE.Scene(),c=camera(),csm=new CSM({camera:c,parent:scene,cascades:3,maxFar:500,shadowMapSize:256});
  const env={camera:c,csm,registered:new Set(),clouds:createCloudUniforms(),aerial:createAerialUniforms(new THREE.Vector3(0,1,0))};
  const u=createWaterRefractionUniforms(),materials=[createWaterMaterial(u),createWaterMaterial(u,{overview:true})];WorldEnvironment.prototype.register.call(env,materials);
  for(const m of materials){const s={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};m.onBeforeCompile(s);
    assert.strictEqual(s.uniforms.uWaterRefraction,u.uWaterRefraction);assert.strictEqual(s.uniforms.uRiverSceneColor,u.uRiverSceneColor);
    assert.ok(s.fragmentShader.indexOf("gl_FragColor.rgb = applyAerialPerspective")<s.fragmentShader.indexOf("float compositeCoverage="));
    assert.ok(s.fragmentShader.indexOf("float compositeCoverage=")<s.fragmentShader.indexOf("#include <tonemapping_fragment>"));
    assert.match(s.fragmentShader,/localReflection.rgb-radiance/);assert.match(s.fragmentShader,/riverSpecular=totalSpecular/);
    assert.match(s.fragmentShader,/riverRefractedTransmission=exp\(-vec3\(.52,.18,.11\)\*riverRefractedPath\)/);
    assert.doesNotMatch(s.fragmentShader,/hit.z>=surfaceView.z/);assert.match(s.fragmentShader,/hydraulicView=normalize\(nonPerturbedNormal\)/);assert.match(s.fragmentShader,/wetDepth<=.001/);assert.match(s.fragmentShader,/border=min\(candidate,1.0-candidate\)/);
    assert.equal(m.transmission,0);assert.doesNotMatch(s.fragmentShader,/gl_FragDepth/);
  }
  materials.forEach(m=>m.dispose());csm.remove();csm.dispose();
});


test("measured bed path cannot create energy; zero thickness and disabled composition recover the original bed",()=>{
  const weights=[.2126,.7152,.0722];
  for(const thickness of [0,.001,.02,.2,.8,2])for(const cosine of [0,.2,.7,1]){
    const ray=waterRefractedRay(new THREE.Vector3(Math.sqrt(1-cosine*cosine),-cosine,0),new THREE.Vector3(0,1,0));
    const path=thickness/-ray.y,T=[.52,.18,.11].map(a=>Math.exp(-a*path)),absorption=1-T.reduce((v,t,i)=>v+t*weights[i],0);
    assert.ok(absorption>=0&&absorption<=1);T.forEach(t=>assert.ok(t>=0&&t<=1));
    for(const edge of [0,.1,.5,1])for(const fresnel of [.02037,.4,.95]){
      const body=absorption*edge,coverage=body+(1-body)*fresnel*edge;
      for(const blend of [0,.25,1]){
        const alpha=coverage*(1-blend)+edge*blend;
        assert.ok(alpha>=0&&alpha<=1);
        if(blend===0)close(alpha,coverage);
        if(thickness===0){const transmitted=(1-fresnel)*edge*blend,surface=fresnel*edge;close(surface+transmitted+1-alpha,1);}
      }
    }
  }
});


test("offset-ray water-plane check retains submerged rising beds but rejects dry foreground",()=>{
  // Camera looks nearly along the water. The shallow bank under the offset ray
  // is legitimately closer than the original fragment on another camera ray.
  const normal=new THREE.Vector3(0,.98,.2).normalize(),surface=new THREE.Vector3(0,-.9,-6);
  const hit=surface.clone().add(new THREE.Vector3(.15,-.3,.8));
  assert.ok(hit.z>surface.z);assert.ok(-hit.clone().sub(surface).dot(normal)>.1);
  const ray=hit.clone().normalize(),crossing=surface.dot(normal)/ray.dot(normal);
  assert.ok(crossing>0&&hit.length()>crossing,"hit is behind its own ray's water-plane crossing");
  const dry=surface.clone().addScaledVector(normal,.02);
  assert.ok(-dry.clone().sub(surface).dot(normal)<0,"dry reeds/rocks remain rejected regardless of view Z");
});

test("actual river metadata keeps travel phase distinct from hydraulic slope and accepts submerged shore rays",t=>{
  const root=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,root))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
  const meta=json("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
  const world=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
    coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
    detailBytes:bin("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
  const phase=createRiverPhaseData(world.hydrology.lines),p=world.hydrology.viewpoints.find(p=>p.id==="river-valley"),segments=world.hydrology.nearSegments(p.x,p.z,80);
  for(const segment of segments){
    const a=phase.get(segment.a),b=phase.get(segment.b),geometry=createWaterGeometry([segment],{detail:true,phaseData:phase}),values=geometry.attributes.aRiverPhase;
    assert.equal(values.getX(0),Math.fround(a.phase));assert.equal(values.getY(0),Math.fround(a.slope));assert.equal(values.getZ(0),Math.fround(a.speed));
    assert.equal(values.getY(values.count-1),Math.fround(b.slope));assert.equal(geometry.attributes.aRiver.getZ(0),Math.fround(segment.slope));
    assert.ok(a.phase>1000&&a.slope<.2,"phase metres must never be used as a hydraulic slope");geometry.dispose();
  }
  const geometry=createWaterGeometry(segments,{detail:true,phaseData:phase}),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  const c=camera();c.aspect=2179/1218;c.updateProjectionMatrix();c.position.set(p.x,world.surface.heightAt(p.x,p.z)+p.above,p.z);
  const yaw=p.yaw*Math.PI/180,pitch=p.pitch*Math.PI/180;
  c.lookAt(c.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));c.updateMatrixWorld();
  const caster=new THREE.Raycaster(),tmp=new THREE.Vector3();
  const bedHit=ray=>{let last=0;for(let distance=.02;distance<160;distance+=.1){ray.at(distance,tmp);if(tmp.y<=world.surface.heightAt(tmp.x,tmp.z)){
    let lo=last,hi=distance;for(let i=0;i<18;i++){const mid=(lo+hi)/2;ray.at(mid,tmp);if(tmp.y>world.surface.heightAt(tmp.x,tmp.z))lo=mid;else hi=mid;}
    return ray.at((lo+hi)/2,new THREE.Vector3());}last=distance;}return null;};
  let water=0,accepted=0,formerlyRejected=0;
  for(let y=-.8;y<.5;y+=.1)for(let x=-.9;x<.95;x+=.1){
    caster.setFromCamera(new THREE.Vector2(x,y),c);const hit=caster.intersectObject(mesh)[0];if(!hit||hit.distance>80)continue;water++;
    const baseWorld=bedHit(caster.ray);if(!baseWorld)continue;
    const face=hit.face,bary=hit.barycoord||THREE.Triangle.getBarycoord(hit.point,...[face.a,face.b,face.c].map(i=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i)),new THREE.Vector3());
    const attribute=(name,index)=>geometry.attributes[name].getComponent(face.a,index)*bary.x+geometry.attributes[name].getComponent(face.b,index)*bary.y+geometry.attributes[name].getComponent(face.c,index)*bary.z;
    const normal=new THREE.Vector3(attribute("normal",0),attribute("normal",1),attribute("normal",2)).normalize().transformDirection(c.matrixWorldInverse);
    const surface=hit.point.clone().applyMatrix4(c.matrixWorldInverse),base=baseWorld.applyMatrix4(c.matrixWorldInverse),depth=-base.clone().sub(surface).dot(normal),maxDepth=Math.max(.4,attribute("aRiver",0)*3);
    if(base.z>=surface.z-.001||depth<=.001||depth>maxDepth)continue;
    const refracted=waterRefractedRay(surface.clone().normalize(),normal),under=-refracted.dot(normal);if(under<=.15)continue;
    const target=surface.clone().addScaledVector(refracted,depth/under),projected=target.clone().applyMatrix4(c.projectionMatrix);
    caster.setFromCamera(new THREE.Vector2(projected.x,projected.y),c);const offsetHit=bedHit(caster.ray);if(!offsetHit)continue;
    offsetHit.applyMatrix4(c.matrixWorldInverse);const wetDepth=-offsetHit.clone().sub(surface).dot(normal);
    if(wetDepth<=.001||wetDepth>maxDepth)continue;
    const candidateRay=offsetHit.clone().normalize(),crossing=surface.dot(normal)/candidateRay.dot(normal);
    assert.ok(crossing>0&&offsetHit.length()>crossing,"accepted bed lies behind its own ray's water crossing");accepted++;
    if(offsetHit.z>=surface.z-.001)formerlyRejected++;
  }
  assert.ok(water>=60&&accepted>=50);assert.ok(formerlyRejected>=10,"actual shore exposes the old cross-pixel Z comparison error");
  t.diagnostic(JSON.stringify({waterRays:water,submergedCandidates:accepted,formerlyRejectedByCrossPixelZ:formerlyRejected,scope:"physical bed and rendered water geometry; no GPU footprint/stone occlusion emulation"}));
  geometry.dispose();mesh.material.dispose();
});
