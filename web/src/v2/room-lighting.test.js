import {NearShadowAtlas40} from './shadow-atlas40.js';
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {CSM} from "three/addons/csm/CSM.js";
import {RoomIndirectLight,openingLightSample,ROOM_BOUNCE_GLSL,roomCeilingHeight,roomRoofProfile} from "./room-lighting.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
import {SettlementRuntime} from "./settlements.js";
import {installAssetOcclusion} from "./asset-occlusion.js";
import {WorldEnvironment} from "./environment.js";
import {createCloudUniforms} from "./cloud-field.js";
import {createAerialUniforms} from "./aerial-perspective.js";

globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}};
const assets=new Map();
async function asset(id){
 if(!assets.has(id)){const b=await readFile(new URL("../../public/assets/"+SETTLEMENT_ASSETS[id].url,import.meta.url));const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),"");
 gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh&&!o.material.transparent){o.material=o.material.clone();o.material.side=THREE.DoubleSide;meshes.push(o);}});assets.set(id,{scene:gltf.scene,meshes});}
 return assets.get(id);
}
test("authored pane samples clear the actual crossbars while retaining furniture occlusion",async()=>{
 for(const[id,definition]of Object.entries(SETTLEMENT_ASSETS)){
   const {meshes}=await asset(id);
   for(const opening of definition.openings){
     const sample=openingLightSample(opening,pose),p=new THREE.Vector3(...sample.position),to=new THREE.Vector3(...sample.target),dir=to.clone().sub(p).normalize();
     const hits=new THREE.Raycaster(p,dir,.001,.6).intersectObjects(meshes,false);
     assert.equal(hits.length,0,id+" "+opening.kind+" aperture is blocked by "+hits[0]?.object.name);
     if(id==="house_a"&&opening.kind==="window"){
       const centre=new THREE.Vector3(...opening.center).addScaledVector(new THREE.Vector3(...opening.normal),.3);
       assert.ok(new THREE.Raycaster(centre,to.clone().sub(centre).normalize(),.001,.3).intersectObjects(meshes,false).some(h=>h.object.name==="house_a_plank"));
     }
     if(opening.kind==="roof-crown"){
       assert.ok(new THREE.Raycaster(p,dir,.001,4).intersectObjects(meshes,false).some(h=>h.object.name==="pastoral_yurt_iron_stove"),"furniture still occludes the aperture");
     }
   }
 }
});
test("narrower cones still cover authored bed, table and storage/cooking work surfaces",async()=>{
 const names={house_a:["pastoral_house_bed_quilt","pastoral_house_low_table_top","pastoral_house_kitchen_counter","pastoral_house_chest_lid"],
   yurt:["pastoral_yurt_sleep_quilt","pastoral_yurt_low_table_top","pastoral_yurt_counter","pastoral_yurt_honour_chest_lid"]};
 for(const[id,definition]of Object.entries(SETTLEMENT_ASSETS)){
   const {meshes}=await asset(id),samples=definition.openings.map(o=>openingLightSample(o,pose));
   for(const name of names[id]){
     const mesh=meshes.find(m=>m.name===name);assert.ok(mesh,name);
     const b=new THREE.Box3().setFromObject(mesh),p=b.getCenter(new THREE.Vector3());p.y=b.max.y+.02;
     assert.ok(samples.some(sample=>{const from=new THREE.Vector3(...sample.position),axis=new THREE.Vector3(...sample.target).sub(from).normalize();
       return axis.dot(p.clone().sub(from).normalize())>Math.cos(sample.angle);}),name+" falls outside every sky aperture cone");
   }
   for(const sample of samples){
     const texel=2*3*Math.tan(sample.angle)/512;
     assert.ok(texel<.025,"retain 512 shadow maps while resolving under 2.5cm at 3m");
   }
 }
});
test("bounded bounce keeps exact rotated room transforms and stops outside occupied daylight rooms",()=>{
 const light=new RoomIndirectLight(),p={x:125,y:2100,z:-82,rot:.71,scale:{x:1.3,y:1.1,z:1.2}},item={id:"house",pose:p,asset:SETTLEMENT_ASSETS.house_a};
 light.setRoom(item,1);
 const local=new THREE.Vector3(-2,.6,-1.1),world=local.clone().applyMatrix4(light.matrix);
 assert.ok(world.applyMatrix4(light.uniforms.uRoomWorldToLocal.value).distanceTo(local)<1e-9);
 assert.equal(light.uniforms.uRoomBounceActive.value,1);
 const matrix=light.uniforms.uRoomWorldToLocal.value.clone();light.setRoom(item,.4);
 assert.deepEqual(light.uniforms.uRoomWorldToLocal.value,matrix);assert.equal(light.uniforms.uRoomBounceDay.value,.4);
 light.setRoom(null,1);assert.equal(light.uniforms.uRoomBounceActive.value,0);
 light.setRoom(item,0);assert.equal(light.uniforms.uRoomBounceActive.value,0);
 light.setRoom({id:"yurt",pose:p,asset:SETTLEMENT_ASSETS.yurt},1);assert.equal(light.uniforms.uRoomRadius.value,3.16);
 light.dispose();assert.equal(light.uniforms.uRoomBounceActive.value,0);
});
test("room irradiance composes with AO, actual CSM/cloud/air hooks, instancing and standard PBR",()=>{
 const material=new THREE.MeshStandardMaterial();installAssetOcclusion(material,{interiorBounce:.3});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),environment=Object.create(WorldEnvironment.prototype);
 environment.csm=new CSM({camera,parent:scene,cascades:3,maxFar:500});environment.registered=new Set();environment.shadowAtlas40=new NearShadowAtlas40({shadowMap:{}},environment.csm);
 environment.clouds=createCloudUniforms();environment.aerial=createAerialUniforms(new THREE.Vector3(0,1,0));environment.register([material]);
 const light=new RoomIndirectLight();light.register([material]);const hook=material.onBeforeCompile;light.register([material]);assert.equal(material.onBeforeCompile,hook);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,null);
 assert.equal(shader.uniforms.uRoomBounceActive,light.uniforms.uRoomBounceActive);
 assert.match(shader.vertexShader,/roomWorldVertex=instanceMatrix\*roomWorldVertex/);
 assert.match(shader.fragmentShader,/reflectedLight.indirectDiffuse \*= assetAO/);
 assert.match(shader.fragmentShader,/CSM_cascades\[ i \]/);
 const added=shader.fragmentShader.indexOf("RE_IndirectSpecular(roomRadiance,roomIrradiance");
 const skyModulation=shader.fragmentShader.indexOf("reflectedLight.indirectDiffuse *= assetAO");
 const total=shader.fragmentShader.indexOf("vec3 totalDiffuse =");
 assert.ok(added>skyModulation&&skyModulation>=0&&added<total,"room-return light must not be attenuated by sky visibility twice");
 const roomPass=shader.fragmentShader.slice(shader.fragmentShader.indexOf("if(uRoomAmbientActive>.5)"),total);
 assert.match(roomPass,/float roomAO=clamp\(vAssetOcclusion.x,0.0,1.0\)/);
 assert.match(roomPass,/roomIrradiance\*=roomAO/);
 assert.doesNotMatch(roomPass,/skyAccess|vAssetOcclusion.y/);
 assert.match(roomPass,/reflect\(-geometryViewDir,geometryNormal\)/);
 assert.match(roomPass,/computeSpecularOcclusion/);
 assert.match(THREE.ShaderChunk.lights_physical_pars_fragment,/reflectedLight.indirectDiffuse \+= indirectDiffuse/,"the installed standard indirect BRDF supplies both diffuse and metallic energy");
 assert.equal((ROOM_BOUNCE_GLSL.match(/uniform highp sampler3D/g)||[]).length,1,"one static room field sampler");
 assert.doesNotMatch(shader.fragmentShader,/directDiffuse \+= room|outgoingLight \+= room/);
 environment.shadowAtlas40.dispose();environment.csm.dispose();environment.csm.remove();material.dispose();light.dispose();
});

