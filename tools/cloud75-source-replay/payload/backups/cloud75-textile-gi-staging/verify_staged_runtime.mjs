// PREPARED / NOT EXECUTED against candidate data. No asset or default writes.
// node --experimental-vm-modules verify_staged_runtime.mjs CONFIG.json
// CONFIG: {receipt: absolute GI receipt, runs:[{out:absolute fresh bake dir,key:family|'all'}]}
// All five distinct families required; first-family can use scope:'first-family'.
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {BoundBytes} from './bound_bytes.mjs';
const bound=new BoundBytes();
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const readJSON=async p=>JSON.parse((await bound.read(p)).toString());
const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const failFallback=()=>{throw Error('Unexpected staging ON fallback');};
const strict64=s=>{assert.equal(typeof s,'string');const b=Buffer.from(s,'base64');assert.equal(b.toString('base64'),s,'Noncanonical/malformed base64');return b;};
const n3=f=>{assert.equal(f.size.length,3);assert.ok(f.size.every(v=>Number.isSafeInteger(v)&&v>0));return f.size.reduce((a,b)=>a*b,1);};
const statistics=values=>{let min=Infinity,max=-Infinity;for(const v of values){assert.ok(Number.isFinite(v));min=Math.min(min,v);max=Math.max(max,v);}return {count:values.length,min,max};};
const config=await readJSON(process.argv[2]);
const receiptPath=await realpath(config.receipt),receipt=await readJSON(receiptPath);
assert.equal(receipt.stage,'gi');assert.equal(receipt.approvedForStaging,true);
const manifestPath=await realpath(receipt.inputs.manifest.path),geometryPath=await realpath(receipt.inputs.geometry.path);
const manifestBytes=await bound.read(manifestPath,receipt.inputs.manifest.sha256),manifest=JSON.parse(manifestBytes);
await bound.read(receipt.inputs.blend.path,receipt.inputs.blend.sha256);
for(const evidence of receipt.evidence)await bound.read(evidence.path,evidence.sha256);
const geometryHash=hash(await bound.read(geometryPath,receipt.inputs.geometry.sha256));assert.equal(geometryHash,manifest.geometrySHA256);
assert.equal(hash(manifestBytes),receipt.inputs.manifest.sha256);assert.equal(geometryHash,receipt.inputs.geometry.sha256);
const derived={kind:'house-textiles62',sourceSHA256:manifest.sourceSHA256,geometrySHA256:geometryHash,manifestSHA256:hash(manifestBytes),nodes:manifest.nodes.map(n=>n.name)};
const families=['house_a','house_a-living-0','house_a-living-1','house_a-living-2','house_a-entry-tea-34'];
assert.ok(config.scope===undefined||config.scope==='first-family');
const expectedFamilies=config.scope==='first-family'?['house_a']:families;
const bundles=new Map(),modules=[];
for(const run of config.runs){
 assert.ok(run.key==='all'||families.includes(run.key));
 const runPath=path.join(run.out,'run.json'),runBytes=await bound.read(runPath),runRecord=JSON.parse(runBytes);
 assert.equal(runRecord.receiptSHA256,hash(await bound.read(receiptPath)));
 const protectedPath=path.join(run.out,'protected-inputs.json');
 assert.ok(Object.hasOwn(runRecord.outputs,'protected-inputs.json'),'Missing protected-input manifest binding');
 const protectedInputs=JSON.parse(await bound.read(protectedPath,runRecord.outputs['protected-inputs.json']));
 for(const [filename,expected]of Object.entries(protectedInputs))await bound.read(filename,expected);
 // Includes root evidence, source/recipe hashes, protected inputs, per-module run hashes,
 // original quality/grid/door ownership and receiver mask, NOT old payload equality.
 const checked=spawnSync('python',[path.join(HERE,'verify.py'),'--receipt',receiptPath,'--out',run.out,'--key',run.key],{cwd:ROOT,encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr+'\n'+checked.stdout);
 await bound.read(runPath,hash(runBytes)); // verifier must have seen this same receipt
 for(const family of run.key==='all'?families:[run.key])for(const suffix of ['', '-30','-60','-90']){
  const name=family+suffix;assert.ok(!bundles.has(name),'Duplicate family module');
  assert.ok(Object.hasOwn(runRecord.outputs,name+'.js'),'Missing run output byte binding');
  const filename=path.join(run.out,name+'.js'),bytes=await bound.read(filename,runRecord.outputs[name+'.js']),text=bytes.toString();
  const match=text.match(/^\/\/[^\n]*\nexport default ([\s\S]*);\s*$/);assert.ok(match,'Unexpected module syntax');
  bundles.set(name,JSON.parse(match[1]));modules.push({name,path:await realpath(filename),sha256:hash(bytes)});
 }
}
same([...bundles.keys()].sort(),expectedFamilies.flatMap(k=>['','-30','-60','-90'].map(s=>k+s)).sort(),'Missing/mixed state modules');
// Execute exact production selector source with only the manifest dependency injected.
// The default production data-loader imports are forbidden; all ON inputs are staged.
const ownerSource=(await bound.read(path.join(ROOT,'web/src/v2/house-textiles-gi73.js'))).toString();
const context=vm.createContext({URLSearchParams});
const owner=new vm.SourceTextModule(ownerSource,{context,identifier:'staged-production-owner',importModuleDynamically:()=>{throw Error('Unexpected production/default dynamic import');}});
await owner.link(spec=>{assert.equal(spec,'../../public/assets/v2/house-textiles62/manifest.json');return new vm.SyntheticModule(['default'],function(){this.setExport('default',manifest);},{context});});
await owner.evaluate();const {selectTextileGI73,validateTextileGI73,textileGI73Enabled}=owner.namespace;
assert.equal(textileGI73Enabled(''),false);assert.equal(textileGI73Enabled('?houseTextiles62=0'),false);assert.equal(textileGI73Enabled('?houseTextiles62=1'),true);
let reads=0;const loaders=Object.fromEntries([...bundles].map(([name,value])=>[name,()=>{reads++;return value;}]));
const fallback={originalOFF:true};assert.equal(await selectTextileGI73('house_a',()=>fallback,{enabled:false,loaders}),fallback);
assert.equal(await selectTextileGI73('yurt',()=>fallback,{enabled:true,loaders}),fallback);assert.equal(reads,0);
await assert.rejects(selectTextileGI73('house_a',failFallback,{enabled:true,loaders:{}}));
const {decodeRoomField}=await import(pathToFileURL(path.join(ROOT,'web/src/v2/room-bounce-field.js')));
const {decodeSolarDirection}=await import(pathToFileURL(path.join(ROOT,'web/src/v2/room-solar-transport.js')));
const {decodeRoomContact}=await import(pathToFileURL(path.join(ROOT,'web/src/v2/room-contact.js')));
const {DataUtils}=await import(pathToFileURL(path.join(ROOT,'web/node_modules/three/build/three.module.js')));
const fileHashes=new Map();
async function checkSource(relative,expected,base=ROOT){
 const filename=await realpath(path.resolve(base,relative));assert.ok(filename.startsWith(ROOT+path.sep),'Source outside repository');
 if(!fileHashes.has(filename))fileHashes.set(filename,hash(await bound.read(filename,expected)));
 assert.equal(fileHashes.get(filename),expected,'Actual source hash differs: '+relative);
}
const decoded=[];let states=0;
for(const family of expectedFamilies)for(const degree of [null,30,60,90]){
 const name=family+(degree===null?'':'-'+degree),bundle=bundles.get(name);
 assert.equal(await selectTextileGI73(family,failFallback,{enabled:true,degree,loaders}),bundle);
 if(degree!==null)same(bundle.degrees,family.includes('entry')?degree:[degree],'Door angle owner');
 const legacy=await selectTextileGI73(family,failFallback,{enabled:true,degree,part:'legacy',loaders});assert.equal(legacy.ROOM_BOUNCE_DATA,bundle.sky);assert.equal(legacy.ROOM_TRANSPORT_DATA,bundle.solar);
 for(const [pose,state]of [['open',bundle],...(bundle.closed?[['closed',bundle.closed]]:[])]){
  states++;assert.equal(state.key,family);same(state.derivedGeometry,derived,'Bundle candidate identity');
  assert.equal(Boolean(state.contact),degree===null&&pose==='open','Contact only original open owner');
  for(const field of ['sky','secondSky','solar','secondSolar','apertures',...(state.contact?['contact']:[])]){
   const f=state[field];same(f.derivedGeometry,derived,'Field candidate identity');
   await checkSource(f.sourceBlend,f.blendSHA256);await checkSource(f.sourceGLB,f.sourceSHA256,path.join(ROOT,'web/public'));
   const row={module:name,pose,field};
   if(field==='sky'||field==='secondSky'){
    const raw=strict64(f.data);assert.equal(raw.length,n3(f)*16*2);
    const values=Array.from(decodeRoomField(f),DataUtils.fromHalfFloat);Object.assign(row,statistics(values));
   }else if(field==='solar'||field==='secondSolar'){
    assert.equal(f.encoding,'zero-run-f16-rgb-sh4-v1');assert.equal(f.zenithIndex,f.azimuths*f.elevations.length);assert.equal(f.directions.length,f.zenithIndex+1);
    row.directions=[];for(let i=0;i<f.directions.length;i++){
     assert.equal(strict64(f.directions[i]).length%2,0);const values=decodeSolarDirection(f,i);assert.equal(values.length,n3(f)*12);row.directions.push(statistics(values));
    }
   }else if(field==='apertures'){
    assert.equal(f.encoding,'u8-opening-slabs');const values=strict64(f.data);assert.equal(values.length,n3(f)*3);Object.assign(row,statistics(values));assert.ok(row.min>=0&&row.max<=255);
    for(let i=f.openings.length*n3(f);i<values.length;i++)assert.equal(values[i],0,'Unused aperture slab');
   }else{
    strict64(f.data);const values=decodeRoomContact(f);assert.equal(values.length,f.size[0]*f.size[1]*2);Object.assign(row,statistics(values));assert.ok(row.min>=0&&row.max<=255);
   }
   decoded.push(row);
  }
 }
 const corrupted=structuredClone(bundle);corrupted.solar.derivedGeometry.geometrySHA256='not-candidate';assert.throws(()=>validateTextileGI73(corrupted));
}
assert.equal(states,expectedFamilies.length*5);assert.equal(modules.length,expectedFamilies.length*4);
await bound.assertUnchanged(); // reject changes during decode/ownership verification
console.log(JSON.stringify({status:'PASS_STAGED_DECODERS_AND_SELECTOR_ONLY',scope:config.scope??'all',derived,receiptSHA256:hash(await bound.read(receiptPath)),ownerSourceSHA256:hash(ownerSource),verifiedSourceHashes:Object.fromEntries(fileHashes),verifiedArtifactBindings:[...bound.files].map(([path,{resolved,sha256}])=>({path,resolved,sha256})),modules,states,decoded,nativeAcceptance:false,missingGates:['Full registry/RoomBounceField/door owner integration with staging loader interception','Actual same-build native ON/OFF camera and pixel review']},null,2));
