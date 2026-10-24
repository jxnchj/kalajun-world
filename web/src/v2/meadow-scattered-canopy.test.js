import test from 'node:test';
import assert from 'node:assert/strict';
import {scatteredCanopyField} from './meadow-scattered-canopy.js';
import {meadowFieldPixels,MEADOW_FIELD_MEAN} from './meadow-surface.js';
test('irregular canopy is periodic at the source boundary, deterministic and covered',()=>{
 const a=scatteredCanopyField(),b=scatteredCanopyField();assert.equal(a.sites,53*53);
 for(let z=-3;z<57;z+=1.17)for(let x=-2;x<57;x+=1.31){
  const v=a(x,z);assert.ok(Number.isFinite(v)&&v>=0&&v<=1);assert.equal(v,b(x,z));
  assert.ok(Math.abs(v-a(x+53,z-53))<1e-12);
 }
});
test('new canopy preserves all ecological channels, full source contrast and metre detail',t=>{
 const before=meadowFieldPixels('v24'),after=meadowFieldPixels('v38');assert.equal(after.byteLength,before.byteLength);
 let changes=0,sum=0,sumOld=0,square=0,squareOld=0,detail=0,detailOld=0,count=after.length/4;
 for(let i=0;i<after.length;i+=4){
  for(const c of [0,2,3])assert.equal(after[i+c],before[i+c]);
  changes+=+(after[i+1]!==before[i+1]);const a=after[i+1]/255,b=before[i+1]/255;sum+=a;sumOld+=b;square+=a*a;squareOld+=b*b;
  const j=(i+8)%after.length;detail+=Math.abs(after[j+1]-after[i+1]);detailOld+=Math.abs(before[j+1]-before[i+1]);
 }
 assert.ok(changes>count*.95);assert.ok(Math.abs(sum/count-MEADOW_FIELD_MEAN[1])<1e-12);
 const sd=Math.sqrt(square/count-(sum/count)**2),oldSd=Math.sqrt(squareOld/count-(sumOld/count)**2);
 assert.ok(sd/oldSd>.98&&sd/oldSd<1.02,'retain original amplitude, not flat colour');
 assert.ok(detail/detailOld>.65&&detail/detailOld<1.8,'retain physical sub-metre variation');
 t.diagnostic(JSON.stringify({bytes:after.byteLength,changes,sd,oldSd,halfMetreDifferenceRatio:detail/detailOld,otherChannels:'byte-identical'}));
});
