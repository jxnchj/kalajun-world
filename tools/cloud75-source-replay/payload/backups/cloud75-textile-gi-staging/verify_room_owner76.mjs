// Prepared staged integration; no candidate run until root releases complete GI data.
// node verify_room_owner76.mjs CONFIG.json   (same config as verify_staged_runtime.mjs)
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const families=['house_a','house_a-living-0','house_a-living-1','house_a-living-2','house_a-entry-tea-34'];
const names=families.flatMap(k=>['','-30','-60','-90'].map(s=>k+s));
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
function checkedBytes(bytes,expected,label){assert.equal(hash(bytes),expected,'Artifact changed after verified gate: '+label);return bytes;}
const url=p=>pathToFileURL(p).href;
const source=p=>url(path.join(ROOT,'web/src/v2',p));
function assertNames(map){assert.deepEqual([...map.keys()].sort(),[...names].sort(),'Require all 20 modules / five families; diagnostic subset is not full ownership acceptance');}
if(process.argv[2]==='--self-test'){
 const fixture=Buffer.from('verified fixture');checkedBytes(fixture,hash(fixture),'fixture');assert.throws(()=>checkedBytes(Buffer.from('changed fixture'),hash(fixture),'fixture'),/Artifact changed/);
 const map=new Map(names.map(n=>[n,n]));assertNames(map);map.delete('house_a-30');assert.throws(()=>assertNames(map));
 const {Data3DTexture}=await import(url(path.join(ROOT,'web/node_modules/three/build/three.module.js')));
 const t=new Data3DTexture(new Uint16Array(16),1,1,4);let disposed=0;t.addEventListener('dispose',()=>disposed++);assert.equal(t.isData3DTexture,true);t.dispose();assert.equal(disposed,1);
 console.log(JSON.stringify({status:'pure-preparation-smoke-only',checks:['full-module-set rejects missing state','actual Three Data3DTexture constructor/dispose event','changed loaded bytes reject verified hash'],candidateAcceptance:false,gpuTested:false}));
}else{
 const worker=process.argv[2]==='--worker',configPath=path.resolve(process.argv[worker?3:2]);
 const configBytes=await readFile(configPath),config=JSON.parse(configBytes);assert.equal(config.scope,undefined,'Full owner integration requires all five families');
 if(!worker){
  const prior=spawnSync(process.execPath,['--experimental-vm-modules',path.join(HERE,'verify_staged_runtime.mjs'),configPath],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(prior.status,0,prior.stderr+'\n'+prior.stdout);process.stdout.write(prior.stdout);
  const verified=JSON.parse(prior.stdout);assert.equal(verified.status,'PASS_STAGED_DECODERS_AND_SELECTOR_ONLY');assert.ok(Array.isArray(verified.verifiedArtifactBindings)&&verified.verifiedArtifactBindings.length>0,'Missing full verified artifact bindings');verified.configSHA256=hash(configBytes);
  for(const mode of ['OFF','ON']){const p=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--worker',configPath,mode],{input:JSON.stringify(verified),cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(p.status,0,p.stderr+'\n'+p.stdout);process.stdout.write(p.stdout);}
 }else{
  let evidenceText='';for await(const chunk of process.stdin)evidenceText+=chunk;const verified=JSON.parse(evidenceText);assert.equal(verified.status,'PASS_STAGED_DECODERS_AND_SELECTOR_ONLY');assert.ok(Array.isArray(verified.verifiedArtifactBindings)&&verified.verifiedArtifactBindings.length>0,'Missing full verified artifact bindings');checkedBytes(configBytes,verified.configSHA256,'config');
  const mode=process.argv[4];assert.ok(['ON','OFF'].includes(mode));
  const receiptPath=await realpath(config.receipt),receiptBytes=await readFile(receiptPath),receipt=JSON.parse(receiptBytes);
  checkedBytes(receiptBytes,verified.receiptSHA256,'receipt');
  assert.equal(receipt.stage,'gi');assert.equal(receipt.approvedForStaging,true);
  const manifestPath=await realpath(receipt.inputs.manifest.path),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes);
  const geometryPath=await realpath(receipt.inputs.geometry.path),geometryHash=hash(await readFile(geometryPath));
  assert.equal(hash(manifestBytes),receipt.inputs.manifest.sha256);assert.equal(geometryHash,receipt.inputs.geometry.sha256);assert.equal(geometryHash,manifest.geometrySHA256);
  checkedBytes(manifestBytes,verified.derived.manifestSHA256,'manifest');assert.equal(geometryHash,verified.derived.geometrySHA256);
  const expectedModules=new Map(verified.modules.map(m=>[m.name,m]));assertNames(expectedModules);
  const expectedLoads=new Map([[url(manifestPath),verified.derived.manifestSHA256]]);
  const redirects=new Map(),moduleFiles=new Map(),identities=[];
  for(const run of config.runs){assert.ok(run.key==='all'||families.includes(run.key));for(const family of run.key==='all'?families:[run.key])for(const suffix of ['','-30','-60','-90']){
   const name=family+suffix;assert.ok(!moduleFiles.has(name),'Duplicate module');const p=await realpath(path.join(run.out,name+'.js'));assert.ok(p.startsWith(ROOT+path.sep),'Staged data must stay repo-confined');const expected=expectedModules.get(name);assert.equal(p,expected.path,'Verified module path changed');checkedBytes(await readFile(p),expected.sha256,name);expectedLoads.set(url(p),expected.sha256);moduleFiles.set(name,p);identities.push(expected);redirects.set(source('house-textiles-gi73-data/'+name+'.js'),url(p));
  }}assertNames(moduleFiles);
  redirects.set(url(path.join(ROOT,'web/public/assets/v2/house-textiles62/manifest.json')),url(manifestPath));
  const reads=new Set(),productionSources=new Map();
  globalThis.location={search:'?legacyRoomLazy=1&houseTextiles62='+(mode==='ON'?'1':'0')};
  const hooks=registerHooks({resolve(specifier,context,next){const r=next(specifier,context);if(r.url.includes('/house-textiles-gi73-data/')){assert.equal(mode,'ON','OFF must not load textile GI');assert.ok(redirects.has(r.url),'Unexpected GI module');reads.add(r.url);}return redirects.has(r.url)?{...r,url:redirects.get(r.url)}:r;},load(u,context,next){const r=next(u,context);if(expectedLoads.has(u)){assert.ok(r.source!=null,'Expected actual loaded source bytes');checkedBytes(typeof r.source==='string'?Buffer.from(r.source):r.source,expectedLoads.get(u),u);}if((u.startsWith(source(''))||u.startsWith(url(HERE)))&&r.source!=null)productionSources.set(u,hash(typeof r.source==='string'?Buffer.from(r.source):r.source));return r;}});
  async function stableArtifacts(){for(const [u,expected]of expectedLoads)checkedBytes(await readFile(fileURLToPath(u)),expected,u);checkedBytes(await readFile(receiptPath),verified.receiptSHA256,'receipt');checkedBytes(await readFile(configPath),verified.configSHA256,'config');checkedBytes(await readFile(geometryPath),verified.derived.geometrySHA256,'geometry');for(const binding of verified.verifiedArtifactBindings){assert.equal(await realpath(binding.path),binding.resolved,'Verified artifact target changed');checkedBytes(await readFile(binding.path),binding.sha256,binding.path);}for(const [p,expected]of Object.entries(verified.verifiedSourceHashes))checkedBytes(await readFile(p),expected,p);}
  const {extraOwnerChecks}=await import('./room_owner76_extra_checks.mjs');
  const {legacyRooms}=await import(source('legacy-room-loader.js'));await legacyRooms.prepare('house_a');
  const {ROOM_BOUNCE_DATA}=await import(source('room-bounce-registry.js'));
  if(mode==='OFF'){
   assert.equal(reads.size,0);assert.equal(ROOM_BOUNCE_DATA.house_a.derivedGeometry,undefined);
   const extraOwners=await extraOwnerChecks({mode,reads,geometryHash});await stableArtifacts();console.log(JSON.stringify({mode,status:'passed',extraOwners,scope:'real legacy/household loaders and RoomBounceField OFF for all five families; actual contact instances; unrelated yurt; no staged GI import',receiptSHA256:hash(receiptBytes),gpuTested:false}));
  }else{
   const {prepareHouseholdRoom}=await import(source('household-room-fields.js'));
   const {RoomBounceField,decodeRoomField}=await import(source('room-bounce-field.js'));
   const {RoomDoorTransport}=await import(source('room-door-transport.js'));
   const {RoomDoorAngles}=await import(source('room-door-angles.js'));
   const {Quaternion,Vector3,Color,Matrix3,DataUtils}=await import(url(path.join(ROOT,'web/node_modules/three/build/three.module.js')));
   const lighting={sun:new Vector3(.3,.8,.4).normalize(),color:new Color(1,.8,.6),intensity:3,visibility:1};
   const records=[];
   for(const key of families){
    if(key!=='house_a')await prepareHouseholdRoom(key);
    const base=ROOM_BOUNCE_DATA[key];assert.equal(base.derivedGeometry.geometrySHA256,geometryHash);
    const snapshots=Object.fromEntries(Object.entries(ROOM_BOUNCE_DATA).map(([k,v])=>[k,v]));
    const a=new RoomBounceField(),b=new RoomBounceField();
    for(const f of [a,b]){f.set({sourceAsset:'house_a',bounceField:key},new Quaternion());await f.prepare();f.setLighting(lighting,1);assert.equal(f.key,key);assert.equal(f.uniforms.uRoomBounceField.value.isData3DTexture,true);assert.ok(f.uniforms.uRoomBounceField.value.image.data.length>0);assert.ok(f.doors.fields.has(key));}
    assert.notEqual(a.cache.get(key),b.cache.get(key));assert.notEqual(a.doors.fields.get(key),b.doors.fields.get(key),'Instances must not share mutable closed owner');
    const angle=new RoomDoorAngles();await angle.prepare(key);assert.equal(angle.ready,true);
    const render=degrees=>{angle.setState([{name:'house_a_door0',angle:degrees*Math.PI/180,open:102*Math.PI/180}]);const out=decodeRoomField(base);assert.equal(angle.compose(a.doors,key,out,new Matrix3(),lighting,1,1,1,1,1),true);return out;};
    const lo=render(30),hi=render(60),mid=render(45);
    for(let i=0;i<mid.length;i++)if(i%4!==3){const expected=DataUtils.toHalfFloat((DataUtils.fromHalfFloat(lo[i])+DataUtils.fromHalfFloat(hi[i]))/2);assert.equal(mid[i],expected,'Actual adjacent angle composition differs');assert.ok(Number.isFinite(DataUtils.fromHalfFloat(mid[i])));}
    // All five knots plus two boundary intervals must route through actual children/endpoints.
    for(const d of [0,15,90,96,102])render(d);
    const bad=structuredClone(a.doors.fields.get(key).data);bad.sky.sourceSHA256='changed-source';
    const rejected=new RoomDoorTransport({loaders:{[key]:()=>bad}});await assert.rejects(rejected.prepare(key),/source\/grid differs/);assert.equal(rejected.fields.size,0);rejected.dispose();
    let disposed=0;const tex=a.cache.get(key);tex.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,1);assert.equal(a.cache.size,0);assert.equal(a.doors.fields.size,0);assert.equal(b.key,key);assert.equal(b.cache.get(key).isData3DTexture,true);
    for(const [k,v]of Object.entries(snapshots))assert.equal(ROOM_BOUNCE_DATA[k],v,'Other family registry replaced');
    angle.dispose();assert.equal(angle.tea.children.size,0);assert.equal(angle.pastoral.rooms.size,0);b.dispose();records.push({key,independentInstances:2,angles:[0,15,30,45,60,90,96,102],sourceChangeRejected:true,dispose:true});
   }
   assert.equal(reads.size,20,'All and only candidate modules consumed');
   const extraOwners=await extraOwnerChecks({mode,reads,geometryHash});await stableArtifacts();console.log(JSON.stringify({mode,status:'passed',extraOwners,scope:'real production registry/RoomBounceField/door CPU integration and Three constructors; not GPU/native acceptance',receipt:{path:receiptPath,sha256:hash(receiptBytes)},geometrySHA256:geometryHash,manifestSHA256:hash(manifestBytes),modules:identities,productionSources:[...productionSources].map(([url,sha256])=>({url,sha256})),records,states:25,gpuTested:false,nativeAcceptance:'NOT RUN',missingGates:['Native entity occupancy routing, shader/GPU upload, pixels and performance NOT RUN','Contact per-instance CPU transforms tested here do not establish native world linkage']}));
  }hooks.deregister();
 }
}
