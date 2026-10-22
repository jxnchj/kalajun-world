import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {createEntities} from "./world-data.js";
import {SETTLEMENT_ASSETS,settlementAssetFor,settlementMeshRole,settlementAssetViewpoints} from "./settlement-assets.js";

// Real GLB geometry/material descriptors; bitmap decoding and rendered appearance
// are checked separately in Blender/browser, not emulated by this Node test.
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>({width:1,height:1,byteLength:blob.size,close(){}});
const PUBLIC=new URL("../../public/",import.meta.url);
const readJSON=async path=>JSON.parse(await readFile(new URL(path,PUBLIC),"utf8"));
const models=new Map();
async function model(path){
  if(!models.has(path))models.set(path,(async()=>{
    const data=await readFile(new URL(path,PUBLIC));
    assert.equal(data.toString("ascii",0,4),"glTF");
    const json=JSON.parse(data.toString("utf8",20,20+data.readUInt32LE(12)));
    const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),"");
    gltf.scene.updateMatrixWorld(true);
    const meshes=[];gltf.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
    return{gltf,json,meshes,bytes:data.length};
  })());
  return models.get(path);
}
const tris=g=>(g.index?.count??g.attributes.position.count)/3;
const vector=a=>new THREE.Vector3(...a);
const within=(p,f)=>f.shape==="circle"?Math.hypot(p[0],p[2])<f.radius:p[0]>f.x0&&p[0]<f.x1&&p[2]>f.z0&&p[2]<f.z1;
const pose={x:1234,y:2050,z:-700,rot:.63,scale:{x:1.2,y:.95,z:.78}};
const matrix=new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,pose.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.rot),new THREE.Vector3(pose.scale.x,pose.scale.y,pose.scale.z));

test("authored metadata and module agree; original 113 houses and 72 yurts retain layout authority",async()=>{
  const objects=await readJSON("data/objects.json"),manifest=await readJSON("world-v2/manifest.json");
  const entities=createEntities(objects,manifest.assetMetadata);
  for(const [id,a] of Object.entries(SETTLEMENT_ASSETS)){
    assert.equal(settlementAssetFor(id),a);
    assert.equal(entities.filter(e=>e.assetId===id).length,a.instanceCount);
    const representative=entities.find(e=>e.id===a.representativeId);assert.ok(representative);
    assert.equal(representative.assetId,id);
    const metadata=await readJSON("assets/"+a.metadataURL);
    for(const key of ["floor","floorY","openings","entry","window","representativeId"])assert.deepEqual(metadata[key],a[key],id+":"+key);
    assert.equal(metadata.count,a.instanceCount);
    assert.ok(metadata.provenance.includes("not surveyed"));
    const source=await readFile(new URL("../../../"+a.source,import.meta.url));
    assert.ok(source.toString("ascii",0,7)==="BLENDER"||source.readUInt32LE(0)===0xfd2fb528,"Blender source header or Blender zstd container");
  }
  assert.equal(settlementAssetFor("yurt_deck"),null);
});

