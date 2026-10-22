import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createHydrology} from "./hydrology.js";
import {createWaterMaterial} from "./water.js";
import {LocalWaterReflection,createWaterReflectionUniforms,createWaterReflectionCamera,selectWaterReflectionPatch} from "./water-reflection.js";
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function camera(reverse=true){const c=new THREE.PerspectiveCamera(52,1.8,.25,150000);c._reversedDepth=reverse;c.updateProjectionMatrix();return c;}
function data(){
  const h=createHydrology({streamData:{lines:[Array.from({length:61},(_,i)=>[(i-30)*4,0,3])]},heightAt:(x,z)=>100-x*.025+Math.abs(z)*.1});
  const c=camera(),y=h.sampleAt(0,0).waterLevel;c.position.set(0,y+2,8);c.lookAt(6,y,0);c.updateMatrixWorld();return {h,c,y};
}
function fixture(){
  const calls=[],physicalViewport=new THREE.Vector4(13,15,300,200),r={state:{viewport:v=>physicalViewport.copy(v)},getCurrentViewport:v=>v.copy(physicalViewport),capabilities:{logarithmicDepthBuffer:false,reversedDepthBuffer:true},extensions:{has:()=>true},
    target:{previous:true},face:3,level:1,size:new THREE.Vector2(1453,783),viewport:new THREE.Vector4(4,5,600,400),scissor:new THREE.Vector4(9,10,500,300),scissorTest:true,
    color:new THREE.Color(.2,.3,.4),alpha:.8,autoClear:false,autoClearColor:false,autoClearDepth:false,autoClearStencil:false,
    xr:{enabled:true},shadowMap:{enabled:true,autoUpdate:true,needsUpdate:true},toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.85,
    info:{autoReset:true,render:{frame:14,calls:456,triangles:6789,points:0,lines:0}},
    getDrawingBufferSize(v){return v.copy(this.size);},getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.level;},
    getViewport(v){return v.copy(this.viewport);},getScissor(v){return v.copy(this.scissor);},getScissorTest(){return this.scissorTest;},getClearColor(c){return c.copy(this.color);},getClearAlpha(){return this.alpha;},
    setRenderTarget(t,f=0,l=0){this.target=t;this.face=f;this.level=l;physicalViewport.set(0,0,t?.width??1453,t?.height??783);},setViewport(v){this.viewport.copy(v);physicalViewport.copy(v);},setScissor(v){this.scissor.copy(v);},setScissorTest(v){this.scissorTest=v;},setClearColor(c,a=1){this.color.set(c);this.alpha=a;},
    clear(...args){assert.deepEqual(args,[true,true,true]);if(this.failAt==="clear")throw new Error("clear failure");},
    render(scene,c){
      this.info.render.frame++;calls.push({scene,c,target:this.target,visible:scene.children.filter(o=>o.visible).map(o=>o.name)});
      assert.equal(this.shadowMap.autoUpdate,false);assert.equal(this.shadowMap.needsUpdate,false);assert.equal(this.xr.enabled,false);
      this.info.render.calls+=17;this.info.render.triangles+=1200;
      if(this.failAt==="render")throw new Error("render failure");
    }
  };return {r,calls};
}
function state(r){return {target:r.target,face:r.face,level:r.level,viewport:r.viewport.clone(),physicalViewport:r.getCurrentViewport(new THREE.Vector4()),scissor:r.scissor.clone(),scissorTest:r.scissorTest,color:r.color.clone(),alpha:r.alpha,
  clear:[r.autoClear,r.autoClearColor,r.autoClearDepth,r.autoClearStencil],xr:r.xr.enabled,shadow:{...r.shadowMap},autoReset:r.info.autoReset,
  toneMapping:r.toneMapping,exposure:r.toneMappingExposure,counters:{calls:r.info.render.calls,triangles:r.info.render.triangles,points:r.info.render.points,lines:r.info.render.lines}};}
