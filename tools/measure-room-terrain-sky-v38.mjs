import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Vector3} from '../web/node_modules/three/build/three.module.js';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {SettlementRuntime} from '../web/src/v2/settlements.js';
import {sunPosition,sunDirection,beijingTime} from '../web/src/sun.js';
const publicRoot=new URL('../web/public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,publicRoot))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,publicRoot)))),meta=json('data/scene.json');
const lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
const world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
const runtime=new SettlementRuntime(world),results=[],start=performance.now(),N=128;
for(const room of [...runtime.guestRooms.slice(0,3),...runtime.pastoralPoses]){
 const p=room.pose,center=(v)=>new Vector3(v[0]*p.scale.x,v[1]*p.scale.y,v[2]*p.scale.z).applyAxisAngle(new Vector3(0,1,0),p.rot).add(new Vector3(p.x,p.y,p.z));
 const floor=room.asset.floor,radius=floor.shape==='circle'?floor.radius*Math.max(p.scale.x,p.scale.z):Math.hypot(Math.max(Math.abs(floor.x0),Math.abs(floor.x1))*p.scale.x,Math.max(Math.abs(floor.z0),Math.abs(floor.z1))*p.scale.z),minimum=Math.max(2,2*radius+8);
 const apertures=room.asset.openings.map((o,index)=>{
  const origin=center(o.center),normal=new Vector3(...o.normal).applyAxisAngle(new Vector3(0,1,0),p.rot);let all=0,visible=0,blockedRays=0,samples=0;
  for(let i=0;i<N;i++){
   const y=(i+.5)/N,r=Math.sqrt(1-y*y),az=i*Math.PI*(3-Math.sqrt(5)),direction=new Vector3(r*Math.cos(az),y,r*Math.sin(az)),weight=Math.max(0,normal.dot(direction));if(weight<=0)continue;all+=weight;
   let blocked=false;
   for(let distance=minimum;distance<=16000;distance*=1.15){const t=distance/r,h=world.surface.heightAt(origin.x+direction.x*t,origin.z+direction.z*t);samples++;if(h>origin.y+direction.y*t+.25){blocked=true;break;}}
   if(blocked)blockedRays++;else visible+=weight;
  }
  return {index,kind:o.kind,skyVisibleFraction:all?visible/all:1,blockedRays,heightSamples:samples};
 });results.push({id:room.id,field:room.asset.bounceField??room.asset.sourceAsset,pose:room.pose,excludedNearMeters:minimum,apertures});
}
console.log(JSON.stringify({model:'measured terrain occlusion of uniform upper sky at aperture center, cosine-weighted; no own frame, trees or neighbouring building geometry; diagnostic, not GI coefficients',samples:N,seconds:(performance.now()-start)/1000,results},null,2));runtime.dispose();
