import {Frustum,Matrix4,Box3,DynamicDrawUsage} from 'three';
import {meadowRootBoxes41,meadowTileVisibility41} from './meadow-root-visibility41.js';

// Run before any scene render, with ALL colour camera frusta (main + the actual
// eligible reflection). Ordinary middle does not cast shadows; never touch near
// or brook meshes, and refuse compaction if that ownership changes.
export class MeadowMiddleVisibility41 {
 constructor(ecology,{enabled=new URLSearchParams(globalThis.location?.search||'').get('meadowVisible41')==='1'}={}){
  this.ecology=ecology;this.enabled=enabled;this.records=new Map();this.indices=[];
  this.stats={enabled,tiles:0,roots:0,submitted:0,boundaryTiles:0,uploads:0,uploadBytes:0,updateMs:0,cpuBytes:0};
 }
 setEnabled(enabled){this.enabled=!!enabled;this.stats.enabled=this.enabled;if(!this.enabled)this.restore();return this.enabled;}
 record(mesh,roots){
  let r=this.records.get(mesh);if(r)return r;
  const fields=['aMeadowRootField','aMeadowLandform','aMeadowCommunity'].map(name=>mesh.geometry.attributes[name]);
  if(fields.some(a=>!a?.isInstancedBufferAttribute||a.count!==mesh.instanceMatrix.count))throw Error('Unsupported ordinary meadow root fields');
  const matrix=new Matrix4(),attrs=[mesh.instanceMatrix,...fields],buffers=attrs.map(a=>a.array.slice()),boxes=meadowRootBoxes41(mesh.geometry,roots,(_,i)=>matrix.fromArray(mesh.instanceMatrix.array,i*16)),box=new Box3();boxes.forEach(b=>box.union(b));
  r={mesh,attrs,buffers,boxes,box,count:mesh.count,selection:null};attrs.forEach(a=>a.setUsage(DynamicDrawUsage));this.records.set(mesh,r);
  return r;
 }
 apply(r,selection,count){
  const same=selection===null?r.selection===null:r.selection!==null&&selection.length===r.selection.length&&selection.every((v,i)=>v===r.selection[i]);
  r.mesh.count=count;if(same)return;
  for(let k=0;k<r.attrs.length;k++){
   const a=r.attrs[k],source=r.buffers[k],n=a.itemSize;
   if(selection===null)a.array.set(source);
   else for(let i=0;i<count;i++)a.array.set(source.subarray(selection[i]*n,(selection[i]+1)*n),i*n);
   a.clearUpdateRanges();a.addUpdateRange(0,count*n);a.needsUpdate=true;
   this.stats.uploadBytes+=count*n*a.array.BYTES_PER_ELEMENT;
  }
  r.selection=selection===null?null:Array.from(selection);this.stats.uploads++;
 }
 restore(){for(const r of this.records.values())this.apply(r,null,r.count);}
 update(cameras){
  const start=performance.now();Object.assign(this.stats,{enabled:this.enabled,tiles:0,roots:0,submitted:0,boundaryTiles:0,uploadBytes:0});
  if(!this.enabled||!cameras?.length){this.restore();this.stats.updateMs=performance.now()-start;return;}
  const frusta=cameras.map(c=>{c.updateMatrixWorld();return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);});
  const active=new Set();
  for(const tile of this.ecology.grassTiles.values()){
   const mesh=tile.meshes[1];if(!mesh)continue;active.add(mesh);
   // No silently lost off-camera shadow casters if future material ownership changes.
   if(mesh.castShadow){const r=this.records.get(mesh);if(r)this.apply(r,null,r.count);continue;}
   const r=this.record(mesh,tile.regular),selected=meadowTileVisibility41(r.box,r.boxes,frusta,this.indices);
   this.apply(r,selected.indices,selected.count);this.stats.tiles++;this.stats.roots+=r.count;this.stats.submitted+=selected.count;if(selected.mode==='boundary')this.stats.boundaryTiles++;
  }
  for(const mesh of this.records.keys())if(!active.has(mesh))this.records.delete(mesh);
  this.stats.cpuBytes=[...this.records.values()].reduce((n,r)=>n+r.buffers.reduce((s,a)=>s+a.byteLength,0)+r.boxes.length*48+(r.selection?.length||0)*8,0);
  this.stats.updateMs=performance.now()-start;
 }
 dispose(){this.restore();this.records.clear();}
}
