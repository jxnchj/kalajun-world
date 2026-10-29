import * as T from 'three';
import {createMeadowRootWind41,attachMeadowRootWind41} from './meadow-root-wind41.js';
// Default OFF. Call AFTER visibility compaction and BEFORE ANY scene shadow,
// reflection or colour pass. Current matrix SLOT is the key, never old root ID.
export class MeadowRootWindRuntime41{
 constructor(ecology,{enabled=new URLSearchParams(globalThis.location?.search||'').get('meadowRootWind41')==='1'}={}){
  this.ecology=ecology;this.enabled=!!enabled;this.records=[];this.cache=null;this.restores=[];this.signature=null;
  this.binding={textureUniform:{value:null},sizeUniform:{value:new T.Vector2(1,1)}};
  this.stats={enabled:this.enabled,roots:0,meshes:0,textureBytes:0,inputBytes:0,rootSlotBytes:0,rebuilds:0,updates:0,updateMs:0,submittedRoots:0,scope:'Cache render cost must be included in whole-frame GPU measurement.'};
 }
 setEnabled(value){this.enabled=!!value;this.stats.enabled=this.enabled;if(!this.enabled)this.clear();return this.enabled;}
 clear(){for(const restore of this.restores)restore();this.restores=[];for(const r of this.records){if(r.mesh.geometry?.attributes.aMeadowWindRoot41===r.index)r.mesh.geometry.deleteAttribute('aMeadowWindRoot41');}this.cache?.dispose();this.cache=null;this.records=[];this.signature=null;this.binding.textureUniform.value=null;Object.assign(this.stats,{roots:0,meshes:0,textureBytes:0,inputBytes:0,rootSlotBytes:0,submittedRoots:0});}
 collect(){const rows=[];for(const tile of this.ecology.grassTiles.values())for(let lod=0;lod<2;lod++){const mesh=tile.meshes[lod];if(!mesh)continue;if(mesh.material!==this.ecology.grassMaterials[lod])throw Error('Unexpected ordinary grass material owner');rows.push({mesh,capacity:mesh.instanceMatrix.count});}return rows;}
 rebuild(rows){
  const roots=rows.reduce((n,r)=>n+r.capacity,0),matrices=new Float32Array(roots*16);let start=0;
  for(const r of this.records)if(r.mesh.geometry?.attributes.aMeadowWindRoot41===r.index)r.mesh.geometry.deleteAttribute('aMeadowWindRoot41');
  this.records=rows.map(r=>{matrices.set(r.mesh.instanceMatrix.array,start*16);const index=new T.InstancedBufferAttribute(Float32Array.from({length:r.capacity},(_,i)=>start+i),1),record={...r,start,index,version:r.mesh.instanceMatrix.version};r.mesh.geometry.setAttribute('aMeadowWindRoot41',index);start+=r.capacity;return record;});
  const next=createMeadowRootWind41(matrices,this.ecology.uniforms);this.cache?.dispose();this.cache=next;this.binding.textureUniform.value=next.target.texture;this.binding.sizeUniform.value.copy(next.size);this.signature=null;
  if(!this.restores.length)this.restores=[...this.ecology.grassMaterials,this.ecology.grassDepth].map(material=>attachMeadowRootWind41(material,this.binding));
  Object.assign(this.stats,{roots,meshes:rows.length,textureBytes:next.stats.textureBytes,inputBytes:next.stats.rootPositionBytes,rootSlotBytes:roots*4});this.stats.rebuilds++;
 }
 update(renderer){const begin=performance.now();this.stats.enabled=this.enabled;if(!this.enabled){this.stats.updateMs=performance.now()-begin;return;}
  const rows=this.collect();if(!this.cache||rows.length!==this.records.length||rows.some((r,i)=>r.mesh!==this.records[i].mesh||r.capacity!==this.records[i].capacity))this.rebuild(rows);
  let changed=false;for(const r of this.records)if(r.version!==r.mesh.instanceMatrix.version){this.cache.updateMatrices(r.mesh.instanceMatrix.array,r.start);r.version=r.mesh.instanceMatrix.version;changed=true;}
  const u=this.ecology.uniforms,signature=[u.uWindTime.value,u.uWindPrevious.value,u.uWindPrevious.value.version,u.uWindCurrent.value,u.uWindCurrent.value.version,u.uWindFieldOrigin.value.x,u.uWindFieldOrigin.value.y,u.uWindFieldSpan.value,u.uWindFieldBlend.value];
  if(changed||!this.signature||signature.some((v,i)=>v!==this.signature[i])){this.cache.update(renderer);this.signature=signature;this.stats.updates++;}
  this.stats.submittedRoots=this.records.reduce((n,r)=>n+r.mesh.count,0);this.stats.updateMs=performance.now()-begin;
 }
 dispose(){this.clear();this.enabled=false;this.stats.enabled=false;}
}