test("both actual GLBs retain PBR maps, explicit new detail roles and valid AO/sky channels",async()=>{
  for(const [id,a]of Object.entries(SETTLEMENT_ASSETS)){
    const m=await model("assets/"+a.url);
    let triangles=0,newMeshes=0,mapped=0,aoCount=0;
    const materials=new Set();
    for(const n of m.meshes){
      triangles+=tris(n.geometry);materials.add(n.material);
      assert.ok(n.material.isMeshStandardMaterial);
      const p=n.geometry.attributes.position;
      for(const x of p.array)assert.ok(Number.isFinite(x));
      if(n.material.map){mapped++;assert.ok(n.geometry.attributes.uv);}
      const c=n.geometry.attributes.color;
      if(c){
        aoCount++;
        for(let i=0;i<c.count;i++){
          assert.ok(Math.abs(c.getX(i)-c.getY(i))<1e-5,"COLOR_0 is AO,AO,sky, not RGB");
          for(let j=0;j<3;j++)assert.ok(c.getComponent(i,j)>=0&&c.getComponent(i,j)<=1);
        }
      }else assert.ok(n.material.transparent,"opaque mesh lacks baked occlusion "+n.name);
      if(n.name.startsWith("pastoral_")){
        newMeshes++;assert.ok(["body","interior","fine"].includes(n.userData.detailRole));
        assert.equal(settlementMeshRole(id,n.name,n.userData),n.userData.detailRole);
      }
    }
    assert.ok(newMeshes>55);
    assert.ok(mapped>20&&aoCount>50);
    assert.ok(materials.size<=28);
    const softTriangles=m.meshes.filter(n=>n.userData.softGoodsVersion==="pastoral-soft-goods-27").reduce((sum,n)=>sum+tris(n.geometry),0);
    const tea=m.meshes.filter(n=>n.userData.teaServiceVersion==="pastoral-tea-service-28");
    const teaDelta=tea.reduce((sum,n)=>sum+tris(n.geometry)-n.userData.teaServiceOriginalTriangles,0);
    const bedding=m.meshes.filter(n=>n.userData.beddingVersion==="pastoral-bedding-29");
    const beddingDelta=bedding.reduce((sum,n)=>sum+tris(n.geometry)-n.userData.beddingOriginalTriangles,0);
    const joinery=m.meshes.filter(n=>n.userData.joineryVersion==="pastoral-joinery-30");
    const joineryDelta=joinery.reduce((sum,n)=>sum+tris(n.geometry)-n.userData.joineryOriginalTriangles,0);
    const porch=m.meshes.filter(n=>n.userData.porchVersion==="pastoral-porch-31"),porchDelta=porch.reduce((sum,n)=>sum+tris(n.geometry),0);
    assert.equal(porch.length,id==="house_a"?7:0);assert.equal(porchDelta,id==="house_a"?24304:0);
    assert.equal(joinery.length,id==="house_a"?4:3);
    assert.equal(joineryDelta,id==="house_a"?4916:5076,"woodwork has its own explicit geometry budget");
    assert.equal(bedding.length,id==="house_a"?3:2);
    assert.equal(beddingDelta,id==="house_a"?21956:13100,"bedding has an explicit bounded geometry cost");
    assert.ok(triangles-softTriangles-teaDelta-beddingDelta-joineryDelta-porchDelta<40000,"unchanged reusable base exceeds its original triangle budget");
    assert.equal(tea.length,id==="house_a"?36:31);
    assert.equal(teaDelta,id==="house_a"?16708:12268,"tea service has an explicit bounded near-interior geometry cost");
    assert.ok(softTriangles<=33280,"seven authored soft goods exceed their explicit near-interior budget");
    assert.ok(triangles-teaDelta-beddingDelta-joineryDelta-porchDelta<72500,"retained v27 near asset exceeds its original combined budget");
    assert.ok(triangles-joineryDelta-porchDelta<(id==="house_a"?111000:85600),"complete authored near asset exceeds its updated explicit budget");
    assert.ok(m.json.images.every(im=>im.bufferView!==undefined&&!im.uri),"PBR image references must be self-contained");
    if(id==="yurt")assert.equal(settlementMeshRole(id,"yurt_orange",m.gltf.scene.getObjectByName("yurt_orange").userData),null,"mixed crown/lattice must use legacy spatial classification");
    console.log(JSON.stringify({asset:id,bytes:m.bytes,meshes:m.meshes.length,triangles,materials:materials.size,newMeshes,mapped}));
  }
});

test("exact existing pad and exterior shell geometry survives complete interior replacement",async()=>{
  for(const[id,a]of Object.entries(SETTLEMENT_ASSETS)){
    const old=(await model("assets/"+id+".glb")).gltf.scene,current=(await model("assets/"+a.url)).gltf.scene;
    const padName=id+(id==="yurt"?"_padc":"_pad");
    const p=old.getObjectByName(padName),q=current.getObjectByName(padName);
    assert.ok(p&&q,padName);
    p.matrixWorld.elements.forEach((x,i)=>assert.ok(Math.abs(x-q.matrixWorld.elements[i])<1e-6));
    const names=id==="house_a"?["log","logend","plinth","stone","shingle","shutter"]:["felt","chiy","band","rope","plinth","stone"];
    const expanded=n=>{
      const g=n.geometry,p=g.attributes.position,index=g.index,v=new THREE.Vector3();
      const points=[];
      for(let i=0;i<(index?.count??p.count);i++){
        v.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(n.matrixWorld);
        points.push(v.toArray().map(x=>x.toFixed(5)).join(","));
      }
      return points.sort();
    };
    for(const name of names){
      const oldMesh=old.getObjectByName(id+"_"+name),newMesh=current.getObjectByName(id+"_"+name);
      assert.ok(oldMesh&&newMesh,id+"_"+name);
      const oldPoints=expanded(oldMesh),newPoints=expanded(newMesh);
      assert.equal(newPoints.length,oldPoints.length,"shell triangle count changed "+id+"_"+name);
      const mismatch=oldPoints.reduce((n,p,i)=>n+(p!==newPoints[i]),0);
      assert.equal(mismatch,0,"shell position mismatch count "+id+"_"+name);
    }
  }
});

