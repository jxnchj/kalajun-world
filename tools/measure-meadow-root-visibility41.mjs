import fs from 'node:fs';import * as T from '../web/node_modules/three/build/three.module.js';
import {actualMeadowEcology} from './profile-meadow-v38.mjs';import {meadowGeometry} from '../web/src/v2/ecology.js';
import {meadowRootBoxes41,meadowTileVisibility41} from '../web/src/v2/meadow-root-visibility41.js';
const eco=actualMeadowEcology(),g=meadowGeometry(false),evidence=JSON.parse(fs.readFileSync('docs/previews/v2-route-craft-38/hdr-performance-off1.json')).snapshot,output=[];
for(const spec of [{id:'river-forest',position:evidence.position,yaw:evidence.yaw,pitch:evidence.pitch},{id:'meadow-baseline',position:JSON.parse(fs.readFileSync('docs/previews/v2-route-craft-38/meadow-distance-meadow-62-full.json')).camera,target:[-1972.53,2121.8634538710935,3395.88]}]){
 const c=new T.PerspectiveCamera(52,1.6,.25,150000);c.position.fromArray(spec.position);if(spec.target)c.lookAt(new T.Vector3(...spec.target));else c.rotation.set(spec.pitch*Math.PI/180,-spec.yaw*Math.PI/180,0,'YXZ');c.updateMatrixWorld();
 const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse));
 const rows=[78,140,200,320].map(range=>({range,residentRoots:0,tileDraws:0,tileSubmittedRoots:0,rootDraws:0,rootSubmittedRoots:0,boundaryTiles:0,boundaryRoots:0,visibilityMs:0}));
 const started=performance.now();let sourceMs=0,boundsMs=0;const index=[];
 for(let z=Math.floor((c.position.z-350)/24);z<=Math.ceil((c.position.z+350)/24);z++)for(let x=Math.floor((c.position.x-350)/24);x<=Math.ceil((c.position.x+350)/24);x++){
  const d=Math.hypot((x+.5)*24-c.position.x,(z+.5)*24-c.position.z);if(d>320+24*.72+4.8)continue;
  let t=performance.now();const roots=eco.generateGrassTileRoots(x,z),regular=roots.filter(p=>!p.brookAsset);sourceMs+=performance.now()-t;
  if(regular.length){t=performance.now();const boxes=meadowRootBoxes41(g,regular,p=>eco.matrix(p)),tileBox=new T.Box3();boxes.forEach(b=>tileBox.union(b));boundsMs+=performance.now()-t;
   t=performance.now();const selected=meadowTileVisibility41(tileBox,boxes,[frustum],index);const ms=performance.now()-t;
   for(const r of rows)if(d<=r.range+24*.72+4.8){r.residentRoots+=regular.length;r.visibilityMs+=ms;if(frustum.intersectsBox(tileBox)){r.tileDraws++;r.tileSubmittedRoots+=regular.length;}if(selected.count){r.rootDraws++;r.rootSubmittedRoots+=selected.count;}if(selected.mode==='boundary'){r.boundaryTiles++;r.boundaryRoots+=regular.length;}}
  }
  for(const root of roots)root.brookAsset?.dispose();
 }
 for(const row of rows){row.trianglesExact=row.rootSubmittedRoots*45;row.trianglesOriginal=row.tileSubmittedRoots*69;row.rootReduction=1-row.rootSubmittedRoots/row.tileSubmittedRoots;row.fieldUploadBytes=row.rootSubmittedRoots*112;}
 output.push({spec,rows,sourceMs,boundsMs,totalMs:performance.now()-started,scope:'Real source roots and camera; conservative whole-leaf wind AABBs; CPU proposal only. Main view only (reflection union increases submissions). No terrain occlusion, no density reduction, no GPU claim.'});console.log(JSON.stringify(output.at(-1)));
}
fs.writeFileSync('tools/reports/meadow-root-visibility41.json',JSON.stringify(output,null,2));g.dispose();eco.dispose();
