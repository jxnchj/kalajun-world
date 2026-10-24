import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldEcology} from '../web/src/v2/ecology.js';
export function actualMeadowEcology(options={}){
 const world=actualForestWorld(undefined,'rgba',options),eco=new WorldEcology(world),base=new URL('../web/public/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('data/v2/habitat-transport-manifest.json',base)));
 for(const [key,name] of [['floraLocal','vegmap'],['floraCore','vegcore']]){const e=manifest.maps[name];eco[key]={meta:e.meta,n:e.n,data:new Uint8Array(gunzipSync(readFileSync(new URL(e.url,base))))};}
 return eco;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const eco=actualMeadowEcology(),camera={position:eco.uniforms.uWorldViewer.value};camera.position.set(-3611.9813305250705,0,4805.371282289286);camera.position.y=eco.world.surface.heightAt(camera.position.x,camera.position.z)+1.7;
 const timings={};for(const name of ['generateGrassTileRoots','addGrassMesh','addBrookWetMeshes','addFlowers','syncNearFlowers','syncBasalGrass','publishMeadowPools']){const fn=eco[name];eco[name]=function(...args){const at=performance.now();try{return fn.apply(this,args);}finally{const t=timings[name]??={calls:0,ms:0,maxMs:0};t.calls++;const ms=performance.now()-at;t.ms+=ms;t.maxMs=Math.max(t.maxMs,ms);}};}
 const start=performance.now();for(let i=0;i<90;i++)eco.updateMeadow(camera,{deferPools:true});eco.publishMeadowPools(camera);
 const out={scope:'actual source DEM/landcover/hydrology/habitat; 90 grass preparation iterations, no flower GLB assets loaded; not browser timing',ms:performance.now()-start,tiles:eco.grassTiles.size,roots:eco.stats.grassTufts,pending:eco.stats.grassPending,timings};writeFileSync('tools/reports/meadow-parts-v38.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));eco.dispose();
}
