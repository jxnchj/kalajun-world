import * as THREE from 'three';
import {preserveAssetOcclusion} from './asset-occlusion.js';
// Exact round-33 fallback geometry. Keep for same-runtime, reload-based A/B.
function outline(x0,x1,z0,z1,bevel){return [[x0+bevel,z0],[x1-bevel,z0],[x1,z0+bevel],[x1,z1-bevel],[x1-bevel,z1],[x0+bevel,z1],[x0,z1-bevel],[x0,z0+bevel]];}
export function householdEntryStepGeometry33(recipe){
 const positions=[],uv=[],indices=[];
 const face=points=>{
  const start=positions.length/3,a=new THREE.Vector3(...points[0]),normal=new THREE.Vector3(...points[1]).sub(a).cross(new THREE.Vector3(...points[2]).sub(a));
  // Metric box projection retains full stone texture detail on each planar
  // tread, riser and bevel; it never stretches a top UV across a vertical face.
  const axis=Math.abs(normal.y)>Math.max(Math.abs(normal.x),Math.abs(normal.z))?'y':Math.abs(normal.x)>Math.abs(normal.z)?'x':'z';
  for(const p of points){positions.push(...p);const [x,y,z]=[p[0]*recipe.pose.scale.x,p[1]*recipe.pose.scale.y,p[2]*recipe.pose.scale.z];uv.push(...(axis==='y'?[x*2,z*2]:axis==='x'?[z*2,y*2]:[x*2,y*2]));}
  for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
 };
 for(const c of recipe.courses){
  const bevel=.022/Math.max(recipe.pose.scale.x,recipe.pose.scale.z),outer=outline(c.x0,c.x1,c.z0,c.z1,bevel),inner=outline(c.x0+bevel,c.x1-bevel,c.z0+bevel,c.z1-bevel,bevel),shoulder=c.top-.018/recipe.pose.scale.y;
  // Reverse the x/z perimeter for +Y tread faces. Separate face vertices
  // preserve chiseled planar treads and bevels rather than inflated smooth boxes.
  face(inner.map(([x,z])=>[x,c.top,z]).reverse());
  face(outer.map(([x,z])=>[x,c.bottom,z]));
  for(let i=0;i<8;i++){const j=(i+1)%8,a=outer[i],b=outer[j],u=inner[i],v=inner[j];
   face([[a[0],c.bottom,a[1]],[b[0],c.bottom,b[1]],[b[0],shoulder,b[1]],[a[0],shoulder,a[1]]].reverse());
   face([[a[0],shoulder,a[1]],[b[0],shoulder,b[1]],[v[0],c.top,v[1]],[u[0],c.top,u[1]]].reverse());
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();preserveAssetOcclusion(geometry,false);return geometry;
}