test("actual Three reverse/standard projections and frustums clip below horizontal/sloped water without changing the main camera",()=>{
  for(const reverse of [false,true])for(const slope of [0,.08,.2]){
    const c=camera(reverse),center=new THREE.Vector3(2400,1940,-3600),normal=new THREE.Vector3(slope,1,slope*.4).normalize(),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center);
    c.position.copy(center).add(new THREE.Vector3(2,4,12));c.lookAt(center);c.updateMatrixWorld();
    const originalProjection=c.projectionMatrix.clone(),originalWorld=c.matrixWorld.clone(),mirror=createWaterReflectionCamera(c,plane,{clipAllowance:0});assert.ok(mirror);
    assert.equal(mirror.reversedDepth,reverse);assert.equal(mirror.far,220);near(plane.distanceToPoint(mirror.position),-plane.distanceToPoint(c.position));
    const surface=center.clone().project(mirror),above=center.clone().addScaledVector(normal,.5).project(mirror),below=center.clone().addScaledVector(normal,-.5).project(mirror);
    near(surface.z,reverse?1:-1,1e-9);assert.ok(reverse?above.z<1&&above.z>0:above.z>-1&&above.z<1);assert.ok(reverse?below.z>1:below.z< -1);
    const f=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse),mirror.coordinateSystem,mirror.reversedDepth);
    assert.equal(f.containsPoint(center.clone().addScaledVector(normal,.5)),true);assert.equal(f.containsPoint(center.clone().addScaledVector(normal,-.5)),false);
    new THREE.Matrix4().multiplyMatrices(mirror.projectionMatrix,mirror.projectionMatrixInverse).elements.forEach((v,i)=>near(v,i%5===0?1:0,1e-9));
    assert.deepEqual(c.projectionMatrix,originalProjection);assert.deepEqual(c.matrixWorld,originalWorld);
  }
});
test("local patch follows channel slope; distant, submerged and away-facing cameras never capture",()=>{
  const {h,c}=data(),p=selectWaterReflectionPatch(h,c);assert.ok(p);assert.ok(p.plane.normal.y>.99&&p.plane.normal.x>0);near(p.plane.distanceToPoint(p.center),0);
  c.position.x+=.01;c.updateMatrixWorld();assert.equal(selectWaterReflectionPatch(h,c,p),p);
  const below=c.clone();below.position.y=p.center.y-1;below.updateMatrixWorld();assert.equal(selectWaterReflectionPatch(h,below),null);
  const far=c.clone();far.position.y+=50;far.updateMatrixWorld();assert.equal(selectWaterReflectionPatch(h,far),null);
  const away=c.clone();away.lookAt(away.position.clone().add(new THREE.Vector3(0,0,10)));away.updateMatrixWorld();assert.equal(selectWaterReflectionPatch(h,away),null);
});
test("real resident stones/trees are captured while water feedback/far objects are excluded and all touched main state is restored",()=>{
  const {h,c,y}=data(),{r,calls}=fixture(),u=createWaterReflectionUniforms(),surface=new THREE.MeshStandardMaterial(),reflection=new LocalWaterReflection(h,u,{waterMaterials:[surface]});
  const scene=new THREE.Scene(),g=new THREE.BoxGeometry(),m=new THREE.MeshStandardMaterial();
  const mesh=(name,pos,mat=m)=>{const o=new THREE.Mesh(g,mat);o.name=name;o.position.set(...pos);scene.add(o);return o;};
  const water=mesh("water",[0,y,0],surface),stone=mesh("stone",[2,y+.3,1]),tree=mesh("spruce",[7,y+6,-8]),far=mesh("far",[1000,y+10,0]),hidden=mesh("hidden",[0,y,0]);hidden.visible=false;
  const sky=mesh("sky",[10000,5000,0]);sky.isSky=true;
  const light=new THREE.DirectionalLight();light.castShadow=true;light.position.set(20,100,20);light.shadow.needsUpdate=true;scene.add(light);
  const before=state(r),lp=light.position.clone(),projection=light.shadow.camera.projectionMatrix.clone();
  assert.equal(reflection.render(r,scene,c,{now:0}),true);assert.equal(calls.length,1);
  for(const name of [stone.name,tree.name,sky.name])assert.ok(calls[0].visible.includes(name));for(const name of [water.name,far.name,hidden.name])assert.ok(!calls[0].visible.includes(name));
  assert.equal(water.visible,true);assert.equal(far.visible,true);assert.equal(hidden.visible,false);assert.deepEqual(state(r),before);assert.equal(r.info.render.frame,15);
  assert.deepEqual(light.position,lp);assert.deepEqual(light.shadow.camera.projectionMatrix,projection);assert.equal(light.shadow.needsUpdate,true);
  assert.deepEqual(u.uRiverReflectionSize.value.toArray(),[reflection.target.width,reflection.target.height]);assert.equal(reflection.target.width,512);assert.equal(reflection.target.samples,0);assert.equal(reflection.target.depthTexture.type,THREE.FloatType);assert.equal(reflection.target.texture.type,THREE.HalfFloatType);
  assert.equal(reflection.target.texture.colorSpace,THREE.LinearSRGBColorSpace);assert.equal(reflection.target.texture.generateMipmaps,true);assert.equal(reflection.stats.lastCalls,17);assert.equal(reflection.stats.lastTriangles,1200);
  assert.ok(reflection.stats.estimatedAttachmentBytes<3e6);assert.equal(u.uRiverReflectionValid.value,1);reflection.dispose();g.dispose();m.dispose();surface.dispose();
});
test("clear/render failures restore visibility and renderer policies without publishing invalid image data",()=>{
  for(const failAt of ["clear","render"]){
    const {h,c}=data(),{r}=fixture(),u=createWaterReflectionUniforms(),m=new THREE.MeshStandardMaterial(),reflection=new LocalWaterReflection(h,u,{waterMaterials:[m]}),scene=new THREE.Scene(),water=new THREE.Mesh(new THREE.PlaneGeometry(),m);scene.add(water);
    const before=state(r);r.failAt=failAt;assert.throws(()=>reflection.render(r,scene,c,{now:0}),new RegExp(failAt+" failure"));
    assert.deepEqual(state(r),before);assert.equal(water.visible,true);assert.equal(u.uRiverReflectionValid.value,0);assert.equal(reflection.stats.captures,0);assert.equal(reflection.rendering,false);
    reflection.dispose();water.geometry.dispose();m.dispose();
  }
});
test("update cadence is bounded; cached matrix/image remain paired; movement invalidates; offsite and dispose reclaim resources",()=>{
  const {h,c}=data(),{r,calls}=fixture(),u=createWaterReflectionUniforms(),reflection=new LocalWaterReflection(h,u),scene=new THREE.Scene();
  reflection.render(r,scene,c,{now:0});const matrix=u.uRiverReflectionMatrix.value.clone();assert.equal(reflection.render(r,scene,c,{now:.1}),false);
  c.position.x+=.05;c.updateMatrixWorld();reflection.prepare(c);assert.ok(u.uRiverReflectionValid.value>0);assert.deepEqual(u.uRiverReflectionMatrix.value,matrix);
  assert.equal(reflection.render(r,scene,c,{now:.11}),true);c.position.x+=.05;c.updateMatrixWorld();assert.equal(reflection.render(r,scene,c,{now:.13}),false);
  assert.equal(reflection.render(r,scene,c,{now:.13,lightingRevision:1}),true);assert.equal(calls.length,3);
  c.position.x+=2;c.updateMatrixWorld();reflection.prepare(c);assert.equal(u.uRiverReflectionValid.value,0);
  const counts=[0,0];reflection.target.addEventListener("dispose",()=>counts[0]++);reflection.target.depthTexture.addEventListener("dispose",()=>counts[1]++);
  c.position.y+=100;c.updateMatrixWorld();assert.equal(reflection.render(r,scene,c,{now:22}),false);assert.deepEqual(counts,[1,1]);assert.equal(reflection.target,null);assert.equal(u.uRiverReflectionMap.value,null);assert.deepEqual(u.uRiverReflectionSize.value.toArray(),[1,1]);
  r.capabilities.logarithmicDepthBuffer=true;reflection.render(r,scene,c,{now:23});assert.equal(reflection.stats.supported,false);assert.equal(reflection.stats.reason,"needs-standard-or-reversed-float-depth");
  reflection.dispose();reflection.dispose();assert.throws(()=>reflection.render(r,scene,c),/disposed/);
});
test("resize releases old HDR/depth pair once and keeps bounded physical pixel dimensions",()=>{
  const {h,c}=data(),{r}=fixture(),reflection=new LocalWaterReflection(h,createWaterReflectionUniforms()),scene=new THREE.Scene();reflection.render(r,scene,c,{now:0});
  const counts=[0,0,0,0];reflection.target.addEventListener("dispose",()=>counts[0]++);reflection.target.depthTexture.addEventListener("dispose",()=>counts[1]++);
  r.size.set(600,900);reflection.render(r,scene,c,{now:.1});assert.equal(reflection.target.height,512);assert.deepEqual(counts,[1,1,0,0]);assert.deepEqual(reflection.uniforms.uRiverReflectionSize.value.toArray(),[reflection.target.width,reflection.target.height]);
  reflection.target.addEventListener("dispose",()=>counts[2]++);reflection.target.depthTexture.addEventListener("dispose",()=>counts[3]++);reflection.dispose();reflection.dispose();assert.deepEqual(counts,[1,1,1,1]);
});
test("local radiance replaces only indirect Fresnel while bed, direct light, plane/normal/edge and alpha validity remain",()=>{
  const m=createWaterMaterial({}),s={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};m.onBeforeCompile(s);assert.equal(s.uniforms.uRiverReflectionValid.value,0);
  assert.ok(s.fragmentShader.includes("localReflection.rgb*riverFresnel-reflectedLight.indirectSpecular"));for(const gate of ["planeError","patchDistance","hydraulicNormal","reflectionBorder","localReflection.a"])assert.ok(s.fragmentShader.includes(gate));
  assert.ok(s.fragmentShader.includes("totalDiffuse*riverBodyCoverage"));assert.ok(s.fragmentShader.includes("textureLod(uRiverReflectionMap"));assert.equal(m.transmission,0);m.dispose();
});


