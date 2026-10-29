// Review-only, no import from production. Reads actual rendered triangles;
// never calls binding.samples(), changes its dependencies, or trusts verdicts.
export async function captureReachContact42(app,{name='reach42-contact-observed',save=true}={}){
 const d=app.debug??app,e=d.ecology,c=e?.reachBankCover39,contact=e?.terrainSurfaceContact;
 if(!c?.stats.built||!contact?.sample)throw Error('Actual built reach/contact required');
 const code=await c.prepared42.loadCode(),inputs=await e.world.getForestRootInputHashes(),records=[];let cacheMatches=0;
 for(const pool of c.pools)for(const root of pool.records){const seats=root.coverAsset.seats.map(group=>{const samples=group.points.map(p=>{const s=contact.sample(p.x,p.z);if(!s||s.morphing||s.spacing>.625)throw Error('Unsettled actual contact: '+root.id);const g=s.mesh.geometry,heights=s.triangle.map(i=>g.attributes.position.getY(i)+s.mesh.position.y);return{point:{x:p.x,z:p.z},height:s.height,spacing:s.spacing,morphing:s.morphing,triangle:s.triangle,weights:s.weights,vertexHeights:heights,node:{x:s.node.x,z:s.node.z,size:s.node.size},meshY:s.mesh.position.y};});const input=Math.fround(Math.min(...samples.map(s=>s.height))-.002-group.level);return{start:group.start,count:group.count,level:group.level,input,samples};});
  if(root.contactCache42&&seats.every(g=>Object.is(root.contactCache42.input[g.start],g.input)))cacheMatches++;
  records.push({root:Object.fromEntries(['id','kind','x','y','z','s','sy','rot'].map(k=>[k,root[k]])),seats});
 }
 if(records.length!==521)throw Error('Incomplete source: '+records.length);
 const result={version:'reach-contact-observed42-1',code,inputs,records,scope:'Actual rendered sample inputs only; offline complete geometry/boundary oracle must produce verdicts',cacheMatches,terrain:{queued:d.terrain?.stats.queuedTiles,morphing:d.terrain?.stats.morphingGroups},camera:d.camera?.position?.toArray?.()};
 if(save){const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});if(!response.ok)throw Error('Evidence save HTTP '+response.status);}
 return{saved:save,name,roots:records.length,groups:records.reduce((n,r)=>n+r.seats.length,0),cacheMatches,code:code.signature};
}
