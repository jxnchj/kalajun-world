import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import * as THREE from "three";
import {riverSectionAt,riverCrossPoint,riverSectionDepth} from "./river-section.js";
import {selectWaterReflectionPatch} from "./water-reflection.js";
import {createHydrology,riverLineId} from "./hydrology.js";
import {createWorldData,createEntities,decodeHeightBytes} from "./world-data.js";
import {WorldWater,createWaterGeometry,createWaterMaterial,createRiverPhaseData,RIVER_PHASE_SPEED,createShoreStones,createShoreRockGeometry,createShoreRockMaterial,createRiverGravel,RIVER_GRAVEL} from "./water.js";
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,a+" != "+b);
const lines={lines:[Array.from({length:51},(_,i)=>[i*4,0,2])]};
const raw=(x,z)=>100-x*.06+Math.abs(z)*.05;
function simple(source=lines,height=raw,extra={}){
  const h=createHydrology({streamData:source,heightAt:height,...extra});
  const world={hydrology:h,surface:{heightAt:(x,z)=>h.bedHeightAt(x,z),uncarvedHeightAt:height}};
  h.bindSurface(world.surface.heightAt);return world;
}
test("channel positions and profile IDs are stable when line order changes",()=>{
  const a=[[0,0,2],[4,0,2],[8,0,2]],b=[[100,10,1],[104,10,1],[108,10,1]];
  const one=simple({lines:[a,b]}),two=simple({lines:[b,a]});
  assert.deepEqual(one.hydrology.segments.map(s=>[s.id,s.a.level,s.b.level]),two.hydrology.segments.map(s=>[s.id,s.a.level,s.b.level]));
  assert.notEqual(riverLineId(a),riverLineId(b));
  assert.throws(()=>simple({lines:[a,a]}),/Duplicate/);
});
test("cut-only river bed, bank release and downstream profile share the same coordinates",()=>{
  const w=simple(),h=w.hydrology;
  for(let x=8;x<180;x+=8){
    const q=h.sampleAt(x,0);assert.ok(q.insideWater);assert.ok(q.depth>.2);near(q.waterLevel-w.surface.heightAt(x,0),q.depth);
    assert.equal(q.flowX,1);assert.equal(q.flowZ,0);
    assert.ok(w.surface.heightAt(x,0)<raw(x,0));assert.equal(h.isExcluded(x,0),true);
    const edge=1+.75+2*.38;near(w.surface.heightAt(x,edge),raw(x,edge));
    near(w.surface.heightAt(x,edge-.0001),w.surface.heightAt(x,edge+.0001),.001);
    for(let z=-5;z<=5;z+=.25)assert.ok(w.surface.heightAt(x,z)<=raw(x,z));
  }
  for(const s of h.segments)assert.ok(s.b.level<=s.a.level);
  assert.equal(h.sampleAt(20,20).waterLevel,null);assert.equal(h.sampleAt(20,20).wetness,0);
});
test("inverse-slope cuts and protected roads/buildings are explicitly unresolved",()=>{
  const source={lines:[Array.from({length:80},(_,i)=>[i*4,0,2])]};
  const terrain=(x,z)=>100-x*.01+12*Math.exp(-(((x-100)/14)**2));
  const e={id:"house",assetId:"house",x:220,z:0,rot:0,scale:{x:1,z:1}};
  const w=simple(source,terrain,{entities:[e],assetMetadata:{house:{pad:{cx:0,cz:0,hx:5,hz:5}}},objects:{tracks:[{width:4,pts:[[180,-30],[180,30]]}]}});
  assert.ok(w.hydrology.stats.reasons["excessive-cut"]>0);
  assert.ok(w.hydrology.stats.reasons["protected-road"]>0);
  assert.ok(w.hydrology.stats.reasons["protected-building"]>0);
  near(w.surface.heightAt(220,0),terrain(220,0));near(w.surface.heightAt(180,0),terrain(180,0));
});
test("mask-only samples skip final physical height and conservative bounds support width filtering",()=>{
  const w=simple();let reads=0;w.hydrology.bindSurface((x,z)=>{reads++;return w.surface.heightAt(x,z);});
  const cheap=w.hydrology.sampleAt(20,0,{includeDepth:false});assert.equal(reads,0);assert.equal(cheap.wetness,1);
  w.hydrology.sampleAt(20,0);assert.equal(reads,1);
  assert.ok(w.hydrology.intersectsBounds({minX:0,maxX:100,minZ:-5,maxZ:5},{minWidth:1}));
  assert.equal(w.hydrology.intersectsBounds({minX:0,maxX:100,minZ:-5,maxZ:5},{minWidth:3}),false);
  assert.equal(w.hydrology.intersectsBounds({minX:300,maxX:1000,minZ:300,maxZ:1000}),false);
});
test("near and overview water have upward finite normals and coincident bank positions",()=>{
  const w=simple(),a=createWaterGeometry(w.hydrology.segments),b=createWaterGeometry(w.hydrology.segments,{detail:true});
  for(const g of [a,b]){
    const n=g.attributes.normal.array;for(let i=0;i<n.length;i+=3){assert.ok(Number.isFinite(n[i]));assert.ok(n[i+1]>.95);}
    assert.ok(g.boundingSphere.radius>0);for(const x of g.attributes.position.array)assert.ok(Number.isFinite(x));
  }
  near(a.attributes.position.getY(0),b.attributes.position.getY(0));near(a.attributes.position.getZ(0),b.attributes.position.getZ(0));
  assert.ok(b.index.count>a.index.count);a.dispose();b.dispose();
});
test("PBR water shader keeps standard lighting and uses environment reflection without transmission pass",()=>{
  const uniforms={uWaterTime:{value:1},uWaterViewer:{value:new THREE.Vector3()},uWaterNearCoverage:{value:900}},m=createWaterMaterial(uniforms);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};m.onBeforeCompile(shader);
  assert.ok(m.isMeshStandardMaterial);assert.equal(m.transmission,0);assert.ok(shader.fragmentShader.includes("#include <lights_fragment_begin>"));
  assert.ok(shader.fragmentShader.includes("viewMatrix*vec4(-gradient.x"));assert.ok(!shader.fragmentShader.includes("normalize(vec3(-gradient"));
  assert.ok(shader.fragmentShader.includes("max(vec3(0.0),riverSpecular)*riverEdge)/max(.0001,riverCoverage)"));
  assert.ok(shader.fragmentShader.includes("fwidth(riverPhase)")); // Subpixel waves must not shimmer into a striped far surface.
  assert.ok(shader.fragmentShader.includes("sqrt(riverUnresolved)*1.8")); // Preserve unresolved slope energy as roughness.
  assert.ok(shader.fragmentShader.indexOf("fwidth(riverPhase)")<shader.fragmentShader.indexOf("discard;"));
  assert.ok(shader.fragmentShader.indexOf("fwidth(packetCoord)")<shader.fragmentShader.indexOf("discard;"));
  assert.ok(shader.fragmentShader.includes("float along=vRiverPhase.x;"));
  assert.ok(shader.fragmentShader.includes("float drift=along-uWaterTime*"+RIVER_PHASE_SPEED));
  assert.ok(!shader.fragmentShader.includes("dot(vRiverWorld.xz,vRiverFlow)"));
  assert.ok(!shader.fragmentShader.includes("uWaterTime*riverSpeed"));
  assert.equal(shader.uniforms.uWaterTime,uniforms.uWaterTime);m.dispose();
});
test("water incrementally builds stable nearby chunks and disposes owned resources",async()=>{
  const w=simple(),water=new WorldWater(w);await water.load();
  const camera=new THREE.PerspectiveCamera();camera.position.set(60,98,8);
  for(let i=0;i<20;i++)water.update(camera,.016);
  assert.equal(water.stats.pending,0);assert.ok(water.stats.waterChunks>0);assert.ok(water.stats.overviewTriangles>0);
  const first=water.active.keys().next().value,item=water.active.get(first);water.update(camera,.016);assert.equal(water.active.get(first),item);
  let disposals=0;water.materials.forEach(m=>m.addEventListener("dispose",()=>disposals++));water.dispose();assert.equal(disposals,5);assert.equal(water.group.children.length,0);assert.equal(water.active.size,0);
});
test("travel phase follows the complete immutable profile, not chunk order or runtime age",()=>{
  const nodes=[
    {x:8100,z:-6200,distance:0,level:100,width:1.3},
    {x:8104,z:-6197,distance:5,level:99.95,width:1.8},
    {x:8107,z:-6189,distance:5+Math.hypot(3,8),level:99.45,width:2.2},
    {x:8102,z:-6181,distance:5+Math.hypot(3,8)+Math.hypot(5,8),level:99.4,width:2.4}
  ].map(Object.freeze);
  const lines=[{nodes},{nodes:nodes.map(n=>Object.freeze({...n,x:n.x+100,distance:n.distance*1.5}))}],before=JSON.stringify(lines);
  const forward=createRiverPhaseData(lines),reverse=createRiverPhaseData([...lines].reverse());
  for(const {nodes} of lines)for(let i=0;i<nodes.length;i++){
    const a=forward.get(nodes[i]);assert.deepEqual(a,reverse.get(nodes[i]));
    assert.ok([a.phase,a.speed,a.slope].every(Number.isFinite));assert.ok(a.speed>0&&a.slope>=0);
    if(i){
      const b=forward.get(nodes[i-1]),length=nodes[i].distance-nodes[i-1].distance;
      assert.ok(a.phase>b.phase);
      near(length/(a.phase-b.phase)*RIVER_PHASE_SPEED,2/(1/a.speed+1/b.speed));
      for(const time of [0,1,60,3600])near((a.phase-time*RIVER_PHASE_SPEED)-(b.phase-time*RIVER_PHASE_SPEED),a.phase-b.phase);
    }
  }
  assert.equal(JSON.stringify(lines),before);
});
test("near/overview materials share one animation clock and the same profile lookup",async()=>{
  const water=new WorldWater(simple());await water.load();
  const shaders=water.materials.slice(0,2).map(m=>{
    const s={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    m.onBeforeCompile(s);return s;
  });
  assert.equal(shaders[0].uniforms.uWaterTime,shaders[1].uniforms.uWaterTime);
  const camera=new THREE.PerspectiveCamera();camera.position.set(60,98,8);water.update(camera,.016);
  near(shaders[0].uniforms.uWaterTime.value,.016);
  for(const bucket of water.active.values())for(const a of bucket.mesh.geometry.attributes.aRiverPhase.array)assert.ok(Number.isFinite(a));
  assert.equal(water.overview.geometry.attributes.aRiverPhase.count,water.overview.geometry.attributes.position.count);
  assert.throws(()=>createWaterGeometry(water.hydrology.segments,{phaseData:new WeakMap()}),/Missing shared river phase/);
  water.dispose();
});
const ROOT=new URL("../../public/",import.meta.url),json=n=>JSON.parse(readFileSync(new URL(n,ROOT))),bin=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,ROOT))));
let actualWorld,actualInput;
function actual(riverMeanders){
  if(riverMeanders!==undefined){actual();return createWorldData({...actualInput,riverMeanders});}
  if(actualWorld)return actualWorld;
  const meta=json("data/scene.json"),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
  // Real DEM/detail/objects/river source; landcover is irrelevant to this physical-surface test.
  actualInput={meta,objects:json("data/objects.json"),detailMeta:json("data/detail.json"),manifest:json("world-v2/manifest.json"),streamData:json("data/streams.json"),
    coreHeights:decodeHeightBytes(bin("data/core_height.bin.gz"),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(bin("data/far_height.bin.gz"),meta.far.n,meta.height_scale),
    detailBytes:bin("data/detail.bin.gz"),coreLandcover:lc,farLandcover:lc};
  actualWorld=createWorldData(actualInput);
  return actualWorld;
}
test("actual 219-line network is finite/downhill; unresolved source reaches remain reported",()=>{
  const w=actual(),h=w.hydrology;
  assert.equal(h.stats.sourceLines,219);assert.equal(h.stats.sourcePoints,62637);assert.ok(h.stats.enabledLength>230000);assert.ok(h.stats.unresolvedSegments>0);
  assert.ok(h.stats.connectedJunctions>0);
  for(const s of h.segments){
    assert.ok(s.b.level<=s.a.level+.00001);
    const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2,q=h.sampleAt(x,z);
    assert.ok(q.insideWater,s.id);assert.ok(q.depth>0&&q.depth<2,s.id);assert.ok(w.surface.heightAt(x,z)<=q.waterLevel);
  }
  for(const p of h.viewpoints)assert.ok([p.x,p.z,p.yaw,p.pitch,p.above].every(Number.isFinite));
  for(const e of w.entities){const p=w.surface.buildingPose(e);assert.ok(Number.isFinite(p.y));}
});
test("actual bends crossing chunks keep identical phase, bank coordinates and flow for both LODs",t=>{
  const h=actual().hydrology,phaseData=createRiverPhaseData(h.lines),byIndex=new Map(h.segments.map(s=>[s.lineId+":"+s.index,s]));
  const chunk=s=>Math.floor((s.a.x+s.b.x)/256)+","+Math.floor((s.a.z+s.b.z)/256);
  let seams=0;
  for(const left of h.segments){
    const right=byIndex.get(left.lineId+":"+(left.index+1));
    if(!right||left.b!==right.a||chunk(left)===chunk(right)||left.slope===right.slope)continue;
    const a=createWaterGeometry([left],{detail:true,phaseData});
    const original=createWaterGeometry([left],{detail:true});
    assert.deepEqual(a.attributes.position.array,original.attributes.position.array);assert.deepEqual(a.index.array,original.index.array);original.dispose();
    for(const detail of [false,true]){
      const b=createWaterGeometry([right],{detail,phaseData}),last=a.attributes.position.count-5;
      for(const [ia,ib] of [[last,0],[last+4,detail?4:1]]){
        for(const [attribute,components] of [["position",[0,1,2]],["aRiverFlow",[0,1]],["aRiver",[0,1,3]],["aAcross",[0]],["aRiverPhase",[0,1,2]],["aRiverProfile",[0,1,2,3]]]){
          for(const c of components){
            const av=a.attributes[attribute].getComponent(ia,c),bv=b.attributes[attribute].getComponent(ib,c);
            assert.ok(Number.isFinite(av)&&Number.isFinite(bv));assert.equal(av,bv,left.id+" / "+attribute+" / "+c);
          }
        }
        for(const time of [0,1,60,3600]){
          const pa=a.attributes.aRiverPhase.getX(ia)-time*RIVER_PHASE_SPEED,pb=b.attributes.aRiverPhase.getX(ib)-time*RIVER_PHASE_SPEED;
          assert.ok(Number.isFinite(pa));assert.equal(pa,pb);
        }
      }
      b.dispose();
    }
    a.dispose();if(++seams===32)break;
  }
  assert.equal(seams,32);t.diagnostic("32 actual varying-slope chunk seams: exact Float32 agreement at both banks, both LODs and four animation ages");
});
test("actual near-bank rocks are stable, seated on the shared river bed and only exposed obstacles make wakes",()=>{
  const w=actual(),p=w.hydrology.viewpoints[0],segments=w.hydrology.nearSegments(p.x,p.z,150),a=createShoreStones(w,segments),b=createShoreStones(w,segments);
  assert.deepEqual(a,b);assert.ok(a.length>5);
  for(const r of a){near(r.y,w.surface.heightAt(r.x,r.z)+r.scale*.2);if(r.wake){assert.ok(r.inWater);assert.ok(r.y+r.scale*r.sy>r.level+.025);}}
});

test("representative shore hierarchy retains original major roots, avoids paired banks and separates secondary members",t=>{
  const w=actual(),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest"),segments=w.hydrology.nearSegments(view.x,view.z,80);
  const records=createShoreStones(w,segments),byId=new Map(records.map(r=>[r.id,r]));assert.equal(byId.size,records.length);
  const primary=byId.get("river-41711e76-99c57ca2:862:1");assert.ok(primary?.sourceAnchor);
  // Original screenshot's foreground anchor, preserving root and scale rather
  // than enlarging every stone. Its height comes from the NEW shared bank bed.
  near(primary.x,-3613.196973900597,1e-9);near(primary.z,4803.476410674315,1e-9);
  near(primary.scale,.5888637395016849,1e-12);near(primary.sx,1.8539603955112398,1e-12);
  near(primary.sy,.7511318933451548,1e-12);near(primary.sz,1.2404897131025792,1e-12);
  near(primary.y,w.surface.heightAt(primary.x,primary.z)+primary.scale*.2);
  assert.ok(!byId.has("river-41711e76-99c57ca2:862:-1"),"do not restore the symmetric opposite bank pair");
  const anchors=records.filter(r=>r.sourceAnchor),stations=new Set(anchors.map(r=>r.id.slice(0,r.id.lastIndexOf(":"))));assert.equal(stations.size,anchors.length);
  assert.ok(anchors.length>=3);let separated=0;
  for(const r of records){
    assert.ok([r.x,r.y,r.z,r.scale,r.sx,r.sy,r.sz].every(Number.isFinite));
    near(r.y,w.surface.heightAt(r.x,r.z)+r.scale*.2);
    if(r.role!=="fragment")continue;
    const mate=byId.get(r.id.slice(0,r.id.lastIndexOf(":"))+":0");if(!mate)continue;
    assert.ok(Math.hypot(r.x-mate.x,r.z-mate.z)>.34,"secondary roots must not collapse to coincident FNV suffixes");separated++;
  }
  assert.ok(separated>2);
  const sorted=a=>a.sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(sorted(createShoreStones(w,[...segments].reverse())),sorted([...records]));
  const split=[...createShoreStones(w,segments.slice(0,7)),...createShoreStones(w,segments.slice(7))];assert.deepEqual(sorted(split),sorted([...records]));
  const volume=r=>r.scale**3*r.sx*r.sy*r.sz,secondary=records.filter(r=>r.role==="secondary");
  assert.ok(volume(primary)>3*secondary.reduce((n,r)=>n+volume(r),0)/secondary.length);
  t.diagnostic(JSON.stringify({forestRadius:80,stones:records.length,anchors:anchors.length,secondary:secondary.length,fragments:records.filter(r=>r.role==="fragment").length,triangles:records.length*1260,foreground:{id:primary.id,x:primary.x,y:primary.y,z:primary.z}}));
});

test("default forest bend retains original major roots and shares the new water, bed and ecological mask",t=>{
  const w=actual(),old=actual(false),view=w.hydrology.viewpoints.find(v=>v.id==="river-forest");
  assert.ok(w.hydrology.stats.meanders.nodes>0);assert.equal(old.hydrology.stats.meanders.reason,"disabled");
  const records=world=>createShoreStones(world,world.hydrology.nearSegments(view.x,view.z,120)).filter(r=>r.sourceAnchor);
  const before=records(old),after=new Map(records(w).map(r=>[r.id,r]));assert.equal(after.size,before.length);
  for(const a of before){
    const b=after.get(a.id);assert.ok(b,a.id+" retained original anchor");
    for(const key of ["x","z","scale","sx","sy","sz","rot"])near(b[key],a[key],1e-12);
    const h=w.hydrology.sampleAt(b.x,b.z);near(b.y,w.surface.heightAt(b.x,b.z)+b.scale*.2);near(b.wetness,h.wetness);
    if(b.inWater){near(b.flowX,h.flowX);near(b.flowZ,h.flowZ);}
  }
  let checked=0;
  for(const s of w.hydrology.segments.filter(s=>s.meander))for(const t of [0,.25,.5,.75,1]){
    const n=riverSectionAt(s,t);
    for(const side of [-.8,0,.8]){
      const p=riverCrossPoint(n,side),h=w.hydrology.sampleAt(p.x,p.z);
      assert.ok(h.insideWater);near(h.waterLevel,n.level,.0001);
      assert.ok(w.surface.heightAt(p.x,p.z)<n.level);assert.ok(w.hydrology.isExcluded(p.x,p.z));checked++;
    }
  }
  assert.ok(checked>500);t.diagnostic(JSON.stringify({retainedSourceAnchors:before.length,defaultSharedWaterBedMaskSamples:checked}));
});

test("actual water vertices remain above the shared bed at every supplied stream viewpoint",()=>{
  const w=actual();
  for(const p of w.hydrology.viewpoints){
    const g=createWaterGeometry(w.hydrology.nearSegments(p.x,p.z,200),{detail:true}),pos=g.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i),y=pos.getY(i),bed=w.surface.heightAt(x,z);
      assert.ok(bed-y<.015,p.id+" submerged vertex "+i);
      assert.ok(y-bed<2,p.id+" floating vertex "+i);
    }
    g.dispose();
  }
});
test("shared river carving preserves every migrated building pose and protected road centre",()=>{
  const w=actual(),baseline=createWorldData({...actualInput,streamData:{lines:[]}});
  for(const e of w.entities){
    const old=baseline.entities.find(o=>o.id===e.id);near(e.y,old.y,1e-6);
  }
  for(const route of w.objects.tracks||[])for(let i=1;i<route.pts.length;i++){
    const a=route.pts[i-1],b=route.pts[i];
    for(const t of [0,.25,.5,.75,1]){
      const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      near(w.surface.heightAt(x,z),baseline.surface.heightAt(x,z),1e-6);
    }
  }
});

