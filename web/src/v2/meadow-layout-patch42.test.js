import * as THREE from 'three';
import {GrassRootField,createGrassFieldGeometry,disposeGrassFieldGeometry} from './grass-root-field.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createMeadowLayoutPatch42,MEADOW_LAYOUT_PATCH42} from './meadow-layout-patch42.js';
const surface={heightAt:(x,z)=>2200+x*.1+z*.04,normalAt:()=>({x:-.1,y:.99,z:-.04})};
const landform={response(x,z,inputs,out,community){community[1]=.4;community[2]=.2;return out;}};
const fixture=()=>({world:{surface}});
const root=(x,z,id='a')=>({id,x,z,y:surface.heightAt(x,z)-.035,s:1.12,sy:1.31,rot:1.4});
test('fixed patch preserves every identity/leaf scale, source object, count and exact outside/brook roots',()=>{
 const p=MEADOW_LAYOUT_PATCH42,layout=createMeadowLayoutPatch42(fixture(),{landform,accept:()=>true}),roots=[];
 for(let z=-40;z<=40;z++)for(let x=-40;x<=40;x++)roots.push(root(p.x+x,p.z+z,`${x}:${z}`));
 const before=JSON.stringify(roots),mapped=roots.map(layout.map);assert.equal(mapped.length,roots.length);assert.equal(new Set(mapped.map(r=>r.id)).size,roots.length);
 for(let i=0;i<roots.length;i++){const a=roots[i],b=mapped[i];assert.equal(a.id,b.id);assert.equal(a.s,b.s);assert.equal(a.sy,b.sy);assert.equal(a.rot,b.rot);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=2+1e-10);assert.ok(Math.abs((a.y-surface.heightAt(a.x,a.z))-(b.y-surface.heightAt(b.x,b.z)))<1e-9);if(!layout.inside(a))assert.strictEqual(a,b);assert.strictEqual(layout.map(a),b);}
 assert.equal(JSON.stringify(roots),before);assert.ok(layout.stats.moved>1000);
 const wet={...root(p.x,p.z,'wet'),brookAsset:{}};assert.strictEqual(layout.map(wet),wet);
});
test('edge tends to exact zero, inadmissible destinations keep original roots, flat terrain does not invent contour',()=>{
 const p=MEADOW_LAYOUT_PATCH42,l=createMeadowLayoutPatch42(fixture(),{landform,accept:()=>false}),r=root(p.x,p.z);assert.strictEqual(l.map(r),r);assert.equal(l.stats.rejected,1);
 const flat=createMeadowLayoutPatch42({world:{surface:{...surface,normalAt:()=>({x:0,y:1,z:0})}}},{landform});assert.strictEqual(flat.map(r),r);
 const edge=createMeadowLayoutPatch42(fixture(),{landform}),r2=root(p.x+32-1e-5,p.z);assert.ok(Math.hypot(edge.map(r2).x-r2.x,edge.map(r2).z-r2.z)<1e-8);
});
test('one source ID maps identically independent of tile arrival order and rejects source mutation',()=>{
 const p=MEADOW_LAYOUT_PATCH42,rs=Array.from({length:60},(_,i)=>root(p.x-29+i,p.z+i%11,String(i))),a=createMeadowLayoutPatch42(fixture(),{landform}),b=createMeadowLayoutPatch42(fixture(),{landform});
 const forward=new Map(rs.map(r=>[r.id,a.map(r)])),backward=new Map(rs.slice().reverse().map(r=>[r.id,b.map(r)]));for(const r of rs)assert.deepEqual(forward.get(r.id),backward.get(r.id));
 assert.throws(()=>a.map({...rs[0],x:rs[0].x+.01}),/source changed/);
});

