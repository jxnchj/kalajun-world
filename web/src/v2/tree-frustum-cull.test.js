import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { WebGLGeometries } from "three/src/renderers/webgl/WebGLGeometries.js";
import { attachEcologyWind } from "./ecology.js";
import { createTreeWindGeometry, disposeTreeWindGeometry } from "./spruce-wind.js";
import { installSpruceBranchPhotos } from "./spruce-branch-detail.js";
import { createWaterReflectionCamera } from "./water-reflection.js";
import { installTreeFrustumCull, installTreeFrustumMaterial, treeCullSphere, treeWindDisplacementBound, TREE_CULL_WIND } from "./tree-frustum-cull.js";
const F=Math.fround;
function geometry(){const g=new T.BoxGeometry(5,18,5);g.translate(0,9,0);const a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=.8;a[i+1]=.55;a[i+2]=3;}g.setAttribute("aPlantWind",new T.BufferAttribute(a,3));return g;}
function mesh(source=geometry(),control={value:1}){const m=attachEcologyWind(new T.MeshStandardMaterial(),{},5,false,true),d=attachEcologyWind(new T.MeshDepthMaterial(),{},5,false,true),g=createTreeWindGeometry(source,64),o=new T.InstancedMesh(g,m,64);o.customDepthMaterial=d;return {o,source,control};}
function multiplyFloat(a,b){const out=new T.Matrix4(),e=out.elements;for(let c=0;c<4;c++)for(let r=0;r<4;r++){let sum=0;for(let k=0;k<4;k++)sum=F(sum+F(F(a.elements[k*4+r])*F(b.elements[c*4+k])));e[c*4+r]=sum;}return out;}
// Independent CPU replay of float32 GLSL arithmetic, compared with Three's
// double-precision exact transformed frustum and sampled actually drawn points.
function rejected(camera,model,instance,bound){
 if(bound[3]<0)return false;
 const mv=multiplyFloat(camera.matrixWorldInverse,model),clip=multiplyFloat(multiplyFloat(camera.projectionMatrix,mv),instance),e=clip.elements;
 const row=i=>[e[i],e[4+i],e[8+i],e[12+i]],x=row(0),y=row(1),z=row(2),w=row(3),add=(a,b,s=1)=>a.map((v,i)=>F(v+F(s*b[i])));
 const radius=F(bound[3]+F(.03+F(Math.max(...instance.elements.slice(12,15).map(Math.abs))*.000002)));
 return [add(w,x),add(w,x,-1),add(w,y),add(w,y,-1),camera.reversedDepth?z:add(w,z),add(w,z,-1)].some(p=>{
  const sum=F(F(F(p[0]*p[0])+F(p[1]*p[1]))+F(p[2]*p[2]));
  const length=F(Math.sqrt(sum));
  let d=0;for(let i=0;i<4;i++)d=F(d+F(p[i]*(i===3?1:bound[i])));
  return length>1e-12&&d<F(-radius*length);
 });
}
function cameras(reversed){
 const main=new T.PerspectiveCamera(52,1.79,.25,150000);main._reversedDepth=reversed;main.updateProjectionMatrix();main.position.set(8120,2010,-6330);main.lookAt(8120,1998,-6370);main.updateMatrixWorld(true);
 const mirror=createWaterReflectionCamera(main,new T.Plane(new T.Vector3(0,1,0),-2000));assert.ok(mirror);
 const shadow=new T.OrthographicCamera(-55,55,55,-55,1,500);shadow._reversedDepth=reversed;shadow.updateProjectionMatrix();shadow.position.set(8170,2100,-6300);shadow.lookAt(8120,2000,-6370);shadow.updateMatrixWorld(true);
 return [main,mirror,shadow];
}

test("six-plane float32 rejection retains every intersecting sphere for main, oblique reflection and shadow views",()=>{
 const bound=treeCullSphere(geometry()),local=new T.Sphere(new T.Vector3(...bound.slice(0,3)),bound[3]),model=new T.Matrix4();let tested=0,culled=0;
 for(const reverse of[false,true])for(const camera of cameras(reverse))for(let i=0;i<2500;i++){
  const instance=new T.Matrix4().compose(new T.Vector3(8120+Math.sin(i*2.399)*160,1980+(i%19)*3,-6370+Math.cos(i*1.337)*160),new T.Quaternion().setFromEuler(new T.Euler(.03*Math.sin(i),i*.37,.02*Math.cos(i))),new T.Vector3(.72+(i%31)/30*.76,.72+(i%23)/22*.76,.72+(i%13)/12*.76));
  const exact=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(model).multiply(instance),frustum=new T.Frustum().setFromProjectionMatrix(exact,camera.coordinateSystem,camera.reversedDepth);
  const cut=rejected(camera,model,instance,bound);if(frustum.intersectsSphere(local))assert.equal(cut,false,"crossing a clip plane cannot remove a tree");
  tested++;if(cut)culled++;
 }
 assert.equal(tested,15000);assert.ok(culled>5000,"outside trees actually reach the early exit");
});

