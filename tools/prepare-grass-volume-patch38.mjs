// Independent experiment fixture; never consumed by production ecology.
import {actualMeadowEcology} from './profile-meadow-v38.mjs';
import fs from 'node:fs';
const e=actualMeadowEcology(),cx=-3611.9813305250705,cz=4805.371282289286;let roots=[];
for(let z=Math.floor(cz/24)-1;z<=Math.floor(cz/24)+1;z++)for(let x=Math.floor(cx/24)-1;x<=Math.floor(cx/24)+1;x++)roots.push(...e.generateGrassTileRoots(x,z).filter(p=>!p.brookAsset));
roots.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));roots=roots.slice(0,49);
const cy=e.world.surface.heightAt(cx,cz),N=64,size=16,positions=[];
for(let z=0;z<=N;z++)for(let x=0;x<=N;x++){const dx=(x/N-.5)*size,dz=(z/N-.5)*size;positions.push(dx,e.world.surface.heightAt(cx+dx,cz+dz)-cy,dz);}
fs.writeFileSync('web/public/data/v2/grass-volume-patch38.json',JSON.stringify({scope:'actual default world surface and nearest 49 original regular grass roots; local experiment only',origin:[cx,cy,cz],N,size,positions,roots:roots.map(p=>({source:p,matrix:e.matrix(p).toArray()}))}));e.dispose();