test("local eyes have clear standing space, real floors and unobstructed outward openings",async()=>{
  for(const[id,a]of Object.entries(SETTLEMENT_ASSETS)){
    const {meshes}=await model("assets/"+a.url);
    const solid=meshes.filter(n=>!n.material.transparent);
    for(const kind of["entry","window"]){
      const from=a[kind].from;assert.ok(within(from,a.floor));
      const floor=new THREE.Raycaster(vector(from),new THREE.Vector3(0,-1,0)).intersectObjects(solid,false)[0];
      assert.ok(floor,"missing floor "+id+":"+kind);
      assert.ok(Math.abs(floor.point.y-a.floorY)<.08,"viewpoint stands on furniture "+id+":"+kind+" "+floor.object.name+" y="+floor.point.y);
      for(const dir of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
        const near=new THREE.Raycaster(vector(from),vector(dir),0,.12).intersectObjects(solid,false);
        assert.equal(near.length,0,"eye intersects surface "+id+":"+kind);
      }
    }
    const from=vector(a.window.from),to=vector(a.window.to),direction=to.clone().sub(from).normalize();
    const hits=new THREE.Raycaster(from,direction,0,from.distanceTo(to)).intersectObjects(solid,false);
    assert.equal(hits.length,0,"outward view is blocked "+id+": "+hits[0]?.object.name);
  }
});

test("world viewpoints use authoritative posed metres, nonuniform scales and viewing angles",()=>{
  const entities=Object.values(SETTLEMENT_ASSETS).map(a=>Object.freeze({id:a.representativeId,assetId:a.sourceAsset,x:0,z:0}));
  const views=settlementAssetViewpoints({entities,surface:{buildingPose:()=>pose,heightAt:()=>2048}});
  assert.equal(views.length,4);
  for(const v of views){
    const a=SETTLEMENT_ASSETS[v.assetId],kind=v.id.endsWith("-entry")?"entry":"window";
    const expected=vector(a[kind].from).applyMatrix4(matrix),to=vector(a[kind].to).applyMatrix4(matrix);
    assert.ok(expected.distanceTo(new THREE.Vector3(v.x,v.y,v.z))<1e-10);
    assert.equal(v.above,v.y-2048);
    const dx=to.x-v.x,dy=to.y-v.y,dz=to.z-v.z;
    assert.ok(Math.abs(v.yaw-Math.atan2(dx,-dz)*180/Math.PI)<1e-9);
    assert.ok(Math.abs(v.pitch-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI)<1e-9);
  }
});

