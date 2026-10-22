import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {WorldEcology} from "./ecology.js";
import {worldViewpoints} from "./viewpoints.js";
import {WebGLAttributes} from "three/src/renderers/webgl/WebGLAttributes.js";
import {WebGLGeometries} from "three/src/renderers/webgl/WebGLGeometries.js";
import {WebGLObjects} from "three/src/renderers/webgl/WebGLObjects.js";
import {createFarTreeBatch,disposeFarTreeBatch,setFarTreeBounds,farTreeBoundsControl} from "./far-tree-batches.js";
import {SPRUCE_SPEC,setFarSpruceAttributes} from "./spruce-geometry.js";
import {createFarSpruceVolumeGeometry} from "./spruce-volume.js";
import {createFarSpruceImpostorGeometry,setFarSpruceImpostorAttributes} from "./spruce-far-impostor.js";
const impostorAssets={metadata:JSON.parse(readFileSync(new URL("../../public/assets/v2/spruce/far-v14/impostor-manifest.json",import.meta.url)))};
const impostorOptions={setAttributes:setFarSpruceImpostorAttributes};
const matrixFor=r=>new THREE.Matrix4().compose(new THREE.Vector3(r.x,r.y,r.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r.rot),new THREE.Vector3(r.s,r.s,r.s));
const records=[{id:"spruce:-8:-4",x:-93.25,y:120,z:-43.5,s:.72,rot:.37,variant:0},{id:"spruce:-1:3",x:-3.7,y:235,z:38.25,s:1.479,rot:2.3,variant:4}];
function resources(){
 const uploads=[],deleted=[],gl={ARRAY_BUFFER:34962,FLOAT:5126,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,
  createBuffer:()=>({}),bindBuffer:()=>{},bufferData:(target,array)=>uploads.push(array.slice()),bufferSubData:()=>{},deleteBuffer:buffer=>deleted.push(buffer)};
 const gpu=new WebGLAttributes(gl),info={memory:{geometries:0},render:{frame:0}},binding={releaseStatesOfGeometry:()=>{},releaseStatesOfObject:()=>{}},geometries=new WebGLGeometries(gl,gpu,info,binding),objects=new WebGLObjects(gl,geometries,gpu,binding,info);
 const submit=mesh=>{info.render.frame++;objects.update(mesh);gpu.update(mesh.geometry.index,gl.ARRAY_BUFFER);mesh.onBeforeRender();};
 return {uploads,deleted,gpu,info,submit};
}

test("far tile shares every static attribute/index and preserves original instance bytes, sphere and materials",()=>{
 const source=createFarSpruceVolumeGeometry(),material=new THREE.MeshStandardMaterial(),mesh=createFarTreeBatch(source,material,records,matrixFor);
 const legacy=new THREE.InstancedMesh(setFarSpruceAttributes(source.clone(),records),material,records.length);
 records.forEach((r,i)=>legacy.setMatrixAt(i,matrixFor(r)));legacy.computeBoundingSphere();legacy.boundingSphere.radius+=1;
 assert.equal(mesh.count,records.length);assert.deepEqual(mesh.instanceMatrix.array,legacy.instanceMatrix.array);
 assert.deepEqual(mesh.boundingSphere,legacy.boundingSphere);assert.strictEqual(mesh.geometry.index,source.index);
 for(const [name,a]of Object.entries(source.attributes))assert.strictEqual(mesh.geometry.attributes[name],a);
 for(const name of ["aSpruceForm","aSpruceAsym"])assert.deepEqual(mesh.geometry.attributes[name].array,legacy.geometry.attributes[name].array);
 assert.strictEqual(mesh.material,material);assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,true);
 const second=createFarTreeBatch(source,material,records,matrixFor);
 assert.notStrictEqual(mesh.geometry.attributes.aSpruceForm,second.geometry.attributes.aSpruceForm);
 assert.notStrictEqual(mesh.instanceMatrix,second.instanceMatrix);assert.strictEqual(material.userData.farTreeBounds,farTreeBoundsControl);
 disposeFarTreeBatch(mesh);disposeFarTreeBatch(second);legacy.geometry.dispose();legacy.dispose();source.dispose();material.dispose();
});

