import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { WorldEcology, meadowGeometry, basalGrassGeometry, farTreeGeometry, cellRandom, attachEcologyWind, MEADOW, decodeHabitatMap, sampleHabitat, refreshPlantBounds } from "./ecology.js";
import { createFlowerAssets } from "./flower-assets.js";
const world=()=>({
  entities:[],objects:{},
  landcoverAt:()=>({r:0,g:0,b:0,a:0}),
  surface:{heightAt:()=>100,normalAt:()=>({x:0,y:1,z:0})},
});
const camera=(x=0,z=0)=>({position:new THREE.Vector3(x,101.7,z)});

test("meadow geometry retains identical rooted skeleton at both distances and bounded detail",()=>{
  const hi=meadowGeometry(true),lo=meadowGeometry(false),far=farTreeGeometry();
  assert.equal(hi.index.count/3,245);assert.equal(lo.index.count/3,69);assert.equal(far.index.count/3,104);
  for(const g of [hi,lo,far]) for(const attr of Object.values(g.attributes))
    for(const value of attr.array)assert.ok(Number.isFinite(value));
  let loStart=0;
  for(let blade=0;blade<24;blade++){
    const loSegments=blade<8?2:1;
    // Roots and tips of ALL leaves survive, including the former missing 16.
    for(const [a,b] of [[blade*12,loStart],[blade*12+1,loStart+1],[blade*12+10,loStart+loSegments*2]]){
      for(const name of ["position","color","aPlantWind"]){
        const ha=hi.attributes[name],la=lo.attributes[name];
        for(let k=0;k<3;k++)assert.equal(ha.array[a*3+k],la.array[b*3+k]);
      }
    }
    loStart+=(loSegments+1)*2;
  }
  hi.computeBoundingBox();assert.ok(hi.boundingBox.max.y>=1);
  hi.dispose();lo.dispose();far.dispose();
});

test("negative-world tiles own each plant once and replay stable IDs and matrices",()=>{
  const ecology=new WorldEcology(world()),cam=camera(-1,-1);
  const tiles=[ecology.buildGrassTile(-1,-1,cam),ecology.buildGrassTile(0,-1,cam),ecology.buildGrassTile(-1,0,cam),ecology.buildGrassTile(0,0,cam)];
  const points=tiles.flatMap(t=>t.list),ids=points.map(p=>p.id);assert.equal(new Set(ids).size,ids.length);
  assert.ok(points.length>2000);
  for(const tile of tiles)for(const p of tile.list){
    assert.equal(Math.floor(p.x/MEADOW.tile),tile.tx);assert.equal(Math.floor(p.z/MEADOW.tile),tile.tz);
    const [,ix,iz]=p.id.split(":");assert.deepEqual(ecology.grassAt(Number(ix),Number(iz)),p);
  }
  assert.equal(cellRandom(-23,16,4),cellRandom(-23,16,4));ecology.dispose();
});

test("meadow streaming is bounded, preserves resident buffers and fills nearest tiles first",()=>{
  const ecology=new WorldEcology(world()),cam=camera();
  ecology.updateMeadow(cam);
  assert.ok(ecology.stats.grassBuiltThisFrame>=1&&ecology.stats.grassBuiltThisFrame<=2);
  const key=[...ecology.grassTiles.keys()][0],tile=ecology.grassTiles.get(key),mesh=tile.meshes[0],buffer=mesh.instanceMatrix.array,copy=buffer.slice();
  const initialSize=ecology.grassTiles.size;
  for(let i=0;i<4;i++){ecology.updateMeadow(cam);assert.ok(ecology.stats.grassBuiltThisFrame<=2);}
  assert.ok(ecology.grassTiles.size<=initialSize+8);assert.strictEqual(ecology.grassTiles.get(key),tile);assert.strictEqual(mesh.instanceMatrix.array,buffer);assert.deepEqual(buffer,copy);
  cam.position.x=7;ecology.updateMeadow(cam);
  assert.strictEqual(ecology.grassTiles.get(key),tile);assert.strictEqual(mesh.instanceMatrix.array,buffer);
  cam.position.y=250;ecology.updateMeadow(cam);assert.equal(ecology.grassGroup.visible,false);
  ecology.dispose();
});

test("shared building and boardwalk exclusions reject plants without flattening their habitat",()=>{
  const w=world();w.entities=[{x:0,z:0,rot:Math.PI/4,pad:{hx:5,hz:4,cx:0,cz:0}}];
  w.objects={boardwalks:[{pts:[[-50,10],[50,10]],width:1.2}]};
  const ecology=new WorldEcology(w);
  assert.equal(ecology.excluded(0,0,.3),true);assert.equal(ecology.excluded(20,10,.12),true);assert.equal(ecology.excluded(20,12,.12),false);
  for(let iz=-8;iz<16;iz++)for(let ix=-8;ix<16;ix++){const p=ecology.grassAt(ix,iz);if(p)assert.equal(ecology.excluded(p.x,p.z,.3),false);}
  ecology.dispose();
});

