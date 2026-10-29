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
const entityId='cabins:-3967,2822.3:eec01b1433084d64',runtime=new SettlementRuntime(world),room=runtime.pastoralPoses.find(r=>r.id===entityId),p=room.pose;
const terrain=Object.create(WorldTerrain.prototype);terrain._color=new Color();terrain._landformValue=new Vector2();terrain.landform=getMeadowLandform(world);
const vertices=[],colors=[],triangles=[],local=(x,y,z)=>[(Math.cos(p.rot)*(x-p.x)-Math.sin(p.rot)*(z-p.z))/p.scale.x,(y-p.y)/p.scale.y,(Math.sin(p.rot)*(x-p.x)+Math.cos(p.rot)*(z-p.z))/p.scale.z];
for(const [radius,step,hole] of [[256,4,0],[4096,32,256]]){
 const n=radius*2/step,start=vertices.length;
 for(let z=-radius;z<=radius;z+=step)for(let x=-radius;x<=radius;x+=step){const wx=p.x+x,wz=p.z+z,h=world.surface.heightAt(wx,wz),normal=world.surface.normalAt(wx,wz),lc=world.landcoverAt(wx,wz);vertices.push(local(wx,h,wz));colors.push(terrain._surfaceColor(wx,wz,h,normal.y,lc).toArray());}
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){const cx=-radius+(x+.5)*step,cz=-radius+(z+.5)*step;if(hole&&Math.abs(cx)<hole&&Math.abs(cz)<hole)continue;const a=start+z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;triangles.push([a,c,b],[b,c,d]);}
}
const paths=['web/public/data/core_height.bin.gz','web/public/data/far_height.bin.gz','web/public/data/detail.bin.gz','web/public/data/objects.json','web/public/data/core_landcover.png','web/public/data/far_landcover.png','web/public/data/scene.json','web/public/data/detail.json','web/public/data/streams.json','web/public/world-v2/manifest.json','web/src/v2/world-data.js','web/src/v2/terrain-height-interpolation.js','web/src/v2/hydrology.js','web/src/v2/forest-reach39.js','web/src/v2/forest-reach39-source.js','web/src/v2/forest-reach-form41.js','web/src/v2/reach-bank-profile48.js','web/src/v2/reach-bank-design50.js','web/src/v2/forest-reach-form41-legacy.js','web/src/v2/forest-bank-curvature-v38.js','web/src/v2/river-section.js','web/src/v2/river-meander.js','web/src/v2/river-bed-profile.js','web/src/v2/river-incision.js','web/src/v2/settlement-assets.js','web/src/v2/terrain.js','web/src/v2/terrain-material.js','web/src/v2/meadow-surface.js','web/src/v2/meadow-relief.js'];
const sources=paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex')}));
writeFileSync(new URL(process.argv[2]||'../tools/reports/room-exterior-terrain-v38.json',import.meta.url),JSON.stringify({entityId,roomKey:room.asset.bounceField,pose:p,sources,vertices,colors,triangles,limits:'GI-only 4m near/32m far height geometry; source WorldTerrain low-frequency vertex albedo, not GPU detail textures or moisture/canopy modulation; outer extent 4096m each axis'}));runtime.dispose();console.log(JSON.stringify({entityId,vertices:vertices.length,triangles:triangles.length}));
