function seatOriginalBladeY(world,root,sources){
 const c=Math.cos(root.rot),s=Math.sin(root.rot),geometries=[];
 for(let kind=0;kind<3;kind++){
  const g=sources[kind].clone(),p=g.attributes.position;let start=0;
  for(let blade=0;blade<(kind===2?40:24);blade++){
   const segments=kind===2?3:kind===0?5:blade<8?2:1,count=(segments+1)*2;let level=Infinity;
   for(const i of [start,start+1]){const x=root.x+(c*p.getX(i)+s*p.getZ(i))*root.s,z=root.z+(-s*p.getX(i)+c*p.getZ(i))*root.s;level=Math.min(level,world.surface.heightAt(x,z));}
   const delta=(level-.014-root.y)/(root.sy??root.s);
   for(let i=start;i<start+count;i++)p.setY(i,p.getY(i)+delta);start+=count;
  }
  if(start<p.count){
   let level=Infinity;for(const i of [start,start+1]){const x=root.x+(c*p.getX(i)+s*p.getZ(i))*root.s,z=root.z+(-s*p.getX(i)+c*p.getZ(i))*root.s;level=Math.min(level,world.surface.heightAt(x,z));}
   const delta=(level-.014-root.y)/(root.sy??root.s);for(let i=start;i<p.count;i++)p.setY(i,p.getY(i)+delta);
  }
  geometries.push(g);
 }
 return {geometries,dispose(){geometries.forEach(g=>g.dispose());}};
}
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {actualForestWorld} from './benchmark_forest_exclusion_v38.mjs';
import {WorldEcology,MEADOW} from '../web/src/v2/ecology.js';
const baseline=actualForestWorld(undefined,'rgba',{forestBankCurvature38:false}),candidate=actualForestWorld(undefined,'rgba',{forestBankCurvature38:true}),a=new WorldEcology(baseline),b=new WorldEcology(candidate);
const center={x:-3611.9813305250705,z:4805.371282289286},roots=[],changed=[];
for(let iz=Math.floor((center.z-24)/MEADOW.cell);iz<=Math.ceil((center.z+24)/MEADOW.cell);iz++)for(let ix=Math.floor((center.x-24)/MEADOW.cell);ix<=Math.ceil((center.x+24)/MEADOW.cell);ix++){
 const p=a._grassAt(ix,iz),q=b._grassAt(ix,iz);assert.equal(Boolean(p),Boolean(q));if(!p)continue;
 const {y:py,...pr}=p,{y:qy,brookAsset,...qr}=q;assert.deepEqual(pr,qr);assert.ok(Math.abs((qy-py)-(candidate.surface.heightAt(p.x,p.z)-baseline.surface.heightAt(p.x,p.z)))<1e-9);
 roots.push({p,q});if(Math.abs(py-qy)>1e-8)changed.push({id:p.id,delta:qy-py});
}

const risks=JSON.parse((await import('node:fs')).readFileSync('tools/reports/forest-curvature-contact-v38.json')),results=[];
for(const {p,q}of roots){
 if(!q.brookAsset&&!risks.risks.some(r=>r.id===p.id))continue;
 const asset=q.brookAsset??{geometries:[a.grassGeometries[0],a.grassGeometries[1],a.baseGrassGeometry],dispose(){}};
 if(!asset){results.push({id:p.id,asset:false});continue;}
 let oldPen=0,newPen=0,added=0,count=0,worst=null;
 for(const [kind,g]of asset.geometries.entries()){
  const source=[a.grassGeometries[0],a.grassGeometries[1],a.baseGrassGeometry][kind],pa=source.attributes.position,pb=g.attributes.position,w=source.attributes.aPlantWind;
  assert.equal(pa.count,pb.count);assert.deepEqual(source.index.array,g.index.array);
  const c=Math.cos(p.rot),s=Math.sin(p.rot),sy=p.sy??p.s;
  for(let i=0;i<pa.count;i++){
   assert.equal(pa.getX(i),pb.getX(i));assert.equal(pa.getZ(i),pb.getZ(i));
   if(pa.getY(i)*sy<.12)continue;
   const sway=w?.43*w.getX(i)**2+.11*w.getY(i):0;
   const wx=w.getX(i),wy=w.getY(i),a=.48*wx,ag=1.32*a-.32,amin=Math.min(0,ag),amax=1.32*(1-a)+Math.max(0,ag);
   // Strict interval enclosure of every field r/g/b/a in [0,1], seed flex
   // [.68,1.25] and local sine [-.5,.5]. No chosen time or reduced wind.
   const lo=.23*1.25*amin*wx*wx-.106*wy,hi=.23*1.25*amax*wx*wx+.106*wy,eddy=.5*.045*wx*wx*1.25;
   for(let k=0;k<=8;k++)for(const l of [lo,(lo+hi)/2,hi])for(const e of [-eddy,0,eddy]){
    const alpha=k/8,dx=.82-.36*(alpha-.5)*.5,dz=.36+.82*(alpha-.5)*.5,len=Math.hypot(dx,dz),ox=dx/len*l-dz/len*e,oz=dz/len*l+dx/len*e,drop=.55*(ox*ox+oz*oz),angle=Math.atan2(oz,ox),x=p.x+(c*pa.getX(i)+s*pa.getZ(i))*p.s+ox*p.s,z=p.z+(-s*pa.getX(i)+c*pa.getZ(i))*p.s+oz*p.s;
    const ga=p.y+(pa.getY(i)-drop)*sy-baseline.surface.heightAt(x,z),gb=q.y+(pb.getY(i)-drop)*sy-candidate.surface.heightAt(x,z);
    oldPen=Math.max(oldPen,-ga);newPen=Math.max(newPen,-gb);const increase=Math.max(0,-gb)-Math.max(0,-ga);if(increase>added)worst={kind,i,angle,position:[pa.getX(i),pa.getY(i),pa.getZ(i)],seatedY:pb.getY(i),wind:[w.getX(i),w.getY(i),w.getZ(i)],x,z,oldGap:ga,newGap:gb};added=Math.max(added,increase);count++;
   }
  }
 }
 results.push({id:p.id,asset:true,oldPen,newPen,added,worst,samples:count});asset.dispose();
}
writeFileSync('tools/reports/forest-curvature-wind-domain-v38.json',JSON.stringify({roots:roots.length,scope:'offline original XZ per-blade Y seating trial (brook compact footprint is explicitly NOT reused), complete original vertices/index retained; actual wind-parameter interval enclosure at every nonbasal vertex; sampled domain, continuous terrain/GPU acceptance still pending, not adopted',results,adaptedRoots:roots.filter(r=>r.q.brookAsset).length},null,2)+'\n');console.log(JSON.stringify(results));a.dispose();b.dispose();