function shapedPoint(g,i,form){
 const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i);
 if(g.attributes.aCrownMask.getX(i)>.5){
  const t=THREE.MathUtils.clamp(p.y/18,0,1),r=form.rmax*Math.pow(1-t,form.pw)*(.88+.12*Math.sin(t*7.3+form.seed))+.12;
  const x=(p.x+.00001)/Math.hypot(p.x+.00001,p.z+.00001),scale=r*(1+form.side*x);
  p.y=form.base+(18-form.base)*t;p.x=p.x*scale+form.lean*p.y;p.z*=scale;
 }
 return p;
}
test("complete legacy five-form crowns and extreme wind remain in bounds at negative roots and every rotation",()=>{
 for(const source of [createFarSpruceVolumeGeometry()]){
  const material=new THREE.MeshStandardMaterial();
  for(let variant=0;variant<5;variant++)for(const scale of [.72,1.48,3])for(let angle=0;angle<8;angle++){
   const root={id:"envelope",x:-384.002,y:variant*120,z:-.001,s:scale,rot:angle*Math.PI/4,variant};
   const mesh=createFarTreeBatch(source,material,[root],matrixFor),matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);
   for(let i=0;i<source.attributes.position.count;i++){
    const point=shapedPoint(source,i,SPRUCE_SPEC.variants[variant]);assert.ok(source.boundingBox.containsPoint(point),"source envelope covers the static shaped crown");
    for(const [current,previous]of [[0,0],[1,1],[0,1],[1,0]])for(const direction of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
     const weighted=current+(previous-current)*THREE.MathUtils.clamp(point.y/18,0,1)*.48;
     const force=(weighted+(weighted-previous)*.32)*Math.min(20,Math.max(0,point.y))**2*.0014;
     const moved=point.clone().add(new THREE.Vector3(Math.cos(direction)*force,0,Math.sin(direction)*force)).applyMatrix4(matrix);
     assert.ok(mesh.boundingBox.containsPoint(moved),"AABB must include all static forms and allowed wind");
    }
   }
   disposeFarTreeBatch(mesh);
  }
  source.dispose();material.dispose();
 }
});

test("world AABB tightens a sloping tile while sphere A/B, reflection cameras and empty batches stay conservative",()=>{
 const source=createFarSpruceVolumeGeometry(),material=new THREE.MeshStandardMaterial(),roots=[{...records[0],x:100,y:0,z:-200},{...records[1],x:110,y:300,z:-210}],mesh=createFarTreeBatch(source,material,roots,matrixFor);
 const camera=new THREE.PerspectiveCamera(20,1,.1,1000);camera.updateMatrixWorld();
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 try{
  setFarTreeBounds(false);assert.equal(mesh.intersectsFrustum(frustum),true,"legacy union sphere reaches empty space in front of the camera");
  setFarTreeBounds(true);assert.equal(mesh.intersectsFrustum(frustum),false,"actual crown box remains to the right");
  const parent=new THREE.Group();parent.position.set(-105,7,40);parent.rotation.y=.17;parent.scale.setScalar(1.2);parent.add(mesh);parent.updateMatrixWorld(true);
  const centre=mesh.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  for(const y of [centre.y-100,centre.y+100]){camera.position.set(centre.x,y,centre.z+400);camera.lookAt(centre);camera.updateMatrixWorld();frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));assert.equal(mesh.intersectsFrustum(frustum),true);}
  mesh.count=0;assert.equal(mesh.intersectsFrustum(frustum),false);mesh.count=roots.length;assert.equal(mesh.intersectsFrustum(frustum),true);
  assert.throws(()=>setFarTreeBounds(0),/boolean/);
 }finally{setFarTreeBounds(true);disposeFarTreeBatch(mesh);source.dispose();material.dispose();}
});

test("real Three lifecycle releases private matrices/fields and keeps static GPU buffers until the last rendered tile",()=>{
 const source=createFarSpruceVolumeGeometry(),material=new THREE.MeshStandardMaterial(),a=createFarTreeBatch(source,material,records,matrixFor),b=createFarTreeBatch(source,material,records,matrixFor),gpu=resources();
 gpu.submit(a);const first=gpu.uploads.length;gpu.submit(b);
 assert.equal(gpu.uploads.length-first,3,"only form, asymmetry and instance matrix upload for the second tile");
 const fieldB=b.geometry.attributes.aSpruceForm,matrixB=b.instanceMatrix;
 disposeFarTreeBatch(b);assert.equal(gpu.gpu.get(fieldB),undefined);assert.equal(gpu.gpu.get(matrixB),undefined);
 assert.ok(gpu.gpu.get(source.attributes.position));assert.ok(gpu.gpu.get(a.geometry.attributes.aSpruceForm));
 disposeFarTreeBatch(a);assert.equal(gpu.info.memory.geometries,0);assert.equal(gpu.deleted.length,gpu.uploads.length);
 const deleted=gpu.deleted.length;disposeFarTreeBatch(a);disposeFarTreeBatch(b);assert.equal(gpu.deleted.length,deleted);
 source.dispose();material.dispose();
});