test("flower batches stay stable while tile removal compacts only affected instance slots",()=>{
  const ecology=new WorldEcology(world()),assets=createFlowerAssets();ecology.flowerAssets=assets;
  // Artificial density exercises pool compaction independent of the real raster's beds.
  ecology.habitat=(x,z,ch)=>ch===0?.5:0;
  ecology.flowerPools=assets.variants.filter(v=>v.kind==="cosmos").map(variant=>({
    variant,mesh:new THREE.InstancedMesh(variant.parts[0].geometry,variant.parts[0].material,2400),
    records:[],dirtyMin:Infinity,dirtyMax:0,
  }));
  for(const pool of ecology.flowerPools)ecology.group.add(pool.mesh);
  ecology.addFlowers(0,0);ecology.addFlowers(1,0);
  const original=ecology.flowerTiles.get("1,0").map(p=>({id:p.id,x:p.x,z:p.z}));
  assert.ok(original.length>100);ecology.removeFlowers("0,0");
  for(const pool of ecology.flowerPools)for(let i=0;i<pool.records.length;i++){
    const p=pool.records[i];assert.equal(p.slot,i);assert.equal(p.tile,"1,0");
  }
  assert.deepEqual(ecology.flowerTiles.get("1,0").map(p=>({id:p.id,x:p.x,z:p.z})),original);
  ecology.addFlowers(1,0);assert.deepEqual(ecology.flowerTiles.get("1,0").map(p=>p.id),original.map(p=>p.id));
  ecology.removeFlowers("1,0");assert.equal(ecology.flowerPools.reduce((n,p)=>n+p.records.length,0),0);ecology.dispose();
});

