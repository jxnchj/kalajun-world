import * as THREE from 'three';
export const waterEmptyBackpassEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('waterEmptyBackpass38')==='1';
// Caller must audit its authored vertex hook: waves may modify normals, never positions.
// This is not a generic ShaderMaterial certification API. No renderer changes here.
export function certifyStaticWaterPositions(mesh,{auditedHook=undefined}={}){
 const m=mesh.material,g=mesh.geometry;
 if(!m?.isMeshStandardMaterial||m.onBeforeCompile!==auditedHook||!auditedHook||m.displacementMap||mesh.isSkinnedMesh||mesh.isInstancedMesh||Object.keys(g.morphAttributes||{}).length)throw Error('Unverified water position program');
 return {mesh,geometry:g,position:g.attributes.position,index:g.index,positionVersion:g.attributes.position.version,indexVersion:g.index?.version,hook:auditedHook,material:m,defines:JSON.stringify(m.defines||{}),displacementScale:m.displacementScale,displacementBias:m.displacementBias};
}
const fail=reason=>({eligible:false,reason,triangles:0});
export function proveEmptyWaterBackpass(mesh,camera,contract,{epsilon=1e-5}={}){
 const g=mesh.geometry,m=mesh.material,p=g?.attributes.position,idx=g?.index;
 if(!contract||contract.mesh!==mesh||contract.geometry!==g||contract.material!==m||contract.hook!==m.onBeforeCompile||contract.defines!==JSON.stringify(m.defines||{})||m.displacementMap||m.displacementScale!==contract.displacementScale||m.displacementBias!==contract.displacementBias||mesh.isSkinnedMesh||mesh.isInstancedMesh||Object.keys(g.morphAttributes||{}).length)return fail('position-program-changed');
 if(p!==contract.position||idx!==contract.index||p.version!==contract.positionVersion||idx?.version!==contract.indexVersion||p.itemSize!==3||p.isInterleavedBufferAttribute||p.normalized)return fail('geometry-changed');
 if(!camera?.isPerspectiveCamera&&!camera?.isOrthographicCamera)return fail('unsupported-camera');
 if(!m.transparent||m.side!==THREE.DoubleSide||m.forceSinglePass||m.transmission>0)return fail('not-original-double-pass');
 if(!(epsilon>0)||!Number.isFinite(epsilon))return fail('invalid-tolerance');
 // Local-space facing matches Three's determinant-aware frontFace winding. This
 // includes negative/nonuniform scales without confusing normal with position.
 const e=mesh.matrixWorld.elements;if(!e.every(Number.isFinite)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1||Math.abs(mesh.matrixWorld.determinant())<1e-12)return fail('unsupported-transform');
 const inv=new THREE.Matrix4().copy(mesh.matrixWorld).invert(),q=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv),direction=new THREE.Vector3();
 if(camera.isOrthographicCamera)direction.set(0,0,1).transformDirection(camera.matrixWorld).transformDirection(inv);
 if(![...q.toArray(),...direction.toArray()].every(Number.isFinite))return fail('invalid-camera');
 const ie=inv.elements,tolerance=epsilon*Math.hypot(ie[0],ie[1],ie[2],ie[4],ie[5],ie[6],ie[8],ie[9],ie[10]);
 const start=Math.max(0,g.drawRange.start),end=Math.min(idx?.count??p.count,start+g.drawRange.count);
 if(start%3||end%3||end<=start)return fail('unsupported-draw-range');
 const a=p.array,ids=idx?.array;let checked=0,minMargin=Infinity;
 for(let k=start;k<end;k+=3){const ia=(ids?ids[k]:k)*3,ib=(ids?ids[k+1]:k+1)*3,ic=(ids?ids[k+2]:k+2)*3;
  const ux=a[ib]-a[ia],uy=a[ib+1]-a[ia+1],uz=a[ib+2]-a[ia+2],vx=a[ic]-a[ia],vy=a[ic+1]-a[ia+1],vz=a[ic+2]-a[ia+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,n=Math.hypot(nx,ny,nz);checked++;
  if(!Number.isFinite(n)||n<=1e-12)return {...fail('degenerate-triangle'),triangles:checked};
  const margin=camera.isOrthographicCamera?(nx*direction.x+ny*direction.y+nz*direction.z)/n:(nx*(q.x-a[ia])+ny*(q.y-a[ia+1])+nz*(q.z-a[ia+2]))/n;
  if(!Number.isFinite(margin)||margin<=(camera.isOrthographicCamera?epsilon:tolerance))return {...fail('back-or-edge-triangle'),triangles:checked};
  minMargin=Math.min(minMargin,margin);
 }
 return {eligible:true,reason:'all-actual-triangles-front',triangles:checked,minMargin};
}
