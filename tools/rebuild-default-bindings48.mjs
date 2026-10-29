import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=process.cwd(),dir='backups/default-bindings48-20261028',reportPath='tools/reports/default-bindings48-regeneration.json';fs.mkdirSync(dir,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p)),parseGI=p=>JSON.parse(fs.readFileSync(p,'utf8').split('export default ')[1].replace(/;\s*$/,''));
const paths={forest:'web/public/data/v2/forest-roots-38.json',meadow:'web/public/data/v2/meadow-roots-38.json',reach:'web/public/data/v2/reach-cover-prepared42.json',full:'tools/candidates/terrain-prepared42/river-forest.json',priority:'web/public/data/v2/terrain-prepared42/river-forest.json',demand:'web/public/data/v2/terrain-demand42/river-forest.json',recipe:'tools/reports/room-exterior-terrain-v38.json'};
const gi=['terrain','aperture','ground','ground-bounce'].map(n=>'web/src/v2/room-exterior-'+n+'-data.js');
const digestJSON=x=>sha(JSON.stringify(x)),without=(x,keys)=>Object.fromEntries(Object.entries(x).filter(([k])=>!keys.includes(k)));
function fingerprint(k){const x=read(paths[k]);if(k==='full')return digestJSON({version:x.version,inputs:x.inputs,position:x.position,entries:x.entries.map(e=>without(e,['offset'])).sort((a,b)=>a.key.localeCompare(b.key))});if(k==='recipe')return digestJSON(without(x,['sources']));return digestJSON(without(x,['code']));}
const before=Object.fromEntries(Object.keys(paths).map(k=>[k,fingerprint(k)])),giBefore=Object.fromEntries(gi.map(p=>[p,digestJSON(parseGI(p).states)]));
for(const p of [...Object.values(paths),...gi]){const out=path.join(dir,p);fs.mkdirSync(path.dirname(out),{recursive:true});if(fs.existsSync(out))throw Error('Backup already exists '+out);fs.copyFileSync(p,out);}
const report={defaultOptions:{reachBankProfile48:'OFF',treeCrown:'OFF',location:'undefined in fresh generators'},started:new Date().toISOString(),before,giBefore,steps:[],complete:false};const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));save();
function run(name,command,args,check){const start=performance.now(),log='tools/reports/default-bindings48-'+name+'.log',fd=fs.openSync(log,'w');console.log('START '+name);let result;try{result=spawnSync(command,args,{cwd:root,stdio:['ignore',fd,fd],timeout:600000,env:process.env});}finally{fs.closeSync(fd);}if(result.error||result.status!==0)throw Error(name+' failed: '+(result.error||result.status)+'; '+log);const details=check();report.steps.push({name,seconds:(performance.now()-start)/1000,log,...details});save();console.log('PASS '+name+' '+JSON.stringify(details));}
const same=k=>{const after=fingerprint(k);assert.equal(after,before[k],k+' non-binding payload changed');return{payloadSame:true,digest:after};};
try{
run('forest',process.execPath,['tools/build-forest-root-cache-v38.mjs'],()=>same('forest'));
run('meadow',process.execPath,['tools/build-meadow-root-cache-v38.mjs'],()=>same('meadow'));
run('reach',process.execPath,['tools/build-reach-cover-prepared42.mjs'],()=>same('reach'));
run('terrain-full',process.execPath,['tools/build-terrain-prepared42.mjs'],()=>same('full'));
run('terrain-priority',process.execPath,['tools/build-terrain-priority42.mjs'],()=>same('priority'));
run('terrain-demand',process.execPath,['tools/build-terrain-priority42.mjs','all'],()=>same('demand'));
run('exterior-export',process.execPath,['tools/export-room-exterior-terrain-v38.mjs'],()=>same('recipe'));
for(const p of gi){const kind=path.basename(p).replace('room-exterior-','').replace('-data.js',''),script='tools/blender/v2_room_exterior_'+kind.replaceAll('-','_')+'.py';run('gi-'+kind,'tools/.bpy/bin/python',[script,...(kind==='ground-bounce'?['--max-seconds','240']:[])],()=>{const x=parseGI(p),after=digestJSON(x.states);assert.equal(after,giBefore[p],p+' radiative payload changed');assert.deepEqual(x.terrainSources,read(paths.recipe).sources);return{statesSame:true,digest:after};});}
report.complete=true;report.finished=new Date().toISOString();save();console.log('ALL DEFAULT REGENERATIONS PASSED');
}catch(e){report.failure=String(e.stack);save();console.error(e);process.exitCode=1;}
