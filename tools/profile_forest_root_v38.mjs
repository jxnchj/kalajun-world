import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {WorldEcology,cellRandom} from '../web/src/v2/ecology.js';
import {ForestRootLayout} from '../web/src/v2/forest-root-layout.js';
function png(bytes){
 let width,height,channels;const chunks=[];
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===2?3:d[9]===6?4:0;assert.ok(channels);}if(type==="IDAT")chunks.push(d);p+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;pixels[i]=(raw[y*(stride+1)+1+x]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 const data=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++){data[i*4]=pixels[i*channels];data[i*4+1]=pixels[i*channels+1];data[i*4+2]=pixels[i*channels+2];data[i*4+3]=channels===4?pixels[i*channels+3]:255;}return {width,height,data};
}
function actualWorld(riverMeanders,landcoverSampling){
 const base=new URL("../web/public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base))));
 const meta=json("data/scene.json");return createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),riverMeanders,landcoverSampling,coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),detailBytes:bin("data/detail.bin.gz"),coreLandcover:png(readFileSync(new URL("data/core_landcover.png",base))),farLandcover:png(readFileSync(new URL("data/far_landcover.png",base)))});
}


const world=actualWorld(undefined,"rgba"),eco=new WorldEcology(world),p={x:-3611.9813305250705,z:4805.371282289286},wanted=[];
for(let z=Math.floor((p.z-2200)/384);z<=Math.floor((p.z+2200)/384);z++)for(let x=Math.floor((p.x-2200)/384);x<=Math.floor((p.x+2200)/384);x++){
 const d=Math.hypot((x+.5)*384-p.x,(z+.5)*384-p.z);if(d<2480)wanted.push({x,z,d});
}
wanted.sort((a,b)=>a.d-b.d);
const {Session}=await import('node:inspector');const session=new Session();session.connect();
const post=(method,args={})=>new Promise((res,rej)=>session.post(method,args,(e,v)=>e?rej(e):res(v)));
await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:200});await post('Profiler.start');
const f=eco.forestLayout,rows=[],t=performance.now();
for(const tile of wanted.slice(0,134))for(let z=tile.z*32;z<(tile.z+1)*32;z++)for(let x=tile.x*32;x<(tile.x+1)*32;x++)rows.push(f.at(x,z));
const ms=performance.now()-t,{profile}=await post('Profiler.stop');session.disconnect();
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();
profile.samples.forEach((id,i)=>times.set(id,(times.get(id)||0)+profile.timeDeltas[i]));
const top=[...times].map(([id,us])=>({ms:us/1000,name:nodes.get(id).callFrame.functionName,url:nodes.get(id).callFrame.url,line:nodes.get(id).callFrame.lineNumber+1})).sort((a,b)=>b.ms-a.ms).slice(0,35);
const report={scope:'isolated CPU 134 actual forest-creek tiles, no GPU or whole startup',ms,queried:rows.length,trees:rows.filter(Boolean).length,digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),stats:{...f.stats},top};
writeFileSync('tools/reports/forest-root-v38-profile.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));eco.dispose();
