import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {WorldDoors} from "./doors.js";
import {createEntities} from "./world-data.js";
import {WorldStructures} from "./structures.js";
const tri=geometry=>(geometry.index?.count??geometry.attributes.position.count)/3;
async function asset(id){const bytes=await readFile(new URL(`../../public/assets/v2/${id}_lived.glb`,import.meta.url)),loader=new GLTFLoader();loader.register(()=>({name:"node-texture-decode",loadTexture:()=>Promise.resolve(new THREE.Texture())}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");}
const pose={x:1200,y:2100,z:3400,rot:.7,scale:{x:1.3,y:.9,z:.8}};
const world={entities:[{id:"house-A",assetId:"house_a"},{id:"house-B",assetId:"house_a"},{id:"yurt-A",assetId:"yurt"}],surface:{buildingPose:e=>e.id==="house-B"?{...pose,x:1300}:pose}};
async function ready(options){const d=new WorldDoors(options),original=new Map(),retained=new Map();for(const id of ["house_a","yurt"]){const g=await asset(id);let count=0;g.scene.traverse(n=>{if(n.isMesh)count+=tri(n.geometry);});original.set(id,count);d.captureAsset(id,g.scene,m=>m);count=0;g.scene.traverse(n=>{if(n.isMesh)count+=tri(n.geometry);});retained.set(id,count);}d.place(world);return{d,original,retained};}

test("real authored doors retain every triangle and PBR map, without static duplicate leaves",async()=>{
 const {d,original,retained}=await ready();assert.equal(d.stats.entries,3);assert.equal(d.stats.leaves,4);assert.equal(d.stats.batches,6);
 assert.equal(d.stats.triangles,(original.get("house_a")-retained.get("house_a"))*2+original.get("yurt")-retained.get("yurt"));
 for(const template of d.templates.values())for(const leaf of template)for(const part of leaf.parts){assert.ok(part.geometry.attributes.assetOcclusion);assert.equal(part.geometry.attributes.color,undefined);assert.ok(part.material.isMeshStandardMaterial);assert.ok(part.geometry.attributes.normal);}
 assert.ok(d.group.children.every(m=>m.castShadow&&m.receiveShadow));const houses=d.leaves.filter(l=>l.entityId.startsWith("house"));assert.equal(houses[0].meshes[0],houses[1].meshes[0]);console.log("Door budget:",d.stats);d.dispose();
});
test("initial real GLB world vertices match source under rotated anisotropic building placement",async()=>{
 const g=await asset("house_a");g.scene.updateMatrixWorld(true);const door=g.scene.getObjectByName("house_a_door0"),source=door.children[0],first=new THREE.Vector3().fromBufferAttribute(source.geometry.attributes.position,0).applyMatrix4(source.matrixWorld);
 const building=new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));first.applyMatrix4(building);
 const {d}=await ready(),leaf=d.leaves.find(l=>l.entityId==="house-A"),mesh=leaf.meshes[0],matrix=new THREE.Matrix4();mesh.getMatrixAt(leaf.index,matrix);const rendered=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0).applyMatrix4(matrix);assert.ok(first.distanceTo(rendered)<.00025);d.dispose();
});
test("close, reverse midway and reopen all paired leaves while keeping other buildings independent",async()=>{
 const {d}=await ready(),a=d.entries.get("yurt-A"),other=d.entries.get("house-A"),old=other.leaves[0].angle;
 assert.equal(d.openness(a.id),1);assert.equal(d.toggle(a.id),true);for(let i=0;i<3;i++)d.update(null,.1);const halfway=a.leaves.map(l=>l.angle);assert.ok(halfway[0]<0&&halfway[1]>0);assert.equal(other.leaves[0].angle,old);d.toggle(a.id);for(let i=0;i<20;i++)d.update(null,.1);assert.equal(d.openness(a.id),1);for(const leaf of a.leaves)assert.equal(leaf.angle,leaf.template.open);
 d.toggle(a.id);for(let i=0;i<20;i++)d.update(null,.1);assert.equal(d.openness(a.id),0);assert.ok(a.leaves.every(l=>l.angle===0));assert.equal(d.toggle("missing"),false);d.dispose();
});
test("stationary doors do not upload instance matrices; zero dt never moves or invalidates shadow revision",async()=>{
 const {d}=await ready(),versions=d.group.children.map(m=>m.instanceMatrix.version),revision=d.stats.revision;for(let i=0;i<20;i++)d.update(null,.016);assert.deepEqual(d.group.children.map(m=>m.instanceMatrix.version),versions);assert.equal(d.stats.revision,revision);d.toggle("house-A");d.update(null,0);assert.deepEqual(d.group.children.map(m=>m.instanceMatrix.version),versions);d.update(null,.016);assert.ok(d.stats.revision>revision);d.dispose();
});
test("conservative bounds contain all animated door geometry at every swing angle",async()=>{
 const {d}=await ready(),point=new THREE.Vector3(),m=new THREE.Matrix4();d.toggle("house-A");d.toggle("yurt-A");
 for(let frame=0;frame<24;frame++){d.update(null,.05);for(const leaf of d.leaves)for(const mesh of leaf.meshes){mesh.getMatrixAt(leaf.index,m);const b=mesh.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){point.set(x,y,z).applyMatrix4(m);assert.ok(mesh.boundingBox.containsPoint(point));assert.ok(mesh.boundingSphere.containsPoint(point));}}}d.dispose();
});
test("interaction requires nearby doorway in view; F ignores focus, repeat and modifiers, and cleans up",async()=>{
 const handlers=new Map(),button={style:{},setAttribute(){},addEventListener(type,fn){handlers.set(type,fn);},remove(){this.removed=true;}},panel={insertBefore(){},querySelector(){return null;}},doc={querySelector(){return panel;},createElement(){return button;}},events={addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);}};
 const {d}=await ready({document:doc,eventTarget:events}),entry=d.entries.get("house-B"),camera=new THREE.PerspectiveCamera();camera.position.copy(entry.center).add(new THREE.Vector3(0,0,2));camera.lookAt(entry.center);camera.updateMatrixWorld();d.update(camera,0);assert.equal(d.active,entry);assert.equal(button.hidden,false);
 const e={code:"KeyF",target:{tagName:"BODY"},preventDefault(){}};for(const override of [{repeat:true},{ctrlKey:true},{target:{tagName:"INPUT"}},{target:{isContentEditable:true}}])handlers.get("keydown")({...e,...override});assert.equal(entry.target,true);handlers.get("keydown")(e);assert.equal(entry.target,false);handlers.get("click")();assert.equal(entry.target,true);
 camera.rotation.y+=Math.PI;camera.updateMatrixWorld();d.update(camera,0);assert.equal(d.active,null);assert.equal(button.hidden,true);camera.position.z+=10;camera.lookAt(entry.center);camera.updateMatrixWorld();d.update(camera,0);assert.equal(d.active,null);d.dispose();d.dispose();assert.equal(button.removed,true);assert.equal(handlers.has("keydown"),false);
});
test("door disposal never destroys source/shared material or texture ownership",async()=>{
 const {d}=await ready(),mesh=d.group.children[0],material=mesh.material;let materials=0,geometry=0;material.addEventListener("dispose",()=>materials++);mesh.geometry.addEventListener("dispose",()=>geometry++);d.dispose();assert.equal(materials,0);assert.equal(geometry,1);assert.throws(()=>d.place(world),/disposed/);assert.equal(d.group.children.length,0);
});

 test("full historical building inventory receives every original entrance without new loading or reduced geometry",async()=>{
 const objects=JSON.parse(await readFile(new URL("../../public/data/objects.json",import.meta.url))),manifest=JSON.parse(await readFile(new URL("../../public/world-v2/manifest.json",import.meta.url))),entities=createEntities(objects,manifest.assetMetadata);
 const d=new WorldDoors();for(const id of ["house_a","yurt"]){const g=await asset(id);d.captureAsset(id,g.scene,m=>m);}
 d.place({entities,surface:{buildingPose:e=>({...pose,x:e.x,z:e.z})}});assert.equal(d.stats.entries,185);assert.equal(d.stats.leaves,257);assert.ok(d.stats.batches>6);assert.equal(d.stats.triangles,113*108+72*32);console.log("Full door inventory:",JSON.stringify(d.stats));d.dispose();
});

