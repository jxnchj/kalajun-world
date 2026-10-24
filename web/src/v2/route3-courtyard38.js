import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {boardwalkTimber} from './boardwalk-timber.js';
import {BOARDWALK_ENDPOINTS} from './boardwalk-endpoints.js';
export const route3CourtyardEnabled=()=>new URLSearchParams(globalThis.location?.search||'').get('route3Courtyard38')==='1';
// Authored use/erosion traces, not surveyed new roads. Irregular separated
// intervals retain the living turf between them and never move plant roots.
const SHOULDER_TRACES=[ [2.1,4.8,-1,.34], [6.7,10.0,1,.48], [12.4,14.3,-1,.29], [18.2,22.4,-1,.52], [25.8,28.0,1,.38] ];
const local=(q,x,z)=>[q.x+Math.cos(q.rot)*x*q.scale.x+Math.sin(q.rot)*z*q.scale.z,q.z-Math.sin(q.rot)*x*q.scale.x+Math.cos(q.rot)*z*q.scale.z];
function station(route,d){let passed=0;for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(d<=passed+l||i===route.points.length-1){const t=Math.max(0,Math.min(1,(d-passed)/l));return{x:a[0]+dx*t,z:a[1]+dz*t,fx:dx/l,fz:dz/l,nx:-dz/l,nz:dx/l};}passed+=l;}}
export function route3CourtyardLayout(world){
 const route=boardwalkTimber(world).routes.find(r=>r.index===3);if(!route)return null;
 const endpoints=BOARDWALK_ENDPOINTS[3],guest=world.entities.find(e=>e.id===endpoints.start),lodge=world.entities.find(e=>e.id===endpoints.end);if(!guest||!lodge)throw Error('Route3 courtyard requires its original two building entities');
 // guesthouses.py: room porch stair centre x7.5, outer last tread z8.37;
 // lodge rear opening x-4.6/z-3.5. Keep traces outside both structures.
 const guestFoot=local(world.surface.buildingPose(guest),7.5,8.37),rear=local(world.surface.buildingPose(lodge),-4.6,-3.72);
 const patches=SHOULDER_TRACES.map(([start,end,side,width],i)=>({id:'shoulder-'+i,start,end,side,width,kind:'shoulder'}));
 patches.push({id:'guest-stair-foot',kind:'apron',a:guestFoot,b:route.points[0],width:1.65}, {id:'lodge-rear-approach',kind:'apron',a:route.points.at(-1),b:rear,width:1.18});
 return{route,patches,guestFoot,lodgeRear:rear,entityIds:[guest.id,lodge.id],sourceRouteLength:route.length};
}
export function route3PatchGeometry(world,layout,patch){
 const pos=[],uv=[],coverage=[],indices=[],across=10;
 const length=patch.kind==='shoulder'?patch.end-patch.start:Math.hypot(patch.b[0]-patch.a[0],patch.b[1]-patch.a[1]);
 const rows=Math.max(4,Math.ceil(length/.16));
 for(let i=0;i<=rows;i++)for(let j=0;j<=across;j++){
  const t=i/rows,u=j/across;let x,z;
  if(patch.kind==='shoulder'){
   const p=station(layout.route,patch.start+length*t),width=patch.width*(.86+.14*Math.sin(t*7.8+patch.start));
   const offset=patch.side*(layout.route.width*.5-.035+u*width);
   x=p.x+p.nx*offset;z=p.z+p.nz*offset;
  }else{
   const dx=patch.b[0]-patch.a[0],dz=patch.b[1]-patch.a[1],l=Math.max(.001,Math.hypot(dx,dz));
   x=patch.a[0]+dx*t-dz/l*(u-.5)*patch.width;z=patch.a[1]+dz*t+dx/l*(u-.5)*patch.width;
  }
  const endFade=Math.pow(Math.sin(Math.PI*t),.65),edge=Math.pow(Math.sin(Math.PI*u),.8);
  const breakup=.72+.28*Math.sin(x*2.1+Math.sin(z*1.3))*Math.sin(z*2.7);
  pos.push(x,world.surface.heightAt(x,z)+.008,z);uv.push(x*.48,z*.48);
  coverage.push(endFade*edge*breakup*(patch.kind==='shoulder'?.48:.72));
  if(i<rows&&j<across){const a=i*(across+1)+j;indices.push(a,a+across+1,a+1,a+1,a+across+1,a+across+2);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aCourtyardCoverage',new THREE.Float32BufferAttribute(coverage,1));g.setIndex(indices);g.computeVertexNormals();
 // Shoulder side reverses the grid winding; enforce outward terrain normals.
 if(g.attributes.normal.getY(Math.floor(g.attributes.normal.count/2))<0){for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i);g.index.setX(i,g.index.getX(i+2));g.index.setX(i+2,a);}g.computeVertexNormals();}
 g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function addRoute3Courtyard(group,world,soil){
 if(!route3CourtyardEnabled())return null;
 const layout=route3CourtyardLayout(world);if(!layout)return null;
 const material=soil.clone(),previous=soil.onBeforeCompile,parentKey=soil.customProgramCacheKey();
 // A ground-only continuous blend: no screen-space hash/dither or frame noise.
 // Keep the parent soil hook, replacing only its UV-strip coverage contract.
 material.transparent=true;material.depthWrite=false;
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  const original=/float pathEdge=min\(vPathUv\.x,1\.0-vPathUv\.x\);[\s\S]*?if\(coverage<=screenNoise\)discard;/;
  if(!original.test(shader.fragmentShader))throw Error('Route3 courtyard: parent soil coverage changed; re-audit replacement');
  shader.fragmentShader=shader.fragmentShader.replace(original,'diffuseColor.a*=vCourtyardCoverage;');
  shader.vertexShader='attribute float aCourtyardCoverage; varying float vCourtyardCoverage;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCourtyardCoverage=aCourtyardCoverage;');
  shader.fragmentShader='varying float vCourtyardCoverage;\n'+shader.fragmentShader;
 };

 material.customProgramCacheKey=()=> parentKey+'-route3-courtyard38-continuous';
 const stats={enabled:true,patches:layout.patches.length,triangles:0,sourceRouteLength:layout.sourceRouteLength,entityIds:layout.entityIds,grassRootsMoved:0,collisionChanged:false};
 const pieces=layout.patches.map(p=>route3PatchGeometry(world,layout,p)),geometry=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());
 const mesh=new THREE.Mesh(geometry,material);mesh.name='route3-courtyard38';mesh.receiveShadow=true;mesh.userData={kind:'route3-ground-trace',patchIds:layout.patches.map(p=>p.id)};group.add(mesh);stats.triangles=geometry.index.count/3;stats.drawCalls=1;

 group.userData.route3Courtyard=stats;return{material,stats};
}