test("river stones use the scanned shared shell with UV detail and true waterline attributes",async()=>{
  const g=createShoreRockGeometry();
  assert.equal(g.index.count/3,1260);assert.equal(g.attributes.position.count,879);assert.equal(g.attributes.uv.count,879);
  for(let i=0;i<g.attributes.normal.count;i++)near(Math.hypot(g.attributes.normal.getX(i),g.attributes.normal.getY(i),g.attributes.normal.getZ(i)),1,1e-5);
  const water=new WorldWater(simple());await water.load();
  const camera=new THREE.PerspectiveCamera();camera.position.set(50,98,8);
  for(let i=0;i<20;i++)water.update(camera,.016);
  let instances=0;
  for(const b of water.active.values())if(b.rocks){
    instances+=b.rocks.count;
    const a=b.rocks.geometry.attributes.aShoreHydro;assert.equal(a.count,b.rocks.count);
    assert.ok(a.isInstancedBufferAttribute);
    for(const v of b.rocks.instanceColor.array)assert.ok(v>=0&&v<.9,"scan tint must be linear and bounded; diffuse map supplies the actual mineral albedo");
  }
  assert.ok(instances>0);
  const m=createShoreRockMaterial(),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes("instanceMatrix*shoreWorld"));assert.ok(shader.fragmentShader.includes("vShoreHydro.x+.085"));
  assert.ok(shader.fragmentShader.includes("reflectedLight.indirectDiffuse*=stoneContact"));
  assert.ok(shader.fragmentShader.includes("#include <lights_fragment_begin>"));m.dispose();g.dispose();water.dispose();
});

