import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {inflateSync} from "node:zlib";
import {createWorldData,decodeHeightBytes,decodeGzipBytes} from "./world-data.js";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {WorldPasture,selectPasture,pastureGroundAllowed,PASTURE_SHEEP_COUNT} from "./pasture.js";
import {SETTLEMENT_ASSETS} from "./settlement-assets.js";
const fixture=()=>({assetBase:"./assets/",entities:[{id:SETTLEMENT_ASSETS.yurt.representativeId,x:0,z:0,scale:{x:1,z:1}}],objects:{},landcoverAt:()=>({r:0,g:0,b:0}),surface:{heightAt:(x,z)=>100+.1*x+.04*z,normalAt:()=>{const v=new THREE.Vector3(-.1,1,-.04).normalize();return{x:v.x,y:v.y,z:v.z};}},hydrology:{sampleAt:()=>({wetness:0,insideWater:false})}});
async function originalAsset(){
 const bytes=await readFile(new URL("../../public/assets/sheep.glb",import.meta.url)),loader=new GLTFLoader();
 // Browser decodes original PNGs. Node has no ImageBitmap; replace only that
 // decode boundary to exercise the real skeleton, clips, UVs and full mesh.
 loader.register(()=>({name:"node-texture-decode",loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
}
async function ready(world=fixture()){const pasture=new WorldPasture(world,{life41:false,loader:{loadAsync:originalAsset}});await pasture.load();return pasture;}
test("pasture layout is deterministic, complete and keeps clear of the historical anchor",()=>{
 const world=fixture(),a=selectPasture(world),b=selectPasture(world);assert.deepEqual(a,b);assert.equal(a.members.length,PASTURE_SHEEP_COUNT);
 assert.ok(Math.hypot(a.x,a.z)>=65-1e-8);for(const m of a.members){assert.ok(pastureGroundAllowed(world,m.x,m.z));for(const n of a.members)if(n!==m)assert.ok(Math.hypot(m.x-n.x,m.z-n.z)>=2.35);}
 assert.ok(pastureGroundAllowed(world,a.viewpoint.x,a.viewpoint.z));assert.equal(a.viewpoint.id,"pasture-sheep");
});
test("placement rejects forest, scree, water, steep slopes, tracks and building footprints",()=>{
 for(const change of [w=>w.landcoverAt=()=>({r:.2,g:0,b:0}),w=>w.landcoverAt=()=>({r:0,g:.4,b:0}),w=>w.hydrology.sampleAt=()=>({insideWater:true}),w=>w.surface.normalAt=()=>({x:.8,y:.6,z:0})]){const world=fixture();change(world);assert.throws(()=>selectPasture(world),/No safe open pasture/);}
 const world=fixture();assert.equal(pastureGroundAllowed(world,0,0),false);world.objects.tracks=[{width:4,pts:[[40,40],[80,40]]}];assert.equal(pastureGroundAllowed(world,60,42),false);assert.equal(pastureGroundAllowed(world,60,45),true);
});
test("original highest-detail mesh is shared by 12 independently rigged sheep without overlapping LODs",async()=>{
 const p=await ready(),first=p.animals[0];assert.equal(p.stats.count,12);assert.equal(p.stats.triangles,48000);assert.equal(p.materials.length,1);assert.equal(p.materials[0].vertexColors,false);assert.ok(p.materials[0].isMeshStandardMaterial);
 for(const a of p.animals){const meshes=[];a.root.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,1);assert.equal(a.mesh.geometry,first.mesh.geometry);assert.equal(a.mesh.material,first.mesh.material);assert.ok(a.mesh.material.normalMap);assert.ok(a.mesh.material.map);assert.ok(a.mesh.castShadow&&a.mesh.receiveShadow);assert.equal(a.mesh.geometry.index.count,12000);if(a!==first){assert.notEqual(a.mesh.skeleton,first.mesh.skeleton);assert.notEqual(a.mesh.skeleton.bones[0],first.mesh.skeleton.bones[0]);}}
 assert.deepEqual(p.stats.states,{lie:2,look:3,graze:7});p.dispose();
});
test("animal roots follow real height and slope; animations advance with distinct phases",async()=>{
 const p=await ready(),a=p.animals[6],before=a.mixer.time,boneBefore=a.mesh.skeleton.bones.map(b=>b.quaternion.toArray());p.update(null,.1);
 assert.ok(a.mixer.time>before);assert.ok(a.mesh.skeleton.bones.some((b,i)=>b.quaternion.toArray().some((v,j)=>Math.abs(v-boneBefore[i][j])>1e-8)));
 for(const a of p.animals){assert.ok(Math.abs(a.root.position.y-p.world.surface.heightAt(a.x,a.z)-.012*a.size)<1e-8);const up=new THREE.Vector3(0,1,0).applyQuaternion(a.root.quaternion);assert.ok(up.distanceTo(new THREE.Vector3(-.1,1,-.04).normalize())<1e-6);}
 assert.notEqual(p.animals[6].actions.get("graze").time,p.animals[7].actions.get("graze").time);p.dispose();
});
test("all original authored clips fit conservative frustum envelope",async()=>{
 const p=await ready(),a=p.animals[0],box=new THREE.Box3(),point=new THREE.Vector3();
 a.root.position.set(0,0,0);a.root.quaternion.identity();a.root.scale.setScalar(1);
 for(const [name,clip] of p.clips){a.mixer.stopAllAction();const act=a.actions.get(name).reset().play();for(let frame=0;frame<8;frame++){act.time=clip.duration*frame/7;a.mixer.update(0);a.root.updateMatrixWorld(true);a.mesh.computeBoundingBox();box.copy(a.mesh.boundingBox);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])assert.ok(point.set(x,y,z).distanceTo(a.mesh.boundingSphere.center)<=a.mesh.boundingSphere.radius,name);}}
 p.dispose();
});
test("long-running graze/walk/lie transitions retain safe ground, count and bounded flock",async()=>{
 const p=await ready(),start=p.animals.map(a=>[a.x,a.z]),states=new Set();
 for(let i=0;i<1200;i++){p.update(null,.1);for(const a of p.animals){states.add(a.state);assert.ok(pastureGroundAllowed(p.world,a.x,a.z));assert.ok(Math.hypot(a.x-p.layout.x,a.z-p.layout.z)<=p.layout.radius+.1);}}
 for(const s of ["walk","graze","look","lie_down","lie","get_up"])assert.ok(states.has(s),s);
 assert.ok(p.animals.some((a,i)=>Math.hypot(a.x-start[i][0],a.z-start[i][1])>.5));assert.equal(p.stats.count,12);assert.equal(p.stats.triangles,48000);p.dispose();
});
test("zero dt does not animate and repeated load shares one promise",async()=>{
 const p=await ready(),time=p.animals[0].mixer.time;assert.equal(p.load(),p.load());p.update(null,0);assert.equal(p.animals[0].mixer.time,time);p.dispose();assert.equal(p.group.children.length,0);assert.equal(p.stats.ready,false);p.dispose();await assert.rejects(p.load(),/disposed/);
});
test("disposal during decode never attaches late animals",async()=>{
 let resolve;const p=new WorldPasture(fixture(),{loader:{loadAsync:()=>new Promise(r=>resolve=r)}}),load=p.load();p.dispose();resolve(await originalAsset());await load;assert.equal(p.group.children.length,0);assert.equal(p.stats.ready,false);
});