test("real structures integration preserves static plus moving triangles, shared AO materials and ownership",async()=>{
 const objects=JSON.parse(await readFile(new URL("../../public/data/objects.json",import.meta.url))),manifest=JSON.parse(await readFile(new URL("../../public/world-v2/manifest.json",import.meta.url))),entities=createEntities(objects,manifest.assetMetadata).filter(e=>e.assetId==="house_a"||e.assetId==="yurt");
 const world={entities,surface:{buildingPose:e=>({...pose,x:e.x,z:e.z})}},doors=new WorldDoors(),counts=new Map(),structures=new WorldStructures(world,{doors,loadAsset:async url=>{const id=url.includes("house_a")?"house_a":"yurt",gltf=await asset(id);let count=0;gltf.scene.traverse(n=>{if(n.isMesh)count+=tri(n.geometry);});counts.set(id,count);return gltf;}});
 await structures.load();assert.equal(doors.stats.entries,185);assert.equal(doors.stats.leaves,257);assert.equal(structures.stats.triangles+doors.stats.triangles,entities.reduce((sum,e)=>sum+counts.get(e.assetId),0));
 for(const mesh of doors.group.children){assert.ok(structures.materials.includes(mesh.material));assert.equal(mesh.material.vertexColors,false);assert.equal(mesh.material.userData.legacyVertexAOPreserved,true);assert.ok(mesh.geometry.attributes.assetOcclusion);assert.ok(mesh.geometry.attributes.uv);assert.ok(mesh.customDepthMaterial);}
 const bounds=doors.group.children.map(m=>m.boundingBox.getSize(new THREE.Vector3()));assert.ok(bounds.every(s=>s.x<4110&&s.z<4110));
 const camera=new THREE.PerspectiveCamera(60,1453/839,.1,200000);camera.position.set(-3611.9813305250705,2329.161214161885,4805.371282289286);camera.rotation.set(-10*Math.PI/180,30.90412352938094*Math.PI/180,0,"YXZ");camera.updateMatrixWorld();doors.update(camera,0);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),visible=doors.group.children.filter(m=>frustum.intersectsObject(m)),visibleTriangles=visible.reduce((n,m)=>n+tri(m.geometry)*m.count,0);assert.ok(visibleTriangles<doors.stats.triangles);console.log("Door partition forest query:",JSON.stringify({batches:doors.stats.batches,visibleBatches:visible.length,triangles:doors.stats.triangles,visibleTriangles,shadowBatches:doors.stats.shadowBatches}));
 const material=doors.group.children[0].material,geometry=doors.group.children[0].geometry;let materials=0,geometries=0;material.addEventListener("dispose",()=>materials++);geometry.addEventListener("dispose",()=>geometries++);doors.dispose();assert.equal(materials,0);assert.equal(geometries,1);assert.ok(structures.group.children.length>0);structures.dispose();assert.equal(materials,1);assert.equal(geometries,1);
});

