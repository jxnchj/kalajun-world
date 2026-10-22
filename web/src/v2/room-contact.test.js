import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {ROOM_CONTACT_DATA} from "./room-contact-data.js";
import {RoomContactField,decodeRoomContact,sampleRoomContact,ROOM_CONTACT_GLSL} from "./room-contact.js";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {RoomIndirectLight} from "./room-lighting.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
import {installAssetOcclusion} from "./asset-occlusion.js";
const pose={x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}},item={id:"house",asset:SETTLEMENT_ASSETS.house_a,pose};
const hash=b=>createHash("sha256").update(b).digest("hex");
test("five contact fields retain the exact current Blend/GLB and finite metric sample budgets",async t=>{
  assert.deepEqual(Object.keys(ROOM_CONTACT_DATA).sort(),["house_a","yurt","lanchuan-freedom-1","lanchuan-freedom-2","lanchuan-freedom-3"].sort());
  let bytes=0;
  for(const[key,field]of Object.entries(ROOM_CONTACT_DATA)){
    assert.equal(hash(await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url))),field.sourceSHA256,key+" source GLB changed");
    assert.equal(hash(await readFile(new URL("../../../"+field.sourceBlend,import.meta.url))),field.blendSHA256,key+" source Blend changed");
    const data=decodeRoomContact(field);bytes+=data.byteLength;assert.equal(data.length,field.size[0]*field.size[1]*2);
    assert.equal(field.spacing,.025);assert.equal(field.samples,64);assert.equal(field.radius,.55);
    let valid=0,contact=0;
    for(let i=0;i<data.length;i+=2){assert.ok(data[i]>=51&&data[i]<=255);if(data[i+1]){valid++;if(data[i]<.95*255)contact++;}else assert.equal(data[i],255);}
    assert.equal(valid,field.validTexels);assert.ok(contact>500&&contact/valid<.2,key+" must not darken the whole floor");
    assert.ok(field.receiverTriangles>10);
  }
  assert.equal(bytes,598832);t.diagnostic(JSON.stringify({rooms:5,textureBytes:bytes,extraPasses:0,samplesPerEligibleFragment:4}));
});
test("actual wood table contact is confined to the receiver; open floor, walls, table tops and A/B off stay unchanged",()=>{
  const field=ROOM_CONTACT_DATA.house_a,data=decodeRoomContact(field);
  const p=[-.315,.047,.600],near=sampleRoomContact(field,data,p);
  assert.ok(near<.65,"actual table leg contact needs missing detail");
  assert.equal(sampleRoomContact(field,data,[-.235,.047,.600]),1,"8 cm away is not an arbitrary black disc");
  for(const q of [[-.5,.03,2],[2,.03,1],[.2,.05,0],[-.315,.65,.600],[-.315,2.5,.600],[99,.03,.6]])assert.equal(sampleRoomContact(field,data,q),1,"unrelated receiver "+q);
  // New rounded cushions change the actual short-radius occlusion at the rug
  // centre by one RG8 step. A neighbouring open patch above remains exactly 1.
  assert.equal(sampleRoomContact(field,data,[0,.05,0]),254/255,"rebaked centre rug retains the measured new cushion occlusion");
  assert.equal(sampleRoomContact(field,data,p,0),1,"vertical furniture face");
  assert.equal(sampleRoomContact(field,data,p,-1),1,"downward surface");
  assert.equal(sampleRoomContact(field,data,p,1,0),1,"v12 A/B");
  for(let shift=-.003;shift<=.003;shift+=.0005){const a=sampleRoomContact(field,data,[p[0]+shift,p[1],p[2]]),b=sampleRoomContact(field,data,[p[0]+shift+1e-5,p[1],p[2]]);assert.ok(Math.abs(a-b)<.001,"continuous bilinear lookup");}
});
test("contact coordinates stay local under rotation, reflection and nonuniform building transforms",()=>{
  const field=new RoomContactField(),local=new THREE.Vector3(-.315,.047,.600);
  for(const scale of[{x:1.3,y:1.1,z:.85},{x:-1.3,y:1.1,z:.85},{x:1.3,y:1.1,z:-.85}]){
    const p={x:-2000,y:1900,z:3350,rot:1.677,scale},q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot);
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(scale.x,scale.y,scale.z));
    field.set({id:"transformed",asset:item.asset,pose:p});
    const restored=local.clone().applyMatrix4(matrix).applyMatrix4(field.uniforms.uRoomContactWorldToLocal.value);
    assert.ok(restored.distanceTo(local)<1e-9);
  }
  field.dispose();
});
test("night keeps static contact while sky/solar become zero; switches, clear and disposal cannot retain another room",()=>{
  const light=new RoomIndirectLight();light.setRoom(item,1);const texture=light.uniforms.uRoomContactMap.value,version=texture.version;
  for(let i=0;i<120;i++)light.setRoom(item,1);
  assert.equal(texture.version,version);assert.equal(light.contact.cache.size,1);
  light.setRoom(item,0);
  assert.equal(light.uniforms.uRoomAmbientActive.value,0);assert.equal(light.uniforms.uRoomFieldActive.value,0);
  assert.equal(light.uniforms.uRoomContactActive.value,1);assert.equal(light.uniforms.uRoomContactMap.value,texture);
  light.setRoom({id:"yurt",asset:SETTLEMENT_ASSETS.yurt,pose},1);
  assert.notEqual(light.uniforms.uRoomContactMap.value,texture);assert.equal(light.contact.stats.field,"yurt");
  light.setRoom(null,1);assert.equal(light.uniforms.uRoomContactActive.value,0);assert.equal(light.contact.stats.field,null);
  light.setRoom(item,1);assert.equal(light.uniforms.uRoomContactMap.value,texture);
  assert.equal(texture.format,THREE.RGFormat);assert.equal(texture.type,THREE.UnsignedByteType);assert.equal(texture.minFilter,THREE.LinearFilter);
  assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.generateMipmaps,false);
  let disposed=0;for(const t of[...light.contact.cache.values(),light.contact.empty])t.addEventListener("dispose",()=>disposed++);
  light.dispose();assert.equal(disposed,3);assert.equal(light.contact.stats.textureBytes,0);assert.equal(light.uniforms.uRoomContactActive.value,0);
});
test("shader applies missing contact once to each indirect source and never modifies direct sun or fixtures",()=>{
  for(const assetAO of[false,true]){
    const light=new RoomIndirectLight(),material=new THREE.MeshStandardMaterial();if(assetAO)installAssetOcclusion(material);
    light.register([material]);const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uRoomContactDetail,light.uniforms.uRoomContactDetail);
    assert.match(shader.vertexShader,/roomWorldVertex=instanceMatrix\*roomWorldVertex/);
    assert.equal((shader.fragmentShader.match(/float roomContactAO=/g)||[]).length,1);
    assert.match(shader.fragmentShader,/roomAO\*=roomContactAO/);
    if(assetAO)assert.match(shader.fragmentShader,/float assetAO=clamp\(vAssetOcclusion.x,0.0,1.0\)\*roomContactAO/);
    else assert.match(shader.fragmentShader,/reflectedLight.indirectDiffuse\*=roomContactAO/);
    assert.doesNotMatch(shader.fragmentShader,/reflectedLight.direct(?:Diffuse|Specular)\s*[*+/=-].*roomContact/);
    assert.ok(shader.fragmentShader.indexOf("float roomContactAO=")<shader.fragmentShader.indexOf("if(uRoomAmbientActive>.5)"));
    assert.equal((ROOM_CONTACT_GLSL.match(/uniform sampler2D/g)||[]).length,1,"same sampler budget");
    const query=ROOM_CONTACT_GLSL.slice(ROOM_CONTACT_GLSL.indexOf("float roomContactCorrection"));
    assert.ok(query.indexOf("uRoomContactActive<.5")<query.indexOf("roomContactTexel(base"));
    assert.ok(query.indexOf("greaterThan(p")<query.indexOf("roomContactTexel(base"));
    assert.match(shader.fragmentShader,/uRoomContactHeightFilter<.5\?geometryNormal:nonPerturbedNormal/);
    assert.equal(light.uniforms.uRoomContactHeightFilter.value,1);
    assert.equal({...light.contact.stats}.samplesPerEligibleFragment,4);
    light.uniforms.uRoomContactHeightFilter.value=0;
    assert.equal({...light.contact.stats}.filter,"height-mixed-v16");
    assert.equal({...light.contact.stats}.samplesPerEligibleFragment,1);
    material.dispose();light.dispose();
  }
});
test("contact decoder rejects unknown, partial, zero and oversized runs instead of publishing stale masks",()=>{
  for(const field of[
    {encoding:"bad",size:[1,1],data:""},
    {encoding:"raw8",size:[1,1],data:""},
    {encoding:"run8",size:[1,1],data:btoa(String.fromCharCode(0,255))},
    {encoding:"run8",size:[1,1],data:btoa(String.fromCharCode(3,255))},
    {encoding:"run8",size:[1,1],data:btoa(String.fromCharCode(1,255))},
  ])assert.throws(()=>decodeRoomContact(field),/Invalid|Truncated/);
  assert.deepEqual([...decodeRoomContact({encoding:"run8",size:[1,1],data:btoa(String.fromCharCode(2,255))})],[255,255]);
});


