import test from 'node:test';
import assert from 'node:assert/strict';
import {DataTexture,DataArrayTexture,MeshStandardMaterial,Group,Mesh,BoxGeometry,RepeatWrapping} from 'three';
import {EarlyTreeTextures} from './early-tree-textures.js';
import {loadEcologySources} from './ecology-loading.js';
import {readFile} from 'node:fs/promises';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 let now=100,next=1;const timers=new Map(),states=new WeakMap(),uploads=[],failures=[];
 const scheduler={now:()=>now,set:fn=>{const id=next++;timers.set(id,fn);return id;},clear:id=>timers.delete(id)};
 const renderer={properties:{get:t=>{if(!states.has(t))states.set(t,{});return states.get(t);}},initTexture(t){uploads.push(t);now+=5;states.get(t).__version=t.version;}};
 return {renderer,scheduler,uploads,failures,controller:new AbortController(),run(){const [id,fn]=timers.entries().next().value||[];if(fn){timers.delete(id);fn();}},all(){let guard=100;while(timers.size&&guard--)this.run();assert.ok(guard>0);},get pending(){return timers.size;}};
}
const texture=()=>{const t=new DataTexture(new Uint8Array([50,60,70,255]),1,1);t.needsUpdate=true;return t;};
const tree=(map,normalMap=null)=>{const scene=new Group();scene.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial({map,normalMap})));return {scene};};
function defaults(x={}){return {hi:()=>tree(texture()),mid:()=>tree(texture()),local:()=>({}),core:()=>({}),far:()=>null,needle:()=>tree(texture()),flowerModule:()=>({loadFlowerLODAssets:()=>({dispose(){}}),loadFlowerAssets:()=>({dispose(){}})}),...x};}
function start(f){return new EarlyTreeTextures(f.renderer,{signal:f.controller.signal,scheduler:f.scheduler,onFailure:e=>{f.failures.push(e);f.controller.abort(e);}});}

test('actual final texture identities, source and samplers survive early upload and material cloning; shared identities queue once',async()=>{
 const f=fixture(),q=start(f),a=texture(),b=a.clone();b.wrapS=RepeatWrapping;
 const original={image:a.image,source:a.source,version:a.version,bytes:a.image.data.slice(),wrap:a.wrapS};
 const hi=tree(a,b),mid=tree(a,b);q.enqueue('hi',hi);q.enqueue('mid',mid);q.enqueue('hi',hi);
 assert.equal(f.uploads.length,0,'asset callback never performs blocking upload inline');assert.equal(f.pending,1);
 const ready=q.finish();f.all();await ready;
 assert.deepEqual(f.uploads,[a,b]);assert.equal(q.stats.selected,2);assert.equal(q.stats.duplicates,4);
 const runtime=hi.scene.children[0].material.clone();assert.strictEqual(runtime.map,a);assert.strictEqual(runtime.normalMap,b);
 assert.strictEqual(a.image,original.image);assert.strictEqual(a.source,original.source);assert.strictEqual(a.source,b.source);
 assert.equal(a.version,original.version);assert.deepEqual(a.image.data,original.bytes);assert.equal(a.wrapS,original.wrap);assert.equal(b.wrapS,RepeatWrapping);
 assert.equal(q.stats.firstUploadAtMs,100);assert.equal(q.stats.completedAtMs,110);assert.equal(q.stats.uploadTotalMs,10);assert.equal(q.stats.sources[1].duplicates,2);
 q.dispose();assert.equal(q.stats.status,'complete');assert.equal(f.pending,0);
});

test('far array textures are the exact objects sampled later and non-tree source names are ignored',async()=>{
 const f=fixture(),q=start(f),albedo=new DataArrayTexture(new Uint8Array(8),1,1,2),normal=new DataArrayTexture(new Uint8Array(8),1,1,2);
 albedo.needsUpdate=true;normal.needsUpdate=true;const far={albedo,normal,metadata:{},dispose(){throw Error('borrower must not dispose assets');}};
 q.enqueue('far',far);q.enqueue('flowerNear',tree(texture()));const ready=q.finish();f.all();await ready;
 assert.deepEqual(f.uploads,[albedo,normal]);assert.equal(q.stats.sources.length,1);assert.equal(q.stats.sources[0].name,'far');
});

