import * as THREE from 'three';

// Authored stage-3 circulation studies for the three already-reviewed households.
// These are designed use traces, not surveyed paths or an all-world road rollout.
// Positions stay tied to the original house pose; terrain/physics are not changed.
// Round 37 adds three side-yard approaches without replacing the six entry/use
// traces. These are circulation studies, not claims of new furniture or survey data.
export const HOUSEHOLD_YARD_VERSION='household-yards-37';
export const HOUSEHOLD_YARD_RECIPES=Object.freeze([
 {style:0,entityId:'cabins:-1972,3678:784f73bf0ba94d17',name:'饮茶院前 · 草地来路',routes:[
  {role:'entry',width:1.02,fieldEnd:true,points:[[1,4.60],[1.08,5.75],[.66,7.0],[-.7,8.12],[-2.85,8.95],[-4.7,10.7]]},
  {role:'service-side',width:.64,fieldEnd:true,points:[[-2.85,8.95],[-5.65,8.1],[-7.15,6.6],[-7.45,4.3],[-7.15,2.3]]},
  {role:'porch-use',width:.72,fieldEnd:true,points:[[.66,7.0],[-.75,6.25],[-2.25,5.8],[-3.9,6.1]]},
 ]},
 {style:1,entityId:'cabins:-1743,3612:30f9adc9fb584805',name:'手作院前 · 牧道衔接',routes:[
  {role:'entry',width:1.05,connect:true,points:[[1,4.60],[1.12,6.15],[.42,8.75],[-2.1,12.0],[-4.65,17.1],[-7.8,22.5],[-10.8,29.0]]},
  {role:'service-side',width:.68,fieldEnd:true,points:[[-7.8,22.5],[-10.6,20.3],[-12.35,17.3],[-12.65,14.5],[-12.2,12.3]]},
  {role:'porch-use',width:.76,fieldEnd:true,points:[[.42,8.75],[-1.25,7.45],[-3.55,6.7],[-4.6,5.8]]},
 ]},
 {style:2,entityId:'cabins:-1683,3643:fb877ed9142d2f85',name:'晾晒院前 · 回身与侧行',routes:[
  {role:'entry',width:1.02,fieldEnd:true,points:[[1,4.60],[1.18,6.0],[1.0,7.9],[.2,9.8],[-1.45,11.55],[-3.8,12.55]]},
  {role:'service-side',width:.66,fieldEnd:true,points:[[-1.45,11.55],[-5.6,11.6],[-7.25,9.3],[-7.45,6.7],[-7.15,4.7]]},
  {role:'porch-use',width:.82,fieldEnd:true,points:[[1.0,7.9],[-.8,7.0],[-2.6,6.55],[-4.25,7.1],[-4.8,8.45]]},
 ]},
]);
const worlds=new WeakMap();
export const householdYardsEnabled=()=>new URLSearchParams(globalThis.location?.search||'').get('householdYards')!=='v32';
const point=(pose,[x,z])=>[pose.x+Math.cos(pose.rot)*x*pose.scale.x+Math.sin(pose.rot)*z*pose.scale.z,pose.z-Math.sin(pose.rot)*x*pose.scale.x+Math.cos(pose.rot)*z*pose.scale.z];
function nearestPublicRoute(world,p,maxDistance=12){
 let nearest=null;
 for(const line of [...(world.objects?.tracks||[]),...(world.objects?.paths||[])])for(let i=1;i<(line.pts?.length||0);i++){
  const a=line.pts[i-1],b=line.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],d2=dx*dx+dz*dz;if(d2<1e-8)continue;
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d2)),q=[a[0]+dx*t,a[1]+dz*t],distance=Math.hypot(q[0]-p[0],q[1]-p[1]);
  if(distance<=maxDistance&&(!nearest||distance<nearest.distance))nearest={point:q,distance,width:line.width||1.5};
 }
 return nearest;
}
function makeRoute(world,pose,recipe,route,index){
 const anchors=route.points.map(p=>point(pose,p));let connection=null;
 if(route.connect){connection=nearestPublicRoute(world,anchors.at(-1));if(connection)anchors.push(connection.point);}
 const curve=new THREE.CatmullRomCurve3(anchors.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
 const length=curve.getLength(),count=Math.max(2,Math.ceil(length/.32)),stations=[];
 for(let i=0;i<=count;i++){
  const t=i/count,p=curve.getPointAt(t),tangent=curve.getTangentAt(t),baseWidth=route.width*Math.sqrt(pose.scale.x*pose.scale.z);
  // Wide at the shared doorstep/turn; field approaches wear away gradually.
  // Low-frequency asymmetric edge movement avoids a ruler-straight ribbon.
  const taper=route.fieldEnd?1-.35*Math.max(0,(t-.78)/.22):1;
  const width=baseWidth*taper*(1+.075*Math.sin(t*9.1+recipe.style*.8+index)+.035*Math.sin(t*23.7+index));
  stations.push({x:p.x,z:p.z,nx:-tangent.z,nz:tangent.x,half:width*.5,distance:t*length});
 }
 return {id:recipe.entityId+'/yard/'+route.role,entityId:recipe.entityId,style:recipe.style,role:route.role,stations,length,connection,fieldEnd:!!route.fieldEnd};
}
export function householdYards(world){
 if(worlds.has(world))return worlds.get(world);
 const result={version:HOUSEHOLD_YARD_VERSION,enabled:householdYardsEnabled(),households:[],routes:[],segments:[],stats:{households:0,routes:0,publicConnections:0,length:0,triangles:0}};
 if(result.enabled&&world.surface?.buildingPose)for(const recipe of HOUSEHOLD_YARD_RECIPES){
  const entity=world.entities?.find(e=>e.id===recipe.entityId&&e.assetId==='house_a'&&!e.part);if(!entity)continue;
  const pose=world.surface.buildingPose(entity),routes=recipe.routes.map((route,i)=>makeRoute(world,pose,recipe,route,i));
  result.households.push({entityId:entity.id,style:recipe.style,name:recipe.name,routeIds:routes.map(r=>r.id)});
  for(const route of routes){
   result.routes.push(route);result.stats.length+=route.length;result.stats.publicConnections+=route.connection?1:0;
   for(let i=1;i<route.stations.length;i++){const a=route.stations[i-1],b=route.stations[i];result.segments.push({id:route.id,a:[a.x,a.z],b:[b.x,b.z],radius:Math.max(a.half,b.half)+.035});}
  }
 }
 result.stats.households=result.households.length;result.stats.routes=result.routes.length;worlds.set(world,result);return result;
}
// A static soil-wear field in world metres. Compute its two broad scales once
// with the ground geometry, rather than adding animated/per-fragment noise or
// another texture. Shared world coordinates keep overlapping branch traces
// consistent; route width and plant-clearance footprints remain unchanged.
const yardHash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
function yardNoise(x,z){
 const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
 const a=yardHash(ix,iz),b=yardHash(ix+1,iz),c=yardHash(ix,iz+1),d=yardHash(ix+1,iz+1);
 return (a+(b-a)*sx)*(1-sz)+(c+(d-c)*sx)*sz;
}
// Dense cross-sections follow the same authoritative ground as walking collision.
// No flattened courtyard, new earthworks, disguised raised deck or GI change.
export function householdYardGeometry(world,route){
 const position=[],uv=[],coverage=[],surface=[],indices=[],columns=4;
 for(let i=0;i<route.stations.length;i++){
  const p=route.stations[i];
  for(let j=0;j<=columns;j++){
   const across=j/columns,side=across*2-1,x=p.x+p.nx*p.half*side,z=p.z+p.nz*p.half*side;
   position.push(x,world.surface.heightAt(x,z)+.018,z);uv.push(across,p.distance/2);
   surface.push(p.half*2,yardNoise(x*.67,z*.67),yardNoise(x*2.3+19.4,z*2.3-8.7));
   const fade=route.fieldEnd?Math.max(0,Math.min(1,(route.length-p.distance)/1.7)):1;coverage.push(fade*fade*(3-2*fade));
   if(i<route.stations.length-1&&j<columns){const k=i*(columns+1)+j;indices.push(k,k+1,k+columns+1,k+1,k+columns+2,k+columns+1);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('aYardCoverage',new THREE.Float32BufferAttribute(coverage,1));geometry.setAttribute('aYardSurface',new THREE.Float32BufferAttribute(surface,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// Keep the existing PBR soil texture and receive the same CSM/cloud/aerial
// lighting. Local soil pigment and stable worn edges break up the pale ribbon;
// this is not a global exposure/colour change, nor a new scattering overlay.
export function householdYardMaterial(soil){
 const material=soil.clone(),previous=soil.onBeforeCompile,key=soil.customProgramCacheKey();
 material.color.multiply(new THREE.Color(.82,.77,.66));
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader="attribute float aYardCoverage; attribute vec3 aYardSurface; varying float vYardCoverage; varying vec3 vYardSurface;\n"+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvYardCoverage=aYardCoverage; vYardSurface=aYardSurface;");
  shader.fragmentShader="varying float vYardCoverage; varying vec3 vYardSurface;\n"+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#include <map_fragment>
// Damp/compacted earth and less worn dry grains share the same soil PBR.
diffuseColor.rgb*=mix(.82,1.04,vYardSurface.y);`);
  shader.fragmentShader=shader.fragmentShader.replace("float screenNoise=", `
// Distances are metres, so a porch spur does not get a scaled-down edge fringe.
float yardEdgeDistance=pathEdge*vYardSurface.x;
float yardEdgeCut=.025+.095*vYardSurface.z;
float yardEdgeFeather=.11+.11*vYardSurface.y;
coverage=smoothstep(yardEdgeCut,yardEdgeCut+yardEdgeFeather,yardEdgeDistance);
// Sparse broad patches reveal the actual underlying grass ground. Most of the
// walked centre remains opaque; fine texture is already supplied by the map.
coverage*=smoothstep(.20,.39,vYardSurface.y);
coverage*=vYardCoverage;
float screenNoise=`);
 };
 material.customProgramCacheKey=()=>key+"-yard-wear-35";return material;
}
export function householdYardViewpoints(world){
 return householdYards(world).households.map(h=>{
  const entity=world.entities.find(e=>e.id===h.entityId),pose=world.surface.buildingPose(entity),[x,z]=point(pose,[-5.2,14.4]),[tx,tz]=point(pose,[-.4,6.9]);
  const y=world.surface.heightAt(x,z)+3.2,ty=world.surface.heightAt(tx,tz)+.15,dx=tx-x,dz=tz-z;
  return {id:'yard-'+h.style,name:h.name,category:'牧居院落',entityId:h.entityId,x,y,z,above:3.2,yaw:Math.atan2(dx,-dz)*180/Math.PI,pitch:Math.atan2(ty-y,Math.hypot(dx,dz))*180/Math.PI};
 });
}