test("receiver-height steps neither invent a sloped floor nor spill occlusion between levels",()=>{
  const field={bounds:[[0,0],[.025,.025]],size:[2,2],heightRange:[0,.102]};
  const data=new Uint8Array([51,0,51,255,51,0,51,255]);
  for(const y of [0,.102])assert.ok(Math.abs(sampleRoomContact(field,data,[.0125,y,.0125])-.6)<1e-12);
  assert.equal(sampleRoomContact(field,data,[.0125,.051,.0125]),1,"there is no receiver halfway up a height step");
  const a=sampleRoomContact(field,data,[.0125,0,.0125]),b=sampleRoomContact(field,data,[.012501,0,.0125]);
  assert.ok(Math.abs(a-b)<.00004,"height-aware weighting remains continuous in space");
});

test("sloping receiver tangent planes preserve bilinear contact instead of treating slopes as steps",()=>{
  const field={bounds:[[0,0],[.025,.025]],size:[2,2],heightRange:[0,.04]};
  const data=new Uint8Array([51,0,102,128,153,0,204,128]);
  const y=.04*128/255*.5,normal=[-.04*128/255/.025,1,0];
  assert.ok(Math.abs(sampleRoomContact(field,data,[.0125,y,.0125],1,1,normal)-.5)<1e-12);
  const contact=new RoomContactField(),local=new THREE.Vector3(...normal).normalize();
  for(const scale of [{x:1.3,y:.9,z:.85},{x:-1.3,y:.9,z:.85}]){
    const p={...pose,rot:.71,scale},matrix=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot),new THREE.Vector3(scale.x,scale.y,scale.z));
    contact.set({...item,pose:p});
    const world=local.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
    const restored=world.applyMatrix3(contact.uniforms.uRoomContactNormalToLocal.value).normalize();
    assert.ok(restored.distanceTo(local)<1e-12,"nonuniform/reflected room normal stays in the authored receiver plane");
  }
  contact.dispose();
});

