import fs from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {encodeLodgeDoorPackage,decodeLodgeDoorPackage,lodgeSHA} from '../web/src/v2/lodge-door-codec.js';
const prefix=process.argv.includes('--tables')?'lodge-tables':process.argv.includes('--chairs')?'lodge-chairs':process.argv.includes('--furniture')?'lodge-furniture':'lodge-whole';
const root=new URL('../',import.meta.url),states=await Promise.all([0,1,2].map(i=>import('../web/src/v2/'+prefix+'-data/'+i+'.js').then(m=>m.default)));
const bases={local:states[0].local,cross:states[0].cross};
const raw=await encodeLodgeDoorPackage(states,bases,{reuseIdentical:true}),packed=gzipSync(raw),restored=await decodeLodgeDoorPackage(gunzipSync(packed),bases);
for(let i=0;i<3;i++)assert.equal(JSON.stringify(restored[i]),JSON.stringify(states[i]),'Exact original whole field including Float16/RLE strings '+i);
async function save(raw,gz,url){fs.writeFileSync(new URL('web/public/'+url,root),gz);return {version:1,url,rawBytes:raw.length,gzipBytes:gz.length,rawSHA256:await lodgeSHA(raw),sha256:await lodgeSHA(gz)};}
const baseRaw=Buffer.from(JSON.stringify(states[0])),baseGz=gzipSync(baseRaw);
assert.equal(gunzipSync(baseGz).toString(),JSON.stringify(states[0]));
const delivery={base:await save(baseRaw,baseGz,'data/v2/'+prefix+'-base-38.json.gz'),delta:await save(raw,packed,'data/v2/'+prefix+'-gi-38.xor.gz')};
fs.writeFileSync(new URL('web/src/v2/'+prefix+'-package.json',root),JSON.stringify(delivery,null,2)+'\n');
const original=states.reduce((n,s)=>n+gzipSync(JSON.stringify(s)).length,0),report={...delivery,exactStateObjects:3,originalGzipBytes:original,totalGzipBytes:baseGz.length+packed.length,reduction:1-(baseGz.length+packed.length)/original,probes:states[0].local.sky.size,validProbes:states[0].local.sky.validProbes,model:'complete closed whole-building source plus lossless Float16 XOR of actual three poses; no source data discarded'};
fs.writeFileSync(new URL('tools/reports/'+prefix+'-package-v38.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
