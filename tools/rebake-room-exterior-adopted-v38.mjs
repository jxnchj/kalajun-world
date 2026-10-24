import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash}from'node:crypto';
import {execFileSync}from'node:child_process';
import {fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),load=p=>JSON.parse(fs.readFileSync(root+p,'utf8'));
const recipe='tools/reports/room-exterior-terrain-v38.json',before=load(recipe),key=sha(JSON.stringify(before.sources)).slice(0,12),candidate='backups/route-continuity-v38/exterior-rebind-'+key+'/room-exterior-terrain-candidate.json',next=load(candidate);
for(const s of next.sources)assert.equal(sha(fs.readFileSync(root+s.path)),s.sha256,s.path+' changed since independently exported candidate');
const backup='backups/route-continuity-v38/exterior-full-rebake-'+sha(fs.readFileSync(root+candidate)).slice(0,12)+'/';fs.mkdirSync(root+backup,{recursive:true});
const names=['room-exterior-terrain-data.js','room-exterior-aperture-data.js','room-exterior-ground-data.js','room-exterior-ground-bounce-data.js'];
const fields=names.map(name=>{const path='web/src/v2/'+name,text=fs.readFileSync(root+path,'utf8'),data=JSON.parse(text.split('export default ')[1].replace(/;\s*$/,''));assert.deepEqual(data.terrainSources,before.sources);if(!fs.existsSync(root+backup+name))fs.writeFileSync(root+backup+name,text);return{name,oldPayloadSHA256:sha(JSON.stringify(data.states))};});
if(!fs.existsSync(root+backup+'recipe-before.json'))fs.copyFileSync(root+recipe,root+backup+'recipe-before.json');
fs.copyFileSync(root+candidate,root+backup+'recipe-adopted.json');fs.copyFileSync(root+candidate,root+recipe);
const started=performance.now(),steps=[];
for(const [script,args]of [['v2_room_exterior_terrain.py',[]],['v2_room_exterior_aperture.py',[]],['v2_room_exterior_ground.py',[]],['v2_room_exterior_ground_bounce.py',['--max-seconds','240']]]){
 const at=performance.now(),log=root+'tools/reports/adopted-'+script.replace('.py','.log'),fd=fs.openSync(log,'w');
 try{execFileSync(root+'tools/.bpy/bin/python',[root+'tools/blender/'+script,...args],{cwd:root,stdio:['ignore',fd,fd],timeout:300000});}finally{fs.closeSync(fd);}
 steps.push({script,seconds:(performance.now()-at)/1000});console.log(JSON.stringify(steps.at(-1)));
}
for(const f of fields){const text=fs.readFileSync(root+'web/src/v2/'+f.name,'utf8'),data=JSON.parse(text.split('export default ')[1].replace(/;\s*$/,''));assert.deepEqual(data.terrainSources,next.sources);assert.deepEqual(data.pose,next.pose);f.newPayloadSHA256=sha(JSON.stringify(data.states));f.payloadSameAfterFullRecompute=f.oldPayloadSHA256===f.newPayloadSHA256;}
for(const s of next.sources)assert.equal(sha(fs.readFileSync(root+s.path)),s.sha256,'source changed during bake '+s.path);
const report={operation:'full four-family radiative recomputation from freshly exported current terrain sources; no hash-only rebind',seconds:(performance.now()-started)/1000,backup,recipeSHA256:sha(fs.readFileSync(root+recipe)),steps,fields};fs.writeFileSync(root+'tools/reports/room-exterior-adopted-rebake-v38.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
