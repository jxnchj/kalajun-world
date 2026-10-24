import { BackSide } from 'three';
import { registerOwnedShadowSide } from './owned-shadow-policy.js';

// Experimental only: unknown/default options and the exact v33 rollback keep
// their existing shadow policy. No canonical material is changed or cloned.
export const householdEntryShadowMode=entryMode=>entryMode==='editable'&&new URLSearchParams(globalThis.location?.search||'').get('householdEntryShadow')==='closed'?'closed':'standard';

export function validateClosedEntryGeometry(geometry,{triangles=2752,components=32}={}){
 const position=geometry.getAttribute('position'),index=geometry.index;
 if(!position||position.itemSize!==3||!index||index.itemSize!==1||index.count!==triangles*3||geometry.groups.length||geometry.drawRange.start!==0||!(geometry.drawRange.count>=index.count)||geometry.morphAttributes.position?.length)throw new Error('Closed entry requires complete immutable indexed geometry');
 const unique=new Map(),points=[],welded=new Uint32Array(position.count),parents=[];
 for(let i=0;i<position.count;i++){
  const p=[position.getX(i),position.getY(i),position.getZ(i)];if(!p.every(Number.isFinite))throw new Error('Closed entry has non-finite positions');
  const key=p.join(',');let id=unique.get(key);
  if(id===undefined){id=points.length;unique.set(key,id);points.push(p);parents.push(id);}welded[i]=id;
 }
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;},edges=new Map(),faces=[];
 for(let i=0;i<index.count;i+=3){
  const face=[0,1,2].map(k=>{const n=index.getX(i+k);if(!Number.isInteger(n)||n<0||n>=position.count)throw new Error('Closed entry index outside positions');return welded[n];});
  if(new Set(face).size!==3)throw new Error('Closed entry has a degenerate triangle');faces.push(face);
  for(let k=0;k<3;k++){
   const a=face[k],b=face[(k+1)%3],key=a<b?a+','+b:b+','+a,e=edges.get(key)||{a,b,count:0,direction:0};e.count++;e.direction+=a<b?1:-1;edges.set(key,e);parents[root(a)]=root(b);
  }
 }
 for(const e of edges.values())if(e.count!==2||e.direction!==0)throw new Error('Closed entry has a boundary, nonmanifold or inconsistently oriented edge');
 const solids=new Map();
 for(let i=0;i<points.length;i++){const key=root(i);if(!solids.has(key))solids.set(key,{vertices:[],faces:[],edges:0});solids.get(key).vertices.push(i);}
 for(const face of faces)solids.get(root(face[0])).faces.push(face);
 for(const e of edges.values())solids.get(root(e.a)).edges++;
 if(solids.size!==components)throw new Error('Closed entry solid count differs from the verified asset');
 let minimumVolume=Infinity,minimumOutwardDot=Infinity;
 for(const solid of solids.values()){
  if(solid.vertices.length-solid.edges+solid.faces.length!==2)throw new Error('Closed entry stone is not a genus-zero shell');
  const center=[0,0,0];for(const i of solid.vertices)for(let k=0;k<3;k++)center[k]+=points[i][k]/solid.vertices.length;
  let volume=0;
  for(const face of solid.faces){
   const [a,b,c]=face.map(i=>points[i].map((v,k)=>v-center[k])),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],outward=normal.reduce((sum,n,k)=>sum+n*a[k],0);
   // This is the authored centroid-facing contract, not a general convexity or
   // self-intersection proof. Consistent closed winding and volume are separate.
   if(!(outward>1e-12))throw new Error('Closed entry has a degenerate or non-outward centroid-facing stone face');
   minimumOutwardDot=Math.min(minimumOutwardDot,outward);volume+=outward/6;
  }
  if(!(volume>1e-12))throw new Error('Closed entry has non-positive signed volume');minimumVolume=Math.min(minimumVolume,volume);
 }
 const positionVersion=position.version??position.data?.version,indexVersion=index.version,positionArray=position.array??position.data?.array,indexArray=index.array,positionCount=position.count,indexCount=index.count;
 const stats=Object.freeze({triangles,components:solids.size,geometricVertices:points.length,geometricEdges:edges.size,minimumVolume,minimumOutwardDot,closedOutward:true});
 // Raw array writes must follow Three's versioned-attribute contract. Known
 // source bytes are validated above; draw checks do not re-hash every vertex.
 return {geometry,stats,assertUnchanged(){
  if(geometry.getAttribute('position')!==position||geometry.index!==index||position.count!==positionCount||position.itemSize!==3||index.count!==indexCount||index.itemSize!==1||(position.version??position.data?.version)!==positionVersion||index.version!==indexVersion||(position.array??position.data?.array)!==positionArray||index.array!==indexArray||geometry.groups.length||geometry.drawRange.start!==0||!(geometry.drawRange.count>=index.count)||geometry.morphAttributes.position?.length)throw new Error('Validated closed entry geometry changed');
 }};
}

