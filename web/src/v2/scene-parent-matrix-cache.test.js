import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {readFileSync} from 'node:fs';
import {installSceneMatrixCache} from './scene-matrix-cache.js';
function fixture(){
 const scene=new T.Scene(),parent=new T.Group(),other=new T.Group(),auto=new T.Mesh(),manual=new T.Mesh(),door=new T.Group(),panel=new T.Mesh(),nested=new T.Group(),inner=new T.Mesh();
 scene.add(parent,other);parent.add(auto,manual,door,nested);door.add(panel);nested.add(inner);
 manual.matrixAutoUpdate=inner.matrixAutoUpdate=false;manual.matrix.makeTranslation(2,3,4);inner.matrix.makeTranslation(9,8,7);parent.position.set(3,1,2);door.position.x=4;
 return{scene,parent,other,auto,manual,door,panel,nested,inner};
}
function compare(a,b){for(const key of Object.keys(a)){assert.deepEqual(a[key].matrix.elements,b[key].matrix.elements,key+' local');assert.deepEqual(a[key].matrixWorld.elements,b[key].matrixWorld.elements,key+' world');assert.equal(a[key].matrixWorldNeedsUpdate,b[key].matrixWorldNeedsUpdate,key+' dirty');}}
test('parents scope retains native leaves and matches all TRS, pivot, dirty and direct matrix mutations',()=>{
 const a=fixture(),b=fixture(),cache=installSceneMatrixCache(b.scene,{scope:'parents'});
 const update=(force)=>{a.scene.updateMatrixWorld(force);b.scene.updateMatrixWorld(force);compare(a,b);};update();update();
 assert.equal(cache.stats.eligible,4);assert.equal(cache.stats.manualGuards,2);
 for(const key of ['auto','manual','panel','inner','other']){assert.equal(Object.hasOwn(b[key],'updateMatrix'),false);assert.equal(Object.hasOwn(b[key],'updateMatrixWorld'),false);}
 const copies=cache.stats.guardCopies,composed=cache.stats.composed;update();assert.equal(cache.stats.guardCopies,copies);assert.equal(cache.stats.composed,composed);
 const changes=[f=>f.auto.position.x++,f=>f.parent.position.x++,f=>f.door.rotation.y=.8,f=>f.panel.scale.set(2,3,4),
  f=>f.parent.pivot=new T.Vector3(1,2,3),f=>f.parent.pivot.x++,f=>f.parent.pivot=null,
  f=>f.manual.matrix.elements[12]=99,f=>f.manual.matrixWorld.elements[13]=888,
  f=>f.inner.matrix.makeScale(3,2,1),f=>f.inner.matrixWorld.makeTranslation(555,0,0),
  f=>f.manual.matrixWorldNeedsUpdate=true,f=>f.parent.matrixWorldNeedsUpdate=true,
  f=>f.parent.matrixWorld.makeTranslation(100,100,100),f=>f.parent.matrix.makeTranslation(200,200,200),
  f=>f.parent.updateMatrix(),f=>f.parent.updateWorldMatrix(true,true),
  f=>{f.manual.matrixAutoUpdate=true;f.manual.position.x=12;},f=>{f.manual.matrixAutoUpdate=false;f.manual.matrix.elements[14]=77;},
  f=>{f.nested.matrixAutoUpdate=false;f.nested.matrix.makeTranslation(6,6,6);},f=>f.inner.matrix.elements[12]=456,
  f=>{f.nested.matrixAutoUpdate=true;},f=>{f.manual.matrixWorldAutoUpdate=false;f.manual.matrixWorld.makeTranslation(100,200,300);},
  f=>f.manual.matrix.elements[12]=21,f=>f.manual.matrixWorldAutoUpdate=true,
  f=>{f.parent.matrixWorldAutoUpdate=false;f.parent.matrixWorld.makeTranslation(11,22,33);},
  f=>f.parent.matrixWorldAutoUpdate=true,
  f=>{f.scene.matrixAutoUpdate=false;f.scene.matrixWorldNeedsUpdate=false;},f=>f.manual.matrix.elements[12]=111,
  f=>{f.scene.matrixAutoUpdate=true;}];
 for(const change of changes){change(a);change(b);update();update();}
 update(true);cache.setEnabled(false);a.parent.position.x=b.parent.position.x=42;update();cache.setEnabled(true);update();update();
 cache.dispose();assert.equal(cache.stats.nodes,0);assert.equal(cache.stats.manualGuards,0);
 for(const object of Object.values(b)){assert.equal(Object.hasOwn(object,'updateMatrix'),false);assert.equal(Object.hasOwn(object,'updateMatrixWorld'),false);}
});
test('parent qualification follows child add/remove/reparent and detached subtrees restore independently',()=>{
 const a=fixture(),b=fixture(),cache=installSceneMatrixCache(b.scene,{scope:'parents'});
 const update=()=>{a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();compare(a,b);};update();update();
 for(const f of[a,b])f.other.add(f.manual);assert.equal(cache.stats.eligible,5);assert.equal(Object.hasOwn(b.manual,'updateMatrix'),false);update();update();
 for(const f of[a,b])f.parent.add(f.manual);assert.equal(cache.stats.eligible,4);assert.equal(Object.hasOwn(b.other,'updateMatrix'),false);update();
 for(const f of[a,b])f.scene.remove(f.nested); // non-child no-op
 for(const f of[a,b])f.parent.remove(f.nested);assert.equal(Object.hasOwn(b.nested,'updateMatrix'),false);assert.equal(Object.hasOwn(b.inner,'updateMatrixWorld'),false);
 for(const f of[a,b]){f.inner.matrix.elements[12]=87;f.nested.updateMatrixWorld(true);}compare(a,b);
 for(const f of[a,b])f.other.add(f.nested);update();update();
 for(const f of[a,b])f.nested.remove(f.inner);assert.equal(Object.hasOwn(b.nested,'updateMatrix'),false);update();
 for(const f of[a,b])f.nested.add(f.inner);assert.equal(Object.hasOwn(b.nested,'updateMatrix'),true);update();update();cache.dispose();
});
test('custom matrix callbacks and cameras retain native force behavior; later overrides survive dispose',()=>{
 const build=()=>{const scene=new T.Scene(),group=new T.Group(),leaf=new T.Object3D(),camera=new T.PerspectiveCamera(),forces=[];scene.add(group,camera);group.add(leaf);leaf.updateMatrixWorld=function(force){forces.push(!!force);T.Object3D.prototype.updateMatrixWorld.call(this,force);};return{scene,group,leaf,camera,forces};};
 const a=build(),b=build(),cache=installSceneMatrixCache(b.scene,{scope:'parents'});
 for(let i=0;i<4;i++){a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();assert.deepEqual(a.forces,b.forces);assert.deepEqual(a.camera.matrixWorldInverse.elements,b.camera.matrixWorldInverse.elements);}
 assert.equal(Object.hasOwn(b.camera,'updateMatrixWorld'),false);const replacement=()=>{};b.group.updateMatrix=replacement;cache.dispose();assert.equal(b.group.updateMatrix,replacement);assert.equal(Object.hasOwn(b.group,'updateMatrixWorld'),false);
});
test('parents mode is explicit, keeps old all entry and has no default activation',()=>{
 const source=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 assert.match(source,/sceneMatrixCacheMode==="parents"\?installSceneMatrixCache\(scene,\{scope:"parents"\}\):sceneMatrixCacheMode==="1"\?installSceneMatrixCache\(scene\):null/);
 assert.throws(()=>installSceneMatrixCache(new T.Scene(),{scope:'unknown'}),/Unknown/);
});


test('settled manual leaves skip only redundant matrix products while automatic leaf composition stays native',()=>{
 const a=fixture(),b=fixture(),cache=installSceneMatrixCache(b.scene,{scope:'parents'}),counts={native:0,cached:0,autoCompose:0};
 for(const [f,key]of[[a,'native'],[b,'cached']])for(const name of['manual','inner']){
  const matrix=f[name].matrixWorld,original=matrix.multiplyMatrices;matrix.multiplyMatrices=function(...args){counts[key]++;return original.apply(this,args);};
 }
 const compose=b.auto.matrix.compose;b.auto.matrix.compose=function(...args){counts.autoCompose++;return compose.apply(this,args);};
 a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();
 counts.native=counts.cached=counts.autoCompose=0;const copies=cache.stats.guardCopies;
 for(let i=0;i<5;i++){a.scene.updateMatrixWorld();b.scene.updateMatrixWorld();compare(a,b);}
 assert.equal(counts.native,10);assert.equal(counts.cached,0);assert.equal(counts.autoCompose,5);
 assert.equal(cache.stats.guardCopies,copies);cache.dispose();
});
