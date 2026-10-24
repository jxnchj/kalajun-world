import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Vector3} from '../web/node_modules/three/build/three.module.js';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {SettlementRuntime} from '../web/src/v2/settlements.js';
import {sunPosition,sunDirection,beijingTime} from '../web/src/sun.js';
const publicRoot=new URL('../web/public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,publicRoot))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,publicRoot)))),meta=json('data/scene.json');
const lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
const world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
const runtime=new SettlementRuntime(world),rooms=[...runtime.guestRooms.slice(0,3),...runtime.pastoralPoses],results=[];
for(const room of rooms)for(const minute of [540,600,690,870,1170,1230,1260,1290,1305]){
 const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),position=sunPosition(meta.lat,meta.lon,beijingTime('2026-07-25 '+time+':00'));
 if(position.elevation<=0)continue;
 const sun=sunDirection(position.azimuth,position.elevation,new Vector3());runtime.terrainSun.apply(room,{sun,intensity:1,visibility:1});
 const localSun=sun.clone().applyAxisAngle(new Vector3(0,1,0),-room.pose.rot);
 results.push({room:room.id,bounceField:room.asset.bounceField??room.asset.sourceAsset,localSun:localSun.toArray(),openingFacing:room.asset.openings.map(o=>new Vector3(...o.normal).dot(localSun)),time,elevation:position.elevation,...runtime.terrainSun.stats});
}
console.log(JSON.stringify({source:'actual DEM/detail/building poses; landcover unused for height',results},null,2));runtime.dispose();
