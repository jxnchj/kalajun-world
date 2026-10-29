import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {NeedleStationWindCache62,stationWindLayout62,stationWindShader62,stationWindCoefficients62,stationWindApply62,stationWindStamp62,selectStationMeshes62,createStationWindBake62,withStationRenderState62} from './needle-station-wind-cache62.js';
import {attachEcologyWind} from './ecology.js';
import {createStationGeometry,installGpuNeedleStations} from './spruce-gpu-stations.js';
import {buildBrushPacket,packetNeedleVertex} from './spruce-brush-packet.js';
const recipe=JSON.parse(gunzipSync(await readFile(new URL('../../public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url))));
const packet=buildBrushPacket(recipe.forms.pencil.instances.slice(0,2));
function compile(m){const lib=T.ShaderLib[m.isMeshDepthMaterial?'depth':'standard'],s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s);return s;}
function setup(count=3,{compact=false}={}){
 const time={value:37.91},group=new T.Group(),runtime={group,batches:new Map()},camera=new T.PerspectiveCamera(70,1,.1,100);camera.position.set(0,4,5);camera.lookAt(0,4,0);camera.updateMatrixWorld();
 const meshes=[];
 for(let i=0;i<count;i++){
  const p=compact?buildBrushPacket(recipe.forms.pencil.instances.slice(0,2),{compactWrites:true}):packet;
  const g=createStationGeometry(p);if(compact)g.setAttribute('aSprayLod',new T.InterleavedBufferAttribute(new T.InstancedInterleavedBuffer(new Float32Array(8),4,288),4,0));
  const buffer=new T.InstancedInterleavedBuffer(new Float32Array([.913,.407,.32,.61,-.127]),5,576);
  g.setAttribute('aTreeRootWind',new T.InterleavedBufferAttribute(buffer,4,0));g.setAttribute('aTreeRootEddy',new T.InterleavedBufferAttribute(buffer,1,4));
  const material=new T.MeshStandardMaterial(),depth=new T.MeshDepthMaterial();for(const m of [material,depth]){m.defines={ECO_ROOT_WIND:''};attachEcologyWind(m,{uWindTime:time},12,false,true);installGpuNeedleStations(m,{branches:compact});}
  const mesh=new T.InstancedMesh(g,material,1);mesh.count=576;mesh.instanceMatrix.meshPerAttribute=576;mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(i,0,0));mesh.frustumCulled=false;mesh.name='gpu-needle-test-'+i;mesh.customDepthMaterial=depth;mesh.userData.calls={render:0,shadow:0};mesh.onBeforeRender=function(){this.userData.calls.render++;};mesh.onBeforeShadow=function(){this.userData.calls.shadow++;};group.add(mesh);meshes.push(mesh);runtime.batches.set(i,{meshes:[mesh]});
 }
 return{time,runtime,camera,meshes};
}
function fakeBake(state){return(renderer,mesh)=>{state.created++;const layout=stationWindLayout62(mesh.count);return{layout,target:{texture:{name:'fake-'+state.created}},update(t){state.updates++;state.times.push(t);if(state.fail)throw Error('injected bake failure');},dispose(){state.disposed++;}};};}
function fake(){const state={created:0,updates:0,disposed:0,times:[],fail:false};return{state,renderer:{domElement:new EventTarget()},createBake:fakeBake(state)};}
function draw(mesh,renderer,shadow=false){if(shadow)mesh.onBeforeShadow(renderer,mesh,null,null,mesh.geometry,mesh.customDepthMaterial,null);else mesh.onBeforeRender(renderer,null,null,mesh.geometry,mesh.material,null);}
function warm(cache,w,mock){cache.prepare(mock.renderer,w.runtime,w.camera,w.time);for(const r of cache.records.values()){draw(r.mesh,mock.renderer);r.mesh.userData.calls={render:0,shadow:0};}cache.prepare(mock.renderer,w.runtime,w.camera,w.time);}
const bits=a=>Array.from(new Uint32Array(new Float32Array(a).buffer));
const f=Math.fround;
function original(w,weights,t,y){
 // Direct original sequence, including field.b's add/subtract and trunk +=.
 const field=[f(w[2]),f(w[3]),f(f(w[4])+.5),.5],direction=[f(w[0]),f(w[1])],a=f(f(weights[0])*f(.48));
 const current=f(f(field[0]*f(1-a))+f(field[1]*a)),previous=field[1],returning=f(f(current-previous)*f(.32)),eddy=f(field[2]-.5),h=f(Math.min(Math.max(f(y),0),20));
 const trunk=direction.map(d=>f(f(f(f(d*f(current+returning))*h)*h)*f(.0014)));
 const branch=f(f(weights[1])*f(f(f(Math.sin(f(f(f(t)*f(.85))+f(weights[2]))))*f(.018))+f(f(previous-current)*f(.12))));
 return trunk.map((x,i)=>f(x+f(f(direction[i]*branch)+f(f(f((i?-0+direction[0]:-direction[1])*eddy)*f(weights[1]))*f(.018)))));
}

test('default OFF neither clones, allocates nor changes any source hooks, geometry or materials',()=>{
 const world=setup(),mock=fake(),cache=new NeedleStationWindCache62({createBake:mock.createBake}),before=world.meshes.map(m=>[m.material,m.customDepthMaterial,m.geometry,m.onBeforeRender,m.onBeforeShadow]);
 cache.prepare(mock.renderer,world.runtime,world.camera,world.time);assert.equal(mock.state.created,0);assert.equal(cache.records.size,0);world.meshes.forEach((m,i)=>assert.deepEqual([m.material,m.customDepthMaterial,m.geometry,m.onBeforeRender,m.onBeforeShadow],before[i]));cache.dispose();assert.throws(()=>cache.setEnabled(true),/Disposed/);
});
test('actual source stations preserve Float32 operation order at all 15 vertex heights and phase/normal inputs',()=>{
 let checked=0;for(let station=0;station<576;station+=7){const b=Math.floor(station/288),s=station%288;
  for(const t of [0,.001,37.91,8021.3])for(const w of [[.913,.407,.32,.61,-.127],[-.2,.98,.9,.1,1e-9]])for(let needle=0;needle<5;needle++)for(let corner=0;corner<3;corner++){
   const v=packetNeedleVertex(packet,b,s*5+needle,corner),c=stationWindCoefficients62(w,v.wind,t),actual=stationWindApply62(c,v.position[1]),expected=original(w,v.wind,t,v.position[1]);assert.deepEqual(bits(actual),bits(expected));checked++;
  }
 }assert.equal(checked,9960);
 const v=packetNeedleVertex(packet,0,0,0);for(const y of [-3,0,.15,19.999,20,55])assert.deepEqual(bits(stationWindApply62(stationWindCoefficients62([.8,.2,.4,.7,-.1],v.wind,11),y)),bits(original([.8,.2,.4,.7,-.1],v.wind,11,y)));
 // Distinct source phases cannot be collapsed to one phase per brush.
 const phases=new Set(Array.from({length:288},(_,i)=>packet.frames[i*16+15]));assert.equal(phases.size,288);
});
test('colour/depth patch changes only the wind call; shape/UV/AO/LOD/normal code and fragments are identical',()=>{
 for(const compact of [false,true]){const w=setup(1,{compact}),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0],before=[compile(mesh.material),compile(mesh.customDepthMaterial)];warm(cache,w,mock);assert.deepEqual(cache.stats.errors,[]);
  for(const [i,m]of[mesh.material,mesh.customDepthMaterial].entries()){const s=compile(m);assert.equal(s.vertexShader,stationWindShader62(before[i].vertexShader).replace(i===1?/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g:/$a/g,''));assert.equal(s.fragmentShader,before[i].fragmentShader.replace(i===1?/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g:/$a/g,''));assert.match(s.vertexShader,/ecoOffset=coefficients.xy\*h\*h\*\.0014;/);assert.match(s.vertexShader,/ecoSlope=ecoOffset\*2\.\/max\(\.15,brushPosition.y\)/);assert.match(s.vertexShader,/else\{ecoOffset=ecoBend\(brushPosition.y,ecoWeights,ecoRoot\(\)\);\}/);assert.equal(stationWindShader62(s.vertexShader),s.vertexShader);}
  cache.dispose();
 }assert.throws(()=>stationWindShader62('unrecognised'),/unchanged/);
});
test('bounded main-view selection excludes hidden, distant, frustum-rejected and layer-mismatched batches',()=>{
 const w=setup(6);w.meshes[0].visible=false;w.meshes[1].setMatrixAt(0,new T.Matrix4().makeTranslation(200,0,0));w.meshes[2].frustumCulled=true;w.meshes[2].intersectsFrustum=()=>false;w.meshes[3].layers.set(5);assert.deepEqual(selectStationMeshes62(w.runtime,w.camera,12),w.meshes.slice(4));w.runtime.group.visible=false;assert.deepEqual(selectStationMeshes62(w.runtime,w.camera),[]);
});
test('two selected batches reuse resources, identical snapshots skip bakes, all other source objects remain untouched',()=>{
 const w=setup(),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),third=w.meshes[2].material;warm(cache,w,mock);assert.equal(cache.stats.selected.length,2);assert.equal(mock.state.created,2);assert.equal(mock.state.updates,2);assert.equal(w.meshes[2].material,third);
 for(const mesh of w.meshes.slice(0,2)){draw(mesh,mock.renderer);draw(mesh,mock.renderer,true);assert.deepEqual(mesh.userData.calls,{render:1,shadow:1});assert.equal(cache.records.get(mesh).uniforms.uStationWindValid62.value,1);}
 cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.updates,2);assert.equal(cache.stats.cacheHits,2);w.time.value+=.016;cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.updates,4);assert.equal(mock.state.created,2);assert.equal(cache.stats.lastBakeStations,1152);assert.equal(cache.stats.logicalBytes,18432);assert.equal(cache.stats.attachmentBytes,32768);cache.dispose();assert.equal(mock.state.disposed,2);
});
test('root, packet, layout, wind-time, source shader/version mismatch falls back before both main and shadow',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0];warm(cache,w,mock);
 const mutate=[()=>w.time.value+=.1,()=>{mesh.geometry.attributes.aTreeRootWind.data.array[0]=.43;},()=>{mesh.geometry.attributes.aTreeRootWind.data.needsUpdate=true;},()=>{mesh.instanceMatrix.array[12]+=.1;},()=>{mesh.geometry.attributes.aNeedleFrame1.data.needsUpdate=true;},()=>{mesh.geometry.attributes.aNeedleFrame1.offset+=16;},()=>{mesh.count-=288;},()=>{cache.records.get(mesh).originalMaterial.needsUpdate=true;}];
 for(const change of mutate){change();for(const hook of ['onBeforeRender','onBeforeShadow']){draw(mesh,mock.renderer,hook==='onBeforeShadow');assert.equal(cache.records.get(mesh).uniforms.uStationWindValid62.value,0);}cache.prepare(mock.renderer,w.runtime,w.camera,w.time);draw(mesh,mock.renderer);cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.deepEqual(cache.stats.errors,[]);draw(mesh,mock.renderer);assert.equal(cache.records.get(mesh).uniforms.uStationWindValid62.value,1);}
 assert.ok(mock.state.created>=3);cache.dispose();assert.equal(mock.state.created,mock.state.disposed);
});
test('loss/restoration, retirement and disabling free private resources while restoring original hooks/materials',()=>{
 const w=setup(2),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),m=w.meshes[0],source=[m.material,m.customDepthMaterial,m.onBeforeRender,m.onBeforeShadow],g=m.geometry;let disposedGeometry=0;g.addEventListener('dispose',()=>disposedGeometry++);
 warm(cache,w,mock);mock.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));assert.equal(cache.records.size,0);assert.equal(mock.state.disposed,2);cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.created,2);mock.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));warm(cache,w,mock);assert.equal(mock.state.created,4);m.dispose();assert.equal(cache.records.size,1);assert.deepEqual([m.material,m.customDepthMaterial,m.onBeforeRender,m.onBeforeShadow],source);w.runtime.batches.delete(0);cache.setEnabled(false);assert.equal(mock.state.disposed,4);assert.equal(disposedGeometry,0);cache.setEnabled(true);warm(cache,w,mock);assert.equal(cache.records.size,1);cache.dispose();cache.dispose();assert.equal(mock.state.disposed,5);
});
test('errors stay visible, retain original-formula fallback and require retry, with no silent downgrade or retry loop',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0];mock.state.fail=true;warm(cache,w,mock);assert.match(cache.stats.errors[0],/injected/);draw(mesh,mock.renderer);assert.equal(cache.records.get(mesh).uniforms.uStationWindValid62.value,0);cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.updates,1);mock.state.fail=false;cache.retry();cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.updates,2);assert.deepEqual(cache.stats.errors,[]);cache.dispose();
 const w2=setup(1),before=w2.meshes[0].material;delete before.defines.ECO_ROOT_WIND;const c=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake});c.prepare(mock.renderer,w2.runtime,w2.camera,w2.time);assert.equal(w2.meshes[0].material,before);assert.equal(c.failures.size,1);c.prepare(mock.renderer,w2.runtime,w2.camera,w2.time);assert.equal(c.stats.errors.length,1);c.dispose();
});
test('unregister does not overwrite a newer owner, and borrowed buffers never belong to the bake',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0];warm(cache,w,mock);const newer=new T.MeshStandardMaterial(),hook=()=>{};mesh.material=newer;mesh.onBeforeRender=hook;cache.setEnabled(false);assert.equal(mesh.material,newer);assert.equal(mesh.onBeforeRender,hook);cache.dispose();
 const renderer={extensions:{has:()=>true},capabilities:{maxTextureSize:16384}},resource=createStationWindBake62(renderer,mesh);assert.equal(resource.layout.stations,576);assert.equal(resource.target.texture.type,T.FloatType);assert.equal(resource.target.texture.generateMipmaps,false);let sourceDisposed=0;mesh.geometry.addEventListener('dispose',()=>sourceDisposed++);resource.dispose();resource.dispose();assert.equal(sourceDisposed,0);assert.equal(mesh.geometry.attributes.aNeedleFrame1.data.array,packet.frames);
});
test('RGBA32F logical/padded bytes and workload match the two measured forest batches',()=>{
 const a=stationWindLayout62(42048),b=stationWindLayout62(46944);assert.equal(a.logicalBytes+b.logicalBytes,1423872);assert.equal(a.attachmentBytes+b.attachmentBytes,1441792);assert.equal(a.sourceVertices+b.sourceVertices,1334880);assert.equal((a.sourceVertices+b.sourceVertices)*3,4004640);assert.throws(()=>stationWindLayout62(0));assert.throws(()=>stationWindLayout62(900000,64));
});
function stateRenderer(){
 const s={target:{name:'world'},face:2,mip:1,color:new T.Color(.2,.3,.4),alpha:.7,xr:true,viewport:new T.Vector4(3,4,800,600),scissor:new T.Vector4(2,1,300,200),current:new T.Vector4(9,12,2400,1800),scissorTest:true};
 const r={s,autoClear:true,xr:{enabled:true},shadowMap:{autoUpdate:true,needsUpdate:true},info:{autoReset:true,render:{frame:30,calls:77,triangles:99,points:0}},debug:{checkShaderErrors:false,onShaderError:null},getRenderTarget:()=>s.target,getActiveCubeFace:()=>s.face,getActiveMipmapLevel:()=>s.mip,getClearColor:t=>t.copy(s.color),getClearAlpha:()=>s.alpha,getViewport:t=>t.copy(s.viewport),getCurrentViewport:t=>t.copy(s.current),getScissor:t=>t.copy(s.scissor),getScissorTest:()=>s.scissorTest,setRenderTarget:(t,f=0,m=0)=>{s.target=t;s.face=f;s.mip=m;},setClearColor:(v,a)=>{s.color.set(v);s.alpha=a;},setScissorTest:v=>s.scissorTest=v,state:{viewport:v=>s.current.copy(v)}};return r;
}
test('GPU bake scope restores full renderer-owned state even on shader/render failure, preserving frame epoch',()=>{
 for(const fails of [false,true]){const r=stateRenderer(),target=r.s.target,before=JSON.stringify(r.s),error=r.debug.onShaderError;try{withStationRenderState62(r,()=>{r.info.render.frame++;r.info.render.calls+=2;r.info.render.points=42;r.s.current.set(0,0,1024,1);r.setRenderTarget({name:'bake'});r.setClearColor(0,0);assert.equal(r.shadowMap.needsUpdate,false);if(fails)throw Error('test exception');});if(fails)assert.fail();}catch(e){assert.equal(e.message,'test exception');}assert.equal(JSON.stringify(r.s),before);assert.equal(r.s.target,target);assert.equal(r.info.render.frame,31);assert.equal(r.info.render.calls,77);assert.equal(r.info.render.points,0);assert.equal(r.debug.onShaderError,error);assert.equal(r.shadowMap.needsUpdate,true);assert.equal(r.xr.enabled,true);}
});