test('upload runs before an unrelated resource settles; publication waits for the complete queue',async()=>{
 const f=fixture(),q=start(f),wait=deferred(),hi=tree(texture());let published=false;
 const loaded=loadEcologySources(defaults({hi:()=>hi,far:()=>wait.promise}),{signal:f.controller.signal,onReady:(n,v)=>q.enqueue(n,v),beforePublish:()=>q.finish()}).then(v=>{published=true;return v;});
 await tick();f.all();assert.ok(f.uploads.includes(hi.scene.children[0].material.map));assert.equal(published,false);assert.equal(q.sealed,false);
 wait.resolve({albedo:texture(),normal:texture(),dispose(){}});await tick();assert.equal(published,false);f.all();const result=await loaded;
 assert.strictEqual(result.hi,hi);assert.equal(q.stats.status,'complete');assert.equal(published,true);
});

test('a new version requeues the same object while a duplicate identity/version does not',async()=>{
 const f=fixture(),q=start(f),a=texture(),hi=tree(a);q.enqueue('hi',hi);f.all();q.enqueue('mid',hi);assert.equal(f.pending,0);
 a.needsUpdate=true;q.enqueue('mid',hi);const ready=q.finish();f.all();await ready;
 assert.deepEqual(f.uploads,[a,a]);assert.equal(q.stats.selected,2);assert.equal(q.stats.duplicates,1);
});

test('cancellation and disposal cancel pending work without closing, replacing or disposing borrowed textures',async()=>{
 for(const via of ['signal','dispose','already-aborted']){
  const f=fixture();if(via==='already-aborted')f.controller.abort();const q=start(f),a=texture();let disposals=0;a.addEventListener('dispose',()=>disposals++);
  q.enqueue('hi',tree(a));if(via==='signal')f.controller.abort();if(via==='dispose')q.dispose();
  await assert.rejects(q.finish(),e=>e.name==='AbortError');f.all();assert.equal(f.uploads.length,0);assert.equal(f.pending,0);assert.equal(disposals,0);assert.equal(f.failures.length,0);
 }
});

test('initializer failure aborts the loading transaction and releases completed/late sources once',async()=>{
 const f=fixture(),q=start(f),wait=deferred(),hi=tree(texture());let releases=0;
 hi.scene.children[0].geometry.addEventListener('dispose',()=>releases++);
 const failure=new Error('GPU upload failed');f.renderer.initTexture=()=>{throw failure;};
 const loaded=loadEcologySources(defaults({hi:()=>hi,far:()=>wait.promise}),{signal:f.controller.signal,onFailure:e=>f.controller.abort(e),onReady:(n,v)=>q.enqueue(n,v),beforePublish:()=>q.finish()});loaded.catch(()=>{});
 await tick();f.all();assert.equal(f.controller.signal.reason,failure);assert.equal(releases,0);
 wait.resolve({dispose(){releases++;}});await assert.rejects(loaded,e=>e===failure);assert.equal(releases,2);assert.deepEqual(f.failures,[failure]);assert.equal(f.pending,0);
});

test('disposing a borrowed queued texture rejects safely and removes listeners',async()=>{
 const f=fixture(),q=start(f),a=texture();q.enqueue('hi',tree(a));a.dispose();await assert.rejects(q.finish(),/Pending tree texture disposed/);
 f.all();assert.equal(f.uploads.length,0);assert.equal(f.pending,0);assert.equal(q.listeners.size,0);
});

test('startup integration is explicit opt-in, stays camera-independent and leaves baseline compile and first-frame accounting intact',async()=>{
 const [main,ecology]=await Promise.all(['main.js','ecology.js'].map(n=>readFile(new URL(n,import.meta.url),'utf8')));
 assert.ok(main.includes('textureRenderer:params.get("earlyTreeTextures")==="1"?renderer:null'));
 assert.ok(ecology.includes('onReady:(name,value)=>this.earlyTreeTextures?.enqueue(name,value),beforePublish:()=>this.earlyTreeTextures?.finish()'));
 assert.ok(ecology.includes('this.earlyTreeTextures?.dispose()'));
 assert.ok(main.includes('loadTimings.navigationToFirstFrameSubmittedMs=performance.now()'));
 assert.ok(main.includes('await measureLoad("initialShaders",compileDestination)'));
});
