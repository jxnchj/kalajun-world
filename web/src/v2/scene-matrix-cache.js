import {Object3D,Matrix4} from 'three';
import {installSceneParentMatrixCache} from './scene-parent-matrix-cache.js';
const nativeLocal=Object3D.prototype.updateMatrix,nativeWorld=Object3D.prototype.updateMatrixWorld;
// Scene-local ownership only. No Three prototypes or matrix update flags change.
export function installSceneMatrixCache(scene,{enabled=true,scope='all'}={}){
 if(scope==='parents')return installSceneParentMatrixCache(scene,{enabled});
 if(scope!=='all')throw new RangeError('Unknown scene matrix cache scope');
 const records=new Map(),stats={enabled:!!enabled,nodes:0,eligible:0,checks:0,reused:0,composed:0,manualChanges:0};let disposed=false;
 function add(object){
  if(records.has(object))return;
  const record={object,eligible:object.updateMatrix===nativeLocal&&object.updateMatrixWorld===nativeWorld,
   ownLocal:Object.hasOwn(object,'updateMatrix'),ownWorld:Object.hasOwn(object,'updateMatrixWorld'),local:object.updateMatrix,world:object.updateMatrixWorld,
   previousLocal:new Matrix4(),previousWorld:new Matrix4(),trs:new Float64Array(13),pivot:false,ready:false,propagating:false};
  records.set(object,record);stats.nodes++;
  const sameTRS=()=>{const p=object.position,q=object.quaternion,s=object.scale,v=object.pivot,t=record.trs;
   return t[0]===p.x&&t[1]===p.y&&t[2]===p.z&&t[3]===q.x&&t[4]===q.y&&t[5]===q.z&&t[6]===q.w&&t[7]===s.x&&t[8]===s.y&&t[9]===s.z&&record.pivot===(v!==null)&&(!v||(t[10]===v.x&&t[11]===v.y&&t[12]===v.z));};
  const captureTRS=()=>{const p=object.position,q=object.quaternion,s=object.scale,v=object.pivot,t=record.trs;
   t[0]=p.x;t[1]=p.y;t[2]=p.z;t[3]=q.x;t[4]=q.y;t[5]=q.z;t[6]=q.w;t[7]=s.x;t[8]=s.y;t[9]=s.z;record.pivot=v!==null;if(v){t[10]=v.x;t[11]=v.y;t[12]=v.z;}record.previousLocal.copy(object.matrix);};
  record.localHook=function(){
   if(!stats.enabled||!record.propagating)return record.local.call(this);
   // Explicit updateMatrix() retains its normal dirty-flag semantics. Cache
   // only native propagation calls, and never clear an already requested update.
   if(stats.enabled&&record.propagating&&record.ready){stats.checks++;
    if(sameTRS()&&record.previousLocal.equals(this.matrix)&&record.previousWorld.equals(this.matrixWorld)){stats.reused++;return;}
   }
   const value=record.local.call(this);stats.composed++;captureTRS();return value;
  };
  record.worldHook=function(force){
   if(!stats.enabled)return record.world.call(this,force);
   const active=stats.enabled&&this.updateMatrix===record.localHook;
   if(active&&record.ready&&!this.matrixAutoUpdate&&(!record.previousLocal.equals(this.matrix)||!record.previousWorld.equals(this.matrixWorld))){this.matrixWorldNeedsUpdate=true;stats.manualChanges++;}
   record.propagating=active;
   try{return record.world.call(this,force);}finally{
    record.propagating=false;record.previousLocal.copy(this.matrix);record.previousWorld.copy(this.matrixWorld);record.ready=true;
   }
  };
  if(record.eligible){object.updateMatrix=record.localHook;object.updateMatrixWorld=record.worldHook;stats.eligible++;}
  record.added=e=>add(e.child);record.removed=e=>remove(e.child);
  object.addEventListener('childadded',record.added);object.addEventListener('childremoved',record.removed);
  for(const child of object.children)add(child);
 }
 function remove(object){
  const record=records.get(object);if(!record)return;
  for(const child of object.children)remove(child);
  object.removeEventListener('childadded',record.added);object.removeEventListener('childremoved',record.removed);
  if(object.updateMatrix===record.localHook){if(record.ownLocal)object.updateMatrix=record.local;else delete object.updateMatrix;}
  if(object.updateMatrixWorld===record.worldHook){if(record.ownWorld)object.updateMatrixWorld=record.world;else delete object.updateMatrixWorld;}
  records.delete(object);stats.nodes--;if(record.eligible)stats.eligible--;
 }
 add(scene);
 return {stats,setEnabled(value){stats.enabled=!!value;},dispose(){if(disposed)return;disposed=true;remove(scene);}};
}
