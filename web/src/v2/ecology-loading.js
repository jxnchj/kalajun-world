// The needle recipe depends only on the high tree source, not on far-tree
// textures or habitat maps. Flowers are likewise independent of tree setup.
// Keep a single ownership handoff: a failed branch settles and releases every
// completed source, including work that finishes after cancellation.
function disposeSources(values) {
  values.far?.dispose();
  values.flowerLOD?.dispose();
  values.flowerNear?.dispose();
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  for(const gltf of [values.hi,values.mid,values.needle])gltf?.scene?.traverse(o=>{
    if(!o.isMesh)return;
    geometries.add(o.geometry);
    for(const material of Array.isArray(o.material)?o.material:[o.material]){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
  for(const texture of textures){texture.dispose();if(texture.image)images.add(texture.image);}
  for(const image of images)image.close?.();
}
export async function loadEcologySources(loaders,{signal,onFailure,onReady,beforePublish,phases={},now=()=>performance.now()}={}) {
  const values={},jobs=[],started=now();let failed=false,firstError;
  const fail=error=>{if(!failed){failed=true;firstError=error;onFailure?.(error);}};
  const run=(name,work,dependency)=>{
    const phase=phases[name]={queuedMs:now()-started,startMs:null,elapsedMs:null,status:'waiting'};
    const promise=Promise.resolve(dependency).then(input=>{phase.startMs=now()-started;phase.status='running';return work(input);}).then(value=>{
      values[name]=value;onReady?.(name,value);phase.status='complete';return value;
    }).catch(error=>{phase.status='failed';throw error;}).finally(()=>{phase.elapsedMs=phase.startMs===null?0:now()-started-phase.startMs;});
    // Attach handlers immediately, even while another dependency is pending.
    promise.catch(fail);jobs.push(promise);return promise;
  };
  const hi=run('hi',loaders.hi);
  run('mid',loaders.mid);run('local',loaders.local);run('core',loaders.core);
  const flowers=run('flowerModule',loaders.flowerModule);
  run('far',loaders.far);
  run('needle',loaders.needle,hi);
  run('flowerLOD',m=>m.loadFlowerLODAssets(),flowers);
  run('flowerNear',m=>m.loadFlowerAssets(),flowers);
  try {
    await Promise.all(jobs);
    if(signal?.aborted)throw signal.reason??new DOMException('Ecology loading aborted','AbortError');
    await beforePublish?.(values);
    if(signal?.aborted)throw signal.reason??new DOMException('Ecology loading aborted','AbortError');
    return values;
  } catch(error) {
    fail(error);
    await Promise.allSettled(jobs);
    disposeSources(values);
    throw firstError;
  }
}
