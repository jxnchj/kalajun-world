function ecologyCounters42(e){
 if(!e)return null;const b=e.gpuBrushes?.branchCache?.stats,f=e.forestFloor?.stats,r=e.reachBankCover39?.stats;
 return{farQueue:e.queue?.length,farTiles:e.tiles?.size,nearBatches:e.nearTreeBatches?.size,treeBatchRevision:e.treeBatchRevision,grassQueue:e.grassQueue?.length,grassTiles:e.grassTiles?.size,grassBuilt:e.stats?.grassBuiltThisFrame,wetContactUpdated:e.stats?.wetContactUpdated,wetContactPending:e.stats?.wetContactPending,gpuBatches:e.gpuBrushes?.batches?.size,branchBuilt:b?.builtGroups,branchPending:b?.pending,branchResidentBytes:b?.residentBytes,forestFloorPending:f?.pending,forestFloorBuilt:f?.builtThisFrame,forestFloorRevision:f?.revision,reachPending:r?.pending,reachBuilt:r?.built,reachBuildWorkMs:r?.buildWorkMs};
}
// Explicit diagnostic only. No shader/asset content, no changes to frame cadence.
export function installLoadSpikeTrace42(app,{now=()=>performance.now(),thresholdMs=250,limit=12}={}){
 const d=app.debug??app,r=d.renderer,gl=r.getContext(),restores=[],known=new Set(r.info?.programs??[]),stats={thresholdMs,limit,sampledFrames:0,spikeFrames:0,frames:[],disposed:false,scope:'Instrumented initial RAF intervals; nested CPU categories overlap and must not be summed'};let cpu={},upload={bufferDataBytes:0,bufferSubDataBytes:0,bufferDataCalls:0,bufferSubDataCalls:0,ms:0};
 function wrap(object,key,label,bytes){if(typeof object?.[key]!=='function')return;const original=object[key],descriptor=Object.getOwnPropertyDescriptor(object,key);function hook(...args){const start=now();let ok=false;try{const value=original.apply(this,args);if(label==='reach.generate'&&typeof value?.next==='function')wrap(value,'next','reach.generate.next');ok=true;return value;}finally{const elapsed=now()-start;if(bytes){upload[key+'Calls']++;upload.ms+=elapsed;if(ok)upload[key+'Bytes']+=bytes(args);}else{const row=cpu[label]??={ms:0,calls:0};row.ms+=elapsed;row.calls++;}}}object[key]=hook;restores.push(()=>{if(object[key]===hook){if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];}});}
 const dataBytes=(data,offset=0,length)=>{if(typeof data==='number')return data;if(!data)return 0;const stride=data.BYTES_PER_ELEMENT??1,available=data.length??data.byteLength;return Math.max(0,(length===undefined||length===0)?available-offset:length)*stride;};
 try{
  for(const owner of ['terrain','ecology','structures','environment','water','settlements','doors','pasture'])wrap(d[owner],'update',owner+'.update');
  // Existing opt-in trace only. Per-root methods are intentionally NOT wrapped.
  const eco=d.ecology;
  for(const key of ['buildTile','rebuildNearTrees','syncActiveTrees','syncTreeDynamics','updateMeadow','buildGrassTile','generateGrassTileRoots','addBrookWetMeshes','addFlowers','syncNearFlowers','syncBasalGrass','publishMeadowPools'])wrap(eco,key,'ecology.'+key);
  wrap(eco?.windField,'update','windField.update');wrap(eco?.treeRootWind,'update','treeRootWind.update');wrap(eco?.middleBatched,'sync','middleBatched.sync');
  wrap(eco?.gpuBrushes,'sync','gpuBrushes.sync');wrap(eco?.gpuBrushes?.owners,'register','gpuOwners.register');
  wrap(eco?.forestFloor,'update','forestFloor.update');wrap(eco?.forestFloor,'buildTile','forestFloor.buildTile');wrap(eco?.forestFloor?.submission,'update','forestFloor.submission');
  wrap(eco?.reachBankCover39,'update','reach.update');wrap(eco?.reachBankCover39,'generate','reach.generate');
  wrap(r,'render','renderer.render');wrap(d.water,'renderReflection','water.renderReflection');wrap(d.grassShadowCoverage41,'render','grassShadow.render');
  wrap(gl,'bufferData',null,a=>dataBytes(a[1],a[3]??0,a[4]));wrap(gl,'bufferSubData',null,a=>dataBytes(a[2],a[3]??0,a[4]));
 }catch(error){for(const undo of restores.reverse())undo();throw error;}
 return{stats,sample(frameMs){if(stats.disposed)return;const added=[];for(const p of r.info?.programs??[])if(!known.has(p)){known.add(p);added.push({id:p.id,name:p.name??''});}stats.sampledFrames++;
  if(frameMs>thresholdMs){stats.spikeFrames++;const b=d.terrain?.submissionBatches?.stats,t=d.terrain?.stats;stats.frames.push({frameMs,newPrograms:added,cpu,upload,ecology:ecologyCounters42(d.ecology),batch:b?{groups:b.groups,rebuilds:b.rebuilds,retired:b.retired,bytes:b.bytes,constructionMs:b.constructionMs,buildMs:b.buildMs}:null,terrain:t?{queuedTiles:t.queuedTiles,morphingGroups:t.morphingGroups,residentTiles:t.residentTiles}:null});stats.frames.sort((a,b)=>b.frameMs-a.frameMs);stats.frames.length=Math.min(limit,stats.frames.length);}
  cpu={};upload={bufferDataBytes:0,bufferSubDataBytes:0,bufferDataCalls:0,bufferSubDataCalls:0,ms:0};
 },dispose(){if(stats.disposed)return;stats.disposed=true;for(let i=restores.length-1;i>=0;i--)restores[i]();}};
}
