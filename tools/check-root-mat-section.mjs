// Local candidate contract only; never touches runtime, public assets or root IDs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../web/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const dir=new URL('../assets/src/v2/shore/root-mat-section-candidate/',import.meta.url);
const meta=JSON.parse(readFileSync(new URL('asset.json',dir)));
const raw=readFileSync(new URL('exports/root-mat-section.glb',dir));
const json=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)).toString());
assert.equal(json.asset.version,'2.0');assert.equal(json.meshes.length,2);assert.equal(json.materials.length,2);
assert.equal(json.images?.length??0,0);assert.equal(json.animations?.length??0,0);assert.equal(json.cameras?.length??0,0);
for(const m of json.materials){assert.equal(m.alphaMode??'OPAQUE','OPAQUE');assert.equal(m.pbrMetallicRoughness.metallicFactor??1,0);assert.ok(m.pbrMetallicRoughness.roughnessFactor>=.85);}
const result=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
result.scene.updateMatrixWorld(true);
let triangles=0,vertices=0,meshes=0,minDoubleArea=Infinity,minNormalLength=Infinity,maxNormalLength=0,buried=0,exposed=0,maxProtrusion=-Infinity;
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
result.scene.traverse(o=>{
 if(!o.isMesh)return;meshes++;assert.equal(o.userData.detailRole,'root-mat-fragment');
 assert.ok(!/PREVIEW/.test(o.name));assert.ok(!o.material.map&&!o.material.normalMap);
 const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,ix=o.geometry.index;
 assert.ok(ix&&p&&n);vertices+=p.count;triangles+=ix.count/3;
 for(let i=0;i<p.count;i++){
  a.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert.ok([a.x,a.y,a.z].every(Number.isFinite));
  const normalLength=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));assert.ok(Math.abs(normalLength-1)<1e-4);minNormalLength=Math.min(minNormalLength,normalLength);maxNormalLength=Math.max(maxNormalLength,normalLength);
  const bx=a.x,by=-a.z,bz=a.y,face=-bz*1.18+.003*Math.sin(bx*16)+.0015*Math.sin(bz*47+bx*11),d=by-face;
  if(d<0)buried++;else exposed++;maxProtrusion=Math.max(maxProtrusion,d);
 }
 for(let i=0;i<ix.count;i+=3){a.fromBufferAttribute(p,ix.getX(i));b.fromBufferAttribute(p,ix.getX(i+1));c.fromBufferAttribute(p,ix.getX(i+2));const area=u.subVectors(b,a).cross(v.subVectors(c,a)).length();assert.ok(Number.isFinite(area)&&area>1e-14);minDoubleArea=Math.min(minDoubleArea,area);}
});
assert.equal(meshes,2);assert.equal(triangles,meta.triangles);assert.ok(buried>vertices*.25&&exposed>vertices*.10,'roots must be both embedded and partially visible');
assert.ok(maxProtrusion<.012,'no centimetre-scale floating strings over representative soil');
const bounds=new THREE.Box3().setFromObject(result.scene),expectedMin=[meta.boundsBlenderMeters.min[0],meta.boundsBlenderMeters.min[2],-meta.boundsBlenderMeters.max[1]],expectedMax=[meta.boundsBlenderMeters.max[0],meta.boundsBlenderMeters.max[2],-meta.boundsBlenderMeters.min[1]];
for(let i=0;i<3;i++){assert.ok(Math.abs(bounds.min.getComponent(i)-expectedMin[i])<1e-6);assert.ok(Math.abs(bounds.max.getComponent(i)-expectedMax[i])<1e-6);}
const source=readFileSync(new URL('root-mat-section.blend',dir));assert.equal(createHash('sha256').update(source).digest('hex'),meta.sourceSHA256);
const report={passed:true,loader:'actual Three GLTFLoader.parseAsync',meshes,materials:json.materials.length,vertices,triangles,glbBytes:raw.length,sourceBytes:source.length,glbSHA256:createHash('sha256').update(raw).digest('hex'),boundsThree:{min:bounds.min.toArray(),max:bounds.max.toArray()},minDoubleArea,minNormalLength,maxNormalLength,representativeFace:{buriedVertices:buried,exposedVertices:exposed,maxProtrusionMeters:maxProtrusion},note:'These are export, dimensions and representative-substrate checks; no production terrain/contact/adoption claim.'};
writeFileSync(new URL('validation.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
