import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {buildBrushPacket} from './spruce-brush-packet.js';
import {createGpuBrushTemplate,createGpuBrushTables,installGpuBrush} from './spruce-gpu-brush.js';
import {createStationGeometry,SpruceGpuStationBrushes} from './spruce-gpu-stations.js';
import {createIndexedTwigTemplate} from './spruce-twig-indexed.js';
import {createTreeWindGeometry,disposeTreeWindGeometry} from './spruce-wind.js';
import {attachEcologyWind} from './ecology.js';
const recipe=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url)))),packet=buildBrushPacket(recipe.forms.pencil.instances.slice(0,2));
const bytes=(a,i)=>{const size=a.itemSize*a.array.BYTES_PER_ELEMENT;return Buffer.from(a.array.buffer,a.array.byteOffset+i*size,size);};
test('every indexed twig corner retains all original attribute bytes and triangle order including UV seams',()=>{
 const original=createGpuBrushTemplate(packet.topology),indexed=createIndexedTwigTemplate(original);
 assert.equal(indexed.index.count,468);assert.equal(indexed.attributes.position.count,312);assert.ok(indexed.index.array instanceof Uint16Array);
 for(let corner=0;corner<468;corner++)for(const [name,a]of Object.entries(original.attributes))assert.deepEqual(bytes(indexed.attributes[name],indexed.index.getX(corner)),bytes(a,4320+corner),name+' corner '+corner);
 const uvByWood=new Map();for(let i=0;i<312;i++){const wood=indexed.attributes.aBrushCode.getY(i),uv=bytes(indexed.attributes.uv,i).toString('hex');if(!uvByWood.has(wood))uvByWood.set(wood,new Set());uvByWood.get(wood).add(uv);}
 assert.equal(uvByWood.size,117);assert.ok([...uvByWood.values()].some(v=>v.size===4),'middle rings retain all four UV seam corners');
 assert.equal(original.index,null);assert.equal(original.attributes.position.count,4788);original.dispose();indexed.dispose();
});
function setup(indexedTwig){
 const f={tables:createGpuBrushTables(packet,true),stationGeometry:createStationGeometry(packet),material:new T.MeshStandardMaterial(),depth:new T.MeshDepthMaterial(),twigMaterial:new T.MeshStandardMaterial(),twigDepth:new T.MeshDepthMaterial()};f.material.userData.gpuBrushSource=true;
 const runtime=new SpruceGpuStationBrushes([f],createGpuBrushTemplate(packet.topology),{indexedTwig});
 const src=new T.BoxGeometry(8,20,8),g=createTreeWindGeometry(src,2),mesh=new T.InstancedMesh(g,f.material,2);mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(2,2000,-3));mesh.setMatrixAt(1,new T.Matrix4().makeTranslation(5,2000,-3));mesh.count=2;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();g.attributes.aTreeRootWind.data.array.set([.1,.2,.3,.4,.5,.6,.7,.8,.9,1]);g.attributes.aTreeRootWind.data.needsUpdate=true;
 const roots=new Map([['a',{mode:12,variant:0,mesh,activeRecords:[{id:'left'},{id:'right'}]}]]);runtime.sync(roots);
 return {runtime,mesh,roots,dispose(){runtime.dispose();disposeTreeWindGeometry(g);src.dispose();mesh.dispose();f.material.dispose();f.twigMaterial.dispose();}};
}
test('candidate retains all roots, brush counts, wind matrices, shadow materials and needle station inputs',()=>{
 const a=setup(false),b=setup(true);try{
  assert.equal(a.runtime.stats.triangles,b.runtime.stats.triangles);assert.equal(b.runtime.stats.twigTemplateVertices,312);assert.equal(b.runtime.stats.twigCornerSubmissions,1872);assert.equal(b.runtime.stats.twigPotentialVertexExecutions,1248);
  for(const [id,x]of a.runtime.batches){const y=b.runtime.batches.get(id);assert.ok(y);for(let k=0;k<2;k++){assert.equal(x.meshes[k].count,y.meshes[k].count);assert.deepEqual(x.meshes[k].instanceMatrix.array,y.meshes[k].instanceMatrix.array);assert.deepEqual(x.meshes[k].geometry.attributes.aTreeRootWind.data.array,y.meshes[k].geometry.attributes.aTreeRootWind.data.array);assert.equal(y.meshes[k].castShadow,true);assert.equal(y.meshes[k].receiveShadow,true);assert.equal(y.meshes[k].customDepthMaterial.isMeshDepthMaterial,true);assert.deepEqual(x.meshes[k].boundingBox,y.meshes[k].boundingBox);}
   assert.equal(y.meshes[0].geometry.index,null);assert.deepEqual(x.meshes[0].geometry.attributes.aNeedleFrame0.data.array,y.meshes[0].geometry.attributes.aNeedleFrame0.data.array);assert.strictEqual(y.meshes[1].geometry.index,b.runtime.template.index);assert.deepEqual(y.meshes[1].geometry.drawRange,{start:0,count:468});}
  b.mesh.geometry.attributes.aTreeRootWind.data.array[0]=.87;b.mesh.geometry.attributes.aTreeRootWind.data.needsUpdate=true;b.runtime.sync(b.roots);assert.equal(b.runtime.batches.get('a:left').meshes[1].geometry.attributes.aTreeRootWind.data.array[0],Math.fround(.87));
 }finally{a.dispose();b.dispose();}
});
test('native owner disposal releases the shared index once after a root retires',()=>{
 const x=setup(true),removed=new Map(),geometries=WebGLGeometries({}, {remove:a=>removed.set(a,(removed.get(a)||0)+1)}, {memory:{geometries:0}}, {releaseStatesOfGeometry(){} });
 try{for(const mesh of x.runtime.group.children){geometries.get(mesh,mesh.geometry);mesh.onBeforeRender();}const index=x.runtime.template.index;x.mesh.count=1;x.roots.get('a').activeRecords=[{id:'left'}];x.runtime.sync(x.roots);assert.equal(removed.get(index)||0,0);x.runtime.dispose();assert.equal(removed.get(index),1);x.runtime.dispose();assert.equal(removed.get(index),1);}finally{x.dispose();}
});
test('colour and depth twig shader addressing depends on original brush code, never gl_VertexID',()=>{
 const tables=createGpuBrushTables(packet,true);for(const depth of [false,true]){const m=depth?new T.MeshDepthMaterial():new T.MeshStandardMaterial();attachEcologyWind(m,{},12,false,true);installGpuBrush(m,tables,{twigOnly:true});const s={uniforms:{},vertexShader:T.ShaderLib[depth?'depth':'standard'].vertexShader,fragmentShader:T.ShaderLib[depth?'depth':'standard'].fragmentShader};m.onBeforeCompile(s);assert.doesNotMatch(s.vertexShader,/gl_VertexID/);assert.match(s.vertexShader,/int\(aBrushCode.y\+\.5\)/);assert.match(s.vertexShader,/ecoWeights=brushWind/);m.dispose();}tables.dispose();
});
