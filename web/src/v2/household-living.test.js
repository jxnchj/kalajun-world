import {houseTimberNodeOptions48,houseFurnitureNodeOptions58,installHouseTimberNodeCanvas48,assertDefaultHouseTimber48,assertDefaultHouseFurniture58} from './test-support/house-timber48-node.js';
installHouseTimberNodeCanvas48();
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HouseholdLiving,householdStyle,householdViewpoints} from './household-living.js';
import {WorldStructures} from './structures.js';
import {WorldDoors} from './doors.js';
import {WorldCollision,collisionTriangles} from './collision.js';
import {createEntities} from './world-data.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
const root=new URL('../../public/',import.meta.url);
async function parse(url){const raw=await readFile(new URL(url.replace(/^\.\//,''),root));return new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');}
const data=await readFile(new URL('assets/v2/household_living.glb',root));const doc=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
const objects=JSON.parse(await readFile(new URL('data/objects.json',root))),manifest=JSON.parse(await readFile(new URL('world-v2/manifest.json',root)));
const entities=createEntities(objects,manifest.assetMetadata).filter(e=>e.assetId==='house_a');
const world={entities,surface:{buildingPose:e=>({x:e.x,y:2100,z:e.z,rot:e.rot,scale:e.scale}),heightAt:()=>2099.65}};
const structures=new WorldStructures(world,{houseTimber48Options:houseTimberNodeOptions48,houseFurniture58Options:houseFurnitureNodeOptions58,loadAsset:parse});await structures.load();assertDefaultHouseTimber48(structures);assertDefaultHouseFurniture58(structures);const originalTriangles=structures.stats.triangles,originalMaterials=[...structures.materials];await structures.loadHouseholdLiving({loadAsset:parse});const living=structures.householdLiving;

test('three Blender usage sets contain full geometry, AO and no duplicated images',()=>{
 assert.equal(doc.images?.length??0,0);assert.equal(doc.textures?.length??0,0);assert.equal(living.templates.size,3);assert.equal(doc.meshes.length,15);assert.equal(doc.buffers[0].byteLength+20+data.readUInt32LE(12)+8,data.length);
 for(const parts of living.templates.values())for(const p of parts){assert.ok(p.geometry.index.count>0);for(const v of p.geometry.attributes.position.array)assert.ok(Number.isFinite(v));const ao=p.geometry.attributes.assetOcclusion;assert.equal(ao.count,p.geometry.attributes.position.count);for(const v of ao.array)assert.ok(v>=0&&v<=1);assert.ok(originalMaterials.includes(p.material));}
 assert.equal(structures.materials.length,originalMaterials.length);assert.equal(structures.stats.triangles,originalTriangles);assert.equal(living.stats.newTextures,0);
});
test('all 113 houses keep original identity and get stable structural usage differences',()=>{
 assert.equal(living.stats.households,113);assert.equal(living.stats.styleCounts.reduce((a,b)=>a+b),113);assert.ok(living.stats.styleCounts.every(n=>n>20));assert.deepEqual(entities.map(e=>householdStyle(e.id)),[...entities].reverse().map(e=>[e.id,householdStyle(e.id)]).reverse().map(v=>v[1]));
 const expected=entities.reduce((sum,e)=>sum+living.partsFor(e).reduce((s,p)=>s+p.triangles,0),0);assert.equal(living.stats.instanceTriangles,expected);assert.ok(expected>1000000);assert.notEqual(living.templates.get(0).reduce((n,p)=>n+p.triangles,0),living.templates.get(2).reduce((n,p)=>n+p.triangles,0));
 assert.deepEqual(entities.map(e=>structures.entityPoses.get(e.id)),entities.map(e=>world.surface.buildingPose(e)));
});
test('all additions retain deck footprint and central 1.1m door path',()=>{
 for(const [style,parts]of living.templates)for(const p of parts){const b=p.geometry.boundingBox;assert.ok(b.min.x>=-3.45&&b.max.x<.2,style+' x '+JSON.stringify(b));assert.ok(b.min.z>=2.78&&b.max.z<=4.76,style+' z '+JSON.stringify(b));assert.ok(b.min.y>=-.15&&b.max.y<1.1,style+' y '+JSON.stringify(b));}
});
test('rendered instances and collision use the same complete local geometry and transforms',()=>{
 for(const batch of living.batches){const mesh=batch.mesh;assert.ok(mesh.customDepthMaterial);assert.strictEqual(mesh.geometry,[...living.templates.values()].flat().find(p=>p.geometry===mesh.geometry).geometry);for(let i=0;i<mesh.count;i++){const id=mesh.userData.entityIds[i],entity=entities.find(e=>e.id===id);assert.equal(mesh.userData.householdStyle,householdStyle(id));const actual=new T.Matrix4();mesh.getMatrixAt(i,actual);actual.premultiply(new T.Matrix4().makeTranslation(...mesh.position.toArray()));const q=world.surface.buildingPose(entity),expected=new T.Matrix4().compose(new T.Vector3(q.x,q.y,q.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),q.rot),new T.Vector3(q.scale.x,q.scale.y,q.scale.z));for(let k=0;k<16;k++)assert.ok(Math.abs(actual.elements[k]-expected.elements[k])<.0002);assert.ok(structures.collisionPartsFor(entity).some(p=>p.geometry===mesh.geometry));}}
});
test('menu visits real households of all three usage types with valid camera poses',()=>{
 const views=householdViewpoints(world);assert.equal(views.length,3);for(const [i,v]of views.entries()){assert.equal(v.id,'household-'+i);assert.equal(householdStyle(v.entityId),i);for(const k of ['x','y','z','yaw','pitch'])assert.ok(Number.isFinite(v[k]));assert.ok(v.y>=world.surface.heightAt(v.x,v.z)+1.65);}
 console.log(JSON.stringify({views,stats:living.stats,rawBytes:data.length}));
});
test('all three complete usage sets preserve entry access and block their added furniture',async()=>{
 for(const style of [0,1,2]){
  const entity=entities.find(e=>householdStyle(e.id)===style),pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}},w={entities:[entity],surface:{buildingPose:()=>pose,heightAt:()=>-.35}};
  const doors=new WorldDoors(),s=new WorldStructures(w,{houseTimber48Options:houseTimberNodeOptions48,houseFurniture58Options:houseFurnitureNodeOptions58,doors,loadAsset:parse});await s.load();assertDefaultHouseTimber48(s);assertDefaultHouseFurniture58(s);await s.loadHouseholdLiving({loadAsset:parse});const c=new WorldCollision(w,{structures:s,doors});const p=new T.Vector3([-2.2,-1.75,-2.82][style],1.55,5.4);await c.enable(p);
  for(let i=0;i<90;i++)c.move(p,new T.Vector3(0,0,-.025),1/30);
  assert.ok(p.z>4.50&&p.z<4.8,'added furniture blocks forward walking '+style+' '+p.toArray());assert.ok(c.stats.collisions>0);c.disable();
  p.set(1,1.55,5.4);await c.enable(p);for(let i=0;i<150;i++)c.move(p,new T.Vector3(0,0,-.025),1/30);assert.ok(p.z<2.8,'central path must remain passable '+style+' '+p.toArray());c.dispose();s.dispose();doors.dispose();
 }
});
test('reuse has one owned geometry/depth lifecycle without disposing canonical materials',()=>{
 const sourceStats=living.stats;let materialDisposes=0;for(const m of originalMaterials)m.addEventListener('dispose',()=>materialDisposes++);let geometryDisposes=0;for(const g of living.geometries)g.addEventListener('dispose',()=>geometryDisposes++);const count=living.geometries.size;living.dispose();assert.equal(materialDisposes,0);assert.equal(geometryDisposes,count);living.dispose();assert.equal(geometryDisposes,count);assert.equal(sourceStats.status,'disposed');
});
