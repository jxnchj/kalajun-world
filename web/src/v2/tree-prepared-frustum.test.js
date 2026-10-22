import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {attachEcologyWind} from './ecology.js';
import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
import {createWaterReflectionCamera} from './water-reflection.js';
import {treeCullSphere,TREE_CULL_WIND} from './tree-frustum-cull.js';
import {installPreparedTreeFrustum,transformTreeCullSphere,treeLinearScaleBoundSquared,PREPARED_TREE_FRUSTUM_GLSL} from './tree-prepared-frustum.js';
const f=Math.fround;
function geometry(){const g=new T.BoxGeometry(5,18,5);g.translate(0,9,0);const a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=.8;a[i+1]=.55;a[i+2]=3;}g.setAttribute('aPlantWind',new T.BufferAttribute(a,3));return g;}
function fixture(){const source=geometry(),g=createTreeWindGeometry(source,32),material=attachEcologyWind(new T.MeshStandardMaterial(),{},1,false,true),mesh=new T.InstancedMesh(g,material,32);mesh.customDepthMaterial=attachEcologyWind(new T.MeshDepthMaterial(),{},1,false,true);mesh.count=3;return{source,mesh,control:{value:1}};}
function cameras(reversed){
 const main=new T.PerspectiveCamera(52,1.79,.25,150000);main._reversedDepth=reversed;main.updateProjectionMatrix();main.position.set(8120,2010,-6330);main.lookAt(8120,1998,-6370);main.updateMatrixWorld(true);
 const mirror=createWaterReflectionCamera(main,new T.Plane(new T.Vector3(0,1,0),-2000));
 const shadow=new T.OrthographicCamera(-55,55,55,-55,1,500);shadow._reversedDepth=reversed;shadow.updateProjectionMatrix();shadow.position.set(8170,2100,-6300);shadow.lookAt(8120,2000,-6370);shadow.updateMatrixWorld(true);return[main,mirror,shadow];
}
const mul=(a,b)=>f(f(a)*f(b)),add=(a,b)=>f(f(a)+f(b));
const dot=(a,b)=>a.reduce((n,v,i)=>add(n,mul(v,b[i])),0);
function rejected(camera,model,bound){
 if(bound[3]<0)return false;
 const mv=new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse,model).elements.map(f),center=Array.from({length:4},(_,i)=>dot([mv[i],mv[4+i],mv[8+i],mv[12+i]],[...bound.slice(0,3),1]));
 const a=mv.slice(0,3),b=mv.slice(4,7),c=mv.slice(8,11),ab=Math.abs(dot(a,b)),ac=Math.abs(dot(a,c)),bc=Math.abs(dot(b,c));
 const scale2=Math.max(add(add(dot(a,a),ab),ac),add(add(dot(b,b),ab),bc),add(add(dot(c,c),ac),bc));
 const radius=add(bound[3],add(.03,mul(Math.max(...bound.slice(0,3).map(Math.abs)),.000002))),r2=mul(mul(mul(radius,radius),scale2),1.000002),e=camera.projectionMatrix.elements.map(f),row=i=>[e[i],e[4+i],e[8+i],e[12+i]],x=row(0),y=row(1),z=row(2),w=row(3),sum=(a,b,s=1)=>a.map((v,i)=>add(v,mul(s,b[i])));
 return[sum(w,x),sum(w,x,-1),sum(w,y),sum(w,y,-1),camera.reversedDepth?z:sum(w,z),sum(w,z,-1)].some(p=>{const n2=dot(p.slice(0,3),p.slice(0,3)),d=dot(p,center);return n2>1e-24&&d<0&&mul(d,d)>mul(r2,n2);});
}

test('transformed sphere encloses complete geometry plus original wind box with nonuniform scales and shear',()=>{
 const g=geometry(),bound=treeCullSphere(g),out=new Float32Array(4);
 for(let i=0;i<200;i++){
  const matrix=new T.Matrix4().compose(new T.Vector3(Math.sin(i)*41000,2000,Math.cos(i)*41000),new T.Quaternion().setFromEuler(new T.Euler(i*.3,i*.7,i*.2)),new T.Vector3(.7+i%5*.19,1+i%3*.2,.8+i%7*.1));
  if(i%2)matrix.multiply(new T.Matrix4().makeShear(.2,-.3,.1,.2,-.1,.4));
  const e=new Float32Array(matrix.elements);matrix.fromArray(e);assert.equal(transformTreeCullSphere(bound,e,0,out),true);
  for(let v=0;v<g.attributes.position.count;v++)for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){
   const point=new T.Vector3().fromBufferAttribute(g.attributes.position,v).add(new T.Vector3(x*TREE_CULL_WIND[0],y*TREE_CULL_WIND[1],z*TREE_CULL_WIND[2])).applyMatrix4(matrix);
   assert.ok(point.distanceTo(new T.Vector3(...out.slice(0,3)))<=out[3]);
  }
 }
 assert.ok(treeLinearScaleBoundSquared(new T.Matrix4().makeShear(.8,.3,.2,.1,.3,.4).elements)>1);
});

