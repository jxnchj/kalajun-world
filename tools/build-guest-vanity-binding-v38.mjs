import fs from 'node:fs';import crypto from 'node:crypto';import * as THREE from '../web/node_modules/three/build/three.module.js';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
const meta=JSON.parse(read('assets/src/v2/settlements/guest-vanity-v38/metadata.json')),raw=read('web/public/assets/v2/gh_lanchuan_rooms.glb'),n=raw.readUInt32LE(12),d=JSON.parse(raw.subarray(20,20+n)),bin=raw.subarray(28+n);
function attr(i){const a=d.accessors[i],v=d.bufferViews[a.bufferView],w={SCALAR:1,VEC3:3}[a.type],s={5123:2,5125:4,5126:4}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),arr=[];for(let k=0;k<a.count;k++)for(let j=0;j<w;j++){const off=start+k*(v.byteStride||s*w)+j*s;arr.push(a.componentType===5126?bin.readFloatLE(off):a.componentType===5123?bin.readUInt16LE(off):bin.readUInt32LE(off));}return arr;}
const parent=new Map();d.nodes.forEach((n,i)=>n.children?.forEach(c=>parent.set(c,i)));
function matrix(i){const n=d.nodes[i],m=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));return parent.has(i)?matrix(parent.get(i)).multiply(m):m;}
const removed=new Set(meta.removed.map(o=>o.name)),parts=[];
d.nodes.forEach((node,i)=>{if(!removed.has(node.name))return;for(const p of d.meshes[node.mesh].primitives){const xyz=attr(p.attributes.POSITION),m=matrix(i),v=new THREE.Vector3();for(let k=0;k<xyz.length;k+=3){v.fromArray(xyz,k).applyMatrix4(m);v.toArray(xyz,k);}parts.push({name:node.name,positions:xyz,indices:attr(p.indices)});}});
const collision={sourceSHA256:meta.originalGLBSHA256,parts};
fs.writeFileSync(new URL('web/src/v2/generated/guest-vanity-collision-38.json',root),JSON.stringify(collision));
fs.writeFileSync(new URL('web/src/v2/generated/guest-vanity-source-38.json',root),JSON.stringify({sourceGLB:'assets/v2/gh_lanchuan_rooms_vanity38.glb',sourceSHA256:meta.candidateSHA256,originalSHA256:meta.originalGLBSHA256,triangles:meta.candidateTriangles,bytes:meta.candidateBytes,removedTriangles:meta.removedTriangles},null,2)+'\n');
console.log(JSON.stringify({parts:parts.length,triangles:parts.reduce((n,p)=>n+p.indices.length/3,0),sourceSHA256:meta.candidateSHA256}));