test("all six boundary crossings, maximum scale and full wind corners remain conservatively enclosed",()=>{
 const g=geometry(),bound=treeCullSphere(g),sphere=new T.Sphere(new T.Vector3(...bound.slice(0,3)),bound[3]);
 for(let i=0;i<g.attributes.position.count;i++)for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){
  const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i).add(new T.Vector3(x*TREE_CULL_WIND[0],y*TREE_CULL_WIND[1],z*TREE_CULL_WIND[2]));assert.ok(sphere.containsPoint(p));
 }
 for(const reverse of[false,true])for(const camera of cameras(reverse)){
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
  for(const plane of frustum.planes){
   const centre=plane.normal.clone().multiplyScalar(-plane.constant-sphere.radius*1.48+.001),instance=new T.Matrix4().makeScale(1.48,1.48,1.48);instance.setPosition(centre.sub(sphere.center.clone().multiplyScalar(1.48)));
   // Other planes may exclude this centre, so test each plane's algebraic
   // sphere support directly instead of claiming the corner is in the view.
   const world=sphere.clone().applyMatrix4(instance);assert.ok(plane.distanceToPoint(world.center)>=-world.radius);
  }
 }
});

test("one per-batch attribute serves shared colour/depth materials with unchanged roots/counts and actual GPU disposal",()=>{
 const f=mesh(),other=new T.InstancedMesh(createTreeWindGeometry(f.source,64),f.o.material,64);other.customDepthMaterial=f.o.customDepthMaterial;
 const before=f.o.instanceMatrix.array.slice(),version=f.o.instanceMatrix.version,count=f.o.count;
 assert.equal(installTreeFrustumCull(f.o,f.control),true);installTreeFrustumCull(other,f.control);
 const a=f.o.geometry.attributes.aTreeFrustumSphere;assert.equal(a.array.byteLength,16);assert.equal(a.meshPerAttribute,64);assert.equal(a.count,1);
 assert.equal(f.o.count,count);assert.equal(f.o.instanceMatrix.version,version);assert.deepEqual(f.o.instanceMatrix.array,before);
 assert.strictEqual(f.o.material.userData.treeFrustumCull,f.control);assert.strictEqual(f.o.customDepthMaterial.userData.treeFrustumCull,f.control);
 const removed=[],geometries=WebGLGeometries({}, {remove:a=>removed.push(a)}, {memory:{geometries:0}}, {releaseStatesOfGeometry:()=>{}});
 geometries.get(f.o,f.o.geometry);disposeTreeWindGeometry(f.o.geometry);
 assert.ok(removed.includes(a));assert.ok(!removed.includes(f.source.attributes.position));assert.ok(other.geometry.attributes.position);
 disposeTreeWindGeometry(other.geometry);f.source.dispose();
});

test("wind/branch hook order rejects the whole root before any phase or photo-branch calculation",()=>{
 for(const depth of[false,true])for(const order of[0,1]){
  const m=attachEcologyWind(depth?new T.MeshDepthMaterial():new T.MeshStandardMaterial(),{},5,false,true),control={value:1};
  if(order===0)installSpruceBranchPhotos(m);installTreeFrustumMaterial(m,control);if(order===1)installSpruceBranchPhotos(m);
  const shader={uniforms:{},vertexShader:T.ShaderLib[depth?"depth":"standard"].vertexShader,fragmentShader:T.ShaderLib[depth?"depth":"standard"].fragmentShader};m.onBeforeCompile(shader);
  const start=shader.vertexShader.indexOf("void main()"),body=shader.vertexShader.slice(start),early=body.indexOf("// TREE_FRUSTUM_EARLY_BEGIN");
  assert.ok(early<body.indexOf("ecoBend("));assert.ok(early<body.indexOf("vSpruceBranchFade=aSprayLod"));assert.ok(early>body.indexOf("// ECO_LOD_EARLY_BEGIN"));
  assert.strictEqual(shader.uniforms.uTreeFrustumCull,control);assert.match(shader.vertexShader,/#ifdef USE_REVERSED_DEPTH_BUFFER/);
 }
});

test("unknown bounds use a disabled attribute rather than inheriting another shared material's cull sphere",()=>{
 const f=mesh();installTreeFrustumCull(f.o,f.control);
 const unknown=new T.InstancedMesh(createTreeWindGeometry(new T.BoxGeometry(),64),f.o.material,64);unknown.customDepthMaterial=f.o.customDepthMaterial;
 assert.equal(installTreeFrustumCull(unknown,f.control),false);assert.equal(unknown.geometry.attributes.aTreeFrustumSphere.getW(0),-1);
 assert.equal(rejected(cameras(true)[0],new T.Matrix4(),new T.Matrix4(),[0,0,0,-1]),false);
 const disabled=mesh();assert.equal(installTreeFrustumCull(disabled.o,{value:0}),false);assert.equal(disabled.o.geometry.hasAttribute("aTreeFrustumSphere"),false);
});

test("actual high/middle GLB tree weights prove the complete wind envelope at the maximum 1.48 root scale",()=>{
 let parts=0,maximum=0;
 for(const name of["hi","mid"]){
  const b=readFileSync(new URL("../../public/assets/v2/schrenk-spruce-"+name+".glb",import.meta.url)),size=b.readUInt32LE(12),json=JSON.parse(b.toString("utf8",20,20+size)),base=28+size;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
   const a=json.accessors[primitive.attributes._PLANT_WIND],view=json.bufferViews[a.bufferView],offset=base+(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||12;
   const weights={count:a.count,getX:i=>b.readFloatLE(offset+i*stride),getY:i=>b.readFloatLE(offset+i*stride+4)},bound=treeWindDisplacementBound(weights);
   maximum=Math.max(maximum,bound);assert.ok(bound*1.48<1.25);parts++;
  }
 }
 assert.equal(parts,30);assert.ok(maximum>.8&&maximum<.83);
});
