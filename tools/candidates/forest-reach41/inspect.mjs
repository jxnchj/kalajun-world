import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {actualForestWorld} from '../../benchmark_forest_exclusion_v38.mjs';
import {riverSectionAt,riverCrossPoint} from '../../../web/src/v2/river-section.js';
import {WorldEcology,MEADOW} from '../../../web/src/v2/ecology.js';
import {FOREST_REACH39_SOURCE} from '../../../web/src/v2/forest-reach39-source.js';
const original=actualForestWorld(undefined,'rgba',{forestReach39:false});
globalThis.location={search:'?forestReach39=1&forestReachForm41=1'};
const w=actualForestWorld(undefined,'rgba',{forestReach39:true}),h=w.hydrology,reach=h.forestReach39,segments=h.segments.filter(reach.activeSegment),ecology=new WorldEcology(w),before=new WorldEcology(original);
const section=s=>{const d=reach.origin+s,g=segments.find(g=>g.a.distance<=d&&g.b.distance>=d),t=(d-g.a.distance)/(g.b.distance-g.a.distance);return reach.waterSectionAt(g,t);};
const sections=Array.from({length:145},(_,i)=>({...section(-18+i*.25),offset:-18+i*.25}));
let rootHeightDelta=0,maxDelta=0,endpointDelta=0,wetViolation=0,minChannelWidth=Infinity,maxChannelWidth=0,maxAlongJump=0;
for(const r of FOREST_REACH39_SOURCE.trees)rootHeightDelta=Math.max(rootHeightDelta,Math.abs(h.bedHeightAt(r.x,r.z)-original.surface.heightAt(r.x,r.z)));
for(const q of sections){minChannelWidth=Math.min(minChannelWidth,q.width);maxChannelWidth=Math.max(maxChannelWidth,q.width);for(let a=-1;a<=1;a+=.04){const p=riverCrossPoint(q,a);if(h.bedHeightAt(p.x,p.z)>q.level+.001)wetViolation++;}}
const sourceSections=sections.map(q=>{const {segment,t}=reach.queryAt(q.x,q.z);return {...riverSectionAt(segment,t),offset:q.offset};});
const origin=[sections[72].x,sections[72].level,sections[72].z],minX=Math.floor(Math.min(...sections.map(q=>q.x-q.outer))-2),maxX=Math.ceil(Math.max(...sections.map(q=>q.x+q.outer))+2),minZ=Math.floor(Math.min(...sections.map(q=>q.z-q.outer))-2),maxZ=Math.ceil(Math.max(...sections.map(q=>q.z+q.outer))+2),step=.125,nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1,grid=[],faces=[];
for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=minX+i*step,z=minZ+j*step,a=original.surface.heightAt(x,z),b=w.surface.heightAt(x,z);maxDelta=Math.max(maxDelta,Math.abs(a-b));grid.push([x-origin[0],z-origin[2],a-origin[1],b-origin[1]]);if(i&&j){const k=j*nx+i;faces.push([k-nx-1,k-nx,k],[k-nx-1,k,k-1]);}}
for(const q of [sections[0],sections.at(-1)])for(let d=-q.outer;d<=q.outer;d+=.05){const p={x:q.x-q.fz*d,z:q.z+q.fx*d};endpointDelta=Math.max(endpointDelta,Math.abs(w.surface.heightAt(p.x,p.z)-original.surface.heightAt(p.x,p.z)));}
let roots=0,moved=0;const plants=[],meshes={source:{position:[],indices:[]},candidate:{position:[],indices:[]},cover:{position:[],indices:[]}};
function addMesh(out,g,r){const start=out.position.length/3,p=g.attributes.position,c=Math.cos(r.rot),s=Math.sin(r.rot);for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);out.position.push(r.x+(c*x+s*z)*r.s-origin[0],r.z+(-s*x+c*z)*r.s-origin[2],r.y+p.getY(i)*(r.sy??r.s)-origin[1]);}for(let i=0;i<(g.index?.count??p.count);i++)out.indices.push(start+(g.index?g.index.getX(i):i));}
for(let iz=Math.floor(minZ/MEADOW.cell);iz<=Math.ceil(maxZ/MEADOW.cell);iz++)for(let ix=Math.floor(minX/MEADOW.cell);ix<=Math.ceil(maxX/MEADOW.cell);ix++){const a=before._grassAt(ix,iz),b=ecology._grassAt(ix,iz);assert.equal(Boolean(a),Boolean(b));if(!a)continue;roots++;assert.equal(a.id,b.id);assert.equal(a.s,b.s);if(a.x!==b.x||a.z!==b.z)moved++;plants.push({id:b.id,x:b.x-origin[0],z:b.z-origin[2],y:b.y-origin[1],s:b.s});addMesh(meshes.source,a.brookAsset?.geometries[0]??before.grassGeometries[0],a);addMesh(meshes.candidate,b.brookAsset?.geometries[0]??ecology.grassGeometries[0],b);a.brookAsset?.dispose();b.brookAsset?.dispose();}
ecology.reachBankCover39.build();
const cover=ecology.reachBankCover39.pools.flatMap(p=>p.records.map(r=>({kind:r.kind,x:r.x-origin[0],z:r.z-origin[2],y:r.y-origin[1],s:r.s})));
for(const pool of ecology.reachBankCover39.pools)for(const r of pool.records)addMesh(meshes.cover,r.coverAsset.geometry,r);
const profiles=sections.filter((q,i)=>i%12===0).map(q=>({offset:q.offset,points:Array.from({length:129},(_,j)=>{const d=-q.outer+j*q.outer/64,x=q.x-q.fz*d,z=q.z+q.fx*d;return[d,original.surface.heightAt(x,z)-q.level,w.surface.heightAt(x,z)-q.level];})}));
const checks={rootHeightDelta,maxDelta,endpointDelta,wetViolation,minChannelWidth,maxChannelWidth,sourceRoots:roots,movedRoots:moved,community:ecology.forestReachCommunity39?.stats,cover:ecology.reachBankCover39.stats};
assert.ok(rootHeightDelta<1e-8);assert.ok(endpointDelta<1e-7);assert.equal(wetViolation,0);assert.ok(minChannelWidth>.35);assert.ok(maxDelta<.4);
writeFileSync('tools/candidates/forest-reach41/data.json',JSON.stringify({origin,grid,faces,nx,nz,sections,sourceSections,profiles,plants,cover,meshes,checks}));console.log(JSON.stringify(checks,null,2));ecology.dispose();before.dispose();