// Reuse the project test PNG reconstruction for actual geography, not synthetic placement.
function png(bytes){
  assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
  let width,height,channels;const chunks=[];
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);
    if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===2?3:d[9]===6?4:0;assert.ok(channels);}
    if(type==="IDAT")chunks.push(d);p+=n+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const f=raw[y*(stride+1)];assert.ok(f<=4);
    for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
      const prediction=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c);
      pixels[i]=(raw[y*(stride+1)+1+x]+prediction)&255;
    }
  }
  const data=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++){data[i*4]=pixels[i*channels];data[i*4+1]=pixels[i*channels+1];data[i*4+2]=pixels[i*channels+2];data[i*4+3]=channels===4?pixels[i*channels+3]:255;}
  return{width,height,data};
}

test("real pastoral data supplies a complete safe flock and navigable viewpoint",async()=>{
 const root=new URL("../../public/",import.meta.url),read=name=>readFile(new URL(name,root)),json=async name=>JSON.parse(await read(name));
 const [meta,objects,detailMeta,manifest,cb,fb,db,cl,fl,streamData]=await Promise.all([json("data/scene.json"),json("data/objects.json"),json("data/detail.json"),json("world-v2/manifest.json"),read("data/core_height.bin.gz"),read("data/far_height.bin.gz"),read("data/detail.bin.gz"),read("data/core_landcover.png"),read("data/far_landcover.png"),json("data/streams.json")]);
 const world=createWorldData({meta,objects,detailMeta,manifest,streamData,coreHeights:decodeHeightBytes(await decodeGzipBytes(cb),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(await decodeGzipBytes(fb),meta.far.n,meta.height_scale),detailBytes:await decodeGzipBytes(db),coreLandcover:png(cl),farLandcover:png(fl)});
 const p=await ready(world);assert.ok(Math.abs(p.layout.x+1543.1573191233526)<1e-8);assert.ok(Math.abs(p.layout.z-3424.4748703475375)<1e-8);assert.ok(Math.abs(p.viewpoint.x-p.layout.x-9)<1e-8);assert.ok(Math.abs(p.viewpoint.z-p.layout.z-12)<1e-8);assert.equal(p.viewpoint.pitch,-7);assert.equal(p.stats.count,12);assert.ok(pastureGroundAllowed(world,p.viewpoint.x,p.viewpoint.z));
 const normal=world.surface.normalAt(p.layout.x,p.layout.z);assert.ok(normal.y>=.955);assert.ok(Math.hypot(p.layout.x+3611.9813,p.layout.z-4805.3713)>500);
 for(let i=0;i<300;i++)p.update(null,.1);for(const a of p.animals){assert.ok(pastureGroundAllowed(world,a.x,a.z));assert.ok(Math.abs(a.root.position.y-world.surface.heightAt(a.x,a.z)-.012*a.size)<1e-8);}
 console.log("Actual pasture:",JSON.stringify({center:p.stats.center,viewpoint:p.viewpoint,states:p.stats.states,anchorId:p.stats.anchorId}));p.dispose();
});
