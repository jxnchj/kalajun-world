// Synthetic isolation only, not a claim about real Chrome frame performance.
import * as T from '../web/node_modules/three/build/three.module.js';
import {SunShadowCasters} from './experiments/sun-shadow-shared-signatures-v38.mjs';
import {WorldShadowDepth} from '../web/src/v2/room-shadow.js';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const scene=new T.Scene(),camera=new T.PerspectiveCamera();
const lights=[1,2,3].map(()=>{const l=new T.DirectionalLight();l.position.y=20;l.shadow.camera.far=100;l.shadow.camera.updateProjectionMatrix();scene.add(l,l.target);return l;});
const materials=Array.from({length:84},()=>new T.MeshStandardMaterial());
for(let i=0;i<778;i++){
 const g=new T.BoxGeometry(),o=new T.Mesh(g,materials[i%84]);o.castShadow=true;o.frustumCulled=false;
 if(i<579){o.userData.terrainTile={};for(const name of ['terrainCover','terrainHydrology','terrainLandform','terrainCommunity','terrainLandformDelta','terrainCommunityDelta','terrainShoreDistance','terrainShoreDistanceDelta'])g.setAttribute(name,g.attributes.position.clone());}
 scene.add(o);
}
for(let i=778;i<7000;i++)scene.add(new T.Object3D());
const depths=new WorldShadowDepth(scene);depths.prepare();scene.updateMatrixWorld();
const trackers=[false,true].map(sharedSignatures38=>new SunShadowCasters(scene,lights,{sharedSignatures38}));
const samples=[[],[]],options={skipCascades:[true,true,false],updateWorldMatrices:false};
for(let f=0;f<180;f++){
 for(const i of (f%2?[1,0]:[0,1])){trackers[i].update(camera,options);if(f>=30)samples[i].push(trackers[i].stats.lastMs);}
 assert.deepEqual(trackers[0].result,trackers[1].result);
}
const summarize=a=>({meanMs:a.reduce((n,v)=>n+v,0)/a.length,medianMs:[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]});
const report={scope:'Synthetic 7007 nodes, 778 geometry, 579 terrain, 84 materials. Alternating 150 observations after 30 warm-ups; no matrix updates or frustum hooks. Not real Chrome net benefit.',baseline:summarize(samples[0]),candidate:summarize(samples[1]),baselineStats:trackers[0].stats,candidateStats:trackers[1].stats};
console.log(JSON.stringify(report,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
for(const t of trackers)t.dispose();depths.dispose();
