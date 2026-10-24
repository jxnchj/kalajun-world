import test from 'node:test';
import assert from 'node:assert/strict';
import {meadowDetailCoordinates,meadowDetailGradient} from './terrain-grass-projection.js';
import {sampleMeadowField} from './meadow-surface.js';
test('bounded ecological displacement preserves detail scale and breaks the two-metre source lattice',()=>{
 let different=0;
 for(let i=0;i<500;i++){
  const x=i*1.37-320,z=i*.43-270,field=sampleMeadowField(x,z),a=meadowDetailCoordinates(x,z,field),b=meadowDetailCoordinates(x+2,z,sampleMeadowField(x+2,z));
  assert.ok(Math.abs(a[0]-x/2)<=.301&&Math.abs(a[1]-z/2)<=.301);
  if(Math.abs((b[0]-a[0])-1)+Math.abs(b[1]-a[1])>1e-4)different++;
 }
 assert.ok(different>490);
});
test('warped height normal obeys the chain rule under rotated and sheared coordinates',()=>{
 const j=[1.12,.16,-.07,.95],g=[.37,-.23],got=meadowDetailGradient(g,j),h=1e-5;
 const height=(x,z)=>g[0]*(j[0]*x+j[1]*z)+g[1]*(j[2]*x+j[3]*z);
 assert.ok(Math.abs(got[0]-(height(h,0)-height(-h,0))/(2*h))<1e-9);
 assert.ok(Math.abs(got[1]-(height(0,h)-height(0,-h))/(2*h))<1e-9);
 assert.deepEqual(meadowDetailGradient(g,[1,0,0,1]),g);
});
