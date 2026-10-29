import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WorldTerrain} from '../web/src/v2/terrain.js';
import {getMeadowLandform} from '../web/src/v2/meadow-surface.js';
import {writeFileSync,readFileSync} from 'node:fs';
import {inflateSync,gunzipSync} from 'node:zlib';
import {Color,Vector2,Vector3} from '../web/node_modules/three/build/three.module.js';
import {createWorldData,decodeHeightBytes} from '../web/src/v2/world-data.js';
import {SettlementRuntime} from '../web/src/v2/settlements.js';
import {sunPosition,sunDirection,beijingTime} from '../web/src/sun.js';
const publicRoot=new URL('../web/public/',import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,publicRoot))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,publicRoot)))),meta=json('data/scene.json');
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

const lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
const world=createWorldData({meta,objects:json('data/objects.json'),detailMeta:json('data/detail.json'),manifest:json('world-v2/manifest.json'),streamData:json('data/streams.json'),coreHeights:decodeHeightBytes(bin('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:bin('data/detail.bin.gz'),coreLandcover:png(readFileSync(new URL("data/core_landcover.png",publicRoot))),farLandcover:png(readFileSync(new URL("data/far_landcover.png",publicRoot)))});

// Bounded lossless transport feasibility only; no runtime/cache policy changes.
const {gzipSync}=await import('node:zlib');
const {createTerrainRowKernel}=await import('../web/src/v2/terrain-row-kernel.js');
const kernel=createTerrainRowKernel(world),rows=[];
const names={normal:'normals',color:'colors',terrainCover:'cover',terrainHydrology:'hydrology',terrainShoreDistance:'shoreDistance',terrainLandform:'landform',terrainCommunity:'community'};
for(const point of [[-3611.851,4805.483],[-1556.157,3427.47]]){
 let x=Math.floor(point[0]/10240)*10240,z=Math.floor(point[1]/10240)*10240,size=10240,parent=null;
 for(let depth=0;depth<=11;depth++){
  const start=performance.now(),payload=kernel.build({x,z,size,depth,parent});const computeMs=performance.now()-start;
  const arrays=Object.values(payload).filter(ArrayBuffer.isView),raw=Buffer.concat(arrays.map(a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength)));
  const shuffled=[];
  for(const a of arrays){const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),out=Buffer.alloc(b.length),stride=a.BYTES_PER_ELEMENT;
   for(let byte=0;byte<stride;byte++)for(let i=0;i<a.length;i++)out[byte*a.length+i]=b[i*stride+byte];
   shuffled.push(out);
  }
  const packed=Buffer.concat(shuffled),gzip=gzipSync(raw),shuffledGzip=gzipSync(packed);const unpacked=gunzipSync(shuffledGzip);let offset=0;
  for(const a of arrays){const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),stride=a.BYTES_PER_ELEMENT;for(let byte=0;byte<stride;byte++)for(let i=0;i<a.length;i++)assert.equal(unpacked[offset+byte*a.length+i],b[i*stride+byte]);offset+=b.length;}
  rows.push({point,depth,x,z,size,computeMs,raw:raw.length,gzip:gzip.length,byteShuffleGzip:shuffledGzip.length});
  parent={x,z,size,heights:payload.heights,centers:payload.centers,attributes:Object.fromEntries(Object.entries(names).map(([k,v])=>[k,payload[v]]))};size/=2;x+=point[0]>=x+size?size:0;z+=point[1]>=z+size?size:0;
 }
}
kernel.dispose();const result={scope:'24 authoritative row payloads, byte-exact roundtrip; not full-route transport or cold-load proof',rows};writeFileSync(new URL('./reports/terrain-prepared42-feasibility.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