test("wood-house lining has physical thickness and leaves the original door/window apertures clear",async()=>{
  const {meshes}=await model("assets/"+SETTLEMENT_ASSETS.house_a.url);
  const lining=meshes.filter(n=>n.name.startsWith("pastoral_house_lining_"));
  assert.ok(lining.length>100);
  assert.equal(new Set(lining.map(n=>n.material)).size,1,"lining must batch under one new material");
  for(const mesh of lining){
    assert.equal(mesh.userData.detailRole,mesh.name.startsWith("pastoral_house_lining_sill_")?"body":"interior","finish detail must not add permanent far-distance shell cost");
    assert.equal(mesh.material.name,"v2_pastoral_lining");
    assert.ok(mesh.material.map&&mesh.material.roughnessMap&&mesh.material.normalMap);
    const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3());
    assert.ok(Math.min(size.x,size.y,size.z)>.015,"paper-thin lining mesh "+mesh.name);
    assert.ok(box.min.y>=.019&&box.max.y<2.25,"lining should not cover the upper log/roof structure");
  }
  let rays=0;
  for(const {cx,z,direction}of[{cx:-2,z:2.5,direction:1},{cx:0,z:-2.5,direction:-1}]){
    for(const dx of[-.50,-.25,0,.25,.50])for(const y of[.95,1.15,1.4,1.7,1.95]){
      const ray=new THREE.Raycaster(new THREE.Vector3(cx+dx,y,z-direction*.7),new THREE.Vector3(0,0,direction),0,1.4);
      assert.equal(ray.intersectObjects(lining,false).length,0,"lining clips an original window aperture");rays++;
    }
  }
  for(const x of[.5,.7,1,1.3,1.5])for(const y of[.10,.50,1,1.5,1.9]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,1.8),new THREE.Vector3(0,0,1),0,1.4);
    assert.equal(ray.intersectObjects(lining,false).length,0,"lining clips the original entry");rays++;
  }
  assert.equal(rays,75);
});

test("interior timber sill covers conceal original stone protrusions without raising the room floor",async()=>{
  const {gltf,meshes}=await model("assets/"+SETTLEMENT_ASSETS.house_a.url);
  const stone=gltf.scene.getObjectByName("house_a_stone"),p=stone.geometry.attributes.position;
  const screens=meshes.filter(n=>n.name.startsWith("pastoral_house_lining_")||n.name==="pastoral_house_entry_threshold"||n.name==="house_a_plank");
  const eye=new THREE.Vector3(0,1.6,0);let checked=0;
  const seen=new Set();
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(stone.matrixWorld);
    if(v.y<=.035||v.y>=.5||Math.abs(v.x)>=3.4||Math.abs(v.z)>=2.3)continue;
    const key=v.toArray().join(",");if(seen.has(key))continue;seen.add(key);
    const ray=new THREE.Raycaster(eye,v.clone().sub(eye).normalize(),0,eye.distanceTo(v)-.0001);
    const hit=ray.intersectObjects(screens,false)[0];
    assert.ok(hit,"uncovered interior stone point "+key);checked++;
  }
  assert.ok(checked>25);
  const floor=new THREE.Raycaster(new THREE.Vector3(1,1.6,1.8),new THREE.Vector3(0,-1,0)).intersectObjects(meshes,false)[0];
  assert.ok(Math.abs(floor.point.y-.03)<.00001,"room floor was raised");
  console.log(JSON.stringify({concealedUniqueStoneVertices:checked,floorY:floor.point.y}));
});

test("refined room assets retain fine textile transforms, sewn pillows and finite contact data",async()=>{
  for(const [path,pillowCount]of[["v2/house_a_lived.glb",2],["v2/yurt_lived.glb",1],["v2/gh_lanchuan_rooms.glb",6]]){
    const {json,meshes}=await model("assets/"+path);
    const fabrics=json.materials.filter(m=>/^(v2_pastoral_(linen|wool|red|blue|gold)|v2_(linen|taupe|curtain))$/.test(m.name));
    assert.ok(fabrics.length>=3,path);
    for(const material of fabrics){
      const pbr=material.pbrMetallicRoughness;
      assert.ok(pbr.baseColorTexture&&pbr.metallicRoughnessTexture&&material.normalTexture,material.name);
      assert.deepEqual(material.normalTexture.extensions.KHR_texture_transform.scale,[3,3]);
      assert.deepEqual(pbr.metallicRoughnessTexture.extensions.KHR_texture_transform.scale,[3,3]);
      assert.ok(!pbr.baseColorTexture.extensions?.KHR_texture_transform,"keep motif size independent of fine thread detail");
      assert.ok(material.normalTexture.scale<=.75);
    }
    const pillows=meshes.filter(n=>n.name.includes("pillow")&&/^(pastoral_|freedom)/.test(n.name));
    assert.equal(pillows.length,pillowCount);
    for(const n of pillows){
      assert.equal(n.userData.surfaceRefinement,"interior-surfaces-1");
      assert.equal(tris(n.geometry),704,"idempotent local pillow refinement");
      n.geometry.computeBoundingBox();
      const dimensions=n.geometry.boundingBox.getSize(new THREE.Vector3()).toArray().sort((a,b)=>a-b);
      assert.ok(dimensions[0]>.23&&dimensions[0]<.25,"pillow thickness stays within original placement");
      assert.ok(dimensions[2]>.77&&dimensions[2]<.85,"pillow footprint stays on original bed");
      const color=n.geometry.attributes.color;
      assert.ok(color);
      for(let i=0;i<color.count;i++){
        assert.ok(color.getX(i)>=.249&&color.getX(i)<=1);
        assert.ok(Math.abs(color.getX(i)-color.getY(i))<1e-5);
        assert.ok(color.getZ(i)>=0&&color.getZ(i)<=1);
      }
    }
    for(const n of meshes.filter(n=>/^(pastoral_|freedom)/.test(n.name)&&!n.material.transparent)){
      const c=n.geometry.attributes.color;assert.ok(c,n.name);
      for(let i=0;i<c.count;i++)assert.ok(c.getX(i)>=.249&&c.getX(i)<=1,"1m contact AO outside range "+n.name);
    }
  }
});


