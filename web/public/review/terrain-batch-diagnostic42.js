// Diagnostic mirror of the EXISTING fast snapshot contract. Never decides
// eligibility or replaces the real batcher. Extra diagnosis time is separate.
export function terrainBatchFailure42(p,record,prototype,classify){
 if(!record){
  if(p.dead)return 'no-record:parent-dead';if(p.transition)return 'no-record:parent-transition';
  if(!p.children||p.children.length!==4)return 'no-record:parent-child-count';
  for(const n of p.children){if(!n||n.dead)return 'no-record:child-dead';if(!n.mesh)return 'no-record:child-mesh-missing';if(!n.mesh.visible)return 'no-record:child-hidden';if(n.split)return 'no-record:child-split';if(n.transition)return 'no-record:child-transition';if(n.mesh.children.length)return 'no-record:mesh-children';}
  return 'no-record:cheap-ready-deep-unknown';
 }
 if(record.mesh.parent!==p.children?.[0]?.mesh?.parent)return 'batch-parent';
 const r=record.fast,c=p.children;if(p.dead||p.transition||!c||c.length!==4)return 'parent-topology';
 if(p.x!==r.x||p.z!==r.z||p.size!==r.size||c[0].size!==r.childSize||c[0].depth!==r.depth)return 'parent-layout';
 const attr=(a,s)=>a===s.a&&a.version===s.version&&a.array===s.array&&a.itemSize===s.itemSize&&a.count===s.count&&a.normalized===s.normalized&&a.gpuType===s.gpuType&&!a.isInterleavedBufferAttribute&&!a.isFloat16BufferAttribute&&a.isBufferAttribute;
 for(let i=0;i<4;i++){
  const a=r.nodes[i],n=c[i],m=n.mesh,g=m?.geometry;if(n!==a.node||n.dead||n.split||n.transition||m!==a.m||!m?.visible||g!==a.g)return 'child-topology';
  if(g.groups.length||g.drawRange.start!==0||g.drawRange.count!==a.draw)return 'draw-range';
  if(!m.isMesh||m.parent!==a.parent||m.material!==a.material)return 'mesh-owner-material';
  if(m.position.x!==a.x||m.position.y!==a.y||m.position.z!==a.z||m.quaternion.x||m.quaternion.y||m.quaternion.z||m.quaternion.w!==1||m.scale.x!==1||m.scale.y!==1||m.scale.z!==1||m.pivot||!m.matrixAutoUpdate||!m.matrixWorldAutoUpdate)return 'transform-mode';
  if(m.customDepthMaterial!==a.depthMaterial)return 'depth-identity';
  if(m.customDepthMaterial?.version!==a.depthVersion)return 'depth-version';
  if(m.customDepthMaterial!==undefined&&!classify(m))return 'depth-contract';
  if(m.layers.mask!==a.layers||m.renderOrder!==a.order||m.castShadow!==a.cast||m.receiveShadow!==a.receive||m.frustumCulled!==a.cull||m.children.length||m.customDistanceMaterial||m.isInstancedMesh||m.isSkinnedMesh)return 'draw-state';
  for(const key of ['updateMatrix','updateMatrixWorld','onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'])if(m[key]!==prototype[key])return 'hook:'+key;
  if(m.morphTargetInfluences?.some(v=>v!==0))return 'morph-weight';
  if(!attr(g.index,a.index))return 'index-binding-version';
  if(g.morphTargetsRelative!==a.relative)return 'morph-mode';
  let j=0;for(const name in g.attributes){const ar=a.attributes[j++];if(!ar||name!==ar.name)return 'attribute-layout';if(!attr(g.attributes[name],ar))return 'attribute:'+name;}if(j!==a.attributes.length)return 'attribute-layout';
  j=0;for(const name in g.morphAttributes){const mr=a.morph[j++],list=g.morphAttributes[name];if(!mr||name!==mr.name||list!==mr.list||list.length!==mr.attributes.length||(list.length&&(!m.morphTargetInfluences||m.morphTargetInfluences.length<list.length)))return 'morph-layout';for(let k=0;k<list.length;k++)if(!attr(list[k],mr.attributes[k]))return 'morph-attribute:'+name;}if(j!==a.morph.length)return 'morph-layout';
  const b=g.boundingBox,s=g.boundingSphere,v=a.bounds;if(b!==a.box||s!==a.sphere||b?.min.x!==v[0]||b?.min.y!==v[1]||b?.min.z!==v[2]||b?.max.x!==v[3]||b?.max.y!==v[4]||b?.max.z!==v[5]||s?.center.x!==v[6]||s?.center.y!==v[7]||s?.center.z!==v[8]||s?.radius!==v[9])return 'bounds';
 }
 return null;
}
export async function diagnoseTerrainBatches42(app,{warm=60,samples=20,boundedBuild42=false,nextFrame=()=>new Promise(r=>requestAnimationFrame(r))}={}){
 const d=app.debug??app,b=d.terrain?.submissionBatches;
 if(!b||b.enabled||b.records.size)throw Error('Requires clean default-OFF terrain batcher; dispose previous experiment first');
 if(!Number.isInteger(warm)||warm<0||!Number.isInteger(samples)||samples<1)throw Error('Invalid frames');
 const original=b.update,oldBounded=b.boundedBuild42,oldStats={...b.stats},hold=d.setReviewHold(true),prototype=Object.getPrototypeOf(Object.getPrototypeOf(d.scene)),rows=[];
 let capture=false;
 b.update=function(nodes){
  let reasons={},examples=[],diagnosticMs=0;
  if(capture){const start=performance.now(),parents=new Set();for(const n of nodes)if(n.parent&&n.mesh?.visible)parents.add(n.parent);
   for(const p of parents){const record=this.records.get(p),reason=terrainBatchFailure42(p,record,prototype,d.shadowStaticProfile39.classify);
    if(reason){reasons[reason]=(reasons[reason]??0)+1;if(examples.length<8){const m=p.children?.[0]?.mesh,a=record?.fast?.nodes?.[0];examples.push({key:p.depth+':'+p.x+','+p.z,reason,depthVersions:p.children?.map(n=>n.mesh?.customDepthMaterial?.version??null),storedDepthVersions:record?.fast?.nodes.map(n=>n.depthVersion??null)});}}
   }diagnosticMs=performance.now()-start;
  }
  const value=original.call(this,nodes);
  if(capture)rows.push({stats:{...this.stats},diagnosticMs,reasons,examples});
  return value;
 };
 try{
  if(boundedBuild42&&!('boundedBuild42'in b))throw Error('Build the updated candidate first');b.boundedBuild42=boundedBuild42;b.enabled=true;d.setReviewHold(false);for(let i=0;i<warm;i++)await nextFrame();d.setReviewHold(true);
  const warmStats={...b.stats};capture=true;d.setReviewHold(false);for(let i=0;i<samples;i++)await nextFrame();d.setReviewHold(true);
  return{method:'Actual current built batcher; original update/rebuild logic unchanged; per-group first fast-snapshot mismatch before update; diagnostic overhead is not performance acceptance',warm,samples,warmStats,rows};
 }finally{
  d.setReviewHold(true);capture=false;b.update=original;b.enabled=false;b.boundedBuild42=oldBounded;b.dispose();Object.assign(b.stats,oldStats);
  try{d.renderFrozenWorld?.();}finally{d.setReviewHold(hold);}
 }
}
