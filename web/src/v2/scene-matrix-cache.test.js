import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {installSceneMatrixCache} from './scene-matrix-cache.js';
function fixture(){const s=new T.Scene(),p=new T.Group(),a=new T.Object3D(),b=new T.Object3D();s.add(p);p.add(a,b);a.position.set(1,2,3);b.position.set(4,5,6);p.position.set(9,0,2);return{s,p,a,b};}
function compare(a,b){for(const k of['s','p','a','b']){assert.deepEqual(a[k].matrix.elements,b[k].matrix.elements,k+' local');assert.deepEqual(a[k].matrixWorld.elements,b[k].matrixWorld.elements,k+' world');}}
test('unchanged scene skips native composition and parent force while exact dynamic TRS/pivot and explicit dirty updates remain equal',()=>{
 const a=fixture(),b=fixture(),cache=installSceneMatrixCache(b.s);
 const update=()=>{a.s.updateMatrixWorld();b.s.updateMatrixWorld();compare(a,b);};update();const composed=cache.stats.composed;update();assert.equal(cache.stats.composed,composed);assert.equal(cache.stats.reused,4);
 for(const change of[f=>f.p.rotation.y=.8,f=>f.a.position.x+=3,f=>f.b.scale.set(2,3,4),f=>{f.a.pivot=new T.Vector3(2,3,4);},f=>f.a.pivot.x++,f=>f.a.pivot=null,f=>{f.a.matrixWorldNeedsUpdate=true;}]){change(a);change(b);update();update();}
 b.a.updateMatrix();assert.equal(b.a.matrixWorldNeedsUpdate,true);a.a.updateMatrix();update();cache.dispose();assert.equal(Object.hasOwn(b.a,'updateMatrix'),false);
});
test('direct local/world edits and manual matrix nodes recover without swallowing explicit flags or updateWorldMatrix',()=>{
 const a=fixture(),b=fixture(),cache=installSceneMatrixCache(b.s);const update=()=>{a.s.updateMatrixWorld();b.s.updateMatrixWorld();compare(a,b);};update();update();
 for(const f of[a,b])f.a.matrix.elements[12]=999;update();
 for(const f of[a,b])f.a.matrixWorld.elements[12]=555;update();
 for(const f of[a,b]){f.a.matrixAutoUpdate=false;f.a.matrix.makeTranslation(9,3,8);}update();update();
 for(const f of[a,b]){f.p.matrixWorldNeedsUpdate=true;f.p.updateWorldMatrix(true,true);}compare(a,b);update();
 cache.setEnabled(false);for(const f of[a,b])f.p.position.x=35;update();cache.setEnabled(true);update();update();cache.dispose();
});
test('streamed subtrees detach/restore and custom matrix methods remain unwrapped',()=>{
 const s=new T.Scene(),cache=installSceneMatrixCache(s),p=new T.Group(),child=new T.Object3D(),custom=new T.Object3D();let calls=0;const method=function(){calls++;T.Object3D.prototype.updateMatrix.call(this);};custom.updateMatrix=method;p.add(child,custom);s.add(p);assert.equal(cache.stats.nodes,4);assert.equal(custom.updateMatrix,method);s.updateMatrixWorld();s.updateMatrixWorld();assert.equal(calls,2);
 s.remove(p);assert.equal(cache.stats.nodes,1);assert.equal(Object.hasOwn(child,'updateMatrix'),false);assert.equal(custom.updateMatrix,method);s.add(p);s.updateMatrixWorld();assert.equal(cache.stats.nodes,4);
 const replacement=()=>{};child.updateMatrix=replacement;cache.dispose();assert.equal(child.updateMatrix,replacement);assert.equal(Object.hasOwn(p,'updateMatrix'),false);assert.equal(cache.stats.nodes,0);
});
