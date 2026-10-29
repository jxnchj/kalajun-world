export async function captureTerrainDemandLoad42({name,maxMs=180000}={}){
 const frames=[];let last=null,stable=0;
 while(performance.now()<maxMs){
  const now=await new Promise(r=>requestAnimationFrame(r)),app=window.kalajunV2,d=app?.debug;
  if(!d)continue;
  if(last!==null)frames.push(now-last);last=now;
  const t=d.terrain.stats;
  stable=t.queuedTiles===0&&t.morphingGroups===0?stable+1:0;
  if(stable>=5){const snapshot=app.getSnapshot(),automatic=snapshot.terrain.requestTrace42?.loadFrames;
   if(!automatic?.doneAt)continue;
   frames.splice(0,frames.length,...automatic.intervals);
   const sorted=frames.slice().sort((a,b)=>a-b),result={cache:'HTTP disabled; IndexedDB/driver retained',url:location.href,firstFrameMs:snapshot.loadTimings.navigationToFirstFrameSubmittedMs,terrainSettledMs:automatic.doneAt,frameScope:automatic,frames,summary:{count:frames.length,mean:frames.reduce((a,b)=>a+b,0)/frames.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...frames)},snapshot,resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('terrain-')).map(r=>({url:r.name,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,duration:r.duration}))};
   const response=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});if(!response.ok)throw Error('save '+response.status);return{firstFrameMs:result.firstFrameMs,terrainSettledMs:result.terrainSettledMs,summary:result.summary,terrain:snapshot.terrain,errors:snapshot.errors};
  }
 }
 throw Error('Terrain did not settle');
}
