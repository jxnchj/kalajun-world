// Retained original-source comparison fixture; new default source is covered by lodge-furniture-loader.test.js.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LODGE_DOOR,lodgeDoorEnabled} from './lodge-door.js';import {WorldDoors} from './doors.js';import {WorldStructures} from './structures.js';import {WorldCollision,WALK_BODY} from './collision.js';import {createWorldData,decodeHeightBytes} from './world-data.js';
const root=new URL('../../public/',import.meta.url),source=readFileSync(new URL('assets/gh_lanchuan_lodge.glb',root)),tri=g=>(g.index?.count??g.attributes.position.count)/3;
async function asset(){const l=new GLTFLoader();l.register(()=>({name:'node-texture',loadTexture:()=>Promise.resolve(new T.Texture())}));return l.parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');}
function actual(){const j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};return createWorldData({meta,objects:j('data/objects.json'),detailMeta:j('data/detail.json'),manifest:j('world-v2/manifest.json'),streamData:j('data/streams.json'),coreHeights:decodeHeightBytes(b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});}
const matrix=q=>new T.Matrix4().compose(new T.Vector3(q.x,q.y,q.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),q.rot),new T.Vector3(q.scale.x,q.scale.y,q.scale.z));
test('lodge entrance is enabled by default, retaining the original complete closed leaf and all authored vertices when off',async()=>{
 assert.equal(lodgeDoorEnabled(''),true);assert.equal(lodgeDoorEnabled('?lodgeDoor=0'),false);assert.equal(lodgeDoorEnabled('?lodgeDoor=1'),true);assert.equal(createHash('sha256').update(source).digest('hex'),LODGE_DOOR.sourceSHA256);
 const g=await asset(),d=new WorldDoors({lodgeDoor:false});assert.equal(d.captureAsset(LODGE_DOOR.assetId,g.scene,m=>m),0);assert.ok(g.scene.getObjectByName(LODGE_DOOR.name));d.dispose();
 const before=[];g.scene.updateMatrixWorld(true);g.scene.getObjectByName(LODGE_DOOR.name).traverse(n=>{if(n.isMesh)before.push({name:n.name,material:n.material,positions:Array.from({length:n.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(n.geometry.attributes.position,i).applyMatrix4(n.matrixWorld)),triangles:tri(n.geometry)});});
 const on=new WorldDoors();on.captureAsset(LODGE_DOOR.assetId,g.scene,m=>m);assert.equal(g.scene.getObjectByName(LODGE_DOOR.name),undefined);const pose={x:17,y:2030,z:55,rot:.7,scale:{x:1.2,y:.9,z:.8}},bm=matrix(pose);on.place({entities:[{id:LODGE_DOOR.entityId,assetId:LODGE_DOOR.assetId}],surface:{buildingPose:()=>pose}});
 const leaf=on.leaves[0];assert.equal(leaf.angle,0);assert.equal(leaf.template.open,1.75);assert.equal(on.stats.triangles,before.reduce((n,p)=>n+p.triangles,0));for(const part of before){const mesh=leaf.meshes.find(m=>m.geometry.attributes.position.count===part.positions.length&&m.material===part.material);assert.ok(mesh,part.name);const im=new T.Matrix4();mesh.getMatrixAt(0,im);for(let i=0;i<part.positions.length;i++)assert.ok(part.positions[i].clone().applyMatrix4(bm).distanceTo(new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(im))<.0002);}
 on.toggle(LODGE_DOOR.entityId);for(let i=0;i<100;i++)on.update(null,1/60);assert.equal(on.angles(LODGE_DOOR.entityId)[0].angle,1.75);on.dispose();
});
test('actual lodge original front twelve steps, closed/open leaf, hall and rear entrance form a reversible physical route',async t=>{
 const world=actual(),entity=world.entities.find(e=>e.id===LODGE_DOOR.entityId),q=world.surface.buildingPose(entity),bm=matrix(q),inverse=bm.clone().invert(),doors=new WorldDoors();
 const structures=new WorldStructures({...world,entities:[entity]},{lodgeFurniture:false,lodgeChairs:false,doors,loadAsset:()=>asset(),cooperativePreparation:false});await structures.load();const c=new WorldCollision(world,{structures,doors});doors.motionGuard=(leaf,next)=>c.allowDoorMotion(leaf,next);
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
 }finally{c.dispose();doors.dispose();structures.dispose();}
});

test('real moving thin-glass pane never casts opaque sunlight while frame and handles retain shadows through update',async()=>{
 const entity={id:LODGE_DOOR.entityId,assetId:LODGE_DOOR.assetId},q={x:0,y:2000,z:0,rot:0,scale:{x:1,y:1,z:1}},world={entities:[entity],surface:{buildingPose:()=>q,heightAt:()=>1998}},doors=new WorldDoors({lodgeDoor:true}),owner=new WorldStructures(world,{lodgeFurniture:false,lodgeChairs:false,doors,preparedAssets:false,cooperativePreparation:false,loadAsset:asset});
 try{await owner.load();const glass=doors.group.children.filter(m=>m.material.userData.lodgeThinGlass),solid=doors.group.children.filter(m=>!m.material.userData.lodgeThinGlass);assert.equal(glass.length,1);assert.equal(solid.length,2);assert.equal(glass[0].castShadow,false);assert.ok(solid.every(m=>m.castShadow));assert.equal(glass[0].material.transparent,true);
 const camera=new T.PerspectiveCamera();camera.position.set(-2.3,2001.6,5);camera.lookAt(-2.3,2001.6,3.5);camera.updateMatrixWorld();doors.toggle(entity.id);for(let i=0;i<120;i++){doors.update(camera,1/60);assert.equal(glass[0].castShadow,false);assert.ok(solid.every(m=>m.castShadow));}owner.update(camera,.016);assert.ok(owner.group.children.filter(m=>m.material.userData.lodgeThinGlass).every(m=>!m.castShadow));
 }finally{doors.dispose();owner.dispose();}
});
