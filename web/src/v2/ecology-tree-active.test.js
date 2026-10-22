import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync,inflateSync} from "node:zlib";
import * as THREE from "three";
import {WorldEcology,treeLodMayContribute,attachEcologyWind,treeBatchKey,TREE_NEEDLES} from "./ecology.js";
import {createWorldData,decodeHeightBytes} from "./world-data.js";
import {SunShadowCasters} from "./sun-shadow-casters.js";
const root=new URL("../../public/",import.meta.url);
const flatWorld=()=>({entities:[],objects:{},landcoverAt:()=>({r:1,g:0,b:0,a:1}),surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})}});
function batch(eco,mode,records,part=0){
 const geometry=new THREE.BoxGeometry(1.5,18,1.5);geometry.translate(0,9,0);
 const material=attachEcologyWind(new THREE.MeshStandardMaterial(),eco.uniforms,mode,false,true);
 const depth=attachEcologyWind(new THREE.MeshDepthMaterial(),eco.uniforms,mode,false,true);
 const template=new THREE.InstancedMesh(geometry,material,1600);template.count=0;template.customDepthMaterial=depth;
 eco.nearParts.push({mode,variant:0,mesh:template});eco.materials.push(material);
 const mesh=new THREE.InstancedMesh(geometry,material,64);mesh.count=0;mesh.visible=false;mesh.castShadow=true;mesh.customDepthMaterial=depth;eco.nearGroup.add(mesh);
 const b={mesh,mode,variant:0,partIndex:part,records,ids:records.map(r=>r.id).join("|"),chunk:treeBatchKey(records[0].x,records[0].z),activeRecords:[],activeIndex:new Map()};
 eco.nearTreeBatches.set(mode+":"+part,b);return b;
}
test("CPU tree gate retains every shader-contributing root across float32 and LOD boundaries",()=>{
 const gpuDistance=(r,v)=>{const x=Math.fround(Math.fround(r.x)-Math.fround(v.x)),z=Math.fround(Math.fround(r.z)-Math.fround(v.z));return Math.fround(Math.sqrt(Math.fround(Math.fround(x*x)+Math.fround(z*z))));};
 for(const x of [-40000,-3610.7306412417684,-96,0,32768])for(const z of [-4806.406590328362,0,32768]){
  const viewer={x,z};
  for(const edge of [9,15,42,62,235])for(const offset of [-.01,-.001,-.0001,0,.0001,.001,.01]){
   const r={x:x+(edge+offset)*.6,z:z+(edge+offset)*.8},d=gpuDistance(r,viewer);
   for(const mode of [1,5,12]){
    const shaderVisible=mode===12?d<15:mode===5?d>9&&d<62:d>42&&d<235,cpu=treeLodMayContribute(mode,r,viewer);
    if(shaderVisible)assert.equal(cpu,true,`${mode} discarded contributing GPU distance ${d}`);
    if(mode===12?d>15.001:mode===5?d<8.999||d>62.001:d<41.999||d>235.001)assert.equal(cpu,false);
   }
  }
 }
 assert.throws(()=>treeLodMayContribute(0,{x:0,z:0},{x:0,z:0}),RangeError);
});
test("active prefixes keep all residents, update sub-metre crossings once and share main/shadow/reflection submission",()=>{
 const eco=new WorldEcology(flatWorld()),records=[-96,-103,-114].map((x,i)=>({id:"test:"+i,x,y:100,z:-96,s:1,rot:0,variant:0}));
 const near=batch(eco,5,records),mid=batch(eco,1,records,1),cam=new THREE.PerspectiveCamera(60,1,.1,1000);cam.position.set(-154,101.7,-96);cam.lookAt(-96,108,-96);cam.updateMatrixWorld(true);
 eco.uniforms.uWorldViewer.value.copy(cam.position);eco.syncActiveTrees(cam);
 const residents=records.slice(),buffers=[near.mesh.instanceMatrix.array,mid.mesh.instanceMatrix.array];
 const verify=()=>{
  for(const b of[near,mid]){
   const expected=records.filter(r=>treeLodMayContribute(b.mode,r,cam.position)).map(r=>r.id).sort();
   assert.deepEqual(b.activeRecords.map(r=>r.id).sort(),expected);assert.equal(b.mesh.count,expected.length);assert.equal(b.mesh.visible,expected.length>0);
   assert.strictEqual(b.records,records);assert.deepEqual(records,residents);
   for(let i=0;i<b.activeRecords.length;i++){const r=b.activeRecords[i];assert.equal(b.activeIndex.get(r.id),i);assert.equal(b.mesh.instanceMatrix.array[i*16+12],r.x);assert.equal(b.mesh.instanceMatrix.array[i*16+14],r.z);}
   assert.equal(b.mesh.boundingBox.isEmpty(),expected.length===0);
  }
 };
 verify();assert.equal(near.mesh.count,3);assert.equal(mid.mesh.count,2);
 const versions=[near.mesh.instanceMatrix.version,mid.mesh.instanceMatrix.version],revision=eco.treeBatchRevision;
 assert.equal(eco.syncActiveTrees(cam),false);cam.position.y+=1;assert.equal(eco.syncActiveTrees(cam),false);
 cam.position.x-=.001;assert.equal(eco.syncActiveTrees(cam),false);
 assert.deepEqual([near.mesh.instanceMatrix.version,mid.mesh.instanceMatrix.version],versions);assert.equal(eco.treeBatchRevision,revision);
 const scene=new THREE.Scene();scene.add(eco.group);const light=new THREE.DirectionalLight();
 light.position.set(-100,250,-96);light.target.position.set(-100,100,-96);light.shadow.camera.left=-300;light.shadow.camera.right=300;light.shadow.camera.top=300;light.shadow.camera.bottom=-300;light.shadow.camera.far=500;scene.add(light,light.target);
 const tracker=new SunShadowCasters(scene,[light]);tracker.update(cam);assert.equal(tracker.update(cam).changed[0],false);
 cam.position.x=-158.002;eco.syncActiveTrees(cam);verify();assert.equal(near.mesh.count,2);assert.equal(tracker.update(cam).changed[0],true);
 // All active matrices and viewer uniforms are shared; a mirrored camera only
 // changes visibility testing, never replaces the main viewer used for the LOD.
 eco.uniforms.uWorldViewer.value.copy(cam.position);
 const color={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader},depth={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
 near.mesh.material.onBeforeCompile(color);near.mesh.customDepthMaterial.onBeforeCompile(depth);
 assert.strictEqual(color.uniforms.uWorldViewer,depth.uniforms.uWorldViewer);assert.equal(color.uniforms.uWorldViewer.value.x,cam.position.x);
 const reflected=cam.clone();reflected.position.y=200-cam.position.y;reflected.lookAt(-100,109,-96);reflected.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(reflected.projectionMatrix,reflected.matrixWorldInverse));
 scene.updateMatrixWorld(true);assert.equal(near.mesh.intersectsFrustum(frustum),true);assert.equal(color.uniforms.uWorldViewer.value.y,cam.position.y);
 // Cross the INNER mid threshold without waiting for the 12 m resident rebuild.
 cam.position.x=-138.002;eco.syncActiveTrees(cam);verify();assert.equal(mid.mesh.count,1);
 cam.position.x=-137.998;eco.syncActiveTrees(cam);verify();assert.equal(mid.mesh.count,0);assert.equal(mid.mesh.visible,false);
 cam.position.x=-138.002;eco.syncActiveTrees(cam);verify();assert.equal(mid.mesh.count,1);
 // Empty buffers do not make an empty bound permanent; the same resources re-enter.
 cam.position.x=-349.002;eco.syncActiveTrees(cam);verify();assert.equal(mid.mesh.count,0);assert.equal(near.mesh.count,0);assert.equal(tracker.update(cam).counts[0],0);
 cam.position.x=-330.998;eco.syncActiveTrees(cam);verify();assert.ok(mid.mesh.count>0);assert.equal(tracker.update(cam).changed[0],true);
 cam.position.x=-154;eco.syncActiveTrees(cam);verify();assert.strictEqual(near.mesh.instanceMatrix.array,buffers[0]);assert.strictEqual(mid.mesh.instanceMatrix.array,buffers[1]);
 assert.equal(eco.stats.treeHighResidentInstances,3);assert.equal(eco.stats.treeMidResidentInstances,3);
 assert.equal(eco.stats.treeHighActiveInstances,3);assert.equal(eco.stats.treeMidActiveInstances,2);
 tracker.dispose();eco.dispose();
});

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