test("a final unseen tile and retire/rebuild cycles do not leak or prematurely free shared buffers",()=>{
 const source=createFarSpruceVolumeGeometry(),material=new THREE.MeshStandardMaterial(),a=createFarTreeBatch(source,material,records,matrixFor),unseen=createFarTreeBatch(source,material,records,matrixFor),gpu=resources();
 gpu.submit(a);disposeFarTreeBatch(a);assert.ok(gpu.gpu.get(source.attributes.position));assert.equal(gpu.gpu.get(a.instanceMatrix),undefined,"retired owner never retains its instanceMatrix");
 disposeFarTreeBatch(unseen);assert.equal(gpu.info.memory.geometries,0);assert.equal(gpu.deleted.length,gpu.uploads.length);
 assert.equal(gpu.gpu.get(source.attributes.position),undefined);
 const b=createFarTreeBatch(source,material,records,matrixFor);gpu.submit(b);disposeFarTreeBatch(b);
 assert.equal(gpu.deleted.length,gpu.uploads.length);assert.equal(gpu.info.memory.geometries,0);assert.ok(source.attributes.position.array.length);
 source.dispose();material.dispose();
});

// Decode the actual non-interlaced 8-bit RGB/RGBA source without browser canvas.
function png(bytes){
 let width,height,channels;const chunks=[];
 assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);
  if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===2?3:d[9]===6?4:0;assert.ok(channels);}
  if(type==="IDAT")chunks.push(d);p+=n+12;
 }
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=raw[y*(stride+1)];assert.ok(f<=4);
  for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
   pixels[i]=(raw[y*(stride+1)+1+x]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;
  }
 }
 const data=new Uint8Array(width*height*4);
 for(let i=0;i<width*height;i++){data[i*4]=pixels[i*channels];data[i*4+1]=pixels[i*channels+1];data[i*4+2]=pixels[i*channels+2];data[i*4+3]=channels===4?pixels[i*channels+3]:255;}
 return{width,height,data};
}
test("actual forest, river and valley impostors retain all roots/matrices while bounds reduce main-view submissions",t=>{
 const base=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base))));
 const meta=json("data/scene.json"),world=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:bin("data/detail.bin.gz"),coreLandcover:png(readFileSync(new URL("data/core_landcover.png",base))),farLandcover:png(readFileSync(new URL("data/far_landcover.png",base)))});
 const ecology=new WorldEcology(world),source=createFarSpruceImpostorGeometry(impostorAssets),material=new THREE.MeshStandardMaterial();
 try{
  for(const place of worldViewpoints({water:world.hydrology.viewpoints}).filter(p=>["forest","river-forest","valley"].includes(p.id))){
   const camera=new THREE.PerspectiveCamera(52,2179/1218,.25,150000),p=camera.position;
   p.set(place.x,world.surface.heightAt(place.x,place.z)+place.above,place.z);camera.rotation.set(place.pitch*Math.PI/180,-place.yaw*Math.PI/180,0,"YXZ");camera.updateMatrixWorld();
   const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   let total=0,sphereRoots=0,boxRoots=0,sphereCalls=0,boxCalls=0;const identities=new Set();
   for(let tz=Math.floor((p.z-2200)/384);tz<=Math.floor((p.z+2200)/384);tz++)for(let tx=Math.floor((p.x-2200)/384);tx<=Math.floor((p.x+2200)/384);tx++){
    if(Math.hypot((tx+.5)*384-p.x,(tz+.5)*384-p.z)>=2480)continue;
    const roots=[];for(let iz=tz*32;iz<(tz+1)*32;iz++)for(let ix=tx*32;ix<(tx+1)*32;ix++){const r=ecology.treeAt(ix,iz);if(r){assert.ok(!identities.has(r.id));identities.add(r.id);roots.push(r);}}
    if(!roots.length)continue;
    const mesh=createFarTreeBatch(source,material,roots,matrixFor,impostorOptions);total+=roots.length;
    assert.equal(mesh.count,roots.length);
    for(let i=0;i<roots.length;i++)assert.deepEqual(mesh.instanceMatrix.array.slice(i*16,i*16+16),Float32Array.from(matrixFor(roots[i]).elements));
    setFarTreeBounds(false);if(mesh.intersectsFrustum(frustum)){sphereCalls++;sphereRoots+=mesh.count;}
    setFarTreeBounds(true);if(mesh.intersectsFrustum(frustum)){boxCalls++;boxRoots+=mesh.count;}
    disposeFarTreeBatch(mesh);
   }
   assert.equal(total,{valley:60946,forest:44877,"river-forest":80927}[place.id]);
   assert.ok(boxRoots<sphereRoots);assert.ok(boxCalls<=sphereCalls);
   t.diagnostic(`${place.id}: same ${total} roots; sphere ${sphereRoots}/${sphereCalls} -> AABB ${boxRoots}/${boxCalls} submitted roots/calls; no GPU timing implied`);
  }
 }finally{setFarTreeBounds(true);ecology.dispose();source.dispose();material.dispose();}
});

