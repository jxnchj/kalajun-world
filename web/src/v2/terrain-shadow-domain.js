// Write-owned WorldTerrain domain only; never infer stability for arbitrary
// scene groups. Unknown children force the original live traversal.
const domains=new WeakMap(),owners=new WeakMap();
// Local data-property notifications only; no Three prototype changes. Restore
// current values and original descriptors when a tile leaves this owner.
function watch(object,key,changed,restores){
 const descriptor=Object.getOwnPropertyDescriptor(object,key);if(!descriptor?.configurable||!('value' in descriptor))return false;
 let value=descriptor.value;Object.defineProperty(object,key,{configurable:true,enumerable:descriptor.enumerable,get:()=>value,set(next){if(next!==value){value=next;changed(next);}}});
 restores.push(()=>Object.defineProperty(object,key,{...descriptor,value}));return true;
}
export function terrainShadowDomain(group){return domains.get(group);}
export function touchTerrainShadowObject(object){owners.get(object)?.touch();}
export function createTerrainShadowDomain(group,material,{enabled=false,available=()=>true}={}){
 if(!enabled)return null;
 const members=new Set(),unknown=new Set(),depths=new Set(),subscriptions=new Map(),unsafe=new Set();
 const domain={group,material,members,depths,revision:0,disposed:false,stats:{installedTiles:0,installedDescriptors:0,activeDescriptors:0,installMs:0},
  touch(){this.revision++;},
  add(object){
   const started=performance.now();members.add(object);owners.set(object,domain);const restores=[],touch=()=>domain.touch(),reject=()=>{unsafe.add(object);touch();};
   for(const key of ['visible','castShadow','receiveShadow','frustumCulled'])if(!watch(object,key,touch,restores))reject();
   if(!watch(object.layers,'mask',touch,restores))reject();
   const initialGeometry=object.geometry,initialMaterial=object.material;
   for(const [key,initial]of [['geometry',initialGeometry],['material',initialMaterial]])watch(object,key,next=>{if(next!==initial)unsafe.add(object);touch();},restores);
   watch(initialGeometry,'index',reject,restores);watch(initialGeometry.attributes,'position',reject,restores);
   for(const key of ['start','count'])watch(initialGeometry.drawRange,key,touch,restores);
   if(initialGeometry.morphAttributes.position)for(let i=0;i<initialGeometry.morphAttributes.position.length;i++)watch(initialGeometry.morphAttributes.position,String(i),reject,restores);
   // Standard depth is lazily assigned by WorldShadowDepth after streaming.
   if(!Object.hasOwn(object,'customDepthMaterial'))object.customDepthMaterial=undefined;
   watch(object,'customDepthMaterial',()=>domain.depth(object),restores);
   for(const [vector,keys]of [[object.position,['x','y','z']],[object.scale,['x','y','z']],[object.quaternion,['_x','_y','_z','_w']]])for(const key of keys)if(!watch(vector,key,touch,restores))reject();
   // The fixed terrain builder owns these original depth inputs. Replacements
   // become untrusted rather than recursively discovering new mutable buffers.
   for(const a of [initialGeometry.index,initialGeometry.attributes.position,...(initialGeometry.morphAttributes.position||[])]){
    if(!a||a.isInterleavedBufferAttribute){reject();continue;}
    if(!watch(a,'version',touch,restores))reject();
    for(const key of ['array','itemSize','count','normalized'])if(!watch(a,key,reject,restores))reject();
   }
   const childAdded=e=>{unknown.add(e.child);touch();},childRemoved=e=>{unknown.delete(e.child);touch();};
   object.addEventListener('childadded',childAdded);object.addEventListener('childremoved',childRemoved);
   restores.push(()=>{object.removeEventListener('childadded',childAdded);object.removeEventListener('childremoved',childRemoved);});
   if(object.children.length)reject();subscriptions.set(object,restores);this.stats.installedTiles++;this.stats.installedDescriptors+=restores.length-1;this.stats.activeDescriptors+=restores.length-1;this.stats.installMs+=performance.now()-started;this.touch();
  },
  depth(object){if(!members.has(object))return;depths.add(object.customDepthMaterial);this.touch();},
  eligible(){return !this.disposed&&available()&&unknown.size===0&&unsafe.size===0&&group.children.length===members.size;},
  dispose(){this.disposed=true;this.touch();for(const o of members){owners.delete(o);for(const undo of subscriptions.get(o)||[])undo();}subscriptions.clear();this.stats.activeDescriptors=0;unsafe.clear();members.clear();depths.clear();unknown.clear();group.removeEventListener('childadded',added);group.removeEventListener('childremoved',removed);domains.delete(group);}
 };
 const added=e=>{if(!members.has(e.child))unknown.add(e.child);domain.touch();};
 const removed=e=>{unknown.delete(e.child);members.delete(e.child);owners.delete(e.child);for(const undo of subscriptions.get(e.child)||[])undo();domain.stats.activeDescriptors-=Math.max(0,(subscriptions.get(e.child)?.length??1)-1);subscriptions.delete(e.child);unsafe.delete(e.child);domain.touch();};
 group.addEventListener('childadded',added);group.addEventListener('childremoved',removed);domains.set(group,domain);return domain;
}
export function terrainShadowDepthAssigned(object){const domain=owners.get(object);domain?.depth(object);}