test("window ambient can be enabled independently of portal spots and its excluded volume resets",()=>{
 const light=new RoomIndirectLight();
 const guest={id:"guest",pose,asset:{portalSpots:false,height:2.68,floor:{shape:"rect",x0:-1.75,x1:4.2,z0:-3.85,z1:3.25,y:.035},
   excludedBounds:[2.34,4.2,-3.85,-1.44],openings:[{kind:"window",center:[.6,1.24,3.4],width:2.4,height:2.32,normal:[0,0,1],skyWeight:.55}]}};
 light.setRoom(guest,1);
 assert.equal(light.uniforms.uRoomAmbientActive.value,1);assert.equal(light.uniforms.uRoomBounceActive.value,0);
 assert.ok(Math.abs(light.uniforms.uRoomOpenings.value[0].w-2.4*2.32*.55)<1e-10);
 assert.match(ROOM_BOUNCE_GLSL,/mask\s*\*=\s*1.0-uRoomExcludeActive\*smoothstep/);
 light.setRoom({id:"pastoral",pose,asset:SETTLEMENT_ASSETS.house_a},1);
 assert.equal(light.uniforms.uRoomExcludeActive.value,0);assert.equal(light.uniforms.uRoomBounceActive.value,1);
 light.clear();assert.equal(light.uniforms.uRoomAmbientActive.value,0);assert.equal(light.uniforms.uRoomBounceActive.value,0);
 light.dispose();
});

