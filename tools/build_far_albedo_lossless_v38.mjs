// Deterministic, offline publication only; original manifest/assets remain unchanged.
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir=new URL('../web/public/assets/v2/spruce/far-v14/',import.meta.url);
const m=JSON.parse(readFileSync(new URL('impostor-manifest.json',dir)));
const f=m.files.find(f=>f.kind==='albedo'),rgba=gunzipSync(readFileSync(new URL(f.url,dir)));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(rgba),f.sha256);
const n=m.width*m.height*m.layers,planes=new Uint8Array(n*4);
assert.equal(rgba.length,planes.length);
for(let i=0;i<n;i++){const g=rgba[i*4+1];planes[i]=g;planes[n+i]=rgba[i*4]-g;planes[n*2+i]=rgba[i*4+2]-g;planes[n*3+i]=rgba[i*4+3];}
const packed=gzipSync(planes,{level:9});
const url='schrenk-far-albedo.green-planar-v38.gz';
const descriptor={version:38,encoding:'g-rminusg-bminusg-a-planar-v1',captureSHA256:m.sourceSha256,width:m.width,height:m.height,layers:m.layers,rgbaSHA256:f.sha256,url,bytes:packed.length,decodedBytes:planes.length,gzipSHA256:sha(packed),decodedSHA256:sha(planes)};
const {restoreFarAlbedoRGBA}=await import('../web/src/v2/spruce-far-transport.js');
const out=restoreFarAlbedoRGBA(gunzipSync(packed),n);
assert.equal(Buffer.compare(Buffer.from(out),rgba),0);
const description=JSON.stringify(descriptor,null,2)+'\n';
if(!process.argv.includes('--check')){writeFileSync(new URL(url,dir),packed);writeFileSync(new URL('albedo-lossless-v38.json',dir),description);}
assert.deepEqual(readFileSync(new URL(url,dir)),packed);
assert.equal(readFileSync(new URL('albedo-lossless-v38.json',dir),'utf8'),description);
console.log(JSON.stringify({published:!process.argv.includes('--check'),...descriptor}));