test('float32 early reject keeps all true intersecting roots for perspective, oblique reflected and shadow cameras',t=>{
 const bound=treeCullSphere(geometry()),sphere=new T.Sphere(new T.Vector3(...bound.slice(0,3)),bound[3]);let checked=0,cut=0;
 for(const reversed of[false,true])for(const camera of cameras(reversed))for(let i=0;i<2500;i++){
  const instance=new T.Matrix4().compose(new T.Vector3(8120+Math.sin(i*2.399)*160,1980+(i%19)*3,-6370+Math.cos(i*1.337)*160),new T.Quaternion().setFromEuler(new T.Euler(.03*Math.sin(i),i*.37,.02*Math.cos(i))),new T.Vector3(.72+(i%31)/30*.76,.72+(i%23)/22*.76,.72+(i%13)/12*.76));
  if(i%23===0)instance.multiply(new T.Matrix4().makeShear(.15,.03,.1,.02,.05,.07));
  instance.fromArray(new Float32Array(instance.elements));
  const model=new T.Matrix4().makeTranslation(Math.sin(i)*.05,0,Math.cos(i)*.05);
  if(i%17===0)model.multiply(new T.Matrix4().makeScale(1.0001,1,.9999));
  const transformed=new Float32Array(4);
  transformTreeCullSphere(bound,instance.elements,0,transformed);
  const exact=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(model).multiply(instance),frustum=new T.Frustum().setFromProjectionMatrix(exact,camera.coordinateSystem,camera.reversedDepth),outside=rejected(camera,model,transformed);
  if(frustum.intersectsSphere(sphere))assert.equal(outside,false,'visible wind envelope must remain');checked++;if(outside)cut++;
 }
 assert.equal(checked,15000);assert.ok(cut>5000);t.diagnostic(JSON.stringify({checked,cut}));
});

test('matrix versions and active prefix drive one owned sphere upload, preserving original root matrices',()=>{
 const {source,mesh,control}=fixture(),before=mesh.instanceMatrix.array.slice(),initialVersion=mesh.instanceMatrix.version,record=installPreparedTreeFrustum(mesh,control);
 assert.equal(record.stats.builds,1);assert.equal(record.attribute.count,32);assert.equal(record.stats.bytes,512);assert.equal(record.sync(),false);
 mesh.instanceMatrix.needsUpdate=true;assert.equal(record.sync(),true);assert.equal(record.stats.builds,2);
 mesh.count=5;assert.equal(record.sync(),true);assert.equal(record.stats.roots,5);
 assert.deepEqual(mesh.instanceMatrix.array,before);assert.equal(mesh.instanceMatrix.version,initialVersion+1);
 for(const depth of[false,true]){
  const material=depth?mesh.customDepthMaterial:mesh.material,lib=T.ShaderLib[depth?'depth':'standard'],shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(shader);
  const body=shader.vertexShader.slice(shader.vertexShader.indexOf('void main()'));assert.ok(body.indexOf('TREE_PREPARED_FRUSTUM_BEGIN')<body.indexOf('ecoBend('));assert.equal(shader.uniforms.uTreePreparedFrustum,control);
 }
 const removed=[],geometries=WebGLGeometries({}, {remove:a=>removed.push(a)}, {memory:{geometries:0}}, {releaseStatesOfGeometry:()=>{}});
 geometries.get(mesh,mesh.geometry);disposeTreeWindGeometry(mesh.geometry);assert.ok(removed.includes(record.attribute));assert.ok(!removed.includes(source.attributes.position));
});

test('unknown or edited deformations and invalid affine matrices draw fully instead of using stale bounds',()=>{
 const {mesh}=fixture(),control={value:1},record=installPreparedTreeFrustum(mesh,control);
 mesh.geometry.userData.treeWindSource.attributes.position.needsUpdate=true;record.sync();assert.equal(record.stats.unsupportedRoots,3);assert.equal(record.attribute.getW(0),-1);
 const unknown=fixture();unknown.mesh.geometry.userData.treeWindSource.deleteAttribute('aPlantWind');assert.equal(installPreparedTreeFrustum(unknown.mesh,control).attribute.getW(0),-1);
 const displaced=fixture(),displacedRecord=installPreparedTreeFrustum(displaced.mesh,control);displaced.mesh.material.displacementMap=new T.Texture();displacedRecord.sync();assert.equal(displacedRecord.attribute.getW(0),-1);
 const out=new Float32Array(4),m=new T.Matrix4();m.elements[3]=1;assert.equal(transformTreeCullSphere([0,0,0,1],m.elements,0,out),false);assert.equal(out[3],-1);
 const disabled=fixture();assert.equal(installPreparedTreeFrustum(disabled.mesh,{value:0}),null);assert.equal(disabled.mesh.geometry.hasAttribute('aTreeFrustumSphere'),false);
 assert.ok(!PREPARED_TREE_FRUSTUM_GLSL.includes('instanceMatrix'));assert.ok(!PREPARED_TREE_FRUSTUM_GLSL.includes('sqrt('));
});
