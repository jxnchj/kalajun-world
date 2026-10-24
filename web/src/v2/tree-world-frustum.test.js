import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {attachEcologyWind} from './ecology.js';
import {installTreeWorldFrustum,TREE_WORLD_FRUSTUM_GLSL} from './tree-world-frustum.js';
import {TREE_CULL_WIND} from './tree-frustum-cull.js';
import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
function fixture(){const source=new T.BoxGeometry(4,18,5);source.translate(0,9,0);source.setAttribute('aPlantWind',new T.Float32BufferAttribute(new Float32Array(source.attributes.position.count*3).fill(.3),3));source.computeBoundingSphere();const g=createTreeWindGeometry(source,8),m=attachEcologyWind(new T.MeshStandardMaterial(),{},5,false,true),d=attachEcologyWind(new T.MeshDepthMaterial(),{},5,false,true),mesh=new T.InstancedMesh(g,m,8);mesh.count=3;mesh.customDepthMaterial=d;for(let i=0;i<3;i++)mesh.setMatrixAt(i,new T.Matrix4().compose(new T.Vector3(8000+i*11,2000,-6300),new T.Quaternion().setFromEuler(new T.Euler(0,i*.8,0)),new T.Vector3(.8+i*.2,1.2,1)));
 mesh.instanceMatrix.needsUpdate=true;mesh.updateMatrixWorld();const result=installTreeWorldFrustum(mesh,{value:1});return{source,mesh,result};}
test('world spheres conservatively enclose every source vertex and complete wind box under rotations, nonuniform scales and parent shear',()=>{
 const{source,mesh,result}=fixture();mesh.matrixAutoUpdate=false;mesh.matrix.set(1,.3,.1,7, 0,1.2,.2,4, .2,0,.8,3, 0,0,0,1);mesh.updateMatrixWorld();result.sync();const matrix=new T.Matrix4(),point=new T.Vector3();
 for(let root=0;root<3;root++){mesh.getMatrixAt(root,matrix);matrix.premultiply(mesh.matrixWorld);const sphere=new T.Sphere(new T.Vector3().fromArray(result.attribute.array,root*4),result.attribute.array[root*4+3]);for(let v=0;v<source.attributes.position.count;v++)for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){point.fromBufferAttribute(source.attributes.position,v).add(new T.Vector3(x*TREE_CULL_WIND[0],y*TREE_CULL_WIND[1],z*TREE_CULL_WIND[2])).applyMatrix4(matrix);assert.ok(sphere.containsPoint(point));}}
 const builds=result.stats.builds;result.sync();assert.equal(result.stats.builds,builds);mesh.instanceMatrix.needsUpdate=true;result.sync();assert.equal(result.stats.builds,builds+1);
});
test('colour and depth hooks use actual current camera and preserve source buffers, triangles and draw count',()=>{
 const{mesh,result}=fixture(),sourceMatrix=mesh.instanceMatrix,index=mesh.geometry.index,count=mesh.count;
 const camera=new T.PerspectiveCamera(55,1.6,.2,20000);camera.position.set(8000,2002,-6280);camera.lookAt(8000,2002,-6350);camera.updateMatrixWorld();camera._reversedDepth=true;camera.updateProjectionMatrix();
 const shader=()=>({vertexShader:'void main() {\n#include <begin_vertex>\n#include <beginnormal_vertex>\n}',fragmentShader:'#include <alphatest_fragment>',uniforms:{}});
 const colour=shader(),depth=shader();mesh.material.onBeforeCompile(colour,{});mesh.customDepthMaterial.onBeforeCompile(depth,{});mesh.onBeforeRender({},null,camera);mesh.onBeforeShadow({},null,null,camera);
 const expected=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
 for(let i=0;i<6;i++){const p=expected.planes[i],values=[p.normal.x,p.normal.y,p.normal.z,p.constant];assert.deepEqual(colour.uniforms.uTreeWorldPlanes.value[i].toArray(),values);assert.deepEqual(depth.uniforms.uTreeWorldPlanes.value[i].toArray(),values);}
 assert.ok(colour.vertexShader.indexOf('treeOutsideWorldView()){')<colour.vertexShader.indexOf('// ECO_LOD_EARLY_END'));
 assert.ok(!TREE_WORLD_FRUSTUM_GLSL.includes('projectionMatrix'));result.sync();assert.equal(mesh.instanceMatrix,sourceMatrix);assert.equal(mesh.geometry.index,index);assert.equal(mesh.count,count);
});
test('owned world-sphere attribute remains attached for Three disposal while borrowed source buffers detach',()=>{
 const{source,mesh,result}=fixture();let disposed=false;mesh.geometry.addEventListener('dispose',()=>{disposed=true;assert.equal(mesh.geometry.attributes.aTreeWorldSphere,result.attribute);assert.equal(mesh.geometry.attributes.position,undefined);});disposeTreeWindGeometry(mesh.geometry);assert.equal(disposed,true);assert.ok(source.attributes.position);
});

test('unsupported bounds sharing a previously installed material always receive disabled spheres',()=>{
 const f=fixture(),g=f.mesh.geometry.clone();g.morphAttributes.position=[g.attributes.position.clone()];delete g.userData.treeWindSource;g.deleteAttribute('aTreeWorldSphere');
 const other=new T.InstancedMesh(g,f.mesh.material,3);other.customDepthMaterial=f.mesh.customDepthMaterial;
 const result=installTreeWorldFrustum(other,{value:1});assert.equal(result.stats.unsupportedBounds,true);result.sync();
 for(let i=3;i<result.attribute.array.length;i+=4)assert.equal(result.attribute.array[i],-1);
});
