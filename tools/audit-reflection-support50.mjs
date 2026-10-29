// Read-only source/geometry feasibility. No browser, GPU, production edits or
// culling implementation. Filters are conservatively allowed to require the
// complete target when the derivative-selected mip footprint is unknown.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from '../web/node_modules/three/build/three.module.js';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldEcology} from '../web/src/v2/ecology.js';
import {createSpruceLoader,spruceGeometryContainer} from '../web/src/v2/spruce-loading.js';
import {applySpruceVolume} from '../web/src/v2/spruce-volume.js';
import {selectWaterReflectionPatch,createWaterReflectionCamera,WATER_REFLECTION_LIMITS} from '../web/src/v2/water-reflection.js';

const origin=[-3611.851169467755,2329.157270885741,4805.483400316967],end=[-3689.0795388471156,2311.836006170602,4526.779127051337],yaw=-29.88794104541604;
const world=actualForestWorld(undefined,'rgba'),eco=new WorldEcology(world),names=['column','edge','old','pencil','young'],loader=createSpruceLoader(),assets={};
loader.register(()=>({name:'SUPPORT_AUDIT_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new T.Texture())}));
for(const lod of ['hi','mid']){const b=readFileSync(new URL('../web/public/assets/v2/schrenk-spruce-'+lod+'.glb',import.meta.url));assets[lod]=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
applySpruceVolume(assets.hi,assets.mid);
for(const[lod,mode]of[['hi',5],['mid',1]]){const source=assets[lod].scene;source.updateMatrixWorld(true);source.traverse(o=>{if(!o.isMesh)return;const geometry=spruceGeometryContainer(o.geometry,o.matrixWorld);
 for(const[from,to]of[['_plant_wind','aPlantWind'],['_crown_occlusion','aCrownOcclusion']]){geometry.setAttribute(to,geometry.getAttribute(from));geometry.deleteAttribute(from);}
 const material=o.material.clone(),mesh=new T.InstancedMesh(geometry,material,1600);mesh.customDepthMaterial=new T.MeshDepthMaterial();eco.nearParts.push({mode,variant:names.findIndex(n=>o.name.startsWith(n+'_')),mesh});eco.materials.push(material);
});}
const frustum=c=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
function clip(poly,planes){for(const plane of planes){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);if(da>=0)out.push(a);if((da<0)!==(db<0))out.push(a.clone().lerp(b,da/(da-db)));}poly=out;if(!poly.length)break;}return poly;}
function support(camera,mirror,patch){
 const maxWidth=world.hydrology.segments.reduce((n,s)=>Math.max(n,s.a.width,s.b.width),0),queryRadius=patch.radius+.75+.88*maxWidth+.01;
 const segments=world.hydrology.nearSegments(patch.center.x,patch.center.z,queryRadius),planes=frustum(camera).planes.map(p=>{p.constant+=.02;return p;});
 // Circumscribed 32-sided polygon retains the entire exact circular patch.
 for(let i=0;i<32;i++){const a=i*Math.PI*2/32,n=new T.Vector3(Math.cos(a),0,Math.sin(a));planes.push(new T.Plane(n,patch.radius+.02-n.dot(patch.center)));}
 planes.push(new T.Plane(patch.plane.normal.clone(),patch.plane.constant+.162),new T.Plane(patch.plane.normal.clone().negate(),-patch.plane.constant+.162));
 const pv=new T.Matrix4().multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse),uv={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};let acceptedSegments=0,vertices=0,positiveW=true;
 const faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
 for(const s of segments){
  // All near/overview water vertices lie inside this actual-node prism:
  // ordinary side<=width/2; physical solveSection searches only to
  // outer=.75+.88*sourceWidth. Refinement only interpolates existing positions.
  const side=.75+.88*Math.max(s.a.width,s.b.width)+.001,
   lo=[Math.min(s.a.x,s.b.x)-side,Math.min(s.a.level,s.b.level)+.005,Math.min(s.a.z,s.b.z)-side],
   hi=[Math.max(s.a.x,s.b.x)+side,Math.max(s.a.level,s.b.level)+.007,Math.max(s.a.z,s.b.z)+side];
  const points=Array.from({length:8},(_,i)=>new T.Vector3(i&1?hi[0]:lo[0],i&2?hi[1]:lo[1],i&4?hi[2]:lo[2]));let any=false;
  for(const f of faces)for(const p of clip(f.map(i=>points[i]),planes)){
   any=true;vertices++;for(const dx of[-.221,.221])for(const dz of[-.221,.221]){
    const q=new T.Vector4(p.x+dx,p.y,p.z+dz,1).applyMatrix4(pv);if(q.w<=.0001){positiveW=false;continue;}
    const u=q.x/q.w*.5+.5,v=q.y/q.w*.5+.5;uv.minX=Math.min(uv.minX,u);uv.maxX=Math.max(uv.maxX,u);uv.minY=Math.min(uv.minY,v);uv.maxY=Math.max(uv.maxY,v);
   }
  }if(any)acceptedSegments++;
 }
 if(!positiveW)return {queryRadius,segments:segments.length,acceptedSegments,vertices,positiveW,rectangle:[0,0,1,1],reason:'offset box crosses projection eye; full support retained'};
 const rectangle=vertices?[Math.max(0,uv.minX-2/512),Math.max(0,uv.minY-2/320),Math.min(1,uv.maxX+2/512),Math.min(1,uv.maxY+2/320)]:null;
 return {queryRadius,segments:segments.length,acceptedSegments,vertices,positiveW,rectangle,scope:'Conservative actual-water node prisms clipped to main view/patch with 2cm guard and |planeError|<=.162; retains +/-22cm distortion with 1mm extra and two target-pixel UV guard. Does not reject by opaque occlusion, dry depth or hydraulic normal, so these only enlarge the bound.'};
}
function croppedFrustum(camera,rect){const [x0,y0,x1,y1]=rect,clipMatrix=new T.Matrix4().set(1/(x1-x0),0,0,(1-x0-x1)/(x1-x0),0,1/(y1-y0),0,(1-y0-y1)/(y1-y0),0,0,1,0,0,0,0,1);return new T.Frustum().setFromProjectionMatrix(clipMatrix.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);}
function count(mirror,patch,rect){const f=rect?croppedFrustum(mirror,rect):frustum(mirror),families={};for(const b of eco.nearTreeBatches.values()){
 const m=b.mesh;if(!m.visible||m.boundingSphere.center.distanceTo(patch.center)-m.boundingSphere.radius>WATER_REFLECTION_LIMITS.sceneRadius||!m.intersectsFrustum(f))continue;
 const key=m.material.alphaTest>0?'photo-'+b.mode:'solid-'+b.mode,o=families[key]??={draws:0,triangles:0,instances:0};o.draws++;o.triangles+=m.count*m.geometry.index.count/3;o.instances+=m.count;
 }return families;}
const rows=[];
try{for(const p of[{name:'origin',position:origin,yaw,pitch:-10},...[-60,-30,30,60].map(turn=>({name:'origin-turn-'+turn,position:origin,yaw:yaw+turn,pitch:-10})),{name:'actual-flight-end',position:end,yaw:-15.487941045416033,pitch:-8.400000000000006}]){
 const camera=new T.PerspectiveCamera(52,1280/800,.25,150000);camera._reversedDepth=true;camera.updateProjectionMatrix();camera.position.fromArray(p.position);camera.rotation.set(p.pitch*Math.PI/180,-p.yaw*Math.PI/180,0,'YXZ');camera.updateMatrixWorld();
 eco.rebuildNearTrees(camera);eco.group.updateMatrixWorld(true);const patch=selectWaterReflectionPatch(world.hydrology,camera);if(!patch){rows.push({...p,patch:null,reason:'actual eligibility selects no visible near-water reflection'});continue;}
 const mirror=createWaterReflectionCamera(camera,patch.plane),bound=support(camera,mirror,patch),base=count(mirror,patch),rect=bound.rectangle;
 const idealNoFilter=rect&&rect[0]<rect[2]&&rect[1]<rect[3]?count(mirror,patch,rect):{};
 // Never assume roughness*5+.55 caps LOD: shader additionally takes max with
 // dFdx/dFdy of the distorted UV. Level8 can read the complete 2x1 target when
 // a centre in this square is eligible at a fractional LOD just above7.
 const gate=.015+128/320,mip8MayReadWhole=!!rect&&rect[0]<1-gate&&rect[2]>gate&&rect[1]<1-gate&&rect[3]>gate;
 const centralX=rect?Math.max(rect[0],Math.min(rect[2],.5)):0,centralY=rect?Math.max(rect[1],Math.min(rect[3],.5)):0;
 const edgeUpper=rect?Math.min(centralX,1-centralX,centralY,1-centralY):0,edgeGateAlwaysZero=edgeUpper<=.015;
 rows.push({...p,patch:{id:patch.id,center:patch.center.toArray(),plane:[...patch.plane.normal.toArray(),patch.plane.constant],radius:patch.radius},support:bound,base,idealNoFilter,mip8MayReadWhole,edgeUpper,edgeGateAlwaysZero,completeFiltering:edgeGateAlwaysZero?{}:base,
  filteringDecision:edgeGateAlwaysZero?'No receiver can pass the original .015+borderSupport gate, even ignoring its additional positive mip margin; this offline pose has no local reflection contribution. Not browser-verified.':'Without a proved bound on derivative-selected LOD, preserve the full generated mip chain and complete original target. No native batch rejection is certified.'});
}}
finally{eco.dispose();}
const reference=JSON.parse(readFileSync(new URL('reports/photo-native-partition49.json',import.meta.url))).models[0].rows.find(r=>r.pass==='reflection.color').families;
for(const family of ['photo-1','photo-5'])assert.deepEqual(rows[0].base[family],reference[family]);
const result={scope:'Offline current source root/bounds audit; no GPU, scene change or candidate. Photo1/5 and solids only, near needles and remaining whole-scene objects not reconstructed.',waterTarget:[512,320],roughnessOnlyMaxLod:2.25,derivativeLodNotBounded:true,rows};
writeFileSync(new URL('reports/reflection-support50.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
