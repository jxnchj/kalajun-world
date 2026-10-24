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
// Full conservative herb wind envelope from the production triangle slabs,
// including maximum gust/recoil/eddy and downward bend. This is a numerical
// terrain intersection check, not a proof of continuous-time GPU motion.
const envelope=a.shoreGrassEnvelope;let samples=0,maxNewPenetration=0;const risks=[];
for(const {p,q}of roots){
 if(Math.hypot(p.x-center.x,p.z-center.z)>24)continue;
 const water=baseline.hydrology.sampleAt(p.x,p.z);if(water.shoreDistance>envelope.radius*p.s+2||water.id==null)continue;
 const c=Math.cos(p.rot),s=Math.sin(p.rot),sy=p.sy??p.s;let risk=0,localSamples=0;
 for(const slab of envelope.slabs){
  if(slab.lo<.12)continue; // rooted basal zone is deliberately embedded by 3.5cm
  const low=(slab.lo-.55*slab.sway*slab.sway)*sy;
  const polygon=slab.polygon,points=[];
  for(let k=0;k<polygon.length;k++){const v=polygon[k],w=polygon[(k+1)%polygon.length],steps=Math.max(1,Math.ceil(Math.hypot(w[0]-v[0],w[1]-v[1])/.08));for(let j=0;j<=steps;j++)points.push([v[0]+(w[0]-v[0])*j/steps,v[1]+(w[1]-v[1])*j/steps]);}
  for(const [lx,lz]of points)for(let k=0;k<8;k++){
   const angle=k*Math.PI/4,pad=slab.sway*p.s+.015,x=p.x+(c*lx+s*lz)*p.s+Math.cos(angle)*pad,z=p.z+(-s*lx+c*lz)*p.s+Math.sin(angle)*pad;
   const oldGap=p.y+low-baseline.surface.heightAt(x,z),newGap=q.y+low-candidate.surface.heightAt(x,z);samples++;localSamples++;
   const newPen=Math.max(0,-newGap)-Math.max(0,-oldGap);risk=Math.max(risk,newPen);maxNewPenetration=Math.max(maxNewPenetration,newPen);
  }
 }
 if(risk>.005)risks.push({id:p.id,x:p.x,z:p.z,deltaY:q.y-p.y,additionalEnvelopePenetration: risk,samples:localSamples});
}
const report={scope:'48m actual original grass roots; unchanged identities and all fields except Y; conservative production full-wind slabs',roots:roots.length,changedY:changed,samples,maxAdditionalEnvelopePenetration:maxNewPenetration,risks,continuousWindBrowserAccepted:false};
writeFileSync('tools/reports/forest-curvature-contact-v38.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({roots:roots.length,changedY:changed.length,samples,maxNewPenetration,risks:risks.length}));a.dispose();b.dispose();
