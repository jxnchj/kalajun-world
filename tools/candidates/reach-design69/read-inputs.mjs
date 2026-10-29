import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync,inflateSync} from 'node:zlib';import {decodeHeightBytes} from '../../../web/src/v2/world-data.js';
function png(bytes){
 let width,height,channels;const chunks=[];
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);if(type==="IHDR"){width=d.readUInt32BE(0);height=d.readUInt32BE(4);assert.equal(d[8],8);assert.equal(d[12],0);channels=d[9]===2?3:d[9]===6?4:0;assert.ok(channels);}if(type==="IDAT")chunks.push(d);p+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;pixels[i]=(raw[y*(stride+1)+1+x]+(f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}}
 const data=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++){data[i*4]=pixels[i*channels];data[i*4+1]=pixels[i*channels+1];data[i*4+2]=pixels[i*channels+2];data[i*4+3]=channels===4?pixels[i*channels+3]:255;}return {width,height,data};
}
export function readReach69Inputs(reachDesign69=null){
 const base=new URL('../../../web/public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,base))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,base)))),meta=json('data/scene.json');
 return {reachDesign69,meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:png(readFileSync(new URL('data/core_landcover.png',base))),farLandcover:png(readFileSync(new URL('data/far_landcover.png',base)))};
}
