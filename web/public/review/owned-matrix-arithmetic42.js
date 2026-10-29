// No all-scene installation and no TRS cache. Reuses the adopted exact arithmetic
// implementation; candidate auto-leaf support is opt-in and still composes TRS.
export async function createOwnedMatrixArithmetic42(app,{enabled=false,install}={}){
 const d=app.debug??app;
 install??=(await import('/src/v2/structure-matrix-arithmetic41.js')).installStructureMatrixArithmetic41;
 const groups=[d.terrain?.group,d.ecology?.group,d.ecology?.grassGroup,d.ecology?.nearGroup,d.ecology?.forestFloor?.group,d.ecology?.reachBankCover39?.group,d.ecology?.gpuBrushes?.group].filter((v,i,a)=>v&&a.indexOf(v)===i);
 const owners=[],stats={enabled:false,groups:[],skipped:[]};let disposed=false;
 const nativeFor=group=>{for(let p=Object.getPrototypeOf(group);p;p=Object.getPrototypeOf(p))if(Object.hasOwn(p,'updateMatrixWorld')&&Object.hasOwn(p,'updateMatrix')&&Object.hasOwn(p,'updateWorldMatrix'))return p.updateMatrixWorld;return null;};
 const api={stats,setEnabled(value){if(disposed)throw Error('Disposed matrix candidate');value=!!value;if(value===stats.enabled)return;
  if(!value){for(const o of owners)o.owner.dispose();owners.length=0;stats.enabled=false;return;}
  stats.groups=[];stats.skipped=[];try{for(const group of groups){const nativeWorld=nativeFor(group);if(!nativeWorld||group.updateMatrixWorld!==nativeWorld){stats.skipped.push({name:group.name,reason:'foreign group matrix hook'});continue;}const owner=install(group,{nativeWorld,allowAutoLeaves:true});owners.push({group,owner});stats.groups.push({name:group.name,stats:owner.stats});}stats.enabled=true;}catch(e){for(const o of owners)o.owner.dispose();owners.length=0;throw e;}
 },dispose(){if(disposed)return;api.setEnabled(false);disposed=true;}};
 api.setEnabled(enabled);return api;
}
