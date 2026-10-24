import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,inflateSync} from 'node:zlib';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {WorldEcology,decodeHabitatMap,cellRandom} from './ecology.js';
import {grassStemFeet,brookGrassIntersectsWater,brookShoulderSuitable,seatBrookShoulderGrass,valleyShoulderSuitable} from './brook-shoulder-grass.js';
import {riverSectionAt,riverBankRise} from './river-section.js';
import {CSM} from 'three/addons/csm/CSM.js';
import {WorldEnvironment} from './environment.js';
import {getShoreStoneField} from './shore-contact.js';
const root=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,root))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root))));
function rgbPNG(name){
 const file=readFileSync(new URL(name,root)),parts=[];let width,height;
 for(let i=8;i<file.length;){const n=file.readUInt32BE(i),tag=file.toString("ascii",i+4,i+8),data=file.subarray(i+8,i+8+n);
  if(tag==="IHDR"){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],2);assert.equal(data[12],0);}
  if(tag==="IDAT")parts.push(data);i+=n+12;
 }
 const packed=inflateSync(Buffer.concat(parts)),stride=width*3,decoded=new Uint8Array(stride*height),data=new Uint8Array(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const f=packed[y*(stride+1)];for(let x=0;x<stride;x++){
  const a=x<3?0:decoded[y*stride+x-3],b=y?decoded[(y-1)*stride+x]:0,c=y&&x>=3?decoded[(y-1)*stride+x-3]:0;
  const prediction=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):f===4?paeth(a,b,c):NaN;assert.ok(Number.isFinite(prediction));
  decoded[y*stride+x]=(packed[y*(stride+1)+x+1]+prediction)&255;
 }}
 for(let i=0;i<width*height;i++){data.set(decoded.subarray(i*3,i*3+3),i*4);data[i*4+3]=255;}
 return{width,height,data};
}
const worlds=new Map();
function actual(riverMeanders){
 if(worlds.has(riverMeanders))return worlds.get(riverMeanders);
 // This file reproduces the earlier brook and straight-valley contracts.
 // Preserve their explicit zero-path fixtures after the curved valley adoption.
 const previousLocation=globalThis.location,params=new URLSearchParams(previousLocation?.search||'');
 for(const key of ['valleyLandform','valleyMeanders','valleySection'])if(!params.has(key))params.set(key,'0');
 globalThis.location={search:'?'+params};
 const meta=json("data/scene.json");
 let world;try{world=createWorldData({meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
  coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
  detailBytes:bin("data/detail.bin.gz"),coreLandcover:rgbPNG("data/core_landcover.png"),farLandcover:rgbPNG("data/far_landcover.png"),riverMeanders});}finally{globalThis.location=previousLocation;}
 worlds.set(riverMeanders,world);return world;
}
function ecology(w){const e=new WorldEcology(w);e.floraLocal=decodeHabitatMap(json("data/vegmap.json"),bin("data/vegmap.bin.gz"));e.floraCore=decodeHabitatMap(json("data/vegcore.json"),bin("data/vegcore.bin.gz"));return e;}

