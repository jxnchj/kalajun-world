import {Object3D,Matrix4} from 'three';
const nativeLocal=Object3D.prototype.updateMatrix,nativeWorld=Object3D.prototype.updateMatrixWorld;
// Only native Scene/Group parents are wrapped. Leaves retain their exact Three
// methods. Manual direct children need local AND world snapshots: a native
// auto-updating ancestor normally overwrites unflagged edits to either matrix.
export function installSceneParentMatrixCache(scene,{enabled=true}={}){
 const records=new Map(),stats={enabled:!!enabled,scope:'parents',nodes:0,eligible:0,manualGuards:0,checks:0,reused:0,composed:0,childChecks:0,childChanges:0,guardCopies:0,customFallbacks:0};let disposed=false;
 const restore=r=>{
  const o=r.object;
  if(o.updateMatrix===r.localHook){if(r.ownLocal)o.updateMatrix=r.local;else delete o.updateMatrix;}
  if(o.updateMatrixWorld===r.worldHook){if(r.ownWorld)o.updateMatrixWorld=r.world;else delete o.updateMatrixWorld;}
 };
 function refresh(r){
  const o=r.object,local=o.updateMatrix,world=o.updateMatrixWorld;
  const eligible=!!(o.isScene||(o.isGroup&&o.children.length>0))
   &&(local===nativeLocal||local===r.localHook)&&(world===nativeWorld||world===r.worldHook);
  if(eligible===r.eligible)return;
  if(eligible){
   r.previousLocal??=new Matrix4();r.previousWorld??=new Matrix4();r.trs??=new Float64Array(13);
   r.ready=false;o.updateMatrix=r.localHook;o.updateMatrixWorld=r.worldHook;stats.eligible++;
  }else{restore(r);r.ready=false;stats.eligible--;stats.manualGuards-=r.manual.size;r.manual.clear();}
  r.eligible=eligible;
 }
 function add(object){
  if(records.has(object))return;
  const r={object,eligible:false,ownLocal:Object.hasOwn(object,'updateMatrix'),ownWorld:Object.hasOwn(object,'updateMatrixWorld'),local:object.updateMatrix,world:object.updateMatrixWorld,manual:new Map(),ready:false,propagating:false,pivot:false};
  records.set(object,r);stats.nodes++;
  const sameTRS=()=>{const p=object.position,q=object.quaternion,s=object.scale,v=object.pivot,t=r.trs;
   return t[0]===p.x&&t[1]===p.y&&t[2]===p.z&&t[3]===q.x&&t[4]===q.y&&t[5]===q.z&&t[6]===q.w&&t[7]===s.x&&t[8]===s.y&&t[9]===s.z&&r.pivot===(v!==null)&&(!v||(t[10]===v.x&&t[11]===v.y&&t[12]===v.z));};
  const captureTRS=()=>{const p=object.position,q=object.quaternion,s=object.scale,v=object.pivot,t=r.trs;
   t[0]=p.x;t[1]=p.y;t[2]=p.z;t[3]=q.x;t[4]=q.y;t[5]=q.z;t[6]=q.w;t[7]=s.x;t[8]=s.y;t[9]=s.z;r.pivot=v!==null;if(v){t[10]=v.x;t[11]=v.y;t[12]=v.z;}r.previousLocal.copy(object.matrix);};
  const safeChildren=()=>{
   for(const child of object.children){
    const cr=records.get(child);
    // A custom method can observe force or mutate its descendants. Keep its
    // original forced-parent contract instead of guessing the callback effects.
    if((child.updateMatrix!==nativeLocal&&child.updateMatrix!==cr?.localHook)||(child.updateMatrixWorld!==nativeWorld&&child.updateMatrixWorld!==cr?.worldHook)){stats.customFallbacks++;return false;}
    // A manual non-leaf cannot regenerate force for unflagged edits deeper
    // below it. Preserve force for that uncommon branch instead of recursively
    // scanning or wrapping its descendants.
    if(!child.matrixAutoUpdate&&child.children.length){stats.customFallbacks++;return false;}
    if(child.matrixAutoUpdate){if(r.manual.has(child))r.captureAfter=true;}
    else{
     if(child.matrixWorldNeedsUpdate)r.captureAfter=true;
     stats.childChecks++;const old=r.manual.get(child);
     if(!old||old.worldAuto!==child.matrixWorldAutoUpdate||!old.local.equals(child.matrix)||!old.world.equals(child.matrixWorld)){stats.childChanges++;return false;}
    }
   }
   return true;
  };
  const captureChildren=()=>{
   // No whole-scene scan: each eligible parent owns only its direct manual
   // children. Unchanged matrices are never recopied. Removing/reparenting a
   // child releases its snapshots immediately via the native child events.
   for(const child of object.children){
    if(child.matrixAutoUpdate){if(r.manual.delete(child))stats.manualGuards--;continue;}
    let old=r.manual.get(child);
    if(!old){old={local:child.matrix.clone(),world:child.matrixWorld.clone(),worldAuto:child.matrixWorldAutoUpdate};r.manual.set(child,old);stats.manualGuards++;stats.guardCopies+=2;}
    else{
     old.worldAuto=child.matrixWorldAutoUpdate;
     if(!old.local.equals(child.matrix)){old.local.copy(child.matrix);stats.guardCopies++;}
     if(!old.world.equals(child.matrixWorld)){old.world.copy(child.matrixWorld);stats.guardCopies++;}
    }
   }
  };
  r.localHook=function(){
   if(!stats.enabled||!r.propagating)return r.local.call(this);
   stats.checks++;
   if(r.ready&&r.worldAuto===this.matrixWorldAutoUpdate&&sameTRS()&&r.previousLocal.equals(this.matrix)&&r.previousWorld.equals(this.matrixWorld)&&safeChildren()){stats.reused++;return;}
   r.captureAfter=true;const value=r.local.call(this);stats.composed++;captureTRS();return value;
  };
  r.worldHook=function(force){
   // Do not invent dirty updates for a manual parent: its upstream native force
   // (or explicit needsUpdate) governs it exactly as before.
   if(!stats.enabled||!this.matrixAutoUpdate||this.updateMatrix!==r.localHook){r.ready=false;return r.world.call(this,force);}
   r.captureAfter=!!force||this.matrixWorldNeedsUpdate||!r.ready;r.propagating=true;
   try{return r.world.call(this,force);}finally{
    r.propagating=false;
    if(!r.previousWorld.equals(this.matrixWorld))r.previousWorld.copy(this.matrixWorld);
    if(r.captureAfter)captureChildren();r.worldAuto=this.matrixWorldAutoUpdate;r.ready=true;
   }
  };
  r.added=e=>{add(e.child);refresh(r);r.ready=false;};
  r.removed=e=>{if(r.manual.delete(e.child))stats.manualGuards--;remove(e.child);refresh(r);r.ready=false;};
  object.addEventListener('childadded',r.added);object.addEventListener('childremoved',r.removed);
  for(const child of object.children)add(child);
  refresh(r);
 }
 function remove(object){
  const r=records.get(object);if(!r)return;
  for(const child of object.children)remove(child);
  object.removeEventListener('childadded',r.added);object.removeEventListener('childremoved',r.removed);
  restore(r);stats.manualGuards-=r.manual.size;r.manual.clear();records.delete(object);stats.nodes--;if(r.eligible)stats.eligible--;
 }
 add(scene);
 return{stats,setEnabled(value){stats.enabled=!!value;},dispose(){if(disposed)return;disposed=true;remove(scene);}};
}
