import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createTerrainShadowDomain} from './terrain-shadow-domain.js';import {SunShadowCasters} from './sun-shadow-casters.js';import {WorldShadowDepth} from './room-shadow.js';
function fixture(entryReuse=true){const scene=new T.Scene(),group=new T.Group(),camera=new T.PerspectiveCamera(),material=new T.MeshStandardMaterial();scene.add(group);const domain=createTerrainShadowDomain(group,material,{enabled:true});
 const lights=[10,30,100].map(span=>{const l=new T.DirectionalLight();l.position.set(0,20,0);l.castShadow=true;Object.assign(l.shadow.camera,{left:-span/2,right:span/2,top:span/2,bottom:-span/2,near:1,far:60});l.shadow.camera.updateProjectionMatrix();scene.add(l,l.target);return l;});
 const make=()=>{const g=new T.BoxGeometry(1,1,1);g.morphAttributes.position=[g.attributes.position.clone()];const m=new T.Mesh(g,material);m.castShadow=true;m.userData.terrainTile={};return m;};
 const mesh=make();domain.add(mesh);group.add(mesh);const dynamic=make();delete dynamic.userData.terrainTile;scene.add(dynamic);
 const fast=new SunShadowCasters(scene,lights,{terrainDomainCapture:true,entryReuse}),original=new SunShadowCasters(scene,lights,{terrainDomainCapture:false,entryReuse});
 const check=(skipCascades=[])=>{const a=fast.update(camera,{skipCascades}),b=original.update(camera,{skipCascades});assert.deepEqual(a,b);return a;};
 return{scene,group,camera,material,domain,mesh,dynamic,lights,fast,original,make,check};}
for(const entryReuse of [true,false])test('stable terrain hits retain exact cascade results while all non-terrain writes remain live '+entryReuse,()=>{const f=fixture(entryReuse);f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,1);assert.equal(f.fast.stats.objectScans,1);f.dynamic.position.x=12;f.check();assert.equal(f.fast.stats.terrainDomainHits,1);assert.equal(f.fast.stats.objectScans,1);
 for(const change of [()=>{f.mesh.visible=false;},()=>{f.mesh.visible=true;},()=>{f.mesh.morphTargetInfluences[0]=.5;f.domain.touch();},()=>{f.mesh.geometry.attributes.position.needsUpdate=true;},()=>{f.camera.layers.set(1);},()=>{f.camera.layers.set(0);},()=>{f.camera.position.x=2;f.camera.updateMatrixWorld();},()=>{f.lights[0].position.x=3;},()=>{f.group.position.x=1;},()=>{f.material.side=T.DoubleSide;},()=>{f.fast.markChanged(f.mesh);f.original.markChanged(f.mesh);},()=>{f.group.remove(f.mesh);}]){change();f.check();assert.equal(f.fast.stats.terrainDomainHits,0);f.check();}
});
test('unknown added casters bypass the domain, removal and skip mode changes preserve exact membership',()=>{const f=fixture();f.check();f.check();const unknown=f.make();f.group.add(unknown);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);unknown.position.x=20;f.check();f.group.remove(unknown);f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,1);for(const skip of [[true,true,false],[true,true,false],[false,true,false],[true,true,true],[false,false,false]])f.check(skip);});
test('real projected-depth assignment invalidates the domain; unsupported custom depth and material fall back',()=>{const f=fixture();f.check();f.check();const shadow=new WorldShadowDepth(f.scene);shadow.prepare();f.check();assert.equal(f.fast.stats.terrainDomainHits,0);f.check();assert.equal(f.fast.stats.terrainDomainHits,1);f.mesh.customDepthMaterial.opacity=.4;f.check();assert.equal(f.fast.stats.terrainDomainHits,0);f.material.alphaTest=.2;f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,0);f.material.alphaTest=0;f.mesh.customDepthMaterial.onBeforeCompile=()=>{};f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,0);shadow.dispose();});
test('uncontrolled submission mode, added controlled meshes and disposal never retain old membership',()=>{const f=fixture();let available=true;f.domain.eligible=()=>available&&!f.domain.disposed;f.check();f.check();available=false;f.mesh.position.x=30;f.check();assert.equal(f.fast.stats.terrainDomainHits,0);available=true;f.check();const added=f.make();f.domain.add(added);f.group.add(added);f.check();f.domain.dispose();f.group.remove(added);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);});

test('local subscriptions restore descriptors and reject replacement depth inputs without following mutable foreign objects',()=>{
 const f=fixture();f.check();f.check();f.mesh.layers.set(2);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);f.mesh.layers.set(0);f.check();f.mesh.position.x=2;f.check();assert.equal(f.fast.stats.terrainDomainHits,0);
 f.mesh.geometry.setAttribute('position',f.mesh.geometry.attributes.position.clone());f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,0);
 f.group.remove(f.mesh);assert.ok('value' in Object.getOwnPropertyDescriptor(f.mesh,'visible'));assert.ok('value' in Object.getOwnPropertyDescriptor(f.mesh.layers,'mask'));f.domain.dispose();
});

