import {WorldShadowDepth} from '../../../web/src/v2/room-shadow.js';
import fs from 'node:fs/promises';import {actualForestWorld}from '../../benchmark_forest_exclusion_v38.mjs';import{WorldTerrain}from '../../../web/src/v2/terrain.js';import{TerrainSiblingBatches}from '../../../web/src/v2/terrain-sibling-batches.js';import * as T from '../../../web/node_modules/three/build/three.module.js';
const beforeSource=(await fs.readFile(new URL('./before.js',import.meta.url),'utf8')).replace("from 'three'",`from '${new URL('../../../web/node_modules/three/build/three.module.js',import.meta.url).href}'`),Before=(await import('data:text/javascript;base64,'+Buffer.from(beforeSource).toString('base64'))).TerrainSiblingBatches;
const snapshot=JSON.parse(await fs.readFile(new URL('../../../docs/previews/v2-route-craft-38/terrain-batch41-perf-b1.json',import.meta.url),'utf8')).state;
const world=actualForestWorld(),terrain=new WorldTerrain(world),camera=new T.PerspectiveCamera(52,1280/800,.25,150000);camera.position.fromArray(snapshot.position);camera.rotation.order='YXZ';camera.rotation.set(T.MathUtils.degToRad(snapshot.pitch),-T.MathUtils.degToRad(snapshot.yaw),0,'YXZ');camera.updateMatrixWorld();
let quiet=0;for(let i=0;i<4000;i++){terrain.update(camera,1/60);quiet=terrain.stats.queuedTiles===0&&terrain.morphs.size===0?quiet+1:0;if(i>120&&quiet>35)break;if(i===3999)throw Error('Terrain did not settle');}
const scene=new T.Scene();scene.add(terrain.group);const shadow=new WorldShadowDepth(scene);terrain.submissionBatches.enabled=true;
for(let i=0;i<130;i++){scene.updateMatrixWorld(true);terrain.update(camera,1/60);shadow.prepare();if(i%10===0)console.log(i,{...terrain.submissionBatches.stats});}
shadow.dispose();terrain.dispose();
