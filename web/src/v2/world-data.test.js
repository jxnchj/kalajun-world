import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {inflateSync,gzipSync} from "node:zlib";
import {coordinateFrame,chunkAt,decodeGzipBytes,decodeHeightBytes,makeRaster,sampleRaster,stableEntityId,createEntities,createWorldData} from "./world-data.js";
const ROOT=new URL("../../public/",import.meta.url);
const json=async name=>JSON.parse(await readFile(new URL(name,ROOT),"utf8"));
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e, a+" != "+b);
// Test-side PNG decoding uses only node:zlib; production uses browser image decoding.
// The actual legacy images are 8-bit non-interlaced RGB. Reconstruct every PNG filter.
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
let actualPromise;
function actual(){
  if(!actualPromise)actualPromise=(async()=>{
    const [meta,objects,detailMeta,manifest,cb,fb,db,cl,fl]=await Promise.all([
      json("data/scene.json"),json("data/objects.json"),json("data/detail.json"),json("world-v2/manifest.json"),
      readFile(new URL("data/core_height.bin.gz",ROOT)),readFile(new URL("data/far_height.bin.gz",ROOT)),readFile(new URL("data/detail.bin.gz",ROOT)),
      readFile(new URL("data/core_landcover.png",ROOT)),readFile(new URL("data/far_landcover.png",ROOT))]);
    const [c,f,detailBytes]=await Promise.all([decodeGzipBytes(cb),decodeGzipBytes(fb),decodeGzipBytes(db)]);
    const input={meta,objects,detailMeta,manifest,coreHeights:decodeHeightBytes(c,meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(f,meta.far.n,meta.height_scale),detailBytes,coreLandcover:png(cl),farLandcover:png(fl)};
    return{input,world:createWorldData(input),rawCore:c};
  })();
  return actualPromise;
}
test("east/south local axes round-trip UTM and negative chunks",()=>{
  const frame=coordinateFrame([597060,4756230]);
  assert.deepEqual(frame.toUTM(10,20),{e:597070,n:4756210});
  assert.deepEqual(frame.fromUTM(597070,4756210),{x:10,z:20});
  assert.deepEqual(frame.fromUTM(...Object.values(frame.toUTM(-103.25,328.5))),{x:-103.25,z:328.5});
  assert.equal(chunkAt(-.01,256).id,"-1,1");assert.equal(chunkAt(256,255.99).id,"1,0");
  assert.throws(()=>frame.toUTM(NaN,0),/finite/);
});
test("pixel-centred north-first bilinear raster and edge clamping",()=>{
  const r=makeRaster(new Float32Array([10,20,30,40]),{n:2,res:10});
  near(sampleRaster(r,-5,-5),10);near(sampleRaster(r,5,-5),20);near(sampleRaster(r,-5,5),30);
  near(sampleRaster(r,0,0),25);near(sampleRaster(r,-100,-100),10);near(sampleRaster(r,100,100),40);
});
test("little-endian decoding honours byte offsets and either gzip delivery mode",async()=>{
  const bytes=new Uint8Array([99,0x34,0x12,0x78,0x56,0x9a,0xbc,0xde,0xf0,99]).subarray(1,9);
  assert.deepEqual([...decodeHeightBytes(bytes,2,1)],[0x1234,0x5678,0xbc9a,0xf0de]);
  assert.deepEqual(await decodeGzipBytes(gzipSync(bytes)),bytes);
  assert.equal(await decodeGzipBytes(bytes),bytes);
  assert.throws(()=>decodeHeightBytes(bytes,3),/byte count/);
});
test("IDs ignore array order, disambiguate shared coordinates, reject indistinguishable duplicates",()=>{
  const assets={swing:{}},a={x:12,z:34,rot:0,src:"one"},b={x:12,z:34,rot:1,src:"two"};
  const one=createEntities({swings:[a,b]},assets),two=createEntities({swings:[b,a]},assets);
  assert.deepEqual(one.map(x=>x.id),two.map(x=>x.id));assert.notEqual(stableEntityId("swings",a),stableEntityId("swings",b));
  assert.throws(()=>createEntities({swings:[a,{...a}]},assets),/Ambiguous duplicate/);
});
test("actual data decodes to declared dimensions and preserves source attribution",async()=>{
  const {input,world,rawCore}=await actual();
  assert.equal(input.coreHeights.length,2048*2048);assert.equal(input.farHeights.length,1024*1024);
  assert.equal(input.detailBytes.length,input.detailMeta.size**2*4);assert.equal(input.coreLandcover.data.length,2048*2048*4);
  const first=new DataView(rawCore.buffer,rawCore.byteOffset).getUint16(0,true)*input.meta.height_scale;
  near(input.coreHeights[0],first,0.0005);
  assert.equal(world.entities.length,["guesthouses","cabins","yurts","barns","hay","swings"].reduce((n,k)=>n+input.objects[k].length,0));
  assert.equal(world.entities.length,364);
  assert.ok(Object.isFrozen(world.objects));assert.ok(Object.isFrozen(world.objects.guesthouses[0]));
  assert.throws(()=>{world.objects.guesthouses[0].x=0;},TypeError);
  assert.equal(world.manifest.acceptance.allStreams,"not validated");
});
test("actual core/far boundary is continuous on all four sides and has no presentation exaggeration",async()=>{
  const {world,input}=await actual(),half=input.meta.core.size/2,eps=.001;
  for(const p of [[half,0],[-half,0],[0,half],[0,-half],[half,half]]){
    for(const axis of [0,1]){const a=[...p],b=[...p];a[axis]-=eps;b[axis]+=eps;near(world.surface.geographicHeightAt(...a),world.surface.geographicHeightAt(...b),.05);}
  }
  const far=makeRaster(input.farHeights,input.meta.far);
  for(const p of [[22000,18000],[-31000,24000]])near(world.surface.geographicHeightAt(...p),sampleRaster(far,...p),.001);
});
test("actual derived placement and poses survive reversing every source group",async()=>{
  const {world,input}=await actual();
  const reversed=Object.fromEntries(Object.entries(input.objects).map(([k,v])=>[k,Array.isArray(v)?[...v].reverse():v]));
  const other=createWorldData({...input,objects:reversed});
  assert.deepEqual(world.entities.map(e=>[e.id,world.surface.buildingPose(e)]),other.entities.map(e=>[e.id,other.surface.buildingPose(e)]));
  assert.deepEqual(input.objects,world.objects);
});
test("actual geographic/physical surfaces, normals and landcover remain finite",async()=>{
  const {world}=await actual();
  for(let z=-40960;z<=40960;z+=4096)for(let x=-40960;x<=40960;x+=4096){
    assert.ok(Number.isFinite(world.surface.heightAt(x,z)));const n=world.surface.normalAt(x,z);near(Math.hypot(n.x,n.y,n.z),1);
    assert.ok(n.y>0);const lc=world.landcoverAt(x,z);Object.values(lc).forEach(v=>assert.ok(v>=0&&v<=1));near(lc.a,1);
  }
  for(const e of world.entities){const pose=world.surface.buildingPose(e);Object.values(pose).filter(v=>typeof v==="number").forEach(v=>assert.ok(Number.isFinite(v)));assert.equal(e.chunkId,chunkAt(e.x,e.z).id);}
});
test("all migrated pads cut below floors, never raise terrain, and release continuously",async()=>{
  const {world}=await actual();assert.ok(world.surface.pads.length>250);let cut=0;
  for(const p of world.surface.pads){
    const c=Math.cos(p.rot),s=Math.sin(p.rot),x=p.x+p.cx*c+p.cz*s,z=p.z-p.cx*s+p.cz*c;
    const raw=world.surface.geographicHeightAt(x,z)+world.surface.detailAt(x,z),h=world.surface.heightAt(x,z);
    assert.ok(h<=raw+1e-7);assert.ok(h<=p.floor+1e-7);if(raw-h>.05)cut++;
    const width=p.bank?6:.5,dist=p.hx+width;
    const boundary={x:p.x+(p.cx+dist)*c+p.cz*s,z:p.z-(p.cx+dist)*s+p.cz*c};
    near(world.surface.heightAt(boundary.x-c*.001,boundary.z+s*.001),world.surface.heightAt(boundary.x+c*.001,boundary.z-s*.001),.05);
  }
  assert.ok(cut>100);
});
test("detail height is continuous at the authored raster edges",async()=>{
  const {world,input}=await actual(),d=input.detailMeta,x=d.origin[0]+.5,z=d.origin[1]+d.size/2;
  near(world.surface.detailAt(x-.001,z),world.surface.detailAt(x+.001,z),1e-5);
});

test("zero-weight fast paths exactly match the original blend at every core boundary",async()=>{
 const {world,input}=await actual(),half=input.meta.core.size/2;
 const core=makeRaster(input.coreHeights,input.meta.core),far=makeRaster(input.farHeights,input.meta.far);
 const coreLC=makeRaster(input.coreLandcover.data,{n:input.coreLandcover.width,res:input.meta.core.size/input.coreLandcover.width,channels:4});
 const farLC=makeRaster(input.farLandcover.data,{n:input.farLandcover.width,res:input.meta.far.size/input.farLandcover.width,channels:4});
 const clamp=(v)=>Math.max(0,Math.min(1,v)),points=[];
 for(const inward of [-1000,-.001,0,.001,1,300,599.999,600,600.001,1000]){
   for(const along of [-half,-half+300,0,half-300,half])for(const sign of [-1,1]){
     points.push([sign*(half-inward),along],[along,sign*(half-inward)]);
   }
 }
 points.push([0,0],[1200,-3400],[-35000,30000],[40960,-40960]);
 for(const [x,z]of points){
   const t=clamp(Math.min(half-Math.abs(x),half-Math.abs(z))/600),w=t*t*(3-2*t);
   const oldHeight=sampleRaster(far,x,z)*(1-w)+sampleRaster(core,x,z)*w;
   assert.equal(world.surface.geographicHeightAt(x,z),oldHeight,`height at ${x}, ${z}`);
   const oldCover=Object.fromEntries(["r","g","b","a"].map((k,i)=>[k,clamp((sampleRaster(coreLC,x,z,i)*w+sampleRaster(farLC,x,z,i)*(1-w))/255)]));
   assert.deepEqual(world.landcoverAt(x,z),oldCover,`landcover at ${x}, ${z}`);
 }
});

test('every authored wooden-house porch cuts below the platform and all six footings reach actual terrain',async()=>{
 const {world}=await actual();let checked=0;
 for(const e of world.entities.filter(e=>e.assetId==='house_a')){
  const q=world.surface.buildingPose(e),c=Math.cos(q.rot),s=Math.sin(q.rot);
  assert.ok(world.surface.pads.some(p=>p.id===e.id+':porch'));
  for(const x of [-3.08,0,3.08])for(const z of [2.98,4.28]){
   const wx=q.x+c*x*q.scale.x+s*z*q.scale.z,wz=q.z-s*x*q.scale.x+c*z*q.scale.z;
   const ground=(world.surface.heightAt(wx,wz)-q.y)/q.scale.y;
   assert.ok(ground<=-.35+1e-7,JSON.stringify({id:e.id,ground}));
   assert.ok(ground>=-1.6,JSON.stringify({id:e.id,ground,reason:'floating porch footing'}));checked++;
  }
 }
 assert.equal(checked,113*6);
});


test("shared actual RGBA sampling exactly preserves scalar landcover at core/far blend seams and arbitrary coordinates",async()=>{
 const {input,world}=await actual(),old=createWorldData({...input,landcoverSampling:"scalar"}),half=input.meta.core.size/2;
 const points=[];
 for(let i=0;i<12000;i++)points.push([Math.sin(i*1.415)*41000,Math.cos(i*2.198)*41000]);
 for(const sign of [-1,1])for(const inset of [-1e-6,0,1e-6,299.125,599.999999,600,600.000001])for(let t=-half;t<=half;t+=211.71){
  points.push([sign*(half-inset),t],[t,sign*(half-inset)]);
 }
 for(const p of points)assert.deepEqual(world.landcoverAt(...p),old.landcoverAt(...p));
});