test("prepared mirror matrices remove only the renderer duplicate, retain fresh transforms, and restore on failure",()=>{
 for(const enabled of[false,true])for(const original of[true,false]){
  const {h,c,y}=data(),{r}=fixture(),scene=new THREE.Scene(),parent=new THREE.Group(),child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());parent.add(child);scene.add(parent);scene.matrixWorldAutoUpdate=original;
  const reflection=new LocalWaterReflection(h,createWaterReflectionUniforms(),{preparedMatrices:enabled});
  let propagations=0,hooks=0;const update=scene.updateMatrixWorld;scene.updateMatrixWorld=function(...args){propagations++;return update.apply(this,args);};
  const render=r.render;r.render=function(s,camera){
   // The installed renderer's exact scene-matrix/hook order.
   if(s.matrixWorldAutoUpdate===true)s.updateMatrixWorld();
   if(camera.parent===null&&camera.matrixWorldAutoUpdate===true)camera.updateMatrixWorld();
   s.onBeforeRender(this,s,camera,this.target);
   assert.equal(child.matrixWorld.elements[12],parent.position.x+child.position.x);
   return render.call(this,s,camera);
  };
  scene.onBeforeRender=()=>hooks++;
  for(let i=0;i<3;i++){
   parent.position.set(1+i,y+1,0);child.position.x=.25*i;const before=propagations;
   assert.equal(reflection.render(r,scene,c,{now:i}),true);
   assert.equal(propagations-before,1+Number(original&&!enabled));assert.equal(scene.matrixWorldAutoUpdate,original);
  }
  assert.equal(hooks,3);
  r.failAt="render";parent.position.x+=1;assert.throws(()=>reflection.render(r,scene,c,{now:4}),/render failure/);
  assert.equal(scene.matrixWorldAutoUpdate,original);assert.equal(reflection.rendering,false);assert.equal(child.visible,true);
  reflection.dispose();child.geometry.dispose();child.material.dispose();
 }
});


test("prepared mirror matrices are adopted by default and zero retains the duplicate-propagation comparison",()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,"location");
 try{
  for(const[search,enabled]of[["",true],["?reflectionPreparedMatrices=1",true],["?reflectionPreparedMatrices=0",false]]){
   Object.defineProperty(globalThis,"location",{configurable:true,value:{search}});
   const reflection=new LocalWaterReflection(null,createWaterReflectionUniforms());assert.equal(reflection.preparedMatrices,enabled);reflection.dispose();
  }
 }finally{if(prior)Object.defineProperty(globalThis,"location",prior);else delete globalThis.location;}
});