test("wind hooks preserve existing PBR hooks and use matched colour/depth displacement",()=>{
  const uniforms={uWindTime:{value:0},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
  let calls=0;const material=new THREE.MeshStandardMaterial();material.onBeforeCompile=()=>calls++;
  attachEcologyWind(material,uniforms,2,true);
  const color={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(color);assert.equal(calls,1);
  assert.match(color.vertexShader,/ecoBend/);assert.match(color.vertexShader,/objectNormal=normalize/);
  assert.match(color.fragmentShader,/n<nearGrass/);
  const depth=new THREE.MeshDepthMaterial();attachEcologyWind(depth,uniforms,2,true);
  const shadow={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
  depth.onBeforeCompile(shadow);
  assert.match(shadow.vertexShader,/transformed.xz \+= ecoOffset/);
  assert.match(shadow.vertexShader,/aPlantWind.z>1/);
  assert.equal(color.uniforms.uWindTime,shadow.uniforms.uWindTime);material.dispose();depth.dispose();
});

test("real habitat atlas preserves species channels, pixel centres and authored cosmos beds",async()=>{
  const base=new URL("../../public/data/",import.meta.url);
  const meta=JSON.parse(await readFile(new URL("vegmap.json",base),"utf8"));
  const bytes=gunzipSync(await readFile(new URL("vegmap.bin.gz",base)));
  const map=decodeHabitatMap(meta,bytes),n=map.n;
  for(const [i,j] of [[0,0],[500,500],[1023,1023],[510,487]]){
    const x=meta.origin[0]+(i+.5)*meta.res,z=meta.origin[1]+(j+.5)*meta.res;
    assert.equal(sampleHabitat(map,x,z,0),bytes[(j*3*n+i)*4]/255);
  }
  assert.equal(sampleHabitat(map,meta.origin[0]-1,meta.origin[1],0),0);
  let peak=0,positive=0;
  for(let z=3350;z<3470;z+=2)for(let x=-2050;x<-1940;x+=2){const v=sampleHabitat(map,x,z,0);peak=Math.max(peak,v);if(v>.2)positive++;}
  assert.ok(peak>.6,"original Lanchuan cosmos beds remain available");assert.ok(positive>100);
  assert.throws(()=>decodeHabitatMap(meta,bytes.subarray(4)),/size mismatch/);
});

test("low grass canopy has arched leaves and a bounded nearby pool",()=>{
  const g=basalGrassGeometry();assert.equal(g.index.count/3,240);
  g.computeBoundingBox();assert.ok(g.boundingBox.max.y<.45);assert.ok(g.boundingBox.max.x-g.boundingBox.min.x>.7);
  const ecology=new WorldEcology(world()),cam=camera();
  for(let i=0;i<80;i++){ecology.updateMeadow(cam);if(!ecology.stats.grassPending)break;}
  const pool=ecology.baseGrass;
  assert.ok(pool.records.length>3000);assert.ok(pool.records.length*240<1500000);
  const original=pool.records.find(p=>Math.hypot(p.x,p.z)<5);
  cam.position.x=5;ecology.updateMeadow(cam);
  assert.strictEqual(pool.records.find(p=>p.id===original.id),original);
  assert.ok(pool.records.every(p=>Math.hypot(p.x-cam.position.x,p.z-cam.position.z)<31));
  g.dispose();ecology.dispose();
});

test("near flowers use the same roots and mutate only the limited high-detail pool",()=>{
  const ecology=new WorldEcology(world()),low=createFlowerAssets(),high=createFlowerAssets();
  ecology.flowerAssets=low;ecology.flowerNearAssets=high;
  ecology.habitat=(x,z,ch)=>ch===0?.7:0;
  const pools=assets=>assets.variants.filter(v=>v.kind==="cosmos").map(variant=>({
    variant,mesh:new THREE.InstancedMesh(variant.parts[0].geometry,variant.parts[0].material,2400),
    records:[],dirtyMin:Infinity,dirtyMax:0,
  }));
  ecology.flowerPools=pools(low);ecology.flowerNearPools=pools(high);
  for(const pool of [...ecology.flowerPools,...ecology.flowerNearPools])ecology.group.add(pool.mesh);
  for(const [x,z] of [[-1,-1],[0,-1],[-1,0],[0,0],[1,0]])ecology.addFlowers(x,z);
  const cam=camera();ecology.syncNearFlowers(cam);
  const original=new Map(ecology.flowerNearPools.flatMap(p=>p.records).map(p=>[p.id,p]));
  assert.ok(original.size>500);
  for(const p of original.values())assert.ok(Math.hypot(p.x,p.z)<23);
  cam.position.x=5;ecology.syncNearFlowers(cam);
  for(const p of ecology.flowerNearPools.flatMap(p=>p.records)){
    assert.ok(Math.hypot(p.x-5,p.z)<23);if(original.has(p.id))assert.strictEqual(p,original.get(p.id));
  }
  ecology.dispose();
});

test("active plant bounds contain rotated geometry, wind and streaming movement margin",()=>{
  const geometry=meadowGeometry(true),mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial(),3);
  const records=[{x:0,y:100,z:0,s:1.3,sy:1.45,rot:1.1},{x:38.9,y:105,z:0,s:1,sy:1.1,rot:-.7},{x:70,y:900,z:0,s:1,rot:0}];
  const viewer=new THREE.Vector3(0,101,0),box=refreshPlantBounds(mesh,records,viewer,33);
  const point=new THREE.Vector3(),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(const root of records.slice(0,2)){
    matrix.compose(position.set(root.x,root.y,root.z),rotation.setFromAxisAngle(up,root.rot),scale.set(root.s,root.sy,root.s));
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(matrix);
      for(const dx of [-.6,.6])for(const dz of [-.6,.6])assert.ok(box.containsPoint(point.clone().add(new THREE.Vector3(dx,-.2,dz))));
    }
  }
  assert.ok(box.max.y<110,"fully transparent prefetched roots do not enlarge the shadow bounds");
  assert.equal(mesh.frustumCulled,true);geometry.dispose();mesh.material.dispose();mesh.dispose();
});

test("camera and shadow frustums reject unrelated pools while retaining near caster geometry",()=>{
  const geometry=basalGrassGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1);
  mesh.count=1;mesh.castShadow=true;refreshPlantBounds(mesh,[{x:0,y:100,z:0,s:1,rot:0}],new THREE.Vector3(0,101.7,0),25);
  const frustumAt=x=>{
    const camera=new THREE.OrthographicCamera(-10,10,10,-10,1,100);
    camera.position.set(x,140,0);camera.up.set(0,0,-1);camera.lookAt(x,100,0);camera.updateMatrixWorld(true);
    return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  };
  mesh.updateMatrixWorld(true);
  assert.equal(mesh.intersectsFrustum(frustumAt(0)),true);
  assert.equal(mesh.intersectsFrustum(frustumAt(200)),false);
  assert.equal(mesh.castShadow,true);assert.equal(mesh.count,1);
  const before=mesh.instanceMatrix.array.slice();
  refreshPlantBounds(mesh,[{x:60,y:100,z:0,s:1,rot:0}],new THREE.Vector3(),33);
  assert.ok(mesh.boundingBox.isEmpty());assert.equal(mesh.intersectsFrustum(frustumAt(60)),false);
  refreshPlantBounds(mesh,[{x:60,y:100,z:0,s:1,rot:0}],new THREE.Vector3(30,0,0),33);
  assert.equal(mesh.intersectsFrustum(frustumAt(60)),true);assert.deepEqual(mesh.instanceMatrix.array,before);
  geometry.dispose();material.dispose();mesh.dispose();
});