function visibleBankHeight(world,x,z){
 const step=.3125,ox=Math.floor(x/step)*step,oz=Math.floor(z/step)*step,u=(x-ox)/step,v=(z-oz)/step,h=(x,z)=>Math.fround(world.surface.heightAt(x,z));
 const a=h(ox,oz),b=h(ox+step,oz),c=h(ox,oz+step),d=h(ox+step,oz+step),mid=world.surface.heightAt(ox+step*.5,oz+step*.5);
 if(Math.abs((a+d)*.5-mid)<Math.abs((b+c)*.5-mid))return v>=u?a+(d-c)*u+(c-a)*v:a+(b-a)*u+(d-b)*v;
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
test('real brook shoulder restores only previously excluded source roots, with every old grass and flower retained and new geometry grounded above water',t=>{
 const saved=globalThis.location;let w;try{globalThis.location={search:'?brookLandform=1'};w=actual();}finally{globalThis.location=saved;}
 assert.ok(w.hydrology.stats.brookBendBanks.nodes>0);
 // The legacy fixture disables brook expansion on its actual selection world too.
 const legacy={...w,forestShoulderSourceWorld:undefined,hydrology:{...w.hydrology,stats:{...w.hydrology.stats,brookBendBanks:{nodes:0}}}},old=ecology(legacy),fresh=ecology(w),view=w.hydrology.viewpoints.find(v=>v.id==='brook-lanchuan');
 // This snapshot is exactly what main registers before any tile is built.
 assert.equal(fresh.brookWetMaterials.length,3);
 const registeredAtStartup=[...fresh.materials],camera=new THREE.PerspectiveCamera(60,1,.1,5000),scene=new THREE.Scene();
 const env={registered:new Set(),camera,csm:new CSM({camera,parent:scene,cascades:3,maxFar:500}),clouds:{},aerial:{}};
 WorldEnvironment.prototype.register.call(env,registeredAtStartup);
 for(const m of fresh.brookWetMaterials){assert.ok(env.registered.has(m));assert.equal(m.roughness,fresh.grassMaterials[0].roughness);assert.deepEqual(m.color,fresh.grassMaterials[0].color);}
 const feet=grassStemFeet([fresh.grassGeometries[0],fresh.baseGrassGeometry]),field=getShoreStoneField(w);
 const addedRecords=[];const reasons={};let eligible=0,seatable=0,kept=0,added=0,flowers=0,maxVisibleFloat=-Infinity,maxBurial=0,minClearance=Infinity;const left=new Set(),right=new Set();
 for(let iz=Math.floor((view.z-40)/.8);iz<Math.ceil((view.z+40)/.8);iz++)for(let ix=Math.floor((view.x-40)/.8);ix<Math.ceil((view.x+40)/.8);ix++){
  const x=(ix+.15+.7*cellRandom(ix,iz,11))*.8,z=(iz+.15+.7*cellRandom(ix,iz,12))*.8;
  if(old.excluded(x,z,.3)&&brookShoulderSuitable(w,x,z)){eligible++;const r={x,z,y:w.surface.heightAt(x,z)-.035,s:.48,sy:1,rot:0};if(seatBrookShoulderGrass(w,r,feet,fresh.shoreGrassEnvelope,reasons))seatable++;}
  const a=old.grassAt(ix,iz),b=fresh.grassAt(ix,iz);
  if(a){assert.deepEqual(b,a);kept++;}else if(b){
   added++;if(b.brookAsset)addedRecords.push(b);assert.equal(b.brookShoulder,true);assert.equal(old.excluded(x,z,.3),true);assert.equal(fresh.excluded(b.x,b.z,.3,true),false);assert.equal(brookGrassIntersectsWater(w,b,b.brookAsset?.envelope??fresh.shoreGrassEnvelope),false);assert.equal(field.intersects(b,b.brookAsset?.envelope??fresh.shoreGrassEnvelope),false);
   const c=Math.cos(b.rot),s=Math.sin(b.rot),actualFeet=b.brookAsset?.feet??feet.map(([x,z])=>({x:b.x+(c*x+s*z)*b.s,z:b.z+(-s*x+c*z)*b.s,y:b.y}));
   for(const foot of actualFeet){const y=w.surface.heightAt(foot.x,foot.z),q=w.hydrology.sampleAt(foot.x,foot.z,{includeDepth:false});
    maxVisibleFloat=Math.max(maxVisibleFloat,foot.y-visibleBankHeight(w,foot.x,foot.z));assert.ok(foot.y<=visibleBankHeight(w,foot.x,foot.z)+.003);assert.ok(foot.y<=y+.003);assert.equal(q.insideWater,false);maxBurial=Math.max(maxBurial,y-foot.y);if(Number.isFinite(q.surfaceLevel))minClearance=Math.min(minClearance,foot.y-q.surfaceLevel);
   }
   if(b.brookAsset){assert.equal(b.brookAsset.geometries[0].attributes.position.count,fresh.grassGeometries[0].attributes.position.count);assert.equal(b.brookAsset.geometries[2].attributes.position.count,fresh.baseGrassGeometry.attributes.position.count);}
   const q=w.hydrology.sampleAt(b.x,b.z,{includeDepth:false}),line=w.hydrology.segments.find(v=>v.id===q.id),cross=line.flowX*(b.z-line.a.z)-line.flowZ*(b.x-line.a.x);(cross<0?right:left).add(Math.floor(line.a.distance/8));
  }
  const fa=old.flowerChoice(ix*.8,iz*.8,.37),fb=fresh.flowerChoice(ix*.8,iz*.8,.37);assert.deepEqual(fb,fa);if(fa)flowers++;
 }
 t.diagnostic(JSON.stringify({eligible,seatable,reasons,kept,added,retainedPriorShoulder:added-addedRecords.length,perBladeAssets:addedRecords.length,flowers,maxVisibleFloat,maxBurial,minClearance,occupiedReachCellsLeft:left.size,occupiedReachCellsRight:right.size}));
 assert.ok(kept>100&&added>13&&left.size>1&&right.size>1);assert.equal(added-addedRecords.length,13,"all previously validated narrow-base shoulder sources retained");
 const tile={wet:addedRecords,wetMeshes:[]};fresh.addBrookWetMeshes(tile);assert.equal(tile.wetMeshes.length,3);
 tile.wetMeshes.forEach((mesh,i)=>{assert.equal(mesh.geometry.attributes.position.count,addedRecords.reduce((n,r)=>n+r.brookAsset.geometries[i].attributes.position.count,0));assert.ok(mesh.geometry.boundingSphere.radius<150);
  const root=addedRecords[0],source=root.brookAsset.geometries[i],n=source.attributes.normal,c=Math.cos(root.rot),sn=Math.sin(root.rot),sy=root.sy??root.s;
  for(let vi=0;vi<n.count;vi++){const expected=new THREE.Vector3(n.getX(vi)/root.s,n.getY(vi)/sy,n.getZ(vi)/root.s).normalize(),nx=c*expected.x+sn*expected.z,nz=-sn*expected.x+c*expected.z;assert.ok(Math.hypot(mesh.geometry.attributes.normal.getX(vi)-nx,mesh.geometry.attributes.normal.getY(vi)-expected.y,mesh.geometry.attributes.normal.getZ(vi)-nz)<1e-6);}
  for(const name of ['color','uv'])assert.deepEqual(Array.from(mesh.geometry.attributes[name].array.slice(0,source.attributes[name].array.length)),Array.from(source.attributes[name].array));
  for(const material of [mesh.material,mesh.customDepthMaterial]){const template=material.isMeshDepthMaterial?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={vertexShader:template.vertexShader,fragmentShader:template.fragmentShader,uniforms:{}};material.onBeforeCompile(shader,null);assert.ok(shader.vertexShader.includes('vec3 ecoRoot() {return aBrookRoot;}'));assert.ok(shader.vertexShader.includes('transformed=aBrookRoot;'));assert.ok(!shader.vertexShader.includes('ecoBend(position.y,ecoWeights,ecoRoot())'));assert.ok(shader.vertexShader.includes('dot(ecoOffset,ecoOffset)*.55*aBrookDrop'));if(material===mesh.material){assert.ok(material.defines.USE_CSM!==undefined);assert.ok(shader.fragmentShader.includes('uWorldCSMView'));assert.ok(shader.fragmentShader.includes('vMeadowFeatures'));} }
 });
 fresh.disposeBrookWetTile(tile);env.csm.dispose();env.csm.remove();old.dispose();fresh.dispose();
});

for(const landform of [false,true])test('wide valley '+(landform?'with depositional landform':'existing section')+' reuses the actual rendered triangles while all old roots and new physical root IDs stay fixed',async t=>{
 const {WorldTerrain}=await import('./terrain.js'),{createTerrainSurfaceContact}=await import('./terrain-surface-contact.js'),{refreshBrookWetContact}=await import('./brook-wetgrass.js');
 const baseline=actual(true),old=ecology(baseline),saved=globalThis.location;let fresh,w=baseline;
 try{globalThis.location={search:'?riverValleyWet=1'+(landform?'&valleyLandform=1':'')};if(landform)w=actual('valley-landform');fresh=ecology(w);}finally{globalThis.location=saved;}
 if(landform){assert.ok(w.hydrology.stats.valleyDeposits.nodes>0);for(let i=0;i<w.hydrology.lines.length;i++)for(let j=0;j<w.hydrology.lines[i].nodes.length;j++){const a=baseline.hydrology.lines[i].nodes[j],b=w.hydrology.lines[i].nodes[j];for(const k of ['x','z','level'])assert.equal(a[k],b[k]);}assert.deepEqual(w.entities,baseline.entities);
  let roadPoints=0,sections=0;
  for(const routes of [w.objects.tracks||[],w.objects.paths||[],w.objects.boardwalks||[]])for(const route of routes)for(let i=1;i<(route.pts?.length||0);i++){const a=route.pts[i-1],b=route.pts[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5));for(let j=0;j<=count;j++){const x=a[0]+(b[0]-a[0])*j/count,z=a[1]+(b[1]-a[1])*j/count;assert.ok(Math.abs(w.surface.heightAt(x,z)-baseline.surface.heightAt(x,z))<1e-8);roadPoints++;}}
  for(const segment of w.hydrology.segments)if(segment.a.bankShape?.valleyWeight>0||segment.b.bankShape?.valleyWeight>0)for(const t of [0,.5,1])for(const side of [-1,1]){const section=riverSectionAt(segment,t);let previous=-1;for(let k=0;k<=200;k++){const y=riverBankRise(section,side,k/200);assert.ok(y>=previous-1e-8,'bank section remains monotone');previous=y;}sections++;}
  const view=w.hydrology.viewpoints.find(v=>v.id==='river-valley'),anchor=w.hydrology.segments.find(s=>s.id===view.segmentId),section=riverSectionAt(anchor,0),side=Math.sign(-section.fz*(view.x-section.x)+section.fx*(view.z-section.z)),half=side<0?section.left:section.right,oldHalf=side<0?section.legacyLeft:section.legacyRight;
  const p=d=>({x:section.x-section.fz*side*d,z:section.z+section.fx*side*d}),bench=p(half+.6),outer=p(oldHalf+2.1),benchClearance=w.surface.heightAt(bench.x,bench.z)-section.level;
  assert.ok(benchClearance>.06&&benchClearance<.18,'near deposited bench must be genuine raised soil, not the previous 0–1mm water-level lip');
  assert.ok(Math.abs(w.surface.heightAt(outer.x,outer.z)-baseline.surface.heightAt(outer.x,outer.z))<1e-8,'deposit rejoins existing outer ground');
  t.diagnostic(JSON.stringify({roadPoints,monotoneSections:sections,benchClearance,valley:w.hydrology.stats.valleyDeposits}));
 }
 const view=w.hydrology.viewpoints.find(v=>v.id==='river-valley'),added=[],eligibility={candidate:0,excluded:0,infrastructure:0,normal:0,byClearance:{}};let preserved=0,addedMeadow=0,authoredRelocations=0,maxAuthoredMove=0;
 for(let iz=Math.floor((view.z-40)/.8);iz<Math.ceil((view.z+40)/.8);iz++)for(let ix=Math.floor((view.x-40)/.8);ix<Math.ceil((view.x+40)/.8);ix++){
  const x=(ix+.15+.7*cellRandom(ix,iz,11))*.8,z=(iz+.15+.7*cellRandom(ix,iz,12))*.8,q=w.hydrology.sampleAt(x,z,{includeDepth:false});
  if(q.shoreDistance>=.06&&q.shoreDistance<.76){const h=w.surface.heightAt(x,z)-q.surfaceLevel,k=Math.floor(h*20)/20;eligibility.byClearance[k]=(eligibility.byClearance[k]||0)+1;}
  if(valleyShoulderSuitable(w,x,z)){eligibility.candidate++;if(old.excluded(x,z,.3))eligibility.excluded++;if(fresh.excluded(x,z,.3,true))eligibility.infrastructure++;if(w.surface.normalAt(x,z,2).y<.72)eligibility.normal++;}
  const a=old.grassAt(ix,iz),b=fresh.grassAt(ix,iz);if(a){if(landform){assert.ok(b,'authored landform retains every old source');const moved=Math.hypot(b.x-a.x,b.z-a.z);if(moved>1e-8)authoredRelocations++;maxAuthoredMove=Math.max(maxAuthoredMove,moved);for(const k of ['id','s','sy','rot'])assert.equal(b[k],a[k]);assert.ok(Math.hypot(b.x-a.x,b.z-a.z)<9.6);assert.ok(Math.abs(b.y-(w.surface.heightAt(b.x,b.z)-.035))<.001);}else assert.deepEqual(b,a);preserved++;}else if(b){if(b.brookAsset){assert.equal(b.brookAsset.physicalOnly,true);added.push(b);}else{assert.ok(landform);if(baseline.surface.normalAt(x,z,2).y>=.72)t.diagnostic(JSON.stringify({misclassified:b.id,x,z,oldExcluded:old.excluded(x,z,.3),newExcluded:fresh.excluded(x,z,.3),oldQ:baseline.hydrology.sampleAt(x,z,{includeDepth:false}),newQ:w.hydrology.sampleAt(x,z,{includeDepth:false})}));assert.ok(baseline.surface.normalAt(x,z,2).y<.72,'new ordinary meadow follows newly suitable slope, not wrong wet-bank classification');addedMeadow++;}}
 }
 t.diagnostic(JSON.stringify({preserved,added:added.length,addedMeadow,view,enabled:fresh.riverValleyWet,eligibility}));
 assert.ok(preserved>100&&added.length>0,'second physical reach contains new wet habitat and unchanged meadow');
 const terrain=new WorldTerrain(w),patches=new Map();
 for(const r of added)for(const groups of r.brookAsset.seating)for(const group of groups)for(const p of group.points){const x=Math.floor(p.x/20)*20,z=Math.floor(p.z/20)*20,key=x+','+z;if(patches.has(key))continue;const n=terrain._node(x,z,20,12,null),job=terrain._job(n);while(job.row<=32)terrain._buildRow(job);terrain._finish(job);n.mesh.visible=true;patches.set(key,n);}
 const contact=createTerrainSurfaceContact({roots:[...patches.values()]}),tile={wet:added,wetMeshes:[]};fresh.setTerrainSurfaceContact(contact);fresh.addBrookWetMeshes(tile);
 const stable=added.map(r=>({id:r.id,x:r.x,y:r.y,z:r.z,s:r.s,sy:r.sy,rot:r.rot}));
 let result=refreshBrookWetContact(w,tile,contact);assert.equal(result.updated,0,'settled nodes do not rescan all blade feet');
 for(const r of added.filter(r=>r.renderContact.pending)){let minFootWater=Infinity,footInside=0,staticWet=0,maxWetFlex=0,minWetFlex=1;const c=Math.cos(r.rot),sn=Math.sin(r.rot);for(let kind=0;kind<3;kind++){const g=r.brookAsset.geometries[kind],p=g.attributes.position,wind=g.attributes.aPlantWind;for(const seat of r.brookAsset.seating[kind]){let level=seat.level;for(const point of seat.points)level=Math.min(level,contact.sample(point.x,point.z).height-.014);const delta=level-seat.level;for(const point of seat.points){const q=w.hydrology.sampleAt(point.x,point.z,{includeDepth:false});minFootWater=Math.min(minFootWater,level-q.surfaceLevel);footInside+=q.insideWater?1:0;}for(let i=seat.start;i<seat.start+seat.count;i++){const x=r.x+(c*p.getX(i)+sn*p.getZ(i))*r.s,z=r.z+(-sn*p.getX(i)+c*p.getZ(i))*r.s,y=r.y+p.getY(i)*(r.sy??r.s)+delta,q=w.hydrology.sampleAt(x,z,{includeDepth:false});if(q.insideWater&&y<q.surfaceLevel+.006){staticWet++;maxWetFlex=Math.max(maxWetFlex,wind.getX(i));minWetFlex=Math.min(minWetFlex,wind.getX(i));}}}}t.diagnostic(JSON.stringify({contactDiagnostic:r.id,minFootWater,footInside,staticWet,minWetFlex,maxWetFlex}));}
 const pending=added.filter(r=>r.renderContact.pending).length;t.diagnostic(JSON.stringify({oldSourcesPreserved:preserved,authoredRelocations,maxAuthoredMove,additionalWetRoots:added.length,pending,pendingRoots:added.filter(r=>r.renderContact.pending).map(r=>({id:r.id,x:r.x,z:r.z,delta:r.renderContact.minDelta,water:w.hydrology.sampleAt(r.x,r.z,{includeDepth:false})})),actualTerrainPatches:patches.size,view}));
 assert.equal(pending,0,'new assets must fit actual settled broad-bank triangles, not remain hidden');
 for(const n of patches.values()){n.split=true;n.children=[];for(const [dx,dz]of [[0,0],[10,0],[0,10],[10,10]]){const c=terrain._node(n.x+dx,n.z+dz,10,13,n),job=terrain._job(c);while(job.row<=32)terrain._buildRow(job);terrain._finish(job);c.mesh.visible=true;n.children.push(c);}}
 result=refreshBrookWetContact(w,tile,contact);assert.ok(result.updated>0);assert.equal(result.pending,0);
 assert.deepEqual(added.map(r=>({id:r.id,x:r.x,y:r.y,z:r.z,s:r.s,sy:r.sy,rot:r.rot})),stable);
 for(const n of patches.values()){n.split=false;for(const c of n.children)terrain._release(c);n.children=null;}
 result=refreshBrookWetContact(w,tile,contact);assert.ok(result.updated>0);assert.equal(result.pending,0);assert.equal(added.length,stable.length);
 fresh.disposeBrookWetTile(tile);for(const n of patches.values())terrain._release(n);terrain.dispose();old.dispose();fresh.dispose();
});