test("near-bed gravel is deterministic, bounded, physically seated and never creates foam",t=>{
  const w=actual(),counts=[];
  for(const p of w.hydrology.viewpoints){
    const x=Math.floor(p.x/8)*8+4,z=Math.floor(p.z/8)*8+4,segments=w.hydrology.nearSegments(x,z,68);
    const a=createRiverGravel(w,segments,{x,z}),b=createRiverGravel(w,[...segments].reverse(),{x,z});
    assert.deepEqual(a,b);assert.ok(a.length>100&&a.length<=RIVER_GRAVEL.capacity);
    const limited=createRiverGravel(w,segments,{x,z,limit:32});assert.equal(limited.length,32);
    for(const r of a){
      assert.ok(r.diameter>=.025&&r.diameter<=.16);assert.ok(Math.hypot(r.x-x,r.z-z)<=60);
      near(r.y,w.surface.heightAt(r.x,r.z)-r.scale*r.burial);
      const water=w.hydrology.sampleAt(r.x,r.z);if(r.inWater)near(r.waterLevel,water.waterLevel);else{assert.equal(r.onBar,true);assert.ok(water.wetness>.12&&water.riverBed>.2);}
      assert.equal(r.wake,false);
    }
    counts.push({view:p.id,pebbles:a.length,triangles:a.length*180});
  }
  t.diagnostic(JSON.stringify(counts));
});
test("gravel keeps its resident instance buffer and obeys fixed capacity across movement",async()=>{
  const water=new WorldWater(simple());await water.load();
  const camera=new THREE.PerspectiveCamera();camera.position.set(60,98,8);water.update(camera,.016);
  const mesh=water.gravel.mesh,geometry=mesh.geometry,version=mesh.instanceMatrix.version,first=water.gravel.records.map(r=>r.id);
  assert.ok(first.length>100);water.update(camera,.016);assert.equal(mesh.instanceMatrix.version,version);
  camera.position.x+=8;water.update(camera,.016);
  assert.equal(water.gravel.mesh,mesh);assert.equal(mesh.geometry,geometry);assert.ok(mesh.count<=RIVER_GRAVEL.capacity);
  assert.ok(water.gravel.records.filter(r=>first.includes(r.id)).length>first.length*.65);
  assert.equal(water.stats.gravelTriangles,mesh.count*180);
  camera.position.y+=200;water.update(camera,.016);assert.equal(mesh.count,0);
  water.dispose();
});