test("shared spruce forms preserve variant identity and matched colour/depth wind",async()=>{
 const {SPRUCE_SPEC,spruceRadius,setFarSpruceAttributes,installFarSpruceShape,installCrownOcclusion}=await import("./spruce-geometry.js");
 const g=farTreeGeometry();setFarSpruceAttributes(g,SPRUCE_SPEC.variants.map((f,variant)=>({variant})));
 assert.equal(g.attributes.aSpruceForm.count,5);
 for(let j=0;j<=8;j++){const p=g.attributes.position;assert.ok(new THREE.Vector3().fromBufferAttribute(p,j*7).distanceTo(new THREE.Vector3().fromBufferAttribute(p,j*7+6))<1e-6,"far crown seam remains closed");}
 for(let i=0;i<5;i++){assert.equal(g.attributes.aSpruceForm.getX(i),Math.fround(SPRUCE_SPEC.variants[i].rmax));assert.ok(spruceRadius(SPRUCE_SPEC.variants[i],7)>0);}
 const uniforms={uWindTime:{value:1},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
 const material=attachEcologyWind(new THREE.MeshStandardMaterial(),uniforms,5,false,true);installCrownOcclusion(material);
 const color={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(color);
 const depth=attachEcologyWind(new THREE.MeshDepthMaterial(),uniforms,5,false,true),shadow={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};depth.onBeforeCompile(shadow);
 for(const shader of [color,shadow]){assert.match(shader.vertexShader,/#define ECO_TREE/);assert.match(shader.vertexShader,/sin\(t\*\.85\+weights.z\)/);assert.match(shader.vertexShader,/ecoWeights=aPlantWind/);}
 assert.match(color.fragmentShader,/reflectedLight.indirectDiffuse\*=clamp/);assert.ok(!color.fragmentShader.includes("diffuseColor.rgb*=vCrown"));
 const far=attachEcologyWind(new THREE.MeshStandardMaterial(),uniforms,0);installFarSpruceShape(far);const fs={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};far.onBeforeCompile(fs);
 assert.match(fs.vertexShader,/ecoWeights.x=clamp\(shapedHeight\/18./);assert.match(fs.vertexShader,/aSpruceForm.y/);g.dispose();material.dispose();depth.dispose();far.dispose();
});
test("actual editable spruce exports retain every shared cluster, rooted collars and bounded detail",async()=>{
 const spec=JSON.parse(await readFile(new URL("./spruce-spec.json",import.meta.url),"utf8"));
 const report=JSON.parse(await readFile(new URL("../../../assets/src/v2/spruce/export-report.json",import.meta.url),"utf8"));
 const skeleton=JSON.parse(await readFile(new URL("../../../assets/src/v2/spruce/shared-skeleton.json",import.meta.url),"utf8"));
 assert.deepEqual(skeleton.spec,spec);
 const expected={hi:{column:18696,edge:19456,old:13620,pencil:13488,young:14978},mid:{column:7422,edge:7674,old:5462,pencil:5358,young:5932}};
 const expectedBranches={column:193,edge:203,old:137,pencil:145,young:156};
 const expectedClusters={column:1512,edge:1560,old:1086,pencil:1048,young:1195};
 assert.deepEqual(report,expected);
 for(const f of spec.variants){
  const branches=skeleton.branches[f.id],clusters=skeleton.clusters[f.id];
  assert.equal(branches.length,expectedBranches[f.id]);assert.equal(clusters.length,expectedClusters[f.id]);
  assert.equal(new Set(branches.map(b=>b.key)).size,branches.length);
  assert.equal(new Set(clusters.map(c=>c.id)).size,clusters.length);
  assert.equal(clusters.filter(c=>c.role==="hanging").length,branches.length);
  assert.ok(clusters.filter(c=>c.role==="inner").length>=branches.length,"every primary branch retains connected inner foliage");
  for(const b of branches){
   assert.ok(clusters.some(c=>c.branch===b.key&&c.role==="inner"));
   assert.ok(clusters.some(c=>c.branch===b.key&&c.role==="hanging"));
  }
  const tiers=Map.groupBy(branches,b=>b.tier);let irregular=0;
  for(const row of tiers.values())if(Math.max(...row.map(b=>b.y))-Math.min(...row.map(b=>b.y))>.15)irregular++;
  assert.ok(irregular>tiers.size*.7,"branch origins do not form mechanically level rings");
 }
 for(const lod of ["hi","mid"]){
  const b=await readFile(new URL("../../public/assets/v2/schrenk-spruce-"+lod+".glb",import.meta.url)),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  assert.equal(j.meshes.length,15);assert.equal(j.materials.length,3);assert.equal(j.images.length,lod==="hi"?3:2);
  const leaf=j.materials.find(m=>m.name==="frond");
  assert.equal(leaf.alphaMode,"MASK");assert.ok(Math.abs(leaf.alphaCutoff-.45)<1e-6,"asset and runtime use the same opacity cut");
  assert.equal(leaf.doubleSided,true);
  assert.deepEqual(leaf.pbrMetallicRoughness.baseColorFactor.map(v=>Math.round(v*100)),[96,100,74,100],"warm albedo must survive GLB export");
  assert.equal(leaf.pbrMetallicRoughness.metallicFactor,0);
  assert.ok(Math.abs(leaf.pbrMetallicRoughness.roughnessFactor-.88)<1e-6);
  const binary=b.subarray(28+b.readUInt32LE(12));
  const vectors=(accessor)=>{
   const a=j.accessors[accessor],v=j.bufferViews[a.bufferView],stride=v.byteStride||12,out=[];
   assert.equal(a.componentType,5126);assert.equal(a.type,"VEC3");
   for(let i=0;i<a.count;i++)out.push([0,1,2].map(k=>binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*stride+k*4)));
   return out;
  };
  for(const mesh of j.meshes)for(const p of mesh.primitives){
   assert.ok(p.attributes._PLANT_WIND!==undefined);assert.ok(p.attributes._CROWN_OCCLUSION!==undefined);
   for(const w of vectors(p.attributes._PLANT_WIND)){assert.ok(w.every(Number.isFinite));assert.ok(w[0]>=0&&w[0]<=1.1);assert.ok(w[1]>=0&&w[1]<=.56);}
   for(const normal of vectors(p.attributes.NORMAL))assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-5,"finite unit normals for both foliage and bark");
  }
  for(const f of spec.variants){
   const clusters=skeleton.clusters[f.id],branches=skeleton.branches[f.id],inner=clusters.filter(c=>c.role==="inner").length;
   const triangles=lod==="hi"?(clusters.length-inner)*10+inner*6+branches.length*24+192+120:(clusters.length*4+branches.length*6+96+120);
   assert.equal(report[lod][f.id],triangles+(f.base>2?80:0),"budget is explained by retained sprays and structural geometry");
   assert.ok(report[lod][f.id]<(lod==="hi"?20000:8000));
   assert.equal(j.meshes.filter(m=>m.name.startsWith(f.id+"_")).reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0),0),report[lod][f.id]);
   const mesh=j.meshes.find(m=>m.name===f.id+"_frond"),node=j.nodes.find(n=>n.mesh===j.meshes.indexOf(mesh));
   assert.equal(node.extras.foliageClusters,clusters.length);
   const points=new Set(vectors(mesh.primitives[0].attributes.POSITION).map(p=>p.map(n=>Math.round(n*10000)).join(",")));
   const has=(p)=>{
    p=p.map(n=>Math.round(n*10000));
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(points.has([p[0]+dx,p[1]+dy,p[2]+dz].join(",")))return true;
    return false;
   };
   // Every near/mid cluster keeps the same orthogonal hanging root and tip.
   // This catches an entire lost side-spray class, not just matching triangle totals.
   for(const c of clusters){
    const vertical=[Math.sin(c.az)*Math.sin(c.roll),-Math.cos(c.az)*Math.sin(c.roll),Math.cos(c.roll)];
    for(const t of [0,1])for(const side of [.52,-1]){
     const dz=Math.tan(c.pitch)*t-c.droop*t*t+.10*Math.max(0,t-.65)**2/.1225;
     const point=[c.origin[0]+Math.cos(c.az)*c.length*t,c.origin[1]+Math.sin(c.az)*c.length*t,c.origin[2]+c.length*dz];
     for(let k=0;k<3;k++)point[k]+=vertical[k]*c.width*.48*side;
     assert.ok(has([point[0],point[2],-point[1]]),f.id+" "+lod+" retains cluster "+c.id+" side silhouette");
    }
   }
   const bark=j.meshes.find(m=>m.name===f.id+"_bark"),positions=vectors(bark.primitives[0].attributes.POSITION);
   const root=positions.filter(p=>Math.abs(p[1])<1e-5).map(p=>Math.hypot(p[0]-f.lean*.25,p[2]));
   assert.ok(root.length>=6);assert.ok(Math.max(...root)>(f.id==="young"?.36:.43),"root collar widens without moving the root");
   assert.ok(Math.max(...root)-Math.min(...root)>.035,"root collar has irregular radial relief");
   assert.ok(positions.some(p=>p[1]<-.24),"trunk still penetrates the ground");
  }
 }
});
test("forest edge candidates leave open meadow, water and infrastructure untouched",async()=>{
 const {forestFloorAt,createForestFloorGeometry,FOREST_FLOOR}=await import("./forest-floor.js");
 const open=world(),edge=world();edge.landcoverAt=(x,z)=>({r:.58+.25*Math.sin(x/16),g:0,b:0,a:1});
 const wet=world();wet.hydrology={sampleAt:(x,z)=>({wetness:Math.abs(z)<5?.7:0,bank:Math.abs(z)<5?.6:0,insideWater:Math.abs(z)<1.1})};
 let shrubs=0,sedges=0;
 for(let iz=-30;iz<30;iz++)for(let ix=-30;ix<30;ix++){
  assert.equal(forestFloorAt(open,ix,iz),null);
  assert.equal(forestFloorAt(edge,ix,iz,()=>true),null);
  const p=forestFloorAt(edge,ix,iz);if(p){assert.deepEqual(p,forestFloorAt(edge,ix,iz));if(p.kind==="shrub")shrubs++;}
  const s=forestFloorAt(wet,ix,iz);if(s){assert.equal(s.kind,"sedge");assert.ok(Math.abs(s.z)>=1.1);sedges++;}
 }
 assert.ok(shrubs>100);assert.ok(sedges>30);
 let budget=0;for(const kind of ["shrub","sedge","fern","deadwood","stone"]){const g=createForestFloorGeometry(kind),tri=(g.index?.count??g.attributes.position.count)/3;for(const a of Object.values(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n));budget+=tri*FOREST_FLOOR.capacity[kind];g.dispose();}
 assert.ok(budget<1500000,"bounded instanced understory pools cannot expand into a full-world decoration layer");
});
test("forest floor incremental pools preserve ID and retained instance slots",()=>{
 const w=world();w.landcoverAt=(x,z)=>({r:.6+.22*Math.sin(x/16),g:0,b:0,a:1});
 const eco=new WorldEcology(w),floor=eco.forestFloor,cam=camera();
 for(let i=0;i<60;i++){floor.update(cam);assert.ok(floor.stats.builtThisFrame<=2);if(!floor.stats.pending)break;}
 const pool=floor.pools.get("shrub"),record=pool.records.find(p=>Math.hypot(p.x,p.z)<30);assert.ok(record);const slot=record.slot,buffer=pool.mesh.instanceMatrix.array;
 cam.position.x=13;floor.update(cam);assert.strictEqual(pool.mesh.instanceMatrix.array,buffer);assert.strictEqual(pool.records[slot],record);
 for(const p of pool.records)assert.equal(eco.excluded(p.x,p.z,.85,true),false);
 for(const p of floor.pools.values()){assert.equal(p.mesh.castShadow,true);assert.ok(p.mesh.count<=p.mesh.instanceMatrix.count);assert.ok(p.mesh.customDepthMaterial);}
 const priorRevision=floor.stats.revision;cam.position.set(1200,101.7,-1200);floor.update(cam);
 assert.ok(floor.stats.revision>priorRevision);for(const p of floor.pools.values())assert.ok(p.records.every(r=>Math.hypot(r.x-cam.position.x,r.z-cam.position.z)<180));
 eco.dispose();
});

test("new plant shaders compose with the live CSM, cloud and aerial material contract",async()=>{
 const {WorldEnvironment}=await import("./environment.js"),{CSM}=await import("three/addons/csm/CSM.js");
 const {createCloudUniforms}=await import("./cloud-field.js"),{createAerialUniforms}=await import("./aerial-perspective.js"),{installCrownOcclusion}=await import("./spruce-geometry.js");
 const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(60,1,.1,5000);cam.updateMatrixWorld();
 const csm=new CSM({camera:cam,parent:scene,cascades:3,maxFar:500,shadowMapSize:256});
 const eco=new WorldEcology(world()),tree=attachEcologyWind(new THREE.MeshStandardMaterial(),eco.uniforms,5,false,true);installCrownOcclusion(tree);
 const materials=[...eco.materials,tree],env={csm,registered:new Set(),clouds:createCloudUniforms(),aerial:createAerialUniforms(new THREE.Vector3(0,1,0))};
 WorldEnvironment.prototype.register.call(env,materials);
 for(const m of materials){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/ecoOffset/);assert.match(shader.vertexShader,/vCloudWorld/);
  assert.match(shader.fragmentShader,/cloudDirectAttenuation = cloudTransmittance/);assert.match(shader.fragmentShader,/applyAerialPerspective\(gl_FragColor.rgb, vCloudWorld\)/);
  assert.match(shader.fragmentShader,/IncidentLight directLight/);
  assert.equal(shader.uniforms.uWorldCSMView.value,cam.matrixWorldInverse);
  assert.match(shader.fragmentShader,/uWorldCSMView \* vec4\(vCloudWorld, 1.0\)/);assert.ok(shader.uniforms.uWindTime);assert.ok(shader.uniforms.uAerialSun);
  assert.equal((shader.vertexShader.match(/void main\(\)/g)||[]).length,1);
 }
 assert.equal(env.registered.size,materials.length);eco.dispose();tree.dispose();csm.remove();csm.dispose();
});

