import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {route3CourtyardEnabled,route3CourtyardLayout,route3PatchGeometry} from './route3-courtyard38.js';
import {WorldPaths} from './paths.js';
function actual(){const root=new URL('../../public/',import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};return createWorldData({meta,objects:j('data/objects.json'),detailMeta:j('data/detail.json'),manifest:j('world-v2/manifest.json'),streamData:j('data/streams.json'),coreHeights:decodeHeightBytes(b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});}

test('route3 candidate default off and only explicit1 enabled',()=>{const saved=globalThis.location;try{for(const [search,want]of [['',false],['?route3Courtyard38=0',false],['?route3Courtyard38=1',true]]){globalThis.location={search};assert.equal(route3CourtyardEnabled(),want);}}finally{globalThis.location=saved;}});
test('actual route3 source endpoints, terrain and all original plants/geometry survive independent candidate',()=>{
 const saved=globalThis.location;try{
 globalThis.location={search:''};const world=actual(),before=JSON.stringify(world.objects),base=new WorldPaths(world),layout=route3CourtyardLayout(world);
 assert.equal(layout.patches.length,7);assert.ok(Math.abs(layout.sourceRouteLength-33.833874079487444)<1e-9);
 assert.ok(Math.hypot(layout.guestFoot[0]-layout.route.points[0][0],layout.guestFoot[1]-layout.route.points[0][1])<.2,'original outer porch stair matches upper route endpoint');
 assert.ok(Math.hypot(layout.lodgeRear[0]-layout.route.points.at(-1)[0],layout.lodgeRear[1]-layout.route.points.at(-1)[1])<.8,'lower route outside true rear opening');
 let triangles=0,peakCoverage=0,minY=1;
 for(const patch of layout.patches){const g=route3PatchGeometry(world,layout,patch);triangles+=g.index.count/3;for(let i=0;i<g.attributes.position.count;i++){const p=g.attributes.position,x=p.getX(i),z=p.getZ(i);assert.ok(Math.abs(p.getY(i)-world.surface.heightAt(x,z)-.008)<.001);minY=Math.min(minY,g.attributes.normal.getY(i));peakCoverage=Math.max(peakCoverage,g.attributes.aCourtyardCoverage.getX(i));}g.dispose();}
 assert.ok(minY>0);assert.ok(peakCoverage<=.72);assert.ok(peakCoverage>.2);
 globalThis.location={search:'?route3Courtyard38=1'};const candidate=new WorldPaths(world),added=candidate.group.children.filter(o=>o.userData.kind==='route3-ground-trace');
 assert.equal(added.length,1);assert.equal(added[0].userData.patchIds.length,7);assert.equal(candidate.stats.route3Courtyard.triangles,triangles);
 const old=candidate.group.children.filter(o=>o.userData.kind!=='route3-ground-trace');assert.equal(old.length,base.group.children.length);
 for(let i=0;i<old.length;i++){const a=old[i],b=base.group.children[i];assert.equal(a.name,b.name);assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array);if(a.instanceMatrix)assert.deepEqual(a.instanceMatrix.array,b.instanceMatrix.array);}
 assert.equal(JSON.stringify(world.objects),before);assert.equal(candidate.stats.route3Courtyard.grassRootsMoved,0);
 const material=added[0].material;assert.equal(material.map,candidate.surfaces.dirt.map);const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'};material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/diffuseColor.a\*=vCourtyardCoverage/);assert.match(shader.vertexShader,/vPathUv=uv/);assert.doesNotMatch(shader.fragmentShader,/screenNoise|courtyardNoise|if\(coverage/);assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);
 console.log(JSON.stringify({triangles,patches:added[0].userData.patchIds.length,minNormalY:minY,peakCoverage,guestFoot:layout.guestFoot,lodgeRear:layout.lodgeRear,sourceRouteLength:layout.sourceRouteLength}));base.dispose();candidate.dispose();
 }finally{globalThis.location=saved;}
});
