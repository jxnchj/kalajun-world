import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import * as T from '../web/node_modules/three/build/three.module.js';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {createTerrainRowKernel} from '../web/src/v2/terrain-row-kernel.js';
import {createTerrainSurfaceContact} from '../web/src/v2/terrain-surface-contact.js';
import {createReachRootMat39,reachCoverPrototype39,ReachBankCover39,seatReachCover39} from '../web/src/v2/forest-reach-cover39.js';
import {restoreReachCover42,REACH_COVER_PREPARED42_VERSION} from '../web/src/v2/reach-cover-prepared42.js';
import {PRESERVED_REACH_COVER41} from '../web/src/v2/forest-reach-preserved-cover41.js';
import {FOREST_REACH39_SOURCE} from '../web/src/v2/forest-reach39-source.js';
import {contactFloatBits42} from '../web/src/v2/reach-contact-prepared42.js';
import {reachCoverPreparedCode42} from '../web/reach-cover-prepared-binding42.js';
import {createShoreStones,shoreStoneMatrix} from '../web/src/v2/shore-stones.js';
import {reachDesign73Roles,REACH_DESIGN73_REVISION} from '../web/src/v2/reach-design73.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),dir='tools/candidates/reach-design73',out='web/public/data/v2/reach-design73';fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
const originalBytes=fs.readFileSync('web/public/data/v2/reach-cover-prepared42.json.gz'),base=JSON.parse(gunzipSync(originalBytes)),sources=new Map(PRESERVED_REACH_COVER41.records.map(r=>[r.id,r]));
const world=actualForestWorld(undefined,'rgba',{reachDesign73:'bend'}),baseline=actualForestWorld(undefined,'rgba'),reach=world.hydrology.forestReach39,start=performance.now();
const data={version:base.version,candidate73:REACH_DESIGN73_REVISION,records:[]};
const kernel=createTerrainRowKernel(world),tiles=new Map(),terrain={roots:[]},contact=createTerrainSurfaceContact(terrain),material=new T.MeshBasicMaterial();
function sample(x,z){const ix=Math.floor(x/5)*5,iz=Math.floor(z/5)*5,key=ix+','+iz;if(!tiles.has(key)){const row=kernel.build({x:ix,z:iz,size:5,depth:10,parent:null}),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(row.positions,3));g.setIndex(new T.BufferAttribute(row.indices,1));const mesh=new T.Mesh(g,material);mesh.position.set(ix,0,iz);mesh.userData.terrainTile={spacing:.15625};const tile={x:ix,z:iz,size:5,mesh,dead:false,split:false};tiles.set(key,tile);terrain.roots.push(tile);}return contact.sample(x,z);}
const validator=Object.create(ReachBankCover39.prototype);validator.world=world;validator.stats={};
const prototypeSedge=reachCoverPrototype39('sedge'),accepted=[],tries={count:0,analyticRejected:0,renderedRejected:0},metrics={moved:0,maxMove:0,maxY:0,maxAnalyticTriangleDelta:0,maxFootGap:0,groups:0,triangles:0};
const excluded=(x,z,pad)=>FOREST_REACH39_SOURCE.trees.some(t=>Math.hypot(t.x-x,t.z-z)<.4+pad);
function tryAt(before,source,prototype,x,z){tries.count++;const root={...before.root,x,z},d=Math.hypot(x-source.x,z-source.z);if(d>1.6||excluded(x,z,.05))return null;
 const p=reach.queryAt(x,z);if(!p||p.segment.lineId!==reach.lineId||Math.abs(p.section.distance-reach.origin)>=17.7||p.distance>=p.section.outer-.02)return null;
 root.offset=p.section.distance-reach.origin;root.y=world.surface.heightAt(x,z);const q=world.hydrology.sampleAt(x,z,{includeDepth:false}),roles=reachDesign73Roles(root.offset,p.signed,root.y-q.surfaceLevel);
 if(q.insideWater||q.shoreDistance<.035||q.shoreDistance>1.8||roles.cut>.4&&q.shoreDistance<.6)return null;
 // Retain the source clumps while avoiding newly coincident tufts. This is a
 // placement admission only; an unsuccessful candidate never deletes a root.
 if(accepted.some(r=>Math.hypot(r.x-x,r.z-z)<(r.kind==='sedge'&&root.kind==='sedge'?.10:.035)))return null;
 const asset=seatReachCover39(world,root,prototype,excluded);if(!asset){tries.analyticRejected++;return null;}root.coverAsset=asset;
 const values=new Float32Array(asset.geometry.attributes.position.count),samples=[];
 for(const seat of asset.seats){const ss=seat.points.map(p=>sample(p.x,p.z));assert.ok(ss.every(Boolean));samples.push(ss);const delta=Math.fround(Math.min(...ss.map(s=>s.height))-.002-seat.level);values.fill(delta,seat.start,seat.start+seat.count);}
 const input=values.slice(),ready=validator.validateContact42(root,values);if(!ready){tries.renderedRejected++;asset.geometry.dispose();return null;}
 for(let j=0;j<asset.seats.length;j++){const seat=asset.seats[j],ss=samples[j],level=Math.min(...ss.map(s=>s.height))-.002;for(let i=0;i<ss.length;i++){metrics.maxAnalyticTriangleDelta=Math.max(metrics.maxAnalyticTriangleDelta,Math.abs(ss[i].height-world.surface.heightAt(seat.points[i].x,seat.points[i].z)));metrics.maxFootGap=Math.max(metrics.maxFootGap,ss[i].height-level);}}
 const contact42={version:1,rootId:root.id,ready,failure:root.contactFailure,recovery:root.contactBurialRecovery41??0,groups:asset.seats.map(g=>({start:g.start,count:g.count,input:contactFloatBits42(input[g.start]),output:contactFloatBits42(values[g.start])}))};
 const {coverAsset,contactFailure,contactBurialRecovery41,...recordRoot}=root;recordRoot.design73Move=Math.hypot(x-before.root.x,z-before.root.z);
 const record={root:recordRoot,seats:asset.seats,waterBroadPhaseFalsePositive:asset.waterBroadPhaseFalsePositive,contact42};
 metrics.groups+=asset.seats.length;metrics.triangles+=asset.geometry.index.count/3;metrics.moved+=+(recordRoot.design73Move>1e-8);metrics.maxMove=Math.max(metrics.maxMove,recordRoot.design73Move);metrics.maxY=Math.max(metrics.maxY,Math.abs(root.y-before.root.y));asset.geometry.dispose();return record;
}
for(let ordinal=0;ordinal<base.records.length;ordinal++){
 const before=base.records[ordinal],source=sources.get(before.root.id),prototype=source.kind==='mat'?createReachRootMat39(source.seed):prototypeSedge;if(source.edge)prototype.geometry.scale(1.3,1.8,1.3);
 const old=baseline.hydrology.forestReach39.queryAt(before.root.x,before.root.z),q=reach.waterSectionAt(old.segment,old.t),ow=baseline.hydrology.forestReach39.waterSectionAt(old.segment,old.t),side=old.signed<0?-1:1,oldHalf=side<0?ow.left:ow.right,half=side<0?q.left:q.right;
 const u=Math.max(0,Math.min(1,(Math.abs(old.signed)-oldHalf)/(q.outer-oldHalf))),gap=(source.kind==='mat'?.11:.17)+u*(source.kind==='mat'?.80:1.02),target=half+gap;
 const preferred={x:q.x-q.fz*side*target,z:q.z+q.fx*side*target};let record=null;
 // Cross-bank compression keeps the existing along-bank group ordering. Small
 // two-dimensional alternatives find actual safe leaf seats, never a new row.
 for(const [along,across]of [[0,0],[0,.10],[0,.23],[.16,.12],[-.16,.12],[.28,.26],[-.28,.26],[0,.42],[.45,.40],[-.45,.40]]){record=tryAt(before,source,prototype,preferred.x+q.fx*along-q.fz*side*across,preferred.z+q.fz*along+q.fx*side*across);if(record)break;}
 if(!record)record=tryAt(before,source,prototype,before.root.x,before.root.z);
 for(let ring=1;ring<=18&&!record;ring++){const radius=ring*.08,steps=Math.max(12,Math.ceil(radius*2*Math.PI/.12));for(let j=0;j<steps&&!record;j++){const angle=(j+.37)*Math.PI*2/steps;record=tryAt(before,source,prototype,source.x+Math.cos(angle)*radius,source.z+Math.sin(angle)*radius);}}
 if(source.kind==='mat')prototype.geometry.dispose();assert.ok(record,'Cannot safely place complete root '+source.id);data.records.push(record);accepted.push(record.root);
 if((ordinal+1)%100===0)console.log('73 rooted',ordinal+1,'tries',tries.count);
}
assert.equal(data.records.length,521);assert.equal(metrics.triangles,240232);assert.equal(metrics.groups,11069);
const segments=world.hydrology.segments.filter(reach.activeSegment),stones=createShoreStones(world,segments),oldStones=createShoreStones(baseline,segments);assert.equal(stones.length,5);for(let i=0;i<5;i++){assert.equal(stones[i].id,oldStones[i].id);assert.deepEqual(shoreStoneMatrix(stones[i]).elements,shoreStoneMatrix(oldStones[i]).elements);}
const pools=['sedge','mat'].map(kind=>({kind,prototype:reachCoverPrototype39(kind),records:[]}));for(const _ of restoreReachCover42(data,pools,{make:createReachRootMat39,source:PRESERVED_REACH_COVER41,lazyEnvelope46:true})){}
for(const pool of pools){for(const root of pool.records){const prev=base.records.find(r=>r.root.id===root.id);for(const k of ['id','kind','s','sy','rot','sourceMove41'])assert.equal(root[k],prev.root[k]);assert.equal(root.coverAsset.geometry.index.count/3,root.kind==='mat'?672:136);root.coverAsset.geometry.dispose();}pool.prototype.geometry.dispose();}
const report={version:'reach-design73-contact-1',candidate:REACH_DESIGN73_REVISION,scope:'actual terrain-row-kernel Float32 positions/index at .15625m; browser still required',sourcePreparedSHA256:sha(originalBytes),roots:521,...metrics,actualTiles:tiles.size,tries,stoneTransformsExactlyEqual:5,allOriginalIDsAndAppearance:true,failures:[],elapsedMs:performance.now()-start};
const raw=Buffer.from(JSON.stringify(data)),packed=gzipSync(raw,{level:9}),manifest={version:REACH_COVER_PREPARED42_VERSION,code:reachCoverPreparedCode42(),inputs:await world.getForestRootInputHashes(),url:'data/v2/reach-design73/reach-cover.json.gz',roots:521,sedges:205,mats:316,moved:7,relocated73:metrics.moved,triangles:metrics.triangles,rawBytes:raw.length,gzipBytes:packed.length,rawSHA256:sha(raw),sha256:sha(packed),candidate73:REACH_DESIGN73_REVISION};
fs.writeFileSync(dir+'/contact-report.json',JSON.stringify(report,null,2));fs.writeFileSync(out+'/reach-cover.json',JSON.stringify(manifest));fs.writeFileSync(out+'/reach-cover.json.gz',packed);
for(const tile of tiles.values())tile.mesh.geometry.dispose();material.dispose();kernel.dispose();prototypeSedge.geometry.dispose();console.log(JSON.stringify(report));console.log('73 ready',packed.length);