test('same-page owner applies after cached source across near and far, preserves wet owner and fully restores',async()=>{
 const {installMeadowLayoutPatch42}=await import('./meadow-layout-patch42.js'),p=MEADOW_LAYOUT_PATCH42,tx=Math.floor(p.x/24),tz=Math.floor(p.z/24),key=tx+','+tz;
 const roots=[root(p.x,p.z),root(p.x+4,p.z+2,'b'),{...root(p.x+1,p.z+1,'wet'),brookAsset:{owned:true}}];
 const world={surface,meta:{far:{size:8192},core:{size:8192}},landcoverAt:()=>({r:0,g:0,b:0}),hydrology:{isExcluded:()=>false,sampleAt:()=>({wetness:.2})}};
 const contact={intersects:()=>false},tile={tx,tz,list:roots,regular:roots.slice(0,2),wet:roots.slice(2),meshes:[]};let originals=0,basePublished=0;
 const e={world,shoreGrassEnvelope:{radius:.8,slabs:[]},pastureGrassEnvelope41:{radius:.8,slabs:[]},thresholdPlants:contact,boardwalkPlantContact39:contact,pasturePlantContact41:contact,routeBins:new Map(),excluded:()=>false,grassTiles:new Map([[key,tile]]),generateGrassTileRoots(){originals++;return roots;},syncPool(){},baseGrass:{},syncBasalGrass(){},publishMeadowPools(){basePublished++;}};
 const sourceGeometry=new THREE.BoxGeometry(.2,1,.2),geometry=createGrassFieldGeometry(sourceGeometry,2),mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),2);
 e.grassRootField=new GrassRootField(world);e.uniforms={uWorldViewer:{value:new THREE.Vector3(p.x,2200,p.z)}};
 e.matrix=r=>new THREE.Matrix4().compose(new THREE.Vector3(r.x,r.y,r.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r.rot),new THREE.Vector3(r.s,r.sy,r.s));
 roots.slice(0,2).forEach((r,i)=>{mesh.setMatrixAt(i,e.matrix(r));e.grassRootField.write(geometry.attributes.aMeadowRootField,i,r,geometry.attributes.aMeadowLandform,geometry.attributes.aMeadowCommunity);});mesh.computeBoundingSphere();mesh.boundingSphere.radius+=1;tile.meshes[1]=mesh;
 const originalMatrix=mesh.instanceMatrix.array.slice(),originalFields=geometry.attributes.aMeadowRootField.array.slice(),originalSphere=mesh.boundingSphere.clone();
 const original=e.generateGrassTileRoots,cluster={tiles:new Map([[key,{tx,tz,roots:roots.slice(0,2),meshes:[]}]]),submission:{enabled:false},drop(){},build(x,z){this.tiles.set(key,{tx:x,tz:z,roots:(e.grassTiles.get(key)?.list??e.generateGrassTileRoots(x,z)).filter(r=>!r.brookAsset),meshes:[]});}};
 const d={ecology:e,meadowCluster:cluster,camera:{},environment:{forceShadowUpdate:false}},owner=installMeadowLayoutPatch42(d);
 assert.strictEqual(e.generateGrassTileRoots(tx,tz),roots);assert.equal(owner.stats.enabled,false);owner.setEnabled(true);
 assert.notStrictEqual(tile.regular[0],roots[0]);assert.strictEqual(tile.wet[0],roots[2]);assert.deepEqual(cluster.tiles.get(key).roots,tile.regular);assert.deepEqual(e.generateGrassTileRoots(tx,tz).slice(0,2),tile.regular);assert.ok(originals>=2);
 owner.setEnabled(false);assert.deepEqual(tile.list,roots);assert.strictEqual(tile.list[0],roots[0]);assert.deepEqual(cluster.tiles.get(key).roots,roots.slice(0,2));assert.strictEqual(e.generateGrassTileRoots(tx,tz),roots);
 owner.setEnabled(true);owner.dispose();assert.strictEqual(e.generateGrassTileRoots,original);assert.strictEqual(tile.list[0],roots[0]);assert.equal(basePublished,4);assert.deepEqual(mesh.instanceMatrix.array,originalMatrix);assert.deepEqual(geometry.attributes.aMeadowRootField.array,originalFields);assert.ok(mesh.boundingSphere.equals(originalSphere));assert.strictEqual(tile.meshes[1],mesh);assert.equal(d.environment.forceShadowUpdate,true);assert.throws(()=>owner.setEnabled(true),/disposed/);disposeGrassFieldGeometry(geometry);sourceGeometry.dispose();mesh.material.dispose();mesh.dispose();e.grassRootField.dispose();
});