test("fixed-world tree batches keep every original instance and clip shadow submission spatially",()=>{
 const w=world();w.landcoverAt=()=>({r:1,g:0,b:0,a:1});
 const eco=new WorldEcology(w),cam=camera(7,-5);
 const resources=[];
 for(const mode of [5,1])for(let variant=0;variant<5;variant++)for(let part=0;part<3;part++){
  const geometry=new THREE.BoxGeometry(1.5,18,1.5);geometry.translate(0,9,0);
  const material=new THREE.MeshStandardMaterial(),depth=new THREE.MeshDepthMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1600);mesh.count=0;mesh.customDepthMaterial=depth;
  eco.nearParts.push({variant,mode,mesh});eco.materials.push(material);resources.push({geometry,material,depth,mesh});
 }
 eco.rebuildNearTrees(cam);
 const source=[];
 for(let iz=Math.floor((cam.position.z-252)/12);iz<=Math.floor((cam.position.z+252)/12);iz++)for(let ix=Math.floor((cam.position.x-252)/12);ix<=Math.floor((cam.position.x+252)/12);ix++){
  const t=eco.treeAt(ix,iz);if(t&&Math.hypot(t.x-cam.position.x,t.z-cam.position.z)<252)source.push(t);
 }
 for(let partIndex=0;partIndex<eco.nearParts.length;partIndex++){
  const part=eco.nearParts[partIndex],expected=source.filter(t=>t.variant===part.variant&&(part.mode===5?Math.hypot(t.x-cam.position.x,t.z-cam.position.z)<82:Math.hypot(t.x-cam.position.x,t.z-cam.position.z)>24)).map(t=>t.id).sort();
  const actual=[...eco.nearTreeBatches.values()].filter(b=>b.partIndex===partIndex).flatMap(b=>b.records.map(t=>t.id)).sort();
  assert.deepEqual(actual,expected);
 }
 for(const b of eco.nearTreeBatches.values()){
  assert.ok(b.mesh.count<=64);for(const key of Object.keys(eco.nearParts[b.partIndex].mesh.geometry.attributes))assert.strictEqual(b.mesh.geometry.attributes[key],eco.nearParts[b.partIndex].mesh.geometry.attributes[key]);assert.strictEqual(b.mesh.geometry.index,eco.nearParts[b.partIndex].mesh.geometry.index);assert.strictEqual(b.mesh.material,eco.nearParts[b.partIndex].mesh.material);assert.strictEqual(b.mesh.customDepthMaterial,eco.nearParts[b.partIndex].mesh.customDepthMaterial);
  for(const r of b.records)assert.equal(b.chunk,Math.floor(r.x/eco.treeBatchSize)+","+Math.floor(r.z/eco.treeBatchSize));
 }
 const shadow=new THREE.OrthographicCamera(-60,60,60,-60,1,300);shadow.position.set(cam.position.x,220,cam.position.z);shadow.up.set(0,0,-1);shadow.lookAt(cam.position.x,100,cam.position.z);shadow.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(shadow.projectionMatrix,shadow.matrixWorldInverse));
 eco.group.updateMatrixWorld(true);let sourceMid=0,submittedMid=0;
 for(const b of eco.nearTreeBatches.values())if(b.mode===1){sourceMid+=b.mesh.count;if(b.mesh.intersectsFrustum(frustum))submittedMid+=b.mesh.count;}
 assert.ok(submittedMid<sourceMid*.4,JSON.stringify({sourceMid,submittedMid}));
 const first=[...eco.nearTreeBatches.values()][0],buffer=first.mesh.instanceMatrix.array,ids=first.ids;
 eco.rebuildNearTrees(cam);assert.strictEqual(first.mesh.instanceMatrix.array,buffer);assert.equal(first.ids,ids);
 let retired=0;for(const b of eco.nearTreeBatches.values())b.mesh.addEventListener("dispose",()=>retired++);
 const oldCount=eco.nearTreeBatches.size;cam.position.set(1200,101.7,-1200);eco.rebuildNearTrees(cam);assert.equal(retired,oldCount);
 let geometriesDisposed=0,depthsDisposed=0;resources.forEach(r=>{r.geometry.addEventListener("dispose",()=>geometriesDisposed++);r.depth.addEventListener("dispose",()=>depthsDisposed++);});
 eco.dispose();assert.equal(geometriesDisposed,resources.length);assert.equal(depthsDisposed,resources.length);assert.equal(eco.nearTreeBatches.size,0);
});