test('material clones retain live uniform/texture references without JSON expanding shared source userData',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),source=w.meshes[0].material;
 const cycle={};cycle.self=cycle;source.userData.unrelatedDiagnostic=cycle;
 const texture=new T.DataTexture(new Float32Array(4),1,1,T.RGBAFormat,T.FloatType);source.userData.spruceBranchVariation=texture;
 warm(cache,w,mock);assert.deepEqual(cache.stats.errors,[]);assert.strictEqual(w.meshes[0].material.userData.spruceBranchVariation,texture);assert.strictEqual(w.meshes[0].material.userData.unrelatedDiagnostic,cycle);cache.dispose();assert.strictEqual(w.meshes[0].material,source);texture.dispose();
});

test('a selected-but-never-rendered mesh allocates no shared-buffer bake before it retires',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake});cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(cache.stats.awaitingFirstDraw,1);assert.equal(mock.state.created,0);w.meshes[0].dispose();assert.equal(cache.records.size,0);assert.equal(mock.state.disposed,0);cache.dispose();
});

test('observation gate is renderer + actual geometry specific, including replacement and throwing original hooks',()=>{
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0];
 cache.prepare(mock.renderer,w.runtime,w.camera,w.time);draw(mesh,{});cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.created,0);
 draw(mesh,mock.renderer);cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.created,1);const old=mesh.geometry;mesh.geometry=old.clone();
 cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.created,1);assert.equal(cache.stats.awaitingFirstDraw,1);draw(mesh,mock.renderer,true);cache.prepare(mock.renderer,w.runtime,w.camera,w.time);assert.equal(mock.state.created,2);cache.dispose();
 const another=setup(1),c=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake});another.meshes[0].onBeforeRender=()=>{throw Error('source callback');};c.prepare(mock.renderer,another.runtime,another.camera,another.time);assert.throws(()=>draw(another.meshes[0],mock.renderer),/source callback/);c.prepare(mock.renderer,another.runtime,another.camera,another.time);assert.equal(c.stats.awaitingFirstDraw,1);c.dispose();
});