test("textile drapes keep their triangle budgets and finite closed-thickness surfaces",async()=>{
  const counts=[["v2/house_a_lived.glb",5,39636],["v2/yurt_lived.glb",5,27600],["v2/gh_lanchuan_rooms.glb",12,167930]];
  for(const[path,count,total]of counts){
    const {meshes}=await model("assets/"+path),cloth=meshes.filter(n=>n.userData.textileRefinement==="interior-fabrics-1");
    assert.equal(cloth.length,count,path);
    const soft=meshes.filter(n=>n.userData.softGoodsVersion==="pastoral-soft-goods-27");
    const existingTotal=meshes.filter(n=>!soft.includes(n)&&!n.userData.porchVersion).reduce((sum,n)=>sum+tris(n.geometry),0);
    // The 7 old 108-triangle cloth blocks are intentionally replaced by the
    // separately budgeted soft-goods family. Untouched drape topology stays.
    const teaDelta=meshes.filter(n=>n.userData.teaServiceVersion==="pastoral-tea-service-28").reduce((sum,n)=>sum+tris(n.geometry)-n.userData.teaServiceOriginalTriangles,0);
    const beddingDelta=meshes.filter(n=>n.userData.beddingVersion==="pastoral-bedding-29").reduce((sum,n)=>sum+tris(n.geometry)-n.userData.beddingOriginalTriangles,0);
    const joineryDelta=meshes.filter(n=>n.userData.joineryVersion==="pastoral-joinery-30").reduce((sum,n)=>sum+tris(n.geometry)-n.userData.joineryOriginalTriangles,0);
    assert.equal(existingTotal+soft.length*108-teaDelta-beddingDelta-joineryDelta,total,"untouched cloth must reuse its topology");
    for(const n of cloth){
      const kind=n.userData.textileKind,g=n.geometry,p=g.attributes.position,normal=g.attributes.normal,index=g.index;
      const beddingBudget={pastoral_house_bed_quilt:13664,pastoral_house_bed_foot:5600,pastoral_yurt_sleep_quilt:9632};
      assert.equal(tris(g),n.userData.beddingVersion==="pastoral-bedding-29"?beddingBudget[n.name]:kind==="curtain"?1296:n.name.startsWith("freedom")?4352:776,n.name);
      assert.ok(g.attributes.uv&&normal);
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      for(let i=0;i<p.count;i++){
        assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)),n.name);
        a.fromBufferAttribute(normal,i);assert.ok(Math.abs(a.length()-1)<1e-4,"invalid textile normal "+n.name);
      }
      for(let i=0;i<index.count;i+=3){
        a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
        assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-14,"collapsed fabric triangle "+n.name);
      }
      const box=new THREE.Box3().setFromObject(n);
      if(kind==="rug")assert.ok(box.min.y>=.0305,"rug penetrates the existing room floor");
      if(kind==="curtain"){
        const size=box.getSize(new THREE.Vector3());
        // The authored hem starts at .105 m; the new bottom release is at most 6 mm.
        assert.ok(size.x<.59&&box.min.y>.097&&box.max.y<2.50,"curtain leaves its rail/aperture envelope");
      }
      assert.ok(n.material.normalMap&&n.material.roughnessMap&&n.material.map);
    }
  }
});

