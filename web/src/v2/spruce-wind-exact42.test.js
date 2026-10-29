import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {MeadowWindField} from './wind-field.js';
import {treeRootWind,TreeRootWindExactReuse42,SpruceRootWind,disposeTreeWindGeometry} from './spruce-wind.js';
import {decodeForestRootBundle,forestRootFromTile} from './forest-root-codec.js';
const exact=(a,b)=>assert.deepEqual(new Uint32Array(a.buffer,a.byteOffset,a.length),new Uint32Array(b.buffer,b.byteOffset,b.length));
test('exact reuse retains original Float32 bits across edges, mutable roots, grids, field arrays, time and blend',()=>{
 const f=new MeadowWindField();f.update(100.7,{x:-3610,z:4806});const cache=new TreeRootWindExactReuse42();
 const root={x:0,z:0,rot:.45,s:1.48};let stable;
 for(const u of[-1,0,.0001,.02,.08,.5,.92,.999,1,2])for(const v of[-.1,.04,.5,1.2])for(const blend of[0,.13,.51,1]){
  root.x=f.origin.x+u*f.span;root.z=f.origin.y+v*f.span;f.uniforms.uWindFieldBlend.value=blend;
  const out=cache.sample(f,root,100.74);exact(out,treeRootWind(f,root,100.74));if(stable)assert.strictEqual(out,stable);stable=out;
 }
 for(const mutate of[()=>root.rot+=.7,()=>root.s=.72,()=>root.x+=.01,()=>root.z-=.01,()=>f.origin.x+=100,()=>f.origin.y-=20,()=>f.span*=.7,()=>{f.resolution/=2;},()=>{f.previous.image.data=f.previous.image.data.slice().fill(42);},()=>{f.current.image.data.fill(203);}]){
  mutate();for(const t of[0,.01,100,600,86400])exact(cache.sample(f,root,t),treeRootWind(f,root,t));
 }
 cache.clear();assert.notStrictEqual(cache.sample(f,root,1),stable);f.dispose();
});
test('runtime defaults to exact reuse, supports original fallback and switches same phase, preserves complete buffers and upload count, clears on dispose',()=>{
 const f=new MeadowWindField();f.update(4,{x:-3600,z:4800});const owner=new SpruceRootWind(),source=new THREE.BoxGeometry();
 const roots=Array.from({length:64},(_,i)=>({id:String(i),x:-3800+i*7,z:4700+i*3,rot:i*.13,s:.72+i*.01}));
 const geometry=owner.createGeometry(source,64,'test'),buffer=geometry.attributes.aTreeRootWind.data,batches=new Map([[0,{mesh:{geometry,count:64},activeRecords:roots}]]);
 assert.ok(owner.exactReuse42 instanceof TreeRootWindExactReuse42);assert.equal(owner.stats.exactReuse42,true);owner.setExactReuse42(false);assert.equal(owner.exactReuse42,null);owner.update(batches,f,4.1,1);const baseline=buffer.array.slice(),version=buffer.version,bytes=owner.stats.bytes;
 owner.setExactReuse42(true);assert.equal(owner.update(batches,f,4.1,1),true);exact(buffer.array,baseline);assert.equal(buffer.version,version+1);assert.equal(owner.stats.bytes,bytes);
 roots[0].x+=10;roots[1].rot+=.2;owner.update(batches,f,4.2,1);for(let i=0;i<64;i++)exact(buffer.array.subarray(i*5,i*5+5),treeRootWind(f,roots[i],4.2));
 const on=buffer.array.slice();owner.setExactReuse42(false);owner.update(batches,f,4.2,1);exact(buffer.array,on);assert.equal(buffer.version,version+3);
 owner.setExactReuse42(true);owner.dispose();assert.equal(owner.exactReuse42,null);disposeTreeWindGeometry(geometry);source.dispose();f.dispose();
});
test('all stored actual forest roots retain every output Float32 bit at three wind phases',async t=>{
 const manifest=JSON.parse(readFileSync(new URL('../../public/data/v2/forest-roots-38.json',import.meta.url)));
 const raw=new Uint8Array(gunzipSync(readFileSync(new URL('../../public/data/v2/forest-roots-38.bin.gz',import.meta.url))));
 const tiles=await decodeForestRootBundle(raw,manifest),cache=new TreeRootWindExactReuse42(),f=new MeadowWindField();f.update(100.7,{x:-3610.730641,z:4806.40659});assert.ok(f.current.image.data.some(v=>v!==0));let count=0;
 for(const tile of tiles.values())for(let z=tile.tz*32;z<(tile.tz+1)*32;z++)for(let x=tile.tx*32;x<(tile.tx+1)*32;x++){
  const root=forestRootFromTile(tile,x,z);if(!root)continue;count++;
  for(const time of[0,100.74,600.3]){f.uniforms.uWindFieldBlend.value=time===0?0:.51;exact(cache.sample(f,root,time),treeRootWind(f,root,time));}
 }
 assert.equal(count,manifest.trees);t.diagnostic(`${count} actual roots, ${count*3*5} exact Float32 components; not a performance benchmark`);cache.clear();f.dispose();
});
