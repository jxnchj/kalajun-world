import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from 'node:fs';
import {createHash}from 'node:crypto';
import {execFileSync}from 'node:child_process';
const root=new URL('../',import.meta.url),path=new URL('tools/reports/room-exterior-terrain-v38.json',root);
const original=readFileSync(path),before=JSON.parse(original),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const backup=new URL('backups/route-continuity-v38/exterior-rebind-'+hash(before.sources).slice(0,12)+'/',root);mkdirSync(backup,{recursive:true});
const save=(from,name)=>{const to=new URL(name,backup);if(!existsSync(to))copyFileSync(from,to);};
save(path,'room-exterior-terrain-v38-before.json');
const previousReport=new URL('tools/reports/room-exterior-rebind-v38.json',root);
if(existsSync(previousReport))save(previousReport,'prior-rebinding-report.json');
const candidate=new URL('room-exterior-terrain-candidate.json',backup);
execFileSync(process.execPath,[fileURLToPath(new URL('tools/export-room-exterior-terrain-v38.mjs',root)),fileURLToPath(candidate)],{cwd:root,stdio:'inherit'});
const after=JSON.parse(readFileSync(candidate)),proof={};
for(const key of ['entityId','roomKey','pose','vertices','colors','triangles','limits']){
 assert.deepEqual(after[key],before[key],key+' changed: actual re-bake required; current recipe retained');
 proof[key]={before:hash(before[key]),after:hash(after[key]),exactlyEqual:true};
}
const fields=[],updates=[];
for(const name of ['room-exterior-terrain-data.js','room-exterior-aperture-data.js','room-exterior-ground-data.js','room-exterior-ground-bounce-data.js']){
 const file=new URL('web/src/v2/'+name,root);if(!existsSync(file))continue;
 const source=readFileSync(file,'utf8'),data=JSON.parse(source.split('export default ')[1].replace(/;\s*$/,''));
 assert.deepEqual(data.terrainSources,before.sources,'old field must bind compared recipe: '+name);
 save(file,name);const transportHash=hash(data.states);
 data.terrainSources=after.sources;data.terrainRebindingEvidence='tools/reports/room-exterior-rebind-v38.json';
 assert.equal(hash(data.states),transportHash);
 updates.push({file,data});fields.push({name,transportPayloadSHA256:transportHash,transportPayloadUnchanged:true});
}
// Only adopt after the complete exported geometry/albedo and every old field
// have passed. A failing export/comparison leaves existing runtime assets intact.
writeFileSync(path,readFileSync(candidate));
for(const {file,data}of updates)writeFileSync(file,'export default '+JSON.stringify(data)+';\n');
writeFileSync(previousReport,JSON.stringify({
 scope:'Actual re-export equality of every terrain vertex, triangle, low-frequency albedo and target pose. Expanded algorithm/input bindings; existing radiative payloads retained, not claimed as rebaked.',
 beforeSources:before.sources,afterSources:after.sources,proof,fields,previousRecipeBackup:fileURLToPath(new URL('room-exterior-terrain-v38-before.json',backup))
},null,2));
console.log(JSON.stringify({verified:true,fields,vertices:after.vertices.length,triangles:after.triangles.length}));
