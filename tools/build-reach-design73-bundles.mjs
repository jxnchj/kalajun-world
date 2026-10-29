import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const dir='backups/route-continuity-v73/retained69',report={steps:[],old69Unchanged:[]},sha=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(dir,{recursive:true});
const files=['forest-roots-38.json','forest-roots-38.bin.gz','meadow-roots-38.json','meadow-roots-38.bin.gz','reach-cover.json','reach-cover.json.gz'],before={};
for(const file of files){const p='web/public/data/v2/reach-design69/'+file,bytes=fs.readFileSync(p),saved=path.join(dir,file);if(fs.existsSync(saved))throw Error('Existing backup '+saved);fs.writeFileSync(saved,bytes);before[file]=bytes;}
function run(label,script,args=[]){const log='tools/candidates/reach-design73/'+label+'.log',fd=fs.openSync(log,'w'),start=performance.now();console.log('START '+label);const r=spawnSync(process.execPath,[script,...args],{stdio:['ignore',fd,fd],timeout:300000});fs.closeSync(fd);if(r.status!==0||r.error)throw Error(label+' failed: '+(r.error??r.status)+' '+log);report.steps.push({label,ms:performance.now()-start,log});console.log('PASS '+label);}
try{
 for(const v of [69,73]){run('forest'+v,'tools/build-forest-root-cache-v38.mjs',['--reachDesign'+v+'=bend']);run('meadow'+v,'tools/build-meadow-root-cache-v38.mjs',['--reachDesign'+v+'=bend']);run('cover'+v,'tools/build-reach-design'+v+'.mjs');}
 for(const f of files){const after=fs.readFileSync('web/public/data/v2/reach-design69/'+f);if(f.endsWith('.gz'))assert.deepEqual(after,before[f]);else{const a=JSON.parse(after),b=JSON.parse(before[f]);delete a.code;delete b.code;assert.deepEqual(a,b);}report.old69Unchanged.push({file:f,payloadSame:true,...(f.endsWith('.gz')?{sha256:sha(after)}:{})});}
 report.complete=true;
}catch(e){report.error=String(e.stack);process.exitCode=1;console.error(e);}
fs.writeFileSync('tools/reports/reach-design73-bundles.json',JSON.stringify(report,null,2));
