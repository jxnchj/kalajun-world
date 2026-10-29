import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createWorldData,decodeHeightBytes} from './world-data.js';
import {riverRootLobe,riverSectionAt} from './river-section.js';
import {createWaterGeometry} from './water.js';
function actual(){
 const root=new URL('../../public/',import.meta.url),j=n=>JSON.parse(readFileSync(new URL(n,root))),b=n=>new Uint8Array(gunzipSync(readFileSync(new URL(n,root)))),meta=j('data/scene.json'),lc={width:1,height:1,data:new Uint8Array([255,128,0,255])};
 return createWorldData({forestReach39:false,meta,objects:j('data/objects.json'),detailMeta:j('data/detail.json'),manifest:j('world-v2/manifest.json'),streamData:j('data/streams.json'),coreHeights:decodeHeightBytes(b('data/core_height.bin.gz'),meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(b('data/far_height.bin.gz'),meta.far.n,meta.height_scale),detailBytes:b('data/detail.bin.gz'),coreLandcover:lc,farLandcover:lc});
}
test('rooted bank noses are bounded, sparse and on deposition sides only',()=>{
 let active=0,empty=0;for(let d=0;d<400;d+=.25)for(const side of [-1,1]){
  const v=riverRootLobe(d,.94,1,side,1.54);assert.ok(v>=0&&v<=.24);
  if(v>.04)active++;if(v===0)empty++;
  assert.equal(riverRootLobe(d,.08,1,side,1.54),0);assert.equal(riverRootLobe(d,.94,0,side,1.54),0);
  assert.ok(Math.abs(v-riverRootLobe(d+.00001,.94,1,side,1.54))<.00001);
 }assert.ok(active>100&&empty>100);
});
test('actual forest water and banks use the same lobed edge while other channels and protected envelope stay intact',t=>{
 const w=actual();let changed=0,unaffected=0,waterVertices=0,maxLobe=0,maxOverlap=0;const reports=[];
 for(const line of w.hydrology.lines)for(const n of line.nodes){const q=n.bankShape;if(!q)continue;
  const l=q.rootLobeLeft||0,r=q.rootLobeRight||0;
  if(line.id!=='river-41711e76-99c57ca2'){assert.equal(l+r,0);unaffected++;continue;}
  assert.ok(q.left>n.width*.1&&q.right>n.width*.1);assert.ok(l===0||r===0,'opposite cut side must not acquire a paired lobe');
  if(l+r>.005)changed++;maxLobe=Math.max(maxLobe,l,r);
 }
 const view=w.hydrology.viewpoints.find(v=>v.id==='river-forest');
 for(const s of w.hydrology.nearSegments(view.x,view.z,100)){
  const g=createWaterGeometry([s],{detail:true}),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const bed=w.surface.heightAt(p.getX(i),p.getZ(i));maxOverlap=Math.max(maxOverlap,bed-p.getY(i));assert.ok(bed-p.getY(i)<.015);waterVertices++;}g.dispose();
  for(const at of [0,.5,1]){const q=riverSectionAt(s,at);for(const side of [-1,1]){
   const x=q.x-q.fz*side*(q.outer+.01),z=q.z+q.fx*side*(q.outer+.01);
   if(w.hydrology.sampleAt(x,z).id!==null)continue;
   assert.equal(w.surface.heightAt(x,z),w.surface.uncarvedHeightAt(x,z));
  }}
 }
 assert.ok(changed>10&&unaffected>100&&waterVertices>100&&maxLobe>.15);
 t.diagnostic(JSON.stringify({changedNodes:changed,unaffectedNodes:unaffected,maxLobe,waterVertices,maxOverlap}));
});
