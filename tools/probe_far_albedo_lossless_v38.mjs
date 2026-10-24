// Offline only. No asset publication or runtime imports. Run one candidate at a time:
// node tools/probe_far_albedo_lossless_v38.mjs green [report.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
const mode = process.argv[2] || 'green';
assert(['green', 'green-sub', 'green-up'].includes(mode));
const dir = new URL('../web/public/assets/v2/spruce/far-v14/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('impostor-manifest.json', dir)));
const file = manifest.files.find(f => f.kind === 'albedo');
const originalGzip = readFileSync(new URL(file.url, dir));
const rgba = gunzipSync(originalGzip);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(rgba), file.sha256);
const {width, height, layers} = manifest;
const n = width * height * layers;
assert.equal(rgba.length, n * 4);
const planar = new Uint8Array(n * 4);
for (let i = 0; i < n; i++) {
  const g = rgba[4*i+1];
  planar[i] = g; planar[n+i] = rgba[4*i]-g;
  planar[2*n+i] = rgba[4*i+2]-g; planar[3*n+i] = rgba[4*i+3];
}
const step = mode === 'green-sub' ? 1 : width;
const reset = mode === 'green-sub' ? width : width*height;
const encoded = planar.slice();
if (mode !== 'green') for(let c=0;c<4;c++) for(let i=0;i<n;i++) {
  if (i%reset >= step) encoded[c*n+i] = planar[c*n+i]-planar[c*n+i-step];
}
const packed = gzipSync(encoded, {level:9});
function restore(input) {
  // Inverse prediction in-place is valid: the inflated buffer has no other owners.
  if (mode !== 'green') for(let c=0;c<4;c++) for(let i=0;i<n;i++) {
    if(i%reset >= step) input[c*n+i] += input[c*n+i-step];
  }
  const out = new Uint8Array(n*4);
  for(let i=0;i<n;i++) {
    const g=input[i]; out[4*i]=input[n+i]+g; out[4*i+1]=g;
    out[4*i+2]=input[2*n+i]+g; out[4*i+3]=input[3*n+i];
  }
  return out;
}
assert.equal(Buffer.compare(Buffer.from(restore(gunzipSync(packed))),rgba),0);
const samples=[];
// Alternate baseline/candidate order; one warm-up followed by three observations.
for(let pass=0;pass<4;pass++) {
  let baselineMs, inflateMs, restoreMs;
  const baseline=()=>{const t=performance.now(); const r=gunzipSync(originalGzip); baselineMs=performance.now()-t; assert.equal(sha(r),file.sha256);};
  const candidate=()=>{let t=performance.now();const p=gunzipSync(packed);inflateMs=performance.now()-t;t=performance.now();const r=restore(p);restoreMs=performance.now()-t;assert.equal(sha(r),file.sha256);};
  if(pass%2){candidate();baseline();}else{baseline();candidate();}
  if(pass) samples.push({baselineMs,inflateMs,restoreMs,totalMs:inflateMs+restoreMs});
}
const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[1];
const report={mode,dimensions:[width,height,layers],node:process.version,zlib:process.versions.zlib,originalBytes:originalGzip.length,candidateBytes:packed.length,savedBytes:originalGzip.length-packed.length,savedPercent:100*(1-packed.length/originalGzip.length),rgbaSHA256:file.sha256,candidateSHA256:sha(packed),everyByteExact:true,alphaZeroRGBPreserved:true,baselineMedianMs:median('baselineMs'),inflateMedianMs:median('inflateMs'),restoreMedianMs:median('restoreMs'),candidateMedianMs:median('totalMs'),samples,limits:'Node zlib CPU only, not Chrome DecompressionStream or network/upload/first-frame evidence. Existing runtime and assets untouched. Extra RGBA output allocation: 23592960 bytes.'};
const output=JSON.stringify(report,null,2)+'\n';
if(process.argv[3])writeFileSync(process.argv[3],output);
console.log(output);