test("injected private billboard attributes share static buffers and release independently",()=>{
 const source=createFarSpruceImpostorGeometry(impostorAssets),material=new THREE.MeshStandardMaterial();
 const setAttributes=setFarSpruceImpostorAttributes;
 const a=createFarTreeBatch(source,material,records,matrixFor,{setAttributes}),b=createFarTreeBatch(source,material,records,matrixFor,{setAttributes}),gpu=resources();
 assert.deepEqual(Array.from(a.geometry.attributes.aFarForm.array),records.map(r=>r.variant));
 assert.equal(a.geometry.attributes.aSpruceForm,undefined);assert.equal(a.geometry.attributes.aSpruceAsym,undefined);
 for(const [name,attribute]of Object.entries(source.attributes))assert.strictEqual(a.geometry.attributes[name],attribute);
 gpu.submit(a);const first=gpu.uploads.length;gpu.submit(b);assert.equal(gpu.uploads.length-first,2,"only variant and instanceMatrix are private");
 const field=b.geometry.attributes.aFarForm;disposeFarTreeBatch(b);assert.equal(gpu.gpu.get(field),undefined);assert.ok(gpu.gpu.get(source.attributes.position));
 disposeFarTreeBatch(a);assert.equal(gpu.deleted.length,gpu.uploads.length);assert.equal(gpu.info.memory.geometries,0);
 assert.throws(()=>createFarTreeBatch(source,material,records,matrixFor,{setAttributes:null}),/setter/);
 source.setAttribute("aFarForm",new THREE.InstancedBufferAttribute(new Float32Array(1),1));assert.throws(()=>createFarTreeBatch(source,material,records,matrixFor),/uninstanced/);
 source.dispose();material.dispose();
});


test("all 120 captures preserve the root and correct camera-right/up axes after every instance rotation",()=>{
 const metadata=impostorAssets.metadata,eps=1e-10;
 for(const f of metadata.frames){
  const yaw=f.yaw*Math.PI/180,e=f.elevation*Math.PI/180,r=f.rect;
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(e),Math.sin(e),Math.cos(yaw)*Math.cos(e));
  const up=new THREE.Vector3(-Math.sin(yaw)*Math.sin(e),Math.cos(e),-Math.cos(yaw)*Math.sin(e));
  assert.ok(right.clone().cross(up).distanceTo(direction)<eps,"capture basis is right handed after Blender-to-Three conversion");
  const rootQ=new THREE.Vector2(r[0]+f.rootUv[0]*(r[2]-r[0]),r[1]+f.rootUv[1]*(r[3]-r[1]));
  assert.ok(rootQ.length()<eps,"different crop rectangles never shift the projected root");
  for(const rot of [0,.37,Math.PI/2,Math.PI,5.91])for(const scale of [.72,1.48]){
   const record={x:-384.125,y:2120.25,z:-.03125,s:scale,rot,variant:f.formIndex};
   const m=new THREE.Matrix4().fromArray(Float32Array.from(matrixFor(record).elements)),inv=m.clone().invert();
   const root=new THREE.Vector3().setFromMatrixPosition(m);
   const localCentre=new THREE.Vector3(0,9,0),camera=localCentre.clone().addScaledVector(direction,800).applyMatrix4(m);
   const view=camera.clone().applyMatrix4(inv).sub(localCentre);
   const radius=Math.hypot(view.x,view.z),billboardRight=new THREE.Vector3(view.z/radius,0,-view.x/radius);
   assert.ok(billboardRight.distanceTo(right)<eps,"camera relative to root rotation selects the capture's actual right axis");
   const anchored=billboardRight.clone().multiplyScalar(rootQ.x).add(new THREE.Vector3(0,rootQ.y,0)).applyMatrix4(m);
   assert.ok(anchored.distanceTo(root)<1e-9);
   for(const qx of [r[0],0,r[2]])for(const qy of [r[1],0,r[3]]){
    const point=right.clone().multiplyScalar(qx).add(new THREE.Vector3(0,qy,0));
    assert.ok(Math.abs(point.dot(right)-qx)<eps);
    assert.ok(Math.abs(point.dot(up)-qy*Math.cos(e))<eps,"stored y is divided by capture cos(e), preserving its exact projected height");
   }
  }
 }
});

