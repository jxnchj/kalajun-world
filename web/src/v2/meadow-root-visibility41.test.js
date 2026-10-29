import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {meadowGeometry} from './ecology.js';import {meadowWindBox41,meadowRootBoxes41,meadowTileVisibility41,visibleMeadowRoots41} from './meadow-root-visibility41.js';
test('whole-leaf bound includes source vertices at extreme wind, root scales and directions',()=>{
 for(const near of[true,false]){const g=meadowGeometry(near),box=meadowWindBox41(g),p=g.attributes.position,w=g.attributes.aPlantWind;
  for(let i=0;i<p.count;i++)for(const r of[0,1])for(const prev of[0,1])for(const eddy of[-.5,.5])for(const local of[-.5,.5]){
   const current=r*(1-w.getX(i)*.48)+prev*w.getX(i)*.48;
   const lean=(current+(current-prev)*.32)*.23*1.25*w.getX(i)**2;
   const head=((prev-current)*.10+local*.012*Math.sqrt(current))*w.getY(i),side=eddy*.045*w.getX(i)**2*1.25;
   for(const a of[0,.4,1.7,3.2,5.5]){const dx=Math.cos(a)*(lean+head)-Math.sin(a)*side,dz=Math.sin(a)*(lean+head)+Math.cos(a)*side;
    assert.ok(box.containsPoint(new T.Vector3(p.getX(i)+dx,p.getY(i)-.55*(dx*dx+dz*dz),p.getZ(i)+dz)));
   }
  }g.dispose();
 }
});
test('tile-first selection matches independent full-root box tests including reflection-view union',()=>{
 const g=meadowGeometry(false),roots=Array.from({length:140},(_,i)=>({x:(i%14)*2-14,y:(i%5)*.4,z:Math.floor(i/14)*3-20,s:.7+(i%4)*.3,rot:i*.37}));
 const boxes=meadowRootBoxes41(g,roots,p=>new T.Matrix4().compose(new T.Vector3(p.x,p.y,p.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),p.rot),new T.Vector3(p.s,p.s*1.2,p.s))),tile=new T.Box3();boxes.forEach(b=>tile.union(b));
 const view=(x,y,z,tx)=>{const c=new T.PerspectiveCamera(52,1.6,.25,1000);c.position.set(x,y,z);c.lookAt(tx,1,0);c.updateMatrixWorld();return new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse));};
 for(const frusta of[[view(0,20,80,0)],[view(0,2,12,25)],[view(0,2,12,-25),view(0,-2,12,25)],[view(100,2,0,200)]]){
  const expected=visibleMeadowRoots41(boxes,frusta),actual=meadowTileVisibility41(tile,boxes,frusta);
  assert.equal(actual.count,expected.length);assert.deepEqual(actual.indices??boxes.map((_,i)=>i),expected);
 }
 g.dispose();
});