test('actual Three geometry dispose listeners retain borrowed VBOs until the original rendered geometry retires',async()=>{
 const {WebGLGeometries}=await import('three/src/renderers/webgl/WebGLGeometries.js');
 const w=setup(1),r=stateRenderer(),mesh=w.meshes[0],buffers=new Set(),info={memory:{geometries:0}},key=a=>a.isInterleavedBufferAttribute?a.data:a;
 const geometries=WebGLGeometries({ARRAY_BUFFER:34962},{update(a){buffers.add(key(a));},remove(a){buffers.delete(key(a));}},info,{releaseStatesOfGeometry(){}});
 r.domElement=new EventTarget();r.extensions={has:()=>true};r.capabilities={maxTextureSize:16384};r.clear=()=>{};r.render=scene=>{const object=scene.children[0];geometries.get(object,object.geometry);geometries.update(object.geometry);r.info.render.frame++;r.info.render.calls++;};
 const cache=new NeedleStationWindCache62({enabled:true});cache.prepare(r,w.runtime,w.camera,w.time);assert.equal(info.memory.geometries,0);
 geometries.get(mesh,mesh.geometry);geometries.update(mesh.geometry);draw(mesh,r);cache.prepare(r,w.runtime,w.camera,w.time);assert.deepEqual(cache.stats.errors,[]);assert.equal(info.memory.geometries,2);
 const frames=mesh.geometry.attributes.aNeedleFrame1.data,wind=mesh.geometry.attributes.aTreeRootWind.data;assert.ok(buffers.has(frames)&&buffers.has(wind));
 cache.dispose();assert.equal(info.memory.geometries,1);assert.ok(buffers.has(frames)&&buffers.has(wind));mesh.geometry.dispose();assert.equal(info.memory.geometries,0);assert.equal(buffers.size,0);
});