test("light-volume roof caps enclose sampled real inner ceilings but not the exterior shell",async()=>{
 let checked=0;
 for(const id of["house_a","yurt"]){
   const {meshes}=await asset(id),definition=SETTLEMENT_ASSETS[id];
   const points=id==="house_a"?[-2,0,2].flatMap(x=>[-2,-1,0,1,2].map(z=>[x,z])):
     [.8,1.4,2,2.7].flatMap(r=>[.3,1.1,2.4].map(a=>[r*Math.cos(a),r*Math.sin(a)]));
   const inner=meshes.filter(n=>n.name===(id==="house_a"?"house_a_plank":"yurt_felt_in"));
   const outer=meshes.filter(n=>id==="house_a"?["house_a_plank","house_a_shingle"].includes(n.name):n.name==="yurt_felt");
   for(const [x,z]of points){
     const a=new THREE.Raycaster(new THREE.Vector3(x,1.8,z),new THREE.Vector3(0,1,0),.001,4).intersectObjects(inner,false)[0];
     const b=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0),.001,4).intersectObjects(outer,false)[0];
     assert.ok(a&&b,id+" roof sample "+[x,z]);
     const cap=roomCeilingHeight(definition,x,z);
     assert.ok(cap-a.point.y>.025,id+" light cap still cuts off visible inner ceiling");
     assert.ok(b.point.y-cap>.005,id+" light cap crosses the exterior roof");
     checked++;
   }
 }
 assert.equal(checked,27);
 assert.ok(roomCeilingHeight(SETTLEMENT_ASSETS.house_a,0,0)>3.5,"the old 2.7m flat cap excludes the gable");
});

