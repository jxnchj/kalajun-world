import fs from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {encodeLodgeDoorPackage,decodeLodgeDoorPackage,lodgeSHA} from '../web/src/v2/lodge-door-codec.js';
import local from '../web/src/v2/lodge-room-data.js';import cross from '../web/src/v2/lodge-cross-data.js';
const root=new URL('../',import.meta.url),states=await Promise.all([0,1,2].map(i=>import('../web/src/v2/lodge-door-data/'+i+'.js').then(m=>m.default)));
const raw=await encodeLodgeDoorPackage(states,{local,cross}),packed=gzipSync(raw),restored=await decodeLodgeDoorPackage(gunzipSync(packed),{local,cross});
for(let i=0;i<3;i++)assert.equal(JSON.stringify(restored[i]),JSON.stringify(states[i]),'Exact original module object and all Float16/RLE strings '+i);
const manifest={version:1,url:'data/v2/lodge-door-gi-38.xor.gz',rawBytes:raw.length,gzipBytes:packed.length,rawSHA256:await lodgeSHA(raw),sha256:await lodgeSHA(packed)};
fs.mkdirSync(new URL('web/public/data/v2/',root),{recursive:true});fs.writeFileSync(new URL('web/public/'+manifest.url,root),packed);fs.writeFileSync(new URL('web/src/v2/lodge-door-package.json',root),JSON.stringify(manifest,null,2)+'\n');
const old=JSON.parse(fs.readFileSync(new URL('tools/reports/lodge-door-gi-summary-v38.json',root)));const report={...manifest,exactStateObjects:3,originalGzipBytes:old.totalGzipBytes,reduction:1-packed.length/old.totalGzipBytes,model:'binary XOR of existing Float16 bits against retained original local/cross fields; original baking outputs untouched'};fs.writeFileSync(new URL('tools/reports/lodge-door-package-v38.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
