import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CrownRootMask} from './crown-root-mask.js';import {TREE_CULL_WIND} from './tree-frustum-cull.js';import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
function fixture(capacity=8){
 const g=new T.BoxGeometry(3,18,3);g.translate(0,9,0);g.setAttribute('aPlantWind',new T.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>[.6,.1,.3]).flat(),3));g.computeBoundingBox();g.computeBoundingSphere();
 const owned=createTreeWindGeometry(g,capacity),mat=new T.MeshStandardMaterial({alphaTest:.45});mat.onBeforeCompile=shader=>{shader.vertexShader='// ECO_LOD_EARLY_BEGIN\n'+shader.vertexShader;};
 const mesh=new T.InstancedMesh(owned,mat,capacity);mesh.count=capacity;mesh.customDepthMaterial=new T.MeshDepthMaterial();
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(55,1.5,.25,500);camera.position.set(0,10,50);camera.lookAt(0,8,0);camera.updateMatrixWorld();scene.add(mesh);
 for(let i=0;i<capacity;i++)mesh.setMatrixAt(i,new T.Matrix4().makeTranslation((i-2)*18,0,-i*7));mesh.instanceMatrix.needsUpdate=true;scene.updateMatrixWorld();
 return{g,mesh,mat,scene,camera,dispose(){disposeTreeWindGeometry(owned);g.dispose();mat.dispose();mesh.customDepthMaterial.dispose();mesh.dispose();}};
}
test('root mask retains exact complete wind AABB contributors for normal/reversed and oblique projection',()=>{
 const f=fixture(8),owner=new CrownRootMask({capacity:256}),record=owner.add(f.mesh);try{
 const local=f.g.boundingBox.clone().expandByVector(new T.Vector3(...TREE_CULL_WIND));
 for(const reverse of [false,true])for(const yaw of [-.8,0,.9]){
  f.camera._reversedDepth=reverse;f.camera.rotation.y=yaw;f.camera.updateProjectionMatrix();f.camera.updateMatrixWorld();
  if(yaw===.9)f.camera.projectionMatrix.elements[8]+=.17;
  owner.update(f.camera);const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(f.camera.projectionMatrix,f.camera.matrixWorldInverse),f.camera.coordinateSystem,reverse),mat=new T.Matrix4();
  for(let i=0;i<f.mesh.count;i++){
   f.mesh.getMatrixAt(i,mat);mat.premultiply(f.mesh.matrixWorld);const box=local.clone().applyMatrix4(mat);if(frustum.intersectsBox(box))assert.equal(owner.data[record.base+i],255,'complete wind support retained');
  }
 }
 assert.ok(owner.stats.rejected>0);assert.equal(f.mesh.count,8);assert.equal(f.mesh.geometry.index.count,f.g.index.count);
 }finally{owner.dispose();f.dispose();}
});
test('visibility updates per real camera without copying or changing matrices and ignores shadow material',()=>{
 const f=fixture(),owner=new CrownRootMask({capacity:256}),matrix=f.mesh.instanceMatrix.array.slice(),shadowCompile=f.mesh.customDepthMaterial.onBeforeCompile;owner.add(f.mesh);owner.attachScene(f.scene);
 const before=f.scene.onBeforeRender;f.scene.onBeforeRender({},f.scene,f.camera);const a=owner.data.slice(),builds=owner.stats.boundsBuilds;
 const mirror=f.camera.clone();mirror.position.x=160;mirror.lookAt(150,8,-50);mirror.updateMatrixWorld();f.scene.onBeforeRender({},f.scene,mirror);assert.notDeepEqual(owner.data,a);assert.equal(owner.stats.boundsBuilds,builds);assert.deepEqual(f.mesh.instanceMatrix.array,matrix);
 assert.equal(f.mesh.customDepthMaterial.onBeforeCompile,shadowCompile);
 const shader={uniforms:{},vertexShader:'void main(){}'};f.mat.onBeforeCompile(shader);assert.equal(shader.uniforms.uCrownRootMask.value,owner.texture);assert.match(shader.vertexShader,/texelFetch/);assert.match(shader.vertexShader,/aCrownMaskBase>=/);assert.doesNotMatch(shader.vertexShader,/uTreeWorldPlanes/);
 owner.enabled.value=0;const passes=owner.stats.passes;f.scene.onBeforeRender({},f.scene,f.camera);assert.equal(owner.stats.passes,passes);
 owner.dispose();assert.notEqual(f.scene.onBeforeRender,before);f.dispose();
});
test('slot reuse, conservative capacity fallback and shared geometry disposal keep ownership bounded',()=>{
 const a=fixture(160),b=fixture(160),owner=new CrownRootMask({capacity:256}),ra=owner.add(a.mesh),rb=owner.add(b.mesh);assert.equal(ra.base,0);assert.equal(rb.base,-1);assert.equal(owner.stats.fallbacks,1);
 a.dispose();assert.equal(owner.stats.records,1);const c=fixture(128),rc=owner.add(c.mesh);assert.equal(rc.base,0);assert.equal(c.mesh.geometry.attributes.aCrownMaskBase.meshPerAttribute,128);
 owner.dispose();assert.equal(owner.records.size,0);b.dispose();c.dispose();
});
test('changed active prefixes, sheared parent matrices and disabled unsupported wind remain conservative',()=>{
 const f=fixture(),owner=new CrownRootMask({capacity:256}),r=owner.add(f.mesh);owner.update(f.camera);const n=owner.stats.boundsBuilds;
 f.mesh.matrixAutoUpdate=false;f.mesh.matrix.set(1,.3,0,0, .1,1,.2,0, .2,0,1,0, 0,0,0,1);f.scene.updateMatrixWorld();owner.update(f.camera);assert.equal(owner.stats.boundsBuilds,n+1);
 f.mesh.count=3;owner.update(f.camera);assert.equal(owner.stats.lastRoots,3);assert.equal(r.count,3);
 const unsupported=fixture();unsupported.g.attributes.aPlantWind.array.fill(999);const s=owner.add(unsupported.mesh);assert.equal(s.base,-1);
 owner.dispose();f.dispose();unsupported.dispose();
});