test("real wood floor and three guest wet-floor edges retain their own receiver height",async()=>{
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
  const cache=new Map(),cases=[
    ["house_a",[-1.7375,.875],"house_a_plank",.998,.9986],
    ["lanchuan-freedom-1",[2.4125,-1.525],"freedom1_wet_floor",.88,.94],
    ["lanchuan-freedom-2",[8.0125,-1.525],"freedom2_wet_floor",.88,.94],
    ["lanchuan-freedom-3",[12.9625,-1.525],"freedom3_wet_floor",.88,.94],
  ];
  for(const [key,[x,z],name,min,max]of cases){
    const field=ROOM_CONTACT_DATA[key];
    if(!cache.has(field.sourceGLB)){
      const bytes=await readFile(new URL("../../public/"+field.sourceGLB,import.meta.url));
      const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
      gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(mesh=>{if(mesh.isMesh){mesh.material=mesh.material.clone();mesh.material.side=THREE.DoubleSide;meshes.push(mesh);}});cache.set(field.sourceGLB,meshes);
    }
    const hits=new THREE.Raycaster(new THREE.Vector3(x,.125,z),new THREE.Vector3(0,-1,0),0,.15).intersectObjects(cache.get(field.sourceGLB),false);
    const worldNormal=h=>h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
    // The contact baker accepts upward receivers (normal.y >= .65). Starting
    // inside a rounded cushion also intersects its lower, ineligible surface.
    if(key==="house_a"){
      assert.equal(hits[0]?.object.name,"pastoral_house_floor_cushion");
      const underside=worldNormal(hits[0]);assert.ok(underside.y<-.85);
      assert.equal(sampleRoomContact(field,decodeRoomContact(field),hits[0].point.toArray(),underside.y,1,underside.toArray()),1,"cushion underside must not inherit floor contact");
    }
    const hit=hits.find(h=>worldNormal(h).y>=.65);
    assert.equal(hit?.object.name,name);
    const normal=worldNormal(hit);
    if(key==="house_a")assert.ok(Math.abs(hit.point.y-.03)<1e-8,"original wood plank receiver height is unchanged");
    const value=sampleRoomContact(field,decodeRoomContact(field),hit.point.toArray(),normal.y,1,normal.toArray());
    assert.ok(value>min&&value<max,key+" actual receiver contact "+value);
  }
});
