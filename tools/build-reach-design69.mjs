import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import * as T from '../web/node_modules/three/build/three.module.js';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {createTerrainRowKernel} from '../web/src/v2/terrain-row-kernel.js';
import {createTerrainSurfaceContact} from '../web/src/v2/terrain-surface-contact.js';
import {createReachRootMat39,reachCoverPrototype39,ReachBankCover39} from '../web/src/v2/forest-reach-cover39.js';
import {restoreReachCover42,REACH_COVER_PREPARED42_VERSION} from '../web/src/v2/reach-cover-prepared42.js';
import {PRESERVED_REACH_COVER41} from '../web/src/v2/forest-reach-preserved-cover41.js';
import {contactFloatBits42} from '../web/src/v2/reach-contact-prepared42.js';
import {reachCoverPreparedCode42} from '../web/reach-cover-prepared-binding42.js';
import {createShoreStones,shoreStoneMatrix} from '../web/src/v2/shore-stones.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),dir='tools/candidates/reach-design69',out='web/public/data/v2/reach-design69';fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
const originalBytes=fs.readFileSync('web/public/data/v2/reach-cover-prepared42.json.gz'),base=JSON.parse(gunzipSync(originalBytes));
const saved='backups/route-continuity-v69/reach-cover-prepared42.json.gz';if(!fs.existsSync(saved))fs.writeFileSync(saved,originalBytes);
const world=actualForestWorld(undefined,'rgba',{reachDesign69:'bend'}),baseline=actualForestWorld(undefined,'rgba'),data=structuredClone(base),start=performance.now();delete data.contactSource42;
for(const record of data.records){record.root.y=world.surface.heightAt(record.root.x,record.root.z);delete record.contact42;for(const seat of record.seats)seat.level=Math.min(...seat.points.map(p=>world.surface.heightAt(p.x,p.z)))-.002;}
const pools=['sedge','mat'].map(kind=>({kind,prototype:reachCoverPrototype39(kind),records:[]}));for(const _ of restoreReachCover42(data,pools,{make:createReachRootMat39,source:PRESERVED_REACH_COVER41,lazyEnvelope46:true})){}
const kernel=createTerrainRowKernel(world),tiles=new Map(),keys=new Set();
for(const rec of data.records)for(const seat of rec.seats)for(const p of seat.points)keys.add(Math.floor(p.x/5)*5+','+Math.floor(p.z/5)*5);
for(const key of keys){const[x,z]=key.split(',').map(Number),row=kernel.build({x,z,size:5,depth:10,parent:null}),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(row.positions,3));geometry.setIndex(new T.BufferAttribute(row.indices,1));const mesh=new T.Mesh(geometry);mesh.position.set(x,0,z);mesh.userData.terrainTile={spacing:.15625};tiles.set(key,{x,z,size:5,mesh,dead:false,split:false});}
const contact=createTerrainSurfaceContact({roots:[...tiles.values()]}),validator=Object.create(ReachBankCover39.prototype);validator.world=world;validator.stats={};
let roots=0,groups=0,triangles=0,maxAnalyticTriangleDelta=0,maxFootGap=0,changedRootY=0,changedGroups=0,maxY=0;const failures=[];
const records=new Map(data.records.map(r=>[r.root.id,r])),old=new Map(base.records.map(r=>[r.root.id,r]));
for(const pool of pools)for(const root of pool.records){const rec=records.get(root.id),before=old.get(root.id),asset=root.coverAsset,values=new Float32Array(asset.geometry.attributes.position.count);roots++;triangles+=asset.geometry.index.count/3;
 for(const k of ['id','kind','x','z','s','sy','rot','sourceMove41'])assert.equal(root[k],before.root[k],root.id+'/'+k);if(root.y!==before.root.y)changedRootY++;maxY=Math.max(maxY,Math.abs(root.y-before.root.y));
 for(const seat of asset.seats){const samples=seat.points.map(p=>contact.sample(p.x,p.z));assert.ok(samples.every(p=>p&&!p.morphing&&p.spacing===.15625));const level=Math.min(...samples.map(p=>p.height))-.002,delta=Math.fround(level-seat.level);values.fill(delta,seat.start,seat.start+seat.count);groups++;for(let i=0;i<samples.length;i++){maxAnalyticTriangleDelta=Math.max(maxAnalyticTriangleDelta,Math.abs(samples[i].height-world.surface.heightAt(seat.points[i].x,seat.points[i].z)));maxFootGap=Math.max(maxFootGap,Math.abs(samples[i].height-level));}if(delta!==0)changedGroups++;}
 const input=values.slice(),ready=validator.validateContact42(root,values);if(!ready)failures.push({id:root.id,failure:root.contactFailure});
 rec.contact42={version:1,rootId:root.id,ready,failure:root.contactFailure,recovery:root.contactBurialRecovery41??0,groups:asset.seats.map(g=>({start:g.start,count:g.count,input:contactFloatBits42(input[g.start]),output:contactFloatBits42(values[g.start])}))};
}
const segments=world.hydrology.segments.filter(world.hydrology.forestReach39.activeSegment),stones=createShoreStones(world,segments),oldStones=createShoreStones(baseline,segments);assert.equal(stones.length,oldStones.length);for(let i=0;i<stones.length;i++){assert.equal(stones[i].id,oldStones[i].id);assert.deepEqual(shoreStoneMatrix(stones[i]).elements,shoreStoneMatrix(oldStones[i]).elements);}
const report={version:'reach-design69-validation-1',candidate:'connected-pointbars69-1',scope:'actual terrain-row-kernel Float32 positions/index, settled 0.15625m tiles; browser still required',sourcePreparedSHA256:sha(originalBytes),roots,groups,triangles,actualTiles:tiles.size,changedRootY,changedGroups,maxY,maxFootGap,maxAnalyticTriangleDelta,stoneTransformsExactlyEqual:stones.length,fixedIDsAndXZ:true,failures,elapsedMs:performance.now()-start};
fs.writeFileSync(dir+'/contact-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(roots,521);assert.equal(triangles,240232);assert.equal(failures.length,0,'candidate actual-triangle contact failures');
const raw=Buffer.from(JSON.stringify(data)),packed=gzipSync(raw,{level:9}),manifest={version:REACH_COVER_PREPARED42_VERSION,code:reachCoverPreparedCode42(),inputs:await world.getForestRootInputHashes(),url:'data/v2/reach-design69/reach-cover.json.gz',roots,sedges:205,mats:316,moved:7,triangles,rawBytes:raw.length,gzipBytes:packed.length,rawSHA256:sha(raw),sha256:sha(packed),candidate69:'connected-pointbars69-1'};
fs.writeFileSync(out+'/reach-cover.json',JSON.stringify(manifest));fs.writeFileSync(out+'/reach-cover.json.gz',packed);
for(const tile of tiles.values()){tile.mesh.geometry.dispose();tile.mesh.material.dispose();}kernel.dispose();for(const pool of pools){pool.prototype.geometry.dispose();for(const root of pool.records)root.coverAsset.geometry.dispose();}
console.log('69 prepared pack ready',packed.length);