test("blocked opening reports actual closed state and requests space, then resumes automatically without another toggle",async()=>{
 const button={style:{},setAttribute(){},addEventListener(){},remove(){}},panel={insertBefore(){},querySelector(){return null;}},doc={querySelector(){return panel;},createElement(){return button;}}, {d}=await ready({document:doc}),entry=d.entries.get("house-A");
 d.toggle(entry.id);for(let i=0;i<20;i++)d.update(null,.1);d.active=entry;d.render();assert.match(button.textContent,/已关闭.*开门 F/);let clear=false;d.motionGuard=()=>clear;d.toggle(entry.id);const revision=d.stats.revision;
 for(let i=0;i<5;i++)d.update(null,.1);assert.equal(d.openness(entry.id),0);assert.equal(d.stats.active.target,"open");assert.equal(d.stats.active.position,"closed");assert.equal(d.stats.active.blocked,true);assert.match(button.textContent,/开门受阻.*后退/);assert.match(button.title,/自动继续/);assert.equal(d.stats.revision,revision);
 clear=true;d.update(null,.1);assert.match(button.textContent,/正在开门/);assert.equal(d.stats.active.blocked,false);for(let i=0;i<20;i++)d.update(null,.1);assert.equal(d.openness(entry.id),1);assert.equal(d.stats.active.position,"open");assert.match(button.textContent,/已打开.*关门 F/);
 clear=false;d.toggle(entry.id);d.update(null,.1);assert.match(button.textContent,/关门受阻.*离开门道/);assert.equal(d.stats.active.position,"open");assert.equal(d.stats.active.target,"closed");d.toggle(entry.id);d.update(null,.1);assert.equal(d.stats.active.blocked,false);assert.match(button.textContent,/已打开.*关门 F/);d.dispose();
});
test('real angle query retains authored >90 degree pose and cannot mutate motion state',async()=>{
 const {d}=await ready();try{const state=d.angles('house-A');assert.equal(state.length,1);assert.ok(Math.abs(state[0].angle)>Math.PI/2);const before=d.entries.get('house-A').leaves[0].angle;
 state[0].angle=0;state.push({angle:0});assert.equal(d.angles('house-A').length,1);assert.equal(d.angles('house-A')[0].angle,before);assert.equal(d.angles('unknown'),null);
 }finally{d.dispose();}
});
