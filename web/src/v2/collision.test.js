import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {WorldCollision,collisionTriangles,WALK_BODY} from './collision.js';
import {WorldDoors} from './doors.js';
import {WorldStructures} from './structures.js';
const pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}};
const box=(x,y,z,w,h,d)=>{const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);return{geometry:g};};
function fixture(parts,doors){const world={entities:[{id:'A',assetId:'house_a'}],surface:{heightAt:()=>0,buildingPose:()=>pose}},structures={_templates:new Map([['house_a:',parts]])};return new WorldCollision(world,{structures,doors});}
function walk(c,p,d,dt=.05){c.move(p,new T.Vector3(...d),dt);return p;}
test('continuous capsule cannot tunnel through a 2 cm wall with a 30 m requested move; diagonal motion slides',async()=>{
 const c=fixture([box(0,1.5,0,.02,3,20)]),p=new T.Vector3(-3,1.65,0);await c.enable(p);walk(c,p,[30,0,3]);assert.ok(p.x<-.22,JSON.stringify(p));assert.ok(p.z>2.8);assert.ok(c.stats.collisions>0);c.dispose();
});
test('autostep climbs a grounded 20 cm threshold, and tall obstacle blocks',async()=>{
 const c=fixture([box(0,.1,0,1,.2,2),box(2,1,0,.2,2,2)]),p=new T.Vector3(-1.5,1.57,0);await c.enable(p);let maxY=p.y;for(let i=0;i<80;i++){walk(c,p,[.06,0,0]);maxY=Math.max(maxY,p.y);}assert.ok(maxY>1.7);assert.ok(p.x<1.69);assert.ok(p.x>1);c.dispose();
});
test('crouch preserves feet and cannot stand through a low lintel',async()=>{
 const c=fixture([box(0,1.5,0,4,.15,4)]),p=new T.Vector3(4,1.6,0);await c.enable(p);assert.equal(c.setCrouching(true,p),true);const eye=p.y;c.move(p,new T.Vector3(-4,0,0),.05,{crouch:true});assert.ok(p.x<.01);assert.equal(c.setCrouching(false,p),false);assert.ok(Math.abs(p.y-eye)<.1);c.dispose();
});
test('explicit walk activation rejects starting inside a wall rather than ejecting camera',async()=>{
 const c=fixture([box(0,1,0,1,2,1)]),p=new T.Vector3(.4,1.6,0);await assert.rejects(()=>c.enable(p),/相交/);assert.deepEqual(p.toArray(),[.4,1.6,0]);assert.equal(c.enabled,false);c.dispose();
});
async function asset(id){const b=await readFile(new URL(`../../public/assets/v2/${id}_lived.glb`,import.meta.url)),l=new GLTFLoader();l.register(()=>({name:'node-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));return l.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
async function real(id){const world={entities:[{id:'A',assetId:id}],surface:{heightAt:()=>-.15,buildingPose:()=>pose}},doors=new WorldDoors(),structures=new WorldStructures(world,{doors,loadAsset:()=>asset(id)});await structures.load();const c=new WorldCollision(world,{doors,structures});doors.motionGuard=(l,a)=>c.allowDoorMotion(l,a);return{c,doors,structures};}
test('real woodhouse closed door blocks continuous entry; open door permits passage at full geometry',async()=>{
 const {c,doors,structures}=await real('house_a');doors.toggle('A');for(let i=0;i<20;i++)doors.update(null,.1);const p=new T.Vector3(1,1.62,4);await c.enable(p);for(let i=0;i<45;i++)walk(c,p,[0,0,-.06]);assert.ok(p.z>2.65,JSON.stringify(p));c.disable();doors.toggle('A');for(let i=0;i<20;i++)doors.update(null,.1);p.set(1,1.62,4);await c.enable(p);for(let i=0;i<55;i++)walk(c,p,[0,0,-.06]);assert.ok(p.z<1.5,JSON.stringify(p));assert.ok(c.stats.triangles>10000);c.dispose();doors.dispose();structures.dispose();
});
test('real yurt requires crouch to pass its authored low lintel, and closed paired leaves block',async()=>{
 const {c,doors,structures}=await real('yurt'),p=new T.Vector3(0,1.6,4.4);await c.enable(p);for(let i=0;i<36;i++)walk(c,p,[0,0,-.05]);assert.ok(p.z>3.3);for(let i=0;i<45;i++)c.move(p,new T.Vector3(0,0,-.05),.05,{crouch:true});assert.ok(p.z<2.4,JSON.stringify(p));c.disable();doors.toggle('A');for(let i=0;i<20;i++)doors.update(null,.1);p.set(0,1.6,4.4);await c.enable(p);for(let i=0;i<60;i++)c.move(p,new T.Vector3(0,0,-.05),.05,{crouch:true});assert.ok(p.z>3.3,JSON.stringify(p));c.dispose();doors.dispose();structures.dispose();
});
test('door rotational sweep stops before intersecting a stationary body and resumes when clear',async()=>{
 const {c,doors,structures}=await real('house_a'),p=new T.Vector3(1,1.74,2.5);await c.enable(p);doors.toggle('A');for(let i=0;i<30;i++)doors.update(null,.1);assert.ok(doors.openness('A')>0);assert.ok(c.stats.blockedDoors>0);assert.equal(c.overlaps(p),false);c.disable();for(let i=0;i<30;i++)doors.update(null,.1);assert.equal(doors.openness('A'),0);c.dispose();doors.dispose();structures.dispose();
});
test('pending physics activation can be cancelled before creating a world',async()=>{const c=fixture([]),pending=c.enable(new T.Vector3(0,1.6,0));c.disable();assert.equal(await pending,false);assert.equal(c.enabled,false);assert.equal(c.physics,undefined);c.dispose();});
test('walking rebases local physics without teleporting the world-space camera',async()=>{const c=fixture([]),p=new T.Vector3(0,1.6,0);await c.enable(p);p.x=600;walk(c,p,[0,0,0]);assert.equal(c.stats.rebases,1);assert.equal(p.x,600);assert.ok(Math.abs(c.body.translation().x)<128);assert.ok(Math.abs(p.y-1.6)<.1);c.dispose();});

test('actual DEM and representative placements permit open-door entry with full native geometry',async()=>{
 const {gunzipSync}=await import('node:zlib'),{createWorldData,decodeHeightBytes}=await import('./world-data.js'),root=new URL('../../public/',import.meta.url),j=async n=>JSON.parse(await readFile(new URL(n,root))),b=async n=>new Uint8Array(gunzipSync(await readFile(new URL(n,root))));
 const meta=await j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])},world=createWorldData({meta,objects:await j('data/objects.json'),detailMeta:await j('data/detail.json'),manifest:await j('world-v2/manifest.json'),streamData:await j('data/streams.json'),coreHeights:decodeHeightBytes(await b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(await b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:await b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
 const ids=['cabins:-1743,3612:30f9adc9fb584805','yurts:-1551,3489:3337d4a3e634caaf'],subset={...world,entities:world.entities.filter(e=>ids.includes(e.id))},doors=new WorldDoors(),structures=new WorldStructures(subset,{doors,loadAsset:url=>asset(url.includes('house_a')?'house_a':'yurt')});await structures.load();const c=new WorldCollision(subset,{doors,structures});
 for(const e of subset.entities){const q=world.surface.buildingPose(e),m=new T.Matrix4().compose(new T.Vector3(q.x,q.y,q.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),q.rot),new T.Vector3(q.scale.x,q.scale.y,q.scale.z)),p=new T.Vector3(e.assetId==='house_a'?1:0,1.65,e.assetId==='house_a'?4.15:4.6).applyMatrix4(m);p.y=Math.max(p.y,world.surface.heightAt(p.x,p.z)+1.65);await c.enable(p);const move=new T.Vector3(0,0,-.04).applyAxisAngle(new T.Vector3(0,1,0),q.rot);for(let i=0;i<90;i++)c.move(p,move,.05,{crouch:e.assetId==='yurt'});const local=p.clone().applyMatrix4(m.clone().invert());assert.ok(local.z<(e.assetId==='yurt'?2.8:2.2),JSON.stringify({id:e.id,local:local.toArray(),world:p.toArray()}));assert.ok(p.y>q.y);console.log('Actual collision traversal',e.id,local.toArray());c.disable();}
 c.dispose();doors.dispose();structures.dispose();
});

test('full porch permits central entry while real bench and front column stop the walking capsule',async()=>{
 const {c,doors,structures}=await real('house_a');
 for(const [x,stop] of [[-2,4.15],[-.2,4.55]]){
  const p=new T.Vector3(x,1.65,5.2);await c.enable(p);
  for(let i=0;i<55;i++)walk(c,p,[0,0,-.055]);
  assert.ok(p.z>stop,JSON.stringify({x,p:p.toArray()}));assert.ok(c.stats.collisions>0);assert.equal(c.overlaps(p),false);c.disable();
 }
 const p=new T.Vector3(1,1.65,5.2);await c.enable(p);
 for(let i=0;i<85;i++)walk(c,p,[0,0,-.055]);
 assert.ok(p.z<1.7,JSON.stringify(p));assert.equal(c.overlaps(p),false);
 c.dispose();doors.dispose();structures.dispose();
});