test('actual browser far wet root remains visible when grounded outside the finite water footprint',async t=>{
 const {WorldTerrain}=await import('./terrain.js'),{createTerrainSurfaceContact}=await import('./terrain-surface-contact.js'),{refreshBrookWetContact}=await import('./brook-wetgrass.js');
 const saved=globalThis.location;let w,fresh;try{globalThis.location={search:'?valleyLandform=1'};w=actual('valley-landform');fresh=ecology(w);}finally{globalThis.location=saved;}
 const r=fresh.grassAt(-176,3615);assert.equal(r.id,'grass:-176:3615');assert.ok(r.brookAsset.physicalOnly);
 const stable={x:r.x,y:r.y,z:r.z,id:r.id},terrain=new WorldTerrain(w),patches=new Map();
 for(const groups of r.brookAsset.seating)for(const g of groups)for(const p of g.points){const x=Math.floor(p.x/20)*20,z=Math.floor(p.z/20)*20,key=x+','+z;if(patches.has(key))continue;const n=terrain._node(x,z,20,12,null),job=terrain._job(n);while(job.row<=32)terrain._buildRow(job);terrain._finish(job);n.mesh.visible=true;patches.set(key,n);}
 const contact=createTerrainSurfaceContact({roots:[...patches.values()]}),tile={wet:[r],wetMeshes:[]};fresh.setTerrainSurfaceContact(contact);fresh.addBrookWetMeshes(tile);
 assert.equal(r.renderContact.pending,false,'supported wet root 78m from camera must not remain hidden');
 let minimumClearance=Infinity;
 for(let k=0;k<3;k++)for(const g of r.brookAsset.seating[k]){const level=g.level+tile.wetMeshes[k].geometry.attributes.aBrookSeat.getX(g.start);for(const p of g.points){const s=contact.sample(p.x,p.z),q=w.hydrology.sampleAt(p.x,p.z,{includeDepth:false});assert.equal(s.spacing,.625);assert.equal(s.morphing,false);assert.equal(q.insideWater,false);assert.ok(level<=s.height+.000001,'each actual rendered foot is supported');minimumClearance=Math.min(minimumClearance,level-q.surfaceLevel);}}
 assert.ok(minimumClearance>0&&minimumClearance<.008,'reproduces browser 3.54mm clearance that old arbitrary 8mm rule rejected');
 assert.deepEqual({x:r.x,y:r.y,z:r.z,id:r.id},stable);assert.deepEqual(refreshBrookWetContact(w,tile,contact),{pending:0,updated:0});
 // An actual root inside the water footprint still cannot be rendered as dry bank grass.
 const first=r.brookAsset.seating[0][0].points[0],inWater={...w,hydrology:{...w.hydrology,sampleAt(x,z,o){const q=w.hydrology.sampleAt(x,z,o);return x===first.x&&z===first.z?{...q,insideWater:true}:q;}}};
 for(const n of patches.values())n.mesh.geometry.attributes.position.needsUpdate=true;
 assert.equal(refreshBrookWetContact(inWater,tile,contact).pending,1);
 for(const n of patches.values())n.mesh.geometry.attributes.position.needsUpdate=true;
 assert.equal(refreshBrookWetContact(w,tile,contact).pending,0);
 t.diagnostic(JSON.stringify({root:r.id,minimumClearance,logicalRootUnchanged:true}));
 fresh.disposeBrookWetTile(tile);for(const n of patches.values())terrain._release(n);terrain.dispose();fresh.dispose();
});