test("all real river viewpoints select finite local planes through actual visible water, without changing river geometry",t=>{
  const w=actual(),ids=[];
  for(const p of w.hydrology.viewpoints){
    const camera=new THREE.PerspectiveCamera(52,1.8,.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();
    camera.position.set(p.x,w.surface.heightAt(p.x,p.z)+p.above,p.z);
    const yaw=p.yaw*Math.PI/180,pitch=p.pitch*Math.PI/180;
    camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));camera.updateMatrixWorld();
    const patch=selectWaterReflectionPatch(w.hydrology,camera);assert.ok(patch,p.id);
    assert.ok([...patch.center.toArray(),...patch.plane.normal.toArray(),patch.plane.constant].every(Number.isFinite));
    assert.ok(patch.plane.distanceToPoint(camera.position)>.12);near(patch.plane.distanceToPoint(patch.center),0);
    const actualWater=w.hydrology.sampleAt(patch.center.x,patch.center.z);assert.ok(actualWater.insideWater);near(patch.center.y,actualWater.waterLevel+.006,.03);
    ids.push({view:p.id,patch:patch.id,normal:patch.plane.normal.toArray(),radius:patch.radius});
  }
  t.diagnostic(JSON.stringify(ids));
});

test("actual representative banks preserve the complete network and infrastructure while changing only bounded shared reaches",t=>{
  const w=actual(false),h=w.hydrology,baseline=createHydrology({streamData:actualInput.streamData,heightAt:w.surface.uncarvedHeightAt,entities:createEntities(w.objects,w.manifest.assetMetadata),assetMetadata:w.manifest.assetMetadata,objects:w.objects,naturalBanks:false});
  assert.equal(h.stats.enabledLength,baseline.stats.enabledLength);assert.deepEqual(h.unresolved.map(s=>[s.id,s.reason]),baseline.unresolved.map(s=>[s.id,s.reason]));
  for(let i=0;i<h.lines.length;i++)assert.deepEqual(h.lines[i].nodes.map(n=>[n.x,n.z,n.width,n.level,n.distance]),baseline.lines[i].nodes.map(n=>[n.x,n.z,n.width,n.level,n.distance]));
  assert.equal(h.stats.naturalBanks.reaches,3);assert.ok(h.stats.naturalBanks.length<1100);assert.ok(h.stats.naturalBanks.length>900);
  let shaped=0,samples=0,maxBedError=0,worst=null,confluences=0;
  for(let i=0;i<h.segments.length;i++){
    const s=h.segments[i],old=baseline.segments[i];assert.equal(s.id,old.id);assert.deepEqual(s.bounds,old.bounds);
    if(!s.naturalBanks)continue;shaped++;
    const g=createWaterGeometry([s],{detail:true});assert.ok(g.attributes.aRiverProfile.array.every(Number.isFinite));g.dispose();
    for(const t of [.2,.5,.8]){
      const n=riverSectionAt(s,t);
      for(const a of [-.8,-.55,0,.55,.8]){
        const p=riverCrossPoint(n,a),q=h.sampleAt(p.x,p.z),cheap=h.sampleAt(p.x,p.z,{includeDepth:false});
        assert.ok(q.insideWater,s.id+" dry visible water "+a);assert.ok(cheap.insideWater);assert.ok(h.isExcluded(p.x,p.z));
        assert.ok(w.surface.heightAt(p.x,p.z)<=q.waterLevel+.006);assert.ok(w.surface.heightAt(p.x,p.z)<=w.surface.uncarvedHeightAt(p.x,p.z));
        near(q.waterLevel-w.surface.heightAt(p.x,p.z),q.depth);
        if(q.id!==s.id){confluences++;continue;}
        const error=Math.abs(q.depth-riverSectionDepth(n,a));if(error>maxBedError){maxBedError=error;worst={segment:s.id,query:q.id,x:p.x,z:p.z,side:a,level:n.level,queryLevel:q.waterLevel,depth:q.depth,designed:riverSectionDepth(n,a),bed:w.surface.heightAt(p.x,p.z),raw:w.surface.uncarvedHeightAt(p.x,p.z)};}samples++;
      }
    }
  }
  t.diagnostic(JSON.stringify({naturalBanks:h.stats.naturalBanks,shaped,samples,confluences,maxBedError,worst}));
  assert.ok(maxBedError<.04);
});


