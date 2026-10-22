import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {MeadowWindField} from "./wind-field.js";
import {sampleTreeWind,treeRootWind,createTreeWindGeometry,disposeTreeWindGeometry,SpruceRootWind} from "./spruce-wind.js";
import {configureSpruceMaterial,installNeedleSurface} from "./spruce-material.js";
import {attachEcologyWind} from "./ecology.js";
const close=(a,b,e=2e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function reference(field,x,z,t){
  x=Math.fround(x);z=Math.fround(z);t=Math.fround(t);
  const u=(x-field.origin.x)/field.span,v=(z-field.origin.y)/field.span,p=x*.023+z*.017-t*.4;
  const distant=[.38+.12*Math.sin(p),.38+.12*Math.sin(p+.168),.5+.25*Math.sin(p*.7),.5],edge=Math.min(u,v,1-u,1-v);
  if(edge<=0)return distant;
  const n=field.resolution;
  function texture(tex){
    const out=[0,0,0,0],sx=u*n-.5,sy=v*n-.5,ix=Math.floor(sx),iy=Math.floor(sy);
    for(const [dx,dy,w]of [[0,0,(1-(sx-ix))*(1-(sy-iy))],[1,0,(sx-ix)*(1-(sy-iy))],[0,1,(1-(sx-ix))*(sy-iy)],[1,1,(sx-ix)*(sy-iy)]]){
      const i=(Math.max(0,Math.min(n-1,iy+dy))*n+Math.max(0,Math.min(n-1,ix+dx)))*4;
      for(let k=0;k<4;k++)out[k]+=tex.image.data[i+k]/255*w;
    }return out;
  }
  const a=texture(field.previous),b=texture(field.current),blend=field.uniforms.uWindFieldBlend.value,w=Math.max(0,Math.min(1,edge/.08)),e=w*w*(3-2*w);
  return a.map((x,k)=>distant[k]*(1-e)+(x*(1-blend)+b[k]*blend)*e);
}
test("root wind retains RGBA8 bilinear centres, delayed channels, temporal interpolation and world-dependent outer flow",()=>{
 const f=new MeadowWindField();f.update(100.7,{x:-3610.730641,z:4806.40659});
 for(const blend of[0,.13,.51,1]){
  f.uniforms.uWindFieldBlend.value=blend;
  for(const u of[-.8,0,.00390625,.02,.08,.4911,.95,1,2.5])for(const v of[0,.00390625,.06,.5,.978,1.1]){
   const x=f.origin.x+u*f.span,z=f.origin.y+v*f.span;
   const a=sampleTreeWind(f,x,z,100.74),b=reference(f,x,z,100.74);a.forEach((n,k)=>close(n,b[k],8e-6));
  }
 }
 const a=sampleTreeWind(f,f.origin.x-100,f.origin.y,100),b=sampleTreeWind(f,f.origin.x-200,f.origin.y,100);
 assert.ok(Math.abs(a[0]-b[0])>.02,"outside points must not clamp to one border gust");
 f.dispose();
});
test("cached force keeps the original trunk/branch displacement for rotation, phase and delayed wind",()=>{
 const f=new MeadowWindField();f.update(2,{x:-3600,z:4800});f.uniforms.uWindFieldBlend.value=.47;let maximum=0;
 for(const x of[-4000,-3610.7306,-3400])for(const z of[4560,4806.4066,5200])for(const rot of[-3.1,-.2,1.57,5])for(const s of[.72,1.48]){
  const root={x,z,rot,s},field=reference(f,x,z,2.07),force=treeRootWind(f,root,2.07),d=new THREE.Vector2(.82-.36*(field[3]-.5)*.5,.36+.82*(field[3]-.5)*.5).normalize();
  const mat=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rot),new THREE.Vector3(s,s,s));
  const m=Float32Array.from(mat.elements),sx=new THREE.Vector2(m[0],m[2]).normalize(),sz=new THREE.Vector2(m[8],m[10]).normalize(),direction=new THREE.Vector2(d.dot(sx),d.dot(sz));
  for(const y of[0,.2,4,10,18,22])for(const w of[[0,0,0],[.4,.2,.7],[1,.55,6.1]]){
   const bend=(r,g,eddy,dx,dz)=>{const current=r*(1-w[0]*.48)+g*w[0]*.48,h=Math.min(20,Math.max(0,y)),branch=w[1]*(Math.sin(2.07*.85+w[2])*.018+(g-current)*.12),main=(current+(current-g)*.32)*h*h*.0014+branch;return[dx*main-dz*eddy*w[1]*.018,dz*main+dx*eddy*w[1]*.018];};
   const old=bend(field[0],field[1],field[2]-.5,direction.x,direction.y),now=bend(force[2],force[3],force[4],force[0],force[1]);
   maximum=Math.max(maximum,Math.hypot(now[0]-old[0],now[1]-old[1]));assert.ok(maximum<1e-5,"world displacement agrees within 0.01 mm");
  }
 }f.dispose();
});
test("static tree attributes stay shared, per-instance wind is isolated, and disposal retains other tile buffers",()=>{
 const source=new THREE.BoxGeometry(1,18,1),a=createTreeWindGeometry(source,64),b=createTreeWindGeometry(source,64);
 for(const key of Object.keys(source.attributes)){assert.strictEqual(a.attributes[key],source.attributes[key]);assert.strictEqual(b.attributes[key],source.attributes[key]);}
 assert.strictEqual(a.index,b.index);assert.notStrictEqual(a.attributes.aTreeRootWind.data,b.attributes.aTreeRootWind.data);
 assert.strictEqual(a.attributes.aTreeRootWind.data,a.attributes.aTreeRootEddy.data);
 assert.equal(Object.keys(a.attributes).length+3<=16,true,"instance matrix needs four attribute locations; WebGL2 minimum is sixteen");
 let disposed=0;a.addEventListener("dispose",()=>{disposed++;assert.deepEqual(Object.keys(a.attributes).sort(),["aTreeRootEddy","aTreeRootWind"]);assert.equal(a.index,null);});
 disposeTreeWindGeometry(a);assert.equal(disposed,1);assert.ok(source.attributes.position.array.length);assert.strictEqual(b.index,source.index);
 disposeTreeWindGeometry(b);source.dispose();
});
test("only active unique roots are sampled once, unchanged frames avoid uploads, all render passes share data",t=>{
 const field=new MeadowWindField();field.update(4,{x:-3600,z:4800});const roots=Array.from({length:1050},(_,i)=>({id:"spruce:"+i,x:-3800+(i%42)*10,z:4600+Math.floor(i/42)*10,rot:i*.17,s:1}));
 const source=new THREE.BoxGeometry(1,18,1),batches=new Map(),force=new SpruceRootWind();
 for(let part=0;part<3;part++)for(let chunk=0;chunk<21;chunk++){
  const records=roots.slice(chunk*50,chunk*50+50),geometry=force.createGeometry(source,64,"1:0:"+chunk);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial(),64);mesh.count=records.length;
  batches.set(part+":"+chunk,{mesh,activeRecords:records});
 }
 assert.equal(force.update(batches,field,4.01,1),true);
 assert.equal(force.stats.roots,1050);assert.equal(force.stats.partInstances,3150);assert.equal(force.stats.bytes,21000);assert.equal(force.stats.batches,21);
 const versions=[...batches.values()].map(b=>b.mesh.geometry.attributes.aTreeRootWind.data.version);
 assert.equal(force.update(batches,field,4.01,1),false);assert.deepEqual([...batches.values()].map(b=>b.mesh.geometry.attributes.aTreeRootWind.data.version),versions);
 for(let chunk=0;chunk<21;chunk++)for(let part=1;part<3;part++)assert.deepEqual(batches.get(part+":"+chunk).mesh.geometry.attributes.aTreeRootWind.array,batches.get("0:"+chunk).mesh.geometry.attributes.aTreeRootWind.array);
 const times=[];for(let i=0;i<50;i++){force.update(batches,field,4.02+i*.016,1);times.push(force.stats.cpuMs);}
 times.sort((a,b)=>a-b);t.diagnostic("1050 unique roots / 3150 part instances: CPU median "+times[25].toFixed(3)+" ms; 21,000 upload bytes/frame in 21 shared buffers; not a GPU benchmark");
 for(const b of batches.values()){disposeTreeWindGeometry(b.mesh.geometry);b.mesh.material.dispose();b.mesh.dispose();}source.dispose();field.dispose();force.dispose();
});
test("opaque spruce keeps opacity while cutout fronds and shared colour/depth wind retain their contracts",()=>{
 const bark=configureSpruceMaterial(new THREE.MeshStandardMaterial()),leaf=configureSpruceMaterial(new THREE.MeshStandardMaterial({alphaTest:.45}));
 assert.equal(bark.alphaTest,0);assert.equal(leaf.alphaTest,.45);assert.equal(leaf.transparent,false);
 const uniforms={uWindTime:{value:1},uWorldViewer:{value:new THREE.Vector3()}};
 for(const mode of[1,5])for(const material of[new THREE.MeshStandardMaterial(),new THREE.MeshDepthMaterial()]){
  configureSpruceMaterial(material);attachEcologyWind(material,uniforms,mode,false,true);
  const library=material.isMeshDepthMaterial?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={uniforms:{},vertexShader:library.vertexShader,fragmentShader:library.fragmentShader};material.onBeforeCompile(shader);
  assert.equal(material.defines.ECO_ROOT_WIND,"");assert.match(shader.vertexShader,/#ifdef ECO_ROOT_WIND\s+vec4 field=vec4\(aTreeRootWind.zw/);assert.match(shader.vertexShader,/sin\(t\*\.85\+weights.z\)/);
  assert.strictEqual(shader.uniforms.uWindTime,uniforms.uWindTime);assert.match(shader.fragmentShader,/smoothstep\(42.,62.,vPlantDistance\)/);
  material.dispose();
 }
 bark.dispose();leaf.dispose();
});

test("three tree parts share one buffer, preserve it until last release and reject mismatched root order",()=>{
 const source=new THREE.BoxGeometry(1,18,1),force=new SpruceRootWind(),key="1:3:-38,50";
 const geometries=Array.from({length:3},()=>force.createGeometry(source,64,key)),buffer=geometries[0].attributes.aTreeRootWind.data;
 assert.equal(force.allocations.size,1);
 for(const g of geometries){assert.strictEqual(g.attributes.aTreeRootWind.data,buffer);assert.strictEqual(g.attributes.aTreeRootEddy.data,buffer);assert.equal(g.userData.treeWindAllocation.references,3);}
 let retainedDisposals=0,lastDisposal=0;
 for(const g of geometries.slice(0,2))g.addEventListener("dispose",()=>{retainedDisposals++;assert.deepEqual(Object.keys(g.attributes),[],"retiring non-final part cannot delete shared force buffer");});
 geometries[2].addEventListener("dispose",()=>{lastDisposal++;assert.deepEqual(Object.keys(geometries[2].attributes).sort(),["aTreeRootEddy","aTreeRootWind"]);});
 const records=[{id:"spruce:-301:400",x:-3601,z:4801,rot:.2,s:1},{id:"spruce:-302:400",x:-3613,z:4801,rot:1.4,s:1}];
 const batches=new Map(geometries.map((g,i)=>[i,{mesh:{geometry:g,count:2},activeRecords:records.slice()}]));
 const field=new MeadowWindField();field.update(1,{x:-3600,z:4800});force.update(batches,field,1,1);assert.equal(force.stats.batches,1);assert.equal(force.stats.bytes,40);
 const version=buffer.version;
 batches.get(1).activeRecords.reverse();
 assert.throws(()=>force.update(batches,field,1.01,2),/identical active root order/);assert.equal(buffer.version,version);
 batches.get(1).activeRecords.reverse();force.update(batches,field,1.01,2);assert.equal(buffer.version,version+1);
 for(const b of batches.values()){b.activeRecords.length=0;b.mesh.count=0;}force.update(batches,field,1.02,3);assert.equal(force.stats.batches,0);assert.equal(buffer.version,version+1);
 for(const b of batches.values()){b.activeRecords.push(records[1]);b.mesh.count=1;}force.update(batches,field,1.03,4);assert.equal(force.stats.bytes,20);assert.equal(buffer.version,version+2);
 disposeTreeWindGeometry(geometries[0]);disposeTreeWindGeometry(geometries[0]);assert.equal(retainedDisposals,1);assert.equal(force.allocations.size,1);assert.equal(geometries[2].userData.treeWindAllocation.references,2);
 disposeTreeWindGeometry(geometries[1]);assert.equal(retainedDisposals,2);assert.equal(force.allocations.size,1);assert.strictEqual(geometries[2].attributes.aTreeRootWind.data,buffer);
 disposeTreeWindGeometry(geometries[2]);assert.equal(lastDisposal,1);assert.equal(force.allocations.size,0);
 const replacement=force.createGeometry(source,64,key);assert.notStrictEqual(replacement.attributes.aTreeRootWind.data,buffer);
 disposeTreeWindGeometry(replacement);assert.equal(force.allocations.size,0);field.dispose();source.dispose();force.dispose();
});