test("static LOD modes and matched early culling skip only fully rejected colour/depth instances",()=>{
 const uniforms={uWindTime:{value:1},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
 const sm=(a,b,d)=>{const x=Math.max(0,Math.min(1,(d-a)/(b-a)));return x*x*(3-2*x);};
 // These are the original fragment acceptance inequalities, including the far n=0 endpoint.
 const accepted=(mode,d,n)=>{
  const needleTree=1-sm(9,15,d),nearTree=1-sm(42,62,d),middleTree=1-sm(165,235,d),nearGrass=1-sm(23,33,d),nearFlower=1-sm(11,17,d);
  if(mode===0)return !(n<middleTree||n>1-sm(1980,2200,d));
  if(mode===1)return !(n<nearTree||n>=middleTree);
  if(mode===2)return n<nearGrass;
  if(mode===3)return n<nearFlower;
  if(mode===4)return !(n<nearGrass||n>=1-sm(62,78,d));
  if(mode===5)return n>=needleTree&&n<nearTree;
  if(mode===12)return n<needleTree;
  if(mode===6)return !(n<nearFlower||n>=1-sm(31,42,d));
  const thresholds={7:[17,25],8:[75,110],9:[50,78],10:[80,110],11:[42,65]};
  const [a,b]=thresholds[mode];return n<1-sm(a,b,d);
 };
 const endpoints=[0,9,11,15,17,23,25,31,33,42,50,62,65,75,78,110,165,235,1980,2200,2500];
 const distances=[...endpoints.flatMap(d=>[Math.max(0,d-.0001),d,d+.0001]),...Array.from({length:1001},(_,i)=>i*.25)];
 const ns=[0,Number.EPSILON,1e-5,.001,.01,.1,.25,.5,.75,.99,.999999];
 const keys=new Set();
 for(let mode=0;mode<13;mode++){
  const herb=mode>=2&&mode!==5&&mode<10,tree=mode===1||mode===5||mode===12;
  const color=attachEcologyWind(new THREE.MeshStandardMaterial(),uniforms,mode,herb,tree),depth=attachEcologyWind(new THREE.MeshDepthMaterial(),uniforms,mode,herb,tree);
  const shaders=[{uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader},{uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader}];
  color.onBeforeCompile(shaders[0]);depth.onBeforeCompile(shaders[1]);keys.add(color.customProgramCacheKey());
  const early=shaders.map(s=>s.vertexShader.match(/\/\/ ECO_LOD_EARLY_BEGIN\nif \(([^)]+)\)/)[1]);assert.equal(early[0],early[1]);
  const culled=new Function("vPlantDistance","return "+early[0]);
  for(const d of distances)if(culled(d))for(const n of ns)assert.equal(accepted(mode,d,n),false,JSON.stringify({mode,d,n}));
  for(const shader of shaders){
   assert.match(shader.vertexShader,new RegExp("const float uPlantMode="+mode+"\\.0;"));
   assert.doesNotMatch(shader.vertexShader+shader.fragmentShader,/uniform float uPlantMode/);
   assert.equal(shader.uniforms.uPlantMode,undefined);
   const main=shader.vertexShader.indexOf("void main()"),end=shader.vertexShader.indexOf("// ECO_LOD_EARLY_END",main),wind=shader.vertexShader.indexOf("vec2 ecoOffset=ecoBend",main);
   assert.ok(end<wind);assert.ok(shader.vertexShader.indexOf("gl_Position=vec4(2.,2.,2.,1.);",main)<end);
   assert.equal((shader.vertexShader.match(/vPlantDistance=distance/g)||[]).length,1);
   assert.ok(shader.vertexShader.indexOf("#include <begin_vertex>",main)>end);
  }
  const mixed={0:[200,2100],1:[50,180],2:[25],3:[13],4:[27,70],5:[50],6:[13,35],7:[20],8:[90],9:[60],10:[95],11:[50],12:[12]};
  for(const d of mixed[mode]){assert.equal(culled(d),false);assert.ok(ns.some(n=>accepted(mode,d,n)));}
  if(mode===0){assert.equal(culled(2200),false);assert.equal(accepted(0,2200,0),true);}
  color.dispose();depth.dispose();
 }
 assert.equal(keys.size,13);
});


test("fern understory has divided arched fronds, fixed roots and building/water exclusions",async()=>{
 const {forestFloorAt,createForestFloorGeometry}=await import("./forest-floor.js");
 const w=world();w.landcoverAt=()=>({r:.85,g:0,b:0,a:1});
 const records=[];
 for(let iz=-30;iz<30;iz++)for(let ix=-30;ix<30;ix++){
  const p=forestFloorAt(w,ix,iz);
  if(p?.kind==="fern"){records.push(p);assert.deepEqual(p,forestFloorAt(w,ix,iz));assert.equal(forestFloorAt(w,ix,iz,()=>true),null);}
 }
 assert.ok(records.length>100);
 w.hydrology={sampleAt:()=>({insideWater:true,wetness:1,bank:1})};
 assert.equal(forestFloorAt(w,8,8),null);
 const g=createForestFloorGeometry("fern");g.computeBoundingBox();
 assert.ok(g.boundingBox.max.y<.65&&g.boundingBox.max.y>.3);
 assert.ok(g.boundingBox.max.x-g.boundingBox.min.x>1);
 assert.ok(g.index.count/3<1200);
 for(const [name,a]of Object.entries(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n),name);
 g.dispose();
});