test("bank gravel forms local one-sided depositional patches with exposed gaps",()=>{
  const w=actual();
  for(const view of w.hydrology.viewpoints){
    const records=createRiverGravel(w,w.hydrology.nearSegments(view.x,view.z,68),{x:view.x,z:view.z});
    const bank=records.filter(r=>r.onBar),patches=new Map();
    assert.ok(bank.length>0,view.id+" retains local bank detail");
    assert.ok(bank.length<records.length*.12,"bank pebbles must not form a continuous border");
    for(const r of bank){
      if(!patches.has(r.depositPatch))patches.set(r.depositPatch,[]);
      patches.get(r.depositPatch).push(r);
      assert.ok(r.y<r.ground,"partially buried mineral fragments, not beads on top");
    }
    for(const group of patches.values()){
      assert.equal(new Set(group.map(r=>r.bankSide)).size,1,"a deposit never draws both bank rows");
      assert.ok(Math.max(...group.map(r=>r.chainage))-Math.min(...group.map(r=>r.chainage))<4.5);
    }
    assert.ok(records.filter(r=>!r.onBar).some(r=>r.diameter<.035),"retain finer submerged bed material");
  }
});

test("scan material keeps UV normals and packed roughness while removing synthetic relief",()=>{
  const m=createShoreRockMaterial({scanned:true});
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  m.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes("#include <normal_fragment_maps>"));
  assert.ok(shader.fragmentShader.includes("clamp(roughnessFactor,.62,.96)"));
  assert.equal((shader.fragmentShader.match(/shoreNoise\(vShoreWorld/g)||[]).length,0);
  assert.ok(!shader.fragmentShader.includes("stoneGrainNormal"));
  assert.ok(shader.fragmentShader.includes("reflectedLight.indirectDiffuse*=stoneContact"));
  m.dispose();
});
