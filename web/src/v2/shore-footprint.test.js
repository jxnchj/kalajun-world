import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {WorldTerrain} from "./terrain.js";
import {createWaterGeometry} from "./water.js";
import {shoreOrganicEligibility,shoreOrganicBankCover,SHORE_MATERIAL_GLSL} from "./shore-material.js";
import {createTerrainMaterial} from "./terrain-material.js";
const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function actual(){
 const root=new URL("../../public/",import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({meta,objects:j("data/objects.json"),detailMeta:j("data/detail.json"),manifest:j("world-v2/manifest.json"),streamData:j("data/streams.json"),coreHeights:decodeHeightBytes(b("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:b("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc});
}

test("organic soil crosses the shallow waterline continuously but deep and distant bed stay exact",()=>{
 for(const depth of [.06,.1,.25,2])for(const distance of [-1,-.1,0,.1])assert.equal(shoreOrganicEligibility(-depth,distance),0);
 for(const distance of [-2,-.5,-.12])for(const depth of [0,.001,.02,.05])assert.equal(shoreOrganicEligibility(-depth,distance),0);
 for(const clearance of [-.019,-.01,0,.01,.035,.1])assert.equal(shoreOrganicEligibility(clearance,0),1,"no instant mineral seam at the waterline");
 let previous=0;for(let i=-200;i<=100;i++){const value=shoreOrganicEligibility(-.01,i*.001);assert.ok(value>=previous&&value-previous<.015);previous=value;}
 previous=0;for(let i=-100;i<=100;i++){const value=shoreOrganicEligibility(i*.001,-.01);assert.ok(value>=previous&&value-previous<.038);previous=value;}
 const body=SHORE_MATERIAL_GLSL.match(/float shoreOrganicEligibility\([^]*?\n}/)[0].replace(/float shoreOrganicEligibility\(([^)]*)\)/,(_,a)=>`function shoreOrganicEligibility(${a.replace(/float /g,"")})`);
 const fn=new Function("smoothstep","max",body+";return shoreOrganicEligibility;")(smoothstep,Math.max);
 for(const height of [-.3,-.05,-.01,0,.1])for(let i=-200;i<=150;i++)assert.equal(fn(height,i*.001),shoreOrganicEligibility(height,i*.001));
});
test("actual screenshot rays classify outside low lips independently of a triangle dipping below water level",t=>{
 const w=actual(),terrain=new WorldTerrain(w),node=terrain._node(-3620,4800,10,10,null),job=terrain._job(node);
 while(job.row<=32)terrain._buildRow(job);terrain._finish(job);node.mesh.updateMatrixWorld();
 const c=new THREE.PerspectiveCamera(52,1453/839,.25,150000);c.position.set(-3611.9813305250705,2329.161214161885,4805.371282289286);
 const yaw=-30.90412352938094*Math.PI/180,pitch=-10*Math.PI/180;
 c.lookAt(c.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));c.updateMatrixWorld();
 const water=new THREE.Mesh(createWaterGeometry(w.hydrology.nearSegments(c.position.x,c.position.z,80),{detail:true}),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));water.updateMatrixWorld();
 const ray=new THREE.Raycaster(),rows=[];
 try{for(const [px,py]of[[100,740],[200,700],[300,650],[500,550],[200,680]]){
  ray.setFromCamera(new THREE.Vector2(px/1453*2-1,1-py/839*2),c);const hit=ray.intersectObject(node.mesh)[0];assert.ok(hit);
  const b=hit.barycoord,ids=[hit.face.a,hit.face.b,hit.face.c],attr=(name,k)=>ids.reduce((sum,id,i)=>sum+node.mesh.geometry.attributes[name].getComponent(id,k)*b.getComponent(i),0);
  const clearance=attr("terrainHydrology",3),distance=attr("terrainShoreDistance",0),q=w.hydrology.sampleAt(hit.point.x,hit.point.z,{includeDepth:false}),eligibility=shoreOrganicEligibility(clearance,distance),waterHit=ray.intersectObject(water)[0];
  const under=!!waterHit&&waterHit.distance<hit.distance;
  t.diagnostic(JSON.stringify({pixel:[px,py],point:hit.point.toArray(),clearance,distance,exactDistance:q.shoreDistance,eligibility,under}));
  if(px===200&&py===680){assert.ok(under&&distance<0);assert.equal(eligibility,0);assert.equal(shoreOrganicBankCover(1,clearance,.1,1,.3,distance),0);}
  else{assert.ok(!under&&clearance<0,"browser repro: low exposed triangle was treated as immersed");
   assert.ok(Math.abs(distance-q.shoreDistance)<.002,"same shoreline within 2mm on the sampled existing triangle");
   assert.equal(eligibility,1,"all four near-waterline pixels have continuous organic eligibility, including the millimetre-deep inner lip");
   assert.ok(shoreOrganicBankCover(1,clearance,.1,1,.3,distance)>.9);

  }
  rows.push({pixel:[px,py],clearance,distance,exactDistance:q.shoreDistance,eligibility,under});
 }t.diagnostic(JSON.stringify(rows));
 // Parent/shared/cache paths must not replace missing distance with a zero.
 const child=terrain._node(-3620,4800,5,11,node),cj=terrain._job(child);while(cj.row<=32)terrain._buildRow(cj);terrain._finish(cj);
 for(let j=0;j<=32;j+=2)for(let i=0;i<=32;i+=2)assert.equal(child.mesh.geometry.attributes.terrainShoreDistance.getX(j*33+i),node.mesh.geometry.attributes.terrainShoreDistance.getX(j/2*33+i/2));
 for(const n of [node,child]){const a=n.mesh.geometry.attributes.terrainShoreDistance;for(let j=0;j<=32;j++)for(let i=0;i<=32;i++){const q=w.hydrology.sampleAt(n.x+i*n.size/32,n.z+j*n.size/32,{includeDepth:false});assert.equal(a.getX(j*33+i),Math.fround(Number.isFinite(q.shoreDistance)?q.shoreDistance:8));}}
 }finally{terrain.dispose();water.geometry.dispose();water.material.dispose();}
});
test("the additional surface field composes through explicit morph and a reversible uniform without depth changes",()=>{
 const t=createTerrainMaterial(),s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{t.material.onBeforeCompile(s);assert.strictEqual(s.uniforms.terrainShoreFootprint,t.material.userData.terrainShoreFootprint);
  assert.match(s.vertexShader,/vTerrainShoreDistance = terrainShoreDistance/);assert.match(s.vertexShader,/vTerrainShoreDistance \+= terrainShoreDistanceDelta \* morphTargetInfluences\[0\]/);
  assert.match(s.fragmentShader,/shoreOrganicBankCover\(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainForest,terrainSurfaceStructure,vTerrainShoreDistance\)/);
  t.material.userData.terrainShoreFootprint.value=0;assert.equal(s.uniforms.terrainShoreFootprint.value,0);
 }finally{t.material.dispose();Object.values(t.textures).forEach(x=>x.dispose());}
});