test('per-frame cache writes do not force CSM redraws; root and geometry changes still invalidate',async()=>{
 const {SunShadowCasters}=await import('./sun-shadow-casters.js');
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),scene=new T.Scene(),mesh=w.meshes[0];mesh.castShadow=true;mesh.receiveShadow=true;mesh.boundingBox=new T.Box3(new T.Vector3(-2,0,-2),new T.Vector3(2,18,2));mesh.boundingSphere=new T.Sphere(new T.Vector3(0,9,0),10);mesh.geometry.userData.ecologyWindAttributes=['aTreeRootWind','aTreeRootEddy'];
 const lights=[30,60,120].map(span=>{const l=new T.DirectionalLight();l.position.set(0,20,0);Object.assign(l.shadow.camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2,near:1,far:60});l.shadow.camera.updateProjectionMatrix();scene.add(l,l.target);return l;});scene.add(w.runtime.group);warm(cache,w,mock);
 const tracker=new SunShadowCasters(scene,lights),update=()=>[...tracker.update(w.camera).changed];assert.deepEqual(update(),[true,true,true]);assert.deepEqual(update(),[false,false,false]);
 for(let i=0;i<8;i++){w.time.value+=.016;mesh.geometry.attributes.aTreeRootWind.data.array[0]+=.001;mesh.geometry.attributes.aTreeRootWind.data.needsUpdate=true;cache.prepare(mock.renderer,w.runtime,w.camera,w.time);draw(mesh,mock.renderer,true);assert.deepEqual(update(),[false,false,false]);}
 mesh.instanceMatrix.needsUpdate=true;assert.deepEqual(update(),[true,true,true]);assert.deepEqual(update(),[false,false,false]);tracker.dispose();cache.dispose();
});