test("bed runners follow the actual exported quilt mesh without layer intersections",async()=>{
  for(const path of["v2/house_a_lived.glb","v2/gh_lanchuan_rooms.glb"]){
    const {gltf}=await model("assets/"+path),scene=gltf.scene;
    const pairs=path.includes("house")?
      [["pastoral_house_bed_foot","pastoral_house_bed_quilt",-2,.29,.68,1.15]]:
      [1,2,3].map((n,i)=>["freedom"+n+"_runner","freedom"+n+"_duvet",[.6,5.9,12][i],1.44,1.90,.98]);
    for(const[runnerName,quiltName,cx,y0,y1,halfWidth]of pairs){
      const runner=scene.getObjectByName(runnerName),quilt=scene.getObjectByName(quiltName);
      const materials=new Set([runner.material,quilt.material]),sides=new Map([...materials].map(m=>[m,m.side]));
      for(const m of materials)m.side=THREE.DoubleSide;
      let checked=0,minimum=Infinity;
      try{
        for(let j=0;j<=20;j++)for(let i=0;i<=40;i++){
          const x=cx-halfWidth+2*halfWidth*i/40,z=-(y0+(y1-y0)*j/20);
          const ray=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));
          const over=ray.intersectObject(runner,false),under=ray.intersectObject(quilt,false);
          assert.ok(over.length>=2&&under.length>=1,"test ray left paired bed fabrics");
          const clearance=over.at(-1).point.y-under[0].point.y;minimum=Math.min(minimum,clearance);checked++;
          assert.ok(clearance>=.001,"runner underside intersects quilt "+runnerName+" at "+x+","+z);
          assert.ok(clearance<.025,"runner floats above quilt "+runnerName);
        }
      }finally{for(const[m,side]of sides)m.side=side;}
      assert.equal(checked,861);
      console.log(JSON.stringify({fabric:runnerName,clearanceSamples:checked,minClearanceM:minimum}));
    }
  }
});


test("authored folded blankets and cushions retain their layout envelope and add no material slots",async()=>{
  for(const id of ["house_a","yurt"]){
    const {meshes,json}=await model("assets/v2/"+id+"_lived.glb");
    const soft=meshes.filter(n=>n.userData.softGoodsVersion==="pastoral-soft-goods-27");
    assert.equal(soft.length,7);
    const blankets=soft.filter(n=>n.name.includes("_chest_folded"));
    assert.equal(blankets.length,4);
    assert.equal(soft.reduce((sum,n)=>sum+tris(n.geometry),0),33280);
    for(const n of soft){
      assert.equal(n.userData.detailRole,"interior");
      const blanket=blankets.includes(n),g=n.geometry;
      assert.equal(tris(g),blanket?5872:3264);
      g.computeBoundingBox();const d=g.boundingBox.getSize(new THREE.Vector3());
      const expected=blanket?[id==="house_a"?.84:1.19,.095,.54]:id==="house_a"?[.53,.16,.52]:[.5,.17,.5];
      expected.forEach((v,i)=>assert.ok(Math.abs(d.getComponent(i)-v)<1e-6,"unchanged original furniture envelope "+n.name));
      assert.ok(n.material.map&&n.material.normalMap&&n.material.roughnessMap);
      assert.ok(!n.material.transparent,"soft goods are opaque geometry, not alpha cards");
      assert.equal(n.material.name,blanket?["v2_pastoral_blue","v2_pastoral_gold","v2_pastoral_red","v2_pastoral_linen"][Number(n.name.slice(-1))]:n.material.name);
      const p=g.attributes.position,c=g.attributes.color,norm=g.attributes.normal;
      for(let i=0;i<p.count;i++){
        assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));
        assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(norm,i).length()-1)<1e-4);
        assert.ok(c.getX(i)>=.249&&c.getX(i)<=1&&c.getZ(i)>=0&&c.getZ(i)<=1);
        assert.ok(Math.abs(c.getX(i)-c.getY(i))<1e-5);
      }
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c0=new THREE.Vector3();
      for(let i=0;i<g.index.count;i+=3){
        a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c0.fromBufferAttribute(p,g.index.getX(i+2));
        assert.ok(b.sub(a).cross(c0.sub(a)).lengthSq()>1e-18,"collapsed sewn triangle "+n.name);
      }
    }
    assert.ok(json.materials.length<=28);
  }
});