test("surface distance morph reproduces the parent scalar plane and cache keeps the field",()=>{
 const world={meta:{far:{size:2560}},surface:{pads:[],heightAt:()=>100,geographicHeightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})},landcoverAt:()=>({r:1,g:0,b:0,a:1}),hydrology:{intersectsBounds:()=>false,sampleAt:(x,z)=>({wetness:0,riverBed:0,bank:0,surfaceLevel:null,id:null,shoreDistance:4+Math.sin(x/20)*Math.cos(z/30)})}};
 const terrain=new WorldTerrain(world),parent=terrain.roots.find(n=>n.x===0&&n.z===0),child=terrain._node(0,0,160,1,parent),job=terrain._job(child);
 try{while(job.row<=32)terrain._buildRow(job);terrain._finish(job);
  const pg=parent.mesh.geometry,cg=child.mesh.geometry,ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));parent.mesh.updateMatrixWorld();
  for(let j=1;j<32;j+=3)for(let i=1;i<32;i+=3){const k=j*33+i,x=i*5,z=j*5;ray.ray.origin.set(x,200,z);const hit=ray.intersectObject(parent.mesh)[0],ids=[hit.face.a,hit.face.b,hit.face.c],b=hit.barycoord;
   const expected=ids.reduce((sum,id,k)=>sum+pg.attributes.terrainShoreDistance.getX(id)*b.getComponent(k),0),base=cg.attributes.terrainShoreDistance.getX(k),delta=cg.attributes.terrainShoreDistanceDelta.getX(k);
   assert.ok(Math.abs(base+delta-expected)<5e-7,"morph endpoint equals parent interpolation to Float32 error");
  }
  const payload={geometry:cg,heights:child.heights,centers:child.centers,minHeight:child.minHeight,maxHeight:child.maxHeight};terrain.tileCache.put("distance",payload);const restored=terrain.tileCache.take("distance");assert.strictEqual(restored.geometry.attributes.terrainShoreDistance,cg.attributes.terrainShoreDistance);assert.strictEqual(restored.geometry.attributes.terrainShoreDistanceDelta,cg.attributes.terrainShoreDistanceDelta);
 }finally{terrain.dispose();}
});