test('real source -> station -> projected depth -> coverage hook isolates only the cache validity uniform',async()=>{
 const {coverageDepth41}=await import('./grass-shadow-world41.js'),{useProjectedShadowDepth}=await import('./room-shadow.js');
 const w=setup(1),mock=fake(),cache=new NeedleStationWindCache62({enabled:true,createBake:mock.createBake}),mesh=w.meshes[0];useProjectedShadowDepth(mesh.customDepthMaterial);const ordinary=mesh.customDepthMaterial;warm(cache,w,mock);draw(mesh,mock.renderer,true);
 const native=compile(mesh.customDepthMaterial),shared=native.uniforms.uStationWindValid62;assert.equal(shared.value,1);
 for(const kind of ['caster','receiver','reference']){const view=coverageDepth41(mesh.customDepthMaterial,kind),derived=compile(view);assert.equal(derived.uniforms.uStationWindValid62.value,0);assert.notStrictEqual(derived.uniforms.uStationWindValid62,shared);assert.equal(shared.value,1);for(const [name,u]of Object.entries(native.uniforms))if(name!=='uStationWindValid62')assert.strictEqual(derived.uniforms[name],u);assert.match(derived.vertexShader,/else\{ecoOffset=ecoBend/);assert.notEqual(view.customProgramCacheKey(),ordinary.customProgramCacheKey());view.dispose();}
 const baseline=compile(ordinary),normal=coverageDepth41(ordinary,'caster'),normalShader=compile(normal);assert.equal(normalShader.vertexShader,baseline.vertexShader);assert.equal(normalShader.uniforms.uStationWindValid62,undefined);assert.strictEqual(normalShader.uniforms.uWindTime,baseline.uniforms.uWindTime);normal.dispose();cache.dispose();
});
