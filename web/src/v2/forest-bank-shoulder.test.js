import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FOREST_BANK_LINE,forestBankRootCover,forestRootedShoulderHeight} from './forest-bank-shoulder.js';
const report=JSON.parse(readFileSync(new URL('../../../tools/reports/forest-bank-sections-v38.json',import.meta.url)));
const input=(row,p)=>({lineId:FOREST_BANK_LINE,section:row.section,side:row.side,distance:(row.side<0?row.section.left:row.section.right)+p.distance,height:p.y,rawHeight:p.y+p.rawClearance-p.clearance,rootCover:forestBankRootCover(p.cover,p.field),offset:row.offset,protectedGround:false});
test('actual fourteen measured banks retain water edges, low ground and eroding faces, with patch-limited raised root mats',()=>{
 const snapshot=JSON.stringify(report);let raised=0,unchanged=0,maxRise=0;
 for(const row of report.rows)for(const p of row.samples){const args=input(row,p),out=forestRootedShoulderHeight(args),rise=out-p.y;
  assert.ok(rise>=0&&rise<=.090000001);maxRise=Math.max(maxRise,rise);
  if(p.distance===0||p.rawClearance<=0||(row.side<0?row.section.barLeft:row.section.barRight)<=.6)assert.equal(out,p.y);
  if(rise>1e-6)raised++;else unchanged++;
  assert.equal(forestRootedShoulderHeight({...args,protectedGround:true}),p.y);
  assert.equal(forestRootedShoulderHeight({...args,lineId:'other-reach'}),p.y);
  assert.equal(forestRootedShoulderHeight({...args,offset:60}),p.y);
 }
 assert.ok(raised>5&&unchanged>raised,'not a uniform embankment');assert.ok(maxRise>.03&&maxRise<.09);assert.equal(JSON.stringify(report),snapshot);
});
test('contact rise remains finite, bounded and rejoins exact untouched exterior',()=>{
 const row=report.rows.find(r=>r.offset===0&&r.side===1),p=row.samples.find(p=>p.distance===.5),args=input(row,p),half=row.section.right;
 const delta=d=>forestRootedShoulderHeight({...args,distance:half+d})-args.height;
 assert.equal(delta(0),0);assert.ok(delta(.001)>.00005&&delta(.001)<.001);
 assert.equal(delta(row.section.outer-half),0);assert.equal(delta(row.section.outer-half+1),0);
 for(const rootCover of [0,.2,.5,1])for(let d=0;d<2;d+=.01){const rise=forestRootedShoulderHeight({...args,rootCover,distance:half+d})-args.height;assert.ok(rise>=0&&rise<=.090000001);}
 assert.equal(forestRootedShoulderHeight({...args,rawHeight:row.section.level-.001}),args.height);
 assert.equal(forestRootedShoulderHeight({...args,rawHeight:row.section.level}),args.height);
 assert.throws(()=>forestRootedShoulderHeight({...args,rawHeight:NaN}),/physical inputs/);
});
