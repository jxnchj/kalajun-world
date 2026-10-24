import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {shoreEcotoneCover,shoreEcotoneBankCover,SHORE_MATERIAL_GLSL} from './shore-material.js';
import {createTerrainMaterial} from './terrain-material.js';
import {sampleMeadowField} from './meadow-surface.js';
import {surfaceTransitionStructure} from './surface-transition.js';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {WorldTerrain} from './terrain.js';
import {createWaterGeometry} from './water.js';
const smoothstep=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

test('bank root horizon preserves dry, deep bed, distant bed and steep cut endpoints',()=>{
 for(const wetness of [0,.3,.8,1])for(const slope of [0,.2,.4,.64,1])for(const structure of [-1,-.2,0,.2,1]){
  for(const clearance of [-.3,-.06,0,.02,.025,.15])for(const distance of [-1,-.12,-.03,0,.3]){
   const v=shoreEcotoneBankCover(wetness,clearance,slope,structure,distance);
   assert.ok(v>=0&&v<=1);
   if(wetness===0||clearance<=-.06||slope>=.64||structure<=-.32)assert.equal(v,0);
   if(distance<=-.12||clearance>=.025)assert.equal(v,shoreEcotoneCover(wetness,clearance,slope,structure));
  }
 }
 assert.equal(shoreEcotoneBankCover(1,-.01,.1,.2,.04),1,'outside low triangle has full root eligibility');
 assert.equal(shoreEcotoneCover(1,-.01,.1,.2),0,'v30 incorrectly excluded this exposed rooted surface');
 assert.equal(shoreEcotoneBankCover(1,-.01,.1,-.5,.04),0,'sparse community pockets still expose sediment');
});
test('shipped root horizon matches CPU and crosses physical edges continuously',()=>{
 const body=SHORE_MATERIAL_GLSL.match(/float shoreEcotoneBankCover\([^]*?\n}/)[0]
  .replace(/float shoreEcotoneBankCover\(([^)]*)\)/,(_,a)=>`function shoreEcotoneBankCover(${a.replace(/float /g,'')})`).replace(/\bfloat /g,'let ');
 const f=new Function('smoothstep','max',body+';return shoreEcotoneBankCover;')(smoothstep,Math.max);
 for(const wet of [0,.2,.6,1])for(const h of [-.1,-.04,-.01,0,.025,.3])for(const d of [-1,-.1,-.03,0,.1])for(const slope of [0,.4,.8])for(const structure of [-.5,0,.5])assert.equal(f(wet,h,slope,structure,d),shoreEcotoneBankCover(wet,h,slope,structure,d));
 for(const h of [-.05,-.03,-.01,0,.02]){let previous=shoreEcotoneBankCover(1,h,.1,.2,-.151);for(let i=-150;i<=100;i++){
  const v=shoreEcotoneBankCover(1,h,.1,.2,i*.001);assert.ok(v>=previous&&v-previous<.015);previous=v;
 }}
 for(const d of [-.1,-.03,0,.1]){let previous=0;for(let i=-100;i<=50;i++){
  const v=shoreEcotoneBankCover(1,i*.001,.1,.2,d);assert.ok(v>=previous&&v-previous<.063);previous=v;
 }}
 // A filtered-away tuft cannot resurrect fine spots at distance: the same
 // broad material mask is used on both sides of a terrain LOD boundary.
 for(const canopy of [.1,.5,.9])assert.equal(surfaceTransitionStructure(.47,canopy,1.3),surfaceTransitionStructure(.47,.5,1.3));
});
function actual(){
 const root=new URL('../../public/',import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,0,0,255])};
 // Frozen screenshot rays predate the curvature bank geometry; retain their original scene.
 return createWorldData({forestBankCurvature38:false,meta,objects:j('data/objects.json'),detailMeta:j('data/detail.json'),manifest:j('world-v2/manifest.json'),streamData:j('data/streams.json'),coreHeights:decodeHeightBytes(b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
}
test('real shoreline screenshot rays have rooted substrate despite a negative triangle clearance',t=>{
 const w=actual(),terrain=new WorldTerrain(w),node=terrain._node(-3620,4800,10,10,null),job=terrain._job(node);
 while(job.row<=32)terrain._buildRow(job);terrain._finish(job);node.mesh.updateMatrixWorld();
 const c=new THREE.PerspectiveCamera(52,1453/839,.25,150000);c.position.set(-3611.9813305250705,2329.161214161885,4805.371282289286);
 const yaw=-30.90412352938094*Math.PI/180,pitch=-10*Math.PI/180;
 c.lookAt(c.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));c.updateMatrixWorld();
 const water=new THREE.Mesh(createWaterGeometry(w.hydrology.nearSegments(c.position.x,c.position.z,80),{detail:true}),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));water.updateMatrixWorld();
 const ray=new THREE.Raycaster();let improved=0;
 try{for(const [px,py]of[[100,740],[200,700],[300,650],[500,550],[200,680]]){
  ray.setFromCamera(new THREE.Vector2(px/1453*2-1,1-py/839*2),c);const hit=ray.intersectObject(node.mesh)[0];assert.ok(hit);
  const ids=[hit.face.a,hit.face.b,hit.face.c],attr=(name,k)=>ids.reduce((sum,id,i)=>sum+node.mesh.geometry.attributes[name].getComponent(id,k)*hit.barycoord.getComponent(i),0);
  const clearance=attr('terrainHydrology',3),distance=attr('terrainShoreDistance',0),wetness=attr('terrainHydrology',0),normal=new THREE.Vector3(...[0,1,2].map(k=>attr('normal',k))).normalize(),slope=1-normal.y;
  // Material structural eligibility is tested with the retained raw field;
  // this is not an assertion of exact browser pixel colour or community tint.
  const field=sampleMeadowField(hit.point.x,hit.point.z),structure=surfaceTransitionStructure(field[0],field[1],.01),old=shoreEcotoneCover(wetness,clearance,slope,structure),next=shoreEcotoneBankCover(wetness,clearance,slope,structure,distance),waterHit=ray.intersectObject(water)[0],under=!!waterHit&&waterHit.distance<hit.distance;
  if(px===200&&py===680){assert.ok(under);assert.equal(next,0);}
  else{assert.ok(!under&&clearance<0);assert.equal(old,0);assert.ok(next>=old);if(next>old+.1)improved++;}
  t.diagnostic(JSON.stringify({pixel:[px,py],clearance,distance,slope,structure,old,next,under}));
 }assert.ok(improved>=2,'multiple real exposed shore locations regain rooted soil rather than mineral bed');
 }finally{terrain.dispose();water.geometry.dispose();water.material.dispose();}
});
test('live v30 comparison affects the full existing surface chain without new texture work',()=>{
 const r=createTerrainMaterial(),m=r.material,s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 try{m.onBeforeCompile(s);const v=m.version,key=m.customProgramCacheKey();
  assert.strictEqual(s.uniforms.terrainRootHorizon,m.userData.terrainRootHorizon);
  m.userData.terrainRootHorizon.value=0;assert.equal(s.uniforms.terrainRootHorizon.value,0);assert.equal(m.version,v);assert.equal(m.customProgramCacheKey(),key);
  assert.match(s.fragmentShader,/shoreEcotoneBankCover\(terrainWetness,vTerrainHydrology.w,terrainSlope,terrainSurfaceStructure,vTerrainShoreDistance\),terrainRootHorizon/);
  assert.match(s.fragmentShader,/terrainPhysicalBed\*=1\.-terrainLipRoots/);
  assert.match(s.fragmentShader,/terrainRootCover=max\(terrainLipRoots,/);
  assert.match(s.fragmentShader,/terrainLayeredColor=mix\(terrainLayeredColor,terrainShoreLiving,terrainRootCover\)/);
  assert.match(s.fragmentShader,/terrainGradient=mix\(terrainGradient,terrainGrassGradient,terrainRootCover\)/);
  assert.match(s.fragmentShader,/roughnessFactor=mix\(roughnessFactor,terrainCanopyRoughness,terrainRootCover\)/);
  assert.equal((s.fragmentShader.match(/textureGrad\(terrainScan/g)||[]).length,4);
 }finally{m.dispose();Object.values(r.textures).forEach(t=>t.dispose());}
});