test("finite reflection apertures preserve world dimensions under nonuniform building scales",()=>{
 const light=new RoomIndirectLight(),p={x:125,y:2100,z:-82,rot:.71,scale:{x:1.3,y:1.1,z:1.2}};
 for(const id of["house_a","yurt"]){
  const definition=SETTLEMENT_ASSETS[id];light.setRoom({id,pose:p,asset:definition},1);
  assert.deepEqual(light.uniforms.uRoomRoof.value.toArray(),roomRoofProfile(definition));
  for(let i=0;i<definition.openings.length;i++){
   const opening=definition.openings[i],u=light.uniforms.uRoomOpeningU.value[i],v=light.uniforms.uRoomOpeningV.value[i];
   const a=new THREE.Vector3(u.x,u.y,u.z),b=new THREE.Vector3(v.x,v.y,v.z),n=light.uniforms.uRoomInward.value[i];
   assert.ok(Math.abs(a.length()-1)<1e-12&&Math.abs(b.length()-1)<1e-12);
   assert.ok(Math.abs(a.dot(b))<1e-12&&Math.abs(a.dot(n))<1e-12&&Math.abs(b.dot(n))<1e-12);
   const crown=opening.kind==="roof-crown";
   assert.ok(Math.abs(u.w-(crown?opening.radius:opening.width*.5)*p.scale.x)<1e-12);
   assert.ok(Math.abs(v.w-(crown?opening.radius*p.scale.z:opening.height*.5*p.scale.y))<1e-12);
   assert.deepEqual(light.uniforms.uRoomOpeningLocal.value[i].toArray(),opening.center);
  }
 }
 light.dispose();
});

test("unoccluded standard materials use the same bounded indirect path without an asset attribute",()=>{
 const light=new RoomIndirectLight(),material=new THREE.MeshStandardMaterial();light.register([material]);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,null);
 assert.match(shader.fragmentShader,/float roomAO=1.0/);assert.doesNotMatch(shader.fragmentShader,/vAssetOcclusion/);
 assert.match(shader.fragmentShader,/roomPartitionVisibility\(local.xz,uRoomOpeningLocal\[i\].xz\)/);
 material.dispose();light.dispose();
});

test("guest-room partition proxy rejects actual blocked aperture paths without blocking open bedroom paths",async()=>{
 const world={entities:[{id:"guest",assetId:"gh_lanchuan"}],surface:{buildingPose:()=>({...pose}),heightAt:()=>0}};
 // This test compares the retained original GLB against its original proxy.
 const previousLocation=globalThis.location;let rooms;
 try{globalThis.location={search:'?guestVanity38=0'};rooms=new SettlementRuntime(world);}finally{if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;}
 const definition=rooms.guestRooms[0].asset,bounds=definition.excludedBounds;
 const box=new THREE.Box3(new THREE.Vector3(bounds[0],0,bounds[2]),new THREE.Vector3(bounds[1],definition.height,bounds[3]));
 const bytes=await readFile(new URL("../../public/assets/v2/gh_lanchuan_rooms.glb",import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
 gltf.scene.updateMatrixWorld(true);const partitions=[];
 gltf.scene.traverse(n=>{if(n.isMesh&&n.name.startsWith("freedom1_bath")){n.material=n.material.clone();n.material.side=THREE.DoubleSide;partitions.push(n);}});
 const to=new THREE.Vector3(...definition.openings[1].center);
 for(const [point,blocked]of[[[3.8,1.5,.5],true],[[3.8,1.5,2],true],[[3.3,1.5,0],true],[[1,1.5,0],false],[[0,1.5,2],false]]){
  const from=new THREE.Vector3(...point),direction=to.clone().sub(from),distance=direction.length();
  const ray=new THREE.Raycaster(from,direction.normalize(),0,distance);
  assert.equal(ray.intersectObjects(partitions,false).length>0,blocked,"actual partition geometry "+point);
  const entry=ray.ray.intersectBox(box,new THREE.Vector3());
  assert.equal(Boolean(entry&&entry.distanceTo(from)<distance),blocked,"shader partition volume "+point);
 }
 // The same local endpoints and rectangle are used by the GLSL slab query.
 assert.match(ROOM_BOUNCE_GLSL,/roomPartitionVisibility\(local.xz,uRoomOpeningLocal\[i\].xz\)/);
 assert.match(ROOM_BOUNCE_GLSL,/nearT<farT&&farT>.0001&&nearT<.9999/);
 rooms.dispose();
});
