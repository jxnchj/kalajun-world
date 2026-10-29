import * as T from 'three';
import {countPhotoClusters42} from './photo-cluster-audit42.js';
const topologyCache=new WeakMap();
// Called explicitly on a held, fully prepared actual scene. No update(), render,
// stream build, material/geometry mutation or source matrix copy is performed.
export function auditPhotoClusters42(app,{counts=[8,16]}={}){
 const d=app.debug??app;if(!d.ecology?.nearTreeBatches||!d.camera||!d.environment?.csm)throw Error('Actual kalajunV2 debug scene required');
 const camera=d.camera,projection=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),passes=[{name:'main',camera,frustum:new T.Frustum().setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth)}];
 for(const [i,light]of d.environment.csm.lights.entries()){const source=light.shadow.getFrustum();if(!source?.planes?.every(p=>[p.normal.x,p.normal.y,p.normal.z,p.constant].every(Number.isFinite)))throw Error('Unprepared actual CSM frustum');passes.push({name:'CSM-'+i,shadow:true,camera,frustum:new T.Frustum().copy(source)});}
 const batches=[...d.ecology.nearTreeBatches.values()],start=performance.now(),results=counts.map(clusters=>countPhotoClusters42(batches,passes,{clusters,topologyCache}));
 return{version:42,scope:'Read-only actual main and existing CSM frusta. Mode1/5 opaque alpha-masked photo foliage only; not needles, no density/LOD/fade changes.',position:camera.position.toArray(),viewport:{width:d.renderer?.domElement.width,height:d.renderer?.domElement.height},minutes:d.environment.minutes,windTime:d.ecology.uniforms.uWindTime.value,treeRevision:d.ecology.treeBatchRevision,passes:passes.map(p=>({name:p.name,planes:p.frustum.planes.map(v=>[...v.normal.toArray(),v.constant])})),results,cpuMs:performance.now()-start,interpretation:'baseline is current per-batch submission; rootOnly separates existing whole-root opportunity from additional cluster pruning. drawLower preserves source batches; drawUpper is one instanced draw per nonempty source block. GPU/CPU runtime gain is unproven.'};
}
