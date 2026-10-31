import {terrainPreparedCodeBinding42} from '../web/terrain-prepared-binding42.js';
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

// Offline representative route only. Original row builder/LOD, no runtime changes.
const {gzipSync}=await import('node:zlib');const {mkdirSync}=await import('node:fs');const {PerspectiveCamera}=await import('../web/node_modules/three/build/three.module.js');
const directory=new URL('./candidates/terrain-prepared42/',import.meta.url);mkdirSync(directory,{recursive:true});
const entries=[],blocks=[],seen=new Set(),original=WorldTerrain.prototype._finish;let offset=0,rawBytes=0,packMs=0;
WorldTerrain.prototype._finish=function(job){
 if(!job.cached){const n=job.node,key=n.depth+':'+n.x+','+n.z;
  if(!seen.has(key)){seen.add(key);const start=performance.now(),arrays=[],chunks=[];
   for(const [name,a]of Object.entries(job)){if(!ArrayBuffer.isView(a))continue;const input=Buffer.from(a.buffer,a.byteOffset,a.byteLength),out=Buffer.alloc(input.length),stride=a.BYTES_PER_ELEMENT;
    for(let b=0;b<stride;b++)for(let i=0;i<a.length;i++)out[b*a.length+i]=input[i*stride+b];
    arrays.push({name,type:a.constructor.name,length:a.length,bytes:input.length});chunks.push(out);
   }
   const raw=Buffer.concat(chunks),bytes=gzipSync(raw);assert.deepEqual(gunzipSync(bytes),raw);
   const parent=n.parent,hash=createHash('sha256');if(parent){hash.update(Buffer.from(parent.heights.buffer));hash.update(Buffer.from(parent.centers.buffer));for(const name of ['normal','color','terrainCover','terrainHydrology','terrainShoreDistance','terrainLandform','terrainCommunity']){const a=parent.mesh.geometry.attributes[name].array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}}
   entries.push({key,x:n.x,z:n.z,size:n.size,depth:n.depth,parentKey:parent?parent.depth+':'+parent.x+','+parent.z:null,parentHash:parent?hash.digest('hex'):null,row:job.row,min:job.min,max:job.max,offset,length:bytes.length,rawLength:raw.length,sha256:createHash('sha256').update(bytes).digest('hex'),arrays});
   blocks.push(bytes);offset+=bytes.length;rawBytes+=raw.length;packMs+=performance.now()-start;
  }
 }
 return original.call(this,job);
};
const start=performance.now(),terrain=new WorldTerrain(world),camera=new PerspectiveCamera(52,1.6,.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.position.set(-3611.851169467755,2329.157270885741,4805.483400316967);camera.rotation.set(-10*Math.PI/180,29.88794104541604*Math.PI/180,0,'YXZ');camera.updateMatrixWorld();let stable=0,iterations=0;
try{for(;iterations<12000;iterations++){terrain.update(camera,.1);if(!terrain.stats.queuedTiles&&!terrain.stats.morphingGroups){if(++stable===8)break;}else stable=0;}if(stable<8)throw Error('Representative terrain did not settle');
 const result={version:1,candidateOnly:true,code:terrainPreparedCodeBinding42(),inputs:await world.getForestRootInputHashes(),scope:'Offline original row payloads; complete route/cold browser adoption unproven',position:camera.position.toArray(),entries,stats:{iterations,elapsedMs:performance.now()-start,packMs,rawBytes,packedBytes:offset,tiles:entries.length,terrain:{...terrain.stats}}};
 writeFileSync(new URL('river-forest.pack',directory),Buffer.concat(blocks));writeFileSync(new URL('river-forest.json',directory),JSON.stringify(result));console.log(JSON.stringify(result.stats));
}finally{WorldTerrain.prototype._finish=original;terrain.dispose();}
