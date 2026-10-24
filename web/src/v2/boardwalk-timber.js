import * as THREE from 'three';
import {BOARDWALK_ENDPOINTS,BOARDWALK_CABIN} from './boardwalk-endpoints.js';
import kit from './generated/boardwalk-timber-38.json' with {type:'json'};
const layouts=new WeakMap(),UP=new THREE.Vector3(0,1,0);
export const boardwalkTimberEnabled=()=>new URLSearchParams(globalThis.location?.search||'').get('boardwalkTimber')!=='0';
export function timberGeometry(kind){const p=kit.parts[kind],g=new THREE.BufferGeometry();for(const [name,n]of [['position',3],['normal',3],['uv',2]])g.setAttribute(name,new THREE.Float32BufferAttribute(p[name],n));const indices=[];for(const materialIndex of [0,1]){const start=indices.length;for(const group of p.groups||[])if(group.materialIndex===materialIndex)for(let i=group.start;i<group.start+group.count;i++)indices.push(i);if(indices.length>start)g.addGroup(start,indices.length-start,materialIndex);}if(indices.length)g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();return g;}
function matrix(kind,position,size,rotation=new THREE.Quaternion()) {const unit=kit.parts[kind].size;return new THREE.Matrix4().compose(new THREE.Vector3(...position),rotation,new THREE.Vector3(...size.map((v,i)=>v/unit[i])));}
// Correct only the audited cabin endpoint in derived geometry. The original
// objects.json line remains available for comparison and provenance. cabin.py
// authors porch front z=5.1 and five .30m treads, last centre=6.5/outside=6.65.
export function boardwalkRoutePoints(world,index,line){
 const original=line.pts;
 if(index!==0||new URLSearchParams(globalThis.location?.search||'').get('boardwalkEndpoint')==='0')return{points:original,correction:null};
 const entity=world.entities?.find(e=>e.id===BOARDWALK_CABIN.entityId);if(!entity)return{points:original,correction:null};
 const q=world.surface.buildingPose(entity),c=Math.cos(q.rot),s=Math.sin(q.rot),local=[0,6.65];
 const end=[q.x+c*local[0]*q.scale.x+s*local[1]*q.scale.z,q.z-s*local[0]*q.scale.x+c*local[1]*q.scale.z];
 const old=original.at(-1),oldLocal=[(c*(old[0]-q.x)-s*(old[1]-q.z))/q.scale.x,(s*(old[0]-q.x)+c*(old[1]-q.z))/q.scale.z];
 if(Math.hypot(oldLocal[0]+2.32712668054,oldLocal[1]-2.710398345354)>.01)throw Error('Boardwalk cabin source endpoint changed; re-audit its porch approach.');
 return{points:[...original.slice(0,-1),end],correction:{entityId:entity.id,sourceLocal:oldLocal,endLocal:local,sourceEnd:[...old],end,displacement:Math.hypot(end[0]-old[0],end[1]-old[1]),reason:'join-original-central-stair-not-wall-or-railing'}};
}
// Physical authoring is independent of camera/LOD. Both rendering and Rapier
// consume this same source path, timber geometry, and exact placement matrices.
export function boardwalkTimber(world){
 if(layouts.has(world))return layouts.get(world);
 const enabled=boardwalkTimberEnabled(),result={enabled,version:kit.version,routes:[],pieces:0,triangles:0};
 if(enabled)for(const [index,line]of (world.objects?.boardwalks||[]).entries()){
  const {points,correction}=boardwalkRoutePoints(world,index,line);
  const route={points,sourcePoints:line.pts,correction,id:'boardwalk:'+index,index,width:line.width||1.2,rail:line.rail??false,source:line.src??'existing authored path',stairs:!!line.stairs,steps:[],pieces:[],bounds:new THREE.Box3(),length:0};
  for(let segment=0;segment<points.length-1;segment++){
   const a=points[segment],b=points[segment+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
   const count=Math.ceil(length/.3),run=length/count,fx=dx/length,fz=dz/length,nx=-fz,nz=fx,yaw=Math.atan2(-dx,-dz),rotation=new THREE.Quaternion().setFromAxisAngle(UP,yaw);
   for(let j=0;j<count;j++){
    const t=(j+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t;
    // A horizontal tread clears both terrain shoulders, not only its centre.
    let ground=-Infinity;for(const along of [-run*.46,0,run*.46])for(const across of [-route.width/2,0,route.width/2])ground=Math.max(ground,world.surface.heightAt(x+fx*along+nx*across,z+fz*along+nz*across));
    const top=ground+.16,step={x,z,top,fx,fz,nx,nz,run,distance:route.length+(j+.5)*run,rotation};route.steps.push(step);
    route.pieces.push({kind:'plank',matrix:matrix('plank',[x,top-.0375,z],[route.width,.075,run*.96],rotation)});
    route.bounds.expandByPoint(new THREE.Vector3(x-route.width,ground-.4,z-route.width));route.bounds.expandByPoint(new THREE.Vector3(x+route.width,top,z+route.width));
   }route.length+=length;
  }
  // Paired continuous structural stringers. The open sides retain real depth;
  // no generic solid slab or invented railing replaces the source arrangement.
  for(let i=0;i<route.steps.length-1;i++){
   const a=route.steps[i],b=route.steps[i+1];for(const side of [-1,1]){
    const x=new THREE.Vector3(a.x+a.nx*route.width*.32*side,a.top-.14,a.z+a.nz*route.width*.32*side),y=new THREE.Vector3(b.x+b.nx*route.width*.32*side,b.top-.14,b.z+b.nz*route.width*.32*side),delta=y.clone().sub(x),length=delta.length(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());
    route.pieces.push({kind:'bearer',matrix:matrix('bearer',x.clone().add(y).multiplyScalar(.5).toArray(),[.12,.13,length+.08],q)});
   }
  }
  let last=-Infinity;for(const [i,s]of route.steps.entries())if(s.distance-last>=1.4||i===route.steps.length-1){last=s.distance;for(const side of [-1,1]){
   const x=s.x+s.nx*route.width*.32*side,z=s.z+s.nz*route.width*.32*side,bottom=world.surface.heightAt(x,z)-.10,top=s.top-.08;
   if(top>bottom)route.pieces.push({kind:'post',matrix:matrix('post',[x,(top+bottom)/2,z],[.13,top-bottom,.13],s.rotation)});
  }}
  route.maxStep=Math.max(0,...route.steps.slice(1).map((s,i)=>Math.abs(s.top-route.steps[i].top)));
  route.triangles=route.pieces.reduce((n,p)=>n+kit.parts[p.kind].triangles,0);result.pieces+=route.pieces.length;result.triangles+=route.triangles;result.routes.push(route);
 }
 layouts.set(world,result);return result;
}
export function addBoardwalkTimber(group,world,material){
 const layout=boardwalkTimber(world),geometries=new Map();
 for(const kind of ['plank','bearer','post']){const records=layout.routes.flatMap(route=>route.pieces.filter(p=>p.kind===kind));if(!records.length)continue;const geometry=timberGeometry(kind);geometries.set(kind,geometry);
  const offsets=new Float32Array(records.length*2);for(let i=0;i<records.length;i++){offsets[i*2]=(i*.61803398875)%1;offsets[i*2+1]=(i*.38196601125)%1;}geometry.setAttribute('aTimberOffset',new THREE.InstancedBufferAttribute(offsets,2));
  const mesh=new THREE.InstancedMesh(geometry,material,records.length);records.forEach((p,i)=>{mesh.setMatrixAt(i,p.matrix);const c=.76+.34*((i*137)%23)/22;mesh.setColorAt(i,new THREE.Color(c,c*.985,c*.96));});mesh.name='boardwalk-timber-'+kind;mesh.userData={kind:'boardwalk-timber',part:kind,sourceVersion:kit.version};mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
 }
 return layout;
}
export function boardwalkViewpoints(world){const layout=boardwalkTimber(world);return layout.routes.filter(r=>r.steps.length>2).map(r=>{const s=r.steps[2],a=r.steps[0],x=a.x-a.fx*1.2,z=a.z-a.fz*1.2;return{id:'walk-boardwalk-'+r.index,name:BOARDWALK_ENDPOINTS.find(e=>e.index===r.index)?.name??'原木步道 · 连续通行',category:'牧居生活',x,z,y:world.surface.heightAt(x,z)+1.7,yaw:Math.atan2(s.x-x,-(s.z-z))*180/Math.PI,pitch:-12};});}