test('actual WorldTerrain attach, activate, morph, merge, cache restore and dispose publish without changing geometry',async t=>{
 const {WorldTerrain}=await import('./terrain.js');const saved=globalThis.location;let terrain;
 const height=(x,z)=>2100+.03*x-.02*z+Math.sin(x/17),world={meta:{far:{size:2560}},surface:{pads:[],heightAt:height,geographicHeightAt:height,normalAt(x,z,e=2){const dx=height(x-e,z)-height(x+e,z),dz=height(x,z-e)-height(x,z+e),n=Math.hypot(dx,2*e,dz);return{x:dx/n,y:2*e/n,z:dz/n};}},landcoverAt:()=>({r:.4,g:.2,b:0,a:1})};
 try{globalThis.location={search:'?terrainShadowDomain38=1'};terrain=new WorldTerrain(world);}finally{globalThis.location=saved;}
 const f=fixture();f.domain.dispose();f.scene.remove(f.group);f.scene.add(terrain.group);f.camera.position.set(0,2102,0);f.camera.updateMatrixWorld();for(const l of f.lights){l.position.set(0,2120,0);l.target.position.set(0,2100,0);}terrain._camera.copy(f.camera.position);terrain._frustum.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(f.camera.projectionMatrix,f.camera.matrixWorldInverse));const domain=terrain.shadowDomain;
 const build=node=>{const job=node.job||terrain._job(node);while(job.row<=32)terrain._buildRow(job);terrain._finish(job);};
 const snapshot=g=>({index:Array.from(g.index.array),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)]))});
 try{
  f.check();f.check();assert.equal(f.fast.stats.terrainDomainHits,1);
  const parent=terrain._node(-10,-10,20,4,null);build(parent);parent.mesh.visible=true;const original=snapshot(parent.mesh.geometry);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);
  parent.wantsSplit=true;terrain._refine(parent);for(const child of parent.children)build(child);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);assert.equal(parent.mesh.visible,false);assert.ok(parent.children.every(n=>n.mesh.visible));
  terrain._morphWeight(parent,.5);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);assert.deepEqual(snapshot(parent.mesh.geometry),original);
  terrain._merge(parent);f.check();assert.equal(f.fast.stats.terrainDomainHits,0);assert.equal(parent.mesh.visible,true);
  terrain._refine(parent);for(const child of parent.children)build(child);f.check();assert.ok(terrain.stats.restoredTiles>0,'real CPU tile cache restores source geometry');
  const live=[...domain.members];const installed={...domain.stats};terrain.dispose();f.check();assert.equal(domain.stats.activeDescriptors,0);assert.ok(live.every(m=>'value' in Object.getOwnPropertyDescriptor(m,'visible')));t.diagnostic(JSON.stringify({installed,afterDispose:{...domain.stats},note:'Node installation accounting only, not browser startup/performance'}));
 }finally{terrain.dispose();f.fast.dispose();f.original.dispose();}
});

test('disabling terrain-only depth signatures retains every original general attribute invalidation',()=>{const f=fixture();f.fast.terrainDepthCapture=f.original.terrainDepthCapture=false;f.check();f.check();f.mesh.geometry.attributes.normal.needsUpdate=true;f.check();assert.equal(f.fast.stats.terrainDomainHits,0);});

for(const entryReuse of [true,false])test('alternating cascade cadence reuses independent terrain observations '+entryReuse,()=>{
 const f=fixture(entryReuse);f.check();
 const masks=[[true,true,false],[false,true,true],[true,false,true],[false,true,false],[true,false,false],[false,false,false]];
 for(let round=0;round<3;round++)for(const mask of masks){f.check(mask);assert.equal(f.fast.stats.terrainDomainCascadeMisses,0);assert.equal(f.fast.stats.terrainDomainCascadeHits,mask.filter(v=>!v).length);assert.equal(f.fast.stats.objectScans,1);}
 // Changing one light invalidates only its frustum, not the other two.
 f.lights[0].position.x=3;f.check();assert.equal(f.fast.stats.terrainDomainCascadeMisses,1);assert.equal(f.fast.stats.terrainDomainCascadeHits,2);
 // A write while a cascade is skipped is observed when that cascade returns.
 f.mesh.position.x=12;f.check([true,true,false]);assert.equal(f.fast.stats.terrainDomainCascadeMisses,1);
 f.check([false,true,true]);assert.equal(f.fast.stats.terrainDomainCascadeMisses,1);
 f.check([true,false,true]);assert.equal(f.fast.stats.terrainDomainCascadeMisses,1);
 f.check();assert.equal(f.fast.stats.terrainDomainCascadeMisses,0);
});