test("authored tea service keeps existing object/material counts and genuine hollow vessels",async()=>{
 for(const id of ["house_a","yurt"]){
  const {meshes}=await model("assets/v2/"+id+"_lived.glb");
  assert.equal(meshes.filter(n=>n.name!=="pastoral_house_entry_joinery"&&!n.userData.porchVersion).length,id==="house_a"?259:92);
  const tea=meshes.filter(n=>n.userData.teaServiceVersion==="pastoral-tea-service-28");
  assert.equal(tea.reduce((sum,n)=>sum+tris(n.geometry),0),id==="house_a"?19904:14464);
  assert.equal(tea.filter(n=>n.userData.teaServiceKind.includes("spout")).length,2);
  const box=new THREE.Box3(),center=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const n of tea){
   assert.equal(n.userData.detailRole,"fine");assert.equal(n.material.transparent,false);
   assert.ok(["v2_pastoral_brass","v2_pastoral_ceramic","v2_pastoral_wood","v2_pastoral_iron"].includes(n.material.name));
   const g=n.geometry;
   for(let i=0;i<g.attributes.normal.count;i++){
    normal.fromBufferAttribute(g.attributes.normal,i);
    assert.ok(Number.isFinite(normal.length())&&Math.abs(normal.length()-1)<1e-4,n.name+" finite unit normals");
   }
   if(n.userData.teaServiceKind.includes("bowl")){
    box.setFromObject(n);box.getCenter(center);
    const ray=new THREE.Raycaster(new THREE.Vector3(center.x,box.max.y+.01,center.z),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObject(n,false);assert.ok(hits.length>0);
    assert.ok(box.max.y-hits[0].point.y>.045,"bowl needs a real deep cavity, not a sealed cap "+n.name);
    assert.ok(hits[0].point.y>box.min.y+.012,"bowl floor must retain real thickness "+n.name);
   }
   if(n.userData.teaServiceKind.includes("spout")){
    const body=meshes.find(m=>m.name===n.name.replace("_spout",""));assert.ok(body);
    box.setFromObject(body);box.getCenter(center);
    const tip=new THREE.Vector3(center.x+.220,box.min.y+.230,center.z),axis=new THREE.Vector3(.070,.033,0).normalize();
    const ray=new THREE.Raycaster(tip.clone().addScaledVector(axis,.012),axis.clone().negate(),0,.025);
    assert.equal(ray.intersectObject(n,false).length,0,"mouth centre must open into the curved hollow spout");
    ray.ray.origin.z+=.019;
    assert.ok(ray.intersectObject(n,false).length>0,"mouth must have an actual surrounding metal wall");
   }
  }
 }
});


test("authored bedding retains the supporting mattress envelope and real layered surfaces",async()=>{
  for(const id of ["house_a","yurt"]){
    const {meshes}=await model("assets/v2/"+id+"_lived.glb");
    const bedding=meshes.filter(n=>n.userData.beddingVersion==="pastoral-bedding-29");
    const mattress=bedding.find(n=>n.userData.beddingKind.includes("mattress"));
    const box=new THREE.Box3().setFromObject(mattress),size=box.getSize(new THREE.Vector3());
    const expected=id==="house_a"?[2.38,.13,1.70]:[.88,.14,1.9];
    size.toArray().forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<2e-6,"original supporting mattress envelope"));
    assert.equal(tris(mattress.geometry),4352);
    for(const n of bedding){
      assert.ok(n.material.map&&n.material.normalMap&&n.material.roughnessMap);
      assert.ok(n.geometry.attributes.uv&&n.geometry.attributes.color);
      const p=n.geometry.attributes.position;
      for(const v of p.array)assert.ok(Number.isFinite(v));
      assert.equal(n.userData.detailRole,"interior");
    }
    // Independent vertical rays through the actual quilt must hit both top and
    // underside. This checks filled thickness, not a two-sided transparent card.
    const q=bedding.find(n=>n.name.includes("quilt")),side=q.material.side;q.material.side=THREE.DoubleSide;
    const cx=id==="house_a"?-2:-2.15,cy=id==="house_a"?1.12:.18,w=id==="house_a"?2.4:.95,d=id==="house_a"?1.67:1.9;
    try{for(let j=1;j<12;j++)for(let i=1;i<12;i++){
      const ray=new THREE.Raycaster(new THREE.Vector3(cx+(i/12-.5)*w,2,-(cy+(j/12-.5)*d)),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObject(q,false);assert.ok(hits.length>=2);
      const thickness=hits[0].point.y-hits.at(-1).point.y;
      assert.ok(thickness>.013&&thickness<.027,"quilt must retain 14–26 mm filled thickness");
    }}finally{q.material.side=side;}
  }
});