test("final billboard's full camera-facing envelope and wind remain visible to main/reflection frusta",()=>{
 const source=createFarSpruceImpostorGeometry(impostorAssets),material=new THREE.MeshStandardMaterial();
 const rects=impostorAssets.metadata.formRects;
 assert.equal(source.index.count/3,8);assert.equal(source.attributes.position.count,10);
 for(let variant=0;variant<5;variant++)for(const scale of [.72,1.48,3])for(const rot of [.37,2.8,5.6]){
  const root={id:"billboard-envelope",x:-384.002,y:2100.75,z:-.001,s:scale,rot,variant};
  const mesh=createFarTreeBatch(source,material,[root],matrixFor,impostorOptions),m=new THREE.Matrix4();mesh.getMatrixAt(0,m);
  const r=rects[variant];
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/16)for(const x of [r[0],r[2]])for(const y of [r[1],r[3]]){
   const point=new THREE.Vector3(Math.cos(angle)*x,y,-Math.sin(angle)*x);
   assert.ok(source.boundingBox.containsPoint(point));
   const h=THREE.MathUtils.clamp(y,0,20),w=THREE.MathUtils.clamp(y/18,0,1);
   for(const [current,previous]of [[0,0],[1,1],[0,1],[1,0]])for(const direction of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
    const weighted=current+(previous-current)*w*.48,force=(weighted+(weighted-previous)*.32)*h*h*.0014;
    const moved=point.clone().add(new THREE.Vector3(Math.cos(direction)*force,0,Math.sin(direction)*force)).applyMatrix4(m);
    assert.ok(mesh.boundingBox.containsPoint(moved),"world box encloses complete plane and all bounded far wind");
   }
  }
  // Tight views through an extreme corner must never reject that tile, including
  // a reflected camera below the ground. Neither camera shares the main yaw.
  for(const elevation of [-.7,.7]){
   const point=new THREE.Vector3(r[2],r[3],0).applyMatrix4(m),camera=new THREE.PerspectiveCamera(1,1,.1,2000);
   camera.position.copy(point).add(new THREE.Vector3(300,elevation*300,260));camera.lookAt(point);camera.updateMatrixWorld();
   const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   assert.ok(frustum.containsPoint(point));assert.equal(mesh.intersectsFrustum(frustum),true);
  }
  disposeFarTreeBatch(mesh);
 }
 source.dispose();material.dispose();
});

test("final rendered billboard owner can retire before unseen tiles without leaking shared or private buffers",()=>{
 const source=createFarSpruceImpostorGeometry(impostorAssets),material=new THREE.MeshStandardMaterial(),gpu=resources();
 const first=createFarTreeBatch(source,material,records,matrixFor,impostorOptions),unseen=createFarTreeBatch(source,material,records,matrixFor,impostorOptions);
 gpu.submit(first);const own=first.geometry.attributes.aFarForm;
 disposeFarTreeBatch(first);assert.equal(gpu.gpu.get(first.instanceMatrix),undefined);assert.ok(gpu.gpu.get(source.index));
 disposeFarTreeBatch(unseen);assert.equal(gpu.gpu.get(own),undefined);assert.equal(gpu.gpu.get(source.index),undefined);
 assert.equal(gpu.info.memory.geometries,0);assert.equal(gpu.deleted.length,gpu.uploads.length);
 const next=createFarTreeBatch(source,material,records,matrixFor,impostorOptions);gpu.submit(next);disposeFarTreeBatch(next);
 assert.equal(gpu.deleted.length,gpu.uploads.length);assert.equal(gpu.info.memory.geometries,0);
 source.dispose();material.dispose();
});
