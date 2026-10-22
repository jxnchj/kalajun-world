import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {WorldEcology,cellRandom} from '../web/src/v2/ecology.js';
import {ForestRootLayout} from '../web/src/v2/forest-root-layout.js';
// The protected implementation is imported via data URL: this directory is not an ESM package.
const Old=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../backups/route-continuity-v32/loading/web/src/v2/forest-root-layout.js',import.meta.url))).toString('base64'))).ForestRootLayout;
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

const worlds={old:actualWorld(undefined,"scalar"),new:actualWorld(undefined,"rgba")},ecologies={old:new WorldEcology(worlds.old),new:new WorldEcology(worlds.new)},p={x:-3611.9813305250705,z:4805.371282289286},wanted=[];
for(let z=Math.floor((p.z-2200)/384);z<=Math.floor((p.z+2200)/384);z++)for(let x=Math.floor((p.x-2200)/384);x<=Math.floor((p.x+2200)/384);x++){
 const d=Math.hypot((x+.5)*384-p.x,(z+.5)*384-p.z);if(d<2480)wanted.push({x,z,d});
}
wanted.sort((a,b)=>a.d-b.d);const samples=[];let expected;
for(let round=0;round<6;round++)for(const candidate of round%2?['new','old']:['old','new']){
 const world=worlds[candidate],eco=ecologies[candidate],Klass=candidate==='old'?Old:ForestRootLayout,f=new Klass(world,{originalAt:(x,z)=>eco.originalTreeAt(x,z),excluded:(x,z,pad)=>eco.excluded(x,z,pad),random:cellRandom});
 const rows=[],t=performance.now();
 for(const tile of wanted.slice(0,90))for(let z=tile.z*32;z<(tile.z+1)*32;z++)for(let x=tile.x*32;x<(tile.x+1)*32;x++)rows.push(f.at(x,z));
 const ms=performance.now()-t,digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 if(expected)assert.equal(digest,expected);else expected=digest;
 const record={candidate,round,ms,queried:rows.length,trees:rows.filter(Boolean).length,digest,stats:{...f.stats}};samples.push(record);console.log(JSON.stringify(record));f.dispose();
}
for(const e of Object.values(ecologies))e.dispose();
const mean=mode=>samples.filter(s=>s.candidate===mode).reduce((n,s)=>n+s.ms,0)/6;
const report={scope:'CPU-only source root generation for first 90 forest-creek tile requests; old scalar sampling and priority-last versus shared RGBA and priority-first; not whole startup',sameRecords:true,meanOldMs:mean('old'),meanNewMs:mean('new'),samples};
writeFileSync(new URL('../docs/previews/v2-route-craft-32/loading-root-joint.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
