import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LODGE_DOOR,lodgeDoorEnabled} from './lodge-door.js';import {WorldDoors} from './doors.js';import {WorldStructures} from './structures.js';import {WorldCollision,WALK_BODY} from './collision.js';import {createWorldData,decodeHeightBytes} from './world-data.js';
const root=new URL('../../public/',import.meta.url),source=readFileSync(new URL('assets/gh_lanchuan_lodge.glb',root)),tri=g=>(g.index?.count??g.attributes.position.count)/3;
async function asset(){const l=new GLTFLoader();l.register(()=>({name:'node-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));return l.parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');}
function actual(){const j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};return createWorldData({meta,objects:j('data/objects.json'),detailMeta:j('data/detail.json'),manifest:j('world-v2/manifest.json'),streamData:j('data/streams.json'),coreHeights:decodeHeightBytes(b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});}
const matrix=q=>new T.Matrix4().compose(new T.Vector3(q.x,q.y,q.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),q.rot),new T.Vector3(q.scale.x,q.scale.y,q.scale.z));

import {lodgeChairsEnabled,LODGE_CHAIRS_SOURCE as SOURCE} from './lodge-chairs-definition.js';
import {loadLodgeChairs,lodgeChairsURL,originalLodgeChairsCollision} from './lodge-chairs-loader.js';
const candidate=readFileSync(new URL(SOURCE.sourceGLB,root));
const fetchCandidate=async url=>new Response(readFileSync(new URL(String(url).split('?')[0].replace(/^\.\//,''),root)));
test('new table candidate preserves original front steps, chair collision and furnished lodge front twelve steps, closed/open leaf, hall and rear entrance form a reversible physical route',async t=>{
 const world=actual(),entity=world.entities.find(e=>e.id===LODGE_DOOR.entityId),q=world.surface.buildingPose(entity),bm=matrix(q),inverse=bm.clone().invert(),doors=new WorldDoors();
 const structures=new WorldStructures({...world,entities:[entity]},{doors,lodgeTablesFetch:fetchCandidate,lodgeInteriorWood:false,lodgeChairsFetch:fetchCandidate,cooperativePreparation:false});structures.loader.register(()=>({name:'node-candidate-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));await structures.load();assert.equal(structures.stats.triangles,128232);assert.equal(doors.stats.triangles,96);assert.equal(structures._templates.get('gh_lanchuan_lodge:').filter(t=>t.names.some(n=>/^export_sofa_[12]_candidate_/.test(n))).reduce((v,t)=>{assert.equal(t.role,'interior');return v+t.triangles;},0),10488);const panes=doors.group.children.filter(m=>m.material.userData.lodgeThinGlass);assert.equal(panes.length,1);assert.equal(panes[0].castShadow,false);assert.equal(panes[0].material.transparent,true);const chairParts=structures._templates.get('gh_lanchuan_lodge:').filter(p=>p.chairsReplacement);assert.equal(chairParts.reduce((s,p)=>s+p.triangles,0),52128);assert.ok(chairParts.every(p=>p.role==='interior'));
 const collisionParts=structures.collisionPartsFor(entity);assert.equal(collisionParts.reduce((s,p)=>s+p.triangles,0),77832);assert.equal(collisionParts.filter(p=>p.names.includes('gh_lanchuan_lodge_rattan')).reduce((s,p)=>s+p.triangles,0),1728);assert.ok(collisionParts.every(p=>!p.chairsReplacement));
 const c=new WorldCollision(world,{structures,doors});doors.motionGuard=(leaf,next)=>c.allowDoorMotion(leaf,next);
 const worldPoint=([x,z])=>new T.Vector3(x,0,z).applyMatrix4(bm),p=worldPoint([-2.3,10.3]);p.y=world.surface.heightAt(p.x,p.z)+WALK_BODY.eye+.04;await c.enable(p);
 const local=()=>p.clone().applyMatrix4(inverse),walkTo=(point,max=1000)=>{const a=worldPoint(point);for(let i=0;i<max;i++){const dx=a.x-p.x,dz=a.z-p.z,d=Math.hypot(dx,dz);if(d<.05)return true;c.move(p,new T.Vector3(dx/d*Math.min(.045,d),0,dz/d*Math.min(.045,d)),1/60);}return false;};
 try{
 assert.ok(walkTo([-2.3,4.3]),JSON.stringify({phase:'front-steps',local:local().toArray(),q}));assert.ok(p.y-WALK_BODY.eye>q.y-.04,'original front landing supports feet');
 assert.equal(walkTo([-2.3,2.5],100),false);assert.ok(local().z>3.5,'closed full pane physically blocks passage');
 doors.toggle(entity.id);for(let i=0;i<120;i++)doors.update(null,1/60);assert.equal(doors.angles(entity.id)[0].angle,1.75);
 for(const point of [[-2.3,2.5],[-2.3,0],[-4.6,0],[-4.6,-2.6]])assert.ok(walkTo(point),JSON.stringify({phase:'front-to-rear',point,local:local().toArray()}));
 assert.ok(p.y-WALK_BODY.eye>=q.y-.04);assert.equal(c.overlaps(p),false);
 // Exit the occupied building's collision radius and return: logical door state persists.
 c.disable();const distant=p.clone().add(new T.Vector3(200,20,0));await c.enable(distant);assert.equal(c.dynamic.size,0);c.disable();await c.enable(p);assert.equal(doors.angles(entity.id)[0].angle,1.75);assert.equal(c.dynamic.size,1);
 for(const point of [[-4.6,0],[-2.3,0],[-2.3,2.5],[-2.3,3.5]])assert.ok(walkTo(point),JSON.stringify({phase:'return',point,local:local().toArray()}));
 doors.toggle(entity.id);for(let i=0;i<120;i++)doors.update(null,1/60);assert.ok(doors.leaves[0].blocked,'body holds original swinging leaf');assert.ok(doors.leaves[0].angle>0);
 assert.ok(walkTo([-2.3,4.6]));for(let i=0;i<120;i++)doors.update(null,1/60);assert.equal(doors.leaves[0].angle,0,'clear body allows pending close without another toggle');
 assert.ok(walkTo([-2.3,10.3]),JSON.stringify({phase:'front-step-descent',local:local().toArray()}));assert.equal(c.overlaps(p),false);
 t.diagnostic(JSON.stringify({entity:entity.id,frontEnd:p.toArray(),local:local().toArray(),ground:world.surface.heightAt(p.x,p.z),floor:q.y,doorTriangles:doors.stats.triangles,staticTriangles:structures.stats.triangles,activeDoors:c.dynamic.size}));
 for(const [label,start,target,limit]of [['chair',[-11,3.05],[-11,2.15],2.55],['sofa',[4.4,-.9],[4.4,-2.1],-1.61],['washer',[9.3,-1.9],[9.3,-3.0],-2.64]]){c.disable();p.copy(worldPoint(start));p.y=q.y+WALK_BODY.eye+.04;await c.enable(p);assert.equal(walkTo(target,140),false,label+' must physically block the walking body');assert.ok(local().z>limit,label+' collision should stay outside the original envelope');assert.equal(c.overlaps(p),false,label+' leaves a nonoverlapping body');}
 }finally{c.dispose();doors.dispose();structures.dispose();}
});

test('new table shell/interior retains identical body roles, complete wood and collision after guarded install',async()=>{
 globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
 const all=actual(),entity=all.entities.find(e=>e.id===LODGE_DOOR.entityId),world={...all,entities:[entity]},rough=async()=>new T.Texture();
 const make=stream=>{const doors=new WorldDoors();return new WorldStructures(world,{doors,lodgeTablesFetch:fetchCandidate,lodgeChairs:true,lodgeInteriorWood:true,lodgeInteriorWoodTextureLoader:rough,lodgeInteriorStream:stream,lodgeStreamOptions:{fetchImpl:fetchCandidate},cooperativePreparation:false});};
 const full=make(false),split=make(true);try{
 await full.load();await split.load();assert.throws(()=>split.collisionPartsFor(entity),/complete|ready|interior/i);
 const stage=await split._loadLodgeInterior();split.installLodgeInterior(stage);split.lodgeStream.ready=true;
 const sum=(s,collision=false)=> (collision?s.collisionPartsFor(entity):s._templates.get('gh_lanchuan_lodge:')).reduce((o,p)=>{o[p.role]=(o[p.role]||0)+p.triangles;return o;},{});
 assert.deepEqual(sum(split),sum(full));assert.deepEqual(sum(split,true),sum(full,true));assert.equal(Object.values(sum(split,true)).reduce((a,b)=>a+b),77832);
 assert.equal(full.stats.triangles,128232);assert.equal(split.stats.triangles,128232);assert.equal(full.doors.stats.triangles,96);assert.equal(split.doors.stats.triangles,96);
 assert.equal(full.stats.assetPreparation.assets.gh_lanchuan_lodge.lodgeWood.active,true);assert.equal(stage.stats.assetPreparation.assets.gh_lanchuan_lodge.lodgeWood.active,true);
 const tables=s=>s._templates.get('gh_lanchuan_lodge:').filter(p=>p.tablesReplacement).reduce((a,p)=>a+p.triangles,0);assert.equal(tables(full),14560);assert.equal(tables(split),14560);
 }finally{full.doors.dispose();split.doors.dispose();full.dispose();split.dispose();}
});
