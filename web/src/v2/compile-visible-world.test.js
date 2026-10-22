import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {compileVisibleWorld} from './compile-visible-world.js';
const rendererFor=inspect=>({info:{programs:[]},getContext:()=>({isContextLost:()=>false}),compile(...args){inspect(...args);return new Set();}});
function fixture(){const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,100);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.updateMatrixWorld();return{scene,camera};}
function mesh(name,{count,material}={}){const geometry=new THREE.BoxGeometry(1,1,1);geometry.computeBoundingSphere();const m=count===undefined?new THREE.Mesh(geometry,material||new THREE.MeshStandardMaterial()):new THREE.InstancedMesh(geometry,material||new THREE.MeshStandardMaterial(),Math.max(1,count));m.name=name;m.position.z=-10;if(count!==undefined){m.count=count;for(let i=0;i<count;i++)m.setMatrixAt(i,new THREE.Matrix4());m.computeBoundingSphere();}return m;}
const selection=input=>{const out=[];input.traverse(o=>{if(o.isMesh||o.isLine||o.isPoints||o.isSprite)out.push(o);});return out;};
const snapshot=scene=>{const rows=[];scene.traverse(o=>rows.push([o,o.parent,[...o.children],o.visible,o.material,o.count,o.matrixWorld.elements.slice(),o.geometry?.drawRange?.start,o.geometry?.drawRange?.count]));return rows;};
test('precompile excludes hidden ancestors, zero instances, empty draw ranges and invisible materials without touching the scene',async()=>{
 const{scene,camera}=fixture(),hiddenParent=new THREE.Group();hiddenParent.visible=false;hiddenParent.add(mesh('hidden-child'));scene.add(hiddenParent);
 const visible=mesh('visible'),empty=mesh('zero-instances',{count:0}),zeroRange=mesh('zero-range'),noMaterial=mesh('hidden-material'),wrongLayer=mesh('wrong-layer');zeroRange.geometry.setDrawRange(0,0);noMaterial.material.visible=false;wrongLayer.layers.set(2);scene.add(visible,empty,zeroRange,noMaterial,wrongLayer);
 const layerParent=new THREE.Group();layerParent.layers.set(2);const descendant=mesh('matching-child-of-other-layer');layerParent.add(descendant);scene.add(layerParent);scene.updateMatrixWorld(true);
 let events=0;scene.traverse(o=>{o.addEventListener('added',()=>events++);o.addEventListener('removed',()=>events++);});const before=snapshot(scene);
 const result=await compileVisibleWorld(rendererFor((input,c,target)=>{assert.equal(c,camera);assert.equal(target,scene);assert.deepEqual(selection(input),[visible,descendant]);assert.equal(input.children.length,0);assert.equal(input.parent,null);assert.equal(input.userData.compileSelection.objects,2);return Promise.resolve(input);}),scene,camera);
 assert.equal(result.name,'world-precompile-selection');assert.deepEqual(snapshot(scene),before);assert.equal(events,0);
});
test('actual target scene supplies lights/environment once; array materials retain only drawn visible groups through a proxy',async()=>{
 const{scene,camera}=fixture(),light=new THREE.DirectionalLight(),ambient=new THREE.HemisphereLight(),environment=new THREE.Texture();scene.environment=environment;scene.fog=new THREE.Fog('white',5,50);scene.add(light,ambient);
 const mats=Array.from({length:4},()=>new THREE.MeshStandardMaterial());mats[1].visible=false;const object=mesh('groups',{material:mats});object.geometry.clearGroups();object.geometry.addGroup(0,6,0);object.geometry.addGroup(6,6,1);object.geometry.addGroup(12,6,2);object.geometry.addGroup(18,0,3);object.geometry.setDrawRange(0,12);scene.add(object);scene.updateMatrixWorld(true);const before=snapshot(scene);
 await compileVisibleWorld(rendererFor((input,c,target)=>{const fromSource=[],fromTarget=[];input.traverseVisible(o=>{if(o.isLight)fromSource.push(o);});target.traverseVisible(o=>{if(o.isLight)fromTarget.push(o);});assert.deepEqual(fromSource,[]);assert.deepEqual(fromTarget,[light,ambient]);assert.equal(target.environment,environment);assert.equal(target.fog,scene.fog);const[proxy]=selection(input);assert.notEqual(proxy,object);assert.equal(Object.getPrototypeOf(proxy),object);assert.deepEqual(proxy.material,[mats[0]]);assert.equal(proxy.geometry,object.geometry);assert.equal(proxy.matrixWorld,object.matrixWorld);return Promise.resolve();}),scene,camera);
 assert.deepEqual(snapshot(scene),before);assert.strictEqual(object.material,mats);
});
test('main and additional mirror frustums retain their union and honour custom ecology bounds',async()=>{
 const{scene,camera}=fixture(),inside=mesh('main'),outside=mesh('outside'),mirrorOnly=mesh('mirror-only'),unculled=mesh('unculled'),custom=mesh('custom-bounds');outside.position.set(1000,0,-10);mirrorOnly.position.set(30,0,-10);unculled.position.set(1000,0,-10);unculled.frustumCulled=false;custom.position.set(1000,0,-10);let customChecks=0;custom.intersectsFrustum=function(f){customChecks++;assert.equal(this,custom);return f.intersectsSphere(new THREE.Sphere(new THREE.Vector3(0,0,-10),1));};scene.add(inside,outside,mirrorOnly,unculled,custom);scene.updateMatrixWorld(true);
 const mirror=camera.clone();mirror.position.x=30;mirror.updateMatrixWorld();const names=[];const r=rendererFor(input=>{names.push(selection(input).map(o=>o.name));});
 await compileVisibleWorld(r,scene,camera);await compileVisibleWorld(r,scene,camera,{additionalCameras:[mirror]});
 assert.deepEqual(names[0],['main','unculled','custom-bounds']);assert.deepEqual(names[1],['main','mirror-only','unculled','custom-bounds']);assert.ok(customChecks>=2);assert.equal(scene.children.length,5);
});
test('sync and async compiler failure leave parents, transforms, visibility, ranges and materials untouched',async()=>{
 for(const asynchronous of[false,true]){const{scene,camera}=fixture(),object=mesh('live',{count:2});scene.add(object);scene.updateMatrixWorld(true);const before=snapshot(scene),error=new Error('expected compile failure');const renderer=rendererFor(()=>{if(!asynchronous)throw error;renderer.info.programs.push({program:{},isReady(){throw error;}});});
  if(asynchronous)await assert.rejects(compileVisibleWorld(renderer,scene,camera),e=>e===error);else assert.throws(()=>compileVisibleWorld(renderer,scene,camera),e=>e===error);assert.deepEqual(snapshot(scene),before);
 }
});


