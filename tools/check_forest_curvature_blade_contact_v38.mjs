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
 if(!risks.risks.some(r=>r.id===p.id))continue;
 const asset=seatOriginalBladeY(candidate,q,[a.grassGeometries[0],a.grassGeometries[1],a.baseGrassGeometry],{physicalOnly:true});
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
   for(let k=0;k<8;k++){
    const angle=k*Math.PI/4,x=p.x+(c*pa.getX(i)+s*pa.getZ(i))*p.s+Math.cos(angle)*sway*p.s,z=p.z+(-s*pa.getX(i)+c*pa.getZ(i))*p.s+Math.sin(angle)*sway*p.s;
    const ga=p.y+(pa.getY(i)-.55*sway*sway)*sy-baseline.surface.heightAt(x,z),gb=q.y+(pb.getY(i)-.55*sway*sway)*sy-candidate.surface.heightAt(x,z);
    oldPen=Math.max(oldPen,-ga);newPen=Math.max(newPen,-gb);const increase=Math.max(0,-gb)-Math.max(0,-ga);if(increase>added)worst={kind,i,angle,position:[pa.getX(i),pa.getY(i),pa.getZ(i)],seatedY:pb.getY(i),wind:[w.getX(i),w.getY(i),w.getZ(i)],x,z,oldGap:ga,newGap:gb};added=Math.max(added,increase);count++;
   }
  }
 }
 results.push({id:p.id,asset:true,oldPen,newPen,added,worst,samples:count});asset.dispose();
}
writeFileSync('tools/reports/forest-curvature-blade-contact-v38.json',JSON.stringify({roots:roots.length,scope:'offline original XZ per-blade Y seating trial (brook compact footprint is explicitly NOT reused), complete original vertices/index retained; conservative wind perimeter at every nonbasal vertex, not adopted',results},null,2)+'\n');console.log(JSON.stringify(results));a.dispose();b.dispose();
