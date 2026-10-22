import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync,inflateSync} from 'node:zlib';import * as THREE from 'three';
import {CSM} from 'three/addons/csm/CSM.js';
import {WorldEcology,refreshPlantBounds} from './ecology.js';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {createSpruceLoader} from './spruce-loading.js';import {applySpruceVolume} from './spruce-volume.js';
import {configureCSMDepth} from './depth-mode.js';import {selectWaterReflectionPatch,createWaterReflectionCamera} from './water-reflection.js';
import {sunPosition,sunDirection,beijingTime} from '../sun.js';
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



const base=new URL('../../public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base))));
const meta=json('data/scene.json'),world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:png(readFileSync(new URL('data/core_landcover.png',base))),farLandcover:png(readFileSync(new URL('data/far_landcover.png',base)))});
const loader=createSpruceLoader();loader.register(()=>({name:'TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const assets={};for(const lod of['hi','mid']){const b=readFileSync(new URL('assets/v2/schrenk-spruce-'+lod+'.glb',base));assets[lod]=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}applySpruceVolume(assets.hi,assets.mid);
function ecology(size){
 const eco=new WorldEcology(world,{treeBatchSize:size});
 for(const[lod,mode]of[['hi',5],['mid',1]]){assets[lod].scene.updateMatrixWorld(true);assets[lod].scene.traverse(node=>{if(!node.isMesh)return;const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);const material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1600);mesh.customDepthMaterial=new THREE.MeshDepthMaterial();mesh.count=0;eco.nearParts.push({mode,variant:['column','edge','old','pencil','young'].findIndex(n=>node.name.startsWith(n+'_')),mesh});eco.materials.push(material);});}
 return eco;
}
// Fixed round-20 submission benchmark pose: a river edit must not silently move its frustum.
function view(){const point={x:-3611.9813305250705,z:4805.371282289286,above:1.8,pitch:-10,yaw:-30.90412352938094},camera=new THREE.PerspectiveCamera(52,2179/1221,.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.position.set(point.x,world.surface.heightAt(point.x,point.z)+point.above,point.z);camera.rotation.set(point.pitch*Math.PI/180,-point.yaw*Math.PI/180,0,'YXZ');camera.updateMatrixWorld();return camera;}
const rootState=eco=>[...eco.nearTreeBatches.values()].flatMap(b=>b.records.map(r=>[b.partIndex+':'+r.id,r.x,r.y,r.z,r.s,r.rot])).sort((a,b)=>a[0].localeCompare(b[0]));
const activeState=eco=>new Map([...eco.nearTreeBatches.values()].flatMap(b=>b.activeRecords.map((r,slot)=>[b.partIndex+':'+r.id,{root:r,matrix:Array.from(b.mesh.instanceMatrix.array.slice(slot*16,slot*16+16)),wind:Array.from(b.mesh.geometry.attributes.aTreeRootWind.data.array.slice(slot*5,slot*5+5))}])));
const frustum=c=>new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
test('64 m submission blocks preserve every real resident, active transform and root force across moving boundaries',t=>{
 const old=ecology(96),next=ecology(64),camera=view(),origin=camera.position.clone();
 try{for(const [step,offset] of [0,.001,12.1,64.1,-96.1,0].entries()){
  camera.position.copy(origin);camera.position.x+=offset;
  for(const eco of[old,next]){eco.rebuildNearTrees(camera);eco.windField.update(2+step,camera.position);eco.treeRootWind.update(eco.nearTreeBatches,eco.windField,2+step,eco.treeBatchRevision);}
  assert.deepEqual(rootState(next),rootState(old));const a=activeState(old),b=activeState(next);assert.equal(b.size,a.size);for(const[id,state]of a){assert.ok(b.has(id));assert.deepEqual(b.get(id).matrix,state.matrix,id+' complete Float32 root transform');assert.deepEqual(b.get(id).wind,state.wind,id+' force/phase unaffected by batch address');}
  for(const eco of[old,next])for(const batch of eco.nearTreeBatches.values()){const template=eco.nearParts[batch.partIndex].mesh;assert.strictEqual(batch.mesh.geometry.attributes.position,template.geometry.attributes.position);assert.strictEqual(batch.mesh.geometry.index,template.geometry.index);assert.strictEqual(batch.mesh.material,template.material);assert.strictEqual(batch.mesh.customDepthMaterial,template.customDepthMaterial);assert.ok(batch.mesh.count<=batch.mesh.instanceMatrix.count);}
 }t.diagnostic('Real river roots, active matrices, wind and VBO identity match at six positions, including sub-metre and full-block crossings.');}finally{old.dispose();next.dispose();}
});
test('actual main, reflected and three reversed-depth CSM views retain every potentially contributing root',t=>{
 const old=ecology(96),next=ecology(64),camera=view(),scene=new THREE.Scene(),sun=sunPosition(meta.lat,meta.lon,beijingTime('2026-07-25 14:30:00'));
 const csm=new CSM({camera,parent:scene,cascades:3,maxFar:500,mode:'custom',customSplitsCallback:(n,near,far,a)=>a.push(60/far,180/far,1),shadowMapSize:2048,lightDirection:sunDirection(sun.azimuth,sun.elevation,new THREE.Vector3()).negate(),lightNear:1,lightFar:8000,lightMargin:2000});csm.fade=true;configureCSMDepth(csm,camera);csm.update();scene.updateMatrixWorld(true);
 const views=[['main',frustum(camera)],...csm.lights.map((light,i)=>{light.shadow.updateMatrices(light,camera);return['csm'+i,light.shadow.getFrustum()];})],patch=selectWaterReflectionPatch(world.hydrology,camera);assert.ok(patch);const mirror=createWaterReflectionCamera(camera,patch.plane);assert.ok(mirror);views.push(['mirror',frustum(mirror)]);
 try{for(const eco of[old,next]){eco.rebuildNearTrees(camera);eco.group.updateMatrixWorld(true);}assert.deepEqual(rootState(next),rootState(old));const costs={};
 for(const[name,f]of views){costs[name]=[];for(const eco of[old,next]){let calls=0,triangles=0;for(const batch of eco.nearTreeBatches.values()){const m=batch.mesh;if(m.visible&&m.intersectsFrustum(f)){calls++;triangles+=m.count*m.geometry.index.count/3;}
   for(const root of batch.activeRecords){const probe={geometry:m.geometry,userData:{},count:1,matrixWorld:new THREE.Matrix4()},box=refreshPlantBounds(probe,[root],camera.position,Infinity,0).expandByVector(new THREE.Vector3(1.25,.4,1.25));if(f.intersectsBox(box))assert.ok(m.intersectsFrustum(f),name+' must retain '+root.id);}
  }costs[name].push({calls,triangles});}}
 assert.ok(costs.main[1].triangles<costs.main[0].triangles*.85);assert.ok(costs.mirror[1].triangles<costs.mirror[0].triangles*.85);assert.ok(costs.csm0[1].triangles<costs.csm0[0].triangles*.8);t.diagnostic(JSON.stringify({units:'submitted actual high/mid triangles only; CPU/draw-call and GPU timing require browser',costs}));
 }finally{old.dispose();next.dispose();csm.dispose();csm.remove();}
});