// This depth belongs exclusively to the closed entry. BackSide is its intended
// persistent policy, not a temporary shared-material swap. Three assigns the
// canonical color side before onBeforeShadow; reassert our policy afterward.
// A failed draw can skip onAfterShadow safely: no shared state needs rollback.
export function installClosedEntryShadow(mesh,validation){
 const depth=mesh.customDepthMaterial,geometry=mesh.geometry,material=mesh.material;
 if(!depth?.isMeshDepthMaterial||Array.isArray(material)||mesh.isSkinnedMesh||mesh.isInstancedMesh||validation.geometry!==geometry)throw new Error('Closed entry requires its own validated ordinary depth mesh');
 validation.assertUnchanged();
 const before=mesh.onBeforeShadow,after=mesh.onAfterShadow;
 const stats={policy:'closed-entry-back-side-v1',status:'ready',side:BackSide,beforeDraws:0,completedDraws:0,rejectedDraws:0,callbackFailures:0,lastFailure:null,disposed:false,geometry:validation.stats};
 const reject=(reason,message)=>{const error=new Error(message);error.closedEntryShadowRejection=reason;throw error;};
 // The compiler queries this same contract without replaying callbacks or
 // changing draw diagnostics. It does not infer policy from depth.side.
 const assertContract=()=>{
  if(mesh.customDepthMaterial!==depth||mesh.geometry!==geometry)reject('foreign-depth-or-geometry','Closed entry received a non-owned shadow draw');
  if(mesh.material!==material||material.transparent||material.opacity!==1||material.alphaTest!==0||material.alphaHash||material.alphaToCoverage||material.displacementMap||material.clippingPlanes?.length)reject('unsupported-source-material','Closed entry material no longer has an opaque undeformed unclipped shell');
  try{validation.assertUnchanged();}catch(error){reject('changed-geometry',error.message);}
 };
 const assertOwned=args=>{
  try{
   if(args[1]!==mesh||args[4]!==geometry||args[5]!==depth)reject('foreign-depth-or-geometry','Closed entry received a non-owned shadow draw');
   assertContract();
  }catch(error){if(error.closedEntryShadowRejection){stats.rejectedDraws++;stats.status='rejected';stats.lastFailure=error.closedEntryShadowRejection;}throw error;}
 };
 const beforeHook=function(...args){
  if(stats.disposed)return before.apply(this,args);
  try{assertOwned(args);before.apply(this,args);assertOwned(args);stats.beforeDraws++;stats.status='active';}
  catch(error){if(!error.closedEntryShadowRejection){stats.callbackFailures++;stats.status='callback-failed';stats.lastFailure='before-callback';}throw error;}
  finally{depth.side=BackSide;}
 };
 const afterHook=function(...args){
  if(stats.disposed)return after.apply(this,args);
  try{assertOwned(args);stats.completedDraws++;return after.apply(this,args);}
  catch(error){if(!error.closedEntryShadowRejection){stats.callbackFailures++;stats.status='callback-failed';stats.lastFailure='after-callback';}throw error;}
  finally{depth.side=BackSide;}
 };
 // Reject unsupported material/depth variants before any installation/compile.
 assertContract();
 const releasePolicy=registerOwnedShadowSide(mesh,{material,depth,geometry,side:BackSide,assertValid:assertContract});
 depth.side=BackSide;mesh.onBeforeShadow=beforeHook;mesh.onAfterShadow=afterHook;
 const dispose=()=>{
  if(stats.disposed)return;stats.disposed=true;stats.status='disposed';releasePolicy();
  if(mesh.onBeforeShadow===beforeHook)mesh.onBeforeShadow=before;
  if(mesh.onAfterShadow===afterHook)mesh.onAfterShadow=after;
  geometry.removeEventListener('dispose',dispose);depth.removeEventListener('dispose',dispose);
 };
 geometry.addEventListener('dispose',dispose);depth.addEventListener('dispose',dispose);
 return {stats,dispose};
}