for(const riverMeanders of [false,undefined])test("real river-forest roots preserve all residents and source ownership: "+(riverMeanders===false?"original drainage":"default designed bend"),t=>{
 const json=n=>JSON.parse(readFileSync(new URL(n,root))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
 const meta=json("data/scene.json"),w=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
  coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:bin("data/detail.bin.gz"),
  coreLandcover:png(readFileSync(new URL("data/core_landcover.png",root))),farLandcover:png(readFileSync(new URL("data/far_landcover.png",root))),riverMeanders});
 const point=w.hydrology.viewpoints.find(p=>p.id==="river-forest"),eco=new WorldEcology(w,{forestLayout:"v14"}),camera={position:new THREE.Vector3(point.x,w.surface.heightAt(point.x,point.z)+1.8,point.z)};
 // Synthetic boxes stand in only for GPU resources; every root/exclusion comes
 // from the real DEM, landcover, objects, tracks, hydrology and treeAt function.
 for(const mode of[5,1,12])for(let variant=0;variant<5;variant++)for(let part=0;part<3;part++){
  const geometry=new THREE.BoxGeometry(1,18,1),material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1600);
  mesh.count=0;mesh.customDepthMaterial=new THREE.MeshDepthMaterial();eco.nearParts.push({mode,variant,mesh});eco.materials.push(material);
 }
 eco.rebuildNearTrees(camera);
 const resident=[...eco.nearTreeBatches.values()].flatMap(b=>b.records.map(r=>b.partIndex+":"+r.id)).sort(),counts=eco.stats;
 // A separate wider source-cell enumeration is the resident oracle. Habitat
 // exclusions may change with a physical river bend; active batching may never
 // drop any root that the current world actually contains.
 const roots=[];
 for(let iz=Math.floor((point.z-320)/12);iz<=Math.ceil((point.z+320)/12);iz++)for(let ix=Math.floor((point.x-320)/12);ix<=Math.ceil((point.x+320)/12);ix++){
  const r=eco.treeAt(ix,iz);if(r&&Math.hypot(r.x-point.x,r.z-point.z)<252)roots.push(r);
 }
 const residentsFor=mode=>roots.filter(r=>{const d=Math.hypot(r.x-point.x,r.z-point.z);return mode===12?d<TREE_NEEDLES.prefetch:mode===5?d<82:d>24;});
 const expected=eco.nearParts.flatMap((part,i)=>residentsFor(part.mode).filter(r=>r.variant===part.variant).map(r=>i+":"+r.id)).sort();
 assert.deepEqual(resident,expected,"every current-world source root survives resident batching");
 for(const mode of [5,1,12]){
  const residents=residentsFor(mode),active=residents.filter(r=>treeLodMayContribute(mode,r,camera.position));
  const got=[...eco.nearTreeBatches.values()].filter(b=>b.mode===mode).flatMap(b=>b.activeRecords.map(r=>r.id)).sort();
  assert.deepEqual(got,active.flatMap(r=>[r.id,r.id,r.id]).sort());
 }
 const highIDs=new Set([...eco.nearTreeBatches.values()].filter(b=>b.mode===5).flatMap(b=>b.activeRecords.map(r=>r.id)));
 const needleIDs=new Set([...eco.nearTreeBatches.values()].filter(b=>b.mode===12).flatMap(b=>b.activeRecords.map(r=>r.id)));
 if(riverMeanders===false){
  assert.equal(w.hydrology.stats.meanders.reason,"disabled");
  assert.equal(counts.treeHighResidentInstances,128*3);assert.equal(counts.treeHighActiveInstances,77*3);
  assert.equal(counts.treeMidResidentInstances,1148*3);assert.equal(counts.treeMidActiveInstances,966*3);
  assert.equal(new Set([...highIDs,...needleIDs]).size,79,"same 79 original high-range roots remain represented");
  assert.deepEqual([...needleIDs].sort(),["spruce:-301:399","spruce:-301:400","spruce:-301:401","spruce:-302:400"]);assert.equal(counts.needleTreeRoots,15);
 }else assert.ok(w.hydrology.stats.meanders.nodes>0,"exercise the default new footprint");
 assert.equal(counts.treeNeedleActiveInstances,needleIDs.size*3);
 t.diagnostic("needle roots="+needleIDs.size+", high roots="+highIDs.size+", prefetch roots="+counts.needleTreeRoots);
 for(const b of eco.nearTreeBatches.values()){
  assert.equal(b.mesh.count,b.records.filter(r=>treeLodMayContribute(b.mode,r,camera.position)).length);
  for(const r of b.records)assert.equal(b.chunk,treeBatchKey(r.x,r.z));
 }
 const before=[...eco.nearTreeBatches.values()].map(b=>b.mesh.instanceMatrix.version),revision=eco.treeBatchRevision;
 eco.syncActiveTrees(camera);assert.deepEqual([...eco.nearTreeBatches.values()].map(b=>b.mesh.instanceMatrix.version),before);assert.equal(eco.treeBatchRevision,revision);
 camera.position.x+=.25;eco.syncActiveTrees(camera);
 assert.deepEqual([...eco.nearTreeBatches.values()].flatMap(b=>b.records.map(r=>b.partIndex+":"+r.id)).sort(),resident);
 eco.windField.update(1,camera.position);eco.treeRootWind.update(eco.nearTreeBatches,eco.windField,1,eco.treeBatchRevision);
 const groups=new Map();
 for(const b of eco.nearTreeBatches.values()){
  const key=b.mode+":"+b.variant+":"+b.chunk;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);
 }
 let expectedUploads=0,expectedBytes=0;
 for(const parts of groups.values()){
  assert.equal(parts.length,3);
  for(const part of parts){assert.strictEqual(part.mesh.geometry.attributes.aTreeRootWind.data,parts[0].mesh.geometry.attributes.aTreeRootWind.data);assert.deepEqual(part.activeRecords.map(r=>r.id),parts[0].activeRecords.map(r=>r.id));}
  if(parts[0].activeRecords.length){expectedUploads++;expectedBytes+=parts[0].activeRecords.length*20;}
 }
 assert.equal(eco.treeRootWind.stats.batches,expectedUploads);assert.equal(eco.treeRootWind.stats.bytes,expectedBytes);
 assert.equal(eco.treeRootWind.stats.partInstances,eco.stats.treeActiveInstances);
 t.diagnostic("actual forest: unchanged roots; "+expectedUploads+" shared force buffers / "+expectedBytes+" upload bytes instead of "+(expectedUploads*3)+" / "+(expectedBytes*3));
 const origin=camera.position.x;
 for(const [step,offset]of [.001,12.1,96.1,-96.1,0].entries()){
  camera.position.x=origin+offset;
  // Keep the original prefetch rebuild and stable cell coordinates; exercise
  // both sub-metre active swaps and full negative-world chunk retirement.
  if(Math.abs(offset)>.01||offset===0)eco.rebuildNearTrees(camera);else eco.syncActiveTrees(camera);
  eco.treeRootWind.update(eco.nearTreeBatches,eco.windField,2+step,eco.treeBatchRevision);
  const liveGroups=new Map();
  for(const b of eco.nearTreeBatches.values()){
   const data=b.mesh.geometry.attributes.aTreeRootWind.data;
   if(!liveGroups.has(data))liveGroups.set(data,[]);liveGroups.get(data).push(b);
  }
  for(const parts of liveGroups.values()){
   assert.equal(parts.length,3);
   assert.equal(parts[0].mesh.geometry.userData.treeWindAllocation.references,3);
   for(const b of parts)assert.deepEqual(b.activeRecords.map(r=>r.id),parts[0].activeRecords.map(r=>r.id));
  }
  assert.equal(eco.treeRootWind.allocations.size,liveGroups.size);
  assert.equal(eco.treeRootWind.stats.bytes*3,eco.stats.treeActiveInstances*20);
 }
 eco.dispose();assert.equal(eco.treeRootWind.allocations.size,0);
});