test("woodwork has real bed under-clearance, supported mattress and safe entrance headroom",async()=>{
 for(const id of ["house_a","yurt"]){
  const {gltf}=await model("assets/v2/"+id+"_lived.glb");
  const bed=gltf.scene.getObjectByName(id==="house_a"?"pastoral_house_sleep_platform":"pastoral_yurt_bedframe");
  const box=new THREE.Box3().setFromObject(bed),c=box.getCenter(new THREE.Vector3());
  const ray=new THREE.Raycaster(new THREE.Vector3(c.x,box.min.y+.08,box.max.z+.1),new THREE.Vector3(0,0,-1),0,box.max.z-box.min.z+.2);
  assert.equal(ray.intersectObject(bed,false).length,0,"frame must provide open space below supporting aprons");
  ray.set(new THREE.Vector3(c.x,box.max.y+.1,c.z+.017),new THREE.Vector3(0,-1,0));ray.far=1;
  const hit=ray.intersectObject(bed,false)[0];assert.ok(hit&&Math.abs(hit.point.y-box.max.y)<.006,"mattress remains carried by real upper slats");
  if(id==="house_a"){
   const entry=gltf.scene.getObjectByName("pastoral_house_entry_joinery");assert.ok(entry);box.setFromObject(entry);
   assert.ok(box.min.y>=1.8599,"support knees remain high and outside the door swing");
   const ep=entry.geometry.attributes.position;
   for(let i=0;i<ep.count;i++){const v=new THREE.Vector3().fromBufferAttribute(ep,i).applyMatrix4(entry.matrixWorld);if(v.x>.1&&v.x<1.9)assert.ok(v.y>=2.0599,"central passage retains 2.06m clear headroom");}
   assert.ok(box.max.z<3.061&&box.min.x>-.121&&box.max.x<2.121,"small wall-supported entrance hood stays inside original exterior footprint");
  }
 }
});

test('covered porch gives the real door approach headroom, a reachable tread and coherent metadata',async()=>{
 const {gltf,meshes}=await model('assets/v2/house_a_lived.glb'),porch=meshes.filter(n=>n.userData.porchVersion==='pastoral-porch-31');
 assert.equal(porch.length,7);assert.ok(porch.every(n=>n.userData.detailRole==='body'));
 const bounds=new THREE.Box3();for(const n of porch)bounds.expandByObject(n);
 const authored=SETTLEMENT_ASSETS.house_a.outdoor;
 assert.ok(bounds.min.x>=authored.x0&&bounds.max.x<=authored.x1);
 assert.ok(bounds.max.z<=authored.z1+.001);assert.ok(bounds.max.z>=authored.z1-.001);
 const ray=new THREE.Raycaster();gltf.scene.updateMatrixWorld(true);
 for(const x of [.75,1,1.25])for(const z of [3.15,3.6,4.25]){
  ray.set(new THREE.Vector3(x,.15,z),new THREE.Vector3(0,1,0));
  const hits=ray.intersectObjects(meshes,false);assert.ok(hits.length>0);
  assert.ok(hits[0].point.y>=1.94,JSON.stringify({x,z,hit:hits[0].point.y}));
 }
 ray.set(new THREE.Vector3(1,1,4.65),new THREE.Vector3(0,-1,0));
 const step=ray.intersectObjects(porch,false)[0];assert.ok(step);assert.ok(Math.abs(step.point.y+.19)<.001);
});