test('additional-view filter excludes reflection-only wakes but retains the same material in the main camera',async()=>{
 const{scene,camera}=fixture(),waterMaterial=new THREE.MeshStandardMaterial(),mainWake=mesh('main-wake',{material:waterMaterial}),mirrorWake=mesh('mirror-wake',{material:waterMaterial}),mirrorBank=mesh('mirror-bank'),mainMarked=mesh('main-marked-surface');
 mirrorWake.position.x=30;mirrorBank.position.x=30;mainMarked.material.userData.waterReflectionSurface=true;
 scene.add(mainWake,mirrorWake,mirrorBank,mainMarked);scene.updateMatrixWorld(true);const mirror=camera.clone();mirror.position.x=30;mirror.updateMatrixWorld();const before=snapshot(scene),seen=[];
 const additionalObjectFilter=object=>{seen.push(object);const materials=Array.isArray(object.material)?object.material:[object.material];return !materials.some(m=>m===waterMaterial||m?.userData?.waterReflectionSurface);};
 let actual;await compileVisibleWorld(rendererFor(input=>{actual=selection(input);}),scene,camera,{additionalCameras:[mirror],additionalObjectFilter});
 assert.deepEqual(actual.map(o=>o.name),['main-wake','mirror-bank','main-marked-surface']);assert.ok(seen.includes(mirrorWake));assert.ok(!seen.includes(mainWake));assert.ok(!seen.includes(mainMarked));assert.deepEqual(snapshot(scene),before);assert.strictEqual(mainWake.material,mirrorWake.material);
});

test('view submission with an empty last-pass buffer still precompiles its resident source',async()=>{
 const {scene,camera}=fixture(),source=mesh('source',{count:2}),proxy=mesh('view');proxy.userData.treeViewSource=source;proxy.geometry.instanceCount=0;proxy.intersectsFrustum=()=>true;scene.add(proxy);scene.updateMatrixWorld(true);
 await compileVisibleWorld(rendererFor(input=>assert.deepEqual(selection(input),[proxy])),scene,camera);
 source.count=0;await compileVisibleWorld(rendererFor(input=>assert.deepEqual(selection(input),[])),scene,camera);
});

test('zero-draw render hook prepares its actual program while ordinary empty meshes stay excluded',async()=>{
 const {scene,camera}=fixture(),hook=mesh('capture'),empty=mesh('ordinary');hook.geometry.setDrawRange(0,0);empty.geometry.setDrawRange(0,0);hook.userData.compileRenderHook=true;scene.add(hook,empty);scene.updateMatrixWorld(true);
 await compileVisibleWorld(rendererFor(input=>assert.deepEqual(selection(input),[hook])),scene,camera);
 hook.visible=false;await compileVisibleWorld(rendererFor(input=>assert.deepEqual(selection(input),[])),scene,camera);
});
